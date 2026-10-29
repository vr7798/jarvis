import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../api/src/services/password.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const envPath = path.join(root, 'api', '.env');
if (fs.existsSync(envPath) && !process.argv.includes('--reset')) {
  console.log('api/.env já existe. Para redefinir o login: npm run setup -- --reset');
  process.exit(0);
}
if (!process.stdin.isTTY) {
  console.error('Execute npm run setup em um terminal interativo (Git Bash, PowerShell ou WSL).');
  process.exit(1);
}
const prompt = createInterface({ input: process.stdin, output: process.stdout });
const username = (await prompt.question('Seu login [admin]: ')).trim() || 'admin';
prompt.close();
if (!/^[\w.@-]{3,64}$/.test(username)) throw new Error('Use um login com 3 a 64 letras, números ou . @ _ -');

function secret(question) {
  process.stdout.write(question);
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const done = () => { process.stdin.off('keypress', onKey); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); };
    const onKey = (text, key = {}) => {
      if (key.ctrl && key.name === 'c') { done(); reject(new Error('Configuração cancelada.')); }
      else if (key.name === 'return' || key.name === 'enter') { done(); resolve(value); }
      else if (key.name === 'backspace') { if (value.length) { value = value.slice(0, -1); process.stdout.write('\b \b'); } }
      else if (text && !key.ctrl && !key.meta && !/[\r\n\x00-\x1f\x7f]/.test(text)) { value += text; process.stdout.write('*'.repeat(text.length)); }
    };
    process.stdin.on('keypress', onKey);
  });
}
const password = await secret('Senha (mínimo 12 caracteres): ');
if (password.length < 12 || password.length > 200) throw new Error('A senha precisa ter de 12 a 200 caracteres.');
if (password !== await secret('Confirme a senha: ')) throw new Error('As senhas não coincidem.');
let content = fs.readFileSync(fs.existsSync(envPath) ? envPath : path.join(root, 'api', '.env.example'), 'utf8');
for (const [key, value] of Object.entries({ JARVIS_USERNAME: username, JARVIS_PASSWORD_HASH: await hashPassword(password), SESSION_SECRET: randomBytes(48).toString('hex') })) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  content = re.test(content) ? content.replace(re, () => line) : `${content}\n${line}\n`;
}
fs.writeFileSync(envPath, content, { mode: 0o600 });
if (process.platform !== 'win32') fs.chmodSync(envPath, 0o600);
console.log('Login configurado! Execute npm run dev e abra http://localhost:5173.');
