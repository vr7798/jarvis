#!/usr/bin/env bash
# Jarvis SSH. Git Bash / WSL. Nenhum servico e alterado automaticamente.
set -Eeuo pipefail
trap 'printf "\nFalha na linha %s. Confira a mensagem anterior antes de tentar novamente.\n" "$LINENO" >&2' ERR
command -v node >/dev/null || { printf 'Instale Node.js antes de atualizar.\n' >&2; exit 1; }
if [[ ! -f package.json || ! -d api/src || ! -d front/src ]]; then
  printf 'Execute na raiz do seu projeto Jarvis, ao lado de package.json.\n' >&2
  exit 1
fi
node -e 'if(require("./package.json").name!=="jarvis-web")process.exit(1)' || { printf 'Esta pasta nao foi reconhecida como o projeto Jarvis.\n' >&2; exit 1; }
mkdir -p .jarvis-backups
jarvis_backup="$(mktemp -d .jarvis-backups/ssh-update-XXXXXXXX)"
if [[ -f api/.env ]]; then mkdir -p "$jarvis_backup/api"; cp -- api/.env "$jarvis_backup/api/.env"; fi
printf 'Backup dos arquivos substituidos em: %s\n' "$jarvis_backup"
mkdir -p -- api
mkdir -p -- api/src
mkdir -p -- api/src/config
mkdir -p -- api/src/controllers
mkdir -p -- api/src/middleware
mkdir -p -- api/src/models
mkdir -p -- api/src/routes
mkdir -p -- api/src/services
mkdir -p -- api/test
mkdir -p -- deploy
mkdir -p -- front
mkdir -p -- front/src
mkdir -p -- scripts
if [[ -f .gitignore ]]; then
  mkdir -p -- "$jarvis_backup/."
  cp -- .gitignore "$jarvis_backup/.gitignore"
fi
cat > .gitignore <<'JARVIS_FILE_BC37D034BAD56458'
node_modules/
dist/
.env
.env.*
!.env.example
api/data/
api/workspace/
*.log
coverage/
.DS_Store
Thumbs.db
.jarvis-backups/
JARVIS_FILE_BC37D034BAD56458
if [[ -f README.md ]]; then
  mkdir -p -- "$jarvis_backup/."
  cp -- README.md "$jarvis_backup/README.md"
fi
cat > README.md <<'JARVIS_FILE_B335630551682C19'
# Jarvis — seu chat privado para o Codex da VPS

React no navegador, API Node.js e conexão SSH com o Codex instalado na sua VPS. Depois do login no Jarvis, você informa o servidor, o usuário SSH, a senha e a pasta de trabalho. O painel mostra mensagens, comandos, alterações de arquivos e pedidos de aprovação numa interface de chat.

O caminho é **navegador → API do Jarvis → SSH → Codex na VPS**. Quem abre a conexão SSH é a API Node.js; o navegador conversa com a API por HTTP no desenvolvimento e HTTPS na publicação. O Codex trabalha no servidor remoto e usa a autenticação que já existe para aquele usuário SSH. O Jarvis não copia tokens do terminal e não importa automaticamente suas conversas antigas.

A [documentação oficial da OpenAI sobre conexões remotas](https://learn.chatgpt.com/docs/remote-connections) descreve a execução do Codex App Server por SSH no servidor remoto. Este projeto é um cliente pessoal para acessar sua própria máquina. Os limites, modelos e permissões da conta autenticada na VPS continuam valendo: SSH não fornece créditos nem contorna cotas.

## 1. Criar no Windows

Instale Node.js 24 LTS (ou versão 22.12 ou superior) e Git for Windows. Abra **Git Bash** na Área de Trabalho, salve `script.sh` ali e execute:

```bash
bash script.sh
cd jarvis
npm install
npm run setup
npm run dev
```

O script cria uma pasta nova e recusa um destino que já existe. Ele não altera PM2, Nginx, firewall ou certificados. Também funciona no WSL; nesse caso, instale Node.js dentro do Linux. O `.sh` não roda diretamente no Prompt de Comando.

O `setup` pede seu usuário e uma senha de pelo menos 12 caracteres, grava o hash e gera um segredo de sessão em `api/.env`. Nenhuma senha padrão acompanha o projeto. Para redefinir o login depois:

```bash
npm run setup -- --reset
```

Acesse **http://localhost:5173** e faça login. A API escuta em `127.0.0.1:3100`; o Vite encaminha `/api` para ela.

## 2. Conectar à sua VPS por SSH

No `api/.env`, use:

```dotenv
CODEX_MODE=ssh
CODEX_BIN=codex
CODEX_SANDBOX=workspace-write
OPENAI_API_KEY=
```

O exemplo novo já vem com `CODEX_MODE=ssh`. Reinicie a API depois de alterar o `.env`. Neste modo, não é necessário instalar Codex no notebook nem preencher uma chave da API no Jarvis.

### Preparar o usuário remoto

Entre na VPS pelo terminal que você já usa e, com o mesmo usuário que pretende informar no Jarvis, confira:

```bash
codex --version
codex login status
```

Se o Codex ainda não estiver instalado ou autenticado nesse usuário:

```bash
npm install -g @openai/codex
codex login
```

O comando `codex` precisa estar disponível no shell de login desse usuário. Se a instalação estiver em um caminho específico, informe o caminho absoluto do executável em `CODEX_BIN` no `.env` da API. A VPS remota deve usar Linux com um shell compatível com os comandos POSIX usados pelo projeto.

Cada usuário tem sua própria autenticação e suas permissões. Um login do Codex feito como `root`, por exemplo, não autentica automaticamente outro usuário SSH. Se o Codex remoto estiver usando uma chave de API sem saldo, o erro de cota continuará; confirme a forma de autenticação com `codex login status`.

### Abrir a conexão no painel

Na tela de conexão, preencha:

- Endereço/IP da VPS e porta SSH, normalmente `22`.
- Usuário SSH, igual ao usado no terminal.
- Pasta de trabalho absoluta na VPS, por exemplo `/root/codex` ou um projeto em `/var/www`.

Clique em **Verificar servidor**. O painel busca a impressão digital SHA256 da chave SSH sem transmitir sua senha. Compare o resultado com a chave da sua VPS por um canal que você já confia, como o console do provedor ou uma sessão SSH já verificada. No console da VPS, a chave Ed25519 costuma ser consultada com:

```bash
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

O servidor também pode negociar outro tipo de chave. Para consultar as chaves públicas de host disponíveis:

```bash
for key in /etc/ssh/ssh_host_*_key.pub; do ssh-keygen -lf "$key"; done
```

Confira o valor `SHA256:...` correspondente, confirme a impressão digital na tela, informe a senha SSH e clique em **Conectar à VPS**. A conexão verifica a mesma chave antes de enviar a senha. Não confirme uma chave diferente sem descobrir por que mudou.

A senha é usada apenas na memória durante a conexão: não vai para `.env`, JSON de histórico ou armazenamento do navegador. Sair do Jarvis, expirar a sessão ou reiniciar a API fecha a conexão; para conectar novamente, informe a senha outra vez. Não exponha o Codex App Server em uma porta pública: sua comunicação passa pelo canal SSH criptografado.

Depois de conectar, crie uma **nova conversa** e teste:

> Crie teste-jarvis.txt na pasta de trabalho com o conteúdo “Jarvis conectado por SSH”. Depois leia o arquivo e confirme o conteúdo.

O arquivo será criado na pasta escolhida **na VPS**. O Codex recebe as permissões do usuário SSH e o sandbox configurado. `workspace-write` permite escrita na pasta de trabalho; `read-only` permite somente leitura. O projeto não altera permissões ou desativa o sandbox automaticamente.

`CODEX_MODEL` é opcional: vazio usa a seleção padrão do Codex remoto. `CODEX_WORKSPACE` e `CODEX_HOME` são usados no modo local por API; em SSH, a pasta é escolhida na interface e a autenticação permanece na configuração do usuário remoto.

### Uso pessoal e serviços publicados

A conexão SSH pessoal com sua própria VPS não transforma o plano do Codex em créditos da API. Ela continua sujeita à autenticação, ao acesso a modelos e às cotas da conta remota.

Para oferecer um serviço a outras pessoas, não reutilize sua autenticação pessoal do CLI como credencial compartilhada. A [documentação do App Server](https://learn.chatgpt.com/docs/app-server) distingue clientes locais/de código aberto de serviços comerciais ou hospedados e orienta estes últimos a usar **Sign in with ChatGPT** ou a integração adequada por API. Este exemplo não implementa esse login de produto nem garante que o login pessoal do CLI possa autenticar qualquer serviço hospedado.

## Outros modos

Em `api/.env`, `CODEX_MODE` aceita:

| Modo | Funcionamento |
|---|---|
| `ssh` | A API conecta à VPS escolhida e inicia `codex app-server` pelo SSH. Usa a autenticação do usuário remoto. |
| `mock` | Demonstração sem chave, sem SSH e sem executar comandos. |
| `codex` | Inicia o Codex na máquina da API e autentica com `OPENAI_API_KEY`. Usa cobrança e limites da API. |

Para testar somente a interface, use `CODEX_MODE=mock`. Para manter o modo local por chave, instale `@openai/codex` na máquina da API e configure:

```dotenv
CODEX_MODE=codex
OPENAI_API_KEY=sua_chave_da_api
CODEX_WORKSPACE=./workspace
CODEX_HOME=./data/codex
```

Nesse modo, a chave fica no servidor. Nunca coloque a chave em variáveis `VITE_` ou no código React.

## Atualizar o projeto que você já instalou

Se você baixou `atualizar-ssh.sh`, coloque-o na raiz do projeto atual (ao lado de `package.json`). Pare `npm run dev` com Ctrl+C e, no Git Bash dessa pasta, execute:

```bash
bash atualizar-ssh.sh
npm install
npm run dev
```

O atualizador cria uma cópia dos arquivos que substitui em `.jarvis-backups`, preserva o histórico e as credenciais e muda apenas `CODEX_MODE=ssh` no `.env`. Essa pasta de backup é privada e fica fora do Git. O atualizador não instala dependências nem reinicia serviços por conta própria.

Se preferir atualizar manualmente pelo ZIP, siga os passos abaixo.

Não rode o gerador sobre a pasta existente: ele recusa sobrescrever arquivos. Faça uma cópia privada de segurança do projeto, principalmente `api/.env` e `api/data`.

Extraia o novo ZIP em outra pasta. Copie os arquivos de código e configuração do projeto novo para sua pasta atual, incluindo `package.json`, `package-lock.json`, `api/src`, `api/test`, `api/package.json`, `front`, `scripts` e os exemplos de publicação. **Preserve seu `api/.env` e seu `api/data`; não os substitua por arquivos de outra instalação.**

Na raiz da sua pasta atual:

```bash
npm install
```

Edite o `.env` existente para `CODEX_MODE=ssh`, reinicie `npm run dev`, faça login e conecte à VPS. Use uma nova conversa para o novo modo/servidor. As conversas anteriores permanecem no histórico, mas não são automaticamente transferidas entre máquinas ou autenticações.

## Estrutura e dados

```text
jarvis/
├── api/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   └── services/
│   ├── data/              # histórico e dados privados; fora do Git
│   ├── workspace/         # pasta padrão do modo local por API
│   └── .env               # credenciais do painel; fora do Git
├── front/                 # React + Vite
├── deploy/                # exemplo de Nginx
├── scripts/               # configuração inicial
└── ecosystem.config.cjs   # exemplo de PM2
```

Não é necessário MongoDB para este uso individual: o histórico fica em JSON em `api/data/store.json`. Há limites de conversas e mensagens para evitar crescimento indefinido. Sessões de login ficam em memória: reiniciar a API exige novo login e nova conexão SSH, mas preserva o histórico. Reiniciar ou desconectar durante uma tarefa pode interrompê-la; confira o resultado na VPS antes de repetir comandos.

## Enviar para seu GitHub

Na pasta gerada:

```bash
git init
git add .
git commit -m "Cria painel Jarvis com SSH"
git branch -M main
git remote add origin URL_DO_SEU_REPOSITORIO
git push -u origin main
```

A `.gitignore` exclui `.env`, credenciais, histórico, dependências e build. Não acrescente esses arquivos ao Git manualmente. Em outra instalação, crie seu próprio `.env` com o `setup`; o arquivo local não vai no clone.

## Publicar a interface depois na VPS

Os passos abaixo preparam a hospedagem da interface e sua API. A máquina que hospeda o Jarvis pode ser a própria VPS de destino ou outra máquina com acesso SSH a ela. O modo SSH continua usando o servidor informado na tela. Você não precisa instalar Codex na máquina que hospeda o Jarvis quando o destino SSH é outra máquina; o Codex precisa estar instalado e autenticado no destino.

O exemplo usa **jarvis.facil.sbs**. Confira o nome exato registrado: `facil.sbs` e um domínio com `á` são nomes diferentes. No DNS, crie o registro A de `jarvis` apontando para o IPv4 da hospedagem. Só crie AAAA se o IPv6 estiver configurado e acessível. Preserve o uso pessoal e a distinção de autenticação explicada acima.

Execute o painel com um usuário dedicado. Os comandos pressupõem Node.js, Git, PM2 e permissões para a pasta escolhida:

```bash
cd /var/www
git clone URL_DO_SEU_REPOSITORIO jarvis
cd jarvis
npm ci
npm run setup
npm run build
```

Edite `/var/www/jarvis/api/.env` antes de iniciar:

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3100
APP_ORIGIN=https://jarvis.facil.sbs
CODEX_MODE=ssh
CODEX_BIN=codex
CODEX_SANDBOX=workspace-write
OPENAI_API_KEY=
```

Mantenha o usuário, o hash da senha e `SESSION_SECRET` criados pelo `setup`. A senha SSH será informada na interface, não no `.env`. Em produção, o cookie exige HTTPS; o login por HTTP não serve como teste de produção.

```bash
pm2 start ecosystem.config.cjs --env production
pm2 save
```

Configure o boot com `pm2 startup`, seguindo o comando indicado para o usuário da aplicação. O front compilado é servido pela própria API; não rode Vite ou `npm run dev` na publicação.

### Nginx e HTTPS

`deploy/nginx.conf.example` é um exemplo para um site novo. Confira domínio e porta e use um arquivo próprio, preservando a configuração dos sites existentes.

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/jarvis
sudo ln -s /etc/nginx/sites-available/jarvis /etc/nginx/sites-enabled/jarvis
sudo nginx -t
sudo systemctl reload nginx
```

Se Certbot já estiver instalado, não precisa reinstalá-lo. Caso falte no Ubuntu:

```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx
```

Com DNS correto e portas 80/443 acessíveis:

```bash
sudo certbot --nginx -d jarvis.facil.sbs
sudo certbot renew --dry-run
```

A porta 3100 fica no loopback, atrás do Nginx. O exemplo desativa buffering na rota de eventos para transmitir mensagens em tempo real. Não abra uma porta pública para o Codex App Server.

## Comandos e diagnóstico

```bash
npm run dev     # API + front em desenvolvimento
npm run setup   # cria credenciais do painel
npm run build   # compila o front
npm start       # API e front compilado
npm test        # verificações automatizadas da API
```

Para atualizar uma publicação, após revisar as mudanças:

```bash
git pull
npm ci
npm run build
pm2 restart jarvis --update-env
```

Se o SSH não conectar, confira host, porta, usuário, senha e impressão digital. Se o SSH conectar mas o Codex falhar, execute `codex --version` e `codex login status` no terminal remoto com o mesmo usuário e confira a pasta selecionada. Erro de cota deve ser resolvido na conta que o Codex remoto usa; mudar o transporte não resolve saldo esgotado.

Em desenvolvimento, leia os logs da API iniciada por `npm run dev`; na publicação, use `pm2 logs jarvis`. Se o chat não atualizar pela internet, confira os ajustes de SSE do Nginx. O modo `mock` ajuda a separar problemas da interface de problemas do SSH/Codex.

Faça backups privados de `api/data` e `api/.env`. Comandos, respostas, logs e credenciais do Codex podem conter informações privadas. A senha SSH não deve aparecer em logs ou capturas de tela.
JARVIS_FILE_B335630551682C19
if [[ -f api/.env.example ]]; then
  mkdir -p -- "$jarvis_backup/api"
  cp -- api/.env.example "$jarvis_backup/api/.env.example"
fi
cat > api/.env.example <<'JARVIS_FILE_2FDD31C8EAEB05DB'
# Use npm run setup na raiz para gerar api/.env com credenciais próprias.
NODE_ENV=development
HOST=127.0.0.1
PORT=3100
APP_ORIGIN=http://localhost:5173
JARVIS_USERNAME=admin
JARVIS_PASSWORD_HASH=
SESSION_SECRET=

# ssh: conecta ao Codex da VPS; host, usuário, senha e pasta são informados no painel.
# mock: demonstração sem comandos. codex: execução local autenticada por chave API.
CODEX_MODE=ssh
# No modo ssh, este comando/caminho é executado na VPS remota.
CODEX_BIN=codex
CODEX_MODEL=
CODEX_SANDBOX=workspace-write

# Somente para o modo codex local por API; não controlam a pasta/autenticação do SSH.
CODEX_WORKSPACE=./workspace
CODEX_HOME=./data/codex
OPENAI_API_KEY=
JARVIS_FILE_2FDD31C8EAEB05DB
if [[ -f api/package.json ]]; then
  mkdir -p -- "$jarvis_backup/api"
  cp -- api/package.json "$jarvis_backup/api/package.json"
fi
cat > api/package.json <<'JARVIS_FILE_D0AB9C1CC78FBA97'
{
  "name": "@jarvis/api",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --watch src/server.js",
    "start": "node src/server.js",
    "test": "node --test test/*.test.js"
  },
  "dependencies": {
    "dotenv": "^17.2.3",
    "express": "^5.1.0",
    "express-rate-limit": "^8.2.1",
    "express-session": "^1.18.2",
    "helmet": "^8.1.0",
    "ssh2": "^1.17.0"
  }
}
JARVIS_FILE_D0AB9C1CC78FBA97
if [[ -f api/src/app.js ]]; then
  mkdir -p -- "$jarvis_backup/api/src"
  cp -- api/src/app.js "$jarvis_backup/api/src/app.js"
fi
cat > api/src/app.js <<'JARVIS_FILE_679E74AA03B7049E'
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

export function createApp(config, { transport, probe } = {}) {
  const app = express();
  const store = new ConversationStore(config.dataDir);
  const events = new Events();
  const chat = new ChatService(config, store, events, transport);
  const connection = new ConnectionService(config, chat, events, { probe });
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
  app.use('/api', apiRoutes(config, store, chat, events, connection));
  const dist = path.resolve(apiRoot, '../front/dist');
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { index: false }));
    app.get('/{*path}', (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.status || 500;
    res.status(status).json({ error: status >= 500 && !err.expose ? 'Falha interna. Confira a configuração e os logs da API.' : err.message });
    if (status >= 500) console.error('[Jarvis] Falha interna:', err.code || err.name);
  });
  return { app, store, chat, events, connection, async close() { clearInterval(pruneSessions); events.close(); await connection.close(); await chat.close(); } };
}
JARVIS_FILE_679E74AA03B7049E
if [[ -f api/src/config/env.js ]]; then
  mkdir -p -- "$jarvis_backup/api/src/config"
  cp -- api/src/config/env.js "$jarvis_backup/api/src/config/env.js"
fi
cat > api/src/config/env.js <<'JARVIS_FILE_0557B8FB1EED9933'
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
    apiKey: env.OPENAI_API_KEY || '',
  };
  if (!/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(config.passwordHash) || config.sessionSecret.length < 48) {
    throw new Error('Configure o login primeiro: na raiz do projeto execute npm run setup.');
  }
  const url = new URL(config.origin);
  if (url.origin !== config.origin || !['http:', 'https:'].includes(url.protocol)) throw new Error('APP_ORIGIN deve conter somente a origem, sem barra final.');
  if (production && url.protocol !== 'https:') throw new Error('Produção exige APP_ORIGIN com HTTPS.');
  if (!['mock', 'codex', 'ssh'].includes(config.mode)) throw new Error('CODEX_MODE deve ser mock, codex ou ssh.');
  if (!['read-only', 'workspace-write'].includes(config.sandbox)) throw new Error('CODEX_SANDBOX deve ser read-only ou workspace-write.');
  if (config.mode === 'codex' && !config.apiKey) throw new Error('Preencha OPENAI_API_KEY em api/.env para usar CODEX_MODE=codex.');
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('PORT inválida.');
  return config;
}
JARVIS_FILE_0557B8FB1EED9933
if [[ -f api/src/controllers/authController.js ]]; then
  mkdir -p -- "$jarvis_backup/api/src/controllers"
  cp -- api/src/controllers/authController.js "$jarvis_backup/api/src/controllers/authController.js"
fi
cat > api/src/controllers/authController.js <<'JARVIS_FILE_A029738E00DA3CA0'
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
          req.session.save(err => err ? next(err) : res.json({ user: req.session.user, csrfToken: req.session.csrfToken }));
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
JARVIS_FILE_A029738E00DA3CA0
if [[ -f api/src/controllers/connectionController.js ]]; then
  mkdir -p -- "$jarvis_backup/api/src/controllers"
  cp -- api/src/controllers/connectionController.js "$jarvis_backup/api/src/controllers/connectionController.js"
fi
cat > api/src/controllers/connectionController.js <<'JARVIS_FILE_DD52846BAE78F7CB'
export function connectionController(connection) {
  return {
    async probe(req, res) { res.json(await connection.probe(req.body)); },
    async connect(req, res) {
      const expiry = new Date(req.session.cookie.expires).getTime();
      res.json({ status: await connection.connect(req.sessionID, expiry, req.body) });
    },
    async disconnect(req, res) { await connection.disconnect(req.sessionID); res.json({ ok: true }); },
  };
}
JARVIS_FILE_DD52846BAE78F7CB
if [[ -f api/src/controllers/conversationController.js ]]; then
  mkdir -p -- "$jarvis_backup/api/src/controllers"
  cp -- api/src/controllers/conversationController.js "$jarvis_backup/api/src/controllers/conversationController.js"
fi
cat > api/src/controllers/conversationController.js <<'JARVIS_FILE_9885322CE6A56FE4'
export function conversationController(store, chat) {
  return {
    list(req, res) { res.json({ conversations: store.list().map(c => { const { messages, ...summary } = store.public(c); return summary; }) }); },
    create(req, res) { res.status(201).json({ conversation: store.public(store.create()) }); },
    read(req, res) { res.json({ conversation: store.public(req.conversation), approvals: chat.pending(req.conversation) }); },
    send(req, res) {
      const text = req.body?.text;
      if (typeof text !== 'string' || !text.trim() || text.length > 16000) return res.status(400).json({ error: 'Envie uma mensagem de 1 a 16.000 caracteres.' });
      chat.send(req.conversation, text.trim());
      res.status(202).json({ ok: true });
    },
    async interrupt(req, res) { await chat.interrupt(req.conversation); res.json({ ok: true }); },
    approve(req, res) {
      if (!['accept', 'decline'].includes(req.body?.decision)) return res.status(400).json({ error: 'Decisão inválida.' });
      chat.decide(req.params.id, req.body.decision);
      res.json({ ok: true });
    },
  };
}
JARVIS_FILE_9885322CE6A56FE4
if [[ -f api/src/middleware/auth.js ]]; then
  mkdir -p -- "$jarvis_backup/api/src/middleware"
  cp -- api/src/middleware/auth.js "$jarvis_backup/api/src/middleware/auth.js"
fi
cat > api/src/middleware/auth.js <<'JARVIS_FILE_2C2A2262202F577D'
export function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Faça login para continuar.' });
  next();
}
export function sameOrigin(origin) {
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.get('origin') !== origin) return res.status(403).json({ error: 'Origem inválida. Acesse pelo endereço configurado em APP_ORIGIN.' });
    next();
  };
}
export function requireCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!req.session.csrfToken || req.get('X-CSRF-Token') !== req.session.csrfToken) return res.status(403).json({ error: 'Sessão inválida. Atualize a página e faça login novamente.' });
  next();
}
JARVIS_FILE_2C2A2262202F577D
if [[ -f api/src/models/conversationStore.js ]]; then
  mkdir -p -- "$jarvis_backup/api/src/models"
  cp -- api/src/models/conversationStore.js "$jarvis_backup/api/src/models/conversationStore.js"
fi
cat > api/src/models/conversationStore.js <<'JARVIS_FILE_A120D9CA6969BF40'
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class ConversationStore {
  constructor(directory) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.file = path.join(directory, 'store.json');
    this.conversations = [];
    if (fs.existsSync(this.file)) {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (data.version !== 1 || !Array.isArray(data.conversations)) throw new Error('Histórico inválido; restaure o backup de data/store.json.');
      this.conversations = data.conversations;
    }
    for (const c of this.conversations) {
      if (c.busy) this.addMessage(c, 'system', 'O servidor reiniciou. A tarefa anterior foi interrompida; confira o resultado antes de repetir comandos.');
      c.busy = false;
      c.activeTurnId = null;
    }
    this.flush();
  }
  list() { return [...this.conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  get(id) { return this.conversations.find(c => c.id === id); }
  public(c) {
    const { threadId, contextKey, ...visible } = c;
    return visible;
  }
  create() {
    if (this.conversations.length >= 100) throw Object.assign(new Error('Limite de 100 conversas atingido. Faça backup e arquive o histórico antes de continuar.'), { status: 409 });
    const now = new Date().toISOString();
    const c = { id: randomUUID(), title: 'Nova conversa', createdAt: now, updatedAt: now, messages: [], busy: false, activeTurnId: null, threadId: null };
    this.conversations.push(c);
    this.flush();
    return c;
  }
  addMessage(c, role, text, id = randomUUID()) {
    const m = { id, role, text: String(text).slice(-64000), createdAt: new Date().toISOString() };
    c.messages.push(m);
    c.messages = c.messages.slice(-500);
    this.touch(c);
    return m;
  }
  upsert(c, id, role, text, append = false) {
    let m = c.messages.find(x => x.id === id);
    if (!m) m = this.addMessage(c, role, '', id);
    m.text = (append ? m.text + text : text).slice(-64000);
    this.touch(c);
  }
  touch(c) { c.updatedAt = new Date().toISOString(); this.schedule(); }
  schedule() {
    if (!this.timer) this.timer = setTimeout(() => { this.timer = null; this.flush(); }, 200);
  }
  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, conversations: this.conversations }), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }
}
JARVIS_FILE_A120D9CA6969BF40
if [[ -f api/src/routes/index.js ]]; then
  mkdir -p -- "$jarvis_backup/api/src/routes"
  cp -- api/src/routes/index.js "$jarvis_backup/api/src/routes/index.js"
fi
cat > api/src/routes/index.js <<'JARVIS_FILE_34C979F3040FA89F'
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
JARVIS_FILE_34C979F3040FA89F
if [[ -f api/src/server.js ]]; then
  mkdir -p -- "$jarvis_backup/api/src"
  cp -- api/src/server.js "$jarvis_backup/api/src/server.js"
fi
cat > api/src/server.js <<'JARVIS_FILE_8F03D222F4CD4537'
import { loadConfig } from './config/env.js';
import { createApp } from './app.js';

try {
  const config = loadConfig();
  const runtime = createApp(config);
  const server = runtime.app.listen(config.port, config.host, () => {
    console.log(`Jarvis API: http://${config.host}:${config.port} · modo ${config.mode}`);
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
  console.error('Jarvis:', err.message);
  process.exitCode = 1;
}
JARVIS_FILE_8F03D222F4CD4537
if [[ -f api/src/services/chatService.js ]]; then
  mkdir -p -- "$jarvis_backup/api/src/services"
  cp -- api/src/services/chatService.js "$jarvis_backup/api/src/services/chatService.js"
fi
cat > api/src/services/chatService.js <<'JARVIS_FILE_9D7E53E9D771456D'
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { CodexTransport } from './codexTransport.js';
import { SshTransport } from './sshTransport.js';

const approvalMethods = new Set(['item/commandExecution/requestApproval', 'item/fileChange/requestApproval']);

