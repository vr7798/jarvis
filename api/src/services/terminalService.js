import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { quotePosix } from './sshTransport.js';

const MAX_REPLAY = 128 * 1024;
const MAX_INPUT = 8192;
const IDLE_MS = 30 * 60 * 1000;
const failure = (message, status = 400) => Object.assign(new Error(message), { status, expose: true });

function dimensions(body = {}) {
  const cols = Number(body.cols ?? 100), rows = Number(body.rows ?? 28);
  if (!Number.isInteger(cols) || cols < 20 || cols > 300 || !Number.isInteger(rows) || rows < 5 || rows > 120) throw failure('Dimensões do terminal inválidas.');
  return { cols, rows };
}

/** One PTY on the already authenticated SSH connection; never spawns a local root shell. */
export class TerminalService {
  sessions = new Map();
  constructor({ config, connection, chat }) {
    this.config = config;
    this.connection = connection;
    this.transport = chat.transport;
    this.shutdown = () => this.close();
    this.transport.on('offline', this.shutdown);
    this.transport.on('disconnected', this.shutdown);
    this.heartbeat = setInterval(() => {
      for (const terminal of this.sessions.values()) {
        if (terminal.expiresAt <= Date.now() || terminal.touchedAt + IDLE_MS <= Date.now()) { this.end(terminal, 'Sessão do terminal encerrada. Abra novamente para continuar.'); continue; }
        for (const res of terminal.clients) {
          if (!res.write(': heartbeat\n\n')) { terminal.clients.delete(res); res.end(); }
        }
      }
    }, 15000);
    this.heartbeat.unref();
  }
  ensureConnection(sessionId) {
    if (this.config.mode !== 'ssh') throw failure('O terminal manual está disponível após conectar sua VPS por SSH.', 409);
    this.connection.ensureOwner(sessionId);
    const client = this.transport.connection;
    if (!client || typeof client.shell !== 'function') throw failure('A conexão SSH não oferece um terminal interativo. Reconecte a VPS.', 409);
    return client;
  }
  get(id, sessionId) {
    const terminal = this.sessions.get(id);
    if (!terminal || terminal.owner !== sessionId) throw failure('Terminal não encontrado nesta sessão.', 404);
    const client = this.ensureConnection(sessionId);
    if (terminal.client !== client || terminal.expiresAt <= Date.now()) { this.end(terminal); throw failure('O terminal foi encerrado. Abra uma nova sessão.', 410); }
    terminal.touchedAt = Date.now();
    return terminal;
  }
  async open(sessionId, body, expiresAt) {
    const client = this.ensureConnection(sessionId);
    const size = dimensions(body);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw failure('Sua sessão expirou. Entre novamente.', 401);
    for (const terminal of this.sessions.values()) if (terminal.owner === sessionId) this.end(terminal, 'Terminal substituído por uma nova sessão.');
    if (this.sessions.size >= 2) throw failure('Há um terminal sendo inicializado. Tente novamente.', 409);
    const terminal = { id: randomUUID(), owner: sessionId, client, stream: null, clients: new Set(), replay: [], bytes: 0, sequence: 0, touchedAt: Date.now(), expiresAt, closed: false };
    this.sessions.set(terminal.id, terminal);
    try {
      const stream = await new Promise((resolve, reject) => {
        let finished = false;
        const timeout = setTimeout(() => { if (!finished) { finished = true; reject(failure('Tempo limite ao abrir o terminal SSH.', 504)); } }, 10000);
        timeout.unref();
        client.shell({ term: 'xterm-256color', ...size }, (error, channel) => {
          clearTimeout(timeout);
          if (finished) { channel?.close(); return; }
          finished = true;
          if (error) return reject(failure('Não foi possível abrir o terminal SSH.', 502));
          if (terminal.closed || this.transport.connection !== client) { channel.close(); return reject(failure('A conexão SSH foi encerrada.', 409)); }
          resolve(channel);
        });
      });
      terminal.stream = stream;
      stream.setEncoding?.('utf8'); stream.stderr?.setEncoding?.('utf8');
      stream.on('data', data => this.output(terminal, data));
      stream.stderr?.on('data', data => this.output(terminal, data));
      stream.on('error', () => this.end(terminal, 'O canal do terminal encontrou um erro. Conecte novamente.'));
      stream.on('close', () => this.end(terminal, 'Terminal encerrado.'));
      stream.on('exit', code => { terminal.exitCode = code; });
      const workspace = this.transport.endpoint?.workspace;
      if (workspace) stream.write(`cd -- ${quotePosix(workspace)}\r`);
      return { id: terminal.id, ...size, username: this.transport.endpoint?.username || '', workspace: workspace || '' };
    } catch (error) { this.end(terminal); throw error; }
  }
  output(terminal, value) {
    if (terminal.closed) return;
    // Cap each event as well as total replay so a single command cannot retain huge output.
    const text = Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
    for (let offset = 0; offset < text.length; offset += 16384) {
      const event = { id: ++terminal.sequence, data: text.slice(offset, offset + 16384) };
      terminal.replay.push(event); terminal.bytes += Buffer.byteLength(event.data);
      while (terminal.bytes > MAX_REPLAY && terminal.replay.length > 1) terminal.bytes -= Buffer.byteLength(terminal.replay.shift().data);
      const packet = `id: ${event.id}\nevent: output\ndata: ${JSON.stringify({ data: event.data })}\n\n`;
      for (const res of terminal.clients) if (!res.write(packet)) { terminal.clients.delete(res); res.end(); }
    }
  }
  events(req, res) {
    const terminal = this.get(req.params.terminalId, req.sessionID);
    if (terminal.clients.size >= 2) throw failure('Este terminal já está aberto em outra janela.', 409);
    res.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    const last = Number(req.get('last-event-id') || 0);
    for (const event of terminal.replay) if (event.id > last) {
      if (!res.write(`id: ${event.id}\nevent: output\ndata: ${JSON.stringify({ data: event.data })}\n\n`)) { res.end(); return; }
    }
    res.write('event: ready\ndata: {}\n\n');
    terminal.clients.add(res);
    req.on('close', () => terminal.clients.delete(res));
  }
  async input(id, sessionId, value) {
    const terminal = this.get(id, sessionId);
    if (typeof value !== 'string' || !value.length || Buffer.byteLength(value) > MAX_INPUT) throw failure('Envie até 8 KB de entrada por vez ao terminal.');
    if (!terminal.stream?.writable) throw failure('O terminal foi encerrado.', 410);
    if (!terminal.stream.write(value)) await new Promise((resolve, reject) => {
      const stream = terminal.stream;
      const done = error => { clearTimeout(timer); stream.removeListener('drain', drain); stream.removeListener('close', closed); error ? reject(error) : resolve(); };
      const drain = () => done();
      const closed = () => done(failure('O terminal foi encerrado.', 410));
      const timer = setTimeout(() => done(failure('O terminal está ocupado. Aguarde um instante.', 503)), 5000);
      stream.once('drain', drain); stream.once('close', closed);
    });
  }
  resize(id, sessionId, body) {
    const terminal = this.get(id, sessionId), { cols, rows } = dimensions(body);
    if (!terminal.stream || terminal.closed) throw failure('O terminal foi encerrado.', 410);
    terminal.stream.setWindow(rows, cols, 0, 0);
  }
  end(terminal, message = 'Terminal encerrado.') {
    if (!terminal || terminal.closed) return;
    terminal.closed = true;
    this.sessions.delete(terminal.id);
    for (const res of terminal.clients) { res.write(`event: closed\ndata: ${JSON.stringify({ message, exitCode: terminal.exitCode ?? null })}\n\n`); res.end(); }
    terminal.clients.clear(); terminal.replay = []; terminal.bytes = 0;
    try { terminal.stream?.end(); terminal.stream?.close(); } catch {}
  }
  disconnect(sessionId) { for (const terminal of this.sessions.values()) if (terminal.owner === sessionId) this.end(terminal); }
  close() { for (const terminal of this.sessions.values()) this.end(terminal); }
  dispose() { this.close(); clearInterval(this.heartbeat); this.transport.removeListener('offline', this.shutdown); this.transport.removeListener('disconnected', this.shutdown); }
}

export function createTerminalRouter(options) {
  const service = new TerminalService(options), router = Router();
  router.post('/terminal/open', async (req, res) => res.status(201).json(await service.open(req.sessionID, req.body, new Date(req.session.cookie.expires).getTime())));
  router.get('/terminal/:terminalId/events', (req, res) => service.events(req, res));
  router.post('/terminal/:terminalId/input', async (req, res) => { await service.input(req.params.terminalId, req.sessionID, req.body?.data); res.json({ ok: true }); });
  router.post('/terminal/:terminalId/resize', (req, res) => { service.resize(req.params.terminalId, req.sessionID, req.body); res.json({ ok: true }); });
  router.delete('/terminal/:terminalId', (req, res) => { const terminal = service.get(req.params.terminalId, req.sessionID); service.end(terminal); res.json({ ok: true }); });
  return { router, service, close: () => service.dispose() };
}
