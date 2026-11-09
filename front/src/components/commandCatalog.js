/** UI actions and prompt starters share a catalog; native capabilities remain server-owned. */
export const commandCategories = {
  conversation: 'Conversas',
  intelligence: 'Inteligência',
  media: 'Criação e mídia',
  workspace: 'Workspace',
  development: 'Desenvolvimento',
  skills: 'Skills instaladas',
  settings: 'Preferências',
};

const metadata = {
  new: ['conversation', 'chat', ['nova', 'conversa']],
  status: ['workspace', 'status', ['estado', 'conexao', 'ambiente']],
  permissions: ['settings', 'shield', ['permissoes', 'aprovacoes', 'approvals']],
  model: ['intelligence', 'brain', ['modelo', 'modelos']],
  effort: ['intelligence', 'brain', ['esforco', 'raciocinio', 'reasoning']],
  fast: ['intelligence', 'bolt', ['velocidade', 'rapido']],
  skills: ['intelligence', 'spark', ['habilidades', 'ferramentas']],
  mcp: ['intelligence', 'plug', ['integracoes', 'extensoes']],
  compact: ['conversation', 'compact', ['compactar', 'resumir', 'contexto']],
  plan: ['development', 'plan', ['planejar', 'plano']],
  review: ['development', 'code', ['revisar', 'revisao']],
  init: ['development', 'code', ['instrucoes', 'agents']],
  terminal: ['workspace', 'terminal', ['termux', 'shell', 'codex', 'cli']],
  files: ['workspace', 'folder', ['arquivos', 'pastas']],
  attach: ['workspace', 'attachment', ['anexar', 'anexo', 'upload']],
  export: ['conversation', 'download', ['exportar', 'baixar', 'download']],
  delete: ['conversation', 'trash', ['excluir', 'apagar']],
  clear: ['conversation', 'clear', ['limpar', 'rascunho']],
  help: ['settings', 'help', ['ajuda', 'comandos']],
};