export class ChatService {
  approvals = new Map();
  loaded = new Set();
  mockRuns = new Map();
  runTokens = new Map();
  endedTurns = new Set();
  constructor(config, store, events, transport) {
    this.config = config;
    this.store = store;
    this.events = events;
    if (config.mode !== 'ssh') fs.mkdirSync(config.workspace, { recursive: true });
    this.transport = transport || (config.mode === 'ssh' ? new SshTransport() : new CodexTransport({ bin: config.bin, cwd: config.workspace, home: config.codexHome, apiKey: config.apiKey }));
    this.transport.on('notification', m => this.notification(m));
    this.transport.on('serverRequest', m => this.serverRequest(m));
    this.transport.on('offline', () => {
      this.loaded.clear();
      for (const c of this.store.list()) if (c.busy) this.fail(c, 'O processo Codex encerrou. Confira os resultados antes de reenviar a tarefa.');
    });
  }
  status() {
    return { mode: this.config.mode, workspace: this.workspace(), sandbox: this.config.sandbox,
      connected: this.config.mode === 'mock' || Boolean(this.transport.ready),
      detail: this.config.mode === 'mock' ? 'Demonstração: nenhum comando é executado.' : this.config.mode === 'ssh' ? 'Codex remoto via SSH · usa a autenticação existente na VPS' : 'Codex App Server · chave API · cobrança por uso' };
  }
  workspace() { return this.config.mode === 'ssh' ? this.transport.endpoint?.workspace || null : this.config.workspace; }
  contextKey() {
    const remote = this.transport.endpoint;
    return this.config.mode === 'ssh'
      ? JSON.stringify(['ssh', remote?.host, remote?.port, remote?.username, remote?.fingerprint, remote?.workspace])
      : JSON.stringify([this.config.mode, this.config.workspace]);
  }
  resetConnection() { this.loaded.clear(); }
  isBusy() { return this.store.list().some(c => c.busy); }
  async disconnect() {
    // Stop only the process/channel created by this panel. Closing SSH cannot
    // undo commands which already ran, or stop an unrelated Codex terminal.
    await this.transport.close();
    this.loaded.clear();
    for (const c of this.store.list()) if (c.busy) this.fail(c, 'A conexão foi encerrada. Confira os resultados na VPS antes de repetir comandos.');
  }
  pending(c) { return [...this.approvals.values()].filter(a => a.conversationId === c.id).map(({ id, conversationId, method, params }) => ({ id, conversationId, method, params })); }
  changed(c) { this.store.touch(c); this.events.publish(c.id); }
  clearApprovals(c) {
    for (const [id, a] of this.approvals) if (a.conversationId === c.id) {
      clearTimeout(a.timer);
      this.approvals.delete(id);
      if (a.resolve) a.resolve('decline');
      else { try { this.transport.response(a.rpcId, { decision: 'cancel' }); } catch {} }
    }
  }
  fail(c, message) {
    this.clearApprovals(c);
    if (c.activeTurnId) this.endedTurns.add(c.activeTurnId);
    this.runTokens.delete(c.id);
    this.store.addMessage(c, 'system', message);
    c.busy = false; c.activeTurnId = null;
    this.changed(c);
  }
  finish(c) {
    this.clearApprovals(c);
    if (c.activeTurnId) this.endedTurns.add(c.activeTurnId);
    this.runTokens.delete(c.id);
    c.busy = false; c.activeTurnId = null;
    this.changed(c);
  }
  send(c, text) {
    if (this.isBusy()) throw Object.assign(new Error('Aguarde a tarefa em andamento ou interrompa antes de enviar outra.'), { status: 409 });
    if (this.config.mode === 'ssh' && !this.transport.ready) throw Object.assign(new Error('Conecte sua VPS por SSH antes de enviar uma mensagem.'), { status: 409 });
    const contextKey = this.contextKey();
    if ((c.contextKey && c.contextKey !== contextKey) || (!c.contextKey && c.messages.length)) {
      throw Object.assign(new Error('Esta conversa pertence a outro ambiente ou versão. Crie uma nova conversa para o servidor e pasta atuais.'), { status: 409 });
    }
    c.contextKey = contextKey;
    c.busy = true;
    const token = randomUUID();
    this.runTokens.set(c.id, token);
    this.store.addMessage(c, 'user', text);
    if (c.title === 'Nova conversa') c.title = text.replace(/\s+/g, ' ').slice(0, 60);
    this.changed(c);
    this.store.flush();
    this.run(c, text, token).catch(async err => {
      if (this.runTokens.get(c.id) !== token) return;
      let message = String(err.message || err).replace(/sk-[\w-]+/g, '[chave removida]').slice(0, 600);
      if (this.config.apiKey) message = message.split(this.config.apiKey).join('[chave removida]');
      // A timed-out turn/start may already have started work. Close this owned
      // transport before admitting another task instead of leaving it running.
      if (this.config.mode !== 'mock') { await this.transport.close(); this.loaded.clear(); }
      if (this.runTokens.get(c.id) === token) this.fail(c, `Não foi possível concluir: ${message}`);
    });
  }
  async run(c, text, token) {
    if (this.config.mode === 'mock') return this.runMock(c, text);
    await this.transport.start();
    if (this.runTokens.get(c.id) !== token) return;
    const params = { cwd: this.workspace(), sandbox: this.config.sandbox, approvalPolicy: 'untrusted' };
    if (this.config.model) params.model = this.config.model;
    if (!c.threadId) {
      const result = await this.transport.request('thread/start', params);
      c.threadId = result.thread.id;
      this.loaded.add(c.threadId);
      this.store.flush();
    } else if (!this.loaded.has(c.threadId)) {
      await this.transport.request('thread/resume', { ...params, threadId: c.threadId });
      this.loaded.add(c.threadId);
    }
    if (this.runTokens.get(c.id) !== token) return;
    const result = await this.transport.request('turn/start', { threadId: c.threadId, input: [{ type: 'text', text }] });
    if (this.runTokens.get(c.id) === token) c.activeTurnId = result.turn.id;
    this.changed(c);
  }
  async runMock(c, text) {
    const controller = new AbortController();
    this.mockRuns.set(c.id, controller);
    c.activeTurnId = randomUUID();
    try {
      let reply = 'Olá! Sou o Jarvis em modo demonstração. O login, o histórico e a transmissão em tempo real estão funcionando.\n\nNenhum comando foi executado. Para acessar sua VPS, configure CODEX_MODE=ssh em api/.env, reinicie a API e conecte o servidor pela tela de SSH.\n\nVocê disse: ' + text;
      if (/aprova/i.test(text)) {
        const decision = await new Promise(resolve => {
          this.addApproval(c, { method: 'item/commandExecution/requestApproval', params: { reason: 'Teste de aprovação: este comando NÃO será executado.', command: 'echo "Olá, Jarvis"', cwd: this.config.workspace } }, resolve);
        });
        reply = decision === 'accept' ? 'Aprovação recebida! Este é um teste: nenhum comando foi executado.' : 'Você recusou a ação. Nenhum comando foi executado.';
      }
      const id = randomUUID();
      for (const chunk of reply.match(/.{1,20}|\n/g) || []) {
        await delay(30, undefined, { signal: controller.signal });
        this.store.upsert(c, id, 'assistant', chunk, true);
        this.events.publish(c.id);
      }
      this.finish(c);
    } catch (err) { if (err.name !== 'AbortError') throw err; }
    finally { this.mockRuns.delete(c.id); }
  }
  addApproval(c, request, resolve) {
    const id = randomUUID();
    const approval = { id, conversationId: c.id, method: request.method, params: request.params, rpcId: request.id, resolve };
    approval.timer = setTimeout(() => {
      if (!this.approvals.has(id)) return;
      this.decide(id, 'decline');
      this.store.addMessage(c, 'system', 'A solicitação de aprovação expirou e foi recusada.');
      this.changed(c);
    }, 10 * 60 * 1000);
    approval.timer.unref();
    this.approvals.set(id, approval);
    this.events.publish(c.id);
  }
  decide(id, decision) {
    const a = this.approvals.get(id);
    if (!a) throw Object.assign(new Error('Esta aprovação não está mais pendente.'), { status: 404 });
    const c = this.store.get(a.conversationId);
    if (!c?.busy) throw Object.assign(new Error('A tarefa já terminou.'), { status: 409 });
    if (a.resolve) a.resolve(decision);
    else this.transport.response(a.rpcId, { decision });
    clearTimeout(a.timer);
    this.approvals.delete(id);
    this.changed(c);
  }
  serverRequest(m) {
    const c = this.store.list().find(x => x.threadId === m.params?.threadId);
    if (c?.busy && !this.endedTurns.has(m.params.turnId) && (!m.params.turnId || c.activeTurnId === m.params.turnId) && approvalMethods.has(m.method)) return this.addApproval(c, m);
    this.transport.rejectRequest(m.id, 'Esta interface suporta aprovação de comandos e arquivos. A solicitação interativa recebida não é suportada.');
    if (c) { this.store.addMessage(c, 'system', `Solicitação não suportada pelo painel: ${m.method}. Nenhuma autorização foi concedida.`); this.changed(c); }
  }
  notification({ method, params: p = {} }) {
    const c = this.store.list().find(x => x.threadId === p.threadId);
    if (!c) return;
    const turnId = p.turnId || p.turn?.id;
    if (method !== 'serverRequest/resolved') {
      if (!c.busy || (turnId && this.endedTurns.has(turnId))) return;
      if (turnId && c.activeTurnId && turnId !== c.activeTurnId) return;
      if (turnId && !c.activeTurnId && method !== 'turn/started') return;
    }
    if (method === 'turn/started') c.activeTurnId = p.turn.id;
    if (method === 'item/agentMessage/delta') this.store.upsert(c, p.itemId, 'assistant', p.delta, true);
    if (method === 'item/commandExecution/outputDelta') this.store.upsert(c, p.itemId, 'tool', p.delta, true);
    if (method === 'item/started' && p.item?.type === 'commandExecution') this.store.upsert(c, p.item.id, 'tool', `$ ${p.item.command}\n`);
    if (method === 'item/started' && p.item?.type === 'fileChange') this.store.upsert(c, p.item.id, 'tool', `Alterações propostas · aguardando conclusão\n${(p.item.changes || []).map(x => `${x.path}\n${x.diff || ''}`).join('\n')}`);
    if (method === 'item/completed') {
      const item = p.item;
      if (item.type === 'agentMessage') this.store.upsert(c, item.id, 'assistant', item.text || '');
      if (item.type === 'commandExecution') this.store.upsert(c, item.id, 'tool', `$ ${item.command}\n${item.aggregatedOutput || ''}\n[${item.status}${item.exitCode != null ? ` · saída ${item.exitCode}` : ''}]`);
      if (item.type === 'fileChange') this.store.upsert(c, item.id, 'tool', `Arquivos · ${item.status}\n${(item.changes || []).map(x => `${x.path}\n${x.diff || ''}`).join('\n')}`);
    }
    if (method === 'serverRequest/resolved') {
      for (const [id, a] of this.approvals) if (a.rpcId === p.requestId) { clearTimeout(a.timer); this.approvals.delete(id); }
    }
    if (method === 'turn/completed') {
      if (p.turn.error) this.store.addMessage(c, 'system', `Codex: ${p.turn.error.message || 'A tarefa falhou.'}`);
      this.finish(c);
    }
    if (method === 'error' && !p.willRetry) this.fail(c, p.error?.message || 'O Codex encontrou um erro.');
    this.changed(c);
  }
  async interrupt(c) {
    if (!c.busy) return;
    if (this.config.mode === 'mock') {
      this.mockRuns.get(c.id)?.abort();
      this.finish(c);
      this.store.addMessage(c, 'system', 'Tarefa interrompida.');
    } else if (c.activeTurnId && c.threadId) {
      await this.transport.request('turn/interrupt', { threadId: c.threadId, turnId: c.activeTurnId });
    } else {
      // Do not release the task lock while turn/start is in flight: it may have
      // started work before its response reaches this process.
      throw Object.assign(new Error('O Codex está inicializando. Aguarde um instante e tente interromper novamente.'), { status: 409 });
    }
    this.changed(c);
  }
  async close() {
    for (const c of this.store.list()) if (c.busy) {
      this.mockRuns.get(c.id)?.abort();
      this.fail(c, 'O painel foi encerrado. Confira os resultados antes de repetir comandos.');
    }
    await this.transport.close();
    this.store.flush();
  }
}
JARVIS_FILE_9D7E53E9D771456D
if [[ -f api/src/services/codexTransport.js ]]; then
  mkdir -p -- "$jarvis_backup/api/src/services"
  cp -- api/src/services/codexTransport.js "$jarvis_backup/api/src/services/codexTransport.js"
fi
cat > api/src/services/codexTransport.js <<'JARVIS_FILE_5F1A6B1A53CEC401'
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const MAX_LINE_BYTES = 8 * 1024 * 1024;

// npm installs a .cmd shim on Windows, which cannot be spawned without a shell.
// Resolve the package entry point instead: arguments and paths remain separate.
export function codexLaunch(bin = 'codex') {
  if (/\.(?:mjs|cjs|js)$/i.test(bin)) return { command: process.execPath, args: [bin, 'app-server'] };
  if (process.platform !== 'win32' && !/\.(?:cmd|bat)$/i.test(bin)) return { command: bin, args: ['app-server'] };
  if (process.platform === 'win32' && /\.exe$/i.test(bin)) return { command: bin, args: ['app-server'] };
  const dirs = path.isAbsolute(bin) || bin.includes('/') || bin.includes('\\')
    ? [path.dirname(path.resolve(bin))]
    : (process.env.PATH || '').split(path.delimiter).filter(Boolean).map(p => p.replace(/^"|"$/g, ''));
  for (const dir of dirs) {
    const entry = path.join(dir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    if (existsSync(entry)) return { command: process.execPath, args: [entry, 'app-server'] };
    const native = path.join(dir, 'codex.exe');
    if (process.platform === 'win32' && existsSync(native)) return { command: native, args: ['app-server'] };
  }
  if (/\.(?:cmd|bat)$/i.test(bin) || bin === 'codex') {
    throw new Error('Codex não encontrado. Instale @openai/codex ou defina CODEX_BIN com o caminho de codex.exe ou bin/codex.js.');
  }
  return { command: bin, args: ['app-server'] };
}

function childEnvironment(home) {
  const env = { ...process.env, CODEX_HOME: home };
  for (const key of Object.keys(env)) {
    if (/^(JARVIS_|SESSION_|OPENAI_API_KEY$)/i.test(key)) delete env[key];
  }
  return env;
}

export class CodexTransport extends EventEmitter {
  constructor({ bin = 'codex', cwd = process.cwd(), home, apiKey, model, sandbox = 'workspace-write', spawnProcess = spawn, requestTimeoutMs = 30_000 } = {}) {
    super();
    this.options = { bin, cwd, home: home || path.join(cwd, 'data', 'codex'), apiKey, model, sandbox };
    this.spawnProcess = spawnProcess;
    this.requestTimeoutMs = requestTimeoutMs;
    this.ready = false;
    this.child = null;
    this.starting = null;
    this.sequence = 0;
    this.pending = new Map();
    this.closing = false;
  }

  safeError(message) {
    let text = String(message || 'Falha na comunicação com o Codex.');
    if (this.options.apiKey) text = text.split(this.options.apiKey).join('[redigido]');
    return text.slice(0, 1000);
  }

  async start() {
    if (this.ready) return;
    if (this.starting) return this.starting;
    this.starting = this.startProcess();
    try { await this.starting; } finally { this.starting = null; }
  }

  async startProcess() {
    if (!this.options.apiKey) throw new Error('Defina OPENAI_API_KEY no servidor para usar o modo Codex.');
    await mkdir(this.options.home, { recursive: true, mode: 0o700 });
    const launch = codexLaunch(this.options.bin);
    this.closing = false;
    let child;
    try {
      child = this.spawnProcess(launch.command, launch.args, {
        cwd: this.options.cwd,
        env: childEnvironment(this.options.home),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        shell: false,
      });
    } catch (error) { throw new Error(this.safeError(`Não foi possível iniciar o Codex: ${error.message}`)); }
    this.child = child;
    let buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      if (this.child !== child) return;
      buffer += chunk;
      if (Buffer.byteLength(buffer) > MAX_LINE_BYTES) {
        this.failed(child, new Error('Resposta do Codex excedeu o limite de transporte.'));
        child.kill('SIGTERM');
        return;
      }
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        let packet;
        try { packet = JSON.parse(line); } catch { continue; } // Non-protocol CLI diagnostics.
        this.receive(packet);
      }
    });
    // Drain diagnostics, but never forward stderr (it may include authentication data).
    child.stderr.on('data', () => {});
    child.stdin.on('error', () => {
      if (this.child === child) this.failed(child, new Error('A conexão de entrada do Codex foi encerrada.'));
    });
    child.on('error', error => this.failed(child, new Error(this.safeError(`Não foi possível iniciar o Codex: ${error.message}`))));
    child.on('exit', (code, signal) => this.failed(child, new Error(`Codex encerrado (${signal || code || 'saída'}).`)));
    try {
      await this.request('initialize', { clientInfo: { name: 'jarvis_web', title: 'Jarvis Web', version: '1.0.0' } });
      this.send({ method: 'initialized', params: {} });
      await this.request('account/login/start', { type: 'apiKey', apiKey: this.options.apiKey });
      if (this.child !== child) throw new Error('Codex foi encerrado durante a inicialização.');
      this.ready = true;
    } catch (error) {
      this.failed(child, error);
      child.kill('SIGTERM');
      throw error;
    }
  }

  receive(packet) {
    if (!packet || typeof packet !== 'object' || Array.isArray(packet)) return;
    if (typeof packet.method === 'string') {
      if (packet.id !== undefined) this.emit('serverRequest', { id: packet.id, method: packet.method, params: packet.params || {} });
      else this.emit('notification', { method: packet.method, params: packet.params || {} });
      return;
    }
    if (packet.id === undefined) return;
    const key = JSON.stringify(packet.id);
    const pending = this.pending.get(key);
    if (!pending) return;
    this.pending.delete(key);
    clearTimeout(pending.timer);
    if (packet.error) pending.reject(new Error(this.safeError(packet.error.message || 'Erro do Codex.')));
    else pending.resolve(packet.result);
  }

  send(packet) {
    if (!this.child || this.child.stdin.destroyed || !this.child.stdin.writable) throw new Error('Codex não está conectado.');
    this.child.stdin.write(`${JSON.stringify(packet)}\n`);
  }

  request(method, params = {}) {
    const id = ++this.sequence;
    const key = JSON.stringify(id);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(key);
        reject(new Error(`Tempo limite ao aguardar ${method}.`));
      }, this.requestTimeoutMs);
      this.pending.set(key, { resolve, reject, timer });
      try { this.send({ id, method, params }); } catch (error) {
        clearTimeout(timer);
        this.pending.delete(key);
        reject(error);
      }
    });
  }

  response(id, result) { this.send({ id, result }); }
  rejectRequest(id, message = 'Recurso não suportado por este cliente.') {
    this.send({ id, error: { code: -32601, message } });
  }

  failed(child, error) {
    if (this.child !== child) return;
    this.child = null;
    this.ready = false;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); }
    this.pending.clear();
    if (!this.closing) this.emit('offline', error);
  }

  async close() {
    const child = this.child;
    this.closing = true;
    if (!child) return;
    this.failed(child, new Error('Conexão com o Codex encerrada.'));
    await new Promise(resolve => {
      let finished = false;
      let terminate;
      let force;
      const done = () => {
        if (finished) return;
        finished = true;
        clearTimeout(terminate);
        clearTimeout(force);
        resolve();
      };
      child.once('exit', done);
      child.once('error', done);
      child.stdin.end();
      terminate = setTimeout(() => child.kill('SIGTERM'), 500);
      force = setTimeout(() => { child.kill('SIGKILL'); done(); }, 3000);
      terminate.unref?.();
      force.unref?.();
    });
  }
}
JARVIS_FILE_5F1A6B1A53CEC401
if [[ -f api/src/services/connectionService.js ]]; then
  mkdir -p -- "$jarvis_backup/api/src/services"
  cp -- api/src/services/connectionService.js "$jarvis_backup/api/src/services/connectionService.js"
fi
cat > api/src/services/connectionService.js <<'JARVIS_FILE_B61EF8DA452D495B'
import net from 'node:net';
import { probeHost } from './sshTransport.js';

const failure = (message, status = 400) => Object.assign(new Error(message), { status, expose: true });

export function validateTarget(body = {}) {
  const host = typeof body.host === 'string' ? body.host.trim() : '';
  const port = Number(body.port ?? 22);
  if (!host || host.length > 253 || (!net.isIP(host) && !/^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?$/.test(host))) throw failure('Informe um IP ou nome de servidor válido, sem http:// ou https://.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw failure('Informe uma porta SSH de 1 a 65535.');
  return { host: host.toLowerCase(), port };
}

export class ConnectionService {
  owner = null;
  connecting = false;
  closing = false;
  constructor(config, chat, events, { probe = probeHost } = {}) {
    this.config = config;
    this.chat = chat;
    this.events = events;
    this.probeRemote = probe;
    this.transport = chat.transport;
    this.transport.on('offline', () => { this.clearOwner(); this.events.publish(); });
    this.transport.on('disconnected', () => { this.clearOwner(); this.events.publish(); });
  }
  clearOwner() { clearTimeout(this.expiry); this.expiry = null; this.owner = null; }
  status(sessionId) {
    const status = this.chat.status();
    if (this.config.mode !== 'ssh') return status;
    const own = this.owner === sessionId;
    return { ...status, connected: own && Boolean(this.transport.ready), workspace: own ? status.workspace : null,
      connection: own && this.transport.ready ? this.transport.endpoint : null,
      busy: this.chat.isBusy(), ownedByAnotherSession: Boolean(this.owner && !own),
      detail: this.owner && !own ? 'Há uma conexão SSH aberta em outra sessão. Desconecte naquela sessão primeiro.' : this.connecting ? 'Conectando à VPS…' : status.detail };
  }
  ensureSsh() { if (this.config.mode !== 'ssh') throw failure('Configure CODEX_MODE=ssh e reinicie a API para usar SSH.', 409); }
  ensureOwner(sessionId) {
    if (this.config.mode !== 'ssh') return;
    if (this.owner !== sessionId || !this.transport.ready || this.closing) throw failure('Conecte sua VPS nesta sessão antes de continuar.', 409);
  }
  async probe(body) {
    this.ensureSsh();
    const target = validateTarget(body);
    try { return await this.probeRemote(target); }
    catch { throw failure('Não foi possível verificar o servidor SSH. Confira o endereço, a porta e a conexão de rede.', 502); }
  }
  async connect(sessionId, expiresAt, body = {}) {
    this.ensureSsh();
    if (this.owner || this.connecting || this.closing || this.chat.isBusy()) throw failure('Já existe uma conexão ou tarefa em andamento. Desconecte antes de trocar o servidor.', 409);
    const { host, port } = validateTarget(body);
    const { username, password, fingerprint, workspace } = body;
    if (typeof username !== 'string' || !/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,63}$/.test(username)) throw failure('Informe um usuário SSH válido.');
    if (typeof password !== 'string' || !password.length || password.length > 1024) throw failure('Informe a senha SSH.');
    if (typeof fingerprint !== 'string' || !/^SHA256:[A-Za-z0-9+/]{43}$/.test(fingerprint)) throw failure('Verifique e confirme a impressão digital do servidor primeiro.');
    if (typeof workspace !== 'string' || !workspace.startsWith('/') || workspace.length > 2048 || /[\x00-\x1f\x7f]/.test(workspace)) throw failure('A pasta na VPS deve ser um caminho Linux absoluto, por exemplo /root/codex.');
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw failure('Sua sessão expirou. Faça login novamente.', 401);
    this.owner = sessionId;
    this.connecting = true;
    this.expiry = setTimeout(() => { this.releaseSession(sessionId).catch(() => {}); }, expiresAt - Date.now());
    this.expiry.unref();
    this.events.publish();
    try {
      this.transport.configure({ host, port, username, password, fingerprint, workspace, bin: this.config.bin || 'codex' });
      await this.transport.start();
      if (this.owner !== sessionId || this.closing) throw failure('A sessão foi encerrada durante a conexão.', 409);
      this.chat.resetConnection();
      return this.status(sessionId);
    } catch (err) {
      await this.transport.close();
      this.clearOwner();
      const message = String(err.message || 'Falha na conexão SSH.').split(password).join('[senha removida]').slice(0, 600);
      throw failure(message, err.status || 502);
    } finally { this.connecting = false; this.events.publish(); }
  }
  async disconnect(sessionId, force = false) {
    this.ensureSsh();
    if (this.owner !== sessionId) throw failure('Esta conexão pertence a outra sessão ou já foi encerrada.', 409);
    if (!force && this.chat.isBusy()) throw failure('Interrompa a tarefa antes de desconectar a VPS.', 409);
    this.closing = true;
    try { await this.chat.disconnect(); }
    finally { this.clearOwner(); this.closing = false; this.events.publish(); }
  }
  async releaseSession(sessionId) {
    if (this.config.mode === 'ssh' && this.owner === sessionId) await this.disconnect(sessionId, true);
  }
  async close() { clearTimeout(this.expiry); if (this.owner) await this.releaseSession(this.owner); }
}
JARVIS_FILE_B61EF8DA452D495B
if [[ -f api/src/services/events.js ]]; then
  mkdir -p -- "$jarvis_backup/api/src/services"
  cp -- api/src/services/events.js "$jarvis_backup/api/src/services/events.js"
fi
cat > api/src/services/events.js <<'JARVIS_FILE_4CEE47613B2DF2D5'
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
JARVIS_FILE_4CEE47613B2DF2D5
if [[ -f api/src/services/password.js ]]; then
  mkdir -p -- "$jarvis_backup/api/src/services"
  cp -- api/src/services/password.js "$jarvis_backup/api/src/services/password.js"
fi
cat > api/src/services/password.js <<'JARVIS_FILE_5A11B4B8BB6963E6'
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${hash.toString('hex')}`;
}

export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 1024) return false;
  const [scheme, salt, expected] = encoded.split(':');
  if (scheme !== 'scrypt' || !/^[a-f0-9]{128}$/.test(expected || '')) return false;
  const hash = await scrypt(password, salt, 64);
  return timingSafeEqual(hash, Buffer.from(expected, 'hex'));
}
JARVIS_FILE_5A11B4B8BB6963E6
if [[ -f api/src/services/sshTransport.js ]]; then
  mkdir -p -- "$jarvis_backup/api/src/services"
  cp -- api/src/services/sshTransport.js "$jarvis_backup/api/src/services/sshTransport.js"
fi
cat > api/src/services/sshTransport.js <<'JARVIS_FILE_A7802A645D16D972'
import { EventEmitter } from 'node:events';
import ssh2 from 'ssh2';
import path from 'node:path';
import { CodexTransport } from './codexTransport.js';

const MAX_BUFFER = 8 * 1024 * 1024;
const { Client } = ssh2;

function validateAddress({ host, port = 22 }) {
  if (typeof host !== 'string' || !host || host.length > 253 || !/^[a-zA-Z0-9.:%_-]+$/.test(host)) throw new Error('Endereço SSH inválido. Informe somente o IP ou nome do servidor.');
  const number = Number(port);
  if (!Number.isInteger(number) || number < 1 || number > 65535) throw new Error('Porta SSH inválida.');
  return { host, port: number };
}

export function fingerprintFromHash(hash) {
  if (!/^[a-f0-9]{64}$/i.test(hash)) throw new Error('Chave de host SSH inválida.');
  return `SHA256:${Buffer.from(hash, 'hex').toString('base64').replace(/=+$/, '')}`;
}

export function quotePosix(value) { return `'${value.replace(/'/g, `'"'"'`)}'`; }

export function remoteCommand(workspace, bin = 'codex') {
  const inner = `cd -- ${quotePosix(workspace)} && exec ${quotePosix(bin)} app-server`;
  return `exec bash -lc ${quotePosix(inner)}`;
}

function connectionError(error, mismatch = false) {
  if (mismatch) return new Error('A impressão digital SSH não coincide. Confira a identidade da VPS antes de conectar.');
  if (error?.level === 'client-authentication') return new Error('O servidor SSH recusou o usuário ou a senha.');
  if (error?.code === 'ENOTFOUND') return new Error('Não foi possível encontrar o endereço da VPS.');
  if (error?.code === 'ECONNREFUSED') return new Error('A conexão SSH foi recusada. Confira a porta e o serviço SSH.');
  return new Error('A conexão SSH falhou ou foi encerrada. Confira o endereço, a porta e o acesso à VPS.');
}

// Probe deliberately rejects the key before SSH user authentication begins.
// Returning a fingerprint is discovery only; the user must independently check it.
export function probeHost(address, { ClientType = Client, timeoutMs = 10000 } = {}) {
  const endpoint = validateAddress(address);
  return new Promise((resolve, reject) => {
    const connection = new ClientType();
    let finished = false;
    const done = (error, result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      connection.destroy();
      if (error) reject(error); else resolve(result);
    };
    const timer = setTimeout(() => done(new Error('Tempo limite ao consultar a chave SSH da VPS.')), timeoutMs);
    connection.on('error', error => done(connectionError(error)));
    connection.on('close', () => { if (!finished) done(new Error('A VPS encerrou a consulta SSH antes de enviar a chave.')); });
    try {
      connection.connect({ ...endpoint, username: 'jarvis-host-probe', readyTimeout: timeoutMs, hostHash: 'sha256',
        hostVerifier: hash => { done(null, { fingerprint: fingerprintFromHash(hash) }); return false; },
      });
    } catch (error) { done(connectionError(error)); }
  });
}

export class SshTransport extends CodexTransport {
  constructor({ ClientType = Client, requestTimeoutMs = 30000, connectionTimeoutMs = 15000 } = {}) {
    super({ requestTimeoutMs });
    this.ClientType = ClientType;
    this.connectionTimeoutMs = connectionTimeoutMs;
    this.connection = null;
    this.credentials = null;
    this.endpoint = null;
    this.accountType = null;
    this.generation = 0;
  }

  configure(input) {
    if (this.child || this.starting || this.ready) throw Object.assign(new Error('Desconecte a sessão SSH atual antes de conectar outra.'), { status: 409 });
    const endpoint = validateAddress(input);
    const { username, password, fingerprint, workspace, bin = 'codex' } = input;
    if (typeof username !== 'string' || !/^[\w.@-]{1,128}$/.test(username)) throw new Error('Usuário SSH inválido.');
    if (typeof password !== 'string' || !password || password.length > 1024) throw new Error('Informe a senha SSH.');
    if (typeof fingerprint !== 'string' || !/^SHA256:[A-Za-z0-9+/]{43}$/.test(fingerprint)) throw new Error('Confirme a impressão digital SSH da VPS antes de conectar.');
    if (typeof workspace !== 'string' || workspace.length > 2048 || !path.posix.isAbsolute(workspace) || /[\x00-\x1f\x7f]/.test(workspace)) throw new Error('A pasta remota deve ser um caminho absoluto Linux, como /var/www.');
    if (typeof bin !== 'string' || !/^(?:\/[\w./-]+|[\w.-]+)$/.test(bin)) throw new Error('Caminho do Codex inválido. Informe codex ou um caminho absoluto sem argumentos.');
    this.credentials = { ...endpoint, username, password, fingerprint, workspace, bin };
    this.generation++;
    this.endpoint = { ...endpoint, username, workspace, fingerprint };
    this.accountType = null;
    this.closing = false;
  }

  async startProcess() {
    if (!this.credentials) throw new Error('Conecte sua VPS por SSH na interface antes de enviar uma mensagem.');
    const credentials = this.credentials;
    const connection = new this.ClientType();
    const child = new EventEmitter();
    child.stdin = null;
    this.connection = connection;
    this.child = child;
    this.closing = false;
    let mismatch = false;
    let buffer = '';
    const configuration = {
      host: credentials.host, port: credentials.port, username: credentials.username,
      password: credentials.password, readyTimeout: this.connectionTimeoutMs,
      keepaliveInterval: 15000, keepaliveCountMax: 3, hostHash: 'sha256',
      hostVerifier: hash => { mismatch = fingerprintFromHash(hash) !== credentials.fingerprint; return !mismatch; },
      tryKeyboard: false,
    };
    const command = remoteCommand(credentials.workspace, credentials.bin);
    // Credentials are connection-scoped, never saved for automatic reconnection.
    this.credentials = null;
    try {
      await new Promise((resolve, reject) => {
        let channelReady = false;
        const timer = setTimeout(() => {
          reject(new Error('Tempo limite ao iniciar o Codex pela conexão SSH.'));
          connection.destroy();
        }, this.connectionTimeoutMs);
        const fail = error => {
          clearTimeout(timer);
          const safe = connectionError(error, mismatch);
          if (!channelReady) reject(safe);
          this.failed(child, safe);
          connection.destroy();
        };
        connection.on('error', fail);
        connection.on('close', () => {
          clearTimeout(timer);
          if (!channelReady) reject(new Error('A conexão SSH foi encerrada durante a inicialização.'));
          this.failed(child, new Error('A conexão SSH com a VPS foi encerrada. Conecte novamente para continuar.'));
          if (this.connection === connection) this.connection = null;
        });
        connection.once('ready', () => {
          if (this.child !== child || this.closing) {
            clearTimeout(timer);
            reject(new Error('A conexão SSH foi cancelada.'));
            connection.destroy();
            return;
          }
          delete configuration.password;
          delete credentials.password;
          connection.exec(command, (error, stream) => {
            if (error) return fail(error);
            if (this.child !== child || this.closing) { stream.close(); connection.destroy(); reject(new Error('A conexão SSH foi cancelada.')); return; }
            channelReady = true;
            clearTimeout(timer);
            child.stdin = stream;
            child.stdout = stream;
            child.stderr = stream.stderr;
            stream.setEncoding('utf8');
            stream.on('data', chunk => {
              if (this.child !== child) return;
              buffer += chunk;
              if (Buffer.byteLength(buffer) > MAX_BUFFER) {
                this.failed(child, new Error('Resposta SSH excedeu o limite de transporte.'));
                connection.destroy();
                return;
              }
              let newline;
              while ((newline = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, newline).trim();
                buffer = buffer.slice(newline + 1);
                if (!line) continue;
                let packet;
                try { packet = JSON.parse(line); } catch { continue; }
                this.receive(packet);
              }
            });
            stream.stderr.on('data', () => {});
            stream.on('error', () => fail(new Error('SSH channel error')));
            stream.on('close', () => {
              this.failed(child, new Error('O Codex remoto encerrou. Confira se codex está instalado e autenticado na VPS.'));
              connection.end();
            });
            resolve();
          });
        });
        try { connection.connect(configuration); } catch (error) { fail(error); }
      });
      await this.request('initialize', { clientInfo: { name: 'jarvis_ssh', title: 'Jarvis SSH', version: '2.0.0' } });
      this.send({ method: 'initialized', params: {} });
      const result = await this.request('account/read', { refreshToken: false });
      if (result?.requiresOpenaiAuth && !result.account) throw new Error('Faça codex login no terminal da VPS com o mesmo usuário SSH e conecte novamente.');
      if (this.child !== child) throw new Error('A conexão SSH encerrou durante a inicialização.');
      this.accountType = result?.account?.type || 'external';
      this.ready = true;
    } catch (error) {
      delete credentials.password;
      delete configuration.password;
      this.failed(child, error);
      connection.destroy();
      if (this.connection === connection) this.connection = null;
      throw error;
    }
  }

  async close() {
    const generation = this.generation;
    this.closing = true;
    this.credentials = null;
    this.accountType = null;
    const child = this.child;
    const connection = this.connection;
    const stream = child?.stdin;
    if (child) this.failed(child, new Error('Conexão SSH encerrada.'));
    if (!connection) { this.emit('disconnected'); return; }
    await new Promise(resolve => {
      let finished = false;
      const finish = () => { if (finished) return; finished = true; clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => { connection.destroy(); finish(); }, 1000);
      connection.once('close', finish);
      try {
        if (!stream) connection.destroy();
        else { stream.end(); stream.close(); connection.end(); }
      } catch { connection.destroy(); finish(); }
    });
    if (this.connection === connection) this.connection = null;
    if (this.generation === generation) this.emit('disconnected');
  }
}
JARVIS_FILE_A7802A645D16D972
if [[ -f api/test/app.test.js ]]; then
  mkdir -p -- "$jarvis_backup/api/test"
  cp -- api/test/app.test.js "$jarvis_backup/api/test/app.test.js"
fi
cat > api/test/app.test.js <<'JARVIS_FILE_0B7EDE8EA3737503'
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/services/password.js';

const password = 'a-long-test-password-123';
const passwordHash = await hashPassword(password);
const roots = new Map();

class FakeTransport extends EventEmitter {
  ready = false;
  calls = [];
  replies = [];
  rejected = [];
  turn = 0;
  thread = 0;
  async start() { this.ready = true; }
  async request(method, params) {
    this.calls.push({ method, params });
    if (method === 'thread/start') return { thread: { id: `thread-${++this.thread}` } };
    if (method === 'thread/resume') return { thread: { id: params.threadId } };
    if (method === 'turn/start') return { turn: { id: `turn-${++this.turn}` } };
    return {};
  }
  response(id, result) { this.replies.push({ id, result }); }
  rejectRequest(id, message) { this.rejected.push({ id, message }); }
  async close() { this.ready = false; }
}

async function setup(t, { mode = 'mock', transport, directory } = {}) {
  const root = directory || await mkdtemp(path.join(os.tmpdir(), 'jarvis-app-'));
  roots.set(root, (roots.get(root) || 0) + 1);
  const config = {
    production: false, host: '127.0.0.1', port: 3100, origin: 'http://localhost:5173',
    username: 'owner', passwordHash, sessionSecret: 's'.repeat(64), mode,
    workspace: path.join(root, 'workspace'), dataDir: path.join(root, 'data'), codexHome: path.join(root, 'codex'),
    bin: 'codex', apiKey: mode === 'codex' ? 'test-only-api-key' : '', sandbox: 'workspace-write',
  };
  const runtime = createApp(config, { transport });
  const server = runtime.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  let stopped = false;
  const close = async () => {
    if (stopped) return;
    stopped = true;
    try { await runtime.close(); } finally {
      const closed = new Promise(resolve => server.close(resolve));
      server.closeAllConnections();
      await closed;
    }
  };
  t.after(async () => {
    try { await close(); } finally {
      roots.set(root, roots.get(root) - 1);
      if (!roots.get(root)) { roots.delete(root); await rm(root, { recursive: true, force: true }); }
    }
  });
  const request = async (url, { method = 'GET', body, cookie, csrf, origin = config.origin, raw = false } = {}) => {
    const headers = {};
    if (method !== 'GET') headers.Origin = origin;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    if (csrf) headers['X-CSRF-Token'] = csrf;
    const response = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (raw) return response;
    let data;
    try { data = await response.json(); } catch { data = null; }
    return { status: response.status, body: data, headers: response.headers };
  };
  const login = async (cookie) => {
    const result = await request('/api/auth/login', { method: 'POST', body: { username: 'owner', password }, cookie });
    assert.equal(result.status, 200);
    return { cookie: result.headers.get('set-cookie').split(';')[0], csrf: result.body.csrfToken, response: result };
  };
  const create = async auth => {
    const result = await request('/api/conversations', { method: 'POST', body: {}, ...auth });
    assert.equal(result.status, 201);
    return result.body.conversation;
  };
  return { ...runtime, base, config, root, request, login, create, close };
}

