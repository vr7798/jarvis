import { useState } from 'react';

const effortNames = { none: 'Sem esforço adicional', minimal: 'Mínimo', low: 'Baixo', medium: 'Médio', high: 'Alto', xhigh: 'Extra alto', max: 'Max', ultra: 'Ultra' };
export const effortLabel = value => effortNames[value] || value || 'Padrão';
export const speedLabel = value => ({ default: 'Normal', fast: 'Rápido', priority: 'Rápido', ultrafast: 'Ultrafast' })[value] || value || 'Padrão';
export function selectedModel(capabilities, value) {
  return capabilities?.models?.find(model => model.model === value || model.id === value)
    || capabilities?.models?.find(model => model.model === capabilities.defaultModel || model.id === capabilities.defaultModel)
    || capabilities?.models?.find(model => model.isDefault);
}
export function modelTiers(model) {
  const tiers = Array.isArray(model?.serviceTiers) ? model.serviceTiers
    : (model?.supportedServiceTiers || model?.additionalSpeedTiers || []).map(id => ({ id, name: speedLabel(id) }));
  return tiers.filter(tier => tier?.id && tier.id !== 'default');
}

export default function ModelSettings({ capabilities, loading, selection, busy, pending, onSave }) {
  const [model, setModel] = useState(selection.model || '');
  const [effort, setEffort] = useState(selection.reasoningEffort || '');
  const [tier, setTier] = useState(selection.serviceTier || '');
  const [problem, setProblem] = useState('');
  const chosen = selectedModel(capabilities, model);
  const efforts = chosen?.supportedReasoningEfforts || [];
  const tiers = modelTiers(chosen);
  const disabled = busy || pending;
  const hasModel = capabilities?.models?.some(item => item.model === model || item.id === model);
  const effortSupported = !effort || efforts.some(item => item.reasoningEffort === effort);
  const tierSupported = !tier || tier === 'default' || tiers.some(item => item.id === tier);
  function changeModel(value) {
    const next = selectedModel(capabilities, value);
    setModel(value); setProblem('');
    if (!next?.supportedReasoningEfforts?.some(item => item.reasoningEffort === effort)) setEffort('');
    if (!modelTiers(next).some(item => item.id === tier) && tier !== 'default') setTier('');
  }
  async function submit(event) {
    event.preventDefault();
    if (disabled || loading || !capabilities?.connected || !effortSupported || !tierSupported) return;
    setProblem('');
    try { await onSave({ model: model || null, reasoningEffort: effort || null, serviceTier: tier || null }); }
    catch (error) { setProblem(error.message); }
  }
  return <form className="performance-settings" onSubmit={submit}>
    <p className="section-description">Escolha o modelo, a profundidade do raciocínio e a velocidade para as próximas mensagens desta conversa.</p>
    {loading && <p className="admin-info-loading" role="status"><span className="spinner" />Consultando as opções do seu Codex…</p>}
    <fieldset disabled={disabled || loading || !capabilities?.connected}>
      <label className="field-label">Modelo do Codex<select value={model} onChange={event => changeModel(event.target.value)}>
        <option value="">Padrão do Codex{chosen && !model ? ` · ${chosen.displayName || chosen.model}` : ''}</option>
        {model && !hasModel && <option value={model} disabled>{model} · indisponível</option>}
        {capabilities?.models?.map(item => <option key={item.id || item.model} value={item.model}>{item.displayName || item.model}</option>)}
      </select></label>
      <label className="field-label">Esforço de raciocínio<select value={effort} onChange={event => setEffort(event.target.value)}>
        <option value="">Padrão do modelo{chosen?.defaultReasoningEffort ? ` · ${effortLabel(chosen.defaultReasoningEffort)}` : ''}</option>
        {!effortSupported && <option value={effort} disabled>{effortLabel(effort)} · indisponível neste modelo</option>}
        {efforts.map(item => <option key={item.reasoningEffort} value={item.reasoningEffort}>{effortLabel(item.reasoningEffort)}</option>)}
      </select></label>
      <p className="performance-description">{efforts.find(item => item.reasoningEffort === effort)?.description || 'Mais esforço pode melhorar tarefas complexas, mas leva mais tempo e usa mais tokens.'}{effort === 'ultra' && ' Ultra permite ao Codex dividir tarefas complexas entre subagentes.'}</p>
      <label className="field-label">Velocidade de resposta<select value={tier} onChange={event => setTier(event.target.value)}>
        <option value="">Padrão do modelo{chosen?.defaultServiceTier ? ` · ${speedLabel(chosen.defaultServiceTier)}` : ''}</option>
        <option value="default">Normal</option>
        {!tierSupported && <option value={tier} disabled>{speedLabel(tier)} · indisponível neste modelo</option>}
        {tiers.map(item => <option key={item.id} value={item.id}>{speedLabel(item.id) === item.id ? item.name || item.id : speedLabel(item.id)}</option>)}
      </select></label>
      <p className="performance-description">{tier && tier !== 'default' ? 'A velocidade acelerada pode consumir mais da sua cota. A disponibilidade depende do modelo e da sua conta.' : 'A velocidade de resposta é independente do esforço de raciocínio.'}</p>
    </fieldset>
    {!loading && !capabilities?.connected && <p className="setting-note">Conecte sua VPS para consultar e alterar os modos disponíveis.</p>}
    {!loading && capabilities?.connected && !effortSupported && <p className="form-error" role="alert">Escolha um esforço disponível neste modelo ou volte ao padrão.</p>}
    {busy && <p className="setting-note">Aguarde a tarefa terminar ou interrompa a resposta para alterar o modo.</p>}
    {problem && <p className="form-error" role="alert">{problem}</p>}
    <div className="settings-footer"><button className="primary" disabled={disabled || loading || !capabilities?.connected || !effortSupported || !tierSupported}>{pending ? 'Salvando…' : 'Salvar modelo e modos'}</button></div>
  </form>;
}
