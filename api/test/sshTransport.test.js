import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { once } from 'node:events';
import ssh2 from 'ssh2';
import net from 'node:net';
import { mkdtemp, mkdir, writeFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { SshTransport, probeHost, remoteCommand } from '../src/services/sshTransport.js';
const { Server, utils } = ssh2;

const key = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs1', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } }).privateKey;
const fingerprint = 'SHA256:' + createHash('sha256').update(utils.parseKey(key).getPublicSSH()).digest('base64').replace(/=+$/, '');

async function fixture(t, { account = { type: 'chatgpt' }, requiresOpenaiAuth = true } = {}) {
  const connections = new Set();
  const auth = [];
  const commands = [];
  const calls = [];
  const streams = [];
  const server = new Server({ hostKeys: [key] }, client => {
    connections.add(client);
    client.on('close', () => connections.delete(client));
    client.on('error', () => {});
    client.on('authentication', ctx => {
      auth.push({ method: ctx.method, username: ctx.username });
      if (ctx.method === 'password' && ctx.username === 'tester' && ctx.password === 'fixture-password') ctx.accept();
      else ctx.reject(['password']);
    });
    client.on('ready', () => client.on('session', accept => accept().on('exec', (acceptExec, reject, info) => {
      commands.push(info.command);
      const stream = acceptExec();
      streams.push(stream);
      let buffer = '';
      stream.on('data', chunk => {
        buffer += chunk.toString();
        let newline;
        while ((newline = buffer.indexOf('\n')) !== -1) {
          const packet = JSON.parse(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
          calls.push(packet);
          if (packet.method === 'wait') continue;
          if (packet.method && packet.id !== undefined) stream.write(JSON.stringify({ id: packet.id, result: packet.method === 'account/read' ? { account, requiresOpenaiAuth } : {} }) + '\n');
        }
      });
      stream.on('end', () => { stream.exit(0); stream.end(); });
      stream.on('error', () => {});
    })));
  });
  server.on('error', () => {});
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const transport = new SshTransport({ requestTimeoutMs: 1000, connectionTimeoutMs: 2000 });
  const options = { host: '127.0.0.1', port: server.address().port, username: 'tester', password: 'fixture-password', fingerprint, workspace: '/var/www/project' };
  t.after(async () => {
    await transport.close();
    for (const client of connections) client.end();
    await new Promise(resolve => server.close(resolve));
  });
  return { transport, options, auth, calls, commands, streams, connections };
}

test('SSH host discovery returns SHA256 fingerprint before any user authentication', async t => {
  const { options, auth } = await fixture(t);
  const result = await probeHost(options);
  assert.equal(result.fingerprint, fingerprint);
  assert.deepEqual(auth, []);
});

test('SSH rejects a changed host key before sending credentials', async t => {
  const { transport, options, auth } = await fixture(t);
  transport.configure({ ...options, fingerprint: 'SHA256:' + 'A'.repeat(43) });
  await assert.rejects(transport.start(), /impressão digital/);
  assert.deepEqual(auth, []);
  assert.equal(transport.ready, false);
  assert.equal(transport.credentials, null);
  await assert.rejects(transport.start(), /Conecte sua VPS/);
});

test('SSH uses remote authenticated Codex without API login and streams protocol requests', async t => {
  const { transport, options, calls, commands, streams } = await fixture(t);
  const workspace = "/var/www/project's $(whoami)";
  transport.configure({ ...options, workspace });
  await Promise.all([transport.start(), transport.start()]);
  assert.equal(transport.ready, true);
  assert.equal(transport.accountType, 'chatgpt');
  assert.equal(transport.credentials, null);
  assert.equal(transport.endpoint.workspace, workspace);
  assert.equal('password' in transport.endpoint, false);
  assert.deepEqual(calls.map(x => x.method), ['initialize', 'initialized', 'account/read']);
  assert.deepEqual(calls[2].params, { refreshToken: false });
  assert.deepEqual(commands, [remoteCommand(workspace, 'codex')]);
  assert.match(commands[0], /^exec bash -lc /);
  assert.equal(commands[0].includes('OPENAI_API_KEY'), false);
  assert.ok(commands[0].includes('features.fast_mode=true'));
  const notification = once(transport, 'notification');
  streams[0].write(JSON.stringify({ method: 'item/agentMessage/delta', params: { delta: 'Resposta remota' } }) + '\n');
  assert.deepEqual((await notification)[0], { method: 'item/agentMessage/delta', params: { delta: 'Resposta remota' } });
  const request = once(transport, 'serverRequest');
  streams[0].write(JSON.stringify({ id: 'approval-remote', method: 'item/commandExecution/requestApproval', params: { threadId: 'thread-1' } }) + '\n');
  assert.equal((await request)[0].id, 'approval-remote');
  transport.response('approval-remote', { decision: 'decline' });
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.deepEqual(calls.at(-1), { id: 'approval-remote', result: { decision: 'decline' } });
  assert.throws(() => transport.configure(options), /Desconecte/);
});

test('SSH requires the remote user to authenticate Codex when account/read has no account', async t => {
  const { transport, options, calls } = await fixture(t, { account: null });
  transport.configure(options);
  await assert.rejects(transport.start(), /Faça codex login/);
  assert.equal(transport.ready, false);
  assert.equal(calls.some(x => x.method === 'account/login/start'), false);
});

test('SSH unexpected closure rejects pending RPC and requires password entry again', async t => {
  const { transport, options, connections } = await fixture(t);
  transport.configure(options);
  await transport.start();
  const offline = once(transport, 'offline');
  const wait = transport.request('wait');
  const rejected = assert.rejects(wait, /encerr/);
  for (const client of connections) client.end();
  await offline;
  await rejected;
  assert.equal(transport.ready, false);
  await assert.rejects(transport.start(), /Conecte sua VPS/);
});

test('SSH cancellation during handshake closes TCP and rejects startup promptly', async t => {
  const sockets = new Set();
  const server = net.createServer(socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const transport = new SshTransport({ connectionTimeoutMs: 10000 });
  t.after(async () => {
    await transport.close();
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  });
  transport.configure({ host: '127.0.0.1', port: server.address().port, username: 'tester', password: 'fixture-password', fingerprint, workspace: '/tmp' });
  const start = transport.start();
  const rejected = assert.rejects(start, /encerrada|cancelada/);
  await new Promise(resolve => setTimeout(resolve, 40));
  await transport.close();
  await rejected;
  assert.equal(transport.ready, false);
  assert.equal(transport.credentials, null);
});

test('SSH validates command paths and treats workspace shell syntax as quoted data', () => {
  const transport = new SshTransport();
  const options = { host: '127.0.0.1', username: 'tester', password: 'secret', fingerprint, workspace: '/tmp' };
  assert.throws(() => transport.configure({ ...options, bin: 'codex; touch /tmp/not-allowed' }), /Codex inválido/);
  assert.throws(() => transport.configure({ ...options, workspace: '/tmp\nwhoami' }), /caminho absoluto/);
  assert.throws(() => transport.configure({ ...options, fingerprint: '' }), /impressão digital/);
  assert.throws(() => transport.configure({ ...options, host: 'host;whoami' }), /Endereço SSH/);
});

test('remote shell command enters a directory with shell syntax without executing its content', { skip: process.platform === 'win32' }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jarvis-ssh-quote-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const workspace = path.join(directory, "workspace'$(touch owned)");
  await mkdir(workspace);
  const bin = path.join(directory, 'codex');
  await writeFile(bin, '#!/bin/sh\nprintf "%s\\n" "$PWD"\n', { mode: 0o700 });
  const result = spawnSync('bash', ['-c', remoteCommand(workspace, bin)], { encoding: 'utf8', cwd: directory });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), workspace);
  await assert.rejects(access(path.join(directory, 'owned')));
});
