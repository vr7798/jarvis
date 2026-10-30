import { loadConfig } from './config/env.js';
import { createApp } from './app.js';

try {
  const config = loadConfig();
  const runtime = createApp(config);
  const server = runtime.app.listen(config.port, config.host, () => {
    console.log(`Luck API: http://${config.host}:${config.port} · modo ${config.mode}`);
    console.log(`Abra ${config.origin} · workspace: ${config.workspace}`);
  });
  server.on('error', err => { console.error('Não foi possível abrir a porta:', err.message); process.exitCode = 1; runtime.close(); });
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    const timer = setTimeout(() => process.exit(1), 8000);
    timer.unref();
    server.close();
    await runtime.close();
    server.closeAllConnections();
    clearTimeout(timer);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (err) {
  console.error('Luck:', err.message);
  process.exitCode = 1;
}
