# Luck Admin · v5

## Modelo, raciocínio e velocidade no chat

Os controles acima do campo de mensagem abrem **Modelo e desempenho**. É possível escolher o modelo, o esforço de raciocínio e a velocidade por conversa. Os comandos `/model`, `/effort` e `/fast` abrem os mesmos controles.

Os esforços vêm do catálogo do Codex conectado: Baixo, Médio, Alto, Extra alto, Max e Ultra aparecem somente quando o modelo oferece essas opções. Ultra é enviado como esforço nativo, permitindo ao Codex delegar partes de tarefas quando houver suporte.

A velocidade é independente do esforço. Normal e os níveis acelerados anunciados pelo modelo aparecem na lista. O identificador do catálogo é preservado, incluindo `priority` para Fast em instalações que usam esse nome. Ultrafast só aparece quando anunciado pela instalação e pela conta. Modos acelerados podem usar mais da cota.

As escolhas ficam no histórico da conversa e são aplicadas às próximas mensagens, inclusive após reconectar ou reiniciar o painel. Voltar ao padrão usa os padrões anunciados pelo modelo; Normal envia explicitamente a velocidade normal. Conversas anteriores que não foram configuradas mantêm o comportamento existente. Durante uma tarefa, os controles ficam bloqueados.

O processo do Codex iniciado pelo Luck habilita a capacidade de Fast apenas nesse subprocesso. O painel não modifica o `config.toml` da VPS. Habilitar a capacidade não seleciona uma velocidade acelerada por conta própria.

## Excluir conversas antigas

A lista de conversas tem uma lixeira em cada item, também visível no celular. Há outra lixeira no cabeçalho da conversa atual, além do comando `/delete` e da opção nas configurações.

A confirmação mostra o título da conversa escolhida. Excluir outra conversa preserva a conversa aberta e seu rascunho. Conversas em andamento não podem ser excluídas. A exclusão remove o histórico do Luck e não apaga os arquivos do workspace.

## Publicação

Sem novas dependências. A atualização preserva login, conexão salva, anexos e histórico existente. A publicação cria um backup privado em `.jarvis-backups/luck-v5-published-*` e reinicia somente o processo PM2 `jarvis`.

Referências: [modelos e esforços](https://learn.chatgpt.com/docs/models), [velocidade](https://learn.chatgpt.com/docs/agent-configuration/speed) e [App Server](https://learn.chatgpt.com/docs/app-server), com conferência do schema e da instalação local do Codex.
