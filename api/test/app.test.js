import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/services/password.js';
import { LUCK_INSTRUCTIONS } from '../src/services/chatService.js';

const password = 'a-long-test-password-123';
const passwordHash = await hashPassword(password);
const roots = new Map();

class FakeTransport extends EventEmitter {
  ready = false;
  calls = [];
  replies = [];
  rejected = [];
  turn = 0;
  thread = 0;
  async start() { this.ready = true; }
  async request(method, params) {
    this.calls.push({ method, params });
    if (method === 'thread/start') return { thread: { id: `thread-${++this.thread}` } };
    if (method === 'thread/resume') return { thread: { id: params.threadId } };
    if (method === 'turn/start') return { turn: { id: `turn-${++this.turn}` } };
    return {};
  }
  response(id, result) { this.replies.push({ id, result }); }
  rejectRequest(id, message) { this.rejected.push({ id, message }); }
  async close() { this.ready = false; }
}

async function setup(t, { mode = 'mock', transport, directory, sandbox = 'workspace-write', allowFullAccess = false } = {}) {
  const root = directory || await mkdtemp(path.join(os.tmpdir(), 'jarvis-app-'));
  roots.set(root, (roots.get(root) || 0) + 1);
  const config = {
    production: false, host: '127.0.0.1', port: 3100, origin: 'http://localhost:5173',
    username: 'owner', passwordHash, sessionSecret: 's'.repeat(64), mode,
    workspace: path.join(root, 'workspace'), dataDir: path.join(root, 'data'), codexHome: path.join(root, 'codex'),
    bin: 'codex', apiKey: mode === 'codex' ? 'test-only-api-key' : '', sandbox, allowFullAccess,
  };
  const runtime = createApp(config, { transport });
  const server = runtime.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  let stopped = false;
  const close = async () => {
    if (stopped) return;
    stopped = true;
    try { await runtime.close(); } finally {
      const closed = new Promise(resolve => server.close(resolve));
      server.closeAllConnections();
      await closed;
    }
  };
  t.after(async () => {
    try { await close(); } finally {
      roots.set(root, roots.get(root) - 1);
      if (!roots.get(root)) { roots.delete(root); await rm(root, { recursive: true, force: true }); }
    }
  });
  const request = async (url, { method = 'GET', body, cookie, csrf, origin = config.origin, raw = false } = {}) => {
    const headers = {};
    if (method !== 'GET') headers.Origin = origin;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    if (csrf) headers['X-CSRF-Token'] = csrf;
    const response = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (raw) return response;
    let data;
    try { data = await response.json(); } catch { data = null; }
    return { status: response.status, body: data, headers: response.headers };
  };
  const login = async (cookie) => {
    const result = await request('/api/auth/login', { method: 'POST', body: { username: 'owner', password }, cookie });
    assert.equal(result.status, 200);
    return { cookie: result.headers.get('set-cookie').split(';')[0], csrf: result.body.csrfToken, response: result };
  };
  const create = async auth => {
    const result = await request('/api/conversations', { method: 'POST', body: {}, ...auth });
    assert.equal(result.status, 201);
    return result.body.conversation;
  };
  return { ...runtime, base, config, root, request, login, create, close };
}

async function eventually(fn, timeout = 5000) {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() - start > timeout) throw new Error('Timed out waiting for asynchronous application state.');
    await delay(15);
  }
}

