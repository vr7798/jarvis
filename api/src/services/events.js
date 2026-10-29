export class Events {
  clients = new Set();
  timers = new Map();
  constructor() {
    this.heartbeat = setInterval(() => {
      for (const client of this.clients) {
        if (client.expiresAt <= Date.now()) { client.res.end(); this.clients.delete(client); }
        else client.res.write(': heartbeat\n\n');
      }
    }, 15000);
    this.heartbeat.unref();
  }
  connect(req, res) {
    res.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    const client = { res, sessionId: req.sessionID, expiresAt: new Date(req.session.cookie.expires).getTime() };
    this.clients.add(client);
    res.write('event: update\ndata: {}\n\n');
    req.on('close', () => this.clients.delete(client));
  }
  publish(conversationId) {
    const key = conversationId || 'all';
    if (this.timers.has(key)) return;
    this.timers.set(key, setTimeout(() => {
      this.timers.delete(key);
      for (const { res } of this.clients) res.write(`event: update\ndata: ${JSON.stringify({ conversationId })}\n\n`);
    }, 120));
  }
  disconnect(sessionId) {
    for (const c of this.clients) if (c.sessionId === sessionId) { c.res.end(); this.clients.delete(c); }
  }
  close() {
    clearInterval(this.heartbeat);
    for (const t of this.timers.values()) clearTimeout(t);
    for (const c of this.clients) c.res.end();
    this.clients.clear();
  }
}
