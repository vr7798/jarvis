import { Router } from 'express';

const failure = (message, status = 400) => Object.assign(new Error(message), { status });
const safeText = (value, max = 500) => typeof value === 'string' ? value.slice(0, max) : '';
const catalogCache = new WeakMap();

const baseCommands = [
  { name: 'new', label: 'Nova conversa', description: 'Começar uma conversa no ambiente atual.', action: 'new', source: 'Luck' },
  { name: 'status', label: 'Status do ambiente', description: 'Conexão, workspace e permissões atuais.', action: 'status', source: 'Luck' },
  { name: 'permissions', label: 'Permissões', description: 'Configurar acesso aos arquivos e aprovação de ações.', action: 'permissions', source: 'Luck' },
  { name: 'model', label: 'Escolher modelo', description: 'Modelos disponibilizados pela sua conta no Codex conectado.', action: 'model', source: 'Codex' },
  { name: 'effort', label: 'Esforço de raciocínio', description: 'Escolher a profundidade do modelo, incluindo Max e Ultra quando disponíveis.', action: 'effort', source: 'Codex' },
  { name: 'fast', label: 'Velocidade da resposta', description: 'Configurar velocidade normal, rápida ou outras opções do modelo.', action: 'fast', source: 'Codex' },
  { name: 'skills', label: 'Habilidades', description: 'Ver e usar as habilidades instaladas no Codex conectado.', action: 'skills', source: 'Codex' },
  { name: 'mcp', label: 'Integrações MCP', description: 'Consultar os servidores MCP do Codex conectado.', action: 'mcp', source: 'Codex' },
  { name: 'compact', label: 'Compactar contexto', description: 'Resumir o contexto da conversa pelo Codex.', action: 'compact', source: 'Codex' },
  { name: 'plan', label: 'Planejar uma tarefa', description: 'Preparar um pedido de plano antes de implementar.', action: 'prompt', source: 'Prompt', prompt: 'Investigue o projeto e proponha um plano antes de editar arquivos. Tarefa: ' },
  { name: 'review', label: 'Revisar código', description: 'Preparar uma revisão das alterações do projeto.', action: 'prompt', source: 'Prompt', prompt: 'Revise as alterações deste projeto. Identifique bugs, riscos e testes necessários, citando os arquivos. Não faça alterações durante a revisão. ' },
  { name: 'init', label: 'Orientações do projeto', description: 'Pedir a criação ou melhoria do arquivo AGENTS.md.', action: 'prompt', source: 'Prompt', prompt: 'Analise este projeto e crie ou atualize um AGENTS.md com orientações úteis de desenvolvimento e validação. Preserve instruções válidas existentes. ' },
  { name: 'terminal', label: 'Terminal manual', description: 'Abrir o terminal da sua sessão SSH como administrador.', action: 'terminal', source: 'Luck' },
  { name: 'files', label: 'Arquivos do workspace', description: 'Navegar e baixar os arquivos da pasta de trabalho.', action: 'files', source: 'Luck' },
  { name: 'attach', label: 'Anexar arquivos', description: 'Adicionar imagens, PDF, ZIP e outros arquivos à mensagem.', action: 'attach', source: 'Luck' },
  { name: 'export', label: 'Exportar conversa', description: 'Salvar o histórico em um arquivo Markdown.', action: 'export', source: 'Luck' },
  { name: 'delete', label: 'Excluir conversa', description: 'Apagar esta conversa do histórico do Luck.', action: 'delete', source: 'Luck' },
  { name: 'clear', label: 'Limpar rascunho', description: 'Esvaziar o texto da mensagem sem excluir o histórico.', action: 'clear', source: 'Luck' },
  { name: 'help', label: 'Ajuda dos comandos', description: 'Consultar as ações disponíveis no Luck.', action: 'help', source: 'Luck' },
];

