<div align="center">
  <img src="front/public/luck-shepherd.svg" alt="Logo Luck" width="112" />
  <h1>Jarvis · Luck Admin</h1>
  <p>Seu espaço de trabalho para conversar, planejar e construir com o Codex na VPS.</p>
  <p><strong>React 19</strong> · <strong>Node.js</strong> · <strong>SSH</strong> · <strong>Interface responsiva</strong></p>
  <p><a href="#recursos">Recursos</a> · <a href="#1-instalar-o-projeto">Instalação</a> · <a href="#comandos-e-diagnóstico">Comandos</a> · <a href="#histórico-de-atualizações">Atualizações</a></p>
</div>

---

O projeto mantém o nome **Jarvis** no repositório e nos serviços; a interface atual se apresenta como **Luck Admin v5**.

## Recursos

| Recurso | O que você encontra |
| --- | --- |
| Chat e histórico | Respostas em Markdown, busca, renomeação, exportação e exclusão de conversas. |
| Modelos e desempenho | Seleção por conversa de modelo, raciocínio e velocidade, conforme o catálogo da conexão. |
| Anexos e entregas | Upload de documentos e imagens, prévias e downloads autenticados. |
| Workspace e terminal | Navegação de arquivos e terminal SSH integrado. |
| Conexão lembrada | Reconexão após login com credenciais protegidas em cofre criptografado. |
| Permissões | Somente leitura, edição no workspace e acesso total quando habilitado pelo administrador. |
| Interface e voz | Tema claro/escuro, layout para celular, ditado e leitura de respostas conforme o navegador. |

## Histórico de atualizações

- [Luck v5 — modelos, raciocínio, velocidade e exclusão de conversas](ATUALIZACAO-LUCK-V5.md)
- [Luck v4 — reconexão, cofre de credenciais e imagens](ATUALIZACAO-LUCK-V4.md)
- [Luck v3 — comandos, anexos, arquivos e terminal](ATUALIZACAO-LUCK-V3.md)
- [Interface — Markdown, temas, histórico e voz](ATUALIZACAO-INTERFACE.md)

## Como funciona

React no navegador, API Node.js e conexão SSH com o Codex instalado na sua VPS. Depois do login no Jarvis, você informa o servidor, o usuário SSH, a senha e a pasta de trabalho. O painel mostra mensagens, comandos, alterações de arquivos e pedidos de aprovação numa interface de chat.

O caminho é **navegador → API do Jarvis → SSH → Codex na VPS**. Quem abre a conexão SSH é a API Node.js; o navegador conversa com a API por HTTP no desenvolvimento e HTTPS na publicação. O Codex trabalha no servidor remoto e usa a autenticação que já existe para aquele usuário SSH. O Jarvis não copia tokens do terminal e não importa automaticamente suas conversas antigas.

A [documentação oficial da OpenAI sobre conexões remotas](https://learn.chatgpt.com/docs/remote-connections) descreve a execução do Codex App Server por SSH no servidor remoto. Este projeto é um cliente pessoal para acessar sua própria máquina. Os limites, modelos e permissões da conta autenticada na VPS continuam valendo: SSH não fornece créditos nem contorna cotas.

## 1. Instalar o projeto

Instale Node.js 24 LTS (ou versão 22.12 ou superior) e Git. No Windows, use o Git Bash; no Linux ou WSL, use o terminal:

```bash
git clone https://github.com/vr7798/jarvis.git
cd jarvis
npm ci
npm run setup
npm run dev
```

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

A opção **Lembrar esta VPS** salva as credenciais no servidor em um cofre AES-256-GCM, separado do histórico, e permite tentar reconectar após o próximo login. Sem essa opção, a senha é usada apenas na memória durante a conexão. Ela não vai para `.env`, histórico ou armazenamento do navegador. Sair do painel, expirar a sessão ou reiniciar a API fecha a conexão; sem um perfil salvo, informe a senha novamente. Use **Esquecer a VPS** para remover o perfil persistido. Não exponha o Codex App Server em uma porta pública: sua comunicação passa pelo canal SSH criptografado.

Depois de conectar, crie uma **nova conversa** e teste:

> Crie teste-jarvis.txt na pasta de trabalho com o conteúdo “Jarvis conectado por SSH”. Depois leia o arquivo e confirme o conteúdo.

O arquivo será criado na pasta escolhida **na VPS**. O Codex recebe as permissões do usuário SSH e o sandbox configurado. `workspace-write` permite escrita na pasta de trabalho; `read-only` permite somente leitura. Acesso total exige habilitação explícita com `CODEX_ALLOW_FULL_ACCESS=true` e seleção por conversa. Consulte as [permissões da v4](ATUALIZACAO-LUCK-V4.md).

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

Antes de atualizar, faça um backup privado de `api/.env` e `api/data`. Com as alterações locais revisadas e salvas no Git, na raiz do projeto:

```bash
git pull --ff-only
npm ci
npm test
npm run build
```

Em produção, reinicie o processo com `pm2 restart jarvis --update-env`. Em desenvolvimento, reinicie `npm run dev`. O histórico, os anexos e o perfil criptografado ficam em `api/data`, fora do Git. Preserve também o usuário configurado e `SESSION_SECRET`, usados para abrir o cofre.

O arquivo `atualizar-ssh.sh` é um atualizador legado da versão inicial de SSH. Para obter a interface Luck atual, use os fontes deste repositório; executar o script legado pode substituir arquivos por versões antigas.

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

Não é necessário MongoDB para este uso individual: o histórico fica em JSON em `api/data/store.json`. Há limites de conversas e mensagens para evitar crescimento indefinido. Sessões de login ficam em memória: reiniciar a API exige novo login, mas preserva o histórico. Se houver uma VPS lembrada, o painel tenta restabelecer a conexão SSH após o login. Reiniciar ou desconectar durante uma tarefa pode interrompê-la; confira o resultado na VPS antes de repetir comandos.

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
git clone https://github.com/vr7798/jarvis.git jarvis
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
