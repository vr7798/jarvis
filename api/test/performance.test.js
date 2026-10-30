import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { CapabilitiesService, validatePerformanceSettings, turnPerformanceSettings } from '../src/services/capabilitiesService.js';
import { ChatService } from '../src/services/chatService.js';
import { ConversationStore } from '../src/models/conversationStore.js';
import { conversationController } from '../src/controllers/conversationController.js';

const models = [
  { id: 'sol-catalog', model: 'sol', isDefault: true, defaultReasoningEffort: 'low', supportedReasoningEfforts: ['low', 'medium', 'high', 'max', 'ultra'].map(reasoningEffort => ({ reasoningEffort, description: reasoningEffort })), defaultServiceTier: null, serviceTiers: [{ id: 'priority', name: 'Fast', description: 'Faster processing' }, { id: 'ultrafast', name: 'Ultrafast', description: 'Account specific tier' }] },
  { id: 'luna', model: 'luna', defaultReasoningEffort: 'medium', supportedReasoningEfforts: ['low', 'medium', 'high', 'max'].map(reasoningEffort => ({ reasoningEffort, description: reasoningEffort })), serviceTiers: [{ id: 'priority', name: 'Fast', description: '' }] },
];
class Transport extends EventEmitter {
  ready = true; calls = []; turn = 0;
  async start() { this.ready = true; }
  async close() { this.ready = false; }
  async request(method, params) {
    this.calls.push({ method, params });
    if (method === 'model/list') return { data: structuredClone(models) };
    if (method === 'thread/start') return { thread: { id: 'performance-thread' }, reasoningEffort: 'ultra', serviceTier: 'priority' };
    // Deliberately return sticky old overrides; reset must use catalog defaults.
    if (method === 'thread/resume') return { thread: { id: params.threadId }, reasoningEffort: 'ultra', serviceTier: 'priority' };
    if (method === 'turn/start') return { turn: { id: `turn-${++this.turn}` } };
    return { data: [] };
  }
  response() {} rejectRequest() {}
}
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
async function until(fn) { for (let i = 0; i < 100; i++) { if (fn()) return; await delay(5); } throw new Error('Timed out waiting for turn'); }
async function fixture(t) {
  const root = await mkdtemp('/tmp/luck-performance-');
  const config = { mode: 'codex', workspace: `${root}/workspace`, dataDir: `${root}/data`, sandbox: 'workspace-write' };
  const store = new ConversationStore(config.dataDir), transport = new Transport();
  const chat = new ChatService(config, store, { publish() {} }, transport);
  t.after(async () => { await chat.close(); await rm(root, { recursive: true, force: true }); });
  return { root, config, store, transport, chat, controller: conversationController(store, chat) };
}

test('catalog exposes real effort/tier ids, model default and speed commands without inventing Ultra', async t => {
  const f = await fixture(t);
  const service = new CapabilitiesService({ ...f, connection: { status: () => ({ connected: true }), ensureOwner() {} } });
  t.after(() => service.close());
  const result = await service.read('owner');
  assert.equal(result.defaultModel, 'sol');
  assert.deepEqual(result.models[0].supportedServiceTiers, ['default', 'priority', 'ultrafast']);
  assert.equal(result.models[0].serviceTiers[0].name, 'Fast');
  assert.equal(result.models[0].supportedReasoningEfforts.at(-1).reasoningEffort, 'ultra');
  assert.ok(!result.models[1].supportedReasoningEfforts.some(option => option.reasoningEffort === 'ultra'));
  assert.ok(!result.models[1].supportedServiceTiers.includes('ultrafast'));
  assert.ok(['effort', 'fast', 'delete'].every(name => result.commands.some(command => command.name === name)));
});

test('settings validate advertised values atomically and reset omitted overrides on model changes', async t => {
  const f = await fixture(t);
  const selected = await validatePerformanceSettings(f.chat, { reasoningEffort: 'ultra', serviceTier: 'priority' });
  assert.deepEqual(selected, { reasoningEffort: 'ultra', serviceTier: 'priority' });
  await assert.rejects(validatePerformanceSettings(f.chat, { reasoningEffort: 'invented' }), { status: 400 });
  await assert.rejects(validatePerformanceSettings(f.chat, { serviceTier: 'fast' }), { status: 400 });
  await assert.rejects(validatePerformanceSettings(f.chat, { reasoningEffort: 'ultra' }, {}, 'luna'), { status: 400 });
  await assert.rejects(validatePerformanceSettings(f.chat, { serviceTier: 'ultrafast' }, {}, 'luna'), { status: 400 });
  await assert.rejects(validatePerformanceSettings(f.chat, { reasoningEffort: '' }), { status: 400 });
  assert.deepEqual(await validatePerformanceSettings(f.chat, { model: 'luna' }, { model: 'sol', ...selected }, 'luna'), { reasoningEffort: null, serviceTier: null });
  const c = f.store.create(); c.model = 'sol'; Object.assign(c, selected);
  const res = response();
  await assert.rejects(f.controller.update({ conversation: c, body: { title: 'Must not be saved', reasoningEffort: 'unsupported' } }, res), { status: 400 });
  assert.equal(c.title, 'Nova conversa'); assert.equal(c.reasoningEffort, 'ultra');
});