const validOption = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,40}$/.test(value);
function publicModels(result) {
  return (Array.isArray(result?.data) ? result.data : []).filter(m => !m.hidden && typeof m.model === 'string').slice(0, 100).map(m => {
    const tiers = Array.isArray(m.serviceTiers)
      ? m.serviceTiers.filter(tier => validOption(tier?.id)).map(tier => ({ id: tier.id, name: safeText(tier.name || tier.id, 100), description: safeText(tier.description, 250) }))
      : (Array.isArray(m.additionalSpeedTiers) ? m.additionalSpeedTiers : []).filter(validOption).map(id => ({ id, name: id, description: '' }));
    return {
    id: safeText(m.id || m.model, 150), model: safeText(m.model, 150), displayName: safeText(m.displayName || m.model, 150),
    description: safeText(m.description), isDefault: Boolean(m.isDefault),
    inputModalities: (Array.isArray(m.inputModalities) ? m.inputModalities : ['text', 'image']).filter(x => ['text', 'image', 'audio'].includes(x)),
    defaultReasoningEffort: validOption(m.defaultReasoningEffort) ? m.defaultReasoningEffort : null,
    supportedReasoningEfforts: (Array.isArray(m.supportedReasoningEfforts) ? m.supportedReasoningEfforts : []).filter(x => validOption(x?.reasoningEffort)).map(x => ({ reasoningEffort: x.reasoningEffort, description: safeText(x.description, 200) })),
    serviceTiers: tiers,
    supportedServiceTiers: [...new Set(['default', ...tiers.map(tier => tier.id)])],
    defaultServiceTier: validOption(m.defaultServiceTier) ? m.defaultServiceTier : null,
  }; });
}

async function modelsFromTransport(chat) {
  const transport = chat.transport;
  if (!transport?.ready) throw failure('Conecte o Codex para consultar os modelos disponíveis.', 409);
  const key = chat.contextKey();
  const cached = catalogCache.get(transport);
  if (cached?.key === key && Date.now() - cached.time < 30_000) return cached.models;
  const models = publicModels(await transport.request('model/list', { limit: 100, includeHidden: false }));
  catalogCache.set(transport, { key, time: Date.now(), models });
  return models;
}

export async function validateAvailableModel(chat, model) {
  if (model === null) return null;
  if (typeof model !== 'string' || !model.trim() || model.length > 150) throw failure('Escolha um modelo válido da lista disponível.');
  const models = await modelsFromTransport(chat);
  const chosen = models.find(m => m.model === model || m.id === model);
  if (!chosen) throw failure('Este modelo não está disponível na conta conectada. Atualize a lista e tente novamente.');
  return chosen.model;
}

export async function defaultAvailableModel(chat) {
  const models = await modelsFromTransport(chat);
  const chosen = models.find(m => m.model === chat.config?.model || m.id === chat.config?.model) || models.find(m => m.isDefault) || models[0];
  if (!chosen) throw failure('Não foi possível consultar o modelo padrão. Atualize a lista e tente novamente.', 409);
  return chosen.model;
}

async function settingsModel(chat, model) {
  const models = await modelsFromTransport(chat);
  const selected = model || chat.config?.model;
  const chosen = selected ? models.find(m => m.model === selected || m.id === selected) : models.find(m => m.isDefault) || models[0];
  if (!chosen) throw failure('O modelo desta conversa não está disponível. Escolha um modelo da lista atual.', 409);
  return chosen;
}

/** Validate against the account's catalog; option names are not a fixed enum. */
export async function validatePerformanceSettings(chat, value, current = {}, model = current.model) {
  const owns = key => Object.hasOwn(value, key);
  const changedModel = owns('model') && (model || null) !== (current.model || null);
  const configured = owns('reasoningEffort') || owns('serviceTier') || Object.hasOwn(current, 'reasoningEffort') || Object.hasOwn(current, 'serviceTier');
  if (!configured) return {};
  if (!['model', 'reasoningEffort', 'serviceTier'].some(owns)) return { reasoningEffort: current.reasoningEffort ?? null, serviceTier: current.serviceTier ?? null };
  const reasoningEffort = owns('reasoningEffort') ? value.reasoningEffort : changedModel ? null : current.reasoningEffort ?? null;
  const serviceTier = owns('serviceTier') ? value.serviceTier : changedModel ? null : current.serviceTier ?? null;
  if (reasoningEffort !== null && !validOption(reasoningEffort)) throw failure('Escolha um esforço de raciocínio válido.');
  if (serviceTier !== null && !validOption(serviceTier)) throw failure('Escolha uma velocidade válida.');
  // Empty defaults need no live catalog. Existing selected overrides must still
  // be persisted as null so their next turn explicitly resets the thread.
  if (reasoningEffort === null && serviceTier === null) return Object.hasOwn(current, 'reasoningEffort') || Object.hasOwn(current, 'serviceTier') ? { reasoningEffort, serviceTier } : {};
  const catalog = await settingsModel(chat, model);
  if (reasoningEffort !== null && !catalog.supportedReasoningEfforts.some(option => option.reasoningEffort === reasoningEffort)) throw failure('Este esforço de raciocínio não está disponível para o modelo escolhido.');
  if (serviceTier !== null && !catalog.supportedServiceTiers.includes(serviceTier)) throw failure('Esta velocidade não está disponível para o modelo escolhido.');
  return { reasoningEffort, serviceTier };
}

