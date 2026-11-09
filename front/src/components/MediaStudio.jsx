import { useId, useState } from 'react';
import '../studio.css';

const modes = [
  { id: 'image', label: 'Imagem', tag: 'IMAGINE', symbol: '◈', description: 'Da ideia à direção visual.', placeholder: 'Ex.: uma campanha de óculos com fotografia editorial, luz de fim de tarde e fundo minimalista.', examples: ['Fotografia editorial de produto', 'Ilustração para uma campanha', 'Cena cinematográfica com luz natural'] },
  { id: 'edit', label: 'Editar imagem', tag: 'TRANSFORME', symbol: '◉', description: 'Uma nova leitura da sua referência.', placeholder: 'Ex.: trocar o fundo da foto por um estúdio cinza claro, preservando o produto e suas proporções.', examples: ['Trocar o fundo da foto', 'Criar variações de uma referência', 'Ajustar iluminação e composição'] },
  { id: 'design', label: 'Design', tag: 'CRIE', symbol: '✦', description: 'Design com intenção, do início ao fim.', placeholder: 'Ex.: um kit de posts para uma marca de tecnologia, com tipografia forte, azul elétrico e visual premium.', examples: ['Kit de posts para redes sociais', 'Identidade visual de uma marca', 'Apresentação de um novo produto'] },
  { id: 'interface', label: 'UI / UX', tag: 'CONSTRUA', symbol: '▧', description: 'Interfaces que fazem sentido.', placeholder: 'Ex.: dashboard financeiro com tema escuro, navegação simples, foco nos números e excelente uso no celular.', examples: ['Landing page moderna e responsiva', 'Dashboard com visual premium', 'Redesenhar a experiência de um app'] },
];

const styles = ['Direção automática', 'Minimalista', 'Editorial', 'Cinematográfico', '3D', 'Tecnológico'];
const formats = [{ value: 'auto', label: 'Livre', description: 'Melhor formato para a ideia' }, { value: '1:1', label: '1:1', description: 'Quadrado' }, { value: '16:9', label: '16:9', description: 'Horizontal' }, { value: '9:16', label: '9:16', description: 'Vertical' }];

export function buildMediaPrompt({ mode = 'image', description, style = 'Direção automática', format = 'auto' }) {
  const brief = String(description || '').trim();
  const direction = style !== 'Direção automática' ? `\nDireção visual: ${style}.` : '\nEscolha uma direção visual coerente com o objetivo e explique brevemente sua escolha.';
  const dimensions = format !== 'auto' ? `\nProporção desejada: ${format}.` : '';
  const tasks = {
    image: 'Crie uma imagem a partir deste briefing. Use a ferramenta ou skill de geração de imagem disponível neste ambiente. Se não houver geração de imagem, explique essa limitação e prepare um prompt detalhado; não diga que uma imagem foi gerada sem gerar o arquivo.',
    edit: 'Edite a imagem de referência anexada de acordo com este briefing. Preserve os elementos não mencionados. Se não houver imagem anexada ou ferramenta de edição disponível, peça o que falta antes de afirmar que realizou a edição.',
    design: 'Atue como designer e transforme este briefing em uma peça ou sistema visual bem resolvido. Use os recursos disponíveis no projeto para entregar arquivos reais, com tipografia, hierarquia, composição e cores consistentes. Se algum recurso necessário não estiver disponível, explique o limite.',
    interface: 'Atue como designer de produto e desenvolvedor. Implemente a interface descrita no projeto atual, com hierarquia visual clara, navegação intuitiva, estados de interação, acessibilidade e layout responsivo. Inspecione a estrutura existente antes de alterar arquivos. Verifique o resultado com as ferramentas disponíveis.',
  };
  return `${tasks[mode] || tasks.image}\n\nBriefing: ${brief}${direction}${dimensions}\n\nEntregue o resultado com uma explicação breve e links para os arquivos criados, quando houver. Não invente arquivos, ferramentas ou resultados.`;
}