const uiCommands = [
  { name: 'history', label: 'Histórico', description: 'Abrir suas conversas e buscar no histórico do painel.', action: 'history', category: 'conversation', icon: 'history', keywords: ['historico', 'buscar', 'resume', 'retomar'] },
  { name: 'resume', label: 'Retomar conversa', description: 'Escolher uma conversa salva no histórico web.', action: 'history', category: 'conversation', icon: 'history', keywords: ['retomar', 'historico'] },
  { name: 'copy', label: 'Copiar última resposta', description: 'Copiar o texto da última resposta desta conversa.', action: 'copy', category: 'conversation', icon: 'copy', keywords: ['copiar', 'clipboard'] },
  { name: 'stop', label: 'Interromper resposta', description: 'Parar a tarefa em andamento nesta conversa.', action: 'stop', category: 'conversation', icon: 'stop', keywords: ['parar', 'cancelar', 'interrupt'] },
  { name: 'ultra', label: 'Modo Ultra', description: 'Abrir os modos de raciocínio disponíveis para seu modelo.', action: 'ultra', category: 'intelligence', icon: 'spark', keywords: ['max', 'profundo', 'raciocinio'] },
  { name: 'media', label: 'Estúdio criativo', description: 'Abrir os modos de criação de imagens, design e mídia.', action: 'media', category: 'media', icon: 'spark', keywords: ['midia', 'criacao', 'criativo', 'studio'] },
  { name: 'voice', label: 'Estúdio de voz', description: 'Abrir o modo de voz, escolher uma voz e ajustar a leitura.', action: 'voice', category: 'media', icon: 'mic', keywords: ['voz', 'audio', 'falar', 'microfone'] },
  { name: 'image', label: 'Criar imagem', description: 'Abrir o briefing de imagem com estilo, formato e referências.', action: 'media', category: 'media', icon: 'image', source: 'Luck', keywords: ['imagem', 'imagens', 'gerar', 'foto', 'midia'], prompt: 'Crie uma imagem a partir do briefing abaixo usando as ferramentas disponíveis. Salve o arquivo real no workspace e entregue a prévia e o link para download. Se a geração não estiver disponível, informe a limitação. Briefing: ' },
  { name: 'design', label: 'Direção de design', description: 'Abrir os modos de design para marcas, layouts e interfaces.', action: 'media', category: 'media', icon: 'design', source: 'Luck', keywords: ['designer', 'visual', 'ui', 'ux', 'marca', 'midia'], prompt: 'Atue como designer sênior. Crie uma direção visual coesa com tipografia, paleta, composição e acessibilidade. Quando aplicável, implemente os arquivos no projeto e entregue uma prévia verificável. Briefing: ' },
  { name: 'slides', label: 'Criar apresentação', description: 'Preparar uma apresentação e pedir os arquivos no workspace.', action: 'prompt', category: 'media', icon: 'slides', source: 'Prompt', keywords: ['apresentacao', 'slides', 'midia', 'powerpoint'], prompt: 'Crie uma apresentação profissional sobre o tema abaixo. Organize a narrativa e o conteúdo por slide, use as ferramentas disponíveis para salvar um arquivo real no workspace e forneça o link para download. Tema e público: ' },
  { name: 'video', label: 'Roteiro de vídeo', description: 'Criar roteiro, storyboard e direção visual para um vídeo.', action: 'prompt', category: 'media', icon: 'video', source: 'Prompt', keywords: ['video', 'reels', 'storyboard', 'midia'], prompt: 'Crie um roteiro e storyboard profissional de vídeo, com cenas, duração, narração, direção visual e trilha sugerida. Se houver ferramentas de vídeo disponíveis, informe as opções antes de renderizar. Briefing: ' },
  { name: 'research', label: 'Pesquisar', description: 'Preparar uma investigação com fontes e resultados verificáveis.', action: 'prompt', category: 'intelligence', icon: 'search', source: 'Prompt', keywords: ['pesquisa', 'pesquisar', 'fontes', 'buscar'], prompt: 'Pesquise o tema abaixo usando as ferramentas disponíveis. Verifique os fatos, cite fontes acessíveis e diferencie evidências de hipóteses. Tema: ' },
  { name: 'projects', label: 'Área de projetos', description: 'Abrir projetos, repositórios e o editor de arquivos.', action: 'projects', category: 'workspace', icon: 'folder', keywords: ['projetos', 'repositorios', 'editor', 'codigo'] },
  { name: 'diff', label: 'Analisar alterações', description: 'Preparar a leitura do diff e um resumo do que mudou.', action: 'prompt', category: 'development', icon: 'diff', source: 'Prompt', keywords: ['mudancas', 'git', 'alteracoes'], prompt: 'Inspecione o git diff e o estado deste projeto. Resuma as alterações por arquivo, destaque riscos e não altere arquivos. Foco opcional: ' },
  { name: 'debug', label: 'Investigar problema', description: 'Preparar um diagnóstico para erros e falhas no projeto.', action: 'prompt', category: 'development', icon: 'code', source: 'Prompt', keywords: ['bug', 'erro', 'depurar', 'diagnostico'], prompt: 'Investigue o problema abaixo no projeto. Identifique a causa com evidências, aplique a correção adequada e valide o comportamento com verificações pertinentes. Problema: ' },
  { name: 'test', label: 'Validar projeto', description: 'Pedir as verificações pertinentes e um relatório dos resultados.', action: 'prompt', category: 'development', icon: 'check', source: 'Prompt', keywords: ['teste', 'testes', 'validar'], prompt: 'Identifique e execute as verificações apropriadas deste projeto. Informe os resultados reais, as falhas e o que não foi possível testar. Escopo: ' },
  { name: 'explain', label: 'Entender código', description: 'Preparar uma explicação do código, fluxo ou arquitetura.', action: 'prompt', category: 'development', icon: 'code', source: 'Prompt', keywords: ['explicar', 'arquitetura', 'entender'], prompt: 'Explique o código ou fluxo abaixo de forma clara, com referências aos arquivos relevantes e exemplos quando ajudarem. Não altere arquivos. Quero entender: ' },
  { name: 'theme', label: 'Alternar aparência', description: 'Trocar entre os temas claro e escuro da interface.', action: 'theme', category: 'settings', icon: 'sun', keywords: ['tema', 'escuro', 'claro', 'aparencia'] },
  { name: 'settings', label: 'Configurações', description: 'Abrir as preferências e permissões da conversa.', action: 'settings', category: 'settings', icon: 'settings', keywords: ['configuracoes', 'preferencias'] },
];

const normalise = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

export function filterCommands(commands = [], query = '') {
  const words = normalise(query.replace(/^\//, '').trim()).split(/\s+/).filter(Boolean);
  if (!words.length) return commands;
  return commands.filter(command => {
    const haystack = normalise([command.name, command.label, command.description, commandCategories[command.category], ...(command.keywords || [])].join(' '));
    return words.every(word => haystack.includes(word));
  });
}

export function buildCommandCatalog(capabilities, fallbackCommands = []) {
  const categoryOrder = Object.keys(commandCategories);
  const serverCommands = capabilities?.commands?.length ? capabilities.commands : fallbackCommands;
  const catalog = new Map(serverCommands.map(command => {
    const [category = 'workspace', icon = 'command', keywords = []] = metadata[command.name] || [];
    return [command.name, { ...command, category, icon, keywords }];
  }));
  for (const command of uiCommands) {
    if (!catalog.has(command.name)) catalog.set(command.name, { source: 'Luck', ...command });
  }
  const seenSkills = new Set();
  for (const skill of capabilities?.skills || []) {
    if (typeof skill.name !== 'string' || !skill.name.trim() || seenSkills.has(skill.name)) continue;
    seenSkills.add(skill.name);
    const slug = normalise(skill.name).replace(/[^a-z0-9_-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 75);
    if (!slug) continue;
    const name = catalog.has(slug) ? `skill-${slug}` : slug;
    if (catalog.has(name)) continue;
    catalog.set(name, { name, label: skill.displayName || skill.name, description: skill.description || 'Usar esta habilidade instalada no Codex conectado.', action: 'prompt', category: 'skills', icon: 'spark', source: 'Skill', prompt: `$${skill.name} `, enabled: capabilities.connected !== false, keywords: ['habilidade', 'skill', skill.name] });
  }
  return [...catalog.values()].sort((left, right) => categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category));
}