test('API is protected; login regenerates sessions; origin and CSRF checks protect state changes', async t => {
  const f = await setup(t);
  for (const route of ['/api/auth/me', '/api/status', '/api/conversations', '/api/events']) {
    assert.equal((await f.request(route)).status, 401);
  }
  const bad = await f.request('/api/auth/login', { method: 'POST', body: { username: 'owner', password: 'wrong' } });
  assert.equal(bad.status, 401);
  assert.equal(bad.headers.get('set-cookie'), null);
  assert.equal((await f.request('/api/auth/login', { method: 'POST', body: { username: 'owner', password }, origin: 'https://evil.example' })).status, 403);
  const auth = await f.login();
  assert.match(auth.response.headers.get('set-cookie'), /HttpOnly/);
  assert.match(auth.response.headers.get('set-cookie'), /SameSite=Strict/i);
  assert.ok(auth.csrf.length >= 32);
  assert.equal((await f.request('/api/auth/me', auth)).body.user.username, 'owner');
  assert.equal((await f.request('/api/conversations', { method: 'POST', cookie: auth.cookie, body: {} })).status, 403);
  assert.equal((await f.request('/api/conversations', { method: 'POST', ...auth, csrf: 'invalid', body: {} })).status, 403);
  assert.equal((await f.request('/api/conversations', { method: 'POST', ...auth, origin: 'https://evil.example', body: {} })).status, 403);
  const rotated = await f.login(auth.cookie);
  assert.notEqual(rotated.cookie, auth.cookie);
  assert.notEqual(rotated.csrf, auth.csrf);
  assert.equal((await f.request('/api/auth/me', auth)).status, 401);
  await f.create(rotated);
  assert.equal((await f.request('/api/auth/logout', { method: 'POST', body: {}, ...rotated })).status, 200);
  assert.equal((await f.request('/api/auth/me', rotated)).status, 401);
});

test('performance API requires login/CSRF, validates advertised options and preserves settings across restart', async t => {
  const transport = new FakeTransport(), original = transport.request.bind(transport);
  transport.request = async (method, params) => method === 'model/list' ? { data: [{ model: 'available', isDefault: true, defaultReasoningEffort: 'low', supportedReasoningEfforts: [{ reasoningEffort: 'low' }, { reasoningEffort: 'ultra' }], serviceTiers: [{ id: 'priority', name: 'Fast' }] }] } : original(method, params);
  const f = await setup(t, { mode: 'codex', transport });
  const auth = await f.login(); await transport.start();
  const created = await f.request('/api/conversations', { method: 'POST', ...auth, body: { model: null, reasoningEffort: 'ultra', serviceTier: 'priority' } });
  assert.equal(created.status, 201);
  const c = created.body.conversation, url = `/api/conversations/${c.id}`;
  assert.equal(c.reasoningEffort, 'ultra'); assert.equal(c.serviceTier, 'priority');
  assert.equal((await f.request(url, { method: 'PATCH', body: { reasoningEffort: 'low' } })).status, 401);
  assert.equal((await f.request(url, { method: 'PATCH', cookie: auth.cookie, body: { serviceTier: 'default' } })).status, 403);
  assert.equal((await f.request(url, { method: 'PATCH', ...auth, body: { reasoningEffort: 'invented', title: 'Not saved' } })).status, 400);
  assert.equal((await f.request(url, { method: 'PATCH', ...auth, body: { serviceTier: 'ultrafast' } })).status, 400);
  assert.equal(f.store.get(c.id).title, 'Nova conversa');
  f.store.get(c.id).busy = true;
  assert.equal((await f.request(url, { method: 'PATCH', ...auth, body: { reasoningEffort: 'low' } })).status, 409);
  f.store.get(c.id).busy = false;
  f.store.flush(); await f.close();
  const restarted = await setup(t, { directory: f.root, mode: 'codex', transport: new FakeTransport() });
  const after = await restarted.request(url, await restarted.login());
  assert.equal(after.body.conversation.reasoningEffort, 'ultra'); assert.equal(after.body.conversation.serviceTier, 'priority');
});

test('empty default performance settings create a conversation without a connected model catalog', async t => {
  const f = await setup(t);
  const created = await f.request('/api/conversations', { method: 'POST', ...await f.login(), body: { model: null, reasoningEffort: null, serviceTier: null } });
  assert.equal(created.status, 201);
  assert.equal(created.body.conversation.reasoningEffort, null); assert.equal(created.body.conversation.serviceTier, null);
});

