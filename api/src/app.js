import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import { apiRoot } from './config/env.js';
import { sameOrigin } from './middleware/auth.js';
import { ConversationStore } from './models/conversationStore.js';
import { ChatService } from './services/chatService.js';
import { Events } from './services/events.js';
import { apiRoutes } from './routes/index.js';
import { ConnectionService } from './services/connectionService.js';
import { WorkspaceFiles } from './services/workspaceFiles.js';
import { AttachmentService } from './services/attachmentService.js';

export function createApp(config, { transport, probe } = {}) {
  const app = express();
  const store = new ConversationStore(config.dataDir);
  const events = new Events();
  const chat = new ChatService(config, store, events, transport);
  const connection = new ConnectionService(config, chat, events, { probe });
  const workspaceFiles = new WorkspaceFiles(config, chat);
  const attachments = new AttachmentService(config, chat, workspaceFiles);
  chat.attachments = attachments;
  // Single trusted Nginx hop. HOST stays on loopback in production.
  if (config.production) app.set('trust proxy', 'loopback');
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: config.production ? undefined : false, strictTransportSecurity: config.production ? undefined : false }));
  app.use(express.json({ limit: '24kb' }));
  app.get('/health', (req, res) => res.json({ ok: true }));
  app.use('/api', sameOrigin(config.origin));
  const sessions = new session.MemoryStore();
  app.use('/api', session({
    name: 'jarvis.sid', secret: config.sessionSecret, store: sessions,
    resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, secure: config.production, sameSite: 'strict', maxAge: 8 * 60 * 60 * 1000 },
  }));
  const pruneSessions = setInterval(() => {
    sessions.all((err, all) => {
      if (err) return;
      for (const [id, value] of Object.entries(all || {})) if (new Date(value.cookie.expires).getTime() <= Date.now()) sessions.destroy(id);
    });
  }, 60000);
  pruneSessions.unref();
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const routes = apiRoutes(config, store, chat, events, connection, { attachments, workspaceFiles });
  app.use('/api', routes);
  const dist = path.resolve(apiRoot, '../front/dist');
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { index: false }));
    app.get('/{*path}', (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.status || 500;
    res.status(status).json({ error: status >= 500 && !err.expose ? 'Falha interna. Confira a configuração e os logs da API.' : err.message });
    if (status >= 500) console.error('[Luck] Falha interna:', err.code || err.name);
  });
  return { app, store, chat, events, connection, attachments, workspaceFiles, terminal: routes.terminal?.service, async close() { clearInterval(pruneSessions); routes.terminal?.close(); routes.capabilities?.close(); events.close(); await connection.close(); await chat.close(); } };
}
