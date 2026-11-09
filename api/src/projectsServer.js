import { loadConfig } from './config/env.js';
import { createProjectsApp } from './projectsApp.js';

try {
  const config = loadConfig();
  const port = Number(process.env.PROJECTS_PORT || 3102);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || port === config.port || port === Number(process.env.TERMINAL_INPUT_PORT || 3101)) throw new Error('PROJECTS_PORT deve ser uma porta local livre.');
  const runtime = createProjectsApp({ config });
  const server = runtime.app.listen(port, '127.0.0.1', () => console.log(`Projetos: http://127.0.0.1:${port}`));
  server.requestTimeout = 240000;
  server.on('error', error => { console.error('Falha ao iniciar projetos:', error.code || error.name); process.exitCode = 1; void runtime.close(); });
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true; server.close();
    await runtime.close(); server.closeAllConnections();
  };
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
} catch (error) { console.error('Projetos:', error.message); process.exitCode = 1; }
