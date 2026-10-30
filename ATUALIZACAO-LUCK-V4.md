# Luck Admin · v4

## VPS lembrada e reconexão no login

A tela de SSH oferece **Lembrar esta VPS**, marcada por padrão. Após conectar com sucesso, o Luck grava o destino, o usuário, a pasta, a impressão digital e a senha em um cofre AES-256-GCM no servidor. Nenhuma senha é colocada no armazenamento do navegador ou devolvida pela API.

No próximo login no painel, uma tentativa de reconexão inicia em segundo plano, sem pedir novamente a senha SSH. O login no painel continua funcionando quando a VPS estiver indisponível; a tela oferece reconectar, alterar ou esquecer a conexão.

- A impressão digital salva continua sendo verificada em cada conexão.
- Sair do painel fecha o canal SSH, preservando o perfil criptografado.
- Esquecer a VPS apaga o perfil; não desfaz comandos nem precisa encerrar uma conexão já aberta.
- A conexão existente continua pertencendo à sua sessão; outro login não toma uma conexão ocupada.
- É necessário conectar uma vez com **Lembrar esta VPS** após esta atualização: versões anteriores não guardavam a senha SSH.

O cofre fica em `api/data/vps-profile.enc.json`, com permissões600 e substituição atômica. A chave é derivada de `SESSION_SECRET` e do administrador configurado. Preserve essa configuração com seu backup protegido; mudar o segredo ou o usuário exige cadastrar novamente a VPS.

## Permissões do chat

O administrador pode escolher **Acesso total / Full Access** em `/permissions` ou na configuração da conversa. Neste modo, as próximas execuções usam `dangerFullAccess` e aprovação `never`: arquivos e rede não são limitados pelo sandbox do Codex e não há paradas para aprovação. As permissões do usuário SSH e eventuais políticas impostas pela instalação remota continuam valendo.

Os modos somente leitura e edição no workspace continuam disponíveis. Ao retornar do acesso total para um modo restrito, a política muda para aprovação sob demanda. Configurações de conversas antigas são preservadas; acesso total é uma escolha por conversa.

O servidor permite oferecer essa opção com `CODEX_ALLOW_FULL_ACCESS=true`. Um servidor configurado explicitamente como somente leitura continua com esse teto. Desabilitar a opção retira acesso total das permissões efetivas.

## Imagens nas respostas

Links de arquivos de imagem também exibem prévia automaticamente, além da sintaxe Markdown `![]`. A prévia informa carregamento ou falha, permite ampliar e baixar a imagem. A mesma imagem repetida como link e imagem não produz cartões duplicados.

Quando suportados pela instalação do Codex, resultados nativos de geração de imagem são salvos na pasta de entregas e apresentados no chat. A geração depende do modelo, das ferramentas e do acesso da conta conectada; a interface não contrata uma API paga adicional.

As imagens e downloads usam as rotas autenticadas existentes. O modo de acesso total do chat não abre downloads arbitrários fora do workspace pelo navegador.

## Implantação

Histórico, anexos, login e variáveis existentes são mantidos. O processo interno PM2 continua `jarvis` por compatibilidade; a marca é Luck Admin v4.

O build foi preparado em `front/dist-luck-stage`, validado antes da troca e reiniciado com PM2. O backup anterior fica em `.jarvis-backups/luck-v4-*`.

Referências de protocolo conferidas: https://learn.chatgpt.com/docs/app-server e https://learn.chatgpt.com/docs/sandboxing, com validação do schema instalado.