test('mock conversation streams SSE, rejects concurrent messages, and persists complete history across restart', async t => {
  const f = await setup(t);
  const auth = await f.login();
  const c = await f.create(auth);
  const stream = await f.request('/api/events', { ...auth, raw: true });
  assert.match(stream.headers.get('content-type'), /text\/event-stream/);
  const reader = stream.body.getReader();
  t.after(() => reader.cancel().catch(() => {}));
  assert.match(new TextDecoder().decode((await reader.read()).value), /event: update/);
  const text = 'Verifica meu painel, por favor.';
  assert.equal((await f.request(`/api/conversations/${c.id}/messages`, { method: 'POST', body: { text }, ...auth })).status, 202);
  assert.equal((await f.request(`/api/conversations/${c.id}/messages`, { method: 'POST', body: { text: 'Duplicada' }, ...auth })).status, 409);
  assert.match(new TextDecoder().decode((await reader.read()).value), /conversationId/);
  const completed = await eventually(async () => {
    const result = await f.request(`/api/conversations/${c.id}`, auth);
    return result.body.conversation.busy ? null : result.body.conversation;
  });
  assert.equal(completed.messages.filter(m => m.role === 'user').length, 1);
  assert.ok(completed.messages.some(m => m.role === 'assistant' && m.text.includes(text)));
  assert.equal(completed.threadId, undefined);
  await reader.cancel();
  await f.close();
  const restarted = await setup(t, { directory: f.root });
  const auth2 = await restarted.login();
  const restored = await restarted.request(`/api/conversations/${c.id}`, auth2);
  assert.deepEqual(restored.body.conversation.messages, completed.messages);
  assert.equal(restored.body.conversation.busy, false);
});

test('mock approvals are explicit, decline works, stale decisions fail and interrupt clears busy', async t => {
  const f = await setup(t);
  const auth = await f.login();
  const c = await f.create(auth);
  await f.request(`/api/conversations/${c.id}/messages`, { method: 'POST', body: { text: 'Quero testar aprovação' }, ...auth });
  const approval = await eventually(async () => (await f.request(`/api/conversations/${c.id}`, auth)).body.approvals[0]);
  assert.match(approval.params.command, /echo/);
  assert.equal((await f.request(`/api/approvals/${approval.id}`, { method: 'POST', body: { decision: 'acceptForSession' }, ...auth })).status, 400);
  assert.equal((await f.request(`/api/approvals/${approval.id}`, { method: 'POST', body: { decision: 'decline' }, ...auth })).status, 200);
  assert.equal((await f.request(`/api/approvals/${approval.id}`, { method: 'POST', body: { decision: 'accept' }, ...auth })).status, 404);
  await eventually(async () => !(await f.request(`/api/conversations/${c.id}`, auth)).body.conversation.busy);
  assert.ok((await f.request(`/api/conversations/${c.id}`, auth)).body.conversation.messages.some(m => m.text.includes('recusou')));
  await f.request(`/api/conversations/${c.id}/messages`, { method: 'POST', body: { text: 'Outra aprovação' }, ...auth });
  const pending = await eventually(async () => (await f.request(`/api/conversations/${c.id}`, auth)).body.approvals[0]);
  assert.equal((await f.request(`/api/conversations/${c.id}/interrupt`, { method: 'POST', body: {}, ...auth })).status, 200);
  const result = await f.request(`/api/conversations/${c.id}`, auth);
  assert.equal(result.body.conversation.busy, false);
  assert.deepEqual(result.body.approvals, []);
  assert.equal((await f.request(`/api/approvals/${pending.id}`, { method: 'POST', body: { decision: 'accept' }, ...auth })).status, 404);
});

