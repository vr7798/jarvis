export function conversationController(store, chat) {
  return {
    list(req, res) { res.json({ conversations: store.list().map(c => { const { messages, ...summary } = store.public(c); return summary; }) }); },
    create(req, res) { res.status(201).json({ conversation: store.public(store.create()) }); },
    read(req, res) { res.json({ conversation: store.public(req.conversation), approvals: chat.pending(req.conversation) }); },
    send(req, res) {
      const text = req.body?.text;
      if (typeof text !== 'string' || !text.trim() || text.length > 16000) return res.status(400).json({ error: 'Envie uma mensagem de 1 a 16.000 caracteres.' });
      chat.send(req.conversation, text.trim());
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