/** Creates a reviewed composer draft; generation is handled by the existing AI. */
export default function MediaStudio({ onCompose, disabled = false, initialMode = 'image' }) {
  const id = useId();
  const [mode, setMode] = useState(modes.some(item => item.id === initialMode) ? initialMode : 'image');
  const [description, setDescription] = useState('');
  const [style, setStyle] = useState(styles[0]);
  const [format, setFormat] = useState('auto');
  const selected = modes.find(item => item.id === mode);
  function submit(event) {
    event.preventDefault();
    if (!description.trim() || disabled) return;
    onCompose?.(buildMediaPrompt({ mode, description, style, format }), { mode, label: selected.label });
  }
  return <form className="media-studio studio-content" onSubmit={submit}>
    <div className="media-studio-intro"><span className="studio-eyebrow">CREATIVE STUDIO <span>SEU PRÓXIMO PROJETO</span></span><h3>Uma ideia. Infinitas possibilidades<span>.</span></h3><p>Prepare o briefing. Dê a direção. Crie com o Luck.</p></div>
    <div className="media-mode-picker" role="group" aria-label="Tipo de criação">{modes.map(item => <button key={item.id} type="button" className={mode === item.id ? 'is-selected' : ''} aria-pressed={mode === item.id} onClick={() => setMode(item.id)}><span className="media-mode-symbol" aria-hidden="true">{item.symbol}</span><strong>{item.label}</strong><small>{item.tag}</small></button>)}</div>
    <div className={`media-direction media-direction-${mode}`}><div className="media-preview-art" aria-hidden="true"><span /><span /><span /><i>{selected.symbol}</i></div><div><span className="studio-eyebrow">{selected.tag} COM O LUCK</span><h4>{selected.description}</h4><p>{mode === 'edit' ? 'Anexe uma imagem no campo da conversa antes de enviar o pedido.' : mode === 'interface' ? 'Um pedido pronto para implementar no seu projeto atual.' : 'Defina a composição, o clima e o que seu projeto precisa comunicar.'}</p></div></div>
    <label className="studio-field" htmlFor={`${id}-brief`}>Descreva sua ideia <span className="studio-required">Obrigatório</span><textarea id={`${id}-brief`} value={description} maxLength={5000} rows={4} placeholder={selected.placeholder} required onChange={event => setDescription(event.target.value)} /></label>
    <div className="media-examples" aria-label="Ideias para começar">{selected.examples.map(example => <button key={example} type="button" onClick={() => { setDescription(example); document.getElementById(`${id}-brief`)?.focus(); }}>{example}<span aria-hidden="true">↗</span></button>)}</div>
    <label className="studio-field" htmlFor={`${id}-style`}>Direção visual<select id={`${id}-style`} value={style} onChange={event => setStyle(event.target.value)}>{styles.map(item => <option key={item}>{item}</option>)}</select></label>
    <fieldset className="media-format-picker"><legend>Formato</legend><div>{formats.map(item => <button type="button" key={item.value} className={format === item.value ? 'is-selected' : ''} aria-pressed={format === item.value} onClick={() => setFormat(item.value)}><span className={`media-format-icon format-${item.value.replace(':', '-')}`} aria-hidden="true" /><strong>{item.label}</strong><small>{item.description}</small></button>)}</div></fieldset>
    <div className="media-studio-submit"><p>O pedido vai para a conversa.<br /><span>Você revisa antes de enviar.</span></p><button className="studio-primary" type="submit" disabled={disabled || !description.trim()}>Preparar criação <span aria-hidden="true">↗</span></button></div>
    <p className="studio-footnote">A criação usa as ferramentas disponíveis na sua instalação. Imagens precisam de uma ferramenta de geração ou edição conectada; o estúdio prepara o pedido e não altera essas capacidades.</p>
  </form>;
}
