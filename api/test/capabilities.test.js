import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { CapabilitiesService, validateAvailableModel, defaultAvailableModel } from '../src/services/capabilitiesService.js';

function setup(t, { connected = true, request, mode = 'ssh' } = {}) {
  const transport = new EventEmitter();
  transport.ready = connected;
  const calls = [];
  transport.request = async (method, params) => {
    calls.push({ method, params });
    if (request) return request(method, params);
    if (method === 'model/list') return { data: [{ id: 'catalog-id', model: 'actual-model', displayName: 'Available model', isDefault: true, inputModalities: ['text', 'image'], hidden: false }, { model: 'hidden-model', hidden: true }] };
    if (method === 'skills/list') return { data: [{ skills: [{ name: 'review-project', path: '/workspace/skills/review/SKILL.md', description: 'Review project', enabled: true }, { name: 'disabled-skill', path: '/disabled', enabled: false }] }] };
    if (method === 'mcpServerStatus/list') return { data: [{ name: 'docs', authStatus: 'notLoggedIn', tools: { lookup: { description: 'No credentials' } }, secret: 'do-not-expose' }] };
    return {};
  };
  transport.close = async () => { transport.ready = false; transport.emit('disconnected'); };
  const c = { id: 'conversation', threadId: 'thread-1', contextKey: 'workspace-key', messages: [{ role: 'user', text: 'hello' }], busy: false, activeTurnId: null };
  const store = { get: id => id === c.id ? c : null, addMessage: (conversation, role, text) => conversation.messages.push({ role, text }) };
  const config = { mode };
  const chat = { config, transport, loaded: new Set(), contextKey: () => 'workspace-key', workspace: () => '/workspace', isBusy: () => c.busy, changed: () => {}, finish: conversation => { if (conversation.activeTurnId) chat.endedTurns.add(conversation.activeTurnId); conversation.busy = false; conversation.activeTurnId = null; }, endedTurns: new Set() };
  const connection = { status: id => ({ connected: id === 'owner' && transport.ready }), ensureOwner: id => { if (id !== 'owner' || !transport.ready) throw Object.assign(new Error('Conecte sua VPS nesta sessão.'), { status: 409 }); } };
  const service = new CapabilitiesService({ config, chat, connection, store, compactTimeoutMs: 1000 });
  t.after(() => service.close());
  return { service, chat, config, c, transport, calls };
}

test('capability inventory comes from connected Codex and hides disabled skills and sensitive MCP fields', async t => {
  const f = setup(t);
  const result = await f.service.read('owner');
  assert.equal(result.connected, true);
  assert.equal(result.models[0].model, 'actual-model');
  assert.equal(result.models.length, 1);
  assert.equal(result.skills.length, 1);
  assert.equal(result.skills[0].name, 'review-project');
  assert.deepEqual(result.mcp, [{ name: 'docs', status: 'notLoggedIn', toolCount: 1 }]);
  assert.ok(!JSON.stringify(result).includes('do-not-expose'));
  assert.equal(result.commands.find(c => c.name === 'plan').source, 'Prompt');
  assert.equal(result.commands.find(c => c.name === 'compact').source, 'Codex');
  assert.equal(result.commands.some(c => c.name === 'cloud'), false);
});

test('disconnected and foreign sessions receive local commands without querying remote inventory', async t => {
  const f = setup(t);
  const result = await f.service.read('foreign');
  assert.equal(result.connected, false);
  assert.deepEqual(result.models, []);
  assert.equal(result.commands.find(c => c.name === 'compact').enabled, false);
  assert.equal(f.calls.length, 0);
  f.transport.ready = false;
  assert.equal((await f.service.read('owner')).connected, false);
});

test('unsupported remote inventories degrade individually without forwarding transport errors', async t => {
  const f = setup(t, { request: async method => { if (method === 'model/list') return { data: [] }; throw new Error('secret diagnostic sk-private'); } });
  const result = await f.service.read('owner');
  assert.equal(result.connected, true);
  assert.equal(result.warnings.length, 2);
  assert.equal(JSON.stringify(result).includes('sk-private'), false);
});

test('model selection validates actual catalog aliases and resolves account default', async t => {
  const f = setup(t);
  assert.equal(await validateAvailableModel(f.chat, 'catalog-id'), 'actual-model');
  assert.equal(await validateAvailableModel(f.chat, 'actual-model'), 'actual-model');
  assert.equal(await validateAvailableModel(f.chat, null), null);
  assert.equal(await defaultAvailableModel(f.chat), 'actual-model');
  await assert.rejects(validateAvailableModel(f.chat, 'invented-model'), { status: 400 });
  assert.equal(f.calls.filter(call => call.method === 'model/list').length, 1);
  f.transport.ready = false;
  await assert.rejects(validateAvailableModel(f.chat, 'actual-model'), { status: 409 });
});

test('compact uses native protocol, owns a task lock, resumes unloaded thread and preserves history', async t => {
  const f = setup(t);
  await f.service.compact('owner', f.c.id);
  assert.equal(f.c.busy, true);
  assert.deepEqual(f.calls.map(call => call.method), ['thread/resume', 'thread/compact/start']);
  assert.deepEqual(f.calls[1].params, { threadId: f.c.threadId });
  await assert.rejects(f.service.compact('owner', f.c.id), { status: 409 });
  f.c.activeTurnId = 'compact-turn';
  f.transport.emit('notification', { method: 'thread/compacted', params: { threadId: f.c.threadId } });
  assert.equal(f.c.busy, false);
  assert.equal(f.chat.endedTurns.has('compact-turn'), true);
  assert.equal(f.c.messages[0].text, 'hello');
  assert.match(f.c.messages.at(-1).text, /compactado/);
  assert.equal(f.service.compactions.size, 0);
});

test('compact rejects foreign sessions, absent conversations, empty or mismatched environments', async t => {
  const f = setup(t);
  await assert.rejects(f.service.compact('other', f.c.id), { status: 409 });
  await assert.rejects(f.service.compact('owner', 'not-found'), { status: 404 });
  f.c.contextKey = 'old-environment';
  await assert.rejects(f.service.compact('owner', f.c.id), { status: 409 });
  f.c.contextKey = 'workspace-key'; f.c.threadId = null;
  await assert.rejects(f.service.compact('owner', f.c.id), { status: 409 });
  assert.equal(f.calls.length, 0);
});

test('compact startup failure and disconnect release busy state with a clear system message', async t => {
  const f = setup(t, { request: async method => { if (method === 'thread/compact/start') throw new Error('unsupported'); return {}; } });
  await assert.rejects(f.service.compact('owner', f.c.id), { status: 502 });
  assert.equal(f.c.busy, false);
  assert.equal(f.service.compactions.size, 0);
  assert.match(f.c.messages.at(-1).text, /não conseguiu iniciar/);
  f.transport.request = async () => ({});
  await f.service.compact('owner', f.c.id);
  f.transport.emit('disconnected');
  assert.equal(f.c.busy, false);
  assert.match(f.c.messages.at(-1).text, /conexão foi encerrada/);
});