async function eventually(fn, timeout = 5000) {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() - start > timeout) throw new Error('Timed out waiting for asynchronous application state.');
    await delay(15);
  }
}

test('API is protected; login regenerates sessions; origin and CSRF checks protect state changes', async t => {
  const f = await setup(t);
  for (const route of ['/api/auth/me', '/api/status', '/api/conversations', '/api/events']) {
    assert.equal((await f.request(route)).status, 401);
  }
  const bad = await f.request('/api/auth/login', { method: 'POST', body: { username: 'owner', password: 'wrong' } });
  assert.equal(bad.status, 401);
  assert.equal(bad.headers.get('set-cookie'), null);
  assert.equal((await f.request('/api/auth/login', { method: 'POST', body: { username: 'owner', password }, origin: 'https://evil.example' })).status, 403);
  const auth = await f.login();
  assert.match(auth.response.headers.get('set-cookie'), /HttpOnly/);
  assert.match(auth.response.headers.get('set-cookie'), /SameSite=Strict/i);
  assert.ok(auth.csrf.length >= 32);
  assert.equal((await f.request('/api/auth/me', auth)).body.user.username, 'owner');
  assert.equal((await f.request('/api/conversations', { method: 'POST', cookie: auth.cookie, body: {} })).status, 403);
  assert.equal((await f.request('/api/conversations', { method: 'POST', ...auth, csrf: 'invalid', body: {} })).status, 403);
  assert.equal((await f.request('/api/conversations', { method: 'POST', ...auth, origin: 'https://evil.example', body: {} })).status, 403);
  const rotated = await f.login(auth.cookie);
  assert.notEqual(rotated.cookie, auth.cookie);
  assert.notEqual(rotated.csrf, auth.csrf);
  assert.equal((await f.request('/api/auth/me', auth)).status, 401);
  await f.create(rotated);
  assert.equal((await f.request('/api/auth/logout', { method: 'POST', body: {}, ...rotated })).status, 200);
  assert.equal((await f.request('/api/auth/me', rotated)).status, 401);
});

test('mock conversation streams SSE, rejects concurrent messages, and persists complete history across restart', async t => {
  const f = await setup(t);
  const auth = await f.login();
  const c = await f.create(auth);
  const stream = await f.request('/api/events', { ...auth, raw: true });
  assert.match(stream.headers.get('content-type'), /text\/event-stream/);
  const reader = stream.body.getReader();
  t.after(() => reader.cancel().catch(() => {}));
  assert.match(new TextDecoder().decode((await reader.read()).value), /event: update/);
  const text = 'Verifica meu painel, por favor.';
  assert.equal((await f.request(`/api/conversations/${c.id}/messages`, { method: 'POST', body: { text }, ...auth })).status, 202);
  assert.equal((await f.request(`/api/conversations/${c.id}/messages`, { method: 'POST', body: { text: 'Duplicada' }, ...auth })).status, 409);
  assert.match(new TextDecoder().decode((await reader.read()).value), /conversationId/);
  const completed = await eventually(async () => {
    const result = await f.request(`/api/conversations/${c.id}`, auth);
    return result.body.conversation.busy ? null : result.body.conversation;
  });
  assert.equal(completed.messages.filter(m => m.role === 'user').length, 1);
  assert.ok(completed.messages.some(m => m.role === 'assistant' && m.text.includes(text)));
  assert.equal(completed.threadId, undefined);
  await reader.cancel();
  await f.close();
  const restarted = await setup(t, { directory: f.root });
  const auth2 = await restarted.login();
  const restored = await restarted.request(`/api/conversations/${c.id}`, auth2);
  assert.deepEqual(restored.body.conversation.messages, completed.messages);
  assert.equal(restored.body.conversation.busy, false);
});

test('mock approvals are explicit, decline works, stale decisions fail and interrupt clears busy', async t => {
  const f = await setup(t);
  const auth = await f.login();
  const c = await f.create(auth);
  await f.request(`/api/conversations/${c.id}/messages`, { method: 'POST', body: { text: 'Quero testar aprovação' }, ...auth });
  const approval = await eventually(async () => (await f.request(`/api/conversations/${c.id}`, auth)).body.approvals[0]);
  assert.match(approval.params.command, /echo/);
  assert.equal((await f.request(`/api/approvals/${approval.id}`, { method: 'POST', body: { decision: 'acceptForSession' }, ...auth })).status, 400);
  assert.equal((await f.request(`/api/approvals/${approval.id}`, { method: 'POST', body: { decision: 'decline' }, ...auth })).status, 200);
  assert.equal((await f.request(`/api/approvals/${approval.id}`, { method: 'POST', body: { decision: 'accept' }, ...auth })).status, 404);
  await eventually(async () => !(await f.request(`/api/conversations/${c.id}`, auth)).body.conversation.busy);
  assert.ok((await f.request(`/api/conversations/${c.id}`, auth)).body.conversation.messages.some(m => m.text.includes('recusou')));
  await f.request(`/api/conversations/${c.id}/messages`, { method: 'POST', body: { text: 'Outra aprovação' }, ...auth });
  const pending = await eventually(async () => (await f.request(`/api/conversations/${c.id}`, auth)).body.approvals[0]);
  assert.equal((await f.request(`/api/conversations/${c.id}/interrupt`, { method: 'POST', body: {}, ...auth })).status, 200);
  const result = await f.request(`/api/conversations/${c.id}`, auth);
  assert.equal(result.body.conversation.busy, false);
  assert.deepEqual(result.body.approvals, []);
  assert.equal((await f.request(`/api/approvals/${pending.id}`, { method: 'POST', body: { decision: 'accept' }, ...auth })).status, 404);
});

test('Codex protocol maps text, commands and approvals, rejects foreign requests, and resumes persisted threads', async t => {
  const transport = new FakeTransport();
  const f = await setup(t, { mode: 'codex', transport });
  const auth = await f.login();
  const c = await f.create(auth);
  assert.equal((await f.request(`/api/conversations/${c.id}/messages`, { method: 'POST', body: { text: 'Olá real' }, ...auth })).status, 202);
  await eventually(() => f.store.get(c.id).activeTurnId === 'turn-1');
  const threadId = f.store.get(c.id).threadId;
  assert.deepEqual(transport.calls.find(x => x.method === 'thread/start').params, { cwd: f.config.workspace, sandbox: 'workspace-write', approvalPolicy: 'untrusted' });
  const notify = (method, extra) => transport.emit('notification', { method, params: { threadId, turnId: 'turn-1', ...extra } });
  transport.emit('serverRequest', { id: 'foreign', method: 'item/commandExecution/requestApproval', params: { threadId: 'someone-elses-thread', turnId: 'turn-1', command: 'danger' } });
  assert.equal(transport.rejected.at(-1).id, 'foreign');
  transport.emit('notification', { method: 'item/agentMessage/delta', params: { threadId: 'foreign', itemId: 'unowned', delta: 'Must not appear' } });
  notify('item/agentMessage/delta', { itemId: 'assistant-1', delta: 'Olá, ' });
  notify('item/agentMessage/delta', { itemId: 'assistant-1', delta: 'dono.' });
  notify('item/started', { item: { id: 'command-1', type: 'commandExecution', command: 'pwd' } });
  notify('item/commandExecution/outputDelta', { itemId: 'command-1', delta: '/workspace\n' });
  notify('item/completed', { item: { id: 'command-1', type: 'commandExecution', command: 'pwd', aggregatedOutput: '/workspace\n', status: 'completed', exitCode: 0 } });
  transport.emit('serverRequest', { id: 'rpc-approval', method: 'item/commandExecution/requestApproval', params: { threadId, turnId: 'turn-1', itemId: 'command-2', command: 'npm test' } });
  const approval = (await f.request(`/api/conversations/${c.id}`, auth)).body.approvals[0];
  assert.ok(approval);
  await f.request(`/api/approvals/${approval.id}`, { method: 'POST', body: { decision: 'decline' }, ...auth });
  assert.deepEqual(transport.replies.at(-1), { id: 'rpc-approval', result: { decision: 'decline' } });
  notify('turn/completed', { turn: { id: 'turn-1', status: 'completed' } });
  const done = (await f.request(`/api/conversations/${c.id}`, auth)).body.conversation;
  assert.equal(done.busy, false);
  assert.equal(done.messages.find(m => m.id === 'assistant-1').text, 'Olá, dono.');
  assert.match(done.messages.find(m => m.id === 'command-1').text, /saída 0/);
  assert.ok(!done.messages.some(m => m.id === 'unowned'));
  await f.close();
  const transport2 = new FakeTransport();
  const restarted = await setup(t, { directory: f.root, mode: 'codex', transport: transport2 });
  const auth2 = await restarted.login();
  await restarted.request(`/api/conversations/${c.id}/messages`, { method: 'POST', body: { text: 'Continua' }, ...auth2 });
  await eventually(() => transport2.calls.some(x => x.method === 'turn/start'));
  assert.equal(transport2.calls.filter(x => x.method === 'thread/start').length, 0);
  assert.equal(transport2.calls.find(x => x.method === 'thread/resume').params.threadId, threadId);
});

test('late notifications from an earlier turn cannot finish or contaminate the active turn', async t => {
  const transport = new FakeTransport();
  const f = await setup(t, { mode: 'codex', transport });
  const auth = await f.login();
  const c = await f.create(auth);
  const send = text => f.request(`/api/conversations/${c.id}/messages`, { method: 'POST', body: { text }, ...auth });
  await send('First');
  await eventually(() => f.store.get(c.id).activeTurnId === 'turn-1');
  const threadId = f.store.get(c.id).threadId;
  transport.emit('notification', { method: 'turn/completed', params: { threadId, turn: { id: 'turn-1', status: 'completed' } } });
  await send('Second');
  await eventually(() => f.store.get(c.id).activeTurnId === 'turn-2');
  transport.emit('notification', { method: 'item/agentMessage/delta', params: { threadId, turnId: 'turn-1', itemId: 'late', delta: 'old response' } });
  transport.emit('notification', { method: 'turn/completed', params: { threadId, turn: { id: 'turn-1', status: 'completed' } } });
  assert.equal(f.store.get(c.id).busy, true);
  assert.equal(f.store.get(c.id).activeTurnId, 'turn-2');
  assert.ok(!f.store.get(c.id).messages.some(m => m.id === 'late'));
});

test('interrupt during Codex startup preserves the task lock until its turn id is known', async t => {
  const transport = new FakeTransport();
  let completeStart;
  const originalRequest = transport.request.bind(transport);
  transport.request = async (method, params) => {
    if (method !== 'turn/start') return originalRequest(method, params);
    transport.calls.push({ method, params });
    return new Promise(resolve => { completeStart = resolve; });
  };
  const f = await setup(t, { mode: 'codex', transport });
  const auth = await f.login();
  const c = await f.create(auth);
  await f.request(`/api/conversations/${c.id}/messages`, { method: 'POST', body: { text: 'Start slowly' }, ...auth });
  await eventually(() => completeStart);
  const interrupted = await f.request(`/api/conversations/${c.id}/interrupt`, { method: 'POST', body: {}, ...auth });
  assert.equal(interrupted.status, 409);
  assert.equal(f.store.get(c.id).busy, true);
  assert.equal((await f.request(`/api/conversations/${c.id}/messages`, { method: 'POST', body: { text: 'Do not overlap' }, ...auth })).status, 409);
  completeStart({ turn: { id: 'slow-turn' } });
  await eventually(() => f.store.get(c.id).activeTurnId === 'slow-turn');
  assert.equal((await f.request(`/api/conversations/${c.id}/interrupt`, { method: 'POST', body: {}, ...auth })).status, 200);
  assert.deepEqual(transport.calls.at(-1), { method: 'turn/interrupt', params: { threadId: f.store.get(c.id).threadId, turnId: 'slow-turn' } });
  transport.emit('notification', { method: 'turn/completed', params: { threadId: f.store.get(c.id).threadId, turn: { id: 'slow-turn', status: 'interrupted' } } });
  assert.equal(f.store.get(c.id).busy, false);
});

test('logout closes an authenticated SSE connection and invalidates its cookie', async t => {
  const f = await setup(t);
  const auth = await f.login();
  const stream = await f.request('/api/events', { ...auth, raw: true });
  const reader = stream.body.getReader();
  t.after(() => reader.cancel().catch(() => {}));
  await reader.read();
  assert.equal((await f.request('/api/auth/logout', { method: 'POST', body: {}, ...auth })).status, 200);
  assert.equal((await reader.read()).done, true);
  assert.equal((await f.request('/api/auth/me', auth)).status, 401);
});
JARVIS_FILE_0B7EDE8EA3737503
if [[ -f api/test/connection.test.js ]]; then
  mkdir -p -- "$jarvis_backup/api/test"
  cp -- api/test/connection.test.js "$jarvis_backup/api/test/connection.test.js"
fi
cat > api/test/connection.test.js <<'JARVIS_FILE_75D2DF7CAB4C224E'
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/services/password.js';

const loginPassword = 'test-login-password-123';
const loginHash = await hashPassword(loginPassword);
const sshPassword = 'private-ssh-password-DO-NOT-PERSIST';
const fingerprint = `SHA256:${'a'.repeat(43)}`;
const target = { host: 'vps.example.test', port: 22, username: 'owner', password: sshPassword, fingerprint, workspace: '/srv/project' };

class FakeSshTransport extends EventEmitter {
  ready = false;
  endpoint = null;
  calls = [];
  replies = [];
  rejected = [];
  closes = 0;
  threads = 0;
  turns = 0;
  failStart = false;
  configure(value) {
    const { host, port, username, fingerprint, workspace } = value;
    this.endpoint = { host, port, username, fingerprint, workspace };
  }
  async start() {
    if (this.failStart) throw new Error(`Authentication failed: ${sshPassword}`);
    this.ready = true;
  }
  async request(method, params) {
    this.calls.push({ method, params });
    if (method === 'thread/start') return { thread: { id: `ssh-thread-${++this.threads}` } };
    if (method === 'thread/resume') return { thread: { id: params.threadId } };
    if (method === 'turn/start') return { turn: { id: `ssh-turn-${++this.turns}` } };
    return {};
  }
  response(id, result) { this.replies.push({ id, result }); }
  rejectRequest(id, message) { this.rejected.push({ id, message }); }
  async close() { this.closes++; this.ready = false; this.endpoint = null; }
}

