import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createTerminalInputGateway } from '../src/services/terminalInputGateway.js';

const origin = 'http://localhost:5173';
const csrf = 'a'.repeat(64);
const terminalId = '12345678-1234-4234-8234-123456789abc';
const otherTerminalId = '12345678-1234-4234-8234-123456789abd';
const cookie = 'jarvis.sid=test-owner-only';

async function until(predicate, timeout = 1500) {
  const start = Date.now();
  while (!predicate()) { if (Date.now() - start > timeout) throw new Error('Timed out waiting for terminal gateway'); await delay(5); }
}

async function fixture(t, options = {}) {
  const state = { calls: [], inputs: [], active: 0, maxActive: 0, revoked: false, inputStatus: 200, responseDelay: 0, authDelay: 0 };
  const upstream = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();
    state.calls.push({ path: req.url, headers: req.headers, body });
    const authenticated = !state.revoked && req.headers.cookie === cookie;
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/auth/me') {
      if (state.authDelay) await delay(state.authDelay);
      res.writeHead(authenticated ? 200 : 401); res.end(JSON.stringify(authenticated ? { user: { username: 'owner' }, csrfToken: csrf } : { error: 'No session' })); return;
    }
    if (!authenticated || req.headers['x-csrf-token'] !== csrf || req.headers.origin !== origin) { res.writeHead(403); res.end('{}'); return; }
    if (req.url !== `/api/terminal/${terminalId}/input`) { res.writeHead(404); res.end('{}'); return; }
    state.active++; state.maxActive = Math.max(state.maxActive, state.active);
    state.inputs.push(JSON.parse(body).data);
    if (state.responseDelay) await delay(state.responseDelay);
    state.active--;
    res.writeHead(state.inputStatus); res.end(JSON.stringify({ ok: state.inputStatus === 200, error: 'upstream private diagnostics must never be returned' }));
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const gateway = createTerminalInputGateway({ origin, apiBase: `http://127.0.0.1:${upstream.address().port}`, ...options });
  gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening');
  const url = `ws://127.0.0.1:${gateway.server.address().port}/api/terminal/${terminalId}/input-stream`;
  const sockets = [];
  t.after(async () => {
    for (const ws of sockets) ws.terminate();
    await gateway.close(); upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve));
  });
  async function connect({ target = url, headers = {}, protocols = ['jarvis-terminal-v1', `csrf.${csrf}`] } = {}) {
    const ws = new WebSocket(target, protocols, { headers: { Origin: origin, Cookie: cookie, ...headers } });
    sockets.push(ws);
    const packets = []; ws.on('message', value => packets.push(JSON.parse(value.toString())));
    await once(ws, 'open'); await until(() => packets.some(packet => packet.type === 'ready'));
    return { ws, packets };
  }
  async function rejected({ headers = {}, protocols = ['jarvis-terminal-v1', `csrf.${csrf}`], target = url } = {}) {
    const ws = new WebSocket(target, protocols, { headers: { Origin: origin, Cookie: cookie, ...headers } });
    sockets.push(ws); ws.on('error', () => {});
    return new Promise(resolve => { ws.once('unexpected-response', (req, res) => { const status = res.statusCode; res.resume(); ws.terminate(); resolve(status); }); });
  }
  return { state, gateway, upstream, url, connect, rejected };
}

test('gateway upgrade enforces origin, cookie and CSRF without putting credentials in the URL', async t => {
  const f = await fixture(t);
  assert.equal(await f.rejected({ headers: { Origin: 'https://foreign.example' } }), 403);
  assert.equal(await f.rejected({ headers: { Cookie: '' } }), 401);
  assert.equal(await f.rejected({ headers: { Cookie: 'jarvis.sid=invalid' } }), 401);
  assert.equal(await f.rejected({ protocols: ['jarvis-terminal-v1', `csrf.${'b'.repeat(64)}`] }), 403);
  assert.equal(await f.rejected({ protocols: ['jarvis-terminal-v1'] }), 403);
  assert.equal(await f.rejected({ target: f.url + '?token=forbidden' }), 404);
  const { ws } = await f.connect();
  assert.equal(ws.protocol, 'jarvis-terminal-v1');
  assert.ok(f.state.calls.every(call => !call.path.includes(csrf)));
});

