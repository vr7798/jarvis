import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import MarkdownMessage, { plainText } from './components/MarkdownMessage.jsx';
import useVoice from './hooks/useVoice.js';
import SlashMenu from './components/SlashMenu.jsx';
import FilesPanel from './components/FilesPanel.jsx';
import ModelSettings, { effortLabel, speedLabel, selectedModel } from './components/ModelSettings.jsx';
const TerminalPanel = lazy(() => import('./components/TerminalPanel.jsx'));
import './commands.css';


function Icon({ name, size = 20, ...props }) {
  const paths = {
    brain: <><path d="M12 4c-3-3-7 0-6 3-4 1-4 7-1 8-1 4 4 7 7 4M12 4c3-3 7 0 6 3 4 1 4 7 1 8 1 4-4 7-7 4M12 4v16M6 7l3 2M18 7l-3 2M5 15l4-1M19 15l-4-1" /></>,
    bolt: <path d="m13 2-8 12h6l-1 8 9-13h-6l1-7Z" />,
    attachment: <path d="m8 12 7-7a4 4 0 0 1 6 6l-9 9a6 6 0 0 1-8-8l9-9M7 15l9-9a2 2 0 0 1 3 3l-9 9a3 3 0 0 1-4-4" />,
    folder: <path d="M3 6h7l2 2h9v12H3V6Z" />,
    file: <><path d="M5 3h9l5 5v13H5V3Z" /><path d="M14 3v6h5M8 13h8M8 17h5" /></>,
    command: <><path d="M9 7h6v10H9V7Z" /><path d="M9 7H6a3 3 0 1 1 3-3v16a3 3 0 1 1-3-3h12a3 3 0 1 1-3 3V4a3 3 0 1 1 3 3H9" /></>,
    settings: <><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" /><path d="m9 3-1 3-3 1-2 3 2 2-1 3 2 3 3-1 2 3h3l1-3 3-1 2-3-2-2 1-3-2-3-3 1-2-3Z" /></>,
    mic: <><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M9 22h6" /></>,
    volume: <><path d="m11 4-6 5H2v6h3l6 5V4ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" /></>,
    copy: <><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V3H3v13h5" /></>,
    search: <><circle cx="10" cy="10" r="7" /><path d="m15 15 6 6" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1" /></>,
    moon: <path d="M20 14A9 9 0 0 1 10 3a9 9 0 1 0 10 11Z" />,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></>,
    trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></>,
    down: <path d="m6 9 6 6 6-6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <><path d="m5 12 7-7 7 7M12 5v14" /></>,
    chat: <path d="M20 11.5a8 8 0 0 1-8 8H5l-3 2 1.5-5A8 8 0 1 1 20 11.5Z" />,
    terminal: <><path d="m5 6 5 6-5 6M13 18h6" /></>,
    logout: <><path d="M9 4H4v16h5M14 8l4 4-4 4M9 12h9" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3" /></>,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
    check: <path d="m5 12 4 4L19 6" />,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8 12 3 3 5-6" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name] || paths.chat}</svg>;
}

function Brand({ compact = false }) {
  return <div className={`brand ${compact ? 'compact' : ''}`}><img className="luck-logo" src="/luck-shepherd.svg" alt="Luck, pastor-alemão" /><div><strong>luck<span>.</span></strong>{!compact && <small>SEU ESPAÇO DE TRABALHO</small>}</div></div>;
}

async function request(path, { csrf, body, ...options } = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...options.headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(typeof data.error === 'string' ? data.error : data.error?.message || data.message || 'Não foi possível concluir a solicitação.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (pending) return;
    setPending(true); setError('');
    try { onLogin(await request('/auth/login', { method: 'POST', body: { username, password } })); }
    catch (err) { setError(err.message); }
    finally { setPending(false); }
  }
  return <main className="login-page">
    <section className="login-intro">
      <Brand />
      <div className="intro-copy"><span className="eyebrow"><span className="status-dot" /> DO SEU JEITO. NO SEU SERVIDOR.</span><h1>Uma conversa.<br />Muitas possibilidades<span>.</span></h1><p>Suas ideias, seus projetos e o Codex.<br />Um espaço para fazer as coisas acontecerem.</p><div className="intro-terminal"><div className="terminal-top"><i /><i /><i /><span>seu espaço de trabalho</span></div><div><span className="prompt">❯</span> O que vamos construir hoje?<span className="cursor" /></div></div></div>
      <footer>LUCK ADMIN <span>01 / CONECTAR</span></footer>
    </section>
    <section className="login-form-wrap"><div className="login-card"><span className="login-icon"><Icon name="lock" size={24} /></span><span className="eyebrow">BEM-VINDO DE VOLTA</span><h2>Seu próximo passo<br /> começa aqui.</h2><p>Entre na sua conta para abrir o workspace.</p>
      <form onSubmit={submit}><label htmlFor="username">Usuário</label><input id="username" autoComplete="username" autoFocus value={username} onChange={e => setUsername(e.target.value)} placeholder="Seu usuário" required maxLength={100} />
        <label htmlFor="password">Senha</label><div className="password-input"><input id="password" type={visible ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Sua senha" required /><button type="button" className="icon-button" aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setVisible(!visible)}><Icon name="eye" size={18} /></button></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary login-submit" disabled={pending}>{pending ? <><span className="spinner" /> Preparando seu ambiente…</> : <>Acessar meu workspace <span>↗</span></>}</button>
      </form><div className="private-note"><Icon name="shield" size={15} /><span>Acesso privado. Suas credenciais ficam no servidor.</span></div>
    </div></section>
  </main>;
}

const formatDate = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }); };
const formatTime = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };

function Approval({ approval, onDecide, disabled }) {
  const p = approval.params || {};
  return <article className="approval-card"><div className="approval-heading"><Icon name="shield" /><strong>O Codex precisa da sua aprovação</strong></div><p>{p.reason || (approval.method.includes('fileChange') ? 'Autorizar as alterações de arquivos solicitadas?' : 'Autorizar a execução desta ação?')}</p>{p.command && <pre>{typeof p.command === 'string' ? p.command : JSON.stringify(p.command, null, 2)}</pre>}{p.cwd && <small>Diretório: {p.cwd}</small>}{p.grantRoot && <small>Diretório solicitado: {p.grantRoot}</small>}<div className="approval-actions"><button className="subtle-button" disabled={disabled} onClick={() => onDecide(approval.id, 'decline')}>Recusar</button><button className="primary" disabled={disabled} onClick={() => onDecide(approval.id, 'accept')}><Icon name="check" size={16} /> Aprovar</button></div></article>;
}

