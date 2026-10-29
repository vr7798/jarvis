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
