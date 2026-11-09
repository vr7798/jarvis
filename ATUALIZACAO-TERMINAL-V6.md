# Luck / Jarvis v6 — Terminal Pro

Atualização da interface do terminal SSH, publicada sem reiniciar a API.

## Abrir e recolher

- Clique na aba **TERMINAL** na borda direita ou puxe essa aba para a esquerda.
- O botão **Terminal** no menu e o comando `/terminal` continuam disponíveis.
- **Ctrl + `** (ou **⌘ + `**) alterna entre o chat e o terminal.
- Para recolher, use a seta no cabeçalho, clique fora do painel ou arraste o cabeçalho para a direita. A sessão e sua saída continuam ativas enquanto o painel fica recolhido.
- **Encerrar** fecha o shell. Sair da conta, desconectar o SSH e os limites de sessão do servidor também encerram o terminal. Recarregar a página não preserva o shell nesta versão.

## Aparência e controles

Cinco temas independentes do tema do chat: **Obsidian**, **Termux**, **Dracula**, **Tokyo Night** e **Daylight**. Tema e tamanho da fonte (11–22 px) ficam salvos neste navegador. Mudanças de aparência, tela cheia e o gesto de recolher não abrem uma nova sessão SSH.

O terminal oferece tela cheia, copiar seleção, colar, limpar tela e teclas extras para celular: Ctrl, Alt, Esc, Tab, setas, Home, End, `/`, `-`, `|`, Ctrl+C e Ctrl+D. Ctrl e Alt funcionam como modificadores da próxima tecla. A área de transferência pode exigir autorização do navegador.

O painel se ajusta à área visível ao abrir o teclado do celular. No computador, a tecla Tab dentro do terminal continua sendo enviada ao shell para autocompletar comandos.

## Desempenho e execução

O terminal continua usando xterm e um PTY real na conexão SSH autenticada. O código pesado do terminal é carregado separadamente e pode ser preparado ao passar sobre o botão. Entrada é agrupada em pequenos lotes com ordem preservada; a saída não causa uma atualização React por evento. Redimensionamentos repetidos com as mesmas dimensões não fazem novas requisições.

Comandos manuais usam as permissões do usuário SSH; as aprovações do chat não se aplicam a esses comandos. Esta atualização não altera credenciais, histórico, permissões ou modelos.

## Publicação

Compile em uma pasta separada, valide o resultado e copie os assets antes de substituir `front/dist/index.html` de forma atômica. Preserve os assets antigos para abas já abertas. Como o servidor serve os arquivos de `front/dist` em cada requisição, esta atualização de interface dispensa reinício do PM2.

Para voltar à interface anterior, restaure o `index.html` do backup da publicação. Os assets anteriores permanecem no diretório de produção.