test('Codex protocol maps text, commands and approvals, rejects foreign requests, and resumes persisted threads', async t => {
  const transport = new FakeTransport();
  const f = await setup(t, { mode: 'codex', transport });
  const auth = await f.login();
  const c = await f.create(auth);
  assert.equal((await f.request(`/api/conversations/${c.id}/messages`, { method: 'POST', body: { text: 'Olá real' }, ...auth })).status, 202);
  await eventually(() => f.store.get(c.id).activeTurnId === 'turn-1');
  const threadId = f.store.get(c.id).threadId;
  assert.deepEqual(transport.calls.find(x => x.method === 'thread/start').params, { cwd: f.config.workspace, sandbox: 'workspace-write', approvalPolicy: 'untrusted', developerInstructions: LUCK_INSTRUCTIONS });
  const notify = (method, extra) => transport.emit('notification', { method, params: { threadId, turnId: 'turn-1', ...extra } });
  transport.emit('serverRequest', { id: 'foreign', method: 'item/commandExecution/requestApproval', params: { threadId: 'someone-elses-thread', turnId: 'turn-1', command: 'danger' } });
  assert.equal(transport.rejected.at(-1).id, 'foreign');
  transport.emit('notification', { method: 'item/agentMessage/delta', params: { threadId: 'foreign', itemId: 'unowned', delta: 'Must not appear' } });
  notify('item/agentMessage/delta', { itemId: 'assistant-1', delta: 'Olá, ' });
  notify('item/agentMessage/delta', { itemId: 'assistant-1', delta: 'dono.' });
  notify('item/started', { item: { id: 'command-1', type: 'commandExecution', command: 'pwd' } });
  notify('item/commandExecution/outputDelta', { itemId: 'command-1', delta: '/workspace\n' });
  notify('item/completed', { item: { id: 'command-1', type: 'commandExecution', command: 'pwd', aggregatedOutput: '/workspace\n', status: 'completed', exitCode: 0 } });
  transport.emit('serverRequest', { id: 'rpc-approval', method: 'item/commandExecution/requestApproval', params: { threadId, turnId: 'turn-1', itemId: 'command-2', command: 'npm test' } });
  const approval = (await f.request(`/api/conversations/${c.id}`, auth)).body.approvals[0];
  assert.ok(approval);
  await f.request(`/api/approvals/${approval.id}`, { method: 'POST', body: { decision: 'decline' }, ...auth });
  assert.deepEqual(transport.replies.at(-1), { id: 'rpc-approval', result: { decision: 'decline' } });
  notify('turn/completed', { turn: { id: 'turn-1', status: 'completed' } });
  const done = (await f.request(`/api/conversations/${c.id}`, auth)).body.conversation;
  assert.equal(done.busy, false);
  assert.equal(done.messages.find(m => m.id === 'assistant-1').text, 'Olá, dono.');
  assert.match(done.messages.find(m => m.id === 'command-1').text, /saída 0/);
  assert.ok(!done.messages.some(m => m.id === 'unowned'));
  await f.close();
  const transport2 = new FakeTransport();
  const restarted = await setup(t, { directory: f.root, mode: 'codex', transport: transport2 });
  const auth2 = await restarted.login();
  await restarted.request(`/api/conversations/${c.id}/messages`, { method: 'POST', body: { text: 'Continua' }, ...auth2 });
  await eventually(() => transport2.calls.some(x => x.method === 'turn/start'));
  assert.equal(transport2.calls.filter(x => x.method === 'thread/start').length, 0);
  assert.equal(transport2.calls.find(x => x.method === 'thread/resume').params.threadId, threadId);
});

test('late notifications from an earlier turn cannot finish or contaminate the active turn', async t => {
  const transport = new FakeTransport();
  const f = await setup(t, { mode: 'codex', transport });
  const auth = await f.login();
  const c = await f.create(auth);
  const send = text => f.request(`/api/conversations/${c.id}/messages`, { method: 'POST', body: { text }, ...auth });
  await send('First');
  await eventually(() => f.store.get(c.id).activeTurnId === 'turn-1');
  const threadId = f.store.get(c.id).threadId;
  transport.emit('notification', { method: 'turn/completed', params: { threadId, turn: { id: 'turn-1', status: 'completed' } } });
  await send('Second');
  await eventually(() => f.store.get(c.id).activeTurnId === 'turn-2');
  transport.emit('notification', { method: 'item/agentMessage/delta', params: { threadId, turnId: 'turn-1', itemId: 'late', delta: 'old response' } });
  transport.emit('notification', { method: 'turn/completed', params: { threadId, turn: { id: 'turn-1', status: 'completed' } } });
  assert.equal(f.store.get(c.id).busy, true);
  assert.equal(f.store.get(c.id).activeTurnId, 'turn-2');
  assert.ok(!f.store.get(c.id).messages.some(m => m.id === 'late'));
});