/** Explicit defaults undo persistent turn overrides, including after a restart. */
export async function turnPerformanceSettings(chat, conversation) {
  if (!Object.hasOwn(conversation, 'reasoningEffort') && !Object.hasOwn(conversation, 'serviceTier')) return {};
  const catalog = await settingsModel(chat, conversation.model);
  await validatePerformanceSettings(chat, { reasoningEffort: conversation.reasoningEffort ?? null, serviceTier: conversation.serviceTier ?? null }, conversation, conversation.model);
  const effort = conversation.reasoningEffort ?? catalog.defaultReasoningEffort;
  return { ...(effort ? { effort } : {}), serviceTier: conversation.serviceTier ?? catalog.defaultServiceTier ?? 'default' };
}

export class CapabilitiesService {
  constructor({ config, chat, connection, store, compactTimeoutMs = 120_000 }) {
    Object.assign(this, { config, chat, connection, store, compactTimeoutMs });
    this.compactions = new Map();
    this.onNotification = message => this.notification(message);
    this.onOffline = () => { catalogCache.delete(chat.transport); this.clearCompactions('A conexão foi encerrada durante a compactação.'); };
    chat.transport.on('notification', this.onNotification);
    chat.transport.on('offline', this.onOffline);
    chat.transport.on('disconnected', this.onOffline);
  }
  async read(sessionId) {
    const status = this.connection.status(sessionId);
    const connected = Boolean(status.connected && this.chat.transport.ready && this.config.mode !== 'mock');
    const commands = baseCommands.map(c => ({ ...c, enabled: !['compact', 'model', 'effort', 'fast', 'skills', 'mcp'].includes(c.action) || connected }));
    const result = { commands, models: [], defaultModel: null, skills: [], mcp: [], connected, warnings: [] };
    if (!connected) return result;
    this.connection.ensureOwner(sessionId);
    const context = this.chat.contextKey();
    const requests = [
      modelsFromTransport(this.chat),
      this.chat.transport.request('skills/list', { cwds: [this.chat.workspace()], forceReload: false }),
      this.chat.transport.request('mcpServerStatus/list', { limit: 100 }),
    ];
    const [models, skills, mcp] = await Promise.allSettled(requests);
    // Do not deliver the previous server's inventory after a connection switch.
    this.connection.ensureOwner(sessionId);
    if (context !== this.chat.contextKey()) throw failure('O ambiente mudou. Atualize a lista de comandos.', 409);
    if (models.status === 'fulfilled') {
      result.models = models.value;
      result.defaultModel = (models.value.find(model => model.model === this.config.model || model.id === this.config.model) || models.value.find(model => model.isDefault) || models.value[0])?.model || null;
    }
    else result.warnings.push('A lista de modelos não está disponível neste Codex.');
    if (skills.status === 'fulfilled') {
      const entries = Array.isArray(skills.value?.data) ? skills.value.data : [];
      const unique = new Map();
      for (const entry of entries) for (const skill of Array.isArray(entry.skills) ? entry.skills : []) {
        if (skill.enabled === false || typeof skill.name !== 'string' || typeof skill.path !== 'string') continue;
        const publicSkill = { name: safeText(skill.name, 150), description: safeText(skill.interface?.shortDescription || skill.shortDescription || skill.description), path: safeText(skill.path, 4096), displayName: safeText(skill.interface?.displayName || skill.name, 150) };
        unique.set(publicSkill.path, publicSkill);
      }
      result.skills = [...unique.values()].slice(0, 200);
    } else result.warnings.push('As habilidades não estão disponíveis neste Codex.');
    if (mcp.status === 'fulfilled') result.mcp = (Array.isArray(mcp.value?.data) ? mcp.value.data : []).slice(0, 100).map(server => ({ name: safeText(server.name, 150), status: safeText(server.status || server.authStatus || 'configurado', 100), toolCount: Object.keys(server.tools || {}).length }));
    else result.warnings.push('Não foi possível consultar as integrações MCP.');
    return result;
  }
  async compact(sessionId, id) {
    this.connection.ensureOwner(sessionId);
    const c = this.store.get(id);
    if (!c) throw failure('Conversa não encontrada.', 404);
    if (this.chat.isBusy()) throw failure('Aguarde ou interrompa a tarefa em andamento antes de compactar.', 409);
    if (this.config.mode === 'mock' || !this.chat.transport.ready) throw failure('Conecte o Codex para compactar o contexto.', 409);
    if (!c.threadId || !c.messages.length) throw failure('Envie uma mensagem nesta conversa antes de compactar o contexto.', 409);
    if (c.contextKey !== this.chat.contextKey()) throw failure('Esta conversa pertence a outro ambiente. Abra uma conversa do ambiente atual.', 409);
    c.busy = true;
    this.chat.changed(c);
    const pending = { id: c.id, threadId: c.threadId, timer: null };
    this.compactions.set(c.id, pending);
    pending.timer = setTimeout(async () => {
      if (this.compactions.get(c.id) !== pending) return;
      // A timed-out compact may still run; stop this owned process before freeing it.
      try { await this.chat.transport.close(); } catch {}
      if (this.compactions.get(c.id) === pending) this.finish(c.id, 'Não foi possível confirmar a compactação. Reconecte o Codex antes de continuar.');
    }, this.compactTimeoutMs);
    pending.timer.unref?.();
    try {
      if (!this.chat.loaded.has(c.threadId)) {
        await this.chat.transport.request('thread/resume', { threadId: c.threadId, cwd: this.chat.workspace() });
        this.chat.loaded.add(c.threadId);
      }
      await this.chat.transport.request('thread/compact/start', { threadId: c.threadId });
    } catch {
      this.finish(c.id, 'O Codex não conseguiu iniciar a compactação do contexto.');
      throw failure('O Codex não conseguiu iniciar a compactação. Confira a conexão e tente novamente.', 502);
    }
  }
  notification({ method, params = {} }) {
    const item = params.item;
    const matches = [...this.compactions.values()].filter(p => p.threadId === params.threadId);
    for (const pending of matches) {
      if (method === 'thread/compacted' || (method === 'item/completed' && item?.type === 'contextCompaction')) this.finish(pending.id, 'Contexto compactado pelo Codex. O histórico visível foi preservado.');
      else if (method === 'turn/completed' || (method === 'error' && !params.willRetry)) this.finish(pending.id, params.turn?.error || method === 'error' ? 'A compactação foi encerrada sem confirmação de conclusão.' : null);
    }
  }
  finish(id, message) {
    const pending = this.compactions.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.compactions.delete(id);
    const c = this.store.get(id);
    if (!c) return;
    if (message) this.store.addMessage(c, 'system', message);
    this.chat.finish(c);
  }
  clearCompactions(message) { for (const id of [...this.compactions.keys()]) this.finish(id, message); }
  close() {
    this.clearCompactions('O painel encerrou durante a compactação.');
    this.chat.transport.off('notification', this.onNotification);
    this.chat.transport.off('offline', this.onOffline);
    this.chat.transport.off('disconnected', this.onOffline);
  }
}

export function createCapabilitiesRouter(options) {
  const service = new CapabilitiesService(options);
  const router = Router();
  router.get('/capabilities', async (req, res) => res.json(await service.read(req.sessionID)));
  router.post('/conversations/:conversationId/commands', async (req, res) => {
    if (req.body?.command !== 'compact' || Object.keys(req.body || {}).some(k => k !== 'command')) throw failure('Comando não suportado.');
    await service.compact(req.sessionID, req.params.conversationId);
    res.status(202).json({ ok: true, command: 'compact' });
  });
  router.service = service;
  return router;
}
