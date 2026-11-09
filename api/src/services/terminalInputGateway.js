import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';

const PATH = /^\/api\/terminal\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\/input-stream$/i;
const PROTOCOL = 'jarvis-terminal-v1';
const MAX_INPUT = 8192;
const MAX_QUEUED_BYTES = 32768;
const MAX_QUEUED_PACKETS = 256;
const MAX_RESPONSE_BUFFER = 65536;

function equalToken(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function messageFor(status) {
  if (status === 401) return 'Sua sessão expirou. Entre novamente.';
  if (status === 403) return 'A sessão do terminal não foi autorizada. Atualize a página.';
  if ([404, 409, 410].includes(status)) return 'O terminal foi encerrado ou desconectado. Abra uma nova sessão.';
  if (status === 429) return 'O terminal está ocupado. Aguarde antes de continuar.';
  return 'Não foi possível enviar a entrada ao terminal. A entrada não será repetida automaticamente.';
}

/**
 * A persistent browser input channel in front of the existing authenticated API.
 * The API remains responsible for session ownership, expiry, CSRF and PTY writes.
 * Only requests over loopback are serialized; browser packets never wait for an ACK.
 */
export function createTerminalInputGateway({ origin, apiBase, heartbeatMs = 15000, authIntervalMs = 30000, requestTimeoutMs = 5000, maxConnections = 32 } = {}) {
  const publicUrl = new URL(origin);
  const upstream = new URL(apiBase);
  if (publicUrl.origin !== origin || !['http:', 'https:'].includes(publicUrl.protocol)) throw new Error('Origem do terminal inválida.');
  if (upstream.protocol !== 'http:' || !['127.0.0.1', '[::1]', 'localhost'].includes(upstream.hostname) || upstream.pathname !== '/' || upstream.search || upstream.hash || upstream.username || upstream.password) throw new Error('A API do terminal deve usar uma origem HTTP em loopback.');
  const clients = new Map(), upgrading = new Map();
  const websocket = new WebSocketServer({ noServer: true, maxPayload: 24 * 1024, perMessageDeflate: false, clientTracking: false, handleProtocols: protocols => protocols.has(PROTOCOL) ? PROTOCOL : false });
  let closing = false;

  async function apiRequest(path, { cookie, csrf, method = 'GET', body, signal } = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, requestTimeoutMs); timer.unref();
    try {
      const response = await fetch(new URL(path, upstream), {
        method, redirect: 'error', signal: controller.signal,
        headers: { Cookie: cookie, Origin: origin, ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await response.text();
      if (text.length > 16384) throw new Error('Resposta da API excedeu o limite.');
      let data = null; try { data = JSON.parse(text); } catch {}
      return { status: response.status, ok: response.ok, data };
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }

  async function authenticate(cookie, csrf, signal) {
    const response = await apiRequest('/api/auth/me', { cookie, signal });
    if (!response.ok || !response.data?.user || !equalToken(response.data.csrfToken, csrf)) return response.ok ? 403 : response.status === 401 ? 401 : 503;
    return 200;
  }

  function rejectUpgrade(socket, status) {
    const labels = { 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 429: 'Too Many Requests', 503: 'Service Unavailable' };
    socket.end(`HTTP/1.1 ${status} ${labels[status] || 'Bad Request'}\r\nConnection: close\r\nContent-Length: 0\r\nCache-Control: no-store\r\n\r\n`);
  }

  function cleanup(ws) {
    const state = clients.get(ws);
    if (!state) return;
    state.closed = true; state.queue = []; state.pendingBytes = 0;
    state.controller.abort(); clearTimeout(state.closeTimer); clients.delete(ws);
  }

  function fail(ws, status, error = messageFor(status), code = 1008) {
    const state = clients.get(ws);
    if (!state || state.closed) return;
    state.closed = true; state.queue = []; state.pendingBytes = 0; state.controller.abort();
    if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < MAX_RESPONSE_BUFFER) {
      ws.send(JSON.stringify({ type: 'error', status, error }));
      ws.close(code, 'Terminal input interrupted');
      state.closeTimer = setTimeout(() => ws.terminate(), 1000); state.closeTimer.unref();
    } else ws.terminate();
  }

  function send(ws, value) {
    const state = clients.get(ws);
    if (!state || state.closed || ws.readyState !== WebSocket.OPEN) return false;
    if (ws.bufferedAmount > MAX_RESPONSE_BUFFER) { fail(ws, 503, 'A conexão está lenta demais. Reabra o terminal.', 1013); return false; }
    ws.send(JSON.stringify(value), error => { if (error) ws.terminate(); });
    return true;
  }

  async function drain(ws, state) {
    if (state.sending || state.closed) return;
    state.sending = true;
    try {
      while (!state.closed && state.queue.length) {
        const packet = state.queue.shift();
        const response = await apiRequest(`/api/terminal/${state.terminalId}/input`, { cookie: state.cookie, csrf: state.csrf, method: 'POST', body: { data: packet.data }, signal: state.controller.signal });
        if (state.closed) return;
        state.pendingBytes -= packet.bytes;
        if (!response.ok) { fail(ws, response.status); return; }
        if (!send(ws, { type: 'ack', sequence: packet.sequence })) return;
      }
    } catch { if (!state.closed) fail(ws, 503, messageFor(503), 1011); }
    finally { state.sending = false; }
  }

  function connected(ws, { terminalId, cookie, csrf }) {
    const state = { terminalId, cookie, csrf, sequence: 0, pendingBytes: 0, queue: [], sending: false, closed: false, controller: new AbortController(), alive: true, authenticatedAt: Date.now(), checkingAuth: false, closeTimer: null };
    clients.set(ws, state);
    ws.on('pong', () => { state.alive = true; });
    ws.on('close', () => cleanup(ws));
    ws.on('error', () => { cleanup(ws); ws.terminate(); });
    ws.on('message', (value, binary) => {
      if (state.closed) return;
      let packet;
      try { if (binary) throw new Error(); packet = JSON.parse(value.toString()); } catch { fail(ws, 400, 'Mensagem do terminal inválida.'); return; }
      if (packet?.type !== 'input' || !Number.isSafeInteger(packet.sequence) || packet.sequence <= state.sequence || typeof packet.data !== 'string' || !packet.data.length) { fail(ws, 400, 'Entrada ou sequência do terminal inválida.'); return; }
      const bytes = Buffer.byteLength(packet.data);
      if (bytes > MAX_INPUT) { fail(ws, 413, 'Envie até 8 KB de entrada por vez.'); return; }
      if (state.pendingBytes + bytes > MAX_QUEUED_BYTES || state.queue.length >= MAX_QUEUED_PACKETS) { fail(ws, 429, 'Há entrada demais aguardando envio. Reabra o terminal para continuar.', 1013); return; }
      state.sequence = packet.sequence; state.pendingBytes += bytes;
      state.queue.push({ sequence: packet.sequence, data: packet.data, bytes });
      void drain(ws, state);
    });
    send(ws, { type: 'ready' });
  }

  async function handleUpgrade(req, socket, head) {
    const match = PATH.exec(req.url || '');
    const cookie = req.headers.cookie;
    const protocols = String(req.headers['sec-websocket-protocol'] || '').split(',').map(value => value.trim());
    const csrfProtocols = protocols.filter(value => /^csrf\.[a-f0-9]{64}$/.test(value));
    if (closing) return rejectUpgrade(socket, 503);
    if (!match) return rejectUpgrade(socket, 404);
    if (req.headers.origin !== origin) return rejectUpgrade(socket, 403);
    if (typeof cookie !== 'string' || !cookie.length || cookie.length > 8192) return rejectUpgrade(socket, 401);
    if (protocols.length !== 2 || !protocols.includes(PROTOCOL) || csrfProtocols.length !== 1) return rejectUpgrade(socket, 403);
    if (clients.size + upgrading.size >= maxConnections) return rejectUpgrade(socket, 429);
    const csrf = csrfProtocols[0].slice(5);
    const controller = new AbortController();
    upgrading.set(socket, controller);
    socket.on('error', () => { controller.abort(); socket.destroy(); });
    const disconnected = () => { controller.abort(); upgrading.delete(socket); };
    socket.once('close', disconnected);
    try {
      const status = await authenticate(cookie, csrf, controller.signal);
      if (socket.destroyed || controller.signal.aborted) return;
      if (status !== 200) return rejectUpgrade(socket, [401, 403].includes(status) ? status : 503);
      if (closing) return rejectUpgrade(socket, 503);
      upgrading.delete(socket);
      websocket.handleUpgrade(req, socket, head, ws => connected(ws, { terminalId: match[1].toLowerCase(), cookie, csrf }));
    } catch { if (!socket.destroyed) rejectUpgrade(socket, 503); }
    finally { upgrading.delete(socket); }
  }

  const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'GET' && req.url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true,"service":"terminal-input"}'); }
    else { res.writeHead(404); res.end(); }
  });
  server.on('upgrade', handleUpgrade);
  const heartbeat = setInterval(() => {
    for (const [ws, state] of clients) {
      if (state.closed) continue;
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (!state.alive) { ws.terminate(); continue; }
      state.alive = false; ws.ping();
      if (!state.checkingAuth && Date.now() - state.authenticatedAt >= authIntervalMs) {
        state.checkingAuth = true;
        void authenticate(state.cookie, state.csrf, state.controller.signal).then(status => {
          if (state.closed) return;
          if (status !== 200) fail(ws, status);
          else state.authenticatedAt = Date.now();
        }).catch(() => { if (!state.closed) fail(ws, 503, messageFor(503), 1011); }).finally(() => { state.checkingAuth = false; });
      }
    }
  }, heartbeatMs);
  heartbeat.unref();

  async function close() {
    if (closing) return;
    closing = true; clearInterval(heartbeat);
    for (const [socket, controller] of upgrading) { controller.abort(); socket.destroy(); }
    upgrading.clear();
    for (const ws of clients.keys()) { cleanup(ws); ws.terminate(); }
    await new Promise(resolve => websocket.close(resolve));
    if (server.listening) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  }
  return { server, handleUpgrade, close };
}