test('missing service-tier metadata never advertises or accepts a faster tier', async t => {
  const f = await fixture(t);
  f.transport.request = async method => method === 'model/list' ? { data: [{ model: 'old-catalog', isDefault: true }] } : { data: [] };
  const service = new CapabilitiesService({ ...f, connection: { status: () => ({ connected: true }), ensureOwner() {} } });
  t.after(() => service.close());
  const result = await service.read('owner');
  assert.deepEqual(result.models[0].serviceTiers, []);
  assert.deepEqual(result.models[0].supportedServiceTiers, ['default']);
  await assert.rejects(validatePerformanceSettings(f.chat, { serviceTier: 'fast' }), { status: 400 });
});

test('Ultra/Fast apply to new and loaded turns; null resets explicitly and survives restart/resume', async t => {
  const f = await fixture(t);
  const created = response();
  await f.controller.create({ body: { model: 'sol', reasoningEffort: 'ultra', serviceTier: 'priority' } }, created);
  assert.equal(created.code, 201);
  const c = f.store.get(created.body.conversation.id);
  const send = async text => { const next = f.transport.turn + 1; f.chat.send(c, text); await until(() => c.activeTurnId === `turn-${next}`); f.chat.finish(c); };
  await send('First');
  assert.equal(f.transport.calls.find(call => call.method === 'thread/start').params.serviceTier, 'priority');
  const first = f.transport.calls.find(call => call.method === 'turn/start').params;
  assert.equal(first.effort, 'ultra'); assert.equal(first.serviceTier, 'priority');
  await f.controller.update({ conversation: c, body: { reasoningEffort: 'high', serviceTier: 'default' } }, response());
  await send('Loaded thread uses changed settings');
  const second = f.transport.calls.filter(call => call.method === 'turn/start')[1].params;
  assert.equal(second.effort, 'high'); assert.equal(second.serviceTier, 'default');
  await f.controller.update({ conversation: c, body: { reasoningEffort: null, serviceTier: null } }, response());
  await send('Reset defaults');
  const third = f.transport.calls.filter(call => call.method === 'turn/start')[2].params;
  assert.equal(third.effort, 'low'); assert.equal(third.serviceTier, 'default');
  assert.equal(f.transport.calls.filter(call => call.method === 'thread/start').length, 1);
  f.store.flush();
  const restartedStore = new ConversationStore(f.config.dataDir), restartedTransport = new Transport();
  const restarted = new ChatService(f.config, restartedStore, { publish() {} }, restartedTransport);
  const saved = restartedStore.get(c.id);
  assert.equal(saved.reasoningEffort, null); assert.equal(saved.serviceTier, null);
  restarted.send(saved, 'After restart'); await until(() => saved.activeTurnId === 'turn-1'); restarted.finish(saved);
  assert.ok(restartedTransport.calls.some(call => call.method === 'thread/resume'));
  const resumed = restartedTransport.calls.find(call => call.method === 'turn/start').params;
  assert.equal(resumed.effort, 'low'); assert.equal(resumed.serviceTier, 'default');
  assert.deepEqual(saved.messages.map(message => message.text), ['First', 'Loaded thread uses changed settings', 'Reset defaults', 'After restart']);
  await restarted.close();
});

test('legacy conversations remain unchanged and delayed discovery cannot alter a busy or deleted chat', async t => {
  const f = await fixture(t);
  assert.deepEqual(await turnPerformanceSettings(f.chat, f.store.create()), {});
  let release;
  f.transport.request = async method => method === 'model/list' ? new Promise(resolve => { release = () => resolve({ data: models }); }) : {};
  const c = f.store.create();
  const pending = f.controller.update({ conversation: c, body: { reasoningEffort: 'high', title: 'Race' } }, response());
  await until(() => release);
  c.busy = true; release();
  await assert.rejects(pending, { status: 409 });
  assert.equal(c.title, 'Nova conversa'); assert.equal(c.reasoningEffort, undefined);
  c.busy = false;
});

test('logout during model discovery cannot commit settings after SSH ownership is released', async t => {
  const f = await fixture(t);
  let release, owned = true;
  const controller = conversationController(f.store, f.chat, { ensureOwner() { if (!owned) throw Object.assign(new Error('Session released'), { status: 409 }); } });
  f.transport.request = async method => method === 'model/list' ? new Promise(resolve => { release = () => resolve({ data: models }); }) : {};
  const c = f.store.create();
  const pending = controller.update({ conversation: c, sessionID: 'owner', body: { reasoningEffort: 'ultra', title: 'Not committed' } }, response());
  await until(() => release); owned = false; release();
  await assert.rejects(pending, { status: 409 });
  assert.equal(c.title, 'Nova conversa'); assert.equal(c.reasoningEffort, undefined);
});
