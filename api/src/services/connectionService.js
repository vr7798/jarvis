import net from 'node:net';
import { probeHost } from './sshTransport.js';

const failure = (message, status = 400) => Object.assign(new Error(message), { status, expose: true });

export function validateTarget(body = {}) {
  const host = typeof body.host === 'string' ? body.host.trim() : '';
  const port = Number(body.port ?? 22);
  if (!host || host.length > 253 || (!net.isIP(host) && !/^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?$/.test(host))) throw failure('Informe um IP ou nome de servidor válido, sem http:// ou https://.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw failure('Informe uma porta SSH de 1 a 65535.');
  return { host: host.toLowerCase(), port };
}

export class ConnectionService {
  owner = null;
  connecting = false;
  closing = false;
  constructor(config, chat, events, { probe = probeHost } = {}) {
    this.config = config;
    this.chat = chat;
    this.events = events;
    this.probeRemote = probe;
    this.transport = chat.transport;
    this.transport.on('offline', () => { this.clearOwner(); this.events.publish(); });
    this.transport.on('disconnected', () => { this.clearOwner(); this.events.publish(); });
  }
  clearOwner() { clearTimeout(this.expiry); this.expiry = null; this.owner = null; }
  status(sessionId) {
    const status = this.chat.status();
    if (this.config.mode !== 'ssh') return status;
    const own = this.owner === sessionId;
    return { ...status, connected: own && Boolean(this.transport.ready), workspace: own ? status.workspace : null,
      connection: own && this.transport.ready ? this.transport.endpoint : null,
      busy: this.chat.isBusy(), ownedByAnotherSession: Boolean(this.owner && !own),
      detail: this.owner && !own ? 'Há uma conexão SSH aberta em outra sessão. Desconecte naquela sessão primeiro.' : this.connecting ? 'Conectando à VPS…' : status.detail };
  }
  ensureSsh() { if (this.config.mode !== 'ssh') throw failure('Configure CODEX_MODE=ssh e reinicie a API para usar SSH.', 409); }
  ensureOwner(sessionId) {
    if (this.config.mode !== 'ssh') return;
    if (this.owner !== sessionId || !this.transport.ready || this.closing) throw failure('Conecte sua VPS nesta sessão antes de continuar.', 409);
  }
  async probe(body) {
    this.ensureSsh();
    const target = validateTarget(body);
    try { return await this.probeRemote(target); }
    catch { throw failure('Não foi possível verificar o servidor SSH. Confira o endereço, a porta e a conexão de rede.', 502); }
  }
  async connect(sessionId, expiresAt, body = {}) {
    this.ensureSsh();
    if (this.owner || this.connecting || this.closing || this.chat.isBusy()) throw failure('Já existe uma conexão ou tarefa em andamento. Desconecte antes de trocar o servidor.', 409);
    const { host, port } = validateTarget(body);
    const { username, password, fingerprint, workspace } = body;
    if (typeof username !== 'string' || !/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,63}$/.test(username)) throw failure('Informe um usuário SSH válido.');
    if (typeof password !== 'string' || !password.length || password.length > 1024) throw failure('Informe a senha SSH.');
    if (typeof fingerprint !== 'string' || !/^SHA256:[A-Za-z0-9+/]{43}$/.test(fingerprint)) throw failure('Verifique e confirme a impressão digital do servidor primeiro.');
    if (typeof workspace !== 'string' || !workspace.startsWith('/') || workspace.length > 2048 || /[\x00-\x1f\x7f]/.test(workspace)) throw failure('A pasta na VPS deve ser um caminho Linux absoluto, por exemplo /root/codex.');
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw failure('Sua sessão expirou. Faça login novamente.', 401);
    this.owner = sessionId;
    this.connecting = true;
    this.expiry = setTimeout(() => { this.releaseSession(sessionId).catch(() => {}); }, expiresAt - Date.now());
    this.expiry.unref();
    this.events.publish();
    try {
      this.transport.configure({ host, port, username, password, fingerprint, workspace, bin: this.config.bin || 'codex' });
      await this.transport.start();
      if (this.owner !== sessionId || this.closing) throw failure('A sessão foi encerrada durante a conexão.', 409);
      this.chat.resetConnection();
      return this.status(sessionId);
    } catch (err) {
      await this.transport.close();
      this.clearOwner();
      const message = String(err.message || 'Falha na conexão SSH.').split(password).join('[senha removida]').slice(0, 600);
      throw failure(message, err.status || 502);
    } finally { this.connecting = false; this.events.publish(); }
  }
  async disconnect(sessionId, force = false) {
    this.ensureSsh();
    if (this.owner !== sessionId) throw failure('Esta conexão pertence a outra sessão ou já foi encerrada.', 409);
    if (!force && this.chat.isBusy()) throw failure('Interrompa a tarefa antes de desconectar a VPS.', 409);
    this.closing = true;
    try { await this.chat.disconnect(); }
    finally { this.clearOwner(); this.closing = false; this.events.publish(); }
  }
  async releaseSession(sessionId) {
    if (this.config.mode === 'ssh' && this.owner === sessionId) await this.disconnect(sessionId, true);
  }
  async close() { clearTimeout(this.expiry); if (this.owner) await this.releaseSession(this.owner); }
}
