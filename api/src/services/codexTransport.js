import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const MAX_LINE_BYTES = 40 * 1024 * 1024;

// npm installs a .cmd shim on Windows, which cannot be spawned without a shell.
// Resolve the package entry point instead: arguments and paths remain separate.
export function codexLaunch(bin = 'codex') {
  // Enable the speed selector for this process without choosing a faster tier
  // or changing the remote user's persistent configuration.
  const args = ['-c', 'features.fast_mode=true', 'app-server'];
  if (/\.(?:mjs|cjs|js)$/i.test(bin)) return { command: process.execPath, args: [bin, ...args] };
  if (process.platform !== 'win32' && !/\.(?:cmd|bat)$/i.test(bin)) return { command: bin, args };
  if (process.platform === 'win32' && /\.exe$/i.test(bin)) return { command: bin, args };
  const dirs = path.isAbsolute(bin) || bin.includes('/') || bin.includes('\\')
    ? [path.dirname(path.resolve(bin))]
    : (process.env.PATH || '').split(path.delimiter).filter(Boolean).map(p => p.replace(/^"|"$/g, ''));
  for (const dir of dirs) {
    const entry = path.join(dir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    if (existsSync(entry)) return { command: process.execPath, args: [entry, ...args] };
    const native = path.join(dir, 'codex.exe');
    if (process.platform === 'win32' && existsSync(native)) return { command: native, args };
  }
  if (/\.(?:cmd|bat)$/i.test(bin) || bin === 'codex') {
    throw new Error('Codex não encontrado. Instale @openai/codex ou defina CODEX_BIN com o caminho de codex.exe ou bin/codex.js.');
  }
  return { command: bin, args };
}

function childEnvironment(home) {
  const env = { ...process.env, CODEX_HOME: home };
  for (const key of Object.keys(env)) {
    if (/^(JARVIS_|SESSION_|OPENAI_API_KEY$)/i.test(key)) delete env[key];
  }
  return env;
}

export class CodexTransport extends EventEmitter {
  constructor({ bin = 'codex', cwd = process.cwd(), home, apiKey, model, sandbox = 'workspace-write', spawnProcess = spawn, requestTimeoutMs = 30_000 } = {}) {
    super();
    this.options = { bin, cwd, home: home || path.join(cwd, 'data', 'codex'), apiKey, model, sandbox };
    this.spawnProcess = spawnProcess;
    this.requestTimeoutMs = requestTimeoutMs;
    this.ready = false;
    this.child = null;
    this.starting = null;
    this.sequence = 0;
    this.pending = new Map();
    this.closing = false;
  }

  safeError(message) {
    let text = String(message || 'Falha na comunicação com o Codex.');
    if (this.options.apiKey) text = text.split(this.options.apiKey).join('[redigido]');
    return text.slice(0, 1000);
  }

  async start() {
    if (this.ready) return;
    if (this.starting) return this.starting;
    this.starting = this.startProcess();
    try { await this.starting; } finally { this.starting = null; }
  }

  async startProcess() {
    if (!this.options.apiKey) throw new Error('Defina OPENAI_API_KEY no servidor para usar o modo Codex.');
    await mkdir(this.options.home, { recursive: true, mode: 0o700 });
    const launch = codexLaunch(this.options.bin);
    this.closing = false;
    let child;
    try {
      child = this.spawnProcess(launch.command, launch.args, {
        cwd: this.options.cwd,
        env: childEnvironment(this.options.home),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        shell: false,
      });
    } catch (error) { throw new Error(this.safeError(`Não foi possível iniciar o Codex: ${error.message}`)); }
    this.child = child;
    let buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      if (this.child !== child) return;
      buffer += chunk;
      if (Buffer.byteLength(buffer) > MAX_LINE_BYTES) {
        this.failed(child, new Error('Resposta do Codex excedeu o limite de transporte.'));
        child.kill('SIGTERM');
        return;
      }
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        let packet;
        try { packet = JSON.parse(line); } catch { continue; } // Non-protocol CLI diagnostics.
        this.receive(packet);
      }
    });
    // Drain diagnostics, but never forward stderr (it may include authentication data).
    child.stderr.on('data', () => {});
    child.stdin.on('error', () => {
      if (this.child === child) this.failed(child, new Error('A conexão de entrada do Codex foi encerrada.'));
    });
    child.on('error', error => this.failed(child, new Error(this.safeError(`Não foi possível iniciar o Codex: ${error.message}`))));
    child.on('exit', (code, signal) => this.failed(child, new Error(`Codex encerrado (${signal || code || 'saída'}).`)));
    try {
      await this.request('initialize', { clientInfo: { name: 'jarvis_web', title: 'Luck Web', version: '3.0.0' } });
      this.send({ method: 'initialized', params: {} });
      await this.request('account/login/start', { type: 'apiKey', apiKey: this.options.apiKey });
      if (this.child !== child) throw new Error('Codex foi encerrado durante a inicialização.');
      this.ready = true;
    } catch (error) {
      this.failed(child, error);
      child.kill('SIGTERM');
      throw error;
    }
  }

  receive(packet) {
    if (!packet || typeof packet !== 'object' || Array.isArray(packet)) return;
    if (typeof packet.method === 'string') {
      if (packet.id !== undefined) this.emit('serverRequest', { id: packet.id, method: packet.method, params: packet.params || {} });
      else this.emit('notification', { method: packet.method, params: packet.params || {} });
      return;
    }
    if (packet.id === undefined) return;
    const key = JSON.stringify(packet.id);
    const pending = this.pending.get(key);
    if (!pending) return;
    this.pending.delete(key);
    clearTimeout(pending.timer);
    if (packet.error) pending.reject(new Error(this.safeError(packet.error.message || 'Erro do Codex.')));
    else pending.resolve(packet.result);
  }

  send(packet) {
    if (!this.child || this.child.stdin.destroyed || !this.child.stdin.writable) throw new Error('Codex não está conectado.');
    this.child.stdin.write(`${JSON.stringify(packet)}\n`);
  }

  request(method, params = {}) {
    const id = ++this.sequence;
    const key = JSON.stringify(id);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(key);
        reject(new Error(`Tempo limite ao aguardar ${method}.`));
      }, this.requestTimeoutMs);
      this.pending.set(key, { resolve, reject, timer });
      try { this.send({ id, method, params }); } catch (error) {
        clearTimeout(timer);
        this.pending.delete(key);
        reject(error);
      }
    });
  }

  response(id, result) { this.send({ id, result }); }
  rejectRequest(id, message = 'Recurso não suportado por este cliente.') {
    this.send({ id, error: { code: -32601, message } });
  }

  failed(child, error) {
    if (this.child !== child) return;
    this.child = null;
    this.ready = false;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); }
    this.pending.clear();
    if (!this.closing) this.emit('offline', error);
  }

  async close() {
    const child = this.child;
    this.closing = true;
    if (!child) return;
    this.failed(child, new Error('Conexão com o Codex encerrada.'));
    await new Promise(resolve => {
      let finished = false;
      let terminate;
      let force;
      const done = () => {
        if (finished) return;
        finished = true;
        clearTimeout(terminate);
        clearTimeout(force);
        resolve();
      };
      child.once('exit', done);
      child.once('error', done);
      child.stdin.end();
      terminate = setTimeout(() => child.kill('SIGTERM'), 500);
      force = setTimeout(() => { child.kill('SIGKILL'); done(); }, 3000);
      terminate.unref?.();
      force.unref?.();
    });
  }
}
