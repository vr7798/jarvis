import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { TerminalService } from '../src/services/terminalService.js';

class Channel extends EventEmitter {
  writable = true;
  writes = [];
  sizes = [];
  stderr = new EventEmitter();
  write(value) { this.writes.push(value); return true; }
  setWindow(...value) { this.sizes.push(value); }
  end() { this.writable = false; }
  close() { this.emit('close'); }
}

function fixture(t, options = {}) {
  const transport = new EventEmitter();
  const channels = [], shells = [];
  transport.ready = true;
  transport.endpoint = { workspace: "/srv/project's files", username: 'owner' };
  transport.connection = { shell(size, cb) { shells.push(size); const channel = new Channel(); channels.push(channel); cb(null, channel); } };
  const connection = { owner: 'session-owner', ensureOwner(id) { if (this.owner !== id || !transport.ready) throw Object.assign(new Error('Not owner'), { status: 409 }); } };
  const service = new TerminalService({ config: { mode: options.mode || 'ssh' }, connection, chat: { transport } });
  t.after(() => service.dispose());
  return { service, transport, channels, shells, connection, expires: Date.now() + 60000 };
}

function response() {
  return { packets: [], status(code) { this.statusCode = code; return this; }, set(headers) { this.headers = headers; return this; }, flushHeaders() {}, write(value) { this.packets.push(value); return true; }, end() { this.ended = true; } };
}

test('manual SSH terminal opens only for the connected owner and quotes workspace; never opens local root shell', async t => {
  const f = fixture(t);
  await assert.rejects(f.service.open('someone-else', {}, f.expires), { status: 409 });
  const open = await f.service.open('session-owner', { cols: 90, rows: 24 }, f.expires);
  assert.ok(open.id);
  assert.deepEqual(f.shells, [{ term: 'xterm-256color', cols: 90, rows: 24 }]);
  assert.equal(f.channels[0].writes[0], 'cd -- \'/srv/project\'"\'"\'s files\'\r');
  assert.throws(() => f.service.get(open.id, 'someone-else'), { status: 404 });
  const local = fixture(t, { mode: 'codex' });
  await assert.rejects(local.service.open('session-owner', {}, local.expires), { status: 409 });
  assert.equal(local.channels.length, 0);
});

test('terminal input and resizing are validated, ordered and scoped to one owner', async t => {
  const f = fixture(t), open = await f.service.open('session-owner', {}, f.expires), stream = f.channels[0];
  await f.service.input(open.id, 'session-owner', 'pwd\r');
  await f.service.input(open.id, 'session-owner', '\x03');
  assert.deepEqual(stream.writes.slice(1), ['pwd\r', '\x03']);
  await assert.rejects(f.service.input(open.id, 'session-owner', 'a'.repeat(8193)), { status: 400 });
  await assert.rejects(f.service.input(open.id, 'session-owner', '\ud83d\udc36'.repeat(2049)), { status: 400 });
  await assert.rejects(f.service.input(open.id, 'other', 'pwd'), { status: 404 });
  f.service.resize(open.id, 'session-owner', { cols: 120, rows: 40 });
  assert.deepEqual(stream.sizes, [[40, 120, 0, 0]]);
  assert.throws(() => f.service.resize(open.id, 'session-owner', { cols: 9000, rows: 20 }), { status: 400 });
  await assert.rejects(f.service.open('session-owner', {}, Date.now() - 1), { status: 401 });
});

test('SSE replays bounded output, resumes by event id and closes on disconnect', async t => {
  const f = fixture(t), open = await f.service.open('session-owner', {}, f.expires), stream = f.channels[0];
  stream.emit('data', 'first\r\n'); stream.emit('data', 'second\r\n');
  const req = new EventEmitter(); Object.assign(req, { params: { terminalId: open.id }, sessionID: 'session-owner', get: () => '1' });
  const res = response(); f.service.events(req, res);
  assert.match(res.headers['Content-Type'], /text\/event-stream/);
  assert.ok(!res.packets.join('').includes('first'));
  assert.match(res.packets.join(''), /second/);
  stream.emit('data', 'live');
  assert.match(res.packets.at(-1), /live/);
  for (let index = 0; index < 30; index++) stream.emit('data', 'x'.repeat(16384));
  const record = f.service.get(open.id, 'session-owner');
  assert.ok(record.bytes <= 128 * 1024);
  assert.ok(record.replay.length <= 8);
  f.transport.emit('disconnected');
  assert.equal(f.service.sessions.size, 0);
  assert.equal(res.ended, true);
  assert.match(res.packets.at(-1), /event: closed/);
  assert.equal(stream.writable, false);
});

test('opening a new terminal closes the old channel; stale sockets, error and backpressure are cleaned up', async t => {
  const f = fixture(t), first = await f.service.open('session-owner', {}, f.expires), old = f.channels[0];
  const second = await f.service.open('session-owner', {}, f.expires);
  assert.equal(old.writable, false); assert.throws(() => f.service.get(first.id, 'session-owner'), { status: 404 });
  const stream = f.channels[1];
  stream.write = () => false;
  const input = f.service.input(second.id, 'session-owner', 'hello');
  stream.emit('drain'); await input;
  const req = new EventEmitter(); Object.assign(req, { params: { terminalId: second.id }, sessionID: 'session-owner', get: () => null });
  const res = response(); f.service.events(req, res); res.write = () => false;
  stream.emit('data', 'output');
  assert.equal(res.ended, true); assert.equal(f.service.get(second.id, 'session-owner').clients.size, 0);
  f.transport.connection = {};
  assert.throws(() => f.service.get(second.id, 'session-owner'), { status: 409 });
  stream.emit('error', new Error('safe fixture error')); assert.equal(f.service.sessions.size, 0);
});