function SshConnect({ csrf, occupied, onConnected, onUnauthorized, initialTarget, onCancel }) {
  const [host, setHost] = useState(initialTarget?.host || '');
  const [port, setPort] = useState(String(initialTarget?.port || 22));
  const [username, setUsername] = useState(initialTarget?.username || 'root');
  const [workspace, setWorkspace] = useState(initialTarget?.workspace || '/root/codex');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [fingerprint, setFingerprint] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const attempt = useRef(0);
  useEffect(() => () => { attempt.current += 1; }, []);
  function changeTarget(setter, value) {
    attempt.current += 1;
    setter(value); setFingerprint(''); setConfirmed(false); setPassword(''); setError('');
  }
  async function probe(event) {
    event.preventDefault();
    if (pending || occupied) return;
    const currentAttempt = ++attempt.current;
    setPending(true); setError(''); setFingerprint(''); setConfirmed(false); setPassword('');
    try {
      const data = await request('/connection/probe', { method: 'POST', csrf, body: { host: host.trim(), port: Number(port) } });
      if (attempt.current === currentAttempt) setFingerprint(data.fingerprint);
    } catch (err) {
      if (attempt.current === currentAttempt) { setError(err.message); if (err.status === 401) onUnauthorized(err); }
    } finally { if (attempt.current === currentAttempt) setPending(false); }
  }
  async function connect(event) {
    event.preventDefault();
    if (pending || occupied || !fingerprint || !confirmed || !password) return;
    const currentAttempt = ++attempt.current;
    setPending(true); setError('');
    const body = { host: host.trim(), port: Number(port), username: username.trim(), workspace: workspace.trim(), fingerprint, password, remember };
    // request() serializes the body immediately; the password is not stored by the UI.
    const result = request('/connection/connect', { method: 'POST', csrf, body });
    setPassword('');
    // A successful SSE update can unmount this form before the POST resolves.
    // The parent checks the login session before opening the new conversation.
    try { const data = await result; await onConnected(data.status, csrf); }
    catch (err) { if (attempt.current === currentAttempt) { setError(err.message); if (err.status === 401) onUnauthorized(err); } }
    finally { if (attempt.current === currentAttempt) { setPending(false); setPassword(''); } }
  }
  return <div className="ssh-connect-wrap"><section className="ssh-connect-card" aria-labelledby="ssh-title">
    <span className="ssh-card-icon"><Icon name="terminal" size={25} /></span><span className="eyebrow">SEU CODEX. NA SUA VPS.</span>
    <h2 id="ssh-title">Conectar à VPS</h2><p>Conecte uma vez. Depois, entre no Luck e encontre sua VPS pronta para continuar.</p>
    {occupied ? <div className="ssh-occupied" role="status">Esta VPS está em uso por outra sessão do painel. Desconecte naquela sessão para continuar aqui.</div> : <form onSubmit={fingerprint ? connect : probe}>
      <div className="ssh-target-grid"><div><label htmlFor="ssh-host">Endereço ou IP da VPS</label><input id="ssh-host" value={host} onChange={e => changeTarget(setHost, e.target.value)} placeholder="Ex.: 203.0.113.10" autoComplete="off" spellCheck={false} required maxLength={253} disabled={pending} /></div><div><label htmlFor="ssh-port">Porta SSH</label><input id="ssh-port" type="number" min="1" max="65535" value={port} onChange={e => changeTarget(setPort, e.target.value)} required disabled={pending} /></div></div>
      <div className="ssh-fields-grid"><div><label htmlFor="ssh-username">Usuário da VPS</label><input id="ssh-username" value={username} onChange={e => setUsername(e.target.value)} autoComplete="off" spellCheck={false} required maxLength={64} disabled={pending} /></div><div><label htmlFor="ssh-workspace">Pasta de trabalho</label><input id="ssh-workspace" value={workspace} onChange={e => setWorkspace(e.target.value)} placeholder="/var/www/meu-projeto" autoComplete="off" spellCheck={false} required maxLength={4096} disabled={pending} /></div></div>
      {fingerprint && <div className="ssh-fingerprint"><div><Icon name="shield" size={16} /><strong>Confira a identidade do servidor</strong></div><code>{fingerprint}</code><details><summary>Como conferir na minha VPS?</summary><p>No terminal em que você já acessa a VPS, execute o comando abaixo e compare a impressão digital SHA256 com a mostrada aqui.</p><pre>{'for f in /etc/ssh/ssh_host_*_key.pub; do ssh-keygen -lf "$f"; done'}</pre></details><label className="ssh-confirm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={pending} /><span>Conferi a impressão digital com a minha VPS</span></label></div>}
      {fingerprint && confirmed && <div className="ssh-password-field"><label htmlFor="ssh-password">Senha da VPS</label><input id="ssh-password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="off" required disabled={pending} maxLength={1024} /><small>{remember ? 'A senha será criptografada no servidor para reconectar após seu login.' : 'A senha será usada apenas nesta conexão.'}</small></div>}
      <label className="remember-vps"><input type="checkbox" checked={remember} disabled={pending} onChange={e => setRemember(e.target.checked)} /><span><strong>Lembrar esta VPS</strong><small>Conectar automaticamente quando eu entrar no Luck.</small></span><Icon name="lock" size={17} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="ssh-submit-row">{onCancel && <button type="button" className="subtle-button" onClick={onCancel} disabled={pending}>Voltar</button>}{fingerprint && <button className="subtle-button" type="button" onClick={probe} disabled={pending}>Verificar novamente</button>}<button className="primary" disabled={pending || Boolean(fingerprint && (!confirmed || !password))}>{pending ? <><span className="spinner" /> {fingerprint ? 'Conectando…' : 'Verificando…'}</> : fingerprint ? <>Conectar à VPS <span>↗</span></> : <>Verificar servidor <span>↗</span></>}</button></div>
    </form>}
    <p className="ssh-footnote">O Codex precisa estar instalado e autenticado no usuário SSH informado. Os limites dessa conta continuam valendo.</p>
  </section></div>;
}

const defaultPreferences = { theme: 'dark', fontSize: 'normal', autoRead: false, rate: 1, voiceURI: '', showTools: false };
function loadPreferences() {
  try { const saved = JSON.parse(localStorage.getItem('jarvis.preferences.v2') || '{}'); return { ...defaultPreferences, ...saved, theme: ['dark', 'light'].includes(saved.theme) ? saved.theme : 'dark' }; }
  catch { return defaultPreferences; }
}
const permissionTitle = p => p?.sandbox === 'danger-full-access' ? 'Acesso total' : p?.sandbox === 'read-only' ? 'Somente leitura' : 'Editar no workspace';

function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog?.focus();
    const key = event => {
      if (event.key === 'Escape') close.current();
      if (event.key !== 'Tab') return;
      const nodes = [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]')];
      const first = nodes[0], last = nodes.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><section ref={ref} tabIndex={-1} className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><h2 id="modal-title">{title}</h2><button className="icon-button" aria-label="Fechar janela" onClick={onClose}><Icon name="close" /></button></header>{children}</section></div>;
}

function Settings({ preferences, setPreferences, permissions, allowed, conversation, busy, onSave, onDelete, onClose, voice }) {
  const [tab, setTab] = useState('chat');
  const [title, setTitle] = useState(conversation?.title || '');
  const [access, setAccess] = useState(permissions);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState('');
  const pref = (key, value) => setPreferences(p => ({ ...p, [key]: value }));
  async function save(event) {
    event.preventDefault(); setPending(true); setProblem('');
    try { await onSave({ title: title.trim(), permissions: access }); onClose(); }
    catch (err) { setProblem(err.message); }
    finally { setPending(false); }
  }
  return <Modal title="Configurações" onClose={onClose} wide><div className="settings-tabs" role="tablist" aria-label="Configurações">{[['chat', 'Conversa', 'chat'], ['appearance', 'Aparência', 'sun'], ['voice', 'Voz e áudio', 'volume']].map(([id, label, icon]) => <button key={id} role="tab" id={`tab-${id}`} aria-controls="settings-panel" aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} onKeyDown={e => { const tabs = ['chat', 'appearance', 'voice']; let next; if (e.key === 'ArrowRight') next = tabs[(tabs.indexOf(tab) + 1) % 3]; if (e.key === 'ArrowLeft') next = tabs[(tabs.indexOf(tab) + 2) % 3]; if (e.key === 'Home') next = tabs[0]; if (e.key === 'End') next = tabs[2]; if (next) { e.preventDefault(); setTab(next); e.currentTarget.parentElement.querySelector(`#tab-${next}`)?.focus(); } }} onClick={() => setTab(id)}><Icon name={icon} size={17} />{label}</button>)}</div><div id="settings-panel" className="settings-content" role="tabpanel" aria-labelledby={`tab-${tab}`}>
    {tab === 'chat' && <form onSubmit={save}><p className="section-description">Defina como o Luck pode trabalhar nesta conversa.</p>{conversation && <label className="field-label">Nome da conversa<input value={title} maxLength={100} required onChange={e => setTitle(e.target.value)} disabled={busy || pending} /></label>}<fieldset disabled={busy || pending}><legend>Modo de acesso</legend><label className={`permission-option ${access.sandbox === 'read-only' ? 'chosen' : ''}`}><input type="radio" name="sandbox" value="read-only" checked={access.sandbox === 'read-only'} onChange={() => setAccess(p => ({ ...p, sandbox: 'read-only', approvalPolicy: p.approvalPolicy === 'never' ? 'on-request' : p.approvalPolicy }))} /><span><strong>Somente leitura</strong><small>Consultar arquivos e investigar sem autorizar edições pelo sandbox.</small></span><Icon name="eye" size={20} /></label><label className={`permission-option ${access.sandbox === 'workspace-write' ? 'chosen' : ''}`}><input type="radio" name="sandbox" value="workspace-write" checked={access.sandbox === 'workspace-write'} disabled={!allowed.sandbox.includes('workspace-write')} onChange={() => setAccess(p => ({ ...p, sandbox: 'workspace-write', approvalPolicy: p.approvalPolicy === 'never' ? 'on-request' : p.approvalPolicy }))} /><span><strong>Editar no workspace</strong><small>Permitir alterações na pasta de trabalho dentro dos limites do servidor.</small></span><Icon name="terminal" size={20} /></label>{allowed.sandbox.includes('danger-full-access') && <label className={`permission-option full-access-option ${access.sandbox === 'danger-full-access' ? 'chosen' : ''}`}><input type="radio" name="sandbox" value="danger-full-access" checked={access.sandbox === 'danger-full-access'} onChange={() => setAccess({ sandbox: 'danger-full-access', approvalPolicy: 'never' })} /><span><strong>Acesso total <span className="full-access-tag">FULL ACCESS</span></strong><small>Executar comandos, alterar arquivos fora do workspace e acessar a rede com as permissões do usuário SSH, sem pedir aprovações.</small></span><Icon name="shield" size={21} /></label>}<label className="field-label">Aprovação de ações<select disabled={access.sandbox === 'danger-full-access'} value={access.approvalPolicy} onChange={e => setAccess(p => ({ ...p, approvalPolicy: e.target.value }))}>{access.sandbox === 'danger-full-access' ? <option value="never">Sem solicitações · acesso total</option> : <><option value="untrusted">Cauteloso · aprovar comandos não confiáveis</option><option value="on-request">Sob demanda · Luck solicita quando necessário</option></>}</select></label><p className="setting-note"><Icon name="shield" size={15} />{access.sandbox === 'danger-full-access' ? 'Acesso total remove as restrições de arquivos e rede do sandbox do Codex. Ações seguem as permissões do usuário da VPS e não param para aprovação.' : 'As permissões são aplicadas às próximas mensagens. O acesso continua limitado pelo servidor e pelo sandbox do Codex.'}</p></fieldset>{busy && <p className="setting-note">Aguarde a tarefa terminar para alterar esta conversa.</p>}{problem && <p className="form-error" role="alert">{problem}</p>}<div className="settings-footer">{conversation && <button type="button" className="danger-link" onClick={onDelete} disabled={busy || pending}><Icon name="trash" size={16} /> Excluir conversa</button>}<button className="primary" disabled={busy || pending || Boolean(conversation && !title.trim())}>{pending ? 'Salvando…' : 'Salvar configurações'}</button></div></form>}
    {tab === 'appearance' && <><p className="section-description">Um espaço de trabalho do seu jeito.</p><div className="field-label">Tema<div className="theme-options">{[['dark', 'Escuro', 'moon'], ['light', 'Claro', 'sun']].map(([value, label, icon]) => <button key={value} className={preferences.theme === value ? 'chosen' : ''} aria-pressed={preferences.theme === value} onClick={() => pref('theme', value)}><Icon name={icon} />{label}<span className={`theme-preview ${value}`} /></button>)}</div></div><label className="field-label">Tamanho do texto<select value={preferences.fontSize} onChange={e => pref('fontSize', e.target.value)}><option value="normal">Padrão</option><option value="large">Grande</option><option value="larger">Muito grande</option></select></label><label className="toggle-row"><span><strong>Detalhes de execução expandidos</strong><small>Mostrar os resultados dos comandos automaticamente.</small></span><input type="checkbox" checked={preferences.showTools} onChange={e => pref('showTools', e.target.checked)} /></label><p className="setting-note">As preferências de aparência são salvas neste navegador.</p></>}
    {tab === 'voice' && <><p className="section-description">Dite mensagens e ouça as respostas do Luck.</p><div className="voice-support"><span className={voice.supportedRecognition ? 'available' : ''}><Icon name="mic" size={17} /> Ditado {voice.supportedRecognition ? 'disponível' : 'indisponível neste navegador'}</span><span className={voice.supportedSpeech ? 'available' : ''}><Icon name="volume" size={17} /> Leitura {voice.supportedSpeech ? 'disponível' : 'indisponível neste navegador'}</span></div><label className="toggle-row"><span><strong>Ler respostas automaticamente</strong><small>Ouvir as novas respostas ao terminar a geração.</small></span><input type="checkbox" checked={preferences.autoRead} disabled={!voice.supportedSpeech} onChange={e => pref('autoRead', e.target.checked)} /></label><label className="field-label">Voz<select value={preferences.voiceURI} disabled={!voice.supportedSpeech} onChange={e => pref('voiceURI', e.target.value)}><option value="">Automática · português</option>{voice.voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}</select></label><label className="field-label">Velocidade · {Number(preferences.rate).toFixed(1)}×<input type="range" min="0.6" max="1.6" step="0.1" value={preferences.rate} onChange={e => pref('rate', Number(e.target.value))} /></label><button className="subtle-button" disabled={!voice.supportedSpeech} onClick={() => voice.speak('voice-preview', 'Olá! Eu sou o Luck. Vamos transformar suas ideias em realidade.', preferences)}><Icon name={voice.speakingId === 'voice-preview' ? 'stop' : 'volume'} size={16} />{voice.speakingId === 'voice-preview' ? 'Parar teste' : 'Testar voz'}</button><p className="setting-note">O microfone só é ativado ao tocar em Ditar. O reconhecimento depende do navegador, de HTTPS e da sua permissão; o áudio pode ser processado pelo serviço de voz do navegador. O texto ditado fica no campo para revisão antes do envio.</p></>}
  </div></Modal>;
}

function Message({ message, username, preferences, voice, onCopy, copied, conversationId, workspace }) {
  const isTool = message.role === 'tool';
  return <article className={`message message-${message.role}`}><div className={`message-avatar ${message.role === 'user' ? 'user-avatar' : ''}`}>{message.role === 'user' ? username.slice(0, 1).toUpperCase() : message.role === 'assistant' ? <img src="/luck-shepherd.svg" alt="" className="assistant-logo" /> : <Icon name={isTool ? 'terminal' : 'shield'} size={18} />}</div><div className="message-body"><div className="message-meta"><strong>{message.role === 'user' ? 'Você' : message.role === 'assistant' ? 'Luck' : isTool ? 'Execução' : 'Sistema'}</strong><time>{formatTime(message.createdAt)}</time></div>{isTool ? <details className="tool-details" open={preferences.showTools || undefined}><summary><Icon name="terminal" size={15} /><span>{message.text.split('\n')[0].slice(0, 120) || 'Detalhes da execução'}</span><Icon name="down" size={15} /></summary><pre className="tool-output">{message.text}</pre></details> : message.text ? (['assistant', 'user'].includes(message.role) ? <div className="message-text markdown"><MarkdownMessage conversationId={conversationId} workspace={workspace}>{message.text}</MarkdownMessage></div> : <div className="message-text plain-text">{message.text}</div>) : null}{message.attachments?.length > 0 && <AttachmentList attachments={message.attachments} />}{message.text && <div className="message-actions"><button title="Copiar mensagem" aria-label="Copiar mensagem" onClick={() => onCopy(message.text, message.id)}><Icon name={copied === message.id ? 'check' : 'copy'} size={15} />{copied === message.id && <span>Copiado</span>}</button>{message.role === 'assistant' && voice.supportedSpeech && <button title={voice.speakingId === message.id ? 'Parar leitura' : 'Ouvir resposta'} aria-label={voice.speakingId === message.id ? 'Parar leitura' : 'Ouvir resposta'} className={voice.speakingId === message.id ? 'is-speaking' : ''} onClick={() => voice.speak(message.id, plainText(message.text), preferences)}><Icon name={voice.speakingId === message.id ? 'stop' : 'volume'} size={16} />{voice.speakingId === message.id && <span>Ouvindo…</span>}</button>}</div>}</div></article>;
}

const fileSize = size => size < 1024 ? `${size} B` : size < 1048576 ? `${(size / 1024).toFixed(0)} KB` : `${(size / 1048576).toFixed(1)} MB`;
function AttachmentList({ attachments, onRemove }) {
  return <div className="attachment-list">{attachments.map((item, index) => {
    const name = item.name || item.file?.name || 'Arquivo';
    const image = item.preview || (item.kind === 'image' ? item.url : null);
    const url = item.url?.startsWith('/api/attachments/') ? item.url : null;
    return <div className={`attachment-card ${image ? 'has-image' : ''}`} key={item.key || item.id || index}>{image ? <a href={url || image} target="_blank" rel="noopener noreferrer" tabIndex={onRemove ? -1 : 0}><img src={image} alt={name} /></a> : <span className="attachment-file-icon"><Icon name="file" size={23} /></span>}<div className="attachment-info"><strong title={name}>{name}</strong><small>{fileSize(item.size ?? item.file?.size ?? 0)}{item.kind === 'archive' ? ' · Compactado' : ''}</small></div>{onRemove ? <button type="button" className="icon-button" aria-label={`Remover ${name}`} onClick={() => onRemove(index)}><Icon name="close" size={15} /></button> : url && <a className="attachment-download" href={`${url}?download=1`} title={`Baixar ${name}`} aria-label={`Baixar ${name}`}><Icon name="download" size={17} /></a>}</div>;
  })}</div>;
}
const fallbackCommands = [
  ['new','Nova conversa','Começar uma conversa com o Luck'], ['status','Status','Ver ambiente e permissões atuais'], ['permissions','Permissões','Configurar acesso e aprovações'], ['model','Modelo e desempenho','Escolher modelo, esforço e velocidade do Codex'], ['effort','Esforço de raciocínio','Escolher do modo Baixo ao Ultra, conforme o modelo'], ['fast','Velocidade de resposta','Alterar a velocidade normal ou acelerada'], ['delete','Excluir conversa','Remover esta conversa do histórico após confirmar'], ['skills','Skills','Consultar as habilidades da sua instalação'], ['mcp','Extensões e MCP','Ver as integrações conectadas'], ['compact','Compactar contexto','Resumir o contexto da conversa no Codex'], ['plan','Planejar','Preparar uma instrução de planejamento'], ['review','Revisar código','Preparar uma revisão do projeto'], ['init','Instruções do projeto','Preparar um AGENTS.md para o projeto'], ['terminal','Terminal manual','Abrir o terminal SSH do admin'], ['files','Arquivos','Explorar e baixar arquivos do workspace'], ['attach','Anexar arquivos','Imagens, PDF, ZIP e outros documentos'], ['export','Exportar conversa','Baixar o histórico em Markdown'], ['clear','Limpar rascunho','Remover texto e anexos do rascunho'], ['help','Comandos','Ver os comandos desta versão']
].map(([name,label,description]) => ({name,label,description,action:name,source:'Luck'}));

function AdminInfo({ kind, capabilities, loading, status, conversation, permissions, onClose, onSkill, onCommand }) {
  const title = { skills: 'Skills disponíveis', mcp: 'Extensões e MCP', status: 'Status do workspace', help: 'Comandos do Luck' }[kind] || 'Luck';
  return <Modal title={title} onClose={onClose} wide><div className="admin-info">{loading && <p className="admin-info-loading"><span className="spinner" />Consultando sua instalação…</p>}{kind === 'status' && <dl className="status-grid"><dt>Versão</dt><dd>Luck Admin · v5</dd><dt>Conexão</dt><dd>{status?.connected ? 'Conectado' : 'Aguardando conexão'}</dd><dt>Ambiente</dt><dd>{status?.mode === 'ssh' ? 'Codex via SSH' : status?.mode === 'mock' ? 'Demonstração' : 'Codex local'}</dd><dt>Pasta</dt><dd>{status?.workspace || 'Não conectada'}</dd><dt>Modelo</dt><dd>{conversation?.model || 'Padrão do Codex'}</dd><dt>Esforço</dt><dd>{effortLabel(conversation?.reasoningEffort)}</dd><dt>Velocidade</dt><dd>{speedLabel(conversation?.serviceTier)}</dd><dt>Permissões</dt><dd>{permissionTitle(permissions)}</dd><dt>Aprovação</dt><dd>{permissions.approvalPolicy === 'never' ? 'Sem solicitações de aprovação' : permissions.approvalPolicy === 'untrusted' ? 'Cauteloso' : 'Sob demanda'}</dd></dl>}
    {kind === 'skills' && <><p className="section-description">Habilidades instaladas no seu Codex. Escolha uma para incluir no próximo pedido.</p>{capabilities?.skills?.map((skill,index) => <button key={`${skill.name}-${index}`} className="skill-option" onClick={() => onSkill(skill)}><span className="skill-symbol">$</span><span><strong>{skill.name}</strong><small>{skill.description}</small></span><span>↗</span></button>)}{!loading && !capabilities?.skills?.length && <p className="empty-panel">Nenhuma skill disponível neste ambiente.</p>}</>}
    {kind === 'mcp' && <><p className="section-description">Integrações configuradas no Codex da sua VPS. Esta tela consulta as conexões existentes.</p>{capabilities?.mcp?.map((server,index) => <article key={server.name || index} className="integration-card"><Icon name="command" size={21} /><div><strong>{server.name}</strong><small>{server.status || server.authStatus || 'Configurado'} · {server.toolCount ?? 0} ferramentas</small></div></article>)}{!loading && !capabilities?.mcp?.length && <p className="empty-panel">Nenhuma integração MCP encontrada. As extensões podem ser configuradas na instalação do Codex da VPS.</p>}</>}
    {kind === 'help' && <><p className="section-description">Digite / no campo de mensagem. Use ↑ ↓ para navegar, Enter para escolher e Esc para fechar.</p><div className="help-command-list">{(capabilities?.commands || fallbackCommands).map(command => <button key={command.name} onClick={() => { onClose(); onCommand(command); }}><code>/{command.name}</code><span>{command.description}</span></button>)}</div><p className="setting-note">O menu reúne ações do painel e recursos compatíveis com o Codex conectado. Comandos exclusivos de outros aplicativos não são executados como comandos de terminal.</p></>}
    {capabilities?.warnings?.length > 0 && <p className="setting-note">{capabilities.warnings.join(' ')}</p>}
  </div></Modal>;
}

function SavedVps({ profile, connected = false, occupied = false, pending = false, forgetting = false, error, onReconnect, onForget, onEdit }) {
  return <section className="saved-vps-card" aria-label="VPS salva"><div className="saved-vps-heading"><span className="saved-vps-icon"><Icon name="terminal" size={27} /></span><span className="saved-vps-badge"><Icon name="lock" size={12} /> CONEXÃO SALVA</span></div><h2>{connected ? 'Sua VPS está pronta.' : pending ? 'Preparando sua VPS…' : 'Sua VPS está aqui.'}</h2><p>Entre no Luck e retome seu ambiente. A conexão é restaurada automaticamente após o login.</p>{profile ? <dl className="saved-vps-details"><dt>Servidor</dt><dd>{profile.username}@{profile.host}<small>Porta {profile.port}</small></dd><dt>Pasta</dt><dd>{profile.workspace}</dd><dt>Autenticação</dt><dd><Icon name="shield" size={13} />Credenciais criptografadas no servidor</dd></dl> : <p className="setting-note">Nenhuma conexão salva disponível. Conecte sua VPS para configurar.</p>}{occupied && <p className="setting-note">A VPS está conectada em outra sessão. Desconecte naquela sessão para continuar aqui.</p>}{error && <p className="form-error" role="alert">{error}</p>}<div className="saved-vps-actions">{!connected && profile && <button className="primary" onClick={onReconnect} disabled={pending || occupied || forgetting}>{pending ? <><span className="spinner" /> Conectando…</> : <>Conectar agora <span>↗</span></>}</button>}<button className="subtle-button" onClick={onEdit} disabled={pending || forgetting}>{profile ? 'Alterar conexão' : 'Configurar VPS'}</button>{(profile || error) && <button className="danger-link" onClick={onForget} disabled={pending || forgetting}><Icon name="trash" size={14} />{forgetting ? 'Esquecendo…' : 'Esquecer VPS'}</button>}</div><p className="saved-vps-footnote"><Icon name="lock" size={13} />A senha não fica no navegador e não é exibida pelo painel.</p></section>;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [approvals, setApprovals] = useState([]);
  const [status, setStatus] = useState(null);
  const [connection, setConnection] = useState('connecting');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [reconnectingVps, setReconnectingVps] = useState(false);
  const [forgettingVps, setForgettingVps] = useState(false);
  const [editingVps, setEditingVps] = useState(false);
  const [savedVpsDialog, setSavedVpsDialog] = useState(false);
  const [preferences, setPreferences] = useState(loadPreferences);
  const [newPermissions, setNewPermissions] = useState(null);
  const [settings, setSettings] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(null);
  const [deleteProblem, setDeleteProblem] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(null);
  const [showJump, setShowJump] = useState(false);
  const [queuedFiles, setQueuedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [capabilities, setCapabilities] = useState(null);
  const [capabilitiesLoading, setCapabilitiesLoading] = useState(false);
  const [info, setInfo] = useState(null);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [modelPending, setModelPending] = useState(false);
  const [newModel, setNewModel] = useState(null);
  const [newReasoningEffort, setNewReasoningEffort] = useState(null);
  const [newServiceTier, setNewServiceTier] = useState(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const fileInputRef = useRef(null);
  const queuedRef = useRef([]);
  const uploadAbort = useRef(null);
  const dragCount = useRef(0);
  const voice = useVoice();
  const sessionRef = useRef(session); sessionRef.current = session;
  const selectedRef = useRef(null);
  const lock = useRef(false);
  const endRef = useRef(null);
  const scrollRef = useRef(null);
  const nearBottomRef = useRef(true);
  const composerRef = useRef(null);
  const searchRef = useRef(null);
  const copyTimer = useRef(null);
  const autoRead = useRef({ id: null, wasBusy: false });
  const commandCatalog = capabilities?.commands?.length ? capabilities.commands : fallbackCommands;
  const slashMatch = !slashDismissed && /^\/([^\s]*)$/.exec(draft);
  const slashCommands = slashMatch ? commandCatalog.filter(c => `${c.name} ${c.label} ${c.description}`.toLocaleLowerCase('pt-BR').includes(slashMatch[1].toLocaleLowerCase('pt-BR'))) : [];
  const permissionDefaults = status?.permissions?.defaults || { sandbox: status?.sandbox || 'workspace-write', approvalPolicy: 'untrusted' };
  const permissions = conversation?.permissions || newPermissions || permissionDefaults;
  const allowed = status?.permissions?.allowed || { sandbox: ['read-only', 'workspace-write'], approvalPolicy: ['untrusted', 'on-request'] };
  const modeSelection = conversation || { model: newModel, reasoningEffort: newReasoningEffort, serviceTier: newServiceTier };
  const currentModel = selectedModel(capabilities, modeSelection.model);
  const newConversationSettings = () => ({ permissions: newPermissions || permissionDefaults, model: newModel, reasoningEffort: newReasoningEffort, serviceTier: newServiceTier });
  useEffect(() => { document.documentElement.dataset.theme = preferences.theme; try { localStorage.setItem('jarvis.preferences.v2', JSON.stringify(preferences)); } catch {} }, [preferences]);
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  useEffect(() => { setModelPending(false); }, [session?.csrfToken]);
  useEffect(() => { queuedRef.current = queuedFiles; }, [queuedFiles]);
  useEffect(() => () => { uploadAbort.current?.abort(); queuedRef.current.forEach(item => { if (item.preview) URL.revokeObjectURL(item.preview); }); }, []);
  useEffect(() => { setSlashIndex(0); setSlashDismissed(false); }, [draft]);
  function clearAttachments() { queuedRef.current.forEach(item => { if (item.preview) URL.revokeObjectURL(item.preview); }); queuedRef.current = []; setQueuedFiles([]); }

  const choose = useCallback((id, { keepDraft = false } = {}) => { if (id !== null && selectedRef.current === id) { setSidebar(false); return; } voice.stopListening({ cancel: true }); voice.stopSpeaking(); if (!keepDraft) clearAttachments(); setInfo(null); setFilesOpen(false); selectedRef.current = id; nearBottomRef.current = true; setShowJump(false); setSelected(id); setConversation(null); setApprovals([]); if (!keepDraft) setDraft(''); setSidebar(false); setError(''); }, [voice.stopListening, voice.stopSpeaking]);
  const showError = useCallback(err => { if (err.status === 401) { setSession(null); setConversations([]); setStatus(null); setSettings(false); setDeleteDialog(null); setNewModel(null); setNewReasoningEffort(null); setNewServiceTier(null); setSavedVpsDialog(false); setEditingVps(false); setTerminalOpen(false); setCapabilities(null); uploadAbort.current?.abort(); choose(null); } else setError(err.message); }, [choose]);

  useEffect(() => { let alive = true; request('/auth/me').then(data => { if (alive) setSession(data); }).catch(err => { if (alive && err.status !== 401) setError(err.message); }).finally(() => { if (alive) setChecking(false); }); return () => { alive = false; }; }, []);
  const refresh = useCallback(async () => {
    const id = selectedRef.current, token = sessionRef.current?.csrfToken;
    const [list, detail, environment] = await Promise.all([request('/conversations'), id ? request(`/conversations/${id}`).catch(err => { if (err.status === 404) return { removed: true }; throw err; }) : Promise.resolve(null), request('/status')]);
    if (token !== sessionRef.current?.csrfToken) return;
    setConversations(list.conversations || []); setStatus(environment);
    if (id === selectedRef.current && detail) { if (detail.removed) { choose(null); setSettings(false); setDeleteDialog(target => target?.id === id ? null : target); } else { setConversation(detail.conversation); setApprovals(detail.approvals || []); } }
  }, [choose]);
  useEffect(() => {
    if (!session) return;
    let alive = true, timer, inFlight = false, queued = false;
    const sync = async () => { if (inFlight) { queued = true; return; } inFlight = true; try { await refresh(); } catch (err) { if (alive) showError(err); } finally { inFlight = false; if (queued && alive) { queued = false; schedule(); } } };
    const schedule = () => { if (!timer) timer = setTimeout(() => { timer = null; if (alive) sync(); }, 200); };
    sync();
    const events = new EventSource('/api/events', { withCredentials: true });
    events.onopen = () => { if (alive) { setConnection('connected'); schedule(); } };
    events.onerror = () => { if (alive) setConnection('reconnecting'); };
    events.addEventListener('update', schedule); events.addEventListener('status', schedule);
    return () => { alive = false; clearTimeout(timer); events.close(); };
  }, [session, refresh, showError]);
  useEffect(() => { if (session && selected) refresh().catch(showError); }, [selected, session, refresh, showError]);
  useEffect(() => { if (nearBottomRef.current) endRef.current?.scrollIntoView({ behavior: conversation?.busy ? 'instant' : 'smooth', block: 'end' }); }, [conversation?.messages, approvals.length]);
  useEffect(() => {
    const el = composerRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 200)}px`; }
  }, [draft, selected]);
  useEffect(() => { voice.stopSpeaking(); voice.stopListening({ cancel: true }); autoRead.current = { id: selected, wasBusy: false, before: null }; }, [selected, session?.csrfToken]);
  useEffect(() => {
    if (!conversation || conversation.id !== selected) return;
    const previous = autoRead.current;
    const last = [...conversation.messages].reverse().find(m => m.role === 'assistant');
    const signature = last ? `${last.id}:${last.text}` : null;
    const before = conversation.busy && !previous.wasBusy ? previous.last : previous.before;
    if (previous.id === selected && previous.wasBusy && !conversation.busy && preferences.autoRead && last && signature !== before) {
      voice.speak(last.id, plainText(last.text), preferences);
    }
    autoRead.current = { id: selected, wasBusy: conversation.busy, before, last: signature };
  }, [conversation, selected, preferences.autoRead]);
  useEffect(() => {
    const key = e => {
      if (!session) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSidebar(true); setTimeout(() => searchRef.current?.focus(), 50); }
      if (e.key === 'Escape' && !settings && !deleteDialog && !info && !terminalOpen && !filesOpen && !savedVpsDialog) { setSidebar(false); voice.stopListening(); voice.stopSpeaking(); }
    };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, [session, settings, deleteDialog, info, terminalOpen, filesOpen, savedVpsDialog]);
  const mutation = (path, body, method = 'POST') => request(path, { method, csrf: session.csrfToken, body });
  async function newConversation() {
    if (lock.current) return;
    voice.stopListening({ cancel: true }); voice.stopSpeaking(); lock.current = true; setError('');
    try { const data = await mutation('/conversations', newConversationSettings()); choose(data.conversation.id); setConversation(data.conversation); await refresh(); composerRef.current?.focus(); }
    catch (err) { showError(err); } finally { lock.current = false; }
  }
  async function send(event) {
    event?.preventDefault();
    const text = draft.trim();
    const commandMatch = /^\/([\w-]+)(?:\s+([\s\S]*))?$/.exec(text);
    const command = commandMatch && commandCatalog.find(c => c.name === commandMatch[1]);
    if (command && !queuedFiles.length) { await runCommand(command, commandMatch[2] || ''); return; }
    if ((!text && !queuedFiles.length) || lock.current || conversation?.busy || (status?.mode === 'ssh' && !status.connected) || (selected !== null && !conversation)) return;
    voice.stopListening({ cancel: true }); voice.stopSpeaking(); lock.current = true; setSending(true); setError(''); nearBottomRef.current = true;
    const token = sessionRef.current?.csrfToken;
    let id = selectedRef.current;
    const files = [...queuedFiles];
    let accepted = false;
    try {
      let uploaded = [];
      if (files.length) {
        setUploading(true);
        const form = new FormData(); files.forEach(item => form.append('files', item.file));
        const controller = new AbortController(); uploadAbort.current = controller;
        const response = await fetch('/api/attachments', { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': token }, body: form, signal: controller.signal });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw Object.assign(new Error(result.error || 'Não foi possível enviar os anexos.'), { status: response.status });
        uploaded = result.attachments || [];
        setUploading(false);
      }
      if (token !== sessionRef.current?.csrfToken) return;
      if (!id) { const data = await mutation('/conversations', newConversationSettings()); id = data.conversation.id; choose(id, { keepDraft: true }); setConversation(data.conversation); }
      await mutation(`/conversations/${id}/messages`, { text, attachmentIds: uploaded.map(item => item.id) }); accepted = true; if (id === selectedRef.current && token === sessionRef.current?.csrfToken) { setDraft(''); clearAttachments(); } await refresh();
    } catch (err) { if (id === selectedRef.current && token === sessionRef.current?.csrfToken) { if (!accepted) { setDraft(text); setQueuedFiles(files); queuedRef.current = files; } showError(err); } }
    finally { uploadAbort.current = null; setUploading(false); lock.current = false; setSending(false); if (id === selectedRef.current && token === sessionRef.current?.csrfToken) composerRef.current?.focus(); }
  }
  async function interrupt() { try { await mutation(`/conversations/${selectedRef.current}/interrupt`, {}); await refresh(); } catch (err) { showError(err); } }
  async function decide(id, decision) { setDeciding(true); try { await mutation(`/approvals/${encodeURIComponent(id)}`, { decision }); await refresh(); } catch (err) { showError(err); } finally { setDeciding(false); } }
  async function logout() { try { await mutation('/auth/logout', {}); setSession(null); choose(null); setConversations([]); setStatus(null); setSettings(false); setDeleteDialog(null); setNewModel(null); setNewReasoningEffort(null); setNewServiceTier(null); setSavedVpsDialog(false); setEditingVps(false); setTerminalOpen(false); setCapabilities(null); uploadAbort.current?.abort(); } catch (err) { showError(err); } }
  async function sshConnected(environment, csrfToken) {
    if (sessionRef.current?.csrfToken !== csrfToken) return;
    setStatus(environment); setEditingVps(false); choose(null);
    const data = await mutation('/conversations', newConversationSettings());
    choose(data.conversation.id); setConversation(data.conversation); await refresh(); if (environment.credentialSaveError) setError(environment.credentialSaveError); composerRef.current?.focus();
  }
  async function sshDisconnect() {
    if (disconnecting) return; setDisconnecting(true); setError('');
    try { await mutation('/connection/disconnect', {}); setTerminalOpen(false); setCapabilities(null); setNewModel(null); setNewReasoningEffort(null); setNewServiceTier(null); clearAttachments(); await refresh(); } catch (err) { showError(err); } finally { setDisconnecting(false); }
  }
  async function reconnectVps() {
    if (reconnectingVps || status?.reconnecting) return;
    const token = sessionRef.current?.csrfToken;
    setReconnectingVps(true); setError('');
    try { const result = await mutation('/connection/reconnect', {}); if (token !== sessionRef.current?.csrfToken) return; setStatus(result.status); setEditingVps(false); setSavedVpsDialog(false); await refresh(); composerRef.current?.focus(); }
    catch (err) { if (token === sessionRef.current?.csrfToken) { showError(err); await refresh().catch(showError); } }
    finally { setReconnectingVps(false); }
  }
  async function forgetVps() {
    if (forgettingVps) return;
    setForgettingVps(true); setError('');
    try { await mutation('/connection/saved', undefined, 'DELETE'); await refresh(); setSavedVpsDialog(false); setEditingVps(false); }
    catch (err) { showError(err); }
    finally { setForgettingVps(false); }
  }
  async function editVps() {
    if (status?.connected) {
      if (conversation?.busy || status?.busy) { setError('Aguarde ou interrompa a tarefa antes de alterar a conexão.'); return; }
      try { await mutation('/connection/disconnect', {}); setTerminalOpen(false); setCapabilities(null); clearAttachments(); await refresh(); }
      catch (err) { showError(err); return; }
    }
    setSavedVpsDialog(false); setEditingVps(true);
  }
  async function saveSettings(body) {
    if (selectedRef.current) { try { await mutation(`/conversations/${selectedRef.current}`, body, 'PATCH'); await refresh(); } catch (err) { if (err.status === 401) showError(err); throw err; } }
    else setNewPermissions(body.permissions);
  }
  function requestDelete(item) {
    if (!item?.id || item.busy || sending || deleting) return;
    setDeleteProblem('');
    setDeleteDialog({ id: item.id, title: item.title || 'Nova conversa', csrfToken: sessionRef.current?.csrfToken });
    setInfo(null); setSidebar(false);
  }
  async function deleteConversation() {
    const target = deleteDialog;
    if (!target || deleting || target.csrfToken !== sessionRef.current?.csrfToken) return;
    setDeleting(true); setDeleteProblem('');
    try {
      await request(`/conversations/${target.id}`, { method: 'DELETE', csrf: target.csrfToken });
      if (target.csrfToken !== sessionRef.current?.csrfToken) return;
      if (selectedRef.current === target.id) { choose(null); setSettings(false); }
      setDeleteDialog(current => current?.id === target.id ? null : current);
      await refresh();
    } catch (err) {
      if (target.csrfToken === sessionRef.current?.csrfToken) {
        if (err.status === 401) showError(err);
        else setDeleteProblem(err.status === 404 ? 'Esta conversa já foi removida. Feche esta janela para atualizar o histórico.' : err.message);
      }
    } finally { setDeleting(false); }
  }
  async function copy(text, id) {
    try { await navigator.clipboard.writeText(text); setCopied(id); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(null), 2000); }
    catch { setError('Não foi possível copiar. Selecione o texto e copie pelo navegador.'); }
  }
  function exportConversation() {
    if (!conversation) return;
    const text = `# ${conversation.title}\n\n` + conversation.messages.map(m => `## ${m.role === 'user' ? 'Você' : m.role === 'assistant' ? 'Luck' : m.role === 'tool' ? 'Execução' : 'Sistema'}\n\n${m.text}`).join('\n\n---\n\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `luck-${conversation.id.slice(0, 8)}.md`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function formatDraft(before, after = before, placeholder = 'texto') {
    const el = composerRef.current; if (!el) return;
    const start = el.selectionStart, end = el.selectionEnd;
    const fragment = draft.slice(start, end) || placeholder;
    const next = draft.slice(0, start) + before + fragment + after + draft.slice(end);
    if (next.length > 16000) return;
    setDraft(next); requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + before.length, start + before.length + fragment.length); });
  }
  function dictate() {
    if (voice.listening) return voice.stopListening();
    voice.stopSpeaking();
    voice.startListening(text => { setDraft(previous => (previous + (previous && !/\s$/.test(previous) ? ' ' : '') + text).slice(0, 16000)); composerRef.current?.focus(); });
  }
  const loadCapabilities = useCallback(async () => {
    const token = sessionRef.current?.csrfToken;
    if (!token) return;
    setCapabilitiesLoading(true);
    try { const result = await request('/capabilities'); if (token === sessionRef.current?.csrfToken) setCapabilities(result); }
    catch (err) { if (token === sessionRef.current?.csrfToken) showError(err); }
    finally { if (token === sessionRef.current?.csrfToken) setCapabilitiesLoading(false); }
  }, [showError]);
  useEffect(() => { if (session) loadCapabilities(); }, [session?.csrfToken, status?.connected, loadCapabilities]);
  useEffect(() => { if (!session || (status?.mode === 'ssh' && !status.connected)) setTerminalOpen(false); }, [session, status?.connected, status?.mode]);
  function addFiles(fileList) {
    if (sending) return;
    if (status?.mode === 'ssh' && !status.connected) { setError('Conecte sua VPS antes de anexar arquivos.'); return; }
    const incoming = [...(fileList || [])];
    if (!incoming.length) return;
    const previous = queuedRef.current;
    if (incoming.length + previous.length > 8) { setError('Você pode anexar até 8 arquivos por mensagem.'); return; }
    if (incoming.some(file => file.size > 25 * 1024 * 1024)) { setError('Cada arquivo pode ter até 25 MB.'); return; }
    if (incoming.reduce((n,f) => n + f.size, previous.reduce((n,f) => n + f.file.size, 0)) > 60 * 1024 * 1024) { setError('Os anexos da mensagem podem somar até 60 MB.'); return; }
    const added = incoming.map(file => ({ key: crypto.randomUUID(), file, name: file.name, size: file.size, preview: ['image/png','image/jpeg','image/webp','image/gif'].includes(file.type) ? URL.createObjectURL(file) : null }));
    const next = [...previous, ...added]; queuedRef.current = next; setQueuedFiles(next); setError(''); composerRef.current?.focus();
  }
  function removeFile(index) {
    const item = queuedRef.current[index]; if (item?.preview) URL.revokeObjectURL(item.preview);
    const next = queuedRef.current.filter((_,i) => i !== index); queuedRef.current = next; setQueuedFiles(next);
  }
  async function openFiles() {
    if (lock.current) return;
    try {
      if (!selectedRef.current) {
        lock.current = true;
        const data = await mutation('/conversations', newConversationSettings());
        choose(data.conversation.id, { keepDraft: true }); setConversation(data.conversation); await refresh();
      }
      setFilesOpen(true); setSidebar(false);
    } catch (err) { showError(err); }
    finally { lock.current = false; }
  }
  function openPerformance() {
    if (sending || conversation?.busy || (selectedRef.current && !conversation)) return;
    setInfo('model'); setSidebar(false); loadCapabilities();
  }
  async function savePerformance(body) {
    if (modelPending || sending || conversation?.busy) return;
    const id = selectedRef.current, token = sessionRef.current?.csrfToken;
    setModelPending(true);
    try {
      if (id) await request(`/conversations/${id}`, { method: 'PATCH', csrf: token, body });
      if (token !== sessionRef.current?.csrfToken) return;
      if (id) await refresh();
      else { setNewModel(body.model); setNewReasoningEffort(body.reasoningEffort); setNewServiceTier(body.serviceTier); }
      if (id === selectedRef.current) setInfo(null);
    } catch (err) { if (token === sessionRef.current?.csrfToken && err.status === 401) showError(err); throw err; }
    finally { if (token === sessionRef.current?.csrfToken) setModelPending(false); }
  }
  async function runCommand(command, args = '') {
    setSlashDismissed(true); setSlashIndex(0); setDraft('');
    const name = command.name.replace(/^\//, '');
    if (name === 'new') return newConversation();
    if (name === 'permissions') { setSettings(true); return; }
    if (['model','effort','fast'].includes(name)) { openPerformance(); return; }
    if (name === 'delete') { if (conversation) requestDelete(conversation); else setError('Abra uma conversa para excluir.'); return; }
    if (name === 'terminal') { setTerminalOpen(true); setSidebar(false); return; }
    if (name === 'files') return openFiles();
    if (name === 'attach') { fileInputRef.current?.click(); return; }
    if (name === 'export') { if (conversation) exportConversation(); else setError('Abra uma conversa para exportar o histórico.'); return; }
    if (name === 'clear') { clearAttachments(); return; }
    if (['status','skills','mcp','help'].includes(name)) { setInfo(name); if (['skills','mcp'].includes(name)) loadCapabilities(); return; }
    if (name === 'compact') {
      if (!selectedRef.current) { setError('Inicie uma conversa antes de compactar o contexto.'); return; }
      try { await mutation(`/conversations/${selectedRef.current}/commands`, { command: 'compact' }); await refresh(); }
      catch (err) { showError(err); }
      return;
    }
    const prompts = { plan: 'Prepare um plano detalhado para a tarefa abaixo. Primeiro investigue o contexto e aguarde minha confirmação antes de implementar:\n\n', review: 'Faça uma revisão de código deste projeto. Priorize bugs e regressões, descreva os achados com arquivos e linhas e não altere arquivos sem minha solicitação.\n\n', init: 'Investigue este projeto e proponha ou atualize um arquivo AGENTS.md com instruções úteis para trabalhar aqui. Respeite instruções existentes.\n\n' };
    setDraft((command.prompt || prompts[name] || `/${name} `) + args);
    requestAnimationFrame(() => composerRef.current?.focus());
  }
  function composerKey(event) {
    if (event.nativeEvent.isComposing) return;
    if (slashMatch && !slashDismissed) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setSlashDismissed(true); return; }
      if (slashCommands.length && ['ArrowDown','ArrowUp'].includes(event.key)) { event.preventDefault(); setSlashIndex(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + slashCommands.length) % slashCommands.length); return; }
      if (slashCommands.length && ['Enter','Tab'].includes(event.key) && !event.shiftKey) { event.preventDefault(); runCommand(slashCommands[Math.min(slashIndex,slashCommands.length-1)]); return; }
    }
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(event); }
    if ((event.metaKey || event.ctrlKey) && ['b','i'].includes(event.key.toLowerCase())) { event.preventDefault(); formatDraft(event.key.toLowerCase() === 'b' ? '**' : '_'); }
  }
  function composerPaste(event) {
    const files = [...(event.clipboardData?.items || [])].filter(item => item.kind === 'file').map(item => item.getAsFile()).filter(Boolean);
    if (files.length) { event.preventDefault(); addFiles(files); }
  }

  if (checking) return <div className="loading-screen"><Brand /><span className="spinner" /><p>Abrindo seu workspace…</p></div>;
  if (!session) return <Login onLogin={data => { setSession(data); if (data.status) setStatus(data.status); if (data.connectionError) setError(data.connectionError); }} />;
  const busy = conversation?.busy || sending;
  const sshMode = status?.mode === 'ssh';
  const sshDisconnected = sshMode && !status.connected;
  const sshTarget = status?.connection ? `${status.connection.username}@${status.connection.host}` : '';
  const messages = conversation?.messages || [];
  const filtered = conversations.filter(c => c.title.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  const examples = [ ['terminal', 'Explore seu projeto', 'Me explique a estrutura deste projeto e sugira melhorias.'], ['shield', 'Investigue um problema', 'Me ajude a investigar um erro. Por onde devemos começar?'], ['chat', 'Tire uma ideia do papel', 'Me ajude a planejar os próximos passos de um novo projeto.'] ];
  return <div className={`workspace text-${preferences.fontSize}`}>
    <a className="skip-link" href="#composer">Ir para mensagem</a>
    {sidebar && <button className="sidebar-overlay" aria-label="Fechar menu" onClick={() => setSidebar(false)} />}
    <aside className={`sidebar ${sidebar ? 'is-open' : ''}`} aria-label="Navegação principal">
      <div className="sidebar-brand"><Brand compact /><span className="workspace-tag">ADMIN · V5</span><button className="icon-button mobile-only" aria-label="Fechar menu" onClick={() => setSidebar(false)}><Icon name="close" /></button></div>
      <button className="new-conversation" onClick={newConversation} disabled={sending}><Icon name="plus" size={19} /> Nova conversa <span>↗</span></button>
      <div className="search-box"><Icon name="search" size={17} /><input ref={searchRef} aria-label="Buscar conversas" placeholder="Buscar conversas" value={search} onChange={e => setSearch(e.target.value)} /><kbd>⌘ K</kbd></div>
      <div className="sidebar-label">RECENTES <span>{conversations.length}</span></div>
      <nav className="conversation-list" aria-label="Conversas">{filtered.length ? filtered.map(item => <div key={item.id} className={`conversation-row ${selected === item.id ? 'active' : ''}`}><button className={`conversation-link ${selected === item.id ? 'active' : ''}`} aria-current={selected === item.id ? 'page' : undefined} disabled={sending} onClick={() => choose(item.id)}><Icon name="chat" size={17} /><span><strong>{item.title || 'Nova conversa'}</strong><small>{formatDate(item.updatedAt || item.createdAt)}{item.busy ? ' · Em andamento' : ''}</small></span>{item.busy && <span className="status-dot" />}</button><button className="conversation-delete" type="button" aria-label={`Excluir conversa: ${item.title || 'Nova conversa'}`} title="Excluir conversa" disabled={sending || item.busy || deleting} onClick={() => requestDelete(item)}><Icon name="trash" size={15} /></button></div>) : <p className="empty-list">{search ? 'Nenhuma conversa encontrada.' : 'Suas conversas ficam salvas aqui. Comece algo novo.'}</p>}</nav>
      <div className="sidebar-bottom"><div className="environment"><span className="environment-icon"><Icon name="terminal" size={18} /></span><div><strong>{status?.mode === 'mock' ? 'Demonstração' : sshMode ? sshTarget || 'Sua VPS' : 'Codex workspace'}</strong><small title={status?.workspace || ''}>{status?.mode === 'mock' ? 'Ambiente de testes' : status?.workspace || 'Conecte para começar'}</small></div><span className={`status-dot ${status?.connected ? '' : 'offline'}`} /></div><div className="admin-tools"><button onClick={() => { setTerminalOpen(true); setSidebar(false); }}><Icon name="terminal" size={17} />Terminal</button><button onClick={openFiles}><Icon name="folder" size={17} />Arquivos</button></div>{sshMode && <button className="sidebar-settings saved-connection-link" onClick={() => { setSavedVpsDialog(true); setSidebar(false); }}><Icon name="lock" size={17} /><span>{status.savedConnection ? 'VPS salva' : 'Minha VPS'}</span>{status.savedConnection && <Icon name="check" size={14} />}</button>}<button className="sidebar-settings" onClick={() => setSettings(true)}><Icon name="settings" size={18} />Configurações</button><div className="account"><span className="avatar">{session.user.username.slice(0, 1).toUpperCase()}</span><div><strong>{session.user.username}</strong><small>Administrador</small></div><button className="icon-button" aria-label="Sair da conta" title="Sair da conta" onClick={logout}><Icon name="logout" size={18} /></button></div></div>
    </aside>
    <main className={`chat-panel ${dragging ? 'is-dragging' : ''}`} onDragEnter={e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); dragCount.current++; setDragging(true); } }} onDragOver={e => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); }} onDragLeave={e => { e.preventDefault(); dragCount.current = Math.max(0, dragCount.current - 1); if (!dragCount.current) setDragging(false); }} onDrop={e => { e.preventDefault(); dragCount.current = 0; setDragging(false); addFiles(e.dataTransfer.files); }}>
      {dragging && <div className="file-drop-zone"><Icon name="attachment" size={37} /><strong>Solte os arquivos aqui</strong><span>Imagens, PDF, ZIP e outros arquivos · até 25 MB cada</span></div>}
      <header className="chat-header"><div className="header-title"><button className="icon-button mobile-only" aria-label="Abrir menu" onClick={() => setSidebar(true)}><Icon name="menu" /></button><div><h1>{conversation?.title || 'Luck'}<span className="header-badge">admin · v5</span></h1><p>{sshMode ? status.connected ? `SSH · ${sshTarget}` : 'Seu assistente conectado à sua VPS' : status?.mode === 'mock' ? 'Ambiente de demonstração' : 'Seu assistente de trabalho'}</p></div></div><div className="header-actions"><span className={`connection-state ${connection === 'connected' ? '' : 'pending'}`} title="Conexão de atualizações em tempo real"><span className="status-dot" />{connection === 'connected' ? 'Ao vivo' : 'Reconectando'}</span>{sshMode && status.connected && <button className="ssh-disconnect" onClick={sshDisconnect} disabled={disconnecting || Boolean(status.busy || busy)}>{disconnecting ? 'Saindo…' : 'Desconectar SSH'}</button>}{conversation && <button className="icon-button delete-chat-button" title="Excluir conversa atual" aria-label="Excluir conversa atual" disabled={busy || deleting} onClick={() => requestDelete(conversation)}><Icon name="trash" size={18} /></button>}{conversation && <button className="icon-button" title="Exportar conversa" aria-label="Exportar conversa" onClick={exportConversation}><Icon name="download" size={19} /></button>}<button className="icon-button" title="Alternar tema" aria-label="Alternar tema" onClick={() => setPreferences(p => ({ ...p, theme: p.theme === 'dark' ? 'light' : 'dark' }))}><Icon name={preferences.theme === 'dark' ? 'sun' : 'moon'} size={19} /></button><button className="icon-button" aria-label="Configurar conversa" title="Configurar conversa" disabled={Boolean(selected && !conversation)} onClick={() => setSettings(true)}><Icon name="settings" size={19} /></button></div></header>
      {status?.mode === 'mock' && <div className="demo-banner"><span className="demo-tag">DEMO</span> Ambiente de teste. As respostas são simuladas e nenhum comando é executado.</div>}
      {(error || voice.error) && <div className="error-banner" role="alert"><span>{error || voice.error}</span><button className="icon-button" aria-label="Fechar aviso" onClick={() => { setError(''); voice.clearError(); }}><Icon name="close" size={17} /></button></div>}
      <section className="chat-scroll" ref={scrollRef} onScroll={() => { const el = scrollRef.current; if (el) { nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 180; setShowJump(!nearBottomRef.current); } }} aria-label="Mensagens da conversa" aria-busy={Boolean(busy)}>
        {sshDisconnected && (editingVps || (!status.savedConnection && !status.autoReconnectError && !status.savedConnectionError) ? <SshConnect key={`${session.csrfToken}-${editingVps}`} csrf={session.csrfToken} occupied={status.ownedByAnotherSession} onConnected={sshConnected} onUnauthorized={showError} initialTarget={editingVps ? status.savedConnection : null} onCancel={editingVps && status.savedConnection ? () => setEditingVps(false) : null} /> : <div className="ssh-connect-wrap"><SavedVps profile={status.savedConnection} occupied={status.ownedByAnotherSession} pending={reconnectingVps || status.reconnecting} forgetting={forgettingVps} error={status.autoReconnectError || status.savedConnectionError} onReconnect={reconnectVps} onForget={forgetVps} onEdit={editVps} /></div>)}
        {selected && !conversation && <div className="conversation-loading" role="status"><span className="spinner" />Carregando conversa…</div>}
        {!selected && !status && <div className="conversation-loading" role="status"><span className="spinner" />Conectando ao workspace…</div>}
        {!messages.length && !busy && !(selected && !conversation) ? !sshDisconnected && status && <div className="welcome"><div className="welcome-emblem"><div className="welcome-logo"><img src="/luck-shepherd.svg" alt="Luck, pastor-alemão" /></div><span>LUCK · SEU PARCEIRO DE TRABALHO</span></div><h2>O que vamos criar hoje<span>?</span></h2><p>Uma ideia, uma pergunta ou um desafio.<br />O Luck ajuda você a dar o próximo passo.</p><div className="suggestions">{examples.map(([icon, title, text]) => <button key={title} onClick={() => { setDraft(text); composerRef.current?.focus(); }}><Icon name={icon} size={21} /><strong>{title}</strong><span>{text}</span><span className="suggestion-arrow">↗</span></button>)}</div><div className="welcome-note"><Icon name="shield" size={14} />Você define as permissões. O Luck cuida do próximo passo.</div></div> : <div className="messages">{messages.map(message => <Message key={message.id} message={message} username={session.user.username} preferences={preferences} voice={voice} onCopy={copy} copied={copied} conversationId={selected} workspace={status?.workspace} />)}{busy && <div className="working-indicator" role="status"><span className="thinking-dots"><i /><i /><i /></span>{approvals.length ? 'Aguardando sua aprovação' : 'Luck está trabalhando'}<span className="working-line" /></div>}{approvals.map(approval => <Approval key={approval.id} approval={approval} disabled={deciding} onDecide={decide} />)}<div ref={endRef} /></div>}
      </section>
      {showJump && <button className="jump-button" aria-label="Ir para o fim da conversa" onClick={() => { nearBottomRef.current = true; setShowJump(false); endRef.current?.scrollIntoView({ behavior: 'smooth' }); }}><Icon name="down" size={19} /> Mensagens recentes</button>}
      <div className="composer-wrap">{voice.listening && <div className="listening-banner" role="status"><span className="recording-dot" /><strong>Ouvindo…</strong><span>{voice.interim || 'Pode falar. O texto ficará disponível para revisão.'}</span><button onClick={voice.stopListening} className="subtle-button">Concluir</button></div>}<input ref={fileInputRef} type="file" multiple className="sr-only" tabIndex={-1} aria-label="Selecionar anexos" onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
      <div className="performance-controls" aria-label="Modelo, esforço e velocidade"><button type="button" className="performance-model" aria-label="Escolher modelo e modos" title="Modelo e desempenho" disabled={busy || Boolean(selected && !conversation)} onClick={openPerformance}><Icon name="command" size={14} /><span>{modeSelection.model ? currentModel?.displayName || modeSelection.model : 'Modelo padrão'}</span><Icon name="down" size={12} /></button><button type="button" className={modeSelection.reasoningEffort ? 'performance-active' : ''} aria-label="Alterar esforço de raciocínio" title="Esforço de raciocínio" disabled={busy || Boolean(selected && !conversation)} onClick={openPerformance}><Icon name="brain" size={14} /><span>{effortLabel(modeSelection.reasoningEffort)}</span><Icon name="down" size={12} /></button><button type="button" className={modeSelection.serviceTier && modeSelection.serviceTier !== 'default' ? 'performance-active' : ''} aria-label="Alterar velocidade de resposta" title="Velocidade de resposta" disabled={busy || Boolean(selected && !conversation)} onClick={openPerformance}><Icon name="bolt" size={14} /><span>{modeSelection.serviceTier ? speedLabel(modeSelection.serviceTier) : 'Velocidade padrão'}</span><Icon name="down" size={12} /></button></div>
      {slashMatch && <SlashMenu query={slashMatch[1]} commands={slashCommands} onSelect={runCommand} onClose={() => setSlashDismissed(true)} activeIndex={slashIndex} onActiveIndexChange={setSlashIndex} />}
      <form id="composer" className={`composer ${voice.listening ? 'is-listening' : ''}`} onSubmit={send}>{queuedFiles.length > 0 && <AttachmentList attachments={queuedFiles} onRemove={sending ? undefined : removeFile} />}{uploading && <div className="upload-status" role="status"><span className="spinner" />Enviando anexos para o workspace…</div>}<textarea ref={composerRef} aria-label="Sua mensagem para o Luck" placeholder={sshDisconnected ? 'Conecte sua VPS para começar' : 'Pergunte ao Luck, anexe arquivos ou digite / para comandos…'} disabled={sshDisconnected || sending} value={draft} maxLength={16000} rows={2} onChange={e => setDraft(e.target.value)} onPaste={composerPaste} aria-expanded={Boolean(slashMatch)} aria-controls={slashMatch ? 'slash-command-menu' : undefined} aria-activedescendant={slashMatch && slashCommands.length ? `slash-command-${Math.min(slashIndex,slashCommands.length-1)}` : undefined} onKeyDown={composerKey} /><div className="composer-toolbar"><div className="composer-options"><button type="button" className="icon-button attach-button" aria-label="Anexar arquivos" title="Anexar imagens, PDF, ZIP e outros arquivos" disabled={sshDisconnected || sending} onClick={() => fileInputRef.current?.click()}><Icon name="attachment" size={19} /></button><button type="button" className="slash-toggle" aria-label="Abrir comandos" title="Comandos (/)" onClick={() => { setDraft('/'); setSlashDismissed(false); composerRef.current?.focus(); }}>/</button><div className="format-buttons"><button type="button" aria-label="Inserir negrito" title="Negrito (Ctrl+B)" disabled={sshDisconnected} onClick={() => formatDraft('**')}><b>B</b></button><button type="button" aria-label="Inserir itálico" title="Itálico (Ctrl+I)" disabled={sshDisconnected} onClick={() => formatDraft('_')}><i>I</i></button><button type="button" aria-label="Inserir código" title="Código" disabled={sshDisconnected} onClick={() => formatDraft('`', '`', 'código')}>‹/›</button></div><button type="button" className={`permission-chip ${permissions.sandbox === 'danger-full-access' ? 'is-full-access' : ''}`} onClick={() => setSettings(true)} disabled={Boolean(selected && !conversation)} title="Configurar permissões"><Icon name="shield" size={14} /><span>{permissionTitle(permissions)}</span><Icon name="down" size={12} /></button></div><div className="composer-actions">{draft.length > 14000 && <span className="char-count">{draft.length}/16000</span>}{voice.supportedSpeech && voice.speakingId && <button type="button" className="icon-button is-speaking" aria-label="Parar leitura" onClick={voice.stopSpeaking}><Icon name="stop" size={18} /></button>}<button type="button" className={`icon-button mic-button ${voice.listening ? 'active' : ''}`} aria-label={voice.listening ? 'Parar ditado' : 'Ditar mensagem'} aria-pressed={voice.listening} title={voice.supportedRecognition ? 'Ditar mensagem' : 'Ditado indisponível neste navegador'} disabled={sshDisconnected || sending} onClick={dictate}><Icon name={voice.listening ? 'stop' : 'mic'} size={19} /></button>{busy ? <button type="button" className="stop-button" onClick={interrupt} disabled={sending} aria-label="Interromper resposta"><Icon name="stop" size={16} /></button> : <button className="send-button" type="submit" disabled={sshDisconnected || (!draft.trim() && !queuedFiles.length) || sending || (selected !== null && !conversation)} aria-label="Enviar mensagem"><Icon name="arrow" size={21} /></button>}</div></div></form><p className="composer-note"><span>O Luck pode cometer erros. Revise informações e ações importantes.</span><span className="keyboard-hint">/ comandos · Enter enviar · Shift + Enter nova linha</span></p></div>
    </main>
    {savedVpsDialog && <Modal title="Minha VPS" onClose={() => setSavedVpsDialog(false)} wide><SavedVps profile={status?.savedConnection} connected={status?.connected} occupied={status?.ownedByAnotherSession} pending={reconnectingVps || status?.reconnecting} forgetting={forgettingVps} error={status?.autoReconnectError || status?.savedConnectionError || status?.credentialSaveError} onReconnect={reconnectVps} onForget={forgetVps} onEdit={editVps} /></Modal>}
    {terminalOpen && <Suspense fallback={<Modal title="Terminal do admin" onClose={() => setTerminalOpen(false)}><div className="conversation-loading"><span className="spinner" />Preparando terminal…</div></Modal>}><TerminalPanel csrf={session.csrfToken} onClose={() => setTerminalOpen(false)} onError={showError} onUnauthorized={showError} /></Suspense>}
    {filesOpen && <FilesPanel csrf={session.csrfToken} conversationId={selected} onClose={() => setFilesOpen(false)} onError={showError} />}
    {info === 'model' && <Modal title="Modelo e desempenho" onClose={() => { if (!modelPending) setInfo(null); }} wide><ModelSettings key={selected || 'new'} capabilities={capabilities} loading={capabilitiesLoading} selection={modeSelection} busy={busy} pending={modelPending} onSave={savePerformance} /></Modal>}
    {info && info !== 'model' && <AdminInfo kind={info} capabilities={capabilities} loading={capabilitiesLoading} status={status} conversation={modeSelection} permissions={permissions} onClose={() => setInfo(null)} onSkill={skill => { setInfo(null); setDraft(`$${skill.name} `); composerRef.current?.focus(); }} onCommand={runCommand} />}
    {settings && !deleteDialog && <Settings key={selected || 'new'} preferences={preferences} setPreferences={setPreferences} permissions={permissions} allowed={allowed} conversation={conversation} busy={busy} onSave={saveSettings} onDelete={() => requestDelete(conversation)} onClose={() => setSettings(false)} voice={voice} />}
    {deleteDialog && <Modal title="Excluir conversa?" onClose={() => { if (!deleting) setDeleteDialog(null); }}><div className="delete-content"><p>A conversa <strong>{deleteDialog.title}</strong> será removida do histórico do Luck. Esta ação não pode ser desfeita e não remove arquivos do workspace.</p>{deleteProblem && <p className="form-error" role="alert">{deleteProblem}</p>}<div className="settings-footer"><button className="subtle-button" disabled={deleting} onClick={() => setDeleteDialog(null)}>Cancelar</button><button className="danger-button" disabled={deleting || Boolean(conversations.find(item => item.id === deleteDialog.id)?.busy)} onClick={deleteConversation}>{deleting ? 'Excluindo…' : 'Excluir conversa'}</button></div></div></Modal>}
    <div className="sr-only" role="status" aria-live="polite">{copied ? 'Mensagem copiada.' : ''}</div>
  </div>;
}
