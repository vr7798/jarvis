# Terminal: menor atraso na digitação

A entrada do terminal agora usa um canal WebSocket persistente. Na versão anterior, cada lote de teclas aguardava a resposta HTTP do lote anterior, acumulando o tempo de ida e volta da rede durante a digitação.

O novo canal envia as teclas na ordem, sem essa espera entre lotes. Uma janela de entrada com limite de bytes controla colagens grandes; a saída continua chegando pelo fluxo SSE existente. Os caracteres exibidos continuam sendo a resposta real do terminal remoto.

## Implantação

O serviço `jarvis-terminal-input` escuta apenas em `127.0.0.1:3101` e encaminha a entrada para a API existente em loopback. A API continua responsável pela sessão, CSRF, usuário proprietário do terminal, conexão SSH e expiração. O serviço exige origem exata e valida login e CSRF antes de aceitar o WebSocket. Tokens não são colocados na URL.

```bash
npm ci
pm2 start ecosystem.config.cjs --only jarvis-terminal-input --env production
```

Ative o bloco `/api/terminal/.../input-stream` de `deploy/nginx.conf.example` no site existente, valide com `nginx -t` e recarregue o Nginx. Publique o front compilado com os assets antes do `index.html`. Essa instalação permite manter a API e as tarefas SSH em execução, sem reiniciar o processo `jarvis`.

`TERMINAL_INPUT_PORT` permite escolher outra porta local; ajuste também o proxy Nginx. Se a porta da API for diferente de 3100, o serviço usa `PORT` do `.env` existente.

## Uso e falhas de conexão

Atualize a página e abra o terminal para carregar o novo canal. Recolher e reabrir continuam preservando o mesmo shell.

Se WebSocket estiver indisponível antes de transmitir entrada, o cliente utiliza o transporte HTTP anterior. Se houver uma interrupção com teclas sem confirmação, o cliente informa a falha e oferece uma nova sessão; ele não repete comandos que possam ter sido executados.

O canal remove a espera adicional causada pelo transporte anterior. O tempo necessário para a tecla chegar à VPS e a resposta retornar continua dependendo da rede e do servidor remoto.