test('interrupt during Codex startup preserves the task lock until its turn id is known', async t => {
  const transport = new FakeTransport();
  let completeStart;
  const originalRequest = transport.request.bind(transport);
  transport.request = async (method, params) => {
    if (method !== 'turn/start') return originalRequest(method, params);
    transport.calls.push({ method, params });
    return new Promise(resolve => { completeStart = resolve; });
  };
  const f = await setup(t, { mode: 'codex', transport });
  const auth = await f.login();
  const c = await f.create(auth);
  await f.request(`/api/conversations/${c.id}/messages`, { method: 'POST', body: { text: 'Start slowly' }, ...auth });
  await eventually(() => completeStart);
  const interrupted = await f.request(`/api/conversations/${c.id}/interrupt`, { method: 'POST', body: {}, ...auth });
  assert.equal(interrupted.status, 409);
  assert.equal(f.store.get(c.id).busy, true);
  assert.equal((await f.request(`/api/conversations/${c.id}/messages`, { method: 'POST', body: { text: 'Do not overlap' }, ...auth })).status, 409);
  completeStart({ turn: { id: 'slow-turn' } });
  await eventually(() => f.store.get(c.id).activeTurnId === 'slow-turn');
  assert.equal((await f.request(`/api/conversations/${c.id}/interrupt`, { method: 'POST', body: {}, ...auth })).status, 200);
  assert.deepEqual(transport.calls.at(-1), { method: 'turn/interrupt', params: { threadId: f.store.get(c.id).threadId, turnId: 'slow-turn' } });
  transport.emit('notification', { method: 'turn/completed', params: { threadId: f.store.get(c.id).threadId, turn: { id: 'slow-turn', status: 'interrupted' } } });
  assert.equal(f.store.get(c.id).busy, false);
});

test('logout closes an authenticated SSE connection and invalidates its cookie', async t => {
  const f = await setup(t);
  const auth = await f.login();
  const stream = await f.request('/api/events', { ...auth, raw: true });
  const reader = stream.body.getReader();
  t.after(() => reader.cancel().catch(() => {}));
  await reader.read();
  assert.equal((await f.request('/api/auth/logout', { method: 'POST', body: {}, ...auth })).status, 200);
  assert.equal((await reader.read()).done, true);
  assert.equal((await f.request('/api/auth/me', auth)).status, 401);
});

