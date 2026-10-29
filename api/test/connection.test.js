import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/services/password.js';

const loginPassword = 'test-login-password-123';
const loginHash = await hashPassword(loginPassword);
const sshPassword = 'private-ssh-password-DO-NOT-PERSIST';
const fingerprint = `SHA256:${'a'.repeat(43)}`;
const target = { host: 'vps.example.test', port: 22, username: 'owner', password: sshPassword, fingerprint, workspace: '/srv/project' };

class FakeSshTransport extends EventEmitter {
  ready = false;
  endpoint = null;
  calls = [];
  replies = [];
  rejected = [];
  closes = 0;
  threads = 0;
  turns = 0;
  failStart = false;
  configure(value) {
    const { host, port, username, fingerprint, workspace } = value;
    this.endpoint = { host, port, username, fingerprint, workspace };
  }
  async start() {
    if (this.failStart) throw new Error(`Authentication failed: ${sshPassword}`);
    this.ready = true;
  }
  async request(method, params) {
    this.calls.push({ method, params });
    if (method === 'thread/start') return { thread: { id: `ssh-thread-${++this.threads}` } };
    if (method === 'thread/resume') return { thread: { id: params.threadId } };
    if (method === 'turn/start') return { turn: { id: `ssh-turn-${++this.turns}` } };
    return {};
  }
  response(id, result) { this.replies.push({ id, result }); }
  rejectRequest(id, message) { this.rejected.push({ id, message }); }
  async close() { this.closes++; this.ready = false; this.endpoint = null; }
}

