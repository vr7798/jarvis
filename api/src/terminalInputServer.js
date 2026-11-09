import { loadConfig } from './config/env.js';
import { createTerminalInputGateway } from './services/terminalInputGateway.js';

try {
  const config = loadConfig();
  const port = Number(process.env.TERMINAL_INPUT_PORT || 3101);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || port === config.port) throw new Error('TERMINAL_INPUT_PORT deve ser uma porta livre entre 1 e 65535.');
  const runtime = createTerminalInputGateway({ origin: config.origin, apiBase: `http://127.0.0.1:${config.port}` });
  runtime.server.listen(port, '127.0.0.1', () => console.log(`Terminal input: http://127.0.0.1:${port}`));
  runtime.server.on('error', error => { console.error('Falha ao iniciar terminal input:', error.code || error.name); process.exitCode = 1; void runtime.close(); });
  const shutdown = () => { void runtime.close(); };
  process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
} catch (error) { console.error('Terminal input:', error.message); process.exitCode = 1; }
