import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { requireAuth, requireCsrf } from '../middleware/auth.js';
import { authController } from '../controllers/authController.js';
import { conversationController } from '../controllers/conversationController.js';
import { connectionController } from '../controllers/connectionController.js';

export function apiRoutes(config, store, chat, events, connection) {
  const router = Router();
  const auth = authController(config, events, connection);
  const remote = connectionController(connection);
  const conversations = conversationController(store, chat);
  router.post('/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-8', legacyHeaders: false, skipSuccessfulRequests: true, message: { error: 'Muitas tentativas de login. Aguarde 15 minutos.' } }), auth.login);
  router.use(requireAuth, requireCsrf);
  router.get('/auth/me', auth.me);
  router.post('/auth/logout', auth.logout);
  router.get('/status', (req, res) => res.json(connection.status(req.sessionID)));
  const connectLimit = rateLimit({ windowMs: 60000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Muitas tentativas SSH. Aguarde um minuto.' } });
  router.post('/connection/probe', connectLimit, remote.probe);
  router.post('/connection/connect', connectLimit, remote.connect);
  router.post('/connection/disconnect', remote.disconnect);
  router.get('/events', (req, res) => events.connect(req, res));
  router.get('/conversations', conversations.list);
  router.post('/conversations', conversations.create);
  router.param('conversationId', (req, res, next, id) => {
    req.conversation = store.get(id);
    if (!req.conversation) return res.status(404).json({ error: 'Conversa não encontrada.' });
    next();
  });
  router.get('/conversations/:conversationId', conversations.read);
  const ownConnection = (req, res, next) => { connection.ensureOwner(req.sessionID); next(); };
  router.post('/conversations/:conversationId/messages', ownConnection, conversations.send);
  router.post('/conversations/:conversationId/interrupt', ownConnection, conversations.interrupt);
  router.post('/approvals/:id', ownConnection, conversations.approve);
  router.use((req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  return router;
}