async function eventually(predicate, timeout = 2500) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await predicate();
    if (value) return value;
    if (Date.now() > deadline) throw new Error('Timed out waiting for SSH application state.');
    await delay(10);
  }
}

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jarvis-connection-'));
  const transport = new FakeSshTransport();
  const probes = [];
  const config = {
    production: false, host: '127.0.0.1', port: 3100, origin: 'http://localhost:5173',
    username: 'owner', passwordHash: loginHash, sessionSecret: 's'.repeat(64), mode: 'ssh',
    workspace: path.join(root, 'workspace'), dataDir: path.join(root, 'data'), codexHome: path.join(root, 'codex'),
    bin: 'codex', apiKey: '', sandbox: 'workspace-write',
  };
  const runtime = createApp(config, { transport, probe: async value => { probes.push(value); return { fingerprint }; } });
  const server = runtime.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    try { await runtime.close(); }
    finally {
      const closed = new Promise(resolve => server.close(resolve));
      server.closeAllConnections();
      await closed;
      await rm(root, { recursive: true, force: true });
    }
  });
  const request = async (url, { method = 'GET', body, cookie, csrf, origin = config.origin } = {}) => {
    const response = await fetch(base + url, {
      method,
      headers: { ...(method !== 'GET' ? { Origin: origin } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
  const post = (url, auth, body = {}) => request(url, { method: 'POST', ...auth, body });
  const login = async cookie => {
    const result = await post('/api/auth/login', { cookie }, { username: 'owner', password: loginPassword });
    assert.equal(result.status, 200);
    return { cookie: result.headers.get('set-cookie').split(';')[0], csrf: result.body.csrfToken };
  };
  const create = async auth => {
    const result = await post('/api/conversations', auth);
    assert.equal(result.status, 201);
    return result.body.conversation;
  };
  const connect = async (auth, overrides = {}) => {
    const result = await post('/api/connection/connect', auth, { ...target, ...overrides });
    assert.equal(result.status, 200);
    return result;
  };
  const send = async (auth, c) => {
    const result = await post(`/api/conversations/${c.id}/messages`, auth, { text: 'Leia o projeto remoto.' });
    assert.equal(result.status, 202);
    const live = runtime.store.get(c.id);
    await eventually(() => live.activeTurnId);
    return live;
  };
  const complete = c => transport.emit('notification', { method: 'turn/completed', params: { threadId: c.threadId, turn: { id: c.activeTurnId, status: 'completed' } } });
  return { ...runtime, root, config, transport, probes, request, post, login, create, connect, send, complete };
}

test('SSH probing and connection require a valid login, origin and CSRF; disconnected chat cannot run', async t => {
  const f = await fixture(t);
  assert.equal((await f.post('/api/connection/probe', {}, target)).status, 401);
  assert.equal((await f.post('/api/connection/connect', {}, target)).status, 401);
  const auth = await f.login();
  assert.equal((await f.post('/api/connection/probe', { cookie: auth.cookie }, target)).status, 403);
  assert.equal((await f.request('/api/connection/connect', { method: 'POST', ...auth, origin: 'https://evil.test', body: target })).status, 403);
  const c = await f.create(auth);
  assert.equal((await f.post(`/api/conversations/${c.id}/messages`, auth, { text: 'Run' })).status, 409);
  assert.equal(f.transport.calls.length, 0);
  const probe = await f.post('/api/connection/probe', auth, { host: 'VPS.EXAMPLE.TEST', port: 22, password: sshPassword });
  assert.equal(probe.status, 200);
  assert.equal(probe.body.fingerprint, fingerprint);
  assert.deepEqual(f.probes, [{ host: 'vps.example.test', port: 22 }]);
  assert.equal((await f.post('/api/connection/connect', auth, { ...target, fingerprint: '' })).status, 400);
  assert.equal((await f.post('/api/connection/connect', auth, { ...target, workspace: 'relative/path' })).status, 400);
  const connected = await f.connect(auth);
  assert.equal(connected.body.status.connected, true);
  assert.equal(connected.body.status.workspace, '/srv/project');
});

test('SSH connection belongs to one login session; another session cannot send, approve or disconnect', async t => {
  const f = await fixture(t);
  const owner = await f.login();
  const other = await f.login();
  await f.connect(owner);
  const otherStatus = await f.request('/api/status', other);
  assert.equal(otherStatus.body.connected, false);
  assert.equal(otherStatus.body.connection, null);
  assert.equal(otherStatus.body.workspace, null);
  assert.equal(otherStatus.body.ownedByAnotherSession, true);
  assert.ok(!JSON.stringify(otherStatus.body).includes(target.host));
  const c = await f.create(owner);
  assert.equal((await f.post(`/api/conversations/${c.id}/messages`, other, { text: 'foreign' })).status, 409);
  const live = await f.send(owner, c);
  f.transport.emit('serverRequest', { id: 34, method: 'item/commandExecution/requestApproval', params: { threadId: live.threadId, turnId: live.activeTurnId, itemId: 'command-34', command: 'pwd', cwd: '/srv/project' } });
  const [approval] = f.chat.pending(live);
  assert.ok(approval);
  assert.equal((await f.post(`/api/approvals/${approval.id}`, other, { decision: 'accept' })).status, 409);
  assert.equal(f.transport.replies.length, 0);
  assert.equal((await f.post('/api/connection/disconnect', other)).status, 409);
  assert.equal((await f.post('/api/connection/disconnect', owner)).status, 409);
  assert.equal(f.transport.ready, true);
  assert.equal((await f.post(`/api/approvals/${approval.id}`, owner, { decision: 'decline' })).status, 200);
  assert.deepEqual(f.transport.replies, [{ id: 34, result: { decision: 'decline' } }]);
  f.complete(live);
  assert.equal((await f.post('/api/connection/disconnect', owner)).status, 200);
  assert.equal(f.transport.ready, false);
});

test('logout and login rotation close the owned SSH channel and clear active tasks and approvals', async t => {
  const f = await fixture(t);
  const auth = await f.login();
  await f.connect(auth);
  const c = await f.create(auth);
  const live = await f.send(auth, c);
  f.transport.emit('serverRequest', { id: 7, method: 'item/fileChange/requestApproval', params: { threadId: live.threadId, turnId: live.activeTurnId, itemId: 'file-7', reason: 'Edit file' } });
  assert.equal(f.chat.approvals.size, 1);
  assert.equal((await f.post('/api/auth/logout', auth)).status, 200);
  assert.equal(f.connection.owner, null);
  assert.equal(f.transport.ready, false);
  assert.equal(live.busy, false);
  assert.equal(f.chat.approvals.size, 0);
  assert.equal((await f.request('/api/auth/me', auth)).status, 401);
  const again = await f.login();
  await f.connect(again);
  const rotated = await f.login(again.cookie);
  assert.notEqual(rotated.cookie, again.cookie);
  assert.equal(f.connection.owner, null);
  assert.equal(f.transport.ready, false);
  assert.equal((await f.request('/api/auth/me', again)).status, 401);
});

test('a conversation stays bound to the SSH host, user, port, host key and remote workspace', async t => {
  const f = await fixture(t);
  const auth = await f.login();
  await f.connect(auth);
  const c = await f.create(auth);
  const live = await f.send(auth, c);
  f.complete(live);
  assert.equal((await f.post('/api/connection/disconnect', auth)).status, 200);
  // Same destination can resume its own persisted thread.
  await f.connect(auth);
  await f.send(auth, c);
  assert.ok(f.transport.calls.some(call => call.method === 'thread/resume' && call.params.threadId === live.threadId));
  f.complete(live);
  assert.equal((await f.post('/api/connection/disconnect', auth)).status, 200);
  for (const override of [{ host: 'another.example.test' }, { username: 'another' }, { port: 2222 }, { fingerprint: `SHA256:${'b'.repeat(43)}` }, { workspace: '/srv/another' }]) {
    // Exercise all context components directly, without HTTP rate-limit noise.
    await f.connection.connect('context-owner', Date.now() + 60000, { ...target, ...override });
    const before = f.transport.calls.length;
    assert.throws(() => f.chat.send(live, 'Do not reuse foreign thread'), err => err.status === 409);
    assert.equal(f.transport.calls.length, before);
    await f.connection.disconnect('context-owner');
  }
});

test('expiry releases SSH and password never reaches status, stored history or error response', async t => {
  const f = await fixture(t);
  const auth = await f.login();
  await f.connection.connect('expiring-owner', Date.now() + 100, target);
  const c = f.store.create();
  f.chat.send(c, 'Check files');
  await eventually(() => c.activeTurnId);
  await eventually(() => f.connection.owner === null && !f.transport.ready);
  assert.equal(c.busy, false);
  f.store.flush();
  const persisted = await readFile(path.join(f.config.dataDir, 'store.json'), 'utf8');
  assert.ok(!persisted.includes(sshPassword));
  assert.ok(!JSON.stringify(f.connection.status('expiring-owner')).includes(sshPassword));
  f.transport.failStart = true;
  const error = await f.post('/api/connection/connect', auth, target);
  assert.equal(error.status, 502);
  assert.ok(!JSON.stringify(error.body).includes(sshPassword));
  assert.equal(f.connection.owner, null);
});
JARVIS_FILE_75D2DF7CAB4C224E
if [[ -f api/test/sshTransport.test.js ]]; then
  mkdir -p -- "$jarvis_backup/api/test"
  cp -- api/test/sshTransport.test.js "$jarvis_backup/api/test/sshTransport.test.js"
fi
cat > api/test/sshTransport.test.js <<'JARVIS_FILE_DC56372A4DA0D2F0'
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { once } from 'node:events';
import ssh2 from 'ssh2';
import net from 'node:net';
import { mkdtemp, mkdir, writeFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { SshTransport, probeHost, remoteCommand } from '../src/services/sshTransport.js';
const { Server, utils } = ssh2;

const key = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs1', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } }).privateKey;
const fingerprint = 'SHA256:' + createHash('sha256').update(utils.parseKey(key).getPublicSSH()).digest('base64').replace(/=+$/, '');

async function fixture(t, { account = { type: 'chatgpt' }, requiresOpenaiAuth = true } = {}) {
  const connections = new Set();
  const auth = [];
  const commands = [];
  const calls = [];
  const streams = [];
  const server = new Server({ hostKeys: [key] }, client => {
    connections.add(client);
    client.on('close', () => connections.delete(client));
    client.on('error', () => {});
    client.on('authentication', ctx => {
      auth.push({ method: ctx.method, username: ctx.username });
      if (ctx.method === 'password' && ctx.username === 'tester' && ctx.password === 'fixture-password') ctx.accept();
      else ctx.reject(['password']);
    });
    client.on('ready', () => client.on('session', accept => accept().on('exec', (acceptExec, reject, info) => {
      commands.push(info.command);
      const stream = acceptExec();
      streams.push(stream);
      let buffer = '';
      stream.on('data', chunk => {
        buffer += chunk.toString();
        let newline;
        while ((newline = buffer.indexOf('\n')) !== -1) {
          const packet = JSON.parse(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
          calls.push(packet);
          if (packet.method === 'wait') continue;
          if (packet.method && packet.id !== undefined) stream.write(JSON.stringify({ id: packet.id, result: packet.method === 'account/read' ? { account, requiresOpenaiAuth } : {} }) + '\n');
        }
      });
      stream.on('end', () => { stream.exit(0); stream.end(); });
      stream.on('error', () => {});
    })));
  });
  server.on('error', () => {});
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const transport = new SshTransport({ requestTimeoutMs: 1000, connectionTimeoutMs: 2000 });
  const options = { host: '127.0.0.1', port: server.address().port, username: 'tester', password: 'fixture-password', fingerprint, workspace: '/var/www/project' };
  t.after(async () => {
    await transport.close();
    for (const client of connections) client.end();
    await new Promise(resolve => server.close(resolve));
  });
  return { transport, options, auth, calls, commands, streams, connections };
}

test('SSH host discovery returns SHA256 fingerprint before any user authentication', async t => {
  const { options, auth } = await fixture(t);
  const result = await probeHost(options);
  assert.equal(result.fingerprint, fingerprint);
  assert.deepEqual(auth, []);
});

test('SSH rejects a changed host key before sending credentials', async t => {
  const { transport, options, auth } = await fixture(t);
  transport.configure({ ...options, fingerprint: 'SHA256:' + 'A'.repeat(43) });
  await assert.rejects(transport.start(), /impressão digital/);
  assert.deepEqual(auth, []);
  assert.equal(transport.ready, false);
  assert.equal(transport.credentials, null);
  await assert.rejects(transport.start(), /Conecte sua VPS/);
});

test('SSH uses remote authenticated Codex without API login and streams protocol requests', async t => {
  const { transport, options, calls, commands, streams } = await fixture(t);
  const workspace = "/var/www/project's $(whoami)";
  transport.configure({ ...options, workspace });
  await Promise.all([transport.start(), transport.start()]);
  assert.equal(transport.ready, true);
  assert.equal(transport.accountType, 'chatgpt');
  assert.equal(transport.credentials, null);
  assert.equal(transport.endpoint.workspace, workspace);
  assert.equal('password' in transport.endpoint, false);
  assert.deepEqual(calls.map(x => x.method), ['initialize', 'initialized', 'account/read']);
  assert.deepEqual(calls[2].params, { refreshToken: false });
  assert.deepEqual(commands, [remoteCommand(workspace, 'codex')]);
  assert.match(commands[0], /^exec bash -lc /);
  assert.equal(commands[0].includes('OPENAI_API_KEY'), false);
  const notification = once(transport, 'notification');
  streams[0].write(JSON.stringify({ method: 'item/agentMessage/delta', params: { delta: 'Resposta remota' } }) + '\n');
  assert.deepEqual((await notification)[0], { method: 'item/agentMessage/delta', params: { delta: 'Resposta remota' } });
  const request = once(transport, 'serverRequest');
  streams[0].write(JSON.stringify({ id: 'approval-remote', method: 'item/commandExecution/requestApproval', params: { threadId: 'thread-1' } }) + '\n');
  assert.equal((await request)[0].id, 'approval-remote');
  transport.response('approval-remote', { decision: 'decline' });
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.deepEqual(calls.at(-1), { id: 'approval-remote', result: { decision: 'decline' } });
  assert.throws(() => transport.configure(options), /Desconecte/);
});

test('SSH requires the remote user to authenticate Codex when account/read has no account', async t => {
  const { transport, options, calls } = await fixture(t, { account: null });
  transport.configure(options);
  await assert.rejects(transport.start(), /Faça codex login/);
  assert.equal(transport.ready, false);
  assert.equal(calls.some(x => x.method === 'account/login/start'), false);
});

test('SSH unexpected closure rejects pending RPC and requires password entry again', async t => {
  const { transport, options, connections } = await fixture(t);
  transport.configure(options);
  await transport.start();
  const offline = once(transport, 'offline');
  const wait = transport.request('wait');
  const rejected = assert.rejects(wait, /encerr/);
  for (const client of connections) client.end();
  await offline;
  await rejected;
  assert.equal(transport.ready, false);
  await assert.rejects(transport.start(), /Conecte sua VPS/);
});

test('SSH cancellation during handshake closes TCP and rejects startup promptly', async t => {
  const sockets = new Set();
  const server = net.createServer(socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const transport = new SshTransport({ connectionTimeoutMs: 10000 });
  t.after(async () => {
    await transport.close();
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  });
  transport.configure({ host: '127.0.0.1', port: server.address().port, username: 'tester', password: 'fixture-password', fingerprint, workspace: '/tmp' });
  const start = transport.start();
  const rejected = assert.rejects(start, /encerrada|cancelada/);
  await new Promise(resolve => setTimeout(resolve, 40));
  await transport.close();
  await rejected;
  assert.equal(transport.ready, false);
  assert.equal(transport.credentials, null);
});

test('SSH validates command paths and treats workspace shell syntax as quoted data', () => {
  const transport = new SshTransport();
  const options = { host: '127.0.0.1', username: 'tester', password: 'secret', fingerprint, workspace: '/tmp' };
  assert.throws(() => transport.configure({ ...options, bin: 'codex; touch /tmp/not-allowed' }), /Codex inválido/);
  assert.throws(() => transport.configure({ ...options, workspace: '/tmp\nwhoami' }), /caminho absoluto/);
  assert.throws(() => transport.configure({ ...options, fingerprint: '' }), /impressão digital/);
  assert.throws(() => transport.configure({ ...options, host: 'host;whoami' }), /Endereço SSH/);
});

test('remote shell command enters a directory with shell syntax without executing its content', { skip: process.platform === 'win32' }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jarvis-ssh-quote-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const workspace = path.join(directory, "workspace'$(touch owned)");
  await mkdir(workspace);
  const bin = path.join(directory, 'codex');
  await writeFile(bin, '#!/bin/sh\nprintf "%s\\n" "$PWD"\n', { mode: 0o700 });
  const result = spawnSync('bash', ['-c', remoteCommand(workspace, bin)], { encoding: 'utf8', cwd: directory });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), workspace);
  await assert.rejects(access(path.join(directory, 'owned')));
});
JARVIS_FILE_DC56372A4DA0D2F0
if [[ -f api/test/transport.test.js ]]; then
  mkdir -p -- "$jarvis_backup/api/test"
  cp -- api/test/transport.test.js "$jarvis_backup/api/test/transport.test.js"
fi
cat > api/test/transport.test.js <<'JARVIS_FILE_4FF8BF05DBEB7EEB'
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CodexTransport } from '../src/services/codexTransport.js';

function fakeServer(handler = () => undefined) {
  const calls = [];
  const children = [];
  const spawnProcess = (command, args, options) => {
    const child = new EventEmitter();
    children.push(child);
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.killed = false;
    child.packet = packet => child.stdout.write(`${JSON.stringify(packet)}\n`);
    child.exit = () => { if (!child.killed) { child.killed = true; child.emit('exit', 0, null); } };
    child.kill = () => { child.exit(); return true; };
    child.stdin = new Writable({
      write(chunk, encoding, callback) {
        const packet = JSON.parse(chunk.toString());
        calls.push(packet);
        queueMicrotask(() => {
          const result = handler(packet, child);
          if (result !== false && packet.id !== undefined && packet.method) child.packet({ id: packet.id, result: result ?? {} });
        });
        callback();
      },
    });
    child.stdin.on('finish', () => queueMicrotask(child.exit));
    child.launch = { command, args, options };
    return child;
  };
  return { spawnProcess, calls, children };
}

async function fixture(t, handler, extra = {}) {
  const home = await mkdtemp(path.join(os.tmpdir(), 'jarvis-transport-'));
  const fake = fakeServer(handler);
  const transport = new CodexTransport({ cwd: home, home: path.join(home, 'isolated'), apiKey: 'test-api-key', spawnProcess: fake.spawnProcess, requestTimeoutMs: 1000, ...extra });
  t.after(async () => { await transport.close(); await rm(home, { recursive: true, force: true }); });
  return { transport, ...fake };
}

test('initialization is ordered, authenticated, deduplicated and uses a shell-free child', async t => {
  const { transport, calls, children } = await fixture(t);
  const saved = process.env.SESSION_SECRET;
  const savedKey = process.env.OPENAI_API_KEY;
  process.env.SESSION_SECRET = 'must-not-inherit';
  process.env.OPENAI_API_KEY = 'must-not-inherit-either';
  try { await Promise.all([transport.start(), transport.start(), transport.start()]); }
  finally {
    if (saved === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = saved;
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = savedKey;
  }
  assert.equal(transport.ready, true);
  assert.equal(children.length, 1);
  assert.deepEqual(calls.map(c => c.method), ['initialize', 'initialized', 'account/login/start']);
  assert.deepEqual(calls[2].params, { type: 'apiKey', apiKey: 'test-api-key' });
  assert.equal(children[0].launch.options.shell, false);
  assert.equal(children[0].launch.options.env.SESSION_SECRET, undefined);
  assert.equal(children[0].launch.options.env.OPENAI_API_KEY, undefined);
  assert.equal(children[0].launch.options.env.CODEX_HOME, transport.options.home);
  await transport.start();
  assert.equal(children.length, 1);
});

test('notifications, server requests, typed ids and correlated replies survive non-JSON diagnostics', async t => {
  const { transport, calls, children } = await fixture(t, packet => {
    if (packet.method === 'thread/start') return { thread: { id: 'thread-1' } };
  });
  await transport.start();
  const result = await transport.request('thread/start', {});
  assert.equal(result.thread.id, 'thread-1');
  const notification = once(transport, 'notification');
  children[0].stdout.write('CLI diagnostic line\n');
  children[0].packet({ method: 'item/agentMessage/delta', params: { delta: 'Olá' } });
  assert.deepEqual((await notification)[0], { method: 'item/agentMessage/delta', params: { delta: 'Olá' } });
  const request = once(transport, 'serverRequest');
  children[0].packet({ id: 'approval-1', method: 'item/commandExecution/requestApproval', params: { threadId: 'thread-1' } });
  assert.equal((await request)[0].id, 'approval-1');
  transport.response('approval-1', { decision: 'decline' });
  assert.deepEqual(calls.at(-1), { id: 'approval-1', result: { decision: 'decline' } });
});

test('unexpected exit rejects outstanding requests and permits a new process', async t => {
  const { transport, children } = await fixture(t, packet => packet.method === 'wait/forever' ? false : undefined);
  const offline = [];
  transport.on('offline', error => offline.push(error));
  await transport.start();
  const pending = transport.request('wait/forever', {});
  const rejected = assert.rejects(pending, /encerrado/);
  children[0].exit();
  await rejected;
  assert.equal(transport.ready, false);
  assert.equal(offline.length, 1);
  await transport.start();
  assert.equal(transport.ready, true);
  assert.equal(children.length, 2);
});

test('requests time out, late replies are ignored and protocol errors redact the API key', async t => {
  const { transport, children } = await fixture(t, packet => {
    if (packet.method === 'wait/forever') return false;
    if (packet.method === 'fail') return false;
  }, { requestTimeoutMs: 25 });
  await transport.start();
  await assert.rejects(transport.request('wait/forever'), /Tempo limite/);
  assert.equal(transport.pending.size, 0);
  children[0].packet({ id: 3, result: {} });
  const failed = transport.request('fail');
  const rejected = assert.rejects(failed, error => error.message.includes('[redigido]') && !error.message.includes('test-api-key'));
  children[0].packet({ id: transport.sequence, error: { message: 'Invalid credential test-api-key' } });
  await rejected;
});

test('spawn failure rejects startup without an unhandled error and is retryable', async t => {
  const { transport } = await fixture(t);
  let attempts = 0;
  const goodSpawn = transport.spawnProcess;
  transport.spawnProcess = (...args) => {
    attempts++;
    if (attempts === 1) throw new Error('binary missing');
    return goodSpawn(...args);
  };
  await assert.rejects(transport.start(), /binary missing/);
  assert.equal(transport.ready, false);
  await transport.start();
  assert.equal(transport.ready, true);
});

test('intentional close rejects waiting callers without broadcasting an unexpected disconnect', async t => {
  const { transport } = await fixture(t, packet => packet.method === 'wait/forever' ? false : undefined);
  await transport.start();
  let offline = 0;
  transport.on('offline', () => offline++);
  const pending = transport.request('wait/forever');
  const rejected = assert.rejects(pending, /encerrada/);
  await transport.close();
  await rejected;
  assert.equal(transport.ready, false);
  assert.equal(offline, 0);
  assert.equal(transport.pending.size, 0);
});
JARVIS_FILE_4FF8BF05DBEB7EEB
if [[ -f deploy/nginx.conf.example ]]; then
  mkdir -p -- "$jarvis_backup/deploy"
  cp -- deploy/nginx.conf.example "$jarvis_backup/deploy/nginx.conf.example"
fi
cat > deploy/nginx.conf.example <<'JARVIS_FILE_C3843673A6DEFF44'
# Exemplo para um site NOVO. Confira o domínio exato registrado.
# Após ativar e validar: sudo certbot --nginx -d jarvis.facil.sbs
server {
    listen 80;
    listen [::]:80;
    server_name jarvis.facil.sbs;

    client_max_body_size 128k;

    location = /api/events {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
        add_header X-Accel-Buffering no always;
    }

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
JARVIS_FILE_C3843673A6DEFF44
if [[ -f ecosystem.config.cjs ]]; then
  mkdir -p -- "$jarvis_backup/."
  cp -- ecosystem.config.cjs "$jarvis_backup/ecosystem.config.cjs"
fi
cat > ecosystem.config.cjs <<'JARVIS_FILE_35679513D3EA1BEE'
const path = require('node:path');

module.exports = {
  apps: [{
    name: 'jarvis',
    cwd: path.join(__dirname, 'api'),
    script: 'src/server.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    restart_delay: 3000,
    kill_timeout: 10000,
    time: true,
    env_production: { NODE_ENV: 'production' },
  }],
};
JARVIS_FILE_35679513D3EA1BEE
if [[ -f front/index.html ]]; then
  mkdir -p -- "$jarvis_backup/front"
  cp -- front/index.html "$jarvis_backup/front/index.html"
fi
cat > front/index.html <<'JARVIS_FILE_3FFD02E9EDCCC997'
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0c141a" />
    <meta name="description" content="Jarvis — seu espaço de trabalho com o Codex." />
    <title>Jarvis · Seu espaço de trabalho</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
JARVIS_FILE_3FFD02E9EDCCC997
if [[ -f front/package.json ]]; then
  mkdir -p -- "$jarvis_backup/front"
  cp -- front/package.json "$jarvis_backup/front/package.json"
fi
cat > front/package.json <<'JARVIS_FILE_CA702B44EDBD4E2D'
{
  "name": "jarvis-front",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "vite build",
    "preview": "vite preview --host 127.0.0.1"
  },
  "dependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^5.1.1",
    "vite": "^7.2.2"
  }
}
JARVIS_FILE_CA702B44EDBD4E2D
if [[ -f front/src/App.jsx ]]; then
  mkdir -p -- "$jarvis_backup/front/src"
  cp -- front/src/App.jsx "$jarvis_backup/front/src/App.jsx"
fi
cat > front/src/App.jsx <<'JARVIS_FILE_7B5BF478D688341C'
import { useCallback, useEffect, useRef, useState } from 'react';

function Icon({ name, size = 20, ...props }) {
  const paths = {
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <><path d="m5 12 7-7 7 7M12 5v14" /></>,
    chat: <path d="M20 11.5a8 8 0 0 1-8 8H5l-3 2 1.5-5A8 8 0 1 1 20 11.5Z" />,
    terminal: <><path d="m5 6 5 6-5 6M13 18h6" /></>,
    logout: <><path d="M9 4H4v16h5M14 8l4 4-4 4M9 12h9" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3" /></>,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
    check: <path d="m5 12 4 4L19 6" />,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8 12 3 3 5-6" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name] || paths.chat}</svg>;
}

function Brand({ compact = false }) {
  return <div className={`brand ${compact ? 'compact' : ''}`}><div className="brand-mark"><span /><span /><span /></div><div><strong>jarvis<span>.</span></strong>{!compact && <small>SEU ESPAÇO DE TRABALHO</small>}</div></div>;
}

async function request(path, { csrf, body, ...options } = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...options.headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(typeof data.error === 'string' ? data.error : data.error?.message || data.message || 'Não foi possível concluir a solicitação.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (pending) return;
    setPending(true); setError('');
    try { onLogin(await request('/auth/login', { method: 'POST', body: { username, password } })); }
    catch (err) { setError(err.message); }
    finally { setPending(false); }
  }
  return <main className="login-page">
    <section className="login-intro">
      <Brand />
      <div className="intro-copy"><span className="eyebrow"><span className="status-dot" /> DO SEU JEITO. NO SEU SERVIDOR.</span><h1>Uma conversa.<br />Muitas possibilidades<span>.</span></h1><p>Suas ideias, seus projetos e o Codex.<br />Um espaço para fazer as coisas acontecerem.</p><div className="intro-terminal"><div className="terminal-top"><i /><i /><i /><span>seu espaço de trabalho</span></div><div><span className="prompt">❯</span> O que vamos construir hoje?<span className="cursor" /></div></div></div>
      <footer>JARVIS WORKSPACE <span>01 / CONECTAR</span></footer>
    </section>
    <section className="login-form-wrap"><div className="login-card"><span className="login-icon"><Icon name="lock" size={24} /></span><span className="eyebrow">BEM-VINDO DE VOLTA</span><h2>Seu próximo passo<br />começa aqui.</h2><p>Entre na sua conta para abrir o workspace.</p>
      <form onSubmit={submit}><label htmlFor="username">Usuário</label><input id="username" autoComplete="username" autoFocus value={username} onChange={e => setUsername(e.target.value)} placeholder="Seu usuário" required maxLength={100} />
        <label htmlFor="password">Senha</label><div className="password-input"><input id="password" type={visible ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Sua senha" required /><button type="button" className="icon-button" aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setVisible(!visible)}><Icon name="eye" size={18} /></button></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary login-submit" disabled={pending}>{pending ? <><span className="spinner" /> Entrando…</> : <>Acessar meu workspace <span>↗</span></>}</button>
      </form><div className="private-note"><Icon name="shield" size={15} /><span>Acesso privado. Suas credenciais ficam no servidor.</span></div>
    </div></section>
  </main>;
}

const formatDate = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }); };
const formatTime = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };

function Approval({ approval, onDecide, disabled }) {
  const p = approval.params || {};
  return <article className="approval-card"><div className="approval-heading"><Icon name="shield" /><strong>O Codex precisa da sua aprovação</strong></div><p>{p.reason || (approval.method.includes('fileChange') ? 'Autorizar as alterações de arquivos solicitadas?' : 'Autorizar a execução desta ação?')}</p>{p.command && <pre>{typeof p.command === 'string' ? p.command : JSON.stringify(p.command, null, 2)}</pre>}{p.cwd && <small>Diretório: {p.cwd}</small>}{p.grantRoot && <small>Diretório solicitado: {p.grantRoot}</small>}<div className="approval-actions"><button className="subtle-button" disabled={disabled} onClick={() => onDecide(approval.id, 'decline')}>Recusar</button><button className="primary" disabled={disabled} onClick={() => onDecide(approval.id, 'accept')}><Icon name="check" size={16} /> Aprovar</button></div></article>;
}

function SshConnect({ csrf, occupied, onConnected, onUnauthorized }) {
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('root');
  const [workspace, setWorkspace] = useState('/root/codex');
  const [password, setPassword] = useState('');
  const [fingerprint, setFingerprint] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const attempt = useRef(0);
  useEffect(() => () => { attempt.current += 1; }, []);
  function changeTarget(setter, value) {
    attempt.current += 1;
    setter(value); setFingerprint(''); setConfirmed(false); setPassword(''); setError('');
  }
  async function probe(event) {
    event.preventDefault();
    if (pending || occupied) return;
    const currentAttempt = ++attempt.current;
    setPending(true); setError(''); setFingerprint(''); setConfirmed(false); setPassword('');
    try {
      const data = await request('/connection/probe', { method: 'POST', csrf, body: { host: host.trim(), port: Number(port) } });
      if (attempt.current === currentAttempt) setFingerprint(data.fingerprint);
    } catch (err) {
      if (attempt.current === currentAttempt) { setError(err.message); if (err.status === 401) onUnauthorized(err); }
    } finally { if (attempt.current === currentAttempt) setPending(false); }
  }
  async function connect(event) {
    event.preventDefault();
    if (pending || occupied || !fingerprint || !confirmed || !password) return;
    const currentAttempt = ++attempt.current;
    setPending(true); setError('');
    const body = { host: host.trim(), port: Number(port), username: username.trim(), workspace: workspace.trim(), fingerprint, password };
    // request() serializes the body immediately; the password is not stored by the UI.
    const result = request('/connection/connect', { method: 'POST', csrf, body });
    setPassword('');
    // A successful SSE update can unmount this form before the POST resolves.
    // The parent checks the login session before opening the new conversation.
    try { const data = await result; await onConnected(data.status, csrf); }
    catch (err) { if (attempt.current === currentAttempt) { setError(err.message); if (err.status === 401) onUnauthorized(err); } }
    finally { if (attempt.current === currentAttempt) { setPending(false); setPassword(''); } }
  }
  return <div className="ssh-connect-wrap"><section className="ssh-connect-card" aria-labelledby="ssh-title">
    <span className="ssh-card-icon"><Icon name="terminal" size={25} /></span><span className="eyebrow">SEU CODEX. NA SUA VPS.</span>
    <h2 id="ssh-title">Conectar à VPS</h2><p>Abra uma conexão SSH para conversar com o Codex instalado no seu servidor.</p>
    {occupied ? <div className="ssh-occupied" role="status">Esta VPS está em uso por outra sessão do painel. Desconecte naquela sessão para continuar aqui.</div> : <form onSubmit={fingerprint ? connect : probe}>
      <div className="ssh-target-grid"><div><label htmlFor="ssh-host">Endereço ou IP da VPS</label><input id="ssh-host" value={host} onChange={e => changeTarget(setHost, e.target.value)} placeholder="Ex.: 203.0.113.10" autoComplete="off" spellCheck={false} required maxLength={253} disabled={pending} /></div><div><label htmlFor="ssh-port">Porta SSH</label><input id="ssh-port" type="number" min="1" max="65535" value={port} onChange={e => changeTarget(setPort, e.target.value)} required disabled={pending} /></div></div>
      <div className="ssh-fields-grid"><div><label htmlFor="ssh-username">Usuário da VPS</label><input id="ssh-username" value={username} onChange={e => setUsername(e.target.value)} autoComplete="off" spellCheck={false} required maxLength={64} disabled={pending} /></div><div><label htmlFor="ssh-workspace">Pasta de trabalho</label><input id="ssh-workspace" value={workspace} onChange={e => setWorkspace(e.target.value)} placeholder="/var/www/meu-projeto" autoComplete="off" spellCheck={false} required maxLength={4096} disabled={pending} /></div></div>
      {fingerprint && <div className="ssh-fingerprint"><div><Icon name="shield" size={16} /><strong>Confira a identidade do servidor</strong></div><code>{fingerprint}</code><details><summary>Como conferir na minha VPS?</summary><p>No terminal em que você já acessa a VPS, execute o comando abaixo e compare a impressão digital SHA256 com a mostrada aqui.</p><pre>{'for f in /etc/ssh/ssh_host_*_key.pub; do ssh-keygen -lf "$f"; done'}</pre></details><label className="ssh-confirm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={pending} /><span>Conferi a impressão digital com a minha VPS</span></label></div>}
      {fingerprint && confirmed && <div className="ssh-password-field"><label htmlFor="ssh-password">Senha da VPS</label><input id="ssh-password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="off" required disabled={pending} maxLength={1024} /><small>A senha é usada nesta conexão e não é salva pelo painel.</small></div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="ssh-submit-row">{fingerprint && <button className="subtle-button" type="button" onClick={probe} disabled={pending}>Verificar novamente</button>}<button className="primary" disabled={pending || Boolean(fingerprint && (!confirmed || !password))}>{pending ? <><span className="spinner" /> {fingerprint ? 'Conectando…' : 'Verificando…'}</> : fingerprint ? <>Conectar à VPS <span>↗</span></> : <>Verificar servidor <span>↗</span></>}</button></div>
    </form>}
    <p className="ssh-footnote">O Codex precisa estar instalado e autenticado no usuário SSH informado. Os limites dessa conta continuam valendo.</p>
  </section></div>;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [approvals, setApprovals] = useState([]);
  const [status, setStatus] = useState(null);
  const [connection, setConnection] = useState('connecting');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const selectedRef = useRef(null);
  const lock = useRef(false);
  const endRef = useRef(null);
  const scrollRef = useRef(null);
  const nearBottomRef = useRef(true);
  const composerRef = useRef(null);
  const choose = useCallback(id => { selectedRef.current = id; nearBottomRef.current = true; setSelected(id); setConversation(null); setApprovals([]); setSidebar(false); setError(''); }, []);
  const showError = useCallback(err => { if (err.status === 401) { setSession(null); setConversations([]); choose(null); } else setError(err.message); }, [choose]);

  useEffect(() => { let alive = true; request('/auth/me').then(data => { if (alive) setSession(data); }).catch(err => { if (alive && err.status !== 401) setError(err.message); }).finally(() => { if (alive) setChecking(false); }); return () => { alive = false; }; }, []);

  const refresh = useCallback(async () => {
    const id = selectedRef.current;
    const [list, detail, environment] = await Promise.all([request('/conversations'), id ? request(`/conversations/${id}`) : Promise.resolve(null), request('/status')]);
    setConversations(list.conversations || []);
    setStatus(environment);
    if (id === selectedRef.current && detail) { setConversation(detail.conversation); setApprovals(detail.approvals || []); }
  }, []);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    let timer;
    let inFlight = false;
    let queued = false;
    const sync = async () => {
      if (inFlight) { queued = true; return; }
      inFlight = true;
      try { await refresh(); } catch (err) { if (alive) showError(err); }
      finally { inFlight = false; if (queued && alive) { queued = false; schedule(); } }
    };
    const schedule = () => { if (!timer) timer = setTimeout(() => { timer = null; if (alive) sync(); }, 200); };
    sync();
    request('/status').then(data => { if (alive) setStatus(data); }).catch(err => { if (alive) showError(err); });
    const events = new EventSource('/api/events', { withCredentials: true });
    events.onopen = () => { if (alive) { setConnection('connected'); schedule(); } };
    events.onerror = () => { if (alive) setConnection('reconnecting'); };
    events.addEventListener('update', schedule);
    events.addEventListener('status', () => { if (alive) request('/status').then(data => { if (alive) setStatus(data); }).catch(showError); });
    return () => { alive = false; clearTimeout(timer); events.close(); };
  }, [session, refresh, showError]);

  useEffect(() => { if (session && selected) refresh().catch(showError); }, [selected, session, refresh, showError]);
  useEffect(() => { if (nearBottomRef.current) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [conversation?.messages, approvals.length]);

  const mutation = (path, body) => request(path, { method: 'POST', csrf: session.csrfToken, body });
  async function newConversation() {
    if (lock.current) return;
    lock.current = true; setError('');
    try { const data = await mutation('/conversations', {}); choose(data.conversation.id); setConversation(data.conversation); setDraft(''); await refresh(); composerRef.current?.focus(); }
    catch (err) { showError(err); }
    finally { lock.current = false; }
  }
  async function send(event) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || lock.current || conversation?.busy || (status?.mode === 'ssh' && !status.connected) || (selected !== null && !conversation)) return;
    lock.current = true; setSending(true); setError('');
    nearBottomRef.current = true;
    try {
      let id = selectedRef.current;
      if (!id) { const data = await mutation('/conversations', {}); id = data.conversation.id; choose(id); setConversation(data.conversation); }
      await mutation(`/conversations/${id}/messages`, { text });
      setDraft('');
      await refresh();
    } catch (err) { showError(err); }
    finally { lock.current = false; setSending(false); composerRef.current?.focus(); }
  }
  async function interrupt() { try { await mutation(`/conversations/${selectedRef.current}/interrupt`, {}); await refresh(); } catch (err) { showError(err); } }
  async function decide(id, decision) { setDeciding(true); try { await mutation(`/approvals/${encodeURIComponent(id)}`, { decision }); await refresh(); } catch (err) { showError(err); } finally { setDeciding(false); } }
  async function logout() { try { await mutation('/auth/logout', {}); setSession(null); choose(null); setConversations([]); setStatus(null); setDraft(''); } catch (err) { showError(err); } }
  async function sshConnected(environment, csrfToken) {
    if (sessionRef.current?.csrfToken !== csrfToken) return;
    setStatus(environment); choose(null); setDraft('');
    const data = await mutation('/conversations', {});
    choose(data.conversation.id); setConversation(data.conversation);
    await refresh();
    composerRef.current?.focus();
  }
  async function sshDisconnect() {
    if (disconnecting) return;
    setDisconnecting(true); setError('');
    try { await mutation('/connection/disconnect', {}); await refresh(); setDraft(''); }
    catch (err) { showError(err); }
    finally { setDisconnecting(false); }
  }

  if (checking) return <div className="loading-screen"><Brand /><span className="spinner" /><p>Abrindo seu workspace…</p></div>;
  if (!session) return <Login onLogin={setSession} />;
  const busy = conversation?.busy || sending;
  const sshMode = status?.mode === 'ssh';
  const sshDisconnected = sshMode && !status.connected;
  const sshTarget = status?.connection ? `${status.connection.username}@${status.connection.host}` : '';
  const messages = conversation?.messages || [];
  const examples = ['Me explica a estrutura deste projeto', 'Confira o consumo de memória da máquina', 'Me ajude a investigar um erro'];
  return <div className="workspace">
    {sidebar && <button className="sidebar-overlay" aria-label="Fechar menu" onClick={() => setSidebar(false)} />}
    <aside className={`sidebar ${sidebar ? 'is-open' : ''}`}>
      <div className="sidebar-brand"><Brand compact /><button className="icon-button mobile-only" aria-label="Fechar menu" onClick={() => setSidebar(false)}><Icon name="close" /></button></div>
      <button className="new-conversation" onClick={newConversation} disabled={sending}><Icon name="plus" size={18} /> Nova conversa <span>↗</span></button>
      <div className="sidebar-label">SUAS CONVERSAS <span>{conversations.length}</span></div>
      <nav className="conversation-list" aria-label="Conversas">{conversations.length ? conversations.map(item => <button key={item.id} className={`conversation-link ${selected === item.id ? 'active' : ''}`} onClick={() => choose(item.id)}><Icon name="chat" size={17} /><span><strong>{item.title || 'Nova conversa'}</strong><small>{formatDate(item.updatedAt || item.createdAt)}{item.busy ? ' · Em andamento' : ''}</small></span>{item.busy && <span className="status-dot" />}</button>) : <p className="empty-list">Suas conversas vão aparecer aqui.</p>}</nav>
      <div className="sidebar-bottom"><div className="environment"><Icon name="terminal" size={17} /><div><strong>{status?.mode === 'mock' ? 'Demonstração' : sshMode ? sshTarget || 'Conexão SSH' : 'Codex workspace'}</strong><small title={status?.workspace || ''}>{status?.mode === 'mock' ? 'Sem executar comandos reais' : status?.workspace || (sshMode ? 'Aguardando conexão com a VPS' : 'Consultando ambiente…')}</small></div></div><div className="account"><span className="avatar">{session.user.username.slice(0, 1).toUpperCase()}</span><div><strong>{session.user.username}</strong><small>Workspace pessoal</small></div><button className="icon-button" aria-label="Sair da conta" title="Sair da conta" onClick={logout}><Icon name="logout" size={18} /></button></div></div>
    </aside>
    <main className="chat-panel">
      <header className="chat-header"><div className="header-title"><button className="icon-button mobile-only" aria-label="Abrir menu" onClick={() => setSidebar(true)}><Icon name="menu" /></button><span className="header-symbol"><Icon name="terminal" size={19} /></span><div><h1>{conversation?.title || 'Seu workspace'}</h1><p>{status?.mode === 'mock' ? 'Modo de demonstração' : sshMode ? status.connected ? `SSH · ${sshTarget}` : 'Conecte sua VPS por SSH' : status?.connected ? 'Conectado ao seu ambiente' : 'Codex inicia ao enviar uma mensagem'}</p></div></div><div className="header-actions">{sshMode && status.connected && <button className="ssh-disconnect" onClick={sshDisconnect} disabled={disconnecting || Boolean(status.busy || busy)} title={status.busy || busy ? 'Interrompa a tarefa antes de desconectar' : 'Encerrar a conexão SSH desta sessão'}>{disconnecting ? 'Saindo…' : 'Desconectar SSH'}</button>}<span className={`connection-state ${connection === 'connected' ? '' : 'pending'}`} title={connection === 'connected' ? 'Atualizações em tempo real conectadas' : 'Tentando reconectar às atualizações'}><span className="status-dot" />{connection === 'connected' ? 'Ao vivo' : connection === 'reconnecting' ? 'Reconectando' : 'Conectando'}</span></div></header>
      {status?.mode === 'mock' && <div className="demo-banner"><span className="demo-tag">DEMO</span> Você está testando a interface. Neste modo, nenhuma ação é executada na máquina.</div>}
      {error && <div className="error-banner" role="alert"><span>{error}</span><button className="icon-button" aria-label="Fechar aviso" onClick={() => setError('')}><Icon name="close" size={17} /></button></div>}
      <section className="chat-scroll" ref={scrollRef} onScroll={() => { const el = scrollRef.current; if (el) nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 180; }} aria-label="Mensagens da conversa">
        {sshDisconnected && <SshConnect key={session.csrfToken} csrf={session.csrfToken} occupied={status.ownedByAnotherSession} onConnected={sshConnected} onUnauthorized={showError} />}
        {!messages.length && !busy ? !sshDisconnected && <div className="welcome"><div className="welcome-emblem"><Brand compact /></div><span className="eyebrow">DA IDEIA À AÇÃO</span><h2>O que vamos fazer hoje?</h2><p>Converse, investigue e construa.<br />Seu próximo projeto começa com uma mensagem.</p><div className="suggestions">{examples.map((text, index) => <button key={text} onClick={() => { setDraft(text); composerRef.current?.focus(); }}><span className="suggestion-number">0{index + 1}</span><span>{text}</span><span className="suggestion-arrow">↗</span></button>)}</div></div> : <div className="messages">{messages.map(message => <article key={message.id} className={`message message-${message.role}`}><div className={`message-avatar ${message.role === 'user' ? 'user-avatar' : ''}`}>{message.role === 'user' ? session.user.username.slice(0, 1).toUpperCase() : <Icon name={message.role === 'tool' ? 'terminal' : 'chat'} size={17} />}</div><div className="message-body"><div className="message-meta"><strong>{message.role === 'user' ? 'Você' : message.role === 'assistant' ? 'Jarvis' : message.role === 'tool' ? 'Execução' : 'Sistema'}</strong><time>{formatTime(message.createdAt)}</time></div>{message.role === 'tool' ? <pre className="tool-output">{message.text}</pre> : <div className="message-text">{message.text}</div>}</div></article>)}{busy && <div className="working-indicator"><span className="spinner" />{approvals.length ? 'Aguardando sua aprovação…' : 'Jarvis está trabalhando…'}</div>}{approvals.map(approval => <Approval key={approval.id} approval={approval} disabled={deciding} onDecide={decide} />)}<div ref={endRef} /></div>}
      </section>
      <div className="composer-wrap"><form className="composer" onSubmit={send}><textarea ref={composerRef} aria-label="Sua mensagem para o Jarvis" placeholder={sshDisconnected ? 'Conecte sua VPS para enviar uma mensagem' : 'Fala, Jarvis…'} disabled={sshDisconnected} value={draft} maxLength={16000} rows={2} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(event); } }} /><div className="composer-toolbar"><span><Icon name="terminal" size={14} />{status?.mode === 'mock' ? 'Demonstração' : sshMode ? 'Codex via SSH' : 'Codex'}<span className="composer-divider">/</span><span className="keyboard-hint">Enter para enviar</span></span>{busy ? <button type="button" className="stop-button" onClick={interrupt} disabled={sending} aria-label="Interromper resposta"><Icon name="stop" size={15} /> Parar</button> : <button className="send-button" type="submit" disabled={sshDisconnected || !draft.trim() || sending || (selected !== null && !conversation)} aria-label="Enviar mensagem"><Icon name="arrow" size={20} /></button>}</div></form><p className="composer-note">{status?.mode === 'mock' ? 'Modo de teste · As respostas são simuladas.' : 'Confira os comandos e as alterações antes de aprovar.'}<span>JARVIS WORKSPACE</span></p></div>
    </main>
  </div>;
}
JARVIS_FILE_7B5BF478D688341C
if [[ -f front/src/main.jsx ]]; then
  mkdir -p -- "$jarvis_backup/front/src"
  cp -- front/src/main.jsx "$jarvis_backup/front/src/main.jsx"
fi
cat > front/src/main.jsx <<'JARVIS_FILE_841F7B907D89750E'
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(<App />);
JARVIS_FILE_841F7B907D89750E
if [[ -f front/src/styles.css ]]; then
  mkdir -p -- "$jarvis_backup/front/src"
  cp -- front/src/styles.css "$jarvis_backup/front/src/styles.css"
fi
cat > front/src/styles.css <<'JARVIS_FILE_26580CC8FB91489F'
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap');

