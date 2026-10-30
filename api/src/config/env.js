import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const apiRoot = fileURLToPath(new URL('../../', import.meta.url));
dotenv.config({ path: path.join(apiRoot, '.env'), quiet: true });

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const config = {
    production,
    host: env.HOST || '127.0.0.1',
    port: Number(env.PORT || 3100),
    origin: env.APP_ORIGIN || 'http://localhost:5173',
    username: env.JARVIS_USERNAME || 'admin',
    passwordHash: env.JARVIS_PASSWORD_HASH || '',
    sessionSecret: env.SESSION_SECRET || '',
    mode: env.CODEX_MODE || 'mock',
    workspace: path.resolve(apiRoot, env.CODEX_WORKSPACE || './workspace'),
    dataDir: path.resolve(apiRoot, env.JARVIS_DATA_DIR || './data'),
    codexHome: path.resolve(apiRoot, env.CODEX_HOME || './data/codex'),
    bin: env.CODEX_BIN || 'codex',
    model: env.CODEX_MODEL || undefined,
    sandbox: env.CODEX_SANDBOX || 'workspace-write',
    allowFullAccess: env.CODEX_ALLOW_FULL_ACCESS === 'true',
    apiKey: env.OPENAI_API_KEY || '',
  };
  if (!/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(config.passwordHash) || config.sessionSecret.length < 48) {
    throw new Error('Configure o login primeiro: na raiz do projeto execute npm run setup.');
  }
  const url = new URL(config.origin);
  if (url.origin !== config.origin || !['http:', 'https:'].includes(url.protocol)) throw new Error('APP_ORIGIN deve conter somente a origem, sem barra final.');
  if (production && url.protocol !== 'https:') throw new Error('Produção exige APP_ORIGIN com HTTPS.');
  if (!['mock', 'codex', 'ssh'].includes(config.mode)) throw new Error('CODEX_MODE deve ser mock, codex ou ssh.');
  if (!['read-only', 'workspace-write', 'danger-full-access'].includes(config.sandbox)) throw new Error('CODEX_SANDBOX deve ser read-only, workspace-write ou danger-full-access.');
  if (config.sandbox === 'danger-full-access' && !config.allowFullAccess) throw new Error('CODEX_SANDBOX=danger-full-access exige CODEX_ALLOW_FULL_ACCESS=true.');
  if (config.mode === 'codex' && !config.apiKey) throw new Error('Preencha OPENAI_API_KEY em api/.env para usar CODEX_MODE=codex.');
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('PORT inválida.');
  return config;
}
