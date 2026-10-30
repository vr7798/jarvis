import { randomBytes } from 'node:crypto';
import { verifyPassword } from '../services/password.js';

export function authController(config, events, connection) {
  return {
    me(req, res) { res.json({ user: req.session.user, csrfToken: req.session.csrfToken }); },
    async login(req, res, next) {
      try {
        const { username, password } = req.body || {};
        // Derive the password even for an incorrect username to reduce account probing.
        const valid = await verifyPassword(password, config.passwordHash);
        if (username !== config.username || !valid) return res.status(401).json({ error: 'Login ou senha incorretos.' });
        const previousSessionId = req.sessionID;
        await connection.releaseSession(previousSessionId);
        req.session.regenerate(err => {
          if (err) return next(err);
          events.disconnect(previousSessionId);
          req.session.user = { username: config.username };
          req.session.csrfToken = randomBytes(32).toString('hex');
          req.session.save(err => {
            if (err) return next(err);
            connection.autoReconnect(req.sessionID, new Date(req.session.cookie.expires).getTime());
            const status = connection.status(req.sessionID);
            res.json({ user: req.session.user, csrfToken: req.session.csrfToken, status, connectionError: status.autoReconnectError || null });
          });
        });
      } catch (err) { next(err); }
    },
    async logout(req, res, next) {
      try { await connection.releaseSession(req.sessionID); } catch (err) { return next(err); }
      events.disconnect(req.sessionID);
      req.session.destroy(err => {
        if (err) return next(err);
        res.clearCookie('jarvis.sid', { path: '/', httpOnly: true, sameSite: 'strict', secure: config.production });
        res.json({ ok: true });
      });
    },
  };
}