async function eventually(predicate, timeout = 2500) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await predicate();
    if (value) return value;
    if (Date.now() > deadline) throw new Error('Timed out waiting for SSH application state.');
    await delay(10);
  }
}

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jarvis-connection-'));
  const transport = new FakeSshTransport();
  const probes = [];
  const config = {
    production: false, host: '127.0.0.1', port: 3100, origin: 'http://localhost:5173',
    username: 'owner', passwordHash: loginHash, sessionSecret: 's'.repeat(64), mode: 'ssh',
    workspace: path.join(root, 'workspace'), dataDir: path.join(root, 'data'), codexHome: path.join(root, 'codex'),
    bin: 'codex', apiKey: '', sandbox: 'workspace-write',
  };
  const runtime = createApp(config, { transport, probe: async value => { probes.push(value); return { fingerprint }; } });
  const server = runtime.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    try { await runtime.close(); }
    finally {
      const closed = new Promise(resolve => server.close(resolve));
      server.closeAllConnections();
      await closed;
      await rm(root, { recursive: true, force: true });
    }
  });
  const request = async (url, { method = 'GET', body, cookie, csrf, origin = config.origin } = {}) => {
    const response = await fetch(base + url, {
      method,
      headers: { ...(method !== 'GET' ? { Origin: origin } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
  const post = (url, auth, body = {}) => request(url, { method: 'POST', ...auth, body });
  const login = async cookie => {
    const result = await post('/api/auth/login', { cookie }, { username: 'owner', password: loginPassword });
    assert.equal(result.status, 200);
    return { cookie: result.headers.get('set-cookie').split(';')[0], csrf: result.body.csrfToken };
  };
  const create = async auth => {
    const result = await post('/api/conversations', auth);
    assert.equal(result.status, 201);
    return result.body.conversation;
  };
  const connect = async (auth, overrides = {}) => {
    const result = await post('/api/connection/connect', auth, { ...target, ...overrides });
    assert.equal(result.status, 200);
    return result;
  };
  const send = async (auth, c) => {
    const result = await post(`/api/conversations/${c.id}/messages`, auth, { text: 'Leia o projeto remoto.' });
    assert.equal(result.status, 202);
    const live = runtime.store.get(c.id);
    await eventually(() => live.activeTurnId);
    return live;
  };
  const complete = c => transport.emit('notification', { method: 'turn/completed', params: { threadId: c.threadId, turn: { id: c.activeTurnId, status: 'completed' } } });
  return { ...runtime, root, config, transport, probes, request, post, login, create, connect, send, complete };
}

test('SSH probing and connection require a valid login, origin and CSRF; disconnected chat cannot run', async t => {
  const f = await fixture(t);
  assert.equal((await f.post('/api/connection/probe', {}, target)).status, 401);
  assert.equal((await f.post('/api/connection/connect', {}, target)).status, 401);
  const auth = await f.login();
  assert.equal((await f.post('/api/connection/probe', { cookie: auth.cookie }, target)).status, 403);
  assert.equal((await f.request('/api/connection/connect', { method: 'POST', ...auth, origin: 'https://evil.test', body: target })).status, 403);
  const c = await f.create(auth);
  assert.equal((await f.post(`/api/conversations/${c.id}/messages`, auth, { text: 'Run' })).status, 409);
  assert.equal(f.transport.calls.length, 0);
  const probe = await f.post('/api/connection/probe', auth, { host: 'VPS.EXAMPLE.TEST', port: 22, password: sshPassword });
  assert.equal(probe.status, 200);
  assert.equal(probe.body.fingerprint, fingerprint);
  assert.deepEqual(f.probes, [{ host: 'vps.example.test', port: 22 }]);
  assert.equal((await f.post('/api/connection/connect', auth, { ...target, fingerprint: '' })).status, 400);
  assert.equal((await f.post('/api/connection/connect', auth, { ...target, workspace: 'relative/path' })).status, 400);
  const connected = await f.connect(auth);
  assert.equal(connected.body.status.connected, true);
  assert.equal(connected.body.status.workspace, '/srv/project');
});

test('SSH connection belongs to one login session; another session cannot send, approve or disconnect', async t => {
  const f = await fixture(t);
  const owner = await f.login();
  const other = await f.login();
  await f.connect(owner);
  const otherStatus = await f.request('/api/status', other);
  assert.equal(otherStatus.body.connected, false);
  assert.equal(otherStatus.body.connection, null);
  assert.equal(otherStatus.body.workspace, null);
  assert.equal(otherStatus.body.ownedByAnotherSession, true);
  assert.ok(!JSON.stringify(otherStatus.body).includes(target.host));
  const c = await f.create(owner);
  assert.equal((await f.post(`/api/conversations/${c.id}/messages`, other, { text: 'foreign' })).status, 409);
  const live = await f.send(owner, c);
  f.transport.emit('serverRequest', { id: 34, method: 'item/commandExecution/requestApproval', params: { threadId: live.threadId, turnId: live.activeTurnId, itemId: 'command-34', command: 'pwd', cwd: '/srv/project' } });
  const [approval] = f.chat.pending(live);
  assert.ok(approval);
  assert.equal((await f.post(`/api/approvals/${approval.id}`, other, { decision: 'accept' })).status, 409);
  assert.equal(f.transport.replies.length, 0);
  assert.equal((await f.post('/api/connection/disconnect', other)).status, 409);
  assert.equal((await f.post('/api/connection/disconnect', owner)).status, 409);
  assert.equal(f.transport.ready, true);
  assert.equal((await f.post(`/api/approvals/${approval.id}`, owner, { decision: 'decline' })).status, 200);
  assert.deepEqual(f.transport.replies, [{ id: 34, result: { decision: 'decline' } }]);
  f.complete(live);
  assert.equal((await f.post('/api/connection/disconnect', owner)).status, 200);
  assert.equal(f.transport.ready, false);
});

test('logout and login rotation close the owned SSH channel and clear active tasks and approvals', async t => {
  const f = await fixture(t);
  const auth = await f.login();
  await f.connect(auth);
  const c = await f.create(auth);
  const live = await f.send(auth, c);
  f.transport.emit('serverRequest', { id: 7, method: 'item/fileChange/requestApproval', params: { threadId: live.threadId, turnId: live.activeTurnId, itemId: 'file-7', reason: 'Edit file' } });
  assert.equal(f.chat.approvals.size, 1);
  assert.equal((await f.post('/api/auth/logout', auth)).status, 200);
  assert.equal(f.connection.owner, null);
  assert.equal(f.transport.ready, false);
  assert.equal(live.busy, false);
  assert.equal(f.chat.approvals.size, 0);
  assert.equal((await f.request('/api/auth/me', auth)).status, 401);
  const again = await f.login();
  await f.connect(again);
  const rotated = await f.login(again.cookie);
  assert.notEqual(rotated.cookie, again.cookie);
  assert.equal(f.connection.owner, null);
  assert.equal(f.transport.ready, false);
  assert.equal((await f.request('/api/auth/me', again)).status, 401);
});

test('a conversation stays bound to the SSH host, user, port, host key and remote workspace', async t => {
  const f = await fixture(t);
  const auth = await f.login();
  await f.connect(auth);
  const c = await f.create(auth);
  const live = await f.send(auth, c);
  f.complete(live);
  assert.equal((await f.post('/api/connection/disconnect', auth)).status, 200);
  // Same destination can resume its own persisted thread.
  await f.connect(auth);
  await f.send(auth, c);
  assert.ok(f.transport.calls.some(call => call.method === 'thread/resume' && call.params.threadId === live.threadId));
  f.complete(live);
  assert.equal((await f.post('/api/connection/disconnect', auth)).status, 200);
  for (const override of [{ host: 'another.example.test' }, { username: 'another' }, { port: 2222 }, { fingerprint: `SHA256:${'b'.repeat(43)}` }, { workspace: '/srv/another' }]) {
    // Exercise all context components directly, without HTTP rate-limit noise.
    await f.connection.connect('context-owner', Date.now() + 60000, { ...target, ...override });
    const before = f.transport.calls.length;
    assert.throws(() => f.chat.send(live, 'Do not reuse foreign thread'), err => err.status === 409);
    assert.equal(f.transport.calls.length, before);
    await f.connection.disconnect('context-owner');
  }
});

test('expiry releases SSH and password never reaches status, stored history or error response', async t => {
  const f = await fixture(t);
  const auth = await f.login();
  await f.connection.connect('expiring-owner', Date.now() + 100, target);
  const c = f.store.create();
  f.chat.send(c, 'Check files');
  await eventually(() => c.activeTurnId);
  await eventually(() => f.connection.owner === null && !f.transport.ready);
  assert.equal(c.busy, false);
  f.store.flush();
  const persisted = await readFile(path.join(f.config.dataDir, 'store.json'), 'utf8');
  assert.ok(!persisted.includes(sshPassword));
  assert.ok(!JSON.stringify(f.connection.status('expiring-owner')).includes(sshPassword));
  f.transport.failStart = true;
  const error = await f.post('/api/connection/connect', auth, target);
  assert.equal(error.status, 502);
  assert.ok(!JSON.stringify(error.body).includes(sshPassword));
  assert.equal(f.connection.owner, null);
});
