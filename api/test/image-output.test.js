import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { ChatService } from '../src/services/chatService.js';
import { ConversationStore } from '../src/models/conversationStore.js';
import { WorkspaceFiles } from '../src/services/workspaceFiles.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGKsAAAAASUVORK5CYII=', 'base64');
class Transport extends EventEmitter {
  ready = true;
  calls = [];
  endpoint = { host: 'fixture.test', username: 'owner', port: 22, fingerprint: 'fixture', workspace: '/srv/project' };
  async start() {}
  async request(method, params) {
    this.calls.push({ method, params });
    if (method === 'thread/start') return { thread: { id: 'image-thread' } };
    if (method === 'turn/start') return { turn: { id: 'image-turn' } };
    if (method === 'fs/readFile') return { dataBase64: png.toString('base64') };
    return {};
  }
  async close() {}
  response() {} rejectRequest() {}
}
async function until(fn) {
  for (let index = 0; index < 200; index++) { const value = await fn(); if (value) return value; await delay(5); }
  throw new Error('Timed out waiting for native image output');
}
async function fixture(t, mode = 'codex') {
  const root = await mkdtemp('/tmp/luck-native-image-');
  const config = { mode, workspace: path.join(root, 'workspace'), dataDir: path.join(root, 'data'), sandbox: 'workspace-write' };
  const store = new ConversationStore(config.dataDir), transport = new Transport();
  const chat = new ChatService(config, store, { publish() {} }, transport);
  chat.workspaceFiles = new WorkspaceFiles(config, chat);
  const c = store.create(); chat.send(c, 'Crie uma imagem.'); await until(() => c.activeTurnId === 'image-turn');
  t.after(async () => { await chat.close(); await until(() => chat.imageJobs.size === 0); await rm(root, { recursive: true, force: true }); });
  const notify = (method, extra = {}) => transport.emit('notification', { method, params: { threadId: c.threadId, turnId: 'image-turn', ...extra } });
  return { root, config, store, transport, chat, c, notify };
}

test('native image generation persists actual bytes inside workspace and holds busy until its preview is saved', async t => {
  const f = await fixture(t), original = f.chat.workspaceFiles.transfer.bind(f.chat.workspaceFiles);
  let release; const gate = new Promise(resolve => { release = resolve; });
  f.chat.workspaceFiles.transfer = async (...args) => { await gate; return original(...args); };
  f.notify('item/started', { item: { id: 'generated-image-1', type: 'imageGeneration', status: 'in_progress' } });
  f.notify('item/completed', { item: { id: 'generated-image-1', type: 'imageGeneration', status: 'completed', result: png.toString('base64') } });
  f.notify('turn/completed', { turn: { id: 'image-turn', status: 'completed' } });
  await delay(20); assert.equal(f.c.busy, true);
  assert.equal(f.c.messages.find(m => m.id === 'generated-image-1').imageGeneration.status, 'saving');
  release(); await until(() => !f.c.busy);
  const message = f.c.messages.find(m => m.id === 'generated-image-1');
  assert.equal(message.imageGeneration.status, 'completed'); assert.match(message.text, /!\[Imagem criada pelo Luck\]\(\.luck\/outputs\/luck-[a-f0-9-]+\.png\)/);
  assert.match(message.text, /\[Baixar imagem\]/); assert.ok(!message.text.includes(png.toString('base64')));
  assert.deepEqual(await readFile(path.join(f.config.workspace, message.imageGeneration.path)), png);
  assert.ok(!(await readdir(f.config.dataDir)).some(name => name.startsWith('luck-image-')));
  const count = f.c.messages.length;
  f.notify('item/completed', { item: { id: 'generated-image-1', type: 'imageGeneration', status: 'completed', result: png.toString('base64') } });
  assert.equal(f.c.messages.length, count);
});

test('invalid native image bytes and generation limits report errors without inventing image previews', async t => {
  const invalid = await fixture(t);
  invalid.notify('item/completed', { item: { id: 'bad-image', type: 'imageGeneration', status: 'completed', result: Buffer.from('not an image').toString('base64') } });
  invalid.notify('turn/completed', { turn: { id: 'image-turn', status: 'completed' } });
  await until(() => !invalid.c.busy);
  const message = invalid.c.messages.find(m => m.id === 'bad-image');
  assert.equal(message.imageGeneration.status, 'failed'); assert.ok(!message.text.includes('!['));
  assert.ok(!(await readdir(invalid.config.workspace)).includes('.luck'));
  const limited = await fixture(t);
  limited.notify('item/completed', { item: { id: 'limited-image', type: 'imageGeneration', status: 'failed', failure: { type: 'usageLimitExceeded', limitId: 'image' } } });
  assert.match(limited.c.messages.find(m => m.id === 'limited-image').text, /limite de geração/);
  assert.equal(limited.chat.imageJobs.size, 0);
});

test('native savedPath reads through the connected SSH Codex and transfers only valid image bytes to outputs', async t => {
  const f = await fixture(t, 'ssh'); const transfers = [];
  f.chat.workspaceFiles = { transfer: async (source, name, options) => { transfers.push({ bytes: await readFile(source), name, options }); return `/srv/project/.luck/outputs/${name}`; } };
  f.notify('item/completed', { item: { id: 'remote-image', type: 'imageGeneration', status: 'completed', savedPath: '/home/owner/.codex/generated_images/example.png', fileId: 'native-image-ref' } });
  f.notify('turn/completed', { turn: { id: 'image-turn', status: 'completed' } }); await until(() => !f.c.busy);
  assert.deepEqual(f.transport.calls.find(call => call.method === 'fs/readFile').params, { path: '/home/owner/.codex/generated_images/example.png' });
  assert.equal(transfers.length, 1); assert.deepEqual(transfers[0].bytes, png); assert.deepEqual(transfers[0].options, { directory: 'outputs' });
  assert.equal(f.c.messages.find(m => m.id === 'remote-image').imageGeneration.status, 'completed');
});

test('ended or disconnected turns cannot append late generated images or keep busy after a cancelled save', async t => {
  const f = await fixture(t);
  f.notify('turn/completed', { turn: { id: 'image-turn', status: 'completed' } });
  f.notify('item/completed', { item: { id: 'late-image', type: 'imageGeneration', status: 'completed', result: png.toString('base64') } });
  assert.ok(!f.c.messages.some(message => message.id === 'late-image')); assert.equal(f.chat.imageJobs.size, 0);
  const active = await fixture(t); let release;
  active.chat.workspaceFiles.transfer = () => new Promise(resolve => { release = resolve; });
  active.notify('item/completed', { item: { id: 'cancelled-save', type: 'imageGeneration', status: 'completed', result: `data:image/png;base64,${png.toString('base64')}` } });
  await until(() => release); active.chat.fail(active.c, 'Conexão encerrada.'); release('/unused'); await until(() => !active.chat.imageJobs.size);
  assert.equal(active.c.busy, false);
  const message = active.c.messages.find(m => m.id === 'cancelled-save'); assert.equal(message.imageGeneration.status, 'failed'); assert.ok(!message.text.includes('!['));
});
