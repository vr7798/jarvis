# Luck Admin · v3

A marca do painel agora é **Luck**, com logo vetorial de pastor-alemão, favicon e avatar nas respostas. Login, histórico e preferências existentes continuam compatíveis.

## Comandos

Digite `/` no campo de mensagem ou toque no botão `/`. Filtre digitando, navegue com as setas e escolha com Enter/Tab. Esc fecha o menu.

O menu oferece novas conversas, status, permissões, modelos, skills, integrações MCP, compactação, planejamento, revisão, instruções do projeto, terminal, arquivos, anexos, exportação e ajuda.

Modelos, skills e integrações são consultados no Codex da conexão atual. A compactação usa `thread/compact/start`. Planejar, revisar e iniciar instruções preparam pedidos de texto para revisão antes do envio; não simulam modos exclusivos de outros clientes. Só recursos compatíveis com a instalação conectada são executados.

## Anexos e entregas

- Botão de anexo, arrastar/soltar e colar imagens.
- Até 8 arquivos por mensagem, 25 MB por arquivo e 60 MB no total.
- Imagens PNG/JPEG/GIF/WebP, PDFs, documentos, texto/código, ZIP, RAR, 7z, TAR/gzip e arquivos em outros formatos.
- Imagens entram como `localImage` no Codex; os demais arquivos são transferidos para `.luck/uploads` no workspace e analisados com as ferramentas da VPS.
- Arquivos compactados não são extraídos nem executados automaticamente.
- Links de entregas nas respostas oferecem downloads autenticados; imagens locais podem aparecer com prévia. O Luck recebe instruções para salvar entregas em `.luck/outputs`.
- O botão **Arquivos** permite navegar e baixar arquivos do workspace atual. Downloads são limitados a 250 MB, sem acesso a caminhos externos ou links simbólicos que escapem da pasta.
- Armazenamento de anexos no painel limitado a 2 GB. Os arquivos recebidos permanecem em `api/data/attachments`; inclua essa pasta no backup junto com `api/data/store.json`.

A leitura de documentos e a criação de entregas dependem das ferramentas disponíveis na VPS e das permissões escolhidas no chat. O painel transfere os arquivos; a geração de uma entrega ocorre quando solicitada ao assistente.

## Terminal manual

Abra **Terminal** na barra lateral ou use `/terminal`. O painel abre um PTY real na mesma conexão SSH autenticada. A tela oferece teclado, copiar/colar, redimensionamento e teclas auxiliares no celular.

Os comandos digitados rodam diretamente com o usuário SSH. As aprovações e o sandbox do chat não se aplicam ao terminal manual. Fechar o painel encerra o canal; desconectar, sair ou expirar a sessão também encerra os terminais.

## Operação

O diretório `/var/www/jarvis`, o processo PM2 `jarvis`, as variáveis `JARVIS_*` e o cookie interno são mantidos para compatibilidade. A marca apresentada ao usuário é Luck.

```sh
npm test
npm run build
pm2 restart jarvis
```

O reinício exige novo login e nova conexão SSH. O histórico e os anexos persistem.

A implantação desta versão foi compilada e testada em `front/dist-luck-stage` antes da troca do build ativo. O backup anterior está em `.jarvis-backups/luck-v3-*`, incluindo fontes, dados e configuração Nginx anterior. O Nginx deste domínio foi ajustado para upload e streaming do terminal.

Referências de protocolo: https://learn.chatgpt.com/docs/app-server e https://learn.chatgpt.com/docs/developer-commands, conferidas contra o schema do Codex instalado.
