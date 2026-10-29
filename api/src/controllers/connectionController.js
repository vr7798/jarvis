export function connectionController(connection) {
  return {
    async probe(req, res) { res.json(await connection.probe(req.body)); },
    async connect(req, res) {
      const expiry = new Date(req.session.cookie.expires).getTime();
      res.json({ status: await connection.connect(req.sessionID, expiry, req.body) });
    },
    async disconnect(req, res) { await connection.disconnect(req.sessionID); res.json({ ok: true }); },
  };
}