test('gateway accepts queued browser packets without ACK waits and serializes authoritative API writes', async t => {
  const f = await fixture(t); f.state.responseDelay = 40;
  const { ws, packets } = await f.connect();
  for (const [index, data] of ['a', '\t', 'ç😀', '\x03', '\r'].entries()) ws.send(JSON.stringify({ type: 'input', sequence: index + 1, data }));
  await until(() => packets.filter(packet => packet.type === 'ack').length === 5);
  assert.deepEqual(f.state.inputs, ['a', '\t', 'ç😀', '\x03', '\r']);
  assert.deepEqual(packets.filter(packet => packet.type === 'ack').map(packet => packet.sequence), [1, 2, 3, 4, 5]);
  assert.equal(f.state.maxActive, 1);
  for (const call of f.state.calls.filter(call => call.path.endsWith('/input'))) {
    assert.equal(call.headers.cookie, cookie); assert.equal(call.headers['x-csrf-token'], csrf); assert.equal(call.headers.origin, origin);
  }
});

test('gateway rejects foreign terminal and drops remaining queue on authoritative API error without replay', async t => {
  const f = await fixture(t);
  const other = await f.connect({ target: f.url.replace(terminalId, otherTerminalId) });
  other.ws.send(JSON.stringify({ type: 'input', sequence: 1, data: 'x' }));
  await until(() => other.packets.some(packet => packet.type === 'error'));
  assert.equal(other.packets.at(-1).status, 404); assert.equal(f.state.inputs.length, 0);
  f.state.inputStatus = 409; f.state.responseDelay = 30;
  const { ws, packets } = await f.connect();
  ws.send(JSON.stringify({ type: 'input', sequence: 1, data: 'possibly-executed' }));
  ws.send(JSON.stringify({ type: 'input', sequence: 2, data: 'must-not-execute' }));
  await until(() => packets.some(packet => packet.type === 'error'));
  assert.deepEqual(f.state.inputs, ['possibly-executed']);
  assert.equal(packets.at(-1).status, 409);
  assert.ok(!JSON.stringify(packets).includes('private diagnostics'));
  await delay(60); assert.deepEqual(f.state.inputs, ['possibly-executed']);
});

test('gateway bounds packet size, queued bytes and sequence ordering', async t => {
  const f = await fixture(t); f.state.responseDelay = 80;
  const oversized = await f.connect();
  oversized.ws.send(JSON.stringify({ type: 'input', sequence: 1, data: 'x'.repeat(8193) }));
  await until(() => oversized.packets.some(packet => packet.type === 'error'));
  assert.equal(oversized.packets.at(-1).status, 413); assert.equal(f.state.inputs.length, 0);
  const repeated = await f.connect();
  repeated.ws.send(JSON.stringify({ type: 'input', sequence: 1, data: 'x' }));
  repeated.ws.send(JSON.stringify({ type: 'input', sequence: 1, data: 'repeat' }));
  await until(() => repeated.packets.some(packet => packet.type === 'error'));
  assert.equal(repeated.packets.at(-1).status, 400);
  assert.ok(!f.state.inputs.includes('repeat'));
  const overflow = await f.connect();
  for (let sequence = 1; sequence <= 5; sequence++) overflow.ws.send(JSON.stringify({ type: 'input', sequence, data: 'z'.repeat(8192) }));
  await until(() => overflow.packets.some(packet => packet.type === 'error'));
  assert.equal(overflow.packets.at(-1).status, 429);
  await delay(110); assert.ok(f.state.inputs.filter(value => value.startsWith('z')).length <= 1);
});

test('gateway detects logout during idle heartbeat and never retries an input timeout', async t => {
  const f = await fixture(t, { heartbeatMs: 15, authIntervalMs: 15, requestTimeoutMs: 45 });
  const first = await f.connect(); f.state.revoked = true;
  await until(() => first.packets.some(packet => packet.type === 'error'));
  assert.equal(first.packets.at(-1).status, 401);
  f.state.revoked = false;
  const second = await f.connect(); f.state.responseDelay = 200;
  second.ws.send(JSON.stringify({ type: 'input', sequence: 1, data: 'one-only' }));
  await until(() => second.packets.some(packet => packet.type === 'error'));
  assert.equal(second.packets.at(-1).status, 503);
  await delay(100); assert.equal(f.state.inputs.filter(value => value === 'one-only').length, 1);
});

test('gateway bounds pending handshakes and can close without listening on its own server', async t => {
  const f = await fixture(t, { maxConnections: 1 });
  const active = await f.connect();
  assert.equal(await f.rejected(), 429);
  active.ws.terminate();
  const unlistened = createTerminalInputGateway({ origin, apiBase: `http://127.0.0.1:${f.upstream.address().port}` });
  await unlistened.close();
});
