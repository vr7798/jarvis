# Jarvis / Luck v7 — Área de projetos

Abra **Área de projetos** no menu ou pelo ícone de pasta no cabeçalho. O atalho **Ctrl+Shift+E** também abre a área.

## Projetos e arquivos

- **Clonar repositório:** informe a URL Git e um nome opcional. Por padrão, o projeto é criado em `projects/nome` dentro da pasta de trabalho da VPS. Uma pasta existente nunca é substituída.
- **Abrir pasta:** informe um caminho dentro do workspace atual; `.` abre sua raiz. O catálogo também mostra as pastas já existentes.
- O explorador expande subpastas, filtra os nomes dos arquivos carregados e permite mostrar arquivos ocultos.
- Arquivos abrem em abas. O editor oferece números de linha, recuo com Tab, criação de arquivos e pastas, download, recarregamento e **Ctrl+S** para salvar.
- A barra inferior mostra a branch e a quantidade de arquivos alterados no Git. O botão **Luck** acrescenta o caminho do projeto à mensagem do chat, preservando o rascunho já digitado.
- **Terminal** abre o shell na pasta do projeto. Se já houver outro terminal manual aberto, a interface pede confirmação antes de substituí-lo.

Os arquivos são lidos e salvos na VPS, sem copiar o projeto para o computador ou celular. A pasta acessível é a mesma configurada na conexão SSH. Repositórios privados usam as credenciais e chaves Git já configuradas para aquele usuário na VPS; a interface não recebe tokens dentro da URL.

## Salvamento e rascunhos

O salvamento verifica a revisão do arquivo e usa substituição atômica, preservando suas permissões. Se outra ferramenta alterar o arquivo, o editor mostra um conflito e mantém o rascunho local para revisão.

Voltar ao chat preserva abas e alterações em memória. Trocar de projeto, fechar arquivos alterados, sair da conta ou desconectar voluntariamente oferece opções para tratar alterações não salvas. Uma queda da conexão preserva os rascunhos para consulta e cópia, bloqueando operações remotas até reconectar a VPS original. Recarregar a página pode descartar alterações ainda não salvas; o navegador oferece o aviso de saída.

O editor abre textos UTF-8 de até 1 MB. Arquivos binários podem ser baixados, com limite de 250 MB. Links simbólicos não aparecem no explorador desta versão. O clone não inicia aplicações, instala dependências nem executa scripts do projeto.

## Serviço e publicação

A área de projetos usa `jarvis-projects`, em `127.0.0.1:3102`. Ela valida o login e o proprietário da conexão na API existente, verifica origem e CSRF e utiliza uma conexão SSH separada com o perfil salvo correspondente e a impressão digital confirmada. O perfil precisa estar salvo em **Minha VPS**.

```bash
pm2 start ecosystem.config.cjs --only jarvis-projects --env production
```

Ative o bloco `/api/projects/` de `deploy/nginx.conf.example`, valide com `nginx -t` e recarregue o Nginx. Publique os assets do front antes de substituir o `index.html`. Essa instalação não exige reiniciar `jarvis` nem `jarvis-terminal-input`.

`PROJECTS_PORT` altera a porta local; ajuste também o Nginx. O serviço utiliza `PORT` do `.env` para acessar a API original. Nenhuma credencial ou histórico existente é substituído.
