import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createTerminalInput } from '../../front/src/components/terminalInput.js';

class Socket {
  readyState = 1;
  sent = [];
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.onclose?.(); }
  message(data) { this.onmessage?.({ data: JSON.stringify(data) }); }
}
function fixture(t, options = {}) {
  const socket = new Socket(), errors = [], calls = [];
  const input = createTerminalInput({ id: 'test-terminal', csrf: 'a'.repeat(64), location: { href: 'https://jarvis.example/', protocol: 'https:' }, socketFactory: (url, protocols) => {
    assert.equal(url, 'wss://jarvis.example/api/terminal/test-terminal/input-stream');
    assert.deepEqual(protocols, ['jarvis-terminal-v1', 'csrf.' + 'a'.repeat(64)]);
    return socket;
  }, call: async (path, body) => { calls.push({ path, ...body }); }, onError: error => errors.push(error), ...options });
  t.after(() => input.close());
  return { input, socket, errors, calls };
}

test('continuous input sends subsequent keys immediately without waiting for acknowledgements', t => {
  const f = fixture(t);
  f.input.write('a');
  assert.equal(f.socket.sent.length, 0, 'input waits for authenticated ready');
  f.socket.message({ type: 'ready' });
  f.input.write('b'); f.input.write('\x03');
  assert.deepEqual(f.socket.sent, [{ type: 'input', sequence: 1, data: 'a' }, { type: 'input', sequence: 2, data: 'b' }, { type: 'input', sequence: 3, data: '\x03' }]);
  assert.equal(f.calls.length, 0, 'no per-key HTTP on fast path');
  for (let sequence = 1; sequence <= 3; sequence++) f.socket.message({ type: 'ack', sequence });
  assert.deepEqual(f.errors, []);
});

test('large Unicode pastes preserve pairs and order within a bounded sliding window', t => {
  const f = fixture(t), text = 'a'.repeat(2047) + '🐕'.repeat(9000);
  f.socket.message({ type: 'ready' });
  assert.equal(f.input.write(text), true);
  let acknowledged = 0;
  while (acknowledged < f.socket.sent.length) {
    const packet = f.socket.sent[acknowledged++];
    assert.ok(Buffer.byteLength(packet.data) <= 8192);
    assert.ok(!/[\uD800-\uDBFF]$/.test(packet.data), 'chunk must not end in half a pair');
    f.socket.message({ type: 'ack', sequence: packet.sequence });
  }
  assert.equal(f.socket.sent.map(item => item.data).join(''), text);
  assert.deepEqual(f.errors, []);
});

test('blocked WebSocket falls back before sending, with ordered HTTP input', async t => {
  const calls = [], release = [];
  const f = fixture(t, { call: async (path, { body }) => { calls.push(body.data); await new Promise(resolve => release.push(resolve)); } });
  f.input.write('first'); f.socket.onerror(); f.input.write('second');
  assert.deepEqual(calls, ['first']);
  release.shift()(); await delay(0);
  assert.deepEqual(calls, ['first', 'second']);
  release.shift()(); await delay(0);
  assert.equal(f.socket.sent.length, 0);
  assert.deepEqual(f.errors, []);
});

test('lost acknowledgements fail closed without replaying potentially executed commands', t => {
  const f = fixture(t);
  f.socket.message({ type: 'ready' });
  f.input.write('command\r'); f.socket.close();
  assert.equal(f.errors.length, 1);
  assert.match(f.errors[0].message, /Parte da digitação pode ter sido enviada/);
  assert.equal(f.calls.length, 0);
  assert.equal(f.input.write('more'), false);
});

test('invalid ACK sequence, input limits and explicit disposal cannot send late data', t => {
  const f = fixture(t);
  f.socket.message({ type: 'ready' });
  assert.equal(f.input.write('x'.repeat(32769)), false);
  f.input.write('x'); f.socket.message({ type: 'ack', sequence: 2 });
  assert.equal(f.errors.length, 1);
  const clean = fixture(t);
  clean.input.write('buffered'); clean.input.close(); clean.socket.message({ type: 'ready' });
  assert.equal(clean.socket.sent.length, 0);
  assert.deepEqual(clean.errors, []);
});
