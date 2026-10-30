import { validatePermissions } from '../services/permissions.js';
import { validateAvailableModel, defaultAvailableModel, validatePerformanceSettings } from '../services/capabilitiesService.js';

export function conversationController(store, chat, connection) {
  const requireIdle = c => { if (c.busy) throw Object.assign(new Error('Interrompa ou aguarde a tarefa antes de alterar esta conversa.'), { status: 409 }); };
  const checkSettingsSession = (req, context, updating) => {
    if (!['model', 'reasoningEffort', 'serviceTier'].some(key => Object.hasOwn(req.body || {}, key) && (updating || req.body[key] !== null))) return;
    if (context !== chat.contextKey()) throw Object.assign(new Error('O ambiente mudou durante a configuração. Atualize a conversa e tente novamente.'), { status: 409 });
    connection?.ensureOwner(req.sessionID);
  };
  return {
    list(req, res) { res.json({ conversations: store.list().map(c => { const { messages, ...summary } = chat.publicConversation(c); return summary; }) }); },
    async create(req, res) {
      const context = chat.contextKey();
      const permissions = validatePermissions(chat.config, req.body?.permissions);
      const model = req.body?.model === undefined ? null : await validateAvailableModel(chat, req.body.model);
      const defaultModel = model ? await defaultAvailableModel(chat) : undefined;
      const performance = await validatePerformanceSettings(chat, req.body || {}, {}, model);
      checkSettingsSession(req, context, false);
      const c = store.create(permissions);
      c.model = model;
      Object.assign(c, performance);
      if (defaultModel) c.defaultModel = defaultModel;
      store.flush();
      chat.events.publish(c.id);
      res.status(201).json({ conversation: chat.publicConversation(c) });
    },
    read(req, res) { res.json({ conversation: chat.publicConversation(req.conversation), approvals: chat.pending(req.conversation) }); },
    async update(req, res) {
      const c = req.conversation;
      requireIdle(c);
      const context = chat.contextKey();
      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length || Object.keys(body).some(key => !['title', 'permissions', 'model', 'reasoningEffort', 'serviceTier'].includes(key))) return res.status(400).json({ error: 'Informe configurações válidas para esta conversa.' });
      let title = c.title;
      if ('title' in body) {
        if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 100 || /[\x00-\x1f\x7f]/.test(body.title)) return res.status(400).json({ error: 'O título deve ter de 1 a 100 caracteres, em uma única linha.' });
        title = body.title.trim();
      }
      const permissions = validatePermissions(chat.config, body.permissions, c);
      const model = 'model' in body ? await validateAvailableModel(chat, body.model) : c.model;
      const defaultModel = 'model' in body && (model || c.model) ? await defaultAvailableModel(chat) : c.defaultModel;
      const performance = await validatePerformanceSettings(chat, body, c, model);
      checkSettingsSession(req, context, true);
      // Model discovery is asynchronous: recheck the task lock before mutation.
      if (store.get(c.id) !== c) return res.status(404).json({ error: 'Conversa não encontrada.' });
      requireIdle(c);
      c.title = title;
      c.permissions = permissions;
      if ('model' in body) c.model = model;
      Object.assign(c, performance);
      if (defaultModel) c.defaultModel = defaultModel;
      chat.changed(c);
      store.flush();
      res.json({ conversation: chat.publicConversation(c) });
    },
    remove(req, res) {
      const c = req.conversation;
      requireIdle(c);
      chat.clearApprovals(c);
      store.remove(c);
      chat.events.publish(c.id);
      res.json({ ok: true });
    },
    send(req, res) {
      const text = req.body?.text ?? '';
      const attachmentIds = req.body?.attachmentIds ?? [];
      if (typeof text !== 'string' || text.length > 16000 || (!text.trim() && (!Array.isArray(attachmentIds) || !attachmentIds.length))) return res.status(400).json({ error: 'Envie uma mensagem de até 16.000 caracteres ou pelo menos um anexo.' });
      chat.send(req.conversation, text.trim(), attachmentIds);
      res.status(202).json({ ok: true });
    },
    async interrupt(req, res) { await chat.interrupt(req.conversation); res.json({ ok: true }); },
    approve(req, res) {
      if (!['accept', 'decline'].includes(req.body?.decision)) return res.status(400).json({ error: 'Decisão inválida.' });
      chat.decide(req.params.id, req.body.decision);
      res.json({ ok: true });
    },
  };
}
