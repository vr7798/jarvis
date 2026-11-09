# Jarvis · Luck Workspace 08

Atualização de interface de 5 de novembro de 2026. Mantém a API, autenticação, conexões SSH, arquivos e histórico existentes.

- Nova direção visual: grafite, azul gelo e detalhes violeta, com tema claro correspondente, layouts responsivos e hierarquia revisada.
- Esfera com órbitas em CSS 3D na abertura e durante o trabalho da IA. Respeita a preferência de movimento reduzido, sem dependência de WebGL.
- Histórico que abre e fecha no computador e no celular, busca, grupos por data e preferência de recolhimento salva no navegador. Ctrl/Cmd+K abre a busca.
- Central de comandos com categorias, busca sem acentos, atalhos e skills consultadas na instalação conectada. Digite `/` na mensagem ou abra com Ctrl/Cmd+J. A paleta separada preserva o rascunho ao abrir e fechar.
- Comandos de histórico, projetos, voz, design, imagem, tema e cópia, além das ações existentes. Comandos que preparam instruções aparecem como briefings; não são apresentados como operações nativas do terminal.
- Estúdio criativo com imagem, edição de referência, design e UI/UX, direção visual e formato. Prepara um pedido revisável; a geração utiliza as ferramentas realmente disponíveis no Codex conectado. As referências são anexadas no composer.
- Estúdio de voz com ditado, transcrição, vozes do navegador, velocidade, teste, leitura da última resposta, pausa/continuação e leitura automática opcional. Reconhecimento depende de HTTPS, permissão e suporte do navegador. Não adiciona um provedor de voz à API.
- Perfis de desempenho Equilibrado, Rápido e Ultra/Profundo, apresentados conforme as capacidades reais de cada modelo. Salvar aplica modelo, esforço e velocidade às próximas mensagens. Ultra recebe tratamento visual próprio quando realmente selecionado.
- Copiar e baixar código, baixar respostas em Markdown, exportar conversa e manter anexos/arquivos do workspace.

Comandos exclusivos da interface de terminal continuam acessíveis pelo terminal integrado. O histórico web contém conversas do painel; esta atualização não importa sessões antigas do Termux.

Os arquivos anteriores da interface foram preservados em `.jarvis-backups/ui-v8-20261105/`. Nenhuma credencial foi copiada para o código ou alterada. A publicação consiste na troca dos arquivos estáticos, sem reiniciar os processos do Jarvis.

Validação: build Vite concluído, 91 testes existentes da API aprovados, 19 cenários de navegador aprovados e nenhum erro JavaScript. Os fluxos funcionais foram verificados com API isolada e catálogo de teste, incluindo persistência e envio dos modos, anexos, downloads e estados das APIs de voz. Microfone/áudio físico não foram exercitados. Telas verificadas em desktop, 390 px e 320 px. A URL pública, o JavaScript, o CSS e `/health` responderam com sucesso após a publicação.