test('conversation settings enforce validation, authentication, CSRF and server permission limits', async t => {
  const f = await setup(t, { sandbox: 'read-only' });
  const auth = await f.login();
  const c = await f.create(auth);
  const url = `/api/conversations/${c.id}`;
  const patch = (body, extra = {}) => f.request(url, { method: 'PATCH', ...auth, body, ...extra });
  const options = (await f.request('/api/status', auth)).body.permissions;
  assert.deepEqual(options.defaults, { sandbox: 'read-only', approvalPolicy: 'untrusted' });
  assert.deepEqual(options.allowed.sandbox, ['read-only']);
  assert.deepEqual(c.permissions, options.defaults);
  assert.equal((await patch({ title: 'Novo título' }, { cookie: undefined })).status, 401);
  assert.equal((await patch({ title: 'Novo título' }, { csrf: undefined })).status, 403);
  assert.equal((await f.request(url, { method: 'DELETE', ...auth, csrf: undefined })).status, 403);
  for (const body of [{ title: '' }, { title: 'x'.repeat(101) }, { title: 'line\nbreak' }, { permissions: null }, { permissions: { sandbox: 'danger-full-access' } }, { permissions: { sandbox: 'workspace-write' } }, { permissions: { approvalPolicy: 'never' } }, { permissions: { networkAccess: true } }, { arbitrary: true }]) {
    assert.equal((await patch(body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await f.request('/api/conversations', { method: 'POST', ...auth, body: { permissions: { sandbox: 'workspace-write' } } })).status, 400);
  const updated = await patch({ title: '  Projeto principal  ', permissions: { approvalPolicy: 'on-request' } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.conversation.title, 'Projeto principal');
  assert.deepEqual(updated.body.conversation.permissions, { sandbox: 'read-only', approvalPolicy: 'on-request' });
  assert.equal((await f.request('/api/conversations', auth)).body.conversations[0].title, 'Projeto principal');
  await f.close();
  const restarted = await setup(t, { directory: f.root, sandbox: 'read-only' });
  const auth2 = await restarted.login();
  assert.deepEqual((await restarted.request(url, auth2)).body.conversation.permissions, updated.body.conversation.permissions);
  assert.equal((await restarted.request(url, { method: 'DELETE', ...auth2 })).status, 200);
  assert.equal((await restarted.request(url, auth2)).status, 404);
  assert.deepEqual((await restarted.request('/api/conversations', auth2)).body.conversations, []);
});

test('permissions apply to every loaded Codex turn; busy settings and deletion are rejected', async t => {
  const transport = new FakeTransport();
  const f = await setup(t, { mode: 'codex', transport });
  const auth = await f.login();
  const created = await f.request('/api/conversations', { method: 'POST', ...auth, body: { permissions: { sandbox: 'read-only', approvalPolicy: 'on-request' } } });
  assert.equal(created.status, 201);
  const c = created.body.conversation;
  const url = `/api/conversations/${c.id}`;
  await f.request(`${url}/messages`, { method: 'POST', ...auth, body: { text: 'Inspecione o projeto' } });
  await eventually(() => f.store.get(c.id).activeTurnId);
  assert.deepEqual(transport.calls.find(x => x.method === 'thread/start').params, { cwd: f.config.workspace, sandbox: 'read-only', approvalPolicy: 'on-request', developerInstructions: LUCK_INSTRUCTIONS });
  assert.deepEqual(transport.calls.find(x => x.method === 'turn/start').params.sandboxPolicy, { type: 'readOnly', networkAccess: false });
  assert.equal((await f.request(url, { method: 'PATCH', ...auth, body: { title: 'Durante execução' } })).status, 409);
  assert.equal((await f.request(url, { method: 'PATCH', ...auth, body: { permissions: { sandbox: 'workspace-write' } } })).status, 409);
  assert.equal((await f.request(url, { method: 'DELETE', ...auth })).status, 409);
  const threadId = f.store.get(c.id).threadId;
  transport.emit('notification', { method: 'turn/completed', params: { threadId, turn: { id: 'turn-1', status: 'completed' } } });
  const changed = await f.request(url, { method: 'PATCH', ...auth, body: { permissions: { sandbox: 'workspace-write', approvalPolicy: 'untrusted' } } });
  assert.equal(changed.status, 200);
  await f.request(`${url}/messages`, { method: 'POST', ...auth, body: { text: 'Agora atualize o projeto' } });
  await eventually(() => f.store.get(c.id).activeTurnId === 'turn-2');
  const turns = transport.calls.filter(x => x.method === 'turn/start');
  assert.equal(turns.length, 2);
  assert.equal(turns[1].params.approvalPolicy, 'untrusted');
  assert.deepEqual(turns[1].params.sandboxPolicy, { type: 'workspaceWrite', writableRoots: [f.config.workspace], networkAccess: false, excludeSlashTmp: true, excludeTmpdirEnvVar: true });
  assert.equal(transport.calls.filter(x => x.method === 'thread/start').length, 1);
  assert.equal(f.store.get(c.id).messages.filter(m => m.role === 'user').length, 2);
  transport.emit('notification', { method: 'turn/completed', params: { threadId, turn: { id: 'turn-2', status: 'completed' } } });
});

test('admin full access is opt-in, native on new and loaded turns, and reversible to restricted approval', async t => {
  const transport = new FakeTransport();
  const f = await setup(t, { mode: 'codex', transport, allowFullAccess: true });
  const auth = await f.login();
  const options = (await f.request('/api/status', auth)).body.permissions;
  assert.ok(options.allowed.sandbox.includes('danger-full-access'));
  assert.deepEqual(options.defaults, { sandbox: 'workspace-write', approvalPolicy: 'untrusted' });
  const created = await f.request('/api/conversations', { method: 'POST', ...auth, body: { permissions: { sandbox: 'danger-full-access' } } });
  assert.equal(created.status, 201);
  const c = created.body.conversation;
  assert.deepEqual(c.permissions, { sandbox: 'danger-full-access', approvalPolicy: 'never' });
  const url = `/api/conversations/${c.id}`;
  await f.request(`${url}/messages`, { method: 'POST', ...auth, body: { text: 'Execute a tarefa autorizada' } });
  await eventually(() => f.store.get(c.id).activeTurnId === 'turn-1');
  const start = transport.calls.find(call => call.method === 'thread/start');
  assert.equal(start.params.sandbox, 'danger-full-access');
  assert.equal(start.params.approvalPolicy, 'never');
  const first = transport.calls.find(call => call.method === 'turn/start');
  assert.deepEqual(first.params.sandboxPolicy, { type: 'dangerFullAccess' });
  assert.equal(first.params.approvalPolicy, 'never');
  const threadId = f.store.get(c.id).threadId;
  const finish = turn => transport.emit('notification', { method: 'turn/completed', params: { threadId, turn: { id: `turn-${turn}`, status: 'completed' } } });
  finish(1);
  const lower = await f.request(url, { method: 'PATCH', ...auth, body: { permissions: { sandbox: 'read-only' } } });
  assert.equal(lower.status, 200);
  assert.deepEqual(lower.body.conversation.permissions, { sandbox: 'read-only', approvalPolicy: 'on-request' });
  assert.equal((await f.request(url, { method: 'PATCH', ...auth, body: { permissions: { approvalPolicy: 'never' } } })).status, 400);
  await f.request(`${url}/messages`, { method: 'POST', ...auth, body: { text: 'Agora apenas consulte' } });
  await eventually(() => f.store.get(c.id).activeTurnId === 'turn-2');
  finish(2);
  const raised = await f.request(url, { method: 'PATCH', ...auth, body: { permissions: { sandbox: 'danger-full-access', approvalPolicy: 'on-request' } } });
  assert.equal(raised.status, 200);
  assert.deepEqual(raised.body.conversation.permissions, { sandbox: 'danger-full-access', approvalPolicy: 'never' });
  await f.request(`${url}/messages`, { method: 'POST', ...auth, body: { text: 'Retome o acesso total autorizado' } });
  await eventually(() => f.store.get(c.id).activeTurnId === 'turn-3');
  const turns = transport.calls.filter(call => call.method === 'turn/start');
  assert.deepEqual(turns[1].params.sandboxPolicy, { type: 'readOnly', networkAccess: false });
  assert.equal(turns[1].params.approvalPolicy, 'on-request');
  assert.deepEqual(turns[2].params.sandboxPolicy, { type: 'dangerFullAccess' });
  assert.equal(turns[2].params.approvalPolicy, 'never');
  assert.equal(transport.calls.filter(call => call.method === 'thread/start').length, 1);
  finish(3);
  f.config.allowFullAccess = false;
  const sanitized = (await f.request(url, auth)).body.conversation.permissions;
  assert.deepEqual(sanitized, { sandbox: 'workspace-write', approvalPolicy: 'untrusted' });
});
