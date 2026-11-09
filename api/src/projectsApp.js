import express from 'express';
import helmet from 'helmet';
import ssh2 from 'ssh2';
import { createHash, timingSafeEqual } from 'node:crypto';
import { CredentialVault } from './services/credentialVault.js';
import { fingerprintFromHash } from './services/sshTransport.js';
import { ProjectFiles } from './services/projectFiles.js';
import { WorkspaceFiles } from './services/workspaceFiles.js';

const failure = (message, status = 400) => Object.assign(new Error(message), { status, expose: true });
const sameProfile = (left, right) => Boolean(left && right && ['host', 'port', 'username', 'workspace', 'fingerprint'].every(key => left[key] === right[key]));
const scopeOf = profile => createHash('sha256').update(JSON.stringify(['host', 'port', 'username', 'workspace', 'fingerprint'].map(key => profile[key]))).digest('hex');
function sameToken(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Isolated project I/O; the existing Jarvis API remains the login/SSH owner authority. */
export function createProjectsApp({ config, apiBase = `http://127.0.0.1:${config.port}`, vault = new CredentialVault(config), ClientType = ssh2.Client, projectFactory = options => new ProjectFiles(options), verifyIntervalMs = 5000, idleMs = 5 * 60 * 1000 } = {}) {
  const upstream = new URL(apiBase);
  if (upstream.protocol !== 'http:' || !['127.0.0.1', '[::1]', 'localhost'].includes(upstream.hostname) || upstream.pathname !== '/' || upstream.username || upstream.password || upstream.search || upstream.hash) throw new Error('A API dos projetos deve usar uma origem em loopback.');
  const app = express(), connections = new Map();
  let closing = false;
  app.disable('x-powered-by');
  app.use(helmet());
  app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.get('/health', (req, res) => res.json({ ok: true, service: 'projects' }));

  async function api(path, cookie, signal) {
    const response = await fetch(new URL(path, upstream), { headers: { Cookie: cookie, Origin: config.origin }, signal: AbortSignal.any([AbortSignal.timeout(5000), ...(signal ? [signal] : [])]), redirect: 'error' });
    const text = await response.text();
    if (text.length > 128 * 1024) throw failure('A resposta da conexão excedeu o limite.', 502);
    let data; try { data = JSON.parse(text); } catch { throw failure('Não foi possível verificar a sessão do Jarvis.', 502); }
    if (!response.ok) throw failure(response.status === 401 ? 'Faça login no Jarvis para abrir os projetos.' : 'Não foi possível verificar a conexão da VPS.', response.status === 401 ? 401 : 502);
    return data;
  }

  async function authorize(cookie, signal) {
    if (typeof cookie !== 'string' || !cookie || cookie.length > 8192) throw failure('Faça login para abrir os projetos.', 401);
    const [auth, status] = await Promise.all([api('/api/auth/me', cookie, signal), api('/api/status', cookie, signal)]);
    if (!auth.user || !auth.csrfToken) throw failure('Faça login para abrir os projetos.', 401);
    if (status.mode !== 'ssh' || !status.connected || !status.connection || status.ownedByAnotherSession) throw failure('Conecte sua VPS nesta sessão para abrir os projetos.', 409);
    if (typeof status.workspace !== 'string' || !status.workspace.startsWith('/') || /[\x00-\x1f\x7f]/.test(status.workspace)) throw failure('A pasta de trabalho da VPS não está disponível.', 409);
    const profile = vault.load();
    if (!sameProfile(profile, status.connection) || profile.workspace !== status.workspace) throw failure('Salve a conexão da VPS atual em Minha VPS para usar a área de projetos.', 409);
    return { auth, status, profile };
  }

  function remove(entry) {
    if (!entry || entry.closed) return;
    entry.closed = true; entry.controller.abort(); entry.client.destroy();
    if (connections.get(entry.key) === entry) connections.delete(entry.key);
  }

  async function context(cookie, identity) {
    if (closing) throw failure('A área de projetos está reiniciando.', 503);
    const key = createHash('sha256').update(cookie).digest('hex');
    let entry = connections.get(key);
    if (entry && !sameProfile(entry.profile, identity.profile)) { remove(entry); entry = null; }
    if (!entry) {
      if (connections.size >= 4) throw failure('Há muitas conexões de projetos abertas. Tente novamente em instantes.', 429);
      const client = new ClientType();
      const profile = { ...identity.profile }; delete profile.password;
      entry = { key, cookie, profile, client, controller: new AbortController(), closed: false, active: 0, lastUsed: Date.now(), verifying: false };
      connections.set(key, entry);
      entry.ready = new Promise((resolve, reject) => {
        let settled = false;
        const credentials = { host: identity.profile.host, port: identity.profile.port, username: identity.profile.username, password: identity.profile.password,
          readyTimeout: 15000, keepaliveInterval: 15000, keepaliveCountMax: 3, hostHash: 'sha256', tryKeyboard: false,
          hostVerifier: hash => { try { return fingerprintFromHash(hash) === profile.fingerprint; } catch { return false; } } };
        const timer = setTimeout(() => { finish(failure('Tempo limite ao abrir os arquivos da VPS.', 504)); remove(entry); }, 16000);
        timer.unref();
        const finish = error => {
          if (settled) return;
          settled = true; clearTimeout(timer); delete credentials.password;
          error ? reject(error) : resolve();
        };
        client.once('ready', () => { if (entry.closed) { finish(failure('A conexão de projetos foi encerrada.', 409)); return; } client.setNoDelay?.(true); finish(); });
        client.on('error', () => { finish(failure('Não foi possível abrir os arquivos pela conexão SSH salva. Confira a VPS em Minha VPS.', 502)); remove(entry); });
        client.once('close', () => { finish(failure('A conexão dos projetos foi encerrada. Tente novamente.', 409)); remove(entry); });
        try { client.connect(credentials); } catch { finish(failure('Não foi possível conectar a área de projetos à VPS.', 502)); remove(entry); }
      });
    }
    entry.lastUsed = Date.now();
    try { await entry.ready; } catch (error) { remove(entry); throw error; }
    if (entry.closed || closing) throw failure('A conexão dos projetos foi encerrada.', 409);
    return entry;
  }

  app.use('/api/projects', async (req, res, next) => {
    try {
      const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
      if (mutation && req.get('origin') !== config.origin) throw failure('Origem inválida. Acesse pelo endereço do Jarvis.', 403);
      const cookie = req.get('cookie');
      const identity = await authorize(cookie);
      if (mutation && !sameToken(req.get('X-CSRF-Token'), identity.auth.csrfToken)) throw failure('Sessão inválida. Atualize a página.', 403);
      const requestedScope = req.get('X-Project-Context') || (req.path === '/download' ? req.query.scope : undefined);
      const scope = scopeOf(identity.profile);
      if (requestedScope !== undefined && !sameToken(requestedScope, scope)) throw failure('A VPS ou a pasta deste projeto mudou. Reabra o projeto na conexão correta.', 409);
      const entry = await context(cookie, identity);
      // Recheck after the SSH handshake: logout or connection rotation may have happened.
      const current = await authorize(cookie, entry.controller.signal);
      if (!sameProfile(current.profile, entry.profile)) { remove(entry); throw failure('A VPS mudou durante a abertura dos projetos.', 409); }
      entry.active++; entry.lastUsed = Date.now();
      let released = false;
      const release = () => { if (released) return; released = true; entry.active--; entry.lastUsed = Date.now(); };
      res.once('finish', release); res.once('close', release);
      const options = { config, connection: entry.client, workspace: entry.profile.workspace };
      entry.projects ||= projectFactory(options);
      req.projects = entry.projects;
      req.projectContext = { entry, workspace: entry.profile.workspace, canWrite: config.sandbox !== 'read-only' && config.readOnly !== true, status: current.status, scope };
      req.downloadFiles = new WorkspaceFiles({ mode: 'ssh' }, { workspace: () => entry.profile.workspace, transport: { connection: entry.client, get ready() { return !entry.closed; } } });
      next();
    } catch (error) { next(error); }
  });

  app.use('/api/projects', express.json({ limit: '7mb' }));
  app.use('/api/projects', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))) return next(failure('Envie os dados da ação em um objeto JSON.'));
    next();
  });
  app.get('/api/projects/status', (req, res) => res.json({ connected: true, workspace: req.projectContext.workspace, canWrite: req.projectContext.canWrite, scope: req.projectContext.scope }));
  app.get('/api/projects/catalog', async (req, res) => res.json(await req.projects.projects()));
  app.get('/api/projects/list', async (req, res) => {
    const listing = await req.projects.list(req.query.path || '.', { showHidden: req.query.hidden === '1' });
    res.json({ ...listing, files: listing.files || listing.entries || [] });
  });
  app.get('/api/projects/file', async (req, res) => res.json(await req.projects.open(req.query.path)));
  app.put('/api/projects/file', async (req, res) => res.json(await req.projects.save(req.body?.path, req.body?.content, req.body?.revision)));
  app.post('/api/projects/create', async (req, res) => res.status(201).json(await req.projects.create(req.body)));
  app.get('/api/projects/git', async (req, res) => {
    const info = await req.projects.gitInfo(req.query.path || '.');
    res.json({ ...info, changedCount: Array.isArray(info.changedFiles) ? info.changedFiles.length : Number(info.changedCount) || 0 });
  });
  app.post('/api/projects/clone', async (req, res) => res.status(201).json({ project: await req.projects.clone(req.body) }));
  app.get('/api/projects/download', async (req, res) => {
    if (typeof req.query.path !== 'string' || !req.query.path) throw failure('Selecione um arquivo para baixar.');
    await req.downloadFiles.download(req.query.path, res);
  });
  app.use((req, res) => res.status(404).json({ error: 'Rota de projetos não encontrada.' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status || 502;
    res.status(status).json({ error: error.expose ? error.message : 'Não foi possível acessar os projetos. Confira a conexão da VPS e tente novamente.' });
  });

  const verify = setInterval(() => {
    for (const entry of connections.values()) {
      if (!entry.active && Date.now() - entry.lastUsed > idleMs) { remove(entry); continue; }
      if (entry.closed || entry.verifying) continue;
      entry.verifying = true;
      void authorize(entry.cookie, entry.controller.signal).then(identity => { if (!sameProfile(identity.profile, entry.profile)) remove(entry); }).catch(() => remove(entry)).finally(() => { entry.verifying = false; });
    }
  }, verifyIntervalMs);
  verify.unref();
  return { app, async close() { if (closing) return; closing = true; clearInterval(verify); for (const entry of connections.values()) remove(entry); } };
}
