import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { CodexTransport } from './codexTransport.js';
import { SshTransport } from './sshTransport.js';

const approvalMethods = new Set(['item/commandExecution/requestApproval', 'item/fileChange/requestApproval']);

export class ChatService {
  approvals = new Map();
  loaded = new Set();
  mockRuns = new Map();
  runTokens = new Map();
  endedTurns = new Set();
  constructor(config, store, events, transport) {
    this.config = config;
    this.store = store;
    this.events = events;
    if (config.mode !== 'ssh') fs.mkdirSync(config.workspace, { recursive: true });
    this.transport = transport || (config.mode === 'ssh' ? new SshTransport() : new CodexTransport({ bin: config.bin, cwd: config.workspace, home: config.codexHome, apiKey: config.apiKey }));
    this.transport.on('notification', m => this.notification(m));
    this.transport.on('serverRequest', m => this.serverRequest(m));
    this.transport.on('offline', () => {
      this.loaded.clear();
      for (const c of this.store.list()) if (c.busy) this.fail(c, 'O processo Codex encerrou. Confira os resultados antes de reenviar a tarefa.');
    });
  }
  status() {
    return { mode: this.config.mode, workspace: this.workspace(), sandbox: this.config.sandbox,
      connected: this.config.mode === 'mock' || Boolean(this.transport.ready),
      detail: this.config.mode === 'mock' ? 'Demonstração: nenhum comando é executado.' : this.config.mode === 'ssh' ? 'Codex remoto via SSH · usa a autenticação existente na VPS' : 'Codex App Server · chave API · cobrança por uso' };
  }
  workspace() { return this.config.mode === 'ssh' ? this.transport.endpoint?.workspace || null : this.config.workspace; }
  contextKey() {
    const remote = this.transport.endpoint;
    return this.config.mode === 'ssh'
      ? JSON.stringify(['ssh', remote?.host, remote?.port, remote?.username, remote?.fingerprint, remote?.workspace])
      : JSON.stringify([this.config.mode, this.config.workspace]);
  }
  resetConnection() { this.loaded.clear(); }
  isBusy() { return this.store.list().some(c => c.busy); }
  async disconnect() {
    // Stop only the process/channel created by this panel. Closing SSH cannot
    // undo commands which already ran, or stop an unrelated Codex terminal.
    await this.transport.close();
    this.loaded.clear();
    for (const c of this.store.list()) if (c.busy) this.fail(c, 'A conexão foi encerrada. Confira os resultados na VPS antes de repetir comandos.');
  }
  pending(c) { return [...this.approvals.values()].filter(a => a.conversationId === c.id).map(({ id, conversationId, method, params }) => ({ id, conversationId, method, params })); }
  changed(c) { this.store.touch(c); this.events.publish(c.id); }
  clearApprovals(c) {
    for (const [id, a] of this.approvals) if (a.conversationId === c.id) {
      clearTimeout(a.timer);
      this.approvals.delete(id);
      if (a.resolve) a.resolve('decline');
      else { try { this.transport.response(a.rpcId, { decision: 'cancel' }); } catch {} }
    }
  }
  fail(c, message) {
    this.clearApprovals(c);
    if (c.activeTurnId) this.endedTurns.add(c.activeTurnId);
    this.runTokens.delete(c.id);
    this.store.addMessage(c, 'system', message);
    c.busy = false; c.activeTurnId = null;
    this.changed(c);
  }
  finish(c) {
    this.clearApprovals(c);
    if (c.activeTurnId) this.endedTurns.add(c.activeTurnId);
    this.runTokens.delete(c.id);
    c.busy = false; c.activeTurnId = null;
    this.changed(c);
  }
  send(c, text) {
    if (this.isBusy()) throw Object.assign(new Error('Aguarde a tarefa em andamento ou interrompa antes de enviar outra.'), { status: 409 });
    if (this.config.mode === 'ssh' && !this.transport.ready) throw Object.assign(new Error('Conecte sua VPS por SSH antes de enviar uma mensagem.'), { status: 409 });
    const contextKey = this.contextKey();
    if ((c.contextKey && c.contextKey !== contextKey) || (!c.contextKey && c.messages.length)) {
      throw Object.assign(new Error('Esta conversa pertence a outro ambiente ou versão. Crie uma nova conversa para o servidor e pasta atuais.'), { status: 409 });
    }
    c.contextKey = contextKey;
    c.busy = true;
    const token = randomUUID();
    this.runTokens.set(c.id, token);
    this.store.addMessage(c, 'user', text);
    if (c.title === 'Nova conversa') c.title = text.replace(/\s+/g, ' ').slice(0, 60);
    this.changed(c);
    this.store.flush();
    this.run(c, text, token).catch(async err => {
      if (this.runTokens.get(c.id) !== token) return;
      let message = String(err.message || err).replace(/sk-[\w-]+/g, '[chave removida]').slice(0, 600);
      if (this.config.apiKey) message = message.split(this.config.apiKey).join('[chave removida]');
      // A timed-out turn/start may already have started work. Close this owned
      // transport before admitting another task instead of leaving it running.
      if (this.config.mode !== 'mock') { await this.transport.close(); this.loaded.clear(); }
      if (this.runTokens.get(c.id) === token) this.fail(c, `Não foi possível concluir: ${message}`);
    });
  }
  async run(c, text, token) {
    if (this.config.mode === 'mock') return this.runMock(c, text);
    await this.transport.start();
    if (this.runTokens.get(c.id) !== token) return;
    const params = { cwd: this.workspace(), sandbox: this.config.sandbox, approvalPolicy: 'untrusted' };
    if (this.config.model) params.model = this.config.model;
    if (!c.threadId) {
      const result = await this.transport.request('thread/start', params);
      c.threadId = result.thread.id;
      this.loaded.add(c.threadId);
      this.store.flush();
    } else if (!this.loaded.has(c.threadId)) {
      await this.transport.request('thread/resume', { ...params, threadId: c.threadId });
      this.loaded.add(c.threadId);
    }
    if (this.runTokens.get(c.id) !== token) return;
    const result = await this.transport.request('turn/start', { threadId: c.threadId, input: [{ type: 'text', text }] });
    if (this.runTokens.get(c.id) === token) c.activeTurnId = result.turn.id;
    this.changed(c);
  }
  async runMock(c, text) {
    const controller = new AbortController();
    this.mockRuns.set(c.id, controller);
    c.activeTurnId = randomUUID();
    try {
      let reply = 'Olá! Sou o Jarvis em modo demonstração. O login, o histórico e a transmissão em tempo real estão funcionando.\n\nNenhum comando foi executado. Para acessar sua VPS, configure CODEX_MODE=ssh em api/.env, reinicie a API e conecte o servidor pela tela de SSH.\n\nVocê disse: ' + text;
      if (/aprova/i.test(text)) {
        const decision = await new Promise(resolve => {
          this.addApproval(c, { method: 'item/commandExecution/requestApproval', params: { reason: 'Teste de aprovação: este comando NÃO será executado.', command: 'echo "Olá, Jarvis"', cwd: this.config.workspace } }, resolve);
        });
        reply = decision === 'accept' ? 'Aprovação recebida! Este é um teste: nenhum comando foi executado.' : 'Você recusou a ação. Nenhum comando foi executado.';
      }
      const id = randomUUID();
      for (const chunk of reply.match(/.{1,20}|\n/g) || []) {
        await delay(30, undefined, { signal: controller.signal });
        this.store.upsert(c, id, 'assistant', chunk, true);
        this.events.publish(c.id);
      }
      this.finish(c);
    } catch (err) { if (err.name !== 'AbortError') throw err; }
    finally { this.mockRuns.delete(c.id); }
  }
  addApproval(c, request, resolve) {
    const id = randomUUID();
    const approval = { id, conversationId: c.id, method: request.method, params: request.params, rpcId: request.id, resolve };
    approval.timer = setTimeout(() => {
      if (!this.approvals.has(id)) return;
      this.decide(id, 'decline');
      this.store.addMessage(c, 'system', 'A solicitação de aprovação expirou e foi recusada.');
      this.changed(c);
    }, 10 * 60 * 1000);
    approval.timer.unref();
    this.approvals.set(id, approval);
    this.events.publish(c.id);
  }
  decide(id, decision) {
    const a = this.approvals.get(id);
    if (!a) throw Object.assign(new Error('Esta aprovação não está mais pendente.'), { status: 404 });
    const c = this.store.get(a.conversationId);
    if (!c?.busy) throw Object.assign(new Error('A tarefa já terminou.'), { status: 409 });
    if (a.resolve) a.resolve(decision);
    else this.transport.response(a.rpcId, { decision });
    clearTimeout(a.timer);
    this.approvals.delete(id);
    this.changed(c);
  }
  serverRequest(m) {
    const c = this.store.list().find(x => x.threadId === m.params?.threadId);
    if (c?.busy && !this.endedTurns.has(m.params.turnId) && (!m.params.turnId || c.activeTurnId === m.params.turnId) && approvalMethods.has(m.method)) return this.addApproval(c, m);
    this.transport.rejectRequest(m.id, 'Esta interface suporta aprovação de comandos e arquivos. A solicitação interativa recebida não é suportada.');
    if (c) { this.store.addMessage(c, 'system', `Solicitação não suportada pelo painel: ${m.method}. Nenhuma autorização foi concedida.`); this.changed(c); }
  }
  notification({ method, params: p = {} }) {
    const c = this.store.list().find(x => x.threadId === p.threadId);
    if (!c) return;
    const turnId = p.turnId || p.turn?.id;
    if (method !== 'serverRequest/resolved') {
      if (!c.busy || (turnId && this.endedTurns.has(turnId))) return;
      if (turnId && c.activeTurnId && turnId !== c.activeTurnId) return;
      if (turnId && !c.activeTurnId && method !== 'turn/started') return;
    }
    if (method === 'turn/started') c.activeTurnId = p.turn.id;
    if (method === 'item/agentMessage/delta') this.store.upsert(c, p.itemId, 'assistant', p.delta, true);
    if (method === 'item/commandExecution/outputDelta') this.store.upsert(c, p.itemId, 'tool', p.delta, true);
    if (method === 'item/started' && p.item?.type === 'commandExecution') this.store.upsert(c, p.item.id, 'tool', `$ ${p.item.command}\n`);
    if (method === 'item/started' && p.item?.type === 'fileChange') this.store.upsert(c, p.item.id, 'tool', `Alterações propostas · aguardando conclusão\n${(p.item.changes || []).map(x => `${x.path}\n${x.diff || ''}`).join('\n')}`);
    if (method === 'item/completed') {
      const item = p.item;
      if (item.type === 'agentMessage') this.store.upsert(c, item.id, 'assistant', item.text || '');
      if (item.type === 'commandExecution') this.store.upsert(c, item.id, 'tool', `$ ${item.command}\n${item.aggregatedOutput || ''}\n[${item.status}${item.exitCode != null ? ` · saída ${item.exitCode}` : ''}]`);
      if (item.type === 'fileChange') this.store.upsert(c, item.id, 'tool', `Arquivos · ${item.status}\n${(item.changes || []).map(x => `${x.path}\n${x.diff || ''}`).join('\n')}`);
    }
    if (method === 'serverRequest/resolved') {
      for (const [id, a] of this.approvals) if (a.rpcId === p.requestId) { clearTimeout(a.timer); this.approvals.delete(id); }
    }
    if (method === 'turn/completed') {
      if (p.turn.error) this.store.addMessage(c, 'system', `Codex: ${p.turn.error.message || 'A tarefa falhou.'}`);
      this.finish(c);
    }
    if (method === 'error' && !p.willRetry) this.fail(c, p.error?.message || 'O Codex encontrou um erro.');
    this.changed(c);
  }
  async interrupt(c) {
    if (!c.busy) return;
    if (this.config.mode === 'mock') {
      this.mockRuns.get(c.id)?.abort();
      this.finish(c);
      this.store.addMessage(c, 'system', 'Tarefa interrompida.');
    } else if (c.activeTurnId && c.threadId) {
      await this.transport.request('turn/interrupt', { threadId: c.threadId, turnId: c.activeTurnId });
    } else {
      // Do not release the task lock while turn/start is in flight: it may have
      // started work before its response reaches this process.
      throw Object.assign(new Error('O Codex está inicializando. Aguarde um instante e tente interromper novamente.'), { status: 409 });
    }
    this.changed(c);
  }
  async close() {
    for (const c of this.store.list()) if (c.busy) {
      this.mockRuns.get(c.id)?.abort();
      this.fail(c, 'O painel foi encerrado. Confira os resultados antes de repetir comandos.');
    }
    await this.transport.close();
    this.store.flush();
  }
}
