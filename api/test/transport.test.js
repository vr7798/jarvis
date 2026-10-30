import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CodexTransport } from '../src/services/codexTransport.js';

function fakeServer(handler = () => undefined) {
  const calls = [];
  const children = [];
  const spawnProcess = (command, args, options) => {
    const child = new EventEmitter();
    children.push(child);
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.killed = false;
    child.packet = packet => child.stdout.write(`${JSON.stringify(packet)}\n`);
    child.exit = () => { if (!child.killed) { child.killed = true; child.emit('exit', 0, null); } };
    child.kill = () => { child.exit(); return true; };
    child.stdin = new Writable({
      write(chunk, encoding, callback) {
        const packet = JSON.parse(chunk.toString());
        calls.push(packet);
        queueMicrotask(() => {
          const result = handler(packet, child);
          if (result !== false && packet.id !== undefined && packet.method) child.packet({ id: packet.id, result: result ?? {} });
        });
        callback();
      },
    });
    child.stdin.on('finish', () => queueMicrotask(child.exit));
    child.launch = { command, args, options };
    return child;
  };
  return { spawnProcess, calls, children };
}

async function fixture(t, handler, extra = {}) {
  const home = await mkdtemp(path.join(os.tmpdir(), 'jarvis-transport-'));
  const fake = fakeServer(handler);
  const transport = new CodexTransport({ cwd: home, home: path.join(home, 'isolated'), apiKey: 'test-api-key', spawnProcess: fake.spawnProcess, requestTimeoutMs: 1000, ...extra });
  t.after(async () => { await transport.close(); await rm(home, { recursive: true, force: true }); });
  return { transport, ...fake };
}

test('initialization is ordered, authenticated, deduplicated and uses a shell-free child', async t => {
  const { transport, calls, children } = await fixture(t);
  const saved = process.env.SESSION_SECRET;
  const savedKey = process.env.OPENAI_API_KEY;
  process.env.SESSION_SECRET = 'must-not-inherit';
  process.env.OPENAI_API_KEY = 'must-not-inherit-either';
  try { await Promise.all([transport.start(), transport.start(), transport.start()]); }
  finally {
    if (saved === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = saved;
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = savedKey;
  }
  assert.equal(transport.ready, true);
  assert.equal(children.length, 1);
  assert.deepEqual(calls.map(c => c.method), ['initialize', 'initialized', 'account/login/start']);
  assert.deepEqual(calls[2].params, { type: 'apiKey', apiKey: 'test-api-key' });
  assert.equal(children[0].launch.options.shell, false);
  assert.deepEqual(children[0].launch.args, ['-c', 'features.fast_mode=true', 'app-server']);
  assert.equal(children[0].launch.options.env.SESSION_SECRET, undefined);
  assert.equal(children[0].launch.options.env.OPENAI_API_KEY, undefined);
  assert.equal(children[0].launch.options.env.CODEX_HOME, transport.options.home);
  await transport.start();
  assert.equal(children.length, 1);
});

test('notifications, server requests, typed ids and correlated replies survive non-JSON diagnostics', async t => {
  const { transport, calls, children } = await fixture(t, packet => {
    if (packet.method === 'thread/start') return { thread: { id: 'thread-1' } };
  });
  await transport.start();
  const result = await transport.request('thread/start', {});
  assert.equal(result.thread.id, 'thread-1');
  const notification = once(transport, 'notification');
  children[0].stdout.write('CLI diagnostic line\n');
  children[0].packet({ method: 'item/agentMessage/delta', params: { delta: 'Olá' } });
  assert.deepEqual((await notification)[0], { method: 'item/agentMessage/delta', params: { delta: 'Olá' } });
  const request = once(transport, 'serverRequest');
  children[0].packet({ id: 'approval-1', method: 'item/commandExecution/requestApproval', params: { threadId: 'thread-1' } });
  assert.equal((await request)[0].id, 'approval-1');
  transport.response('approval-1', { decision: 'decline' });
  assert.deepEqual(calls.at(-1), { id: 'approval-1', result: { decision: 'decline' } });
});

test('unexpected exit rejects outstanding requests and permits a new process', async t => {
  const { transport, children } = await fixture(t, packet => packet.method === 'wait/forever' ? false : undefined);
  const offline = [];
  transport.on('offline', error => offline.push(error));
  await transport.start();
  const pending = transport.request('wait/forever', {});
  const rejected = assert.rejects(pending, /encerrado/);
  children[0].exit();
  await rejected;
  assert.equal(transport.ready, false);
  assert.equal(offline.length, 1);
  await transport.start();
  assert.equal(transport.ready, true);
  assert.equal(children.length, 2);
});

test('requests time out, late replies are ignored and protocol errors redact the API key', async t => {
  const { transport, children } = await fixture(t, packet => {
    if (packet.method === 'wait/forever') return false;
    if (packet.method === 'fail') return false;
  }, { requestTimeoutMs: 25 });
  await transport.start();
  await assert.rejects(transport.request('wait/forever'), /Tempo limite/);
  assert.equal(transport.pending.size, 0);
  children[0].packet({ id: 3, result: {} });
  const failed = transport.request('fail');
  const rejected = assert.rejects(failed, error => error.message.includes('[redigido]') && !error.message.includes('test-api-key'));
  children[0].packet({ id: transport.sequence, error: { message: 'Invalid credential test-api-key' } });
  await rejected;
});

test('spawn failure rejects startup without an unhandled error and is retryable', async t => {
  const { transport } = await fixture(t);
  let attempts = 0;
  const goodSpawn = transport.spawnProcess;
  transport.spawnProcess = (...args) => {
    attempts++;
    if (attempts === 1) throw new Error('binary missing');
    return goodSpawn(...args);
  };
  await assert.rejects(transport.start(), /binary missing/);
  assert.equal(transport.ready, false);
  await transport.start();
  assert.equal(transport.ready, true);
});

test('intentional close rejects waiting callers without broadcasting an unexpected disconnect', async t => {
  const { transport } = await fixture(t, packet => packet.method === 'wait/forever' ? false : undefined);
  await transport.start();
  let offline = 0;
  transport.on('offline', () => offline++);
  const pending = transport.request('wait/forever');
  const rejected = assert.rejects(pending, /encerrada/);
  await transport.close();
  await rejected;
  assert.equal(transport.ready, false);
  assert.equal(offline, 0);
  assert.equal(transport.pending.size, 0);
});
