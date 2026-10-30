import net from 'node:net';
import { probeHost } from './sshTransport.js';
import { CredentialVault } from './credentialVault.js';

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
  reconnects = new Map();
  restoreErrors = new Map();
  saveErrors = new Map();
  restoreTokens = new Map();
  connectionEpoch = 0;
  constructor(config, chat, events, { probe = probeHost, vault } = {}) {
    this.config = config;
    this.chat = chat;
    this.events = events;
    this.probeRemote = probe;
    this.transport = chat.transport;
    this.vault = vault || new CredentialVault(config);
    this.transport.on('offline', () => { this.clearOwner(); this.events.publish(); });
    this.transport.on('disconnected', () => { this.clearOwner(); this.events.publish(); });
  }
  clearOwner() { clearTimeout(this.expiry); this.expiry = null; this.owner = null; }
  status(sessionId) {
    const status = this.chat.status();
    if (this.config.mode !== 'ssh') return status;
    const own = this.owner === sessionId;
    const saved = this.vault.inspect();
    return { ...status, connected: own && Boolean(this.transport.ready), workspace: own ? status.workspace : null,
      connection: own && this.transport.ready ? this.transport.endpoint : null,
      busy: this.chat.isBusy(), ownedByAnotherSession: Boolean(this.owner && !own),
      reconnecting: own && this.connecting && !this.transport.ready, savedConnection: saved.profile,
      savedConnectionError: saved.error, autoReconnectError: this.restoreErrors.get(sessionId) || null,
      credentialSaveError: this.saveErrors.get(sessionId) || null,
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
    if (body.remember !== undefined && typeof body.remember !== 'boolean') throw failure('A opção de salvar a conexão deve ser verdadeira ou falsa.');
    if (typeof username !== 'string' || !/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,63}$/.test(username)) throw failure('Informe um usuário SSH válido.');
    if (typeof password !== 'string' || !password.length || password.length > 1024) throw failure('Informe a senha SSH.');
    if (typeof fingerprint !== 'string' || !/^SHA256:[A-Za-z0-9+/]{43}$/.test(fingerprint)) throw failure('Verifique e confirme a impressão digital do servidor primeiro.');
    if (typeof workspace !== 'string' || !workspace.startsWith('/') || workspace.length > 2048 || /[\x00-\x1f\x7f]/.test(workspace)) throw failure('A pasta na VPS deve ser um caminho Linux absoluto, por exemplo /root/codex.');
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw failure('Sua sessão expirou. Faça login novamente.', 401);
    const attempt = ++this.connectionEpoch;
    this.owner = sessionId;
    this.restoreErrors.delete(sessionId);
    this.saveErrors.delete(sessionId);
    this.connecting = true;
    this.expiry = setTimeout(() => { this.releaseSession(sessionId).catch(() => {}); }, expiresAt - Date.now());
    this.expiry.unref();
    this.events.publish();
    try {
      this.transport.configure({ host, port, username, password, fingerprint, workspace, bin: this.config.bin || 'codex' });
      await this.transport.start();
      if (attempt !== this.connectionEpoch || this.owner !== sessionId || this.closing || !this.transport.ready) throw failure('A sessão foi encerrada durante a conexão.', 409);
      this.chat.resetConnection();
      if (body.remember === true) {
        try { this.vault.save({ host, port, username, password, fingerprint, workspace }); }
        catch { this.saveErrors.set(sessionId, 'A VPS está conectada, mas não foi possível salvar as credenciais. Confira as permissões de armazenamento e conecte novamente para salvar.'); }
      }
      return this.status(sessionId);
    } catch (err) {
      // A cancelled handshake may reject after another login already reconnected.
      // Only its own generation may close the transport or clear ownership.
      if (attempt === this.connectionEpoch) {
        await this.transport.close();
        if (attempt === this.connectionEpoch) this.clearOwner();
      }
      const message = String(err.message || 'Falha na conexão SSH.').split(password).join('[senha removida]').slice(0, 600);
      throw failure(message, err.status || 502);
    } finally { if (attempt === this.connectionEpoch) this.connecting = false; this.events.publish(); }
  }
  saved() { this.ensureSsh(); return this.vault.inspect(); }
  forget() { this.ensureSsh(); this.vault.forget(); this.restoreErrors.clear(); this.saveErrors.clear(); this.events.publish(); }
  async reconnect(sessionId, expiresAt) {
    this.ensureSsh();
    if (this.owner === sessionId && this.transport.ready && !this.closing) return this.status(sessionId);
    if (this.reconnects.has(sessionId)) return this.reconnects.get(sessionId);
    const token = { cancelled: false };
    this.restoreTokens.set(sessionId, token);
    const task = (async () => {
      // SSH close cancels startup; let its existing startup promise settle before
      // reconfiguring the same transport for a newly authenticated session.
      if (!this.owner && !this.closing && this.transport.starting) {
        let timer;
        try { await Promise.race([Promise.resolve(this.transport.starting).catch(() => {}), new Promise((_, reject) => { timer = setTimeout(() => reject(failure('A conexão anterior ainda está encerrando. Tente Reconectar em instantes.', 409)), 5000); })]); }
        finally { clearTimeout(timer); }
      }
      if (token.cancelled) throw failure('A sessão foi encerrada durante a reconexão.', 409);
      if (this.owner || this.connecting || this.closing || this.chat.isBusy()) throw failure('Já existe uma conexão ou tarefa em andamento. Desconecte na outra sessão antes de reconectar.', 409);
      const profile = this.vault.load();
      if (!profile) throw failure('Nenhuma conexão foi salva. Conecte a VPS e marque a opção de lembrar.', 404);
      return this.connect(sessionId, expiresAt, { ...profile, remember: false });
    })();
    this.reconnects.set(sessionId, task);
    try { return await task; }
    catch (error) {
      const message = error.status === 409 ? 'A reconexão foi cancelada ou outra sessão está usando a VPS.' : 'Não foi possível reconectar à VPS salva. Confira o servidor, a senha e a impressão digital; conecte manualmente para atualizar o perfil.';
      if (!token.cancelled && expiresAt > Date.now()) this.restoreErrors.set(sessionId, message);
      if (error.status === 404) throw failure('Nenhuma conexão foi salva. Conecte a VPS e marque a opção de lembrar.', 404);
      throw failure(message, error.status || 502);
    } finally { this.reconnects.delete(sessionId); if (this.restoreTokens.get(sessionId) === token) this.restoreTokens.delete(sessionId); this.events.publish(); }
  }
  autoReconnect(sessionId, expiresAt) {
    if (this.config.mode !== 'ssh') return;
    const saved = this.vault.inspect();
    if (!saved.profile) {
      if (saved.error) this.restoreErrors.set(sessionId, saved.error);
      return;
    }
    // One attempt per authenticated login; failures never turn login into an error.
    const pending = this.reconnect(sessionId, expiresAt);
    const token = this.restoreTokens.get(sessionId);
    void pending.catch(error => {
      if (token?.cancelled || expiresAt <= Date.now()) return;
      this.restoreErrors.set(sessionId, error.status === 409 ? 'A VPS está em uso por outra sessão. Desconecte naquela sessão e use Reconectar.' : 'Não foi possível reconectar à VPS salva. Confira a conexão e conecte manualmente para atualizar as credenciais, se necessário.');
      this.events.publish();
    });
  }
  async disconnect(sessionId, force = false) {
    this.ensureSsh();
    if (this.owner !== sessionId) throw failure('Esta conexão pertence a outra sessão ou já foi encerrada.', 409);
    if (!force && this.chat.isBusy()) throw failure('Interrompa a tarefa antes de desconectar a VPS.', 409);
    const attempt = ++this.connectionEpoch;
    this.closing = true;
    try { await this.chat.disconnect(); }
    finally { if (attempt === this.connectionEpoch) { this.clearOwner(); this.closing = false; this.connecting = false; } this.events.publish(); }
  }
  async releaseSession(sessionId) {
    const token = this.restoreTokens.get(sessionId); if (token) token.cancelled = true;
    this.restoreErrors.delete(sessionId); this.saveErrors.delete(sessionId);
    if (this.config.mode === 'ssh' && this.owner === sessionId) await this.disconnect(sessionId, true);
  }
  async close() {
    for (const token of this.restoreTokens.values()) token.cancelled = true;
    clearTimeout(this.expiry);
    if (this.owner) await this.releaseSession(this.owner);
    this.restoreErrors.clear(); this.saveErrors.clear();
  }
}
