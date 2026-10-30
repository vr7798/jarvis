# Jarvis · Atualização da interface

A interface mantém a autenticação existente, a conexão SSH e o histórico. As alterações incluem:

- Respostas com Markdown: negrito, títulos, listas, tabelas, links e blocos de código com cópia. HTML enviado pelo modelo não é executado.
- Interface responsiva com tema claro/escuro e tamanho de fonte ajustável.
- Busca no histórico (Ctrl/Cmd + K), renomear, exportar em Markdown e excluir conversas mediante confirmação.
- Detalhes dos comandos recolhíveis e aprovação explícita de ações solicitadas pelo Codex.
- Configurações por conversa: somente leitura ou escrita no workspace; política cautelosa ou aprovação sob demanda. A API valida e aplica essas opções a cada nova execução, respeitando CODEX_SANDBOX do servidor.
- Ditado pelo microfone para um rascunho revisável. Só começa após clicar em Ditar, depende de HTTPS e de suporte/permissão do navegador. O serviço do navegador pode processar o áudio.
- Leitura de respostas em voz alta, seleção de voz, velocidade e leitura automática opcional. As vozes disponíveis dependem do dispositivo.

Aparência e preferências de áudio ficam no navegador. Permissões e nomes das conversas ficam no histórico do servidor. Excluir uma conversa remove o histórico do painel, sem apagar arquivos do workspace nem os registros internos do Codex.

## Operação

Na raiz `/var/www/jarvis`:

```sh
npm test
npm run build
pm2 restart jarvis
```

O reinício encerra sessões e conexões SSH do painel; basta entrar e conectar novamente. O histórico persiste em `api/data`.

Antes desta atualização foi criado um backup dos fontes e do build em `.jarvis-backups/interface-*`. Credenciais e a configuração `.env` foram preservadas.