:root{font-family:'DM Sans',system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#dce4e8;background:#0c141a;font-synthesis:none;text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased;font-weight:400;color-scheme:dark;--accent:#84dbc2;--muted:#82929b;--line:#233039;--panel:#101b22}
*{box-sizing:border-box}body{margin:0}button,input,textarea{font:inherit}button{cursor:pointer}button:disabled{cursor:not-allowed;opacity:.45}button,a,input,textarea{-webkit-tap-highlight-color:transparent}button:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid var(--accent);outline-offset:4px}button{transition:background .15s,color .15s,border-color .15s}button svg{flex-shrink:0}input,textarea{min-width:0}button{color:inherit}::selection{background:#84dbc240;color:#eafff8}p,h1,h2{margin:0}.brand{display:flex;align-items:center;gap:13px}.brand strong{font-family:'Manrope',sans-serif;font-size:29px;font-weight:800;letter-spacing:-1.4px;line-height:1}.brand strong>span{color:var(--accent)}.brand small{display:block;font-size:8px;letter-spacing:2px;margin-top:9px;color:#8a9c9f}.brand.compact strong{font-size:28px}.brand-mark{display:flex;align-items:center;gap:4px;width:33px;height:33px}.brand-mark span{width:6px;height:17px;background:var(--accent);border-radius:5px;transform:rotate(28deg)}.brand-mark span:nth-child(2){height:30px}.brand-mark span:nth-child(3){height:23px}.eyebrow{display:flex;align-items:center;gap:8px;font-size:10px;font-weight:600;letter-spacing:1.8px;color:var(--accent)}.status-dot{display:inline-block;width:6px;height:6px;flex-shrink:0;border-radius:50%;background:var(--accent);box-shadow:0 0 9px #84dbc225}.primary{display:inline-flex;justify-content:center;align-items:center;gap:8px;background:var(--accent);color:#102c27;border:0;border-radius:8px;padding:12px 17px;font-weight:700;font-size:13px}.primary:hover:not(:disabled){background:#a0ecd6}.icon-button{display:inline-flex;justify-content:center;align-items:center;width:33px;height:33px;padding:0;flex-shrink:0;border:0;background:transparent;border-radius:7px;color:#8c9da7}.icon-button:hover{color:#dce4e8;background:#ffffff09}.spinner{display:inline-block;width:15px;height:15px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spin 1s linear infinite;flex-shrink:0}@keyframes spin{to{transform:rotate(360deg)}}.loading-screen{min-height:100dvh;display:flex;gap:22px;align-items:center;justify-content:center;flex-direction:column}.loading-screen p{color:var(--muted);font-size:13px}.login-page{min-height:100dvh;display:grid;grid-template-columns:1.05fr 1fr}.login-intro{padding:50px 64px 30px;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden;background:radial-gradient(ellipse at 0% 50%,#1c3c3b50 0%,transparent 70%),#101c23;border-right:1px solid #ffffff06}.login-intro:before{content:'';position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(#ffffff0b 1px,transparent 1px);background-size:22px 22px;mask-image:linear-gradient(180deg,transparent,black,transparent)}.login-intro>*{position:relative}.intro-copy{padding:65px 0}.intro-copy h1{font-family:'Manrope',sans-serif;font-size:clamp(32px,3.5vw,52px);line-height:1.25;letter-spacing:-2px;font-weight:600;margin:23px 0;color:#e2eeed}.intro-copy h1>span{color:var(--accent)}.intro-copy>p{color:#8da3ab;font-size:14px;line-height:1.9}.intro-terminal{max-width:375px;margin-top:37px;border:1px solid #ffffff0b;border-radius:10px;background:#0a1419a6;box-shadow:0 15px 40px #00000010;overflow:hidden}.terminal-top{display:flex;align-items:center;gap:5px;padding:12px 15px;border-bottom:1px solid #ffffff06}.terminal-top i{height:6px;width:6px;border-radius:50%;background:#36504f}.terminal-top i:first-child{background:#6e5754}.terminal-top i:nth-child(2){background:#777456}.terminal-top>span{font-size:9px;color:#6a828a;margin-left:15px}.intro-terminal>div:last-child{padding:18px 15px;font-family:monospace;font-size:11px;color:#adbfca}.prompt{color:var(--accent);margin-right:8px}.cursor{display:inline-block;width:5px;height:12px;background:var(--accent);margin-left:8px;vertical-align:middle;animation:blink 2s step-end infinite}@keyframes blink{50%{opacity:0}}.login-intro footer{display:flex;align-items:center;justify-content:space-between;font-size:8px;letter-spacing:1.4px;color:#6c858b}.login-intro footer span{font-size:8px;letter-spacing:1px}.login-form-wrap{padding:60px 40px;display:flex;align-items:center;justify-content:center}.login-card{width:100%;max-width:338px}.login-icon{display:flex;align-items:center;justify-content:center;width:49px;height:49px;background:#84dbc20a;border:1px solid #84dbc21c;color:var(--accent);border-radius:12px;margin-bottom:32px}.login-card>.eyebrow{font-size:9px;color:#8a9aa3}.login-card h2{font-family:'Manrope',sans-serif;font-size:29px;line-height:1.35;letter-spacing:-.9px;font-weight:600;margin:12px 0}.login-card>p{color:var(--muted);font-size:12px;line-height:1.8}.login-card form{margin-top:30px}.login-card label{display:block;font-size:11px;font-weight:500;color:#afbdc5;margin-bottom:9px}.login-card input{width:100%;padding:13px 14px;border:1px solid #29373f;border-radius:7px;background:#101b22;color:#dce4e8;font-size:12px;outline-offset:2px}.login-card input::placeholder{color:#596d79}.login-card input:focus{border-color:#84dbc266}.login-card label[for=password]{margin-top:21px}.password-input{display:flex;align-items:center;position:relative}.password-input input{padding-right:44px}.password-input button{position:absolute;right:7px}.login-submit{margin-top:26px;width:100%;padding:14px;justify-content:space-between;font-size:12px}.login-submit>span:last-child{font-size:19px;font-weight:400}.private-note{display:flex;align-items:center;justify-content:center;gap:7px;margin-top:25px;color:#677e88;font-size:9px;line-height:1.7}.form-error{font-size:11px!important;margin-top:13px;color:#efaaa5!important;line-height:1.6}.workspace{display:flex;height:100dvh;overflow:hidden}.sidebar{width:257px;flex-shrink:0;background:#101b22;border-right:1px solid var(--line);display:flex;flex-direction:column;padding:30px 17px 0}.sidebar-brand{display:flex;justify-content:space-between;align-items:center;padding:0 10px 31px}.new-conversation{display:flex;align-items:center;gap:9px;width:100%;padding:12px 13px;border:1px solid #84dbc244;border-radius:8px;background:#84dbc20a;color:var(--accent);font-size:12px;font-weight:500}.new-conversation>span{margin-left:auto;font-size:16px}.new-conversation:hover{background:#84dbc214;border-color:#84dbc266}.sidebar-label{display:flex;justify-content:space-between;color:#6d828e;font-size:8px;font-weight:600;letter-spacing:1.6px;margin:31px 10px 13px}.sidebar-label>span{letter-spacing:0;color:#8da0a9}.conversation-list{flex:1;min-height:0;overflow:auto;padding-bottom:15px;scrollbar-width:thin;scrollbar-color:#30414a transparent}.conversation-link{display:flex;gap:10px;align-items:center;text-align:left;width:100%;border:1px solid transparent;background:transparent;border-radius:7px;padding:11px 10px;margin-bottom:4px;color:#81959f}.conversation-link>span:not(.status-dot){flex:1;min-width:0}.conversation-link strong{font-size:11px;font-weight:400;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#a4b4be}.conversation-link small{display:block;font-size:9px;color:#627985;margin-top:5px}.conversation-link.active{background:#1a2a32;border-color:#ffffff04;color:var(--accent)}.conversation-link.active strong{color:#e1e9ec}.conversation-link:hover:not(.active){background:#ffffff03}.empty-list{font-size:11px;color:#6c818c;padding:12px;line-height:1.7}.sidebar-bottom{margin-top:auto}.environment{border:1px solid #263840;border-radius:8px;display:flex;align-items:center;gap:10px;padding:12px 10px;margin-bottom:19px;color:#6e9a94}.environment>div{min-width:0}.environment strong{display:block;font-size:10px;font-weight:500;color:#a5b8bb}.environment small{display:block;font-size:8px;color:#657f89;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:166px}.account{display:flex;gap:10px;align-items:center;padding:18px 2px;border-top:1px solid var(--line)}.avatar{display:flex;align-items:center;justify-content:center;border-radius:9px;background:#263b42;color:#b3d1d0;width:32px;height:32px;font-size:12px;flex-shrink:0}.account>div{min-width:0;flex:1}.account strong{display:block;font-size:11px;font-weight:500;overflow:hidden;text-overflow:ellipsis}.account small{display:block;color:#637d88;font-size:9px;margin-top:3px}.chat-panel{flex:1;min-width:0;display:flex;flex-direction:column;background:radial-gradient(ellipse at 70% 30%,#162a2d25,transparent 60%),#0c141a}.chat-header{height:81px;flex-shrink:0;padding:0 35px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #ffffff06;gap:12px}.header-title{display:flex;align-items:center;gap:12px;min-width:0}.header-title>div{min-width:0}.header-symbol{width:33px;height:33px;border:1px solid #29383f;border-radius:9px;display:flex;justify-content:center;align-items:center;color:#7f9ca4}.header-title h1{font-size:12px;font-weight:500;color:#c5d1d7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.header-title p{font-size:9px;color:#6d848f;margin-top:5px}.connection-state{display:inline-flex;align-items:center;gap:7px;border:1px solid #84dbc222;border-radius:20px;padding:6px 10px;color:#94b9ad;font-size:9px;white-space:nowrap}.connection-state.pending{color:#c5a669;border-color:#c5a66933}.connection-state.pending .status-dot{background:#c5a669}.demo-banner{padding:9px 35px;display:flex;align-items:center;gap:9px;background:#84dbc206;color:#87a89f;font-size:10px;line-height:1.6;border-bottom:1px solid #84dbc20a}.demo-tag{font-size:7px;letter-spacing:1px;padding:2px 5px;border-radius:3px;color:var(--accent);background:#84dbc211}.error-banner{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:14px 30px 0;background:#bd665116;border:1px solid #bd665133;border-radius:8px;padding:7px 11px;color:#e7a499;font-size:11px;line-height:1.7}.chat-scroll{overflow-y:auto;flex:1;min-height:0;scrollbar-width:thin;scrollbar-color:#2d3e46 transparent;overscroll-behavior:contain}.welcome{max-width:648px;margin:auto;padding:clamp(35px,9vh,105px) 28px 35px;text-align:center}.welcome-emblem{display:flex;justify-content:center;margin-bottom:32px}.welcome-emblem .brand-mark{height:37px;width:37px}.welcome-emblem .brand strong{font-size:37px}.welcome>.eyebrow{justify-content:center;font-size:8px;color:#6f9b8f;letter-spacing:2px}.welcome h2{font-family:'Manrope',sans-serif;font-size:clamp(24px,3vw,35px);font-weight:500;letter-spacing:-1.3px;margin:14px 0}.welcome>p{font-size:12px;color:#81949e;line-height:1.9}.suggestions{display:grid;gap:8px;margin:35px auto 0;max-width:435px;text-align:left}.suggestions button{display:flex;gap:14px;align-items:center;background:#15222a77;border:1px solid #ffffff09;border-radius:8px;padding:15px 16px;text-align:left;font-size:11px;font-weight:400;color:#9fb2bc}.suggestions button:hover{border-color:#84dbc244;background:#172931}.suggestion-number{font-family:monospace;font-size:9px;color:#52786f}.suggestion-arrow{color:#668d84;font-size:17px;margin-left:auto}.messages{max-width:850px;margin:auto;padding:34px 40px 18px}.message{display:flex;gap:13px;margin-bottom:29px}.message-avatar{height:29px;width:29px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:#84dbc20a;border:1px solid #84dbc220;color:#84dbc2;border-radius:8px}.message-avatar.user-avatar{background:#24323d;border-color:#ffffff05;font-size:10px;color:#afc0d5}.message-body{flex:1;min-width:0;padding-top:2px}.message-meta{display:flex;align-items:center;gap:10px;margin-bottom:10px}.message-meta strong{font-size:11px;font-weight:600;color:#c6d5da}.message-meta time{font-size:8px;color:#4e6875}.message-text{font-size:13px;line-height:1.85;color:#b4c3cc;white-space:pre-wrap;overflow-wrap:anywhere;tab-size:2}.message-user .message-text{color:#e0e8eb}.message-system .message-text{font-size:11px;color:#9db0b6}.message-tool .message-meta strong{color:#85a49e}.tool-output{margin:0;background:#0a1117;border:1px solid #24353f;border-radius:8px;padding:13px 15px;font-family:'Cascadia Code',Consolas,monospace;font-size:11px;line-height:1.7;color:#98b8b2;white-space:pre-wrap;overflow-wrap:anywhere;max-height:360px;overflow-y:auto;tab-size:2}.working-indicator{display:flex;align-items:center;gap:10px;color:#86a69e;font-size:10px;margin:0 0 24px 42px}.working-indicator .spinner{width:12px;height:12px;border-width:1.5px}.approval-card{margin:15px 0 25px 42px;border:1px solid #b597564d;background:#b5975609;border-radius:10px;padding:17px 19px;color:#d3c49b}.approval-heading{display:flex;align-items:center;gap:9px}.approval-heading strong{font-size:11px;font-weight:500}.approval-card p{font-size:11px;line-height:1.8;color:#aaaf9f;margin-top:10px}.approval-card pre{background:#0a1117;border:1px solid #b597561c;border-radius:5px;padding:12px;font-size:11px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere}.approval-card small{display:block;font-size:9px;color:#959d8d;overflow-wrap:anywhere;line-height:1.8}.approval-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.approval-actions .primary{padding:8px 13px;font-size:10px}.subtle-button{border:1px solid #6b726d44;background:transparent;border-radius:6px;padding:8px 13px;font-size:10px;color:#b7bcae}.subtle-button:hover{background:#ffffff05}.composer-wrap{flex-shrink:0;width:100%;max-width:850px;margin:0 auto;padding:15px 40px 19px}.composer{border:1px solid #30424a;border-radius:11px;background:#142129;box-shadow:0 10px 30px #00000014;padding:15px 15px 11px}.composer:focus-within{border-color:#84dbc25c}.composer textarea{width:100%;max-height:170px;resize:vertical;border:0;background:transparent;outline:none;font-size:13px;line-height:1.7;color:#dce4e8;min-height:45px;display:block}.composer textarea:focus-visible{outline:none}.composer textarea::placeholder{color:#738892}.composer-toolbar{display:flex;align-items:center;justify-content:space-between;margin-top:6px}.composer-toolbar>span{display:flex;align-items:center;gap:6px;color:#7d969e;font-size:9px}.composer-divider{color:#435c67;margin:0 3px}.keyboard-hint{font-size:8px;color:#5d7885}.send-button{width:33px;height:33px;border:0;border-radius:8px;background:var(--accent);color:#164438;display:flex;justify-content:center;align-items:center}.send-button:hover:not(:disabled){background:#a0ecd6}.send-button:disabled{background:#2b4748;color:#71928c;opacity:.8}.stop-button{display:flex;gap:5px;align-items:center;background:#27343d;color:#becbd0;border:1px solid #3a4b55;border-radius:6px;padding:7px 9px;font-size:10px}.stop-button:hover:not(:disabled){background:#35454e}.composer-note{display:flex;justify-content:space-between;gap:10px;margin-top:10px;font-size:8px;color:#5e7682;line-height:1.7}.composer-note>span{font-size:7px;letter-spacing:1px;color:#415c68}.mobile-only{display:none}.sidebar-overlay{display:none}
@media(min-width:1600px){.login-intro{padding:65px 90px 40px}.login-card{max-width:370px}.welcome{padding-top:15vh}.intro-copy h1{font-size:58px}}
@media(max-width:1000px){.login-intro{padding:35px}.intro-copy h1{font-size:35px}.sidebar{width:225px;padding-right:12px;padding-left:12px}.chat-header{padding:0 24px}.demo-banner{padding-right:24px;padding-left:24px}.composer-wrap{padding-left:28px;padding-right:28px}.messages{padding-left:28px;padding-right:28px}}
@media(max-width:700px){.login-page{grid-template-columns:1fr}.login-intro{padding:27px 28px;background:radial-gradient(ellipse at 0% 50%,#1c3c3b50,transparent),#101c23;border-right:0;border-bottom:1px solid #ffffff06}.intro-copy{padding:35px 0 4px}.intro-copy h1{font-size:32px;margin:15px 0;letter-spacing:-1.1px}.intro-copy>.eyebrow{font-size:8px}.intro-copy>p,.intro-terminal,.login-intro footer{display:none}.login-form-wrap{padding:35px 28px 40px;align-items:flex-start}.login-card{max-width:400px}.login-icon{display:none}.login-card h2{font-size:24px}.login-card h2 br{display:none}.login-card form{margin-top:25px}.login-card>.eyebrow{font-size:8px}.login-card>p{font-size:11px}.login-submit{padding:14px}.private-note{font-size:9px}.sidebar{position:fixed;inset:0 auto 0 0;z-index:30;transform:translateX(-100%);transition:transform .2s ease;width:270px;padding-top:22px}.sidebar.is-open{transform:translateX(0)}.sidebar-overlay{display:block;position:fixed;inset:0;z-index:20;background:#0009;border:0;padding:0}.mobile-only{display:inline-flex}.sidebar-brand{padding-bottom:24px}.chat-header{height:70px;padding:0 15px}.header-title{gap:6px}.header-symbol{display:none}.header-title h1{font-size:11px;max-width:48vw}.header-title p{font-size:8px}.connection-state{font-size:8px;padding:5px 8px;gap:5px}.demo-banner{padding:8px 17px;font-size:9px;align-items:flex-start;gap:7px}.demo-tag{margin-top:1px}.welcome{padding:45px 23px 26px}.welcome-emblem{margin-bottom:26px}.welcome-emblem .brand strong{font-size:33px}.welcome h2{font-size:26px;margin:14px 0;letter-spacing:-1px}.welcome>p{font-size:11px}.suggestions{margin-top:27px;gap:8px}.suggestions button{padding:13px 12px;font-size:10px;gap:10px}.messages{padding:26px 16px 10px}.message{gap:10px;margin-bottom:25px}.message-avatar{width:26px;height:26px;border-radius:7px}.message-avatar svg{width:15px;height:15px}.message-meta{gap:9px;margin-bottom:8px}.message-meta strong{font-size:10px}.message-meta time{font-size:7px}.message-text{font-size:12px;line-height:1.85}.tool-output{font-size:10px;padding:11px;max-height:280px}.working-indicator{margin-left:36px}.approval-card{margin-left:0;padding:14px}.approval-heading strong{font-size:10px}.approval-card p{font-size:10px}.composer-wrap{padding:10px 13px max(13px,env(safe-area-inset-bottom))}.composer{padding:13px 12px 9px}.composer textarea{font-size:16px;line-height:1.5;min-height:45px;resize:none}.composer-toolbar{margin-top:5px}.composer-note{font-size:7px;padding:0 2px;margin-top:8px}.composer-note>span{display:none}.keyboard-hint,.composer-divider{display:none}.error-banner{margin:10px 13px 0;padding:6px 9px;font-size:10px}}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}

/* SSH connection form stays inside the scrollable chat pane on narrow screens. */
.header-actions{display:flex;align-items:center;gap:12px;flex-shrink:0}.ssh-disconnect{background:transparent;border:1px solid #35484f;color:#9ab4b4;border-radius:7px;padding:7px 10px;font-size:10px;white-space:nowrap}.ssh-disconnect:hover:not(:disabled){background:#84dbc20a;border-color:#84dbc255}.ssh-connect-wrap{max-width:700px;margin:0 auto;padding:36px 32px}.ssh-connect-card{border:1px solid #2c4148;border-radius:15px;background:linear-gradient(145deg,#17283085,#101c23);padding:29px 31px;box-shadow:0 15px 45px #00000012}.ssh-card-icon{display:flex;align-items:center;justify-content:center;width:46px;height:46px;margin-bottom:23px;border:1px solid #84dbc233;border-radius:12px;color:var(--accent);background:#84dbc209}.ssh-connect-card>.eyebrow{font-size:8px;letter-spacing:1.6px}.ssh-connect-card h2{font-family:Manrope,system-ui,sans-serif;font-size:27px;font-weight:600;letter-spacing:-.8px;margin:10px 0 9px}.ssh-connect-card>p{font-size:12px;line-height:1.8;color:#8fa5ad}.ssh-connect-card form{margin-top:24px}.ssh-connect-card label{display:block;color:#b4c5cb;font-size:10px;font-weight:500;margin-bottom:8px}.ssh-connect-card input:not([type=checkbox]){width:100%;font-size:12px;border:1px solid #334750;border-radius:7px;background:#0f1a21;padding:12px;color:#dce4e8;outline-offset:2px}.ssh-connect-card input::placeholder{color:#607c88}.ssh-connect-card input:focus{border-color:#84dbc266}.ssh-target-grid{display:grid;grid-template-columns:minmax(0,1fr) 100px;gap:13px;margin-bottom:18px}.ssh-fields-grid{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:13px;margin-bottom:19px}.ssh-target-grid>div,.ssh-fields-grid>div{min-width:0}.ssh-fingerprint{padding:16px;border:1px solid #84dbc226;border-radius:9px;background:#84dbc205;margin:20px 0}.ssh-fingerprint>div{display:flex;align-items:center;gap:8px;color:#9bd9c8}.ssh-fingerprint strong{font-size:11px;font-weight:500}.ssh-fingerprint>code{display:block;margin-top:13px;padding:10px;border:1px solid #84dbc21b;background:#0b151b;border-radius:6px;font-family:Consolas,monospace;font-size:11px;line-height:1.7;color:#b2cec9;overflow-wrap:anywhere;word-break:break-word;user-select:all}.ssh-fingerprint details{margin-top:13px;color:#93a9ad;font-size:10px;line-height:1.8}.ssh-fingerprint summary{cursor:pointer;color:#8ebbac}.ssh-fingerprint details p{margin-top:9px}.ssh-fingerprint pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:10px;line-height:1.8;color:#b4c8c3;padding:10px;background:#0a151c;border-radius:6px;margin:10px 0}.ssh-fingerprint label.ssh-confirm{display:flex;align-items:flex-start;gap:9px;font-size:10px;line-height:1.7;font-weight:400;margin:16px 0 0;color:#bdd1cc}.ssh-confirm input{accent-color:var(--accent);width:14px;height:14px;margin:2px 0 0;flex-shrink:0}.ssh-password-field{margin-top:18px}.ssh-password-field small{display:block;font-size:9px;line-height:1.7;color:#80979e;margin-top:8px}.ssh-submit-row{display:flex;justify-content:flex-end;align-items:center;gap:12px;margin-top:24px}.ssh-submit-row .primary{font-size:11px;padding:12px 16px}.ssh-submit-row .subtle-button{font-size:10px}.ssh-connect-card>.ssh-footnote{border-top:1px solid #ffffff09;margin-top:25px;padding-top:17px;color:#758f99;font-size:10px;line-height:1.8}.ssh-occupied{border:1px solid #b5975644;background:#b5975609;color:#d2c18f;padding:15px 17px;border-radius:8px;font-size:12px;line-height:1.9;margin-top:24px}.composer textarea:disabled{opacity:.6;cursor:not-allowed}
@media(max-width:700px){.header-actions{gap:7px}.header-actions .connection-state{display:none}.ssh-disconnect{padding:7px;font-size:8px}.ssh-connect-wrap{padding:23px 14px}.ssh-connect-card{padding:22px 18px;border-radius:12px}.ssh-card-icon{width:39px;height:39px;margin-bottom:19px}.ssh-connect-card h2{font-size:24px}.ssh-connect-card>p{font-size:11px}.ssh-connect-card form{margin-top:21px}.ssh-target-grid{grid-template-columns:minmax(0,1fr) 78px;gap:10px}.ssh-fields-grid{grid-template-columns:1fr;gap:17px}.ssh-connect-card input:not([type=checkbox]){font-size:16px;padding:11px}.ssh-fingerprint{padding:13px}.ssh-fingerprint>code{font-size:10px}.ssh-fingerprint strong{font-size:10px}.ssh-fingerprint label.ssh-confirm{font-size:10px}.ssh-submit-row{flex-wrap:wrap;gap:10px}.ssh-submit-row .primary{padding:12px;font-size:11px}.ssh-connect-card>.ssh-footnote{font-size:9px}}
JARVIS_FILE_26580CC8FB91489F
if [[ -f front/vite.config.js ]]; then
  mkdir -p -- "$jarvis_backup/front"
  cp -- front/vite.config.js "$jarvis_backup/front/vite.config.js"
fi
cat > front/vite.config.js <<'JARVIS_FILE_791A5092AF3665FC'
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:3100' },
  },
});
JARVIS_FILE_791A5092AF3665FC
if [[ -f package-lock.json ]]; then
  mkdir -p -- "$jarvis_backup/."
  cp -- package-lock.json "$jarvis_backup/package-lock.json"
fi
cat > package-lock.json <<'JARVIS_FILE_053150B640A7CE75'
{
  "name": "jarvis-web",
  "version": "1.0.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "jarvis-web",
      "version": "1.0.0",
      "workspaces": [
        "api",
        "front"
      ],
      "devDependencies": {
        "concurrently": "^9.2.1"
      },
      "engines": {
        "node": ">=22.12.0"
      }
    },
    "api": {
      "name": "@jarvis/api",
      "version": "1.0.0",
      "dependencies": {
        "dotenv": "^17.2.3",
        "express": "^5.1.0",
        "express-rate-limit": "^8.2.1",
        "express-session": "^1.18.2",
        "helmet": "^8.1.0",
        "ssh2": "^1.17.0"
      }
    },
    "front": {
      "name": "jarvis-front",
      "version": "1.0.0",
      "dependencies": {
        "react": "^19.2.0",
        "react-dom": "^19.2.0"
      },
      "devDependencies": {
        "@vitejs/plugin-react": "^5.1.1",
        "vite": "^7.2.2"
      }
    },
    "node_modules/@babel/code-frame": {
      "version": "7.29.7",
      "resolved": "https://registry.npmjs.org/@babel/code-frame/-/code-frame-7.29.7.tgz",
      "integrity": "sha512-Aup7aUOfpbAUg2ROOJN6Iw5f9DMBlzu0mIkm/malLQFN/YQgO48wCj0Kxa3sEHJvPVFg7siR+qRInwXd2qhQKw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-validator-identifier": "^7.29.7",
        "js-tokens": "^4.0.0",
        "picocolors": "^1.1.1"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/compat-data": {
      "version": "7.29.7",
      "resolved": "https://registry.npmjs.org/@babel/compat-data/-/compat-data-7.29.7.tgz",
      "integrity": "sha512-locTkQyKvwIEgBzVrn8693ebc97F2U8ZHjbXwDXJ5Fn2TCpNwTlKcaKLkdHop5c/icOFE7qt7Q9JC5hnKNa6Gg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/core": {
      "version": "7.29.7",
      "resolved": "https://registry.npmjs.org/@babel/core/-/core-7.29.7.tgz",
      "integrity": "sha512-RgHBCvtjbOK2gXSNBNIkNoEc9qoVEtau3hj8gEqKQuL3HZAibKarWFEI3Lfm6EYKkLalOh8eSrj9b+ch9H/VBA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/code-frame": "^7.29.7",
        "@babel/generator": "^7.29.7",
        "@babel/helper-compilation-targets": "^7.29.7",
        "@babel/helper-module-transforms": "^7.29.7",
        "@babel/helpers": "^7.29.7",
        "@babel/parser": "^7.29.7",
        "@babel/template": "^7.29.7",
        "@babel/traverse": "^7.29.7",
        "@babel/types": "^7.29.7",
        "@jridgewell/remapping": "^2.3.5",
        "convert-source-map": "^2.0.0",
        "debug": "^4.1.0",
        "gensync": "^1.0.0-beta.2",
        "json5": "^2.2.3",
        "semver": "^6.3.1"
      },
      "engines": {
        "node": ">=6.9.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/babel"
      }
    },
    "node_modules/@babel/generator": {
      "version": "7.29.12",
      "resolved": "https://registry.npmjs.org/@babel/generator/-/generator-7.29.12.tgz",
      "integrity": "sha512-2W76mhjrpQFO1lK5e8IvGYB2D0YZ7S2R1Z2BjO2ZUYuW+amcpK/z60U6ZZmzskwoa7sJ6XohP/Wg8H5KxXI/IA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/parser": "^7.29.12",
        "@babel/types": "^7.29.11",
        "@jridgewell/gen-mapping": "^0.3.12",
        "@jridgewell/trace-mapping": "^0.3.28",
        "jsesc": "^3.0.2"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helper-compilation-targets": {
      "version": "7.29.7",
      "resolved": "https://registry.npmjs.org/@babel/helper-compilation-targets/-/helper-compilation-targets-7.29.7.tgz",
      "integrity": "sha512-wem6WaBj4NaVYVdNhLPPVacES6ZJ+KBBfSkTMD3YZxbP3rm3Di85tJU5ljaUNhaOynt+Aj0xruhYuzQBt8n71g==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/compat-data": "^7.29.7",
        "@babel/helper-validator-option": "^7.29.7",
        "browserslist": "^4.24.0",
        "lru-cache": "^5.1.1",
        "semver": "^6.3.1"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helper-globals": {
      "version": "7.29.7",
      "resolved": "https://registry.npmjs.org/@babel/helper-globals/-/helper-globals-7.29.7.tgz",
      "integrity": "sha512-3nQVUAtvkKH9zahfWgw96Jc/uFOmjACE1kQz82E2lqWmHBgjzbNlsC22nuQTfahmWeQtTq5nQ/4Nnd2A1wj4zA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helper-module-imports": {
      "version": "7.29.7",
      "resolved": "https://registry.npmjs.org/@babel/helper-module-imports/-/helper-module-imports-7.29.7.tgz",
      "integrity": "sha512-ejHwrQQYcm9xnTivShn2IDOlIzInN34AXskvq9QicvCtEzq1Vzclu/tKF8Jq1Cg8JG2GL6/EmjgsCT7lXepE3g==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/traverse": "^7.29.7",
        "@babel/types": "^7.29.7"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helper-module-transforms": {
      "version": "7.29.7",
      "resolved": "https://registry.npmjs.org/@babel/helper-module-transforms/-/helper-module-transforms-7.29.7.tgz",
      "integrity": "sha512-UPUVSyXbOh627KiCIGQSgwWzGeBKLkaJ9PJEdrngIwMSzxLR4jS4+f1f1jb7VzBbg8nFLaYotvVPFCTqdrmTAg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-module-imports": "^7.29.7",
        "@babel/helper-validator-identifier": "^7.29.7",
        "@babel/traverse": "^7.29.7"
      },
      "engines": {
        "node": ">=6.9.0"
      },
      "peerDependencies": {
        "@babel/core": "^7.0.0"
      }
    },
    "node_modules/@babel/helper-plugin-utils": {
      "version": "7.29.7",
      "resolved": "https://registry.npmjs.org/@babel/helper-plugin-utils/-/helper-plugin-utils-7.29.7.tgz",
      "integrity": "sha512-G7sHYigPY17oO5SYWnfD/0MTBwVR781S/JI643e/JhUYgVgWE/61SoW3NH9KWUKyKq5LVh3npif99Wkt6j86Jw==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helper-string-parser": {
      "version": "7.29.11",
      "resolved": "https://registry.npmjs.org/@babel/helper-string-parser/-/helper-string-parser-7.29.11.tgz",
      "integrity": "sha512-snZbO7MEDOof+hvNa97EjEY7qD7h2kwvQr5AJC3ZhQudKW5dnej6k3kP9NQV88hJwaS8vDqRLFo9rivLEhle2g==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helper-validator-identifier": {
      "version": "7.29.7",
      "resolved": "https://registry.npmjs.org/@babel/helper-validator-identifier/-/helper-validator-identifier-7.29.7.tgz",
      "integrity": "sha512-qehxGkRj55h/ff8EMaJ+cYhyaKlHIxqYDn682wQD7RNp9UujOQsHog2uS0r2vzr4pW+sXf90NeeayjcNaX3fFg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helper-validator-option": {
      "version": "7.29.7",
      "resolved": "https://registry.npmjs.org/@babel/helper-validator-option/-/helper-validator-option-7.29.7.tgz",
      "integrity": "sha512-N9ZErrD+yW5geCDtBqnOoxmR8+tNKiGuxKlDpuJxfsqpa2dFcexaziGAE/qoHLiDDreVNMupxGmSoNlyvsA3gw==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helpers": {
      "version": "7.29.10",
      "resolved": "https://registry.npmjs.org/@babel/helpers/-/helpers-7.29.10.tgz",
      "integrity": "sha512-EMCx3AGZ3WfAl6ht7AyQoPm2Lh+BGYEMdc4Q6Hf7uSCDOZFuLq44qNwL+iaim8VlyYhRAo4X43+weadK8ZB4Yg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/template": "^7.29.7",
        "@babel/types": "^7.29.8"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/parser": {
      "version": "7.29.12",
      "resolved": "https://registry.npmjs.org/@babel/parser/-/parser-7.29.12.tgz",
      "integrity": "sha512-WJ7JBp/Q4+z/ImydtI7jS6NVco5++632ExBemSX+Ysb+G1lCwQ5BVo3SY+jGGOcZXI4ZccbZSUSJLNBW6eEpJg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/types": "^7.29.11"
      },
      "bin": {
        "parser": "bin/babel-parser.js"
      },
      "engines": {
        "node": ">=6.0.0"
      }
    },
    "node_modules/@babel/plugin-transform-react-jsx-self": {
      "version": "7.29.7",
      "resolved": "https://registry.npmjs.org/@babel/plugin-transform-react-jsx-self/-/plugin-transform-react-jsx-self-7.29.7.tgz",
      "integrity": "sha512-TL0hMc9xzy86VD31nUiwzd5otRAcyEPcsegCxolO0PvcXuH1v0kECe/UIznYFihpkvU5wg/jk4v0TTEFfm53fw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-plugin-utils": "^7.29.7"
      },
      "engines": {
        "node": ">=6.9.0"
      },
      "peerDependencies": {
        "@babel/core": "^7.0.0-0"
      }
    },
    "node_modules/@babel/plugin-transform-react-jsx-source": {
      "version": "7.29.7",
      "resolved": "https://registry.npmjs.org/@babel/plugin-transform-react-jsx-source/-/plugin-transform-react-jsx-source-7.29.7.tgz",
      "integrity": "sha512-06IyK09H3wi4cGbhDBwp5gUGo0IKtnYa8tyTiephirPCK6fbobVGiXMMI5zLQ4aKEYP3wZ3ArU44o+8KMrSG/Q==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-plugin-utils": "^7.29.7"
      },
      "engines": {
        "node": ">=6.9.0"
      },
      "peerDependencies": {
        "@babel/core": "^7.0.0-0"
      }
    },
    "node_modules/@babel/template": {
      "version": "7.29.7",
      "resolved": "https://registry.npmjs.org/@babel/template/-/template-7.29.7.tgz",
      "integrity": "sha512-puq+Gf35oI24FeN11LkoUQFqv9uwNeWpxXZi/Ji3rRIoKAzKnxRaZ+Gkj0vKS9ZCiTESfng1N9LyOyXvo+m+Gg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/code-frame": "^7.29.7",
        "@babel/parser": "^7.29.7",
        "@babel/types": "^7.29.7"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/traverse": {
      "version": "7.29.12",
      "resolved": "https://registry.npmjs.org/@babel/traverse/-/traverse-7.29.12.tgz",
      "integrity": "sha512-MscXe/NAZcOkYEsRajHZFt3ynsb22PUi6CTrp5U7+RYycR9By84mn9mFN54YgfITiqK4hFx3Ju3tZSyzfpS5ew==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/code-frame": "^7.29.7",
        "@babel/generator": "^7.29.12",
        "@babel/helper-globals": "^7.29.7",
        "@babel/parser": "^7.29.12",
        "@babel/template": "^7.29.7",
        "@babel/types": "^7.29.11",
        "debug": "^4.3.1"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/types": {
      "version": "7.29.11",
      "resolved": "https://registry.npmjs.org/@babel/types/-/types-7.29.11.tgz",
      "integrity": "sha512-WCsemW40Cpc6gouC1SrY6PBaZ+oLRlEVY9XBvZBI7il/HyUrb2nJ505wE1MHEFyDZNnrWDEuy4jL50WVHfTTSQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-string-parser": "^7.29.11",
        "@babel/helper-validator-identifier": "^7.29.7"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@esbuild/aix-ppc64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/aix-ppc64/-/aix-ppc64-0.28.2.tgz",
      "integrity": "sha512-XExcO+dvLKvVtNTibSTBej1NCAbaGhWn9Ww1ZPx80qsahhPFe/8jgWP0IchNe0F3HwkU7n8ejhH8bjonqht8mQ==",
      "cpu": [
        "ppc64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "aix"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/android-arm": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/android-arm/-/android-arm-0.28.2.tgz",
      "integrity": "sha512-kXXoiPVVGQcnIYGOeaovwOURpniDBpSq4A03qkQ+BMQqtGG6HYap3xne9C1O1yo4TR3qxlCX5IqqmX6fFo2Lqg==",
      "cpu": [
        "arm"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "android"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/android-arm64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/android-arm64/-/android-arm64-0.28.2.tgz",
      "integrity": "sha512-5YfKeeI8qWfBZIX+u2xZC3Zlb3Os/gLS2sbEKM+I4ZOcsWmHS2WLysCcQZDAFRslDUU5Oiq44gf6PYN1vGwG5A==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "android"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/android-x64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/android-x64/-/android-x64-0.28.2.tgz",
      "integrity": "sha512-O387ite7SzUyCcy3JQX4P4bLtEA7bLLkx+esve5JHnyYfNTxcVpXZo9jhdB0lTKN44gztELTdU7nS8Nr16Fs1Q==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "android"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/darwin-arm64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/darwin-arm64/-/darwin-arm64-0.28.2.tgz",
      "integrity": "sha512-n4KqkOQrraxHJcgjM1RvwbigfQKIKJVpM7xp+KsxiyUSrRdIXnt73VhrPAx0fV44hgfmIVKjxMN9J1t5jySVkw==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/darwin-x64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/darwin-x64/-/darwin-x64-0.28.2.tgz",
      "integrity": "sha512-uq6suIWYP37qzGddBKPw5QEQPi6HiLGsO7UmkpfyaYNQ3D+rN6w6WfwH+nuqcGXWvawGwxOEroO4YGnFh95azw==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/freebsd-arm64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/freebsd-arm64/-/freebsd-arm64-0.28.2.tgz",
      "integrity": "sha512-n+I0BTSRIoy+d6RPKnEVwql5UwBJolytvY4mAOIEJorKlqgPII8ix6slVVrfZ5Tnj7glIZvloylbB/EJPMWEXw==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "freebsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/freebsd-x64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/freebsd-x64/-/freebsd-x64-0.28.2.tgz",
      "integrity": "sha512-78XJTJkvPs0kz2w61301PJjXl4g7q3JqiYMZ/M/yVI73EHBrCRTgkhu9oqG7vPqq+a/yadEW8aD+agKlk5xrmg==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "freebsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-arm": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-arm/-/linux-arm-0.28.2.tgz",
      "integrity": "sha512-XlDnu2q5yoqems+xay6wSAcg9DDD7K9RLKZEBOMZm3ckNpJBvOX20tSfby8KfrrhINDyv9V2YVZKY/SpoGJI8w==",
      "cpu": [
        "arm"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-arm64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-arm64/-/linux-arm64-0.28.2.tgz",
      "integrity": "sha512-pW4AC0P3it8c7do9MVM4p51FzHzdM/TZrerurgRcHJ2WTa1VQ1CIq18xncfpBJw4ojkiZZrKW2yIBWBP92j6Ug==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-ia32": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-ia32/-/linux-ia32-0.28.2.tgz",
      "integrity": "sha512-CYbnj78HsIeA+DhgUKgFCfvNsTHFhMMrinUrMZpDXJXKN8T3XViTZ/+wtHeVxEWY8ewSzTFN+nRmSwO2tZaLUQ==",
      "cpu": [
        "ia32"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-loong64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-loong64/-/linux-loong64-0.28.2.tgz",
      "integrity": "sha512-buwkd8nsph4R+ajRvw0qM5Hja/TXQow3ptzWO2EbG/cqcIkHloRrdlBtQlshyYGTNFvfkfJ5tpPLVkY4DtsPfQ==",
      "cpu": [
        "loong64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-mips64el": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-mips64el/-/linux-mips64el-0.28.2.tgz",
      "integrity": "sha512-ZVykbDyk7519VwiNb9Lcj9m8XM6v5V9uKPvrEMkkEedVewf+0itkhahp4HDpgERXhwLRpWFypsGbG/J8s0QjJA==",
      "cpu": [
        "mips64el"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-ppc64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-ppc64/-/linux-ppc64-0.28.2.tgz",
      "integrity": "sha512-CAXl+Dtd9UUuJd8pKKdwh6MLm3MUMiqMPmhZ3tTSXPqfyQ3vDl6R5hZdZ/kYojK4ofXtdfSv1tFq8XzWx3heNQ==",
      "cpu": [
        "ppc64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-riscv64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-riscv64/-/linux-riscv64-0.28.2.tgz",
      "integrity": "sha512-GeXCej4IQtU1B+QlDV8W/RRvbzI3O/Stss+/bCXv4lZls5WGRtu2a+3JkA3i4qIUlMXpcHebWpF8AkJhATowuA==",
      "cpu": [
        "riscv64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-s390x": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-s390x/-/linux-s390x-0.28.2.tgz",
      "integrity": "sha512-3H1weTYZPxt/WOhByszQZybS9w5lKzUn1FDMsgEChbHWQwHYQQRfBxgCcZvPhjHfKyJjIievvMmEUawJrdY9Dg==",
      "cpu": [
        "s390x"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/linux-x64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/linux-x64/-/linux-x64-0.28.2.tgz",
      "integrity": "sha512-4xTZr1FUmSoQW4XIWmit3tzQrUTZM+N3P0XV8xROKYF50XfI7xeO90+1bZvNwxIufQ9hDQVRJH5YhgPVF8A/HQ==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/netbsd-arm64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/netbsd-arm64/-/netbsd-arm64-0.28.2.tgz",
      "integrity": "sha512-sSATRjPeDBg3pdgHoQfoYBob11Kk1FGa9lui5RIHZCoCkJa9QKlvl3/vKz2usCmYYjs7ymJR/2Nnsqe+Hjt5nw==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "netbsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/netbsd-x64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/netbsd-x64/-/netbsd-x64-0.28.2.tgz",
      "integrity": "sha512-lqnzCV+mM0gIADaKihiCg6ifgfU2L3h5E33rNQBN1Y4MaVGnzryzmvvf7UHxprpQdE8hpqLolJ9Rl+SkIRDpyw==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "netbsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/openbsd-arm64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/openbsd-arm64/-/openbsd-arm64-0.28.2.tgz",
      "integrity": "sha512-AL2qJILH7lNjrDmCQDvdxMfAUIv8KMNZOvrwAQ8i8//ntL9FflhOyMJ8OZSMBb8/AWXe3/5v5S20y3zCoZWKoQ==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "openbsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/openbsd-x64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/openbsd-x64/-/openbsd-x64-0.28.2.tgz",
      "integrity": "sha512-QtiuPytchRyC4rwUKhexJdQKvDuZ6hWloi3igqPQNUJCS1/v9EiO3UTOXR6A3FoMo4fnAKbWJdqaIwhOzh8qEw==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "openbsd"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/openharmony-arm64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/openharmony-arm64/-/openharmony-arm64-0.28.2.tgz",
      "integrity": "sha512-WkhYDmpTjLvGlScA1rwjRUmhl4k8oXR3cIbtqWmELgU/dFeHHlEllxDvdWcNJV9rbzCexB5vz8gtNewWLgCT7Q==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "openharmony"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/sunos-x64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/sunos-x64/-/sunos-x64-0.28.2.tgz",
      "integrity": "sha512-GPMSkTOtMnv2U2F8gxe4Io6qmVs+YKyp832Etqqxr0hFngmXQ3rzwytelm3GIn7T4VviRUlf3sOgBOiTdvaf7g==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "sunos"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/win32-arm64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/win32-arm64/-/win32-arm64-0.28.2.tgz",
      "integrity": "sha512-PIhhEkE9uPBleRBrQEJpUn7MBnibZzbGzYWPmY3x+YoVg/95zbjB4CxPPOQ8l5tYYM4mMaCthF8/1DIfBQQyWQ==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/win32-ia32": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/win32-ia32/-/win32-ia32-0.28.2.tgz",
      "integrity": "sha512-YmJbfTlvU7Sdn9BB+4PRES4oB6pxgS37MAONj+hBr/cpXS1aBPKXxNnDbu+QCWPj0o9dgyxeq79g6c5P8KeuYA==",
      "cpu": [
        "ia32"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@esbuild/win32-x64": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/@esbuild/win32-x64/-/win32-x64-0.28.2.tgz",
      "integrity": "sha512-5ebpxr3nWMzrL/rnUI755Jkuee0bHL/Gq0WTF9lvcpv73wAp5eu8MfBUgWK9bhWvZjj7yX8etf/8tI8Ney695g==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@jarvis/api": {
      "resolved": "api",
      "link": true
    },
    "node_modules/@jridgewell/gen-mapping": {
      "version": "0.3.13",
      "resolved": "https://registry.npmjs.org/@jridgewell/gen-mapping/-/gen-mapping-0.3.13.tgz",
      "integrity": "sha512-2kkt/7niJ6MgEPxF0bYdQ6etZaA+fQvDcLKckhy1yIQOzaoKjBBjSj63/aLVjYE3qhRt5dvM+uUyfCg6UKCBbA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jridgewell/sourcemap-codec": "^1.5.0",
        "@jridgewell/trace-mapping": "^0.3.24"
      }
    },
    "node_modules/@jridgewell/remapping": {
      "version": "2.3.5",
      "resolved": "https://registry.npmjs.org/@jridgewell/remapping/-/remapping-2.3.5.tgz",
      "integrity": "sha512-LI9u/+laYG4Ds1TDKSJW2YPrIlcVYOwi2fUC6xB43lueCjgxV4lffOCZCtYFiH6TNOX+tQKXx97T4IKHbhyHEQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jridgewell/gen-mapping": "^0.3.5",
        "@jridgewell/trace-mapping": "^0.3.24"
      }
    },
    "node_modules/@jridgewell/resolve-uri": {
      "version": "3.1.2",
      "resolved": "https://registry.npmjs.org/@jridgewell/resolve-uri/-/resolve-uri-3.1.2.tgz",
      "integrity": "sha512-bRISgCIjP20/tbWSPWMEi54QVPRZExkuD9lJL+UIxUKtwVJA8wW1Trb1jMs1RFXo1CBTNZ/5hpC9QvmKWdopKw==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.0.0"
      }
    },
    "node_modules/@jridgewell/sourcemap-codec": {
      "version": "1.6.0",
      "resolved": "https://registry.npmjs.org/@jridgewell/sourcemap-codec/-/sourcemap-codec-1.6.0.tgz",
      "integrity": "sha512-T7jf+5zgsZHwNJ4lvQ7/aezbyk0nNX+zJVWpmHA7VYsEx7a7qr5Rg5IbtJFqkgze5Y2sruq1RUY8Q837Od7iFw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/@jridgewell/trace-mapping": {
      "version": "0.3.31",
      "resolved": "https://registry.npmjs.org/@jridgewell/trace-mapping/-/trace-mapping-0.3.31.tgz",
      "integrity": "sha512-zzNR+SdQSDJzc8joaeP8QQoCQr8NuYx2dIIytl1QeBEZHJ9uW6hebsrYgbz8hJwUQao3TWCMtmfV8Nu1twOLAw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jridgewell/resolve-uri": "^3.1.0",
        "@jridgewell/sourcemap-codec": "^1.4.14"
      }
    },
    "node_modules/@napi-rs/lzma-linux-x64-gnu": {
      "version": "1.5.1",
      "resolved": "https://registry.npmjs.org/@napi-rs/lzma-linux-x64-gnu/-/lzma-linux-x64-gnu-1.5.1.tgz",
      "integrity": "sha512-oTXEIha4SsuXdTA4Iyskj0kpdx2yVXdhd75c2v3xGrHFfVMsbhTPZU/nMPL4sWKo4pBHm3aucLaqGlF696dTyQ==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "libc": [
        "glibc"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": "^22.20 || ^24.12 || >=25"
      }
    },
    "node_modules/@rolldown/pluginutils": {
      "version": "1.0.0-rc.3",
      "resolved": "https://registry.npmjs.org/@rolldown/pluginutils/-/pluginutils-1.0.0-rc.3.tgz",
      "integrity": "sha512-eybk3TjzzzV97Dlj5c+XrBFW57eTNhzod66y9HrBlzJ6NsCrWCp/2kaPS3K9wJmurBC0Tdw4yPjXKZqlznim3Q==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/@rollup/rollup-android-arm-eabi": {
      "version": "4.66.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-android-arm-eabi/-/rollup-android-arm-eabi-4.66.0.tgz",
      "integrity": "sha512-7y4XeoUHPecjfUDRmap8U0q6bjfLAPn7uOGT8BKyqy8uNDOjsGS8rlBhOx6sZLVwwjN6hapvGl2mW9/IS6UNww==",
      "cpu": [
        "arm"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "android"
      ]
    },
    "node_modules/@rollup/rollup-android-arm64": {
      "version": "4.66.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-android-arm64/-/rollup-android-arm64-4.66.0.tgz",
      "integrity": "sha512-e8WugYZXpgqrlMXLCudYVRAxAcK7AIY36JxRDwFRD38L9q62G1VsEUW6ijXxzjxYjNB8i1zo3B/ycIQ/qjLC/Q==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "android"
      ]
    },
    "node_modules/@rollup/rollup-darwin-arm64": {
      "version": "4.66.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-darwin-arm64/-/rollup-darwin-arm64-4.66.0.tgz",
      "integrity": "sha512-6vkDCfyDjNLokh+Rt1D2KtNgFFMEPdkWha/mbtP4cSjh9xiN8T/JBS/A7nDYKjmMAXHrvR9J3AzUk2LtFbIBLg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ]
    },
    "node_modules/@rollup/rollup-darwin-x64": {
      "version": "4.66.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-darwin-x64/-/rollup-darwin-x64-4.66.0.tgz",
      "integrity": "sha512-/mzZAX0+Q6eXxvkR0HB0RZCCrsbmFD8DpsvCQoMYABDfq/DjqkbfytuJ7GvZ4AhR/Mgis2fXbZrGqfbcK2Z5fA==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ]
    },
    "node_modules/@rollup/rollup-freebsd-arm64": {
      "version": "4.66.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-freebsd-arm64/-/rollup-freebsd-arm64-4.66.0.tgz",
      "integrity": "sha512-JQJx9E8tUjGqed1RevDmoHaS3V30ODdV8uyvGxlwd4K5se6bkPrMeltSybqAtpJ+ltDRfo7FORQaJG2Hd5nGog==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "freebsd"
      ]
    },
    "node_modules/@rollup/rollup-freebsd-x64": {
      "version": "4.66.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-freebsd-x64/-/rollup-freebsd-x64-4.66.0.tgz",
      "integrity": "sha512-GEaUQQjMaG7X1304qMgqLjzCKv6CdDirzJSS+UqUs3xhJ9X2Kjzu0JDbLoUU42FWxwmZqz+SsgU1SlQv9GNRVA==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "freebsd"
      ]
    },
    "node_modules/@rollup/rollup-linux-arm-gnueabihf": {
      "version": "4.66.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-arm-gnueabihf/-/rollup-linux-arm-gnueabihf-4.66.0.tgz",
      "integrity": "sha512-DgmAU9N0NhDQDzHgFUocDio7zRO8jR/nY/obDGvCR8zbJ6J77Fg6X49yPuExJUpYPbC82EOaRhG969pWzUSnHQ==",
      "cpu": [
        "arm"
      ],
      "dev": true,
      "libc": [
        "glibc"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-linux-arm-musleabihf": {
      "version": "4.66.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-arm-musleabihf/-/rollup-linux-arm-musleabihf-4.66.0.tgz",
      "integrity": "sha512-zG09YZ+sk/HoHq+P9gYB0EseQ3M20RbDuKGWey6fbiMDV1LxfXvhgSW9jDaCcvFPMgfLXpimzXY+UYvA8R2mLQ==",
      "cpu": [
        "arm"
      ],
      "dev": true,
      "libc": [
        "musl"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-linux-arm64-gnu": {
      "version": "4.66.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-arm64-gnu/-/rollup-linux-arm64-gnu-4.66.0.tgz",
      "integrity": "sha512-vlArhgyXbcVc1D4WZPoiYuqJIaMiSHBj6etRXua0KlfjlZeuiQyVAPYi0/N49O4mSp3u1iGUBLEjNa8ec81XZg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "libc": [
        "glibc"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-linux-arm64-musl": {
      "version": "4.66.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-arm64-musl/-/rollup-linux-arm64-musl-4.66.0.tgz",
      "integrity": "sha512-RxJZtk0G87YPotDaRDvRqStV8cbqLSC5TroHvQHHKsqBg0ok64RxKgtXeFsa7FBcy7mb4crBrG3xK8USWIqWNA==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "libc": [
        "musl"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-linux-loong64-gnu": {
      "version": "4.66.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-loong64-gnu/-/rollup-linux-loong64-gnu-4.66.0.tgz",
      "integrity": "sha512-qlGcw959PrLLkZhiBxF3OZ6SQvj+OKY85mCqGNgSRs4LZlDJ6ICqmz6UdxtINdhcXYwNIbZoapQVBAmZlD2hUQ==",
      "cpu": [
        "loong64"
      ],
      "dev": true,
      "libc": [
        "glibc"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-linux-loong64-musl": {
      "version": "4.66.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-loong64-musl/-/rollup-linux-loong64-musl-4.66.0.tgz",
      "integrity": "sha512-TvTI/7Cy0WvRA1SXgwzu6bwXBnMpmeT/ln5q7WvSpqmXy1VbmEnY8HVIDQNBiaHJvoWqRr0M4FNo7qiqtyMaFw==",
      "cpu": [
        "loong64"
      ],
      "dev": true,
      "libc": [
        "musl"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-linux-ppc64-gnu": {
      "version": "4.66.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-ppc64-gnu/-/rollup-linux-ppc64-gnu-4.66.0.tgz",
      "integrity": "sha512-UZEDkSoDRZ50NyLj70nO6mpIK3dvs2cPTTvQb1bA/PBDmr9fvn5KiESuGfh6srd7Zi6Lt9Sv2sVrFr1QoHLvPQ==",
      "cpu": [
        "ppc64"
      ],
      "dev": true,
      "libc": [
        "glibc"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-linux-ppc64-musl": {
      "version": "4.66.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-ppc64-musl/-/rollup-linux-ppc64-musl-4.66.0.tgz",
      "integrity": "sha512-VRbxTvagLh3HRcysx1CNq+HHcvJbSebNI6fCbk7jwmmWHkXjrSIV3igXBpRHUTFdg0pagWGu50xoSZXnrZHjVQ==",
      "cpu": [
        "ppc64"
      ],
      "dev": true,
      "libc": [
        "musl"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-linux-riscv64-gnu": {
      "version": "4.66.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-riscv64-gnu/-/rollup-linux-riscv64-gnu-4.66.0.tgz",
      "integrity": "sha512-uWdJpvYqh0LE/i+YBL3sMX0a2kUkICENjmrPmyBmMOFc3jMrs6MSQH/pMD+VIpGEoUcr3XkHGLLfymzIqPSRRg==",
      "cpu": [
        "riscv64"
      ],
      "dev": true,
      "libc": [
        "glibc"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-linux-riscv64-musl": {
      "version": "4.66.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-riscv64-musl/-/rollup-linux-riscv64-musl-4.66.0.tgz",
      "integrity": "sha512-3FUd88pxgWAjK60OgCrika1AcNG+u8zaCdWjg4TlcZTDkt5TGyci8ZU64l3OJ9ax0MEjw3P80B/3PoSQDCLwJQ==",
      "cpu": [
        "riscv64"
      ],
      "dev": true,
      "libc": [
        "musl"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-linux-s390x-gnu": {
      "version": "4.66.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-s390x-gnu/-/rollup-linux-s390x-gnu-4.66.0.tgz",
      "integrity": "sha512-qT2rMmgyej62g5AdwktK+Bt2lBu497pzWZe12TTQ5JmZjOYPnEwcPEAOSLTBxBV+6gIES75rXm219v/QkT397A==",
      "cpu": [
        "s390x"
      ],
      "dev": true,
      "libc": [
        "glibc"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-linux-x64-gnu": {
      "version": "4.66.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-x64-gnu/-/rollup-linux-x64-gnu-4.66.0.tgz",
      "integrity": "sha512-E46rnZgp7J84Qwe8RMlF+rgimnDo/9fuiGbUArGB0ZkMWf97O7yeSCfKls5x/YJOF0RcuSe9RctuKe1hlxICiA==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "libc": [
        "glibc"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-linux-x64-musl": {
      "version": "4.66.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-x64-musl/-/rollup-linux-x64-musl-4.66.0.tgz",
      "integrity": "sha512-Uz1HiZe+qBzqgdPsON+z0wRx3WdATuyzwvGT6cr2VZVrqqko0ZJVfkrQJtwDMuDcAfXYdo7XucaxJ7lTLjEcgg==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "libc": [
        "musl"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ]
    },
    "node_modules/@rollup/rollup-openbsd-x64": {
      "version": "4.66.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-openbsd-x64/-/rollup-openbsd-x64-4.66.0.tgz",
      "integrity": "sha512-Ph7TX3Ex5qdfcb7Tc6eEPugVkRfJ501eTovO4T5029YObfpZ7dzn3RiwpFvGp50nk2QUhvBMZ0PFGlEj6pOYTg==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "openbsd"
      ]
    },
    "node_modules/@rollup/rollup-openharmony-arm64": {
      "version": "4.66.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-openharmony-arm64/-/rollup-openharmony-arm64-4.66.0.tgz",
      "integrity": "sha512-nZYPEya7ZkeNxUEiF7qmNZbyLTyRN3MK5cO22KqsaoneUzXJuzBIQRw+7BEQy9LGj2O5vrCE9V3EpK06FYo1tQ==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "openharmony"
      ]
    },
    "node_modules/@rollup/rollup-win32-arm64-msvc": {
      "version": "4.66.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-win32-arm64-msvc/-/rollup-win32-arm64-msvc-4.66.0.tgz",
      "integrity": "sha512-u7aTfS3R6C4hRsqXSzaO6qLZYLVuMkHMvcWlux4IM8IJif1VCl2cgPBSo5gSNoFoStQypQP+qwq8W1IyFBf1QQ==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ]
    },
    "node_modules/@rollup/rollup-win32-ia32-msvc": {
      "version": "4.66.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-win32-ia32-msvc/-/rollup-win32-ia32-msvc-4.66.0.tgz",
      "integrity": "sha512-e+i9ueHrH1Bafb0cf0woAIVJbYcoC8vRaD+vz+Xi8w6jz9cYJSV3vyKO6ELGSZ6g4W4MJOm2WPLN4/nQf77h7w==",
      "cpu": [
        "ia32"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ]
    },
    "node_modules/@rollup/rollup-win32-x64-gnu": {
      "version": "4.66.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-win32-x64-gnu/-/rollup-win32-x64-gnu-4.66.0.tgz",
      "integrity": "sha512-KfTCbrtr2zXTqH2E1F+uYlFTrYibxHKqPAHobpd8Kfg49cEHmuHebOidCTDRgqG1suaPFX7oejFQeGE71zWKfA==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ]
    },
    "node_modules/@rollup/rollup-win32-x64-msvc": {
      "version": "4.66.0",
      "resolved": "https://registry.npmjs.org/@rollup/rollup-win32-x64-msvc/-/rollup-win32-x64-msvc-4.66.0.tgz",
      "integrity": "sha512-xA+neBh1bqkqaS3b48T2UHZnDsTIpb9B0h+TdBzynjF/ymCpYndhfY10RqW0qSKB1HqqQA83mINVhAdwA+mETg==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ]
    },
    "node_modules/@types/babel__core": {
      "version": "7.20.5",
      "resolved": "https://registry.npmjs.org/@types/babel__core/-/babel__core-7.20.5.tgz",
      "integrity": "sha512-qoQprZvz5wQFJwMDqeseRXWv3rqMvhgpbXFfVyWhbx9X47POIA6i/+dXefEmZKoAgOaTdaIgNSMqMIU61yRyzA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/parser": "^7.20.7",
        "@babel/types": "^7.20.7",
        "@types/babel__generator": "*",
        "@types/babel__template": "*",
        "@types/babel__traverse": "*"
      }
    },
    "node_modules/@types/babel__generator": {
      "version": "7.27.0",
      "resolved": "https://registry.npmjs.org/@types/babel__generator/-/babel__generator-7.27.0.tgz",
      "integrity": "sha512-ufFd2Xi92OAVPYsy+P4n7/U7e68fex0+Ee8gSG9KX7eo084CWiQ4sdxktvdl0bOPupXtVJPY19zk6EwWqUQ8lg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/types": "^7.0.0"
      }
    },
    "node_modules/@types/babel__template": {
      "version": "7.4.4",
      "resolved": "https://registry.npmjs.org/@types/babel__template/-/babel__template-7.4.4.tgz",
      "integrity": "sha512-h/NUaSyG5EyxBIp8YRxo4RMe2/qQgvyowRwVMzhYhBCONbW8PUsg4lkFMrhgZhUe5z3L3MiLDuvyJ/CaPa2A8A==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/parser": "^7.1.0",
        "@babel/types": "^7.0.0"
      }
    },
    "node_modules/@types/babel__traverse": {
      "version": "7.28.0",
      "resolved": "https://registry.npmjs.org/@types/babel__traverse/-/babel__traverse-7.28.0.tgz",
      "integrity": "sha512-8PvcXf70gTDZBgt9ptxJ8elBeBjcLOAcOtoO/mPJjtji1+CdGbHgm77om1GrsPxsiE+uXIpNSK64UYaIwQXd4Q==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/types": "^7.28.2"
      }
    },
    "node_modules/@types/estree": {
      "version": "1.0.9",
      "resolved": "https://registry.npmjs.org/@types/estree/-/estree-1.0.9.tgz",
      "integrity": "sha512-GhdPgy1el4/ImP05X05Uw4cw2/M93BCUmnEvWZNStlCzEKME4Fkk+YpoA5OiHNQmoS7Cafb8Xa3Pya8m1Qrzeg==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/@vitejs/plugin-react": {
      "version": "5.2.0",
      "resolved": "https://registry.npmjs.org/@vitejs/plugin-react/-/plugin-react-5.2.0.tgz",
      "integrity": "sha512-YmKkfhOAi3wsB1PhJq5Scj3GXMn3WvtQ/JC0xoopuHoXSdmtdStOpFrYaT1kie2YgFBcIe64ROzMYRjCrYOdYw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/core": "^7.29.0",
        "@babel/plugin-transform-react-jsx-self": "^7.27.1",
        "@babel/plugin-transform-react-jsx-source": "^7.27.1",
        "@rolldown/pluginutils": "1.0.0-rc.3",
        "@types/babel__core": "^7.20.5",
        "react-refresh": "^0.18.0"
      },
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      },
      "peerDependencies": {
        "vite": "^4.2.0 || ^5.0.0 || ^6.0.0 || ^7.0.0 || ^8.0.0"
      }
    },
    "node_modules/accepts": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/accepts/-/accepts-2.0.0.tgz",
      "integrity": "sha512-5cvg6CtKwfgdmVqY1WIiXKc3Q1bkRqGLi+2W/6ao+6Y7gu/RCwRuAhGEzh5B4KlszSuTLgZYuqFqo5bImjNKng==",
      "license": "MIT",
      "dependencies": {
        "mime-types": "^3.0.0",
        "negotiator": "^1.0.0"
      },
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/ansi-regex": {
      "version": "5.0.1",
      "resolved": "https://registry.npmjs.org/ansi-regex/-/ansi-regex-5.0.1.tgz",
      "integrity": "sha512-quJQXlTSUGL2LH9SUXo8VwsY4soanhgo6LNSm84E1LBcE8s3O0wpdiRzyR9z/ZZJMlMWv37qOOb9pdJlMUEKFQ==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/ansi-styles": {
      "version": "4.3.0",
      "resolved": "https://registry.npmjs.org/ansi-styles/-/ansi-styles-4.3.0.tgz",
      "integrity": "sha512-zbB9rCJAT1rbjiVDb2hqKFHNYLxgtk8NURxZ3IZwD3F6NtxbXZQCnnSi1Lkx+IDohdPlFp222wVALIheZJQSEg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "color-convert": "^2.0.1"
      },
      "engines": {
        "node": ">=8"
      },
      "funding": {
        "url": "https://github.com/chalk/ansi-styles?sponsor=1"
      }
    },
    "node_modules/asn1": {
      "version": "0.2.6",
      "resolved": "https://registry.npmjs.org/asn1/-/asn1-0.2.6.tgz",
      "integrity": "sha512-ix/FxPn0MDjeyJ7i/yoHGFt/EX6LyNbxSEhPPXODPL+KB0VPk86UYfL0lMdy+KCnv+fmvIzySwaK5COwqVbWTQ==",
      "license": "MIT",
      "dependencies": {
        "safer-buffer": "~2.1.0"
      }
    },
    "node_modules/baseline-browser-mapping": {
      "version": "2.11.34",
      "resolved": "https://registry.npmjs.org/baseline-browser-mapping/-/baseline-browser-mapping-2.11.34.tgz",
      "integrity": "sha512-Aqr8mA1kIvyJ3UY5YAY7ib8LSo1DmDMbMnVqGPtsKW1LxaFQFwn9Eb3yvq2fUKJsRvaXjnAV7R5osqETapzNiA==",
      "dev": true,
      "license": "Apache-2.0",
      "bin": {
        "baseline-browser-mapping": "dist/cli.cjs"
      },
      "engines": {
        "node": ">=6.0.0"
      }
    },
    "node_modules/bcrypt-pbkdf": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/bcrypt-pbkdf/-/bcrypt-pbkdf-1.0.2.tgz",
      "integrity": "sha512-qeFIXtP4MSoi6NLqO12WfqARWWuCKi2Rn/9hJLEmtB5yTNr9DqFWkJRCf2qShWzPeAMRnOgCrq0sg/KLv5ES9w==",
      "license": "BSD-3-Clause",
      "dependencies": {
        "tweetnacl": "^0.14.3"
      }
    },
    "node_modules/body-parser": {
      "version": "2.4.0",
      "resolved": "https://registry.npmjs.org/body-parser/-/body-parser-2.4.0.tgz",
      "integrity": "sha512-Ifk1KcLrxaGt1occQagQNFNNOqRt1LFuehEnHHzB8Z6cRgIxRU1TBaiIsUiCdA+gy5PL7Y1IX31DNKkRmxtXjQ==",
      "license": "MIT",
      "dependencies": {
        "bytes": "^3.1.2",
        "content-type": "^2.1.0",
        "debug": "^4.4.3",
        "http-errors": "^2.0.1",
        "iconv-lite": "^0.7.3",
        "on-finished": "^2.4.1",
        "qs": "^6.16.1",
        "raw-body": "^3.0.2",
        "type-is": "^2.1.0"
      },
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/browserslist": {
      "version": "4.29.5",
      "resolved": "https://registry.npmjs.org/browserslist/-/browserslist-4.29.5.tgz",
      "integrity": "sha512-khTmKu5NGYTotqcYo8Bew2k4RAE9PuXRSFRXG2lQBrCEQHyeQ/vX6gKMxfokwywBsLiXZMnHsmWMG1pnO8J7uQ==",
      "dev": true,
      "funding": [
        {
          "type": "opencollective",
          "url": "https://opencollective.com/browserslist"
        },
        {
          "type": "tidelift",
          "url": "https://tidelift.com/funding/github/npm/browserslist"
        },
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "baseline-browser-mapping": "^2.11.33",
        "caniuse-lite": "^1.0.30001819",
        "electron-to-chromium": "^1.5.464",
        "node-releases": "^2.0.60",
        "update-browserslist-db": "^1.3.4"
      },
      "bin": {
        "browserslist": "cli.js"
      },
      "engines": {
        "node": "^6 || ^7 || ^8 || ^9 || ^10 || ^11 || ^12 || >=13.7"
      }
    },
    "node_modules/buildcheck": {
      "version": "0.0.7",
      "resolved": "https://registry.npmjs.org/buildcheck/-/buildcheck-0.0.7.tgz",
      "integrity": "sha512-lHblz4ahamxpTmnsk+MNTRWsjYKv965MwOrSJyeD588rR3Jcu7swE+0wN5F+PbL5cjgu/9ObkhfzEPuofEMwLA==",
      "optional": true,
      "engines": {
        "node": ">=10.0.0"
      }
    },
    "node_modules/bytes": {
      "version": "3.1.2",
      "resolved": "https://registry.npmjs.org/bytes/-/bytes-3.1.2.tgz",
      "integrity": "sha512-/Nf7TyzTx6S3yRJObOAV7956r8cr2+Oj8AC5dt8wSP3BQAoeX58NoHyCU8P8zGkNXStjTSi6fzO6F0pBdcYbEg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/call-bind-apply-helpers": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/call-bind-apply-helpers/-/call-bind-apply-helpers-1.0.2.tgz",
      "integrity": "sha512-Sp1ablJ0ivDkSzjcaJdxEunN5/XvksFJ2sMBFfq6x0ryhQV/2b/KwFe21cMpmHtPOSij8K99/wSfoEuTObmuMQ==",
      "license": "MIT",
      "dependencies": {
        "es-errors": "^1.3.0",
        "function-bind": "^1.1.2"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/call-bound": {
      "version": "1.0.4",
      "resolved": "https://registry.npmjs.org/call-bound/-/call-bound-1.0.4.tgz",
      "integrity": "sha512-+ys997U96po4Kx/ABpBCqhA9EuxJaQWDQg7295H4hBphv3IZg0boBKuwYpt4YXp6MZ5AmZQnU/tyMTlRpaSejg==",
      "license": "MIT",
      "dependencies": {
        "call-bind-apply-helpers": "^1.0.2",
        "get-intrinsic": "^1.3.0"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/caniuse-lite": {
      "version": "1.0.30001820",
      "resolved": "https://registry.npmjs.org/caniuse-lite/-/caniuse-lite-1.0.30001820.tgz",
      "integrity": "sha512-gfWD6MxqVCqAOwmODfZf7DchWvlrA+SRdNX7ceLfg3xRqe5ssjjpF7EgslC/0tiLiNTajdaNN/q8c/5u/7Gz8w==",
      "dev": true,
      "funding": [
        {
          "type": "opencollective",
          "url": "https://opencollective.com/browserslist"
        },
        {
          "type": "tidelift",
          "url": "https://tidelift.com/funding/github/npm/caniuse-lite"
        },
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "CC-BY-4.0"
    },
    "node_modules/chalk": {
      "version": "4.1.2",
      "resolved": "https://registry.npmjs.org/chalk/-/chalk-4.1.2.tgz",
      "integrity": "sha512-oKnbhFyRIXpUuez8iBMmyEa4nbj4IOQyuhc/wy9kY7/WVPcwIO9VA668Pu8RkO7+0G76SLROeyw9CpQ061i4mA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "ansi-styles": "^4.1.0",
        "supports-color": "^7.1.0"
      },
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/chalk/chalk?sponsor=1"
      }
    },
    "node_modules/chalk/node_modules/supports-color": {
      "version": "7.2.0",
      "resolved": "https://registry.npmjs.org/supports-color/-/supports-color-7.2.0.tgz",
      "integrity": "sha512-qpCAvRl9stuOHveKsn7HncJRvv501qIacKzQlO/+Lwxc9+0q2wLyv4Dfvt80/DPn2pqOBsJdDiogXGR9+OvwRw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "has-flag": "^4.0.0"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/cliui": {
      "version": "8.0.1",
      "resolved": "https://registry.npmjs.org/cliui/-/cliui-8.0.1.tgz",
      "integrity": "sha512-BSeNnyus75C4//NQ9gQt1/csTXyo/8Sb+afLAkzAptFuMsod9HFokGNudZpi/oQV73hnVK+sR+5PVRMd+Dr7YQ==",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "string-width": "^4.2.0",
        "strip-ansi": "^6.0.1",
        "wrap-ansi": "^7.0.0"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/color-convert": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/color-convert/-/color-convert-2.0.1.tgz",
      "integrity": "sha512-RRECPsj7iu/xb5oKYcsFHSppFNnsj/52OVTRKb4zP5onXwVF3zVmmToNcOfGC+CRDpfK/U584fMg38ZHCaElKQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "color-name": "~1.1.4"
      },
      "engines": {
        "node": ">=7.0.0"
      }
    },
    "node_modules/color-name": {
      "version": "1.1.4",
      "resolved": "https://registry.npmjs.org/color-name/-/color-name-1.1.4.tgz",
      "integrity": "sha512-dOy+3AuW3a2wNbZHIuMZpTcgjGuLU/uBL/ubcZF9OXbDo8ff4O8yVp5Bf0efS8uEoYo5q4Fx7dY9OgQGXgAsQA==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/concurrently": {
      "version": "9.2.5",
      "resolved": "https://registry.npmjs.org/concurrently/-/concurrently-9.2.5.tgz",
      "integrity": "sha512-YMZlvWrTPQEhjKp60XSmMGt60+pffbv6DyRnOMvVO98+J7aF8w8Ui9FhdcOwvSixc/kyR6SoVvmejcn/2lZBqg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "chalk": "4.1.2",
        "rxjs": "7.8.2",
        "shell-quote": "1.12.0",
        "supports-color": "8.1.1",
        "tree-kill": "1.2.2",
        "yargs": "17.7.2"
      },
      "bin": {
        "conc": "dist/bin/concurrently.js",
        "concurrently": "dist/bin/concurrently.js"
      },
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "url": "https://github.com/open-cli-tools/concurrently?sponsor=1"
      }
    },
    "node_modules/content-disposition": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/content-disposition/-/content-disposition-2.0.1.tgz",
      "integrity": "sha512-e+H0ZXHSWYrENhQzw1LPuP4oF5MzVKmDU6d3hxlvaPEYLLg62MxtQNPRx4SYSuYJSBUgnQIG4HIN2tEtNv7Dog==",
      "license": "MIT",
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/content-type": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/content-type/-/content-type-2.1.0.tgz",
      "integrity": "sha512-mj7UPXE0jaqaOsukNZRUEfEi2AcL7C/vwmwcHV0O97eO1E1pxBZuyjlZrx5seTaNBg1U6+o35wpa35Qfcc+7ag==",
      "license": "MIT",
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/convert-source-map": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/convert-source-map/-/convert-source-map-2.0.0.tgz",
      "integrity": "sha512-Kvp459HrV2FEJ1CAsi1Ku+MY3kasH19TFykTz2xWmMeq6bk2NU3XXvfJ+Q61m0xktWwt+1HSYf3JZsTms3aRJg==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/cookie": {
      "version": "0.7.2",
      "resolved": "https://registry.npmjs.org/cookie/-/cookie-0.7.2.tgz",
      "integrity": "sha512-yki5XnKuf750l50uGTllt6kKILY4nQ1eNIQatoXEByZ5dWgnKqbnqmTrBE5B4N7lrMJKQ2ytWMiTO2o0v6Ew/w==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/cookie-signature": {
      "version": "1.2.2",
      "resolved": "https://registry.npmjs.org/cookie-signature/-/cookie-signature-1.2.2.tgz",
      "integrity": "sha512-D76uU73ulSXrD1UXF4KE2TMxVVwhsnCgfAyTg9k8P6KGZjlXKrOLe4dJQKI3Bxi5wjesZoFXJWElNWBjPZMbhg==",
      "license": "MIT",
      "engines": {
        "node": ">=6.6.0"
      }
    },
    "node_modules/cpu-features": {
      "version": "0.0.10",
      "resolved": "https://registry.npmjs.org/cpu-features/-/cpu-features-0.0.10.tgz",
      "integrity": "sha512-9IkYqtX3YHPCzoVg1Py+o9057a3i0fp7S530UWokCSaFVTc7CwXPRiOjRjBQQ18ZCNafx78YfnG+HALxtVmOGA==",
      "hasInstallScript": true,
      "optional": true,
      "dependencies": {
        "buildcheck": "~0.0.6",
        "nan": "^2.19.0"
      },
      "engines": {
        "node": ">=10.0.0"
      }
    },
    "node_modules/debug": {
      "version": "4.4.3",
      "resolved": "https://registry.npmjs.org/debug/-/debug-4.4.3.tgz",
      "integrity": "sha512-RGwwWnwQvkVfavKVt22FGLw+xYSdzARwm0ru6DhTVA3umU5hZc28V3kO4stgYryrTlLpuvgI9GiijltAjNbcqA==",
      "license": "MIT",
      "dependencies": {
        "ms": "^2.1.3"
      },
      "engines": {
        "node": ">=6.0"
      },
      "peerDependenciesMeta": {
        "supports-color": {
          "optional": true
        }
      }
    },
    "node_modules/depd": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/depd/-/depd-2.0.0.tgz",
      "integrity": "sha512-g7nH6P6dyDioJogAAGprGpCtVImJhpPk/roCzdb3fIh61/s/nPsfR6onyMwkCAR/OlC3yBC0lESvUoQEAssIrw==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/dotenv": {
      "version": "17.4.2",
      "resolved": "https://registry.npmjs.org/dotenv/-/dotenv-17.4.2.tgz",
      "integrity": "sha512-nI4U3TottKAcAD9LLud4Cb7b2QztQMUEfHbvhTH09bqXTxnSie8WnjPALV/WMCrJZ6UV/qHJ6L03OqO3LcdYZw==",
      "license": "BSD-2-Clause",
      "engines": {
        "node": ">=12"
      },
      "funding": {
        "url": "https://dotenvx.com"
      }
    },
    "node_modules/dunder-proto": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/dunder-proto/-/dunder-proto-1.0.1.tgz",
      "integrity": "sha512-KIN/nDJBQRcXw0MLVhZE9iQHmG68qAVIBg9CqmUYjmQIhgij9U5MFvrqkUL5FbtyyzZuOeOt0zdeRe4UY7ct+A==",
      "license": "MIT",
      "dependencies": {
        "call-bind-apply-helpers": "^1.0.1",
        "es-errors": "^1.3.0",
        "gopd": "^1.2.0"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/ee-first": {
      "version": "1.1.1",
      "resolved": "https://registry.npmjs.org/ee-first/-/ee-first-1.1.1.tgz",
      "integrity": "sha512-WMwm9LhRUo+WUaRN+vRuETqG89IgZphVSNkdFgeb6sS/E4OrDIN7t48CAewSHXc6C8lefD8KKfr5vY61brQlow==",
      "license": "MIT"
    },
    "node_modules/electron-to-chromium": {
      "version": "1.5.467",
      "resolved": "https://registry.npmjs.org/electron-to-chromium/-/electron-to-chromium-1.5.467.tgz",
      "integrity": "sha512-Nw9X371rtZmYcBSnEijnCDONILjs93biCZO34juC7MBOmK8E+GFnyD4T/WvyrlJkppul7oxg6TwvtKst9SODTw==",
      "dev": true,
      "license": "ISC"
    },
    "node_modules/emoji-regex": {
      "version": "8.0.0",
      "resolved": "https://registry.npmjs.org/emoji-regex/-/emoji-regex-8.0.0.tgz",
      "integrity": "sha512-MSjYzcWNOA0ewAHpz0MxpYFvwg6yjy1NG3xteoqz644VCo/RPgnr1/GGt+ic3iJTzQ8Eu3TdM14SawnVUmGE6A==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/encodeurl": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/encodeurl/-/encodeurl-2.0.1.tgz",
      "integrity": "sha512-Ev/hIyePLZtpL98x562lvPtenrUfGr0lfaf44HFZ+hDEwso7ccV9QAZrEVLg0hxNAzygaAFxy2dYaAKKM0G06A==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/es-define-property": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/es-define-property/-/es-define-property-1.0.1.tgz",
      "integrity": "sha512-e3nRfgfUZ4rNGL232gUgX06QNyyez04KdjFrF+LTRoOXmrOgFKDg4BCdsjW8EnT69eqdYGmRpJwiPVYNrCaW3g==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/es-errors": {
      "version": "1.3.0",
      "resolved": "https://registry.npmjs.org/es-errors/-/es-errors-1.3.0.tgz",
      "integrity": "sha512-Zf5H2Kxt2xjTvbJvP2ZWLEICxA6j+hAmMzIlypy4xcBg1vKVnx89Wy0GbS+kf5cwCVFFzdCFh2XSCFNULS6csw==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/es-object-atoms": {
      "version": "1.1.2",
      "resolved": "https://registry.npmjs.org/es-object-atoms/-/es-object-atoms-1.1.2.tgz",
      "integrity": "sha512-HWcBoN6NileqtSydK2FqHbS/LoDd2pqrnQHLyJzBj4kOp/ky2MWMN694xOfkK8/SnUsW2DH7EfyVlydKCsm1Zw==",
      "license": "MIT",
      "dependencies": {
        "es-errors": "^1.3.0"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/esbuild": {
      "version": "0.28.2",
      "resolved": "https://registry.npmjs.org/esbuild/-/esbuild-0.28.2.tgz",
      "integrity": "sha512-HKVLS8dvII+xoKW9kmqxbRKrnWEXfJJr/FZhhJmiqIB0e053QNYFqOBouTMO/k5sID4MvCiUCvv8b9M4h32wIA==",
      "dev": true,
      "hasInstallScript": true,
      "license": "MIT",
      "bin": {
        "esbuild": "bin/esbuild"
      },
      "engines": {
        "node": ">=18"
      },
      "optionalDependencies": {
        "@esbuild/aix-ppc64": "0.28.2",
        "@esbuild/android-arm": "0.28.2",
        "@esbuild/android-arm64": "0.28.2",
        "@esbuild/android-x64": "0.28.2",
        "@esbuild/darwin-arm64": "0.28.2",
        "@esbuild/darwin-x64": "0.28.2",
        "@esbuild/freebsd-arm64": "0.28.2",
        "@esbuild/freebsd-x64": "0.28.2",
        "@esbuild/linux-arm": "0.28.2",
        "@esbuild/linux-arm64": "0.28.2",
        "@esbuild/linux-ia32": "0.28.2",
        "@esbuild/linux-loong64": "0.28.2",
        "@esbuild/linux-mips64el": "0.28.2",
        "@esbuild/linux-ppc64": "0.28.2",
        "@esbuild/linux-riscv64": "0.28.2",
        "@esbuild/linux-s390x": "0.28.2",
        "@esbuild/linux-x64": "0.28.2",
        "@esbuild/netbsd-arm64": "0.28.2",
        "@esbuild/netbsd-x64": "0.28.2",
        "@esbuild/openbsd-arm64": "0.28.2",
        "@esbuild/openbsd-x64": "0.28.2",
        "@esbuild/openharmony-arm64": "0.28.2",
        "@esbuild/sunos-x64": "0.28.2",
        "@esbuild/win32-arm64": "0.28.2",
        "@esbuild/win32-ia32": "0.28.2",
        "@esbuild/win32-x64": "0.28.2"
      }
    },
    "node_modules/escalade": {
      "version": "3.2.0",
      "resolved": "https://registry.npmjs.org/escalade/-/escalade-3.2.0.tgz",
      "integrity": "sha512-WUj2qlxaQtO4g6Pq5c29GTcWGDyd8itL8zTlipgECz3JesAiiOKotd8JU6otB3PACgG6xkJUyVhboMS+bje/jA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/escape-html": {
      "version": "1.0.3",
      "resolved": "https://registry.npmjs.org/escape-html/-/escape-html-1.0.3.tgz",
      "integrity": "sha512-NiSupZ4OeuGwr68lGIeym/ksIZMJodUGOSCZ/FSnTxcrekbvqrgdUxlJOMpijaKZVjAJrWrGs/6Jy8OMuyj9ow==",
      "license": "MIT"
    },
    "node_modules/etag": {
      "version": "1.8.1",
      "resolved": "https://registry.npmjs.org/etag/-/etag-1.8.1.tgz",
      "integrity": "sha512-aIL5Fx7mawVa300al2BnEE4iNvo1qETxLrPI/o05L7z6go7fCw1J6EQmbK4FmJ2AS7kgVF/KEZWufBfdClMcPg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/express": {
      "version": "5.3.0",
      "resolved": "https://registry.npmjs.org/express/-/express-5.3.0.tgz",
      "integrity": "sha512-qCqy1xSoaugxOD4IVHb1ZWdkvCF2W3aE2okKouWj8VwJ+ztskSiXoBnCSJqfKT+cVPJhuJqe9YLbY425+Zh00g==",
      "license": "MIT",
      "dependencies": {
        "accepts": "^2.0.0",
        "body-parser": "^2.3.0",
        "content-disposition": "^2.0.1",
        "content-type": "^2.0.0",
        "cookie": "^0.7.1",
        "cookie-signature": "^1.2.1",
        "debug": "^4.4.0",
        "depd": "^2.0.0",
        "encodeurl": "^2.0.0",
        "escape-html": "^1.0.3",
        "etag": "^1.8.1",
        "finalhandler": "^2.1.0",
        "fresh": "^2.0.0",
        "http-errors": "^2.0.0",
        "merge-descriptors": "^2.0.0",
        "mime-types": "^3.0.0",
        "on-finished": "^2.4.1",
        "once": "^1.4.0",
        "parseurl": "^1.3.3",
        "proxy-addr": "^2.0.8",
        "qs": "^6.16.0",
        "range-parser": "^1.2.1",
        "router": "^2.2.0",
        "send": "^1.1.0",
        "serve-static": "^2.2.0",
        "statuses": "^2.0.1",
        "type-is": "^2.1.0",
        "vary": "^1.1.2"
      },
      "engines": {
        "node": ">= 18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/express-rate-limit": {
      "version": "8.7.2",
      "resolved": "https://registry.npmjs.org/express-rate-limit/-/express-rate-limit-8.7.2.tgz",
      "integrity": "sha512-U1ScocxDD9WI09LaBVypvNkOtNR5yWAmZLkuKJdAzIchA4YKFYF6GT5IKER7epG58oXtjvGlV0/6ii0F83EyZg==",
      "license": "MIT",
      "dependencies": {
        "debug": "^4.4.3",
        "ip-address": "^10.2.0"
      },
      "engines": {
        "node": ">= 16"
      },
      "funding": {
        "url": "https://github.com/sponsors/express-rate-limit"
      },
      "peerDependencies": {
        "express": ">= 4.11"
      }
    },
    "node_modules/express-session": {
      "version": "1.19.0",
      "resolved": "https://registry.npmjs.org/express-session/-/express-session-1.19.0.tgz",
      "integrity": "sha512-0csaMkGq+vaiZTmSMMGkfdCOabYv192VbytFypcvI0MANrp+4i/7yEkJ0sbAEhycQjntaKGzYfjfXQyVb7BHMA==",
      "license": "MIT",
      "dependencies": {
        "cookie": "~0.7.2",
        "cookie-signature": "~1.0.7",
        "debug": "~2.6.9",
        "depd": "~2.0.0",
        "on-headers": "~1.1.0",
        "parseurl": "~1.3.3",
        "safe-buffer": "~5.2.1",
        "uid-safe": "~2.1.5"
      },
      "engines": {
        "node": ">= 0.8.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/express-session/node_modules/cookie-signature": {
      "version": "1.0.7",
      "resolved": "https://registry.npmjs.org/cookie-signature/-/cookie-signature-1.0.7.tgz",
      "integrity": "sha512-NXdYc3dLr47pBkpUCHtKSwIOQXLVn8dZEuywboCOJY/osA0wFSLlSawr3KN8qXJEyX66FcONTH8EIlVuK0yyFA==",
      "license": "MIT"
    },
    "node_modules/express-session/node_modules/debug": {
      "version": "2.6.9",
      "resolved": "https://registry.npmjs.org/debug/-/debug-2.6.9.tgz",
      "integrity": "sha512-bC7ElrdJaJnPbAP+1EotYvqZsb3ecl5wi6Bfi6BJTUcNowp6cvspg0jXznRTKDjm/E7AdgFBVeAPVMNcKGsHMA==",
      "license": "MIT",
      "dependencies": {
        "ms": "2.0.0"
      }
    },
    "node_modules/express-session/node_modules/ms": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/ms/-/ms-2.0.0.tgz",
      "integrity": "sha512-Tpp60P6IUJDTuOq/5Z8cdskzJujfwqfOTkrwIwj7IRISpnkJnT6SyJ4PCPnGMoFjC9ddhal5KVIYtAt97ix05A==",
      "license": "MIT"
    },
    "node_modules/fdir": {
      "version": "6.5.0",
      "resolved": "https://registry.npmjs.org/fdir/-/fdir-6.5.0.tgz",
      "integrity": "sha512-tIbYtZbucOs0BRGqPJkshJUYdL+SDH7dVM8gjy+ERp3WAUjLEFJE+02kanyHtwjWOnwrKYBiwAmM0p4kLJAnXg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=12.0.0"
      },
      "peerDependencies": {
        "picomatch": "^3 || ^4"
      },
      "peerDependenciesMeta": {
        "picomatch": {
          "optional": true
        }
      }
    },
    "node_modules/finalhandler": {
      "version": "2.1.1",
      "resolved": "https://registry.npmjs.org/finalhandler/-/finalhandler-2.1.1.tgz",
      "integrity": "sha512-S8KoZgRZN+a5rNwqTxlZZePjT/4cnm0ROV70LedRHZ0p8u9fRID0hJUZQpkKLzro8LfmC8sx23bY6tVNxv8pQA==",
      "license": "MIT",
      "dependencies": {
        "debug": "^4.4.0",
        "encodeurl": "^2.0.0",
        "escape-html": "^1.0.3",
        "on-finished": "^2.4.1",
        "parseurl": "^1.3.3",
        "statuses": "^2.0.1"
      },
      "engines": {
        "node": ">= 18.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/forwarded": {
      "version": "0.2.0",
      "resolved": "https://registry.npmjs.org/forwarded/-/forwarded-0.2.0.tgz",
      "integrity": "sha512-buRG0fpBtRHSTCOASe6hD258tEubFoRLb4ZNA6NxMVHNw2gOcwHo9wyablzMzOA5z9xA9L1KNjk/Nt6MT9aYow==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/fresh": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/fresh/-/fresh-2.0.0.tgz",
      "integrity": "sha512-Rx/WycZ60HOaqLKAi6cHRKKI7zxWbJ31MhntmtwMoaTeF7XFH9hhBp8vITaMidfljRQ6eYWCKkaTK+ykVJHP2A==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/fsevents": {
      "version": "2.3.3",
      "resolved": "https://registry.npmjs.org/fsevents/-/fsevents-2.3.3.tgz",
      "integrity": "sha512-5xoDfX+fL7faATnagmWPpbFtwh/R77WmMMqqHGS65C3vvB0YHrgF+B1YmZ3441tMj5n63k0212XNoJwzlhffQw==",
      "dev": true,
      "hasInstallScript": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": "^8.16.0 || ^10.6.0 || >=11.0.0"
      }
    },
    "node_modules/function-bind": {
      "version": "1.1.2",
      "resolved": "https://registry.npmjs.org/function-bind/-/function-bind-1.1.2.tgz",
      "integrity": "sha512-7XHNxH7qX9xG5mIwxkhumTox/MIRNcOgDrxWsMt2pAr23WHp6MrRlN7FBSFpCpr+oVO0F744iUgR82nJMfG2SA==",
      "license": "MIT",
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/gensync": {
      "version": "1.0.0-beta.2",
      "resolved": "https://registry.npmjs.org/gensync/-/gensync-1.0.0-beta.2.tgz",
      "integrity": "sha512-3hN7NaskYvMDLQY55gnW3NQ+mesEAepTqlg+VEbj7zzqEMBVNhzcGYYeqFo/TlYz6eQiFcp1HcsCZO+nGgS8zg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/get-caller-file": {
      "version": "2.0.5",
      "resolved": "https://registry.npmjs.org/get-caller-file/-/get-caller-file-2.0.5.tgz",
      "integrity": "sha512-DyFP3BM/3YHTQOCUL/w0OZHR0lpKeGrxotcHWcqNEdnltqFwXVfhEBQ94eIo34AfQpo0rGki4cyIiftY06h2Fg==",
      "dev": true,
      "license": "ISC",
      "engines": {
        "node": "6.* || 8.* || >= 10.*"
      }
    },
    "node_modules/get-intrinsic": {
      "version": "1.3.0",
      "resolved": "https://registry.npmjs.org/get-intrinsic/-/get-intrinsic-1.3.0.tgz",
      "integrity": "sha512-9fSjSaos/fRIVIp+xSJlE6lfwhES7LNtKaCBIamHsjr2na1BiABJPo0mOjjz8GJDURarmCPGqaiVg5mfjb98CQ==",
      "license": "MIT",
      "dependencies": {
        "call-bind-apply-helpers": "^1.0.2",
        "es-define-property": "^1.0.1",
        "es-errors": "^1.3.0",
        "es-object-atoms": "^1.1.1",
        "function-bind": "^1.1.2",
        "get-proto": "^1.0.1",
        "gopd": "^1.2.0",
        "has-symbols": "^1.1.0",
        "hasown": "^2.0.2",
        "math-intrinsics": "^1.1.0"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/get-proto": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/get-proto/-/get-proto-1.0.1.tgz",
      "integrity": "sha512-sTSfBjoXBp89JvIKIefqw7U2CCebsc74kiY6awiGogKtoSGbgjYE/G/+l9sF3MWFPNc9IcoOC4ODfKHfxFmp0g==",
      "license": "MIT",
      "dependencies": {
        "dunder-proto": "^1.0.1",
        "es-object-atoms": "^1.0.0"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/gopd": {
      "version": "1.2.0",
      "resolved": "https://registry.npmjs.org/gopd/-/gopd-1.2.0.tgz",
      "integrity": "sha512-ZUKRh6/kUFoAiTAtTYPZJ3hw9wNxx+BIBOijnlG9PnrJsCcSjs1wyyD6vJpaYtgnzDrKYRSqf3OO6Rfa93xsRg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/has-flag": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/has-flag/-/has-flag-4.0.0.tgz",
      "integrity": "sha512-EykJT/Q1KjTWctppgIAgfSO0tKVuZUjhgMr17kqTumMl6Afv3EISleU7qZUzoXDFTAHTDC4NOoG/ZxU3EvlMPQ==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/has-symbols": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/has-symbols/-/has-symbols-1.1.0.tgz",
      "integrity": "sha512-1cDNdwJ2Jaohmb3sg4OmKaMBwuC48sYni5HUw2DvsC8LjGTLK9h+eb1X6RyuOHe4hT0ULCW68iomhjUoKUqlPQ==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/hasown": {
      "version": "2.0.4",
      "resolved": "https://registry.npmjs.org/hasown/-/hasown-2.0.4.tgz",
      "integrity": "sha512-T2UbfbBEF32wiepXIsMlTW9+dDYC6wMh/t/vYA4tuOMKqWz/n3vr1NFSxQiyP+zk2mXsoMA/i/7qV6LKut1t1A==",
      "license": "MIT",
      "dependencies": {
        "function-bind": "^1.1.2"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/helmet": {
      "version": "8.3.0",
      "resolved": "https://registry.npmjs.org/helmet/-/helmet-8.3.0.tgz",
      "integrity": "sha512-Qgpiaws3Sm30Av8Eah6sjMCZZwjlBu+E68rhpCWBshY1lb09HtLwj5GviX0OyQIn+ulUS0iX0AxN5n3tLZzz1w==",
      "license": "MIT",
      "engines": {
        "node": ">=18.0.0"
      },
      "funding": {
        "url": "https://github.com/sponsors/EvanHahn"
      }
    },
    "node_modules/http-errors": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/http-errors/-/http-errors-2.0.1.tgz",
      "integrity": "sha512-4FbRdAX+bSdmo4AUFuS0WNiPz8NgFt+r8ThgNWmlrjQjt1Q7ZR9+zTlce2859x4KSXrwIsaeTqDoKQmtP8pLmQ==",
      "license": "MIT",
      "dependencies": {
        "depd": "~2.0.0",
        "inherits": "~2.0.4",
        "setprototypeof": "~1.2.0",
        "statuses": "~2.0.2",
        "toidentifier": "~1.0.1"
      },
      "engines": {
        "node": ">= 0.8"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/iconv-lite": {
      "version": "0.7.3",
      "resolved": "https://registry.npmjs.org/iconv-lite/-/iconv-lite-0.7.3.tgz",
      "integrity": "sha512-IKXpvIzjnC9XTAUbVBcMfGS0EPaIXtW6v+zr+RRp+hqULEpo0owZax6wyRwPOJbWbzjYspQwusTsfVr0ifh4uQ==",
      "license": "MIT",
      "dependencies": {
        "safer-buffer": ">= 2.1.2 < 3.0.0"
      },
      "engines": {
        "node": ">=0.10.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/inherits": {
      "version": "2.0.4",
      "resolved": "https://registry.npmjs.org/inherits/-/inherits-2.0.4.tgz",
      "integrity": "sha512-k/vGaX4/Yla3WzyMCvTQOXYeIHvqOKtnqBduzTHpzpQZzAskKMhZ2K+EnBiSM9zGSoIFeMpXKxa4dYeZIQqewQ==",
      "license": "ISC"
    },
    "node_modules/ip-address": {
      "version": "10.7.5",
      "resolved": "https://registry.npmjs.org/ip-address/-/ip-address-10.7.5.tgz",
      "integrity": "sha512-t2v0rkILYv9WXmSL7TpAaU3HXgaFYOPUcH3QHgwQ++gpJuH3bqyMy4Fvt/DJCTKwzH3Cf+bAp5W/mFL39KPLzA==",
      "license": "MIT",
      "engines": {
        "node": ">= 12"
      }
    },
    "node_modules/ipaddr.js": {
      "version": "1.9.1",
      "resolved": "https://registry.npmjs.org/ipaddr.js/-/ipaddr.js-1.9.1.tgz",
      "integrity": "sha512-0KI/607xoxSToH7GjN1FfSbLoU0+btTicjsQSWQlh/hZykN8KpmMf7uYwPW3R+akZ6R/w18ZlXSHBYXiYUPO3g==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.10"
      }
    },
    "node_modules/is-fullwidth-code-point": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/is-fullwidth-code-point/-/is-fullwidth-code-point-3.0.0.tgz",
      "integrity": "sha512-zymm5+u+sCsSWyD9qNaejV3DFvhCKclKdizYaJUuHA83RLjb7nSuGnddCHGv0hk+KY7BMAlsWeK4Ueg6EV6XQg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/is-promise": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/is-promise/-/is-promise-4.0.0.tgz",
      "integrity": "sha512-hvpoI6korhJMnej285dSg6nu1+e6uxs7zG3BYAm5byqDsgJNWwxzM6z6iZiAgQR4TJ30JmBTOwqZUw3WlyH3AQ==",
      "license": "MIT"
    },
    "node_modules/jarvis-front": {
      "resolved": "front",
      "link": true
    },
    "node_modules/js-tokens": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/js-tokens/-/js-tokens-4.0.0.tgz",
      "integrity": "sha512-RdJUflcE3cUzKiMqQgsCu06FPu9UdIJO0beYbPhHN4k6apgJtifcoCtT9bcxOpYBtpD2kCM6Sbzg4CausW/PKQ==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/jsesc": {
      "version": "3.1.0",
      "resolved": "https://registry.npmjs.org/jsesc/-/jsesc-3.1.0.tgz",
      "integrity": "sha512-/sM3dO2FOzXjKQhJuo0Q173wf2KOo8t4I8vHy6lF9poUp7bKT0/NHE8fPX23PwfhnykfqnC2xRxOnVw5XuGIaA==",
      "dev": true,
      "license": "MIT",
      "bin": {
        "jsesc": "bin/jsesc"
      },
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/json5": {
      "version": "2.2.3",
      "resolved": "https://registry.npmjs.org/json5/-/json5-2.2.3.tgz",
      "integrity": "sha512-XmOWe7eyHYH14cLdVPoyg+GOH3rYX++KpzrylJwSW98t3Nk+U8XOl8FWKOgwtzdb8lXGf6zYwDUzeHMWfxasyg==",
      "dev": true,
      "license": "MIT",
      "bin": {
        "json5": "lib/cli.js"
      },
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/lru-cache": {
      "version": "5.1.1",
      "resolved": "https://registry.npmjs.org/lru-cache/-/lru-cache-5.1.1.tgz",
      "integrity": "sha512-KpNARQA3Iwv+jTA0utUVVbrh+Jlrr1Fv0e56GGzAFOXN7dk/FviaDW8LHmK52DlcH4WP2n6gI8vN1aesBFgo9w==",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "yallist": "^3.0.2"
      }
    },
    "node_modules/math-intrinsics": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/math-intrinsics/-/math-intrinsics-1.1.0.tgz",
      "integrity": "sha512-/IXtbwEk5HTPyEwyKX6hGkYXxM9nbj64B+ilVJnC/R6B0pH5G4V3b0pVbL7DBj4tkhBAppbQUlf6F6Xl9LHu1g==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/media-typer": {
      "version": "1.1.1",
      "resolved": "https://registry.npmjs.org/media-typer/-/media-typer-1.1.1.tgz",
      "integrity": "sha512-yz3xRaG20c6/BOzvYoDaGtPmGscs7YivItZEEqe6GbwNfHuxu9YNmvnEkMzKldAGY4/80pRcQRZSEnhquk9XuQ==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/merge-descriptors": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/merge-descriptors/-/merge-descriptors-2.0.0.tgz",
      "integrity": "sha512-Snk314V5ayFLhp3fkUREub6WtjBfPdCPY1Ln8/8munuLuiYhsABgBVWsozAG+MWMbVEvcdcpbi9R7ww22l9Q3g==",
      "license": "MIT",
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/mime-db": {
      "version": "1.54.0",
      "resolved": "https://registry.npmjs.org/mime-db/-/mime-db-1.54.0.tgz",
      "integrity": "sha512-aU5EJuIN2WDemCcAp2vFBfp/m4EAhWJnUNSSw0ixs7/kXbd6Pg64EmwJkNdFhB8aWt1sH2CTXrLxo/iAGV3oPQ==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/mime-types": {
      "version": "3.0.2",
      "resolved": "https://registry.npmjs.org/mime-types/-/mime-types-3.0.2.tgz",
      "integrity": "sha512-Lbgzdk0h4juoQ9fCKXW4by0UJqj+nOOrI9MJ1sSj4nI8aI2eo1qmvQEie4VD1glsS250n15LsWsYtCugiStS5A==",
      "license": "MIT",
      "dependencies": {
        "mime-db": "^1.54.0"
      },
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/ms": {
      "version": "2.1.3",
      "resolved": "https://registry.npmjs.org/ms/-/ms-2.1.3.tgz",
      "integrity": "sha512-6FlzubTLZG3J2a/NVCAleEhjzq5oxgHyaCU9yYXvcLsvoVaHJq/s5xXI6/XXP6tz7R9xAOtHnSO/tXtF3WRTlA==",
      "license": "MIT"
    },
    "node_modules/nan": {
      "version": "2.30.0",
      "resolved": "https://registry.npmjs.org/nan/-/nan-2.30.0.tgz",
      "integrity": "sha512-P5mokDkSvCGBz6mZDD/2l+w9QoICRXdCyZ9ONGmTePr40oihJg3Kpn0YU3twKd6PJnwSlLBWNQeOT6yWEV2c4A==",
      "license": "MIT",
      "optional": true
    },
    "node_modules/nanoid": {
      "version": "3.3.20",
      "resolved": "https://registry.npmjs.org/nanoid/-/nanoid-3.3.20.tgz",
      "integrity": "sha512-uKdg2G3GNCKQn9byYOpxbGqrT2fGO5KRt5J/8b3pok8rT6qxGWF6hxMyJiEYtAf+FVyYuD9hRaDqX5uPFYJ4ZQ==",
      "dev": true,
      "funding": [
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "MIT",
      "bin": {
        "nanoid": "bin/nanoid.cjs"
      },
      "engines": {
        "node": "^10 || ^12 || ^13.7 || ^14 || >=15.0.1"
      }
    },
    "node_modules/negotiator": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/negotiator/-/negotiator-1.1.0.tgz",
      "integrity": "sha512-NMPBRMJgiQHjbd8phG3Vebdx4kZ1H121rbl5IkMqeOsahptB9BKo/d7oJ3zTXqTgagn2bWlNSXkh0QUGM31RYg==",
      "license": "MIT",
      "dependencies": {
        "content-type": "^2.1.0"
      },
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/node-releases": {
      "version": "2.0.61",
      "resolved": "https://registry.npmjs.org/node-releases/-/node-releases-2.0.61.tgz",
      "integrity": "sha512-5NUN6QCxNFrS9oEA9RPS+d0AP+ooGBzzovY2JhIpDRHacPvOhHjXjUsUMX9qp4nLHZ+5jVgXB2jj/P4arGOE/g==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/object-inspect": {
      "version": "1.13.4",
      "resolved": "https://registry.npmjs.org/object-inspect/-/object-inspect-1.13.4.tgz",
      "integrity": "sha512-W67iLl4J2EXEGTbfeHCffrjDfitvLANg0UlX3wFUUSTx92KXRFegMHUVgSqE+wvhAbi4WqjGg9czysTV2Epbew==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/on-finished": {
      "version": "2.4.2",
      "resolved": "https://registry.npmjs.org/on-finished/-/on-finished-2.4.2.tgz",
      "integrity": "sha512-ATWUv387i+nLD49EiDoOft5scf32Vsdz3ktrQJG9bi7jRFmaXTssvyvj1EmeKVVgvesbqUtvQQvaS2TpTukAZQ==",
      "license": "MIT",
      "dependencies": {
        "ee-first": "1.1.1"
      },
      "engines": {
        "node": ">= 0.8"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/on-headers": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/on-headers/-/on-headers-1.1.0.tgz",
      "integrity": "sha512-737ZY3yNnXy37FHkQxPzt4UZ2UWPWiCZWLvFZ4fu5cueciegX0zGPnrlY6bwRg4FdQOe9YU8MkmJwGhoMybl8A==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/once": {
      "version": "1.4.0",
      "resolved": "https://registry.npmjs.org/once/-/once-1.4.0.tgz",
      "integrity": "sha512-lNaJgI+2Q5URQBkccEKHTQOPaXdUxnZZElQTZY0MFUAuaEqe1E+Nyvgdz/aIyNi6Z9MzO5dv1H8n58/GELp3+w==",
      "license": "ISC",
      "dependencies": {
        "wrappy": "1"
      }
    },
    "node_modules/parseurl": {
      "version": "1.3.3",
      "resolved": "https://registry.npmjs.org/parseurl/-/parseurl-1.3.3.tgz",
      "integrity": "sha512-CiyeOxFT/JZyN5m0z9PfXw4SCBJ6Sygz1Dpl0wqjlhDEGGBP1GnsUVEL0p63hoG1fcj3fHynXi9NYO4nWOL+qQ==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/path-to-regexp": {
      "version": "8.4.2",
      "resolved": "https://registry.npmjs.org/path-to-regexp/-/path-to-regexp-8.4.2.tgz",
      "integrity": "sha512-qRcuIdP69NPm4qbACK+aDogI5CBDMi1jKe0ry5rSQJz8JVLsC7jV8XpiJjGRLLol3N+R5ihGYcrPLTno6pAdBA==",
      "license": "MIT",
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/picocolors": {
      "version": "1.1.1",
      "resolved": "https://registry.npmjs.org/picocolors/-/picocolors-1.1.1.tgz",
      "integrity": "sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA==",
      "dev": true,
      "license": "ISC"
    },
    "node_modules/picomatch": {
      "version": "4.0.7",
      "resolved": "https://registry.npmjs.org/picomatch/-/picomatch-4.0.7.tgz",
      "integrity": "sha512-qcJu88Q2IWqJsDD529JKMdwGm/dvInW4HvQnRwiH9JtihJvzGOscDtHE3x1pBKeUOTysQ8kVmLnJ2kJu7yhcGA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=12"
      },
      "funding": {
        "url": "https://github.com/sponsors/jonschlinkert"
      }
    },
    "node_modules/postcss": {
      "version": "8.5.32",
      "resolved": "https://registry.npmjs.org/postcss/-/postcss-8.5.32.tgz",
      "integrity": "sha512-LJlKCCAUFKOuZxipUdYw1NzIITEsPcgyOG9LkvRJvuKj/bRzbuRY0ARXvL0pWGpsZvn8jku+LMep2eU0seHp8g==",
      "dev": true,
      "funding": [
        {
          "type": "opencollective",
          "url": "https://opencollective.com/postcss/"
        },
        {
          "type": "tidelift",
          "url": "https://tidelift.com/funding/github/npm/postcss"
        },
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "nanoid": "^3.3.20",
        "picocolors": "^1.1.1",
        "source-map-js": "^1.2.2"
      },
      "engines": {
        "node": "^10 || ^12 || >=14"
      }
    },
    "node_modules/proxy-addr": {
      "version": "2.0.8",
      "resolved": "https://registry.npmjs.org/proxy-addr/-/proxy-addr-2.0.8.tgz",
      "integrity": "sha512-5nnx0yGyVUcY6t9RnWcARWtwT9F1D8O9rt08htPvnd49W1IgZtmLkhu9WfMzQj1cFxjHIO6connUNVW5k7AVyQ==",
      "license": "MIT",
      "dependencies": {
        "forwarded": "0.2.0",
        "ipaddr.js": "1.9.1"
      },
      "engines": {
        "node": ">= 0.10"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/qs": {
      "version": "6.17.1",
      "resolved": "https://registry.npmjs.org/qs/-/qs-6.17.1.tgz",
      "integrity": "sha512-jd3COkaKVgGUW+ZHyEHCG9bH7RoaaiWuMgzsIBjUMVjLAaWGWpoUAVwljVvBHxRu/2qEHnadLGZrkutYUBPQJA==",
      "license": "BSD-3-Clause",
      "dependencies": {
        "es-define-property": "^1.0.1",
        "side-channel": "^1.1.1"
      },
      "engines": {
        "node": ">=0.6"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/random-bytes": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/random-bytes/-/random-bytes-1.0.0.tgz",
      "integrity": "sha512-iv7LhNVO047HzYR3InF6pUcUsPQiHTM1Qal51DcGSuZFBil1aBBWG5eHPNek7bvILMaYJ/8RU1e8w1AMdHmLQQ==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/range-parser": {
      "version": "1.3.0",
      "resolved": "https://registry.npmjs.org/range-parser/-/range-parser-1.3.0.tgz",
      "integrity": "sha512-hek2mFQpPuI4E1BBKrSto+BU3e3x4xuarsbiwr3+lf7p44juvFMV0XFWQAP3xUyqXA4RrXLIoaSUGbSt056ZMw==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/raw-body": {
      "version": "3.0.2",
      "resolved": "https://registry.npmjs.org/raw-body/-/raw-body-3.0.2.tgz",
      "integrity": "sha512-K5zQjDllxWkf7Z5xJdV0/B0WTNqx6vxG70zJE4N0kBs4LovmEYWJzQGxC9bS9RAKu3bgM40lrd5zoLJ12MQ5BA==",
      "license": "MIT",
      "dependencies": {
        "bytes": "~3.1.2",
        "http-errors": "~2.0.1",
        "iconv-lite": "~0.7.0",
        "unpipe": "~1.0.0"
      },
      "engines": {
        "node": ">= 0.10"
      }
    },
    "node_modules/react": {
      "version": "19.3.1",
      "resolved": "https://registry.npmjs.org/react/-/react-19.3.1.tgz",
      "integrity": "sha512-QNhWdt7nrgVWWQG58QuGsAR3jv3Hbe4mb4vz7w2csnHavciZJgda1CPNaldF6eVxv90ud3jUXpKlHL69gO38yw==",
      "license": "MIT",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/react-dom": {
      "version": "19.3.1",
      "resolved": "https://registry.npmjs.org/react-dom/-/react-dom-19.3.1.tgz",
      "integrity": "sha512-Y0bARz53lhEC1NMCASs0/j+faB/zqt3R8hpvg1e8+61ZVJ4UL0UdC4cBbXfZMcIuhrfgeILTLe+ZeBCavQPtKQ==",
      "license": "MIT",
      "dependencies": {
        "scheduler": "^0.28.0"
      },
      "peerDependencies": {
        "react": "^19.3.1"
      }
    },
    "node_modules/react-refresh": {
      "version": "0.18.0",
      "resolved": "https://registry.npmjs.org/react-refresh/-/react-refresh-0.18.0.tgz",
      "integrity": "sha512-QgT5//D3jfjJb6Gsjxv0Slpj23ip+HtOpnNgnb2S5zU3CB26G/IDPGoy4RJB42wzFE46DRsstbW6tKHoKbhAxw==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/require-directory": {
      "version": "2.1.1",
      "resolved": "https://registry.npmjs.org/require-directory/-/require-directory-2.1.1.tgz",
      "integrity": "sha512-fGxEI7+wsG9xrvdjsrlmL22OMTTiHRwAMroiEeMgq8gzoLC/PQr7RsRDSTLUg/bZAZtF+TVIkHc6/4RIKrui+Q==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/rollup": {
      "version": "4.66.0",
      "resolved": "https://registry.npmjs.org/rollup/-/rollup-4.66.0.tgz",
      "integrity": "sha512-Onq6/qO4ARhxIs+jYiHE0pYehadLyMECAiGEqQ+0/aWND3+2PmifJIIqBLYtuBODqHTlOUEQFtIVPyCy0Lck7A==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@types/estree": "1.0.9"
      },
      "bin": {
        "rollup": "dist/bin/rollup"
      },
      "engines": {
        "node": ">=18.0.0",
        "npm": ">=8.0.0"
      },
      "optionalDependencies": {
        "@napi-rs/lzma-linux-x64-gnu": "1.5.1",
        "@rollup/rollup-android-arm-eabi": "4.66.0",
        "@rollup/rollup-android-arm64": "4.66.0",
        "@rollup/rollup-darwin-arm64": "4.66.0",
        "@rollup/rollup-darwin-x64": "4.66.0",
        "@rollup/rollup-freebsd-arm64": "4.66.0",
        "@rollup/rollup-freebsd-x64": "4.66.0",
        "@rollup/rollup-linux-arm-gnueabihf": "4.66.0",
        "@rollup/rollup-linux-arm-musleabihf": "4.66.0",
        "@rollup/rollup-linux-arm64-gnu": "4.66.0",
        "@rollup/rollup-linux-arm64-musl": "4.66.0",
        "@rollup/rollup-linux-loong64-gnu": "4.66.0",
        "@rollup/rollup-linux-loong64-musl": "4.66.0",
        "@rollup/rollup-linux-ppc64-gnu": "4.66.0",
        "@rollup/rollup-linux-ppc64-musl": "4.66.0",
        "@rollup/rollup-linux-riscv64-gnu": "4.66.0",
        "@rollup/rollup-linux-riscv64-musl": "4.66.0",
        "@rollup/rollup-linux-s390x-gnu": "4.66.0",
        "@rollup/rollup-linux-x64-gnu": "4.66.0",
        "@rollup/rollup-linux-x64-musl": "4.66.0",
        "@rollup/rollup-openbsd-x64": "4.66.0",
        "@rollup/rollup-openharmony-arm64": "4.66.0",
        "@rollup/rollup-win32-arm64-msvc": "4.66.0",
        "@rollup/rollup-win32-ia32-msvc": "4.66.0",
        "@rollup/rollup-win32-x64-gnu": "4.66.0",
        "@rollup/rollup-win32-x64-msvc": "4.66.0",
        "fsevents": "~2.3.2"
      }
    },
    "node_modules/router": {
      "version": "2.2.0",
      "resolved": "https://registry.npmjs.org/router/-/router-2.2.0.tgz",
      "integrity": "sha512-nLTrUKm2UyiL7rlhapu/Zl45FwNgkZGaCpZbIHajDYgwlJCOzLSk+cIPAnsEqV955GjILJnKbdQC1nVPz+gAYQ==",
      "license": "MIT",
      "dependencies": {
        "debug": "^4.4.0",
        "depd": "^2.0.0",
        "is-promise": "^4.0.0",
        "parseurl": "^1.3.3",
        "path-to-regexp": "^8.0.0"
      },
      "engines": {
        "node": ">= 18"
      }
    },
    "node_modules/rxjs": {
      "version": "7.8.2",
      "resolved": "https://registry.npmjs.org/rxjs/-/rxjs-7.8.2.tgz",
      "integrity": "sha512-dhKf903U/PQZY6boNNtAGdWbG85WAbjT/1xYoZIC7FAY0yWapOBQVsVrDl58W86//e1VpMNBtRV4MaXfdMySFA==",
      "dev": true,
      "license": "Apache-2.0",
      "dependencies": {
        "tslib": "^2.1.0"
      }
    },
    "node_modules/safe-buffer": {
      "version": "5.2.1",
      "resolved": "https://registry.npmjs.org/safe-buffer/-/safe-buffer-5.2.1.tgz",
      "integrity": "sha512-rp3So07KcdmmKbGvgaNxQSJr7bGVSVk5S9Eq1F+ppbRo70+YeaDxkw5Dd8NPN+GD6bjnYm2VuPuCXmpuYvmCXQ==",
      "funding": [
        {
          "type": "github",
          "url": "https://github.com/sponsors/feross"
        },
        {
          "type": "patreon",
          "url": "https://www.patreon.com/feross"
        },
        {
          "type": "consulting",
          "url": "https://feross.org/support"
        }
      ],
      "license": "MIT"
    },
    "node_modules/safer-buffer": {
      "version": "2.1.2",
      "resolved": "https://registry.npmjs.org/safer-buffer/-/safer-buffer-2.1.2.tgz",
      "integrity": "sha512-YZo3K82SD7Riyi0E1EQPojLz7kpepnSQI9IyPbHHg1XXXevb5dJI7tpyN2ADxGcQbHG7vcyRHk0cbwqcQriUtg==",
      "license": "MIT"
    },
    "node_modules/scheduler": {
      "version": "0.28.0",
      "resolved": "https://registry.npmjs.org/scheduler/-/scheduler-0.28.0.tgz",
      "integrity": "sha512-juorfCmIkIw8tT+p5BXSm6PJjQF/ycEYmKyzURCIt/RaZIhL+PulbQ9Yu2z1HdOJDdqDTlxA1+xKBmHXJsczAw==",
      "license": "MIT"
    },
    "node_modules/semver": {
      "version": "6.3.1",
      "resolved": "https://registry.npmjs.org/semver/-/semver-6.3.1.tgz",
      "integrity": "sha512-BR7VvDCVHO+q2xBEWskxS6DJE1qRnb7DxzUrogb71CWoSficBxYsiAGd+Kl0mmq/MprG9yArRkyrQxTO6XjMzA==",
      "dev": true,
      "license": "ISC",
      "bin": {
        "semver": "bin/semver.js"
      }
    },
    "node_modules/send": {
      "version": "1.2.1",
      "resolved": "https://registry.npmjs.org/send/-/send-1.2.1.tgz",
      "integrity": "sha512-1gnZf7DFcoIcajTjTwjwuDjzuz4PPcY2StKPlsGAQ1+YH20IRVrBaXSWmdjowTJ6u8Rc01PoYOGHXfP1mYcZNQ==",
      "license": "MIT",
      "dependencies": {
        "debug": "^4.4.3",
        "encodeurl": "^2.0.0",
        "escape-html": "^1.0.3",
        "etag": "^1.8.1",
        "fresh": "^2.0.0",
        "http-errors": "^2.0.1",
        "mime-types": "^3.0.2",
        "ms": "^2.1.3",
        "on-finished": "^2.4.1",
        "range-parser": "^1.2.1",
        "statuses": "^2.0.2"
      },
      "engines": {
        "node": ">= 18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/serve-static": {
      "version": "2.2.1",
      "resolved": "https://registry.npmjs.org/serve-static/-/serve-static-2.2.1.tgz",
      "integrity": "sha512-xRXBn0pPqQTVQiC8wyQrKs2MOlX24zQ0POGaj0kultvoOCstBQM5yvOhAVSUwOMjQtTvsPWoNCHfPGwaaQJhTw==",
      "license": "MIT",
      "dependencies": {
        "encodeurl": "^2.0.0",
        "escape-html": "^1.0.3",
        "parseurl": "^1.3.3",
        "send": "^1.2.0"
      },
      "engines": {
        "node": ">= 18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/setprototypeof": {
      "version": "1.2.0",
      "resolved": "https://registry.npmjs.org/setprototypeof/-/setprototypeof-1.2.0.tgz",
      "integrity": "sha512-E5LDX7Wrp85Kil5bhZv46j8jOeboKq5JMmYM3gVGdGH8xFpPWXUMsNrlODCrkoxMEeNi/XZIwuRvY4XNwYMJpw==",
      "license": "ISC"
    },
    "node_modules/shell-quote": {
      "version": "1.12.0",
      "resolved": "https://registry.npmjs.org/shell-quote/-/shell-quote-1.12.0.tgz",
      "integrity": "sha512-PcByqNyT/38F2kDNi006HAMRJaULuBzq/FOsw3qdZvX/GA9W/jamDaRskgHjubHiftXK5sIFxLNkvrXUwcof6Q==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/side-channel": {
      "version": "1.1.1",
      "resolved": "https://registry.npmjs.org/side-channel/-/side-channel-1.1.1.tgz",
      "integrity": "sha512-6x6dK6zJdpTzF4sQeNYxwtvBzf6Eg4GtlesS94HOvTudUeyK2WXAaIfmDgsyslYrRBeFIlsi54AYsFGUuhmvrQ==",
      "license": "MIT",
      "dependencies": {
        "es-errors": "^1.3.0",
        "object-inspect": "^1.13.4",
        "side-channel-list": "^1.0.1",
        "side-channel-map": "^1.0.1",
        "side-channel-weakmap": "^1.0.2"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/side-channel-list": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/side-channel-list/-/side-channel-list-1.0.1.tgz",
      "integrity": "sha512-mjn/0bi/oUURjc5Xl7IaWi/OJJJumuoJFQJfDDyO46+hBWsfaVM65TBHq2eoZBhzl9EchxOijpkbRC8SVBQU0w==",
      "license": "MIT",
      "dependencies": {
        "es-errors": "^1.3.0",
        "object-inspect": "^1.13.4"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/side-channel-map": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/side-channel-map/-/side-channel-map-1.0.1.tgz",
      "integrity": "sha512-VCjCNfgMsby3tTdo02nbjtM/ewra6jPHmpThenkTYh8pG9ucZ/1P8So4u4FGBek/BjpOVsDCMoLA/iuBKIFXRA==",
      "license": "MIT",
      "dependencies": {
        "call-bound": "^1.0.2",
        "es-errors": "^1.3.0",
        "get-intrinsic": "^1.2.5",
        "object-inspect": "^1.13.3"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/side-channel-weakmap": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/side-channel-weakmap/-/side-channel-weakmap-1.0.2.tgz",
      "integrity": "sha512-WPS/HvHQTYnHisLo9McqBHOJk2FkHO/tlpvldyrnem4aeQp4hai3gythswg6p01oSoTl58rcpiFAjF2br2Ak2A==",
      "license": "MIT",
      "dependencies": {
        "call-bound": "^1.0.2",
        "es-errors": "^1.3.0",
        "get-intrinsic": "^1.2.5",
        "object-inspect": "^1.13.3",
        "side-channel-map": "^1.0.1"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/source-map-js": {
      "version": "1.2.2",
      "resolved": "https://registry.npmjs.org/source-map-js/-/source-map-js-1.2.2.tgz",
      "integrity": "sha512-KGj/8Y43x35aZVDtt+J4mK1hoLGHULMYfSkODJNQjNDC3oW1PqPoxMwo0pLUsWM/UEGzON/NxeHywEfNXNP3Vw==",
      "dev": true,
      "license": "BSD-3-Clause",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/ssh2": {
      "version": "1.17.0",
      "resolved": "https://registry.npmjs.org/ssh2/-/ssh2-1.17.0.tgz",
      "integrity": "sha512-wPldCk3asibAjQ/kziWQQt1Wh3PgDFpC0XpwclzKcdT1vql6KeYxf5LIt4nlFkUeR8WuphYMKqUA56X4rjbfgQ==",
      "hasInstallScript": true,
      "dependencies": {
        "asn1": "^0.2.6",
        "bcrypt-pbkdf": "^1.0.2"
      },
      "engines": {
        "node": ">=10.16.0"
      },
      "optionalDependencies": {
        "cpu-features": "~0.0.10",
        "nan": "^2.23.0"
      }
    },
    "node_modules/statuses": {
      "version": "2.0.2",
      "resolved": "https://registry.npmjs.org/statuses/-/statuses-2.0.2.tgz",
      "integrity": "sha512-DvEy55V3DB7uknRo+4iOGT5fP1slR8wQohVdknigZPMpMstaKJQWhwiYBACJE3Ul2pTnATihhBYnRhZQHGBiRw==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/string-width": {
      "version": "4.2.3",
      "resolved": "https://registry.npmjs.org/string-width/-/string-width-4.2.3.tgz",
      "integrity": "sha512-wKyQRQpjJ0sIp62ErSZdGsjMJWsap5oRNihHhu6G7JVO/9jIB6UyevL+tXuOqrng8j/cxKTWyWUwvSTriiZz/g==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "emoji-regex": "^8.0.0",
        "is-fullwidth-code-point": "^3.0.0",
        "strip-ansi": "^6.0.1"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/strip-ansi": {
      "version": "6.0.1",
      "resolved": "https://registry.npmjs.org/strip-ansi/-/strip-ansi-6.0.1.tgz",
      "integrity": "sha512-Y38VPSHcqkFrCpFnQ9vuSXmquuv5oXOKpGeT6aGrr3o3Gc9AlVa6JBfUSOCnbxGGZF+/0ooI7KrPuUSztUdU5A==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "ansi-regex": "^5.0.1"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/supports-color": {
      "version": "8.1.1",
      "resolved": "https://registry.npmjs.org/supports-color/-/supports-color-8.1.1.tgz",
      "integrity": "sha512-MpUEN2OodtUzxvKQl72cUF7RQ5EiHsGvSsVG0ia9c5RbWGL2CI4C7EpPS8UTBIplnlzZiNuV56w+FuNxy3ty2Q==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "has-flag": "^4.0.0"
      },
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/chalk/supports-color?sponsor=1"
      }
    },
    "node_modules/tinyglobby": {
      "version": "0.2.17",
      "resolved": "https://registry.npmjs.org/tinyglobby/-/tinyglobby-0.2.17.tgz",
      "integrity": "sha512-wXR/dYpcqKmfWpEdZjiKJOwCNFndD0DMnrW/cYjVGttEkBfVgcLFHoNrlj47mjOVic9yyNu65alsgF4NQyTa2g==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "fdir": "^6.5.0",
        "picomatch": "^4.0.4"
      },
      "engines": {
        "node": ">=12.0.0"
      },
      "funding": {
        "url": "https://github.com/sponsors/SuperchupuDev"
      }
    },
    "node_modules/toidentifier": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/toidentifier/-/toidentifier-1.0.1.tgz",
      "integrity": "sha512-o5sSPKEkg/DIQNmH43V0/uerLrpzVedkUh8tGNvaeXpfpuwjKenlSox/2O/BTlZUtEe+JG7s5YhEz608PlAHRA==",
      "license": "MIT",
      "engines": {
        "node": ">=0.6"
      }
    },
    "node_modules/tree-kill": {
      "version": "1.2.2",
      "resolved": "https://registry.npmjs.org/tree-kill/-/tree-kill-1.2.2.tgz",
      "integrity": "sha512-L0Orpi8qGpRG//Nd+H90vFB+3iHnue1zSSGmNOOCh1GLJ7rUKVwV2HvijphGQS2UmhUZewS9VgvxYIdgr+fG1A==",
      "dev": true,
      "license": "MIT",
      "bin": {
        "tree-kill": "cli.js"
      }
    },
    "node_modules/tslib": {
      "version": "2.8.1",
      "resolved": "https://registry.npmjs.org/tslib/-/tslib-2.8.1.tgz",
      "integrity": "sha512-oJFu94HQb+KVduSUQL7wnpmqnfmLsOA/nAh6b6EH0wCEoK0/mPeXU6c3wKDV83MkOuHPRHtSXKKU99IBazS/2w==",
      "dev": true,
      "license": "0BSD"
    },
    "node_modules/tweetnacl": {
      "version": "0.14.5",
      "resolved": "https://registry.npmjs.org/tweetnacl/-/tweetnacl-0.14.5.tgz",
      "integrity": "sha512-KXXFFdAbFXY4geFIwoyNK+f5Z1b7swfXABfL7HXCmoIWMKU3dmS26672A4EeQtDzLKy7SXmfBu51JolvEKwtGA==",
      "license": "Unlicense"
    },
    "node_modules/type-is": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/type-is/-/type-is-2.1.0.tgz",
      "integrity": "sha512-faYHw0anBbc/kWF3zFTEnxSFOAGUX9GFbOBthvDdLsIlEoWOFOtS0zgCiQYwIskL9iGXZL3kAXD8OoZ4GmMATA==",
      "license": "MIT",
      "dependencies": {
        "content-type": "^2.0.0",
        "media-typer": "^1.1.0",
        "mime-types": "^3.0.0"
      },
      "engines": {
        "node": ">= 18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/uid-safe": {
      "version": "2.1.5",
      "resolved": "https://registry.npmjs.org/uid-safe/-/uid-safe-2.1.5.tgz",
      "integrity": "sha512-KPHm4VL5dDXKz01UuEd88Df+KzynaohSL9fBh096KWAxSKZQDI2uBrVqtvRM4rwrIrRRKsdLNML/lnaaVSRioA==",
      "license": "MIT",
      "dependencies": {
        "random-bytes": "~1.0.0"
      },
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/unpipe": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/unpipe/-/unpipe-1.0.0.tgz",
      "integrity": "sha512-pjy2bYhSsufwWlKwPc+l3cN7+wuJlK6uz0YdJEOlQDbl6jo/YlPi4mb8agUkVC8BF7V8NuzeyPNqRksA3hztKQ==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/update-browserslist-db": {
      "version": "1.3.4",
      "resolved": "https://registry.npmjs.org/update-browserslist-db/-/update-browserslist-db-1.3.4.tgz",
      "integrity": "sha512-t8wonIOdQyOjtPd2VktlBu6QjTVTks6v8bSi7kd0r2Vll8TK1JYDZtRRdbmCHOAMphkZgrzK+L+vXK4pyZ8t4A==",
      "dev": true,
      "funding": [
        {
          "type": "opencollective",
          "url": "https://opencollective.com/browserslist"
        },
        {
          "type": "tidelift",
          "url": "https://tidelift.com/funding/github/npm/browserslist"
        },
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "escalade": "^3.2.0",
        "picocolors": "^1.1.1"
      },
      "bin": {
        "update-browserslist-db": "cli.js"
      },
      "peerDependencies": {
        "browserslist": ">= 4.21.0"
      }
    },
    "node_modules/vary": {
      "version": "1.1.2",
      "resolved": "https://registry.npmjs.org/vary/-/vary-1.1.2.tgz",
      "integrity": "sha512-BNGbWLfd0eUPabhkXUVm0j8uuvREyTh5ovRa/dyow/BqAbZJyC+5fU+IzQOzmAKzYqYRAISoRhdQr3eIZ/PXqg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/vite": {
      "version": "7.3.7",
      "resolved": "https://registry.npmjs.org/vite/-/vite-7.3.7.tgz",
      "integrity": "sha512-AHEzTORMbi7/7aXp7w7KZ5+DCUdSeLsJz0grY8xHpc9DHdYb0vQu6DqJfm2tOw3gDExNgPgnJTXxM6syYFHaCA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "esbuild": "^0.27.0 || ^0.28.0",
        "fdir": "^6.5.0",
        "picomatch": "^4.0.3",
        "postcss": "^8.5.6",
        "rollup": "^4.43.0",
        "tinyglobby": "^0.2.15"
      },
      "bin": {
        "vite": "bin/vite.js"
      },
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      },
      "funding": {
        "url": "https://github.com/vitejs/vite?sponsor=1"
      },
      "optionalDependencies": {
        "fsevents": "~2.3.3"
      },
      "peerDependencies": {
        "@types/node": "^20.19.0 || >=22.12.0",
        "jiti": ">=1.21.0",
        "less": "^4.0.0",
        "lightningcss": "^1.21.0",
        "sass": "^1.70.0",
        "sass-embedded": "^1.70.0",
        "stylus": ">=0.54.8",
        "sugarss": "^5.0.0",
        "terser": "^5.16.0",
        "tsx": "^4.8.1",
        "yaml": "^2.4.2"
      },
      "peerDependenciesMeta": {
        "@types/node": {
          "optional": true
        },
        "jiti": {
          "optional": true
        },
        "less": {
          "optional": true
        },
        "lightningcss": {
          "optional": true
        },
        "sass": {
          "optional": true
        },
        "sass-embedded": {
          "optional": true
        },
        "stylus": {
          "optional": true
        },
        "sugarss": {
          "optional": true
        },
        "terser": {
          "optional": true
        },
        "tsx": {
          "optional": true
        },
        "yaml": {
          "optional": true
        }
      }
    },
    "node_modules/wrap-ansi": {
      "version": "7.0.0",
      "resolved": "https://registry.npmjs.org/wrap-ansi/-/wrap-ansi-7.0.0.tgz",
      "integrity": "sha512-YVGIj2kamLSTxw6NsZjoBxfSwsn0ycdesmc4p+Q21c5zPuZ1pl+NfxVdxPtdHvmNVOQ6XSYG4AUtyt/Fi7D16Q==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "ansi-styles": "^4.0.0",
        "string-width": "^4.1.0",
        "strip-ansi": "^6.0.0"
      },
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/chalk/wrap-ansi?sponsor=1"
      }
    },
    "node_modules/wrappy": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/wrappy/-/wrappy-1.0.2.tgz",
      "integrity": "sha512-l4Sp/DRseor9wL6EvV2+TuQn63dMkPjZ/sp9XkghTEbV9KlPS1xUsZ3u7/IQO4wxtcFB4bgpQPRcR3QCvezPcQ==",
      "license": "ISC"
    },
    "node_modules/y18n": {
      "version": "5.0.8",
      "resolved": "https://registry.npmjs.org/y18n/-/y18n-5.0.8.tgz",
      "integrity": "sha512-0pfFzegeDWJHJIAmTLRP2DwHjdF5s7jo9tuztdQxAhINCdvS+3nGINqPd00AphqJR/0LhANUS6/+7SCb98YOfA==",
      "dev": true,
      "license": "ISC",
      "engines": {
        "node": ">=10"
      }
    },
    "node_modules/yallist": {
      "version": "3.1.1",
      "resolved": "https://registry.npmjs.org/yallist/-/yallist-3.1.1.tgz",
      "integrity": "sha512-a4UGQaWPH59mOXUYnAG2ewncQS4i4F43Tv3JoAM+s2VDAmS9NsK8GpDMLrCHPksFT7h3K6TOoUNn2pb7RoXx4g==",
      "dev": true,
      "license": "ISC"
    },
    "node_modules/yargs": {
      "version": "17.7.2",
      "resolved": "https://registry.npmjs.org/yargs/-/yargs-17.7.2.tgz",
      "integrity": "sha512-7dSzzRQ++CKnNI/krKnYRV7JKKPUXMEh61soaHKg9mrWEhzFWhFnxPxGl+69cD1Ou63C13NUPCnmIcrvqCuM6w==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "cliui": "^8.0.1",
        "escalade": "^3.1.1",
        "get-caller-file": "^2.0.5",
        "require-directory": "^2.1.1",
        "string-width": "^4.2.3",
        "y18n": "^5.0.5",
        "yargs-parser": "^21.1.1"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/yargs-parser": {
      "version": "21.1.1",
      "resolved": "https://registry.npmjs.org/yargs-parser/-/yargs-parser-21.1.1.tgz",
      "integrity": "sha512-tVpsJW7DdjecAiFpbIB1e3qxIQsE6NoPc5/eTdrbbIC4h0LVsWhnoa3g+m2HclBIujHzsxZ4VJVA+GUuc2/LBw==",
      "dev": true,
      "license": "ISC",
      "engines": {
        "node": ">=12"
      }
    }
  }
}
JARVIS_FILE_053150B640A7CE75
if [[ -f package.json ]]; then
  mkdir -p -- "$jarvis_backup/."
  cp -- package.json "$jarvis_backup/package.json"
fi
cat > package.json <<'JARVIS_FILE_7AE45AD102EAB3B6'
{
  "name": "jarvis-web",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "api",
    "front"
  ],
  "engines": {
    "node": ">=22.12.0"
  },
  "scripts": {
    "setup": "node scripts/setup.mjs",
    "dev": "concurrently -k -n API,FRONT -c cyan,green \"npm run dev --workspace api\" \"npm run dev --workspace front\"",
    "build": "npm run build --workspace front",
    "start": "npm start --workspace api",
    "test": "npm test --workspace api"
  },
  "devDependencies": {
    "concurrently": "^9.2.1"
  }
}
JARVIS_FILE_7AE45AD102EAB3B6
if [[ -f scripts/setup.mjs ]]; then
  mkdir -p -- "$jarvis_backup/scripts"
  cp -- scripts/setup.mjs "$jarvis_backup/scripts/setup.mjs"
fi
cat > scripts/setup.mjs <<'JARVIS_FILE_38BFF5CBFA45108E'
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
JARVIS_FILE_38BFF5CBFA45108E
node <<'JARVIS_UPDATE_ENV'
const fs = require('node:fs');
const envPath = 'api/.env';
if (fs.existsSync(envPath)) {
  let content=fs.readFileSync(envPath,'utf8');
  const re=/^CODEX_MODE=.*$/m;
  content=re.test(content)?content.replace(re,'CODEX_MODE=ssh'):content+'\nCODEX_MODE=ssh\n';
  fs.writeFileSync(envPath,content,{mode:0o600});
  if(process.platform!=='win32')fs.chmodSync(envPath,0o600);
}
JARVIS_UPDATE_ENV
trap - ERR
printf '\nAtualizacao concluida. Seu historico e suas credenciais foram preservados.\n'
printf 'Execute npm install e npm run dev. Se ainda nao criou o login, rode npm run setup.\n'
printf 'No painel, conecte sua VPS por SSH. O Codex remoto continua sujeito as cotas da conta dele.\n'
