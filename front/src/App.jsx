import { useCallback, useEffect, useRef, useState } from 'react';

function Icon({ name, size = 20, ...props }) {
  const paths = {
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
  return <div className={`brand ${compact ? 'compact' : ''}`}><div className="brand-mark"><span /><span /><span /></div><div><strong>jarvis<span>.</span></strong>{!compact && <small>SEU ESPAÇO DE TRABALHO</small>}</div></div>;
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
      <footer>JARVIS WORKSPACE <span>01 / CONECTAR</span></footer>
    </section>
    <section className="login-form-wrap"><div className="login-card"><span className="login-icon"><Icon name="lock" size={24} /></span><span className="eyebrow">BEM-VINDO DE VOLTA</span><h2>Seu próximo passo<br />começa aqui.</h2><p>Entre na sua conta para abrir o workspace.</p>
      <form onSubmit={submit}><label htmlFor="username">Usuário</label><input id="username" autoComplete="username" autoFocus value={username} onChange={e => setUsername(e.target.value)} placeholder="Seu usuário" required maxLength={100} />
        <label htmlFor="password">Senha</label><div className="password-input"><input id="password" type={visible ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Sua senha" required /><button type="button" className="icon-button" aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setVisible(!visible)}><Icon name="eye" size={18} /></button></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary login-submit" disabled={pending}>{pending ? <><span className="spinner" /> Entrando…</> : <>Acessar meu workspace <span>↗</span></>}</button>
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

function SshConnect({ csrf, occupied, onConnected, onUnauthorized }) {
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('root');
  const [workspace, setWorkspace] = useState('/root/codex');
  const [password, setPassword] = useState('');
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
    const body = { host: host.trim(), port: Number(port), username: username.trim(), workspace: workspace.trim(), fingerprint, password };
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
    <h2 id="ssh-title">Conectar à VPS</h2><p>Abra uma conexão SSH para conversar com o Codex instalado no seu servidor.</p>
    {occupied ? <div className="ssh-occupied" role="status">Esta VPS está em uso por outra sessão do painel. Desconecte naquela sessão para continuar aqui.</div> : <form onSubmit={fingerprint ? connect : probe}>
      <div className="ssh-target-grid"><div><label htmlFor="ssh-host">Endereço ou IP da VPS</label><input id="ssh-host" value={host} onChange={e => changeTarget(setHost, e.target.value)} placeholder="Ex.: 203.0.113.10" autoComplete="off" spellCheck={false} required maxLength={253} disabled={pending} /></div><div><label htmlFor="ssh-port">Porta SSH</label><input id="ssh-port" type="number" min="1" max="65535" value={port} onChange={e => changeTarget(setPort, e.target.value)} required disabled={pending} /></div></div>
      <div className="ssh-fields-grid"><div><label htmlFor="ssh-username">Usuário da VPS</label><input id="ssh-username" value={username} onChange={e => setUsername(e.target.value)} autoComplete="off" spellCheck={false} required maxLength={64} disabled={pending} /></div><div><label htmlFor="ssh-workspace">Pasta de trabalho</label><input id="ssh-workspace" value={workspace} onChange={e => setWorkspace(e.target.value)} placeholder="/var/www/meu-projeto" autoComplete="off" spellCheck={false} required maxLength={4096} disabled={pending} /></div></div>
      {fingerprint && <div className="ssh-fingerprint"><div><Icon name="shield" size={16} /><strong>Confira a identidade do servidor</strong></div><code>{fingerprint}</code><details><summary>Como conferir na minha VPS?</summary><p>No terminal em que você já acessa a VPS, execute o comando abaixo e compare a impressão digital SHA256 com a mostrada aqui.</p><pre>{'for f in /etc/ssh/ssh_host_*_key.pub; do ssh-keygen -lf "$f"; done'}</pre></details><label className="ssh-confirm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={pending} /><span>Conferi a impressão digital com a minha VPS</span></label></div>}
      {fingerprint && confirmed && <div className="ssh-password-field"><label htmlFor="ssh-password">Senha da VPS</label><input id="ssh-password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="off" required disabled={pending} maxLength={1024} /><small>A senha é usada nesta conexão e não é salva pelo painel.</small></div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="ssh-submit-row">{fingerprint && <button className="subtle-button" type="button" onClick={probe} disabled={pending}>Verificar novamente</button>}<button className="primary" disabled={pending || Boolean(fingerprint && (!confirmed || !password))}>{pending ? <><span className="spinner" /> {fingerprint ? 'Conectando…' : 'Verificando…'}</> : fingerprint ? <>Conectar à VPS <span>↗</span></> : <>Verificar servidor <span>↗</span></>}</button></div>
    </form>}
    <p className="ssh-footnote">O Codex precisa estar instalado e autenticado no usuário SSH informado. Os limites dessa conta continuam valendo.</p>
  </section></div>;
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
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const selectedRef = useRef(null);
  const lock = useRef(false);
  const endRef = useRef(null);
  const scrollRef = useRef(null);
  const nearBottomRef = useRef(true);
  const composerRef = useRef(null);
  const choose = useCallback(id => { selectedRef.current = id; nearBottomRef.current = true; setSelected(id); setConversation(null); setApprovals([]); setSidebar(false); setError(''); }, []);
  const showError = useCallback(err => { if (err.status === 401) { setSession(null); setConversations([]); choose(null); } else setError(err.message); }, [choose]);

  useEffect(() => { let alive = true; request('/auth/me').then(data => { if (alive) setSession(data); }).catch(err => { if (alive && err.status !== 401) setError(err.message); }).finally(() => { if (alive) setChecking(false); }); return () => { alive = false; }; }, []);

  const refresh = useCallback(async () => {
    const id = selectedRef.current;
    const [list, detail, environment] = await Promise.all([request('/conversations'), id ? request(`/conversations/${id}`) : Promise.resolve(null), request('/status')]);
    setConversations(list.conversations || []);
    setStatus(environment);
    if (id === selectedRef.current && detail) { setConversation(detail.conversation); setApprovals(detail.approvals || []); }
  }, []);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    let timer;
    let inFlight = false;
    let queued = false;
    const sync = async () => {
      if (inFlight) { queued = true; return; }
      inFlight = true;
      try { await refresh(); } catch (err) { if (alive) showError(err); }
      finally { inFlight = false; if (queued && alive) { queued = false; schedule(); } }
    };
    const schedule = () => { if (!timer) timer = setTimeout(() => { timer = null; if (alive) sync(); }, 200); };
    sync();
    request('/status').then(data => { if (alive) setStatus(data); }).catch(err => { if (alive) showError(err); });
    const events = new EventSource('/api/events', { withCredentials: true });
    events.onopen = () => { if (alive) { setConnection('connected'); schedule(); } };
    events.onerror = () => { if (alive) setConnection('reconnecting'); };
    events.addEventListener('update', schedule);
    events.addEventListener('status', () => { if (alive) request('/status').then(data => { if (alive) setStatus(data); }).catch(showError); });
    return () => { alive = false; clearTimeout(timer); events.close(); };
  }, [session, refresh, showError]);

  useEffect(() => { if (session && selected) refresh().catch(showError); }, [selected, session, refresh, showError]);
  useEffect(() => { if (nearBottomRef.current) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [conversation?.messages, approvals.length]);

  const mutation = (path, body) => request(path, { method: 'POST', csrf: session.csrfToken, body });
  async function newConversation() {
    if (lock.current) return;
    lock.current = true; setError('');
    try { const data = await mutation('/conversations', {}); choose(data.conversation.id); setConversation(data.conversation); setDraft(''); await refresh(); composerRef.current?.focus(); }
    catch (err) { showError(err); }
    finally { lock.current = false; }
  }
  async function send(event) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || lock.current || conversation?.busy || (status?.mode === 'ssh' && !status.connected) || (selected !== null && !conversation)) return;
    lock.current = true; setSending(true); setError('');
    nearBottomRef.current = true;
    try {
      let id = selectedRef.current;
      if (!id) { const data = await mutation('/conversations', {}); id = data.conversation.id; choose(id); setConversation(data.conversation); }
      await mutation(`/conversations/${id}/messages`, { text });
      setDraft('');
      await refresh();
    } catch (err) { showError(err); }
    finally { lock.current = false; setSending(false); composerRef.current?.focus(); }
  }
  async function interrupt() { try { await mutation(`/conversations/${selectedRef.current}/interrupt`, {}); await refresh(); } catch (err) { showError(err); } }
  async function decide(id, decision) { setDeciding(true); try { await mutation(`/approvals/${encodeURIComponent(id)}`, { decision }); await refresh(); } catch (err) { showError(err); } finally { setDeciding(false); } }
  async function logout() { try { await mutation('/auth/logout', {}); setSession(null); choose(null); setConversations([]); setStatus(null); setDraft(''); } catch (err) { showError(err); } }
  async function sshConnected(environment, csrfToken) {
    if (sessionRef.current?.csrfToken !== csrfToken) return;
    setStatus(environment); choose(null); setDraft('');
    const data = await mutation('/conversations', {});
    choose(data.conversation.id); setConversation(data.conversation);
    await refresh();
    composerRef.current?.focus();
  }
  async function sshDisconnect() {
    if (disconnecting) return;
    setDisconnecting(true); setError('');
    try { await mutation('/connection/disconnect', {}); await refresh(); setDraft(''); }
    catch (err) { showError(err); }
    finally { setDisconnecting(false); }
  }

  if (checking) return <div className="loading-screen"><Brand /><span className="spinner" /><p>Abrindo seu workspace…</p></div>;
  if (!session) return <Login onLogin={setSession} />;
  const busy = conversation?.busy || sending;
  const sshMode = status?.mode === 'ssh';
  const sshDisconnected = sshMode && !status.connected;
  const sshTarget = status?.connection ? `${status.connection.username}@${status.connection.host}` : '';
  const messages = conversation?.messages || [];
  const examples = ['Me explica a estrutura deste projeto', 'Confira o consumo de memória da máquina', 'Me ajude a investigar um erro'];
  return <div className="workspace">
    {sidebar && <button className="sidebar-overlay" aria-label="Fechar menu" onClick={() => setSidebar(false)} />}
    <aside className={`sidebar ${sidebar ? 'is-open' : ''}`}>
      <div className="sidebar-brand"><Brand compact /><button className="icon-button mobile-only" aria-label="Fechar menu" onClick={() => setSidebar(false)}><Icon name="close" /></button></div>
      <button className="new-conversation" onClick={newConversation} disabled={sending}><Icon name="plus" size={18} /> Nova conversa <span>↗</span></button>
      <div className="sidebar-label">SUAS CONVERSAS <span>{conversations.length}</span></div>
      <nav className="conversation-list" aria-label="Conversas">{conversations.length ? conversations.map(item => <button key={item.id} className={`conversation-link ${selected === item.id ? 'active' : ''}`} onClick={() => choose(item.id)}><Icon name="chat" size={17} /><span><strong>{item.title || 'Nova conversa'}</strong><small>{formatDate(item.updatedAt || item.createdAt)}{item.busy ? ' · Em andamento' : ''}</small></span>{item.busy && <span className="status-dot" />}</button>) : <p className="empty-list">Suas conversas vão aparecer aqui.</p>}</nav>
      <div className="sidebar-bottom"><div className="environment"><Icon name="terminal" size={17} /><div><strong>{status?.mode === 'mock' ? 'Demonstração' : sshMode ? sshTarget || 'Conexão SSH' : 'Codex workspace'}</strong><small title={status?.workspace || ''}>{status?.mode === 'mock' ? 'Sem executar comandos reais' : status?.workspace || (sshMode ? 'Aguardando conexão com a VPS' : 'Consultando ambiente…')}</small></div></div><div className="account"><span className="avatar">{session.user.username.slice(0, 1).toUpperCase()}</span><div><strong>{session.user.username}</strong><small>Workspace pessoal</small></div><button className="icon-button" aria-label="Sair da conta" title="Sair da conta" onClick={logout}><Icon name="logout" size={18} /></button></div></div>
    </aside>
    <main className="chat-panel">
      <header className="chat-header"><div className="header-title"><button className="icon-button mobile-only" aria-label="Abrir menu" onClick={() => setSidebar(true)}><Icon name="menu" /></button><span className="header-symbol"><Icon name="terminal" size={19} /></span><div><h1>{conversation?.title || 'Seu workspace'}</h1><p>{status?.mode === 'mock' ? 'Modo de demonstração' : sshMode ? status.connected ? `SSH · ${sshTarget}` : 'Conecte sua VPS por SSH' : status?.connected ? 'Conectado ao seu ambiente' : 'Codex inicia ao enviar uma mensagem'}</p></div></div><div className="header-actions">{sshMode && status.connected && <button className="ssh-disconnect" onClick={sshDisconnect} disabled={disconnecting || Boolean(status.busy || busy)} title={status.busy || busy ? 'Interrompa a tarefa antes de desconectar' : 'Encerrar a conexão SSH desta sessão'}>{disconnecting ? 'Saindo…' : 'Desconectar SSH'}</button>}<span className={`connection-state ${connection === 'connected' ? '' : 'pending'}`} title={connection === 'connected' ? 'Atualizações em tempo real conectadas' : 'Tentando reconectar às atualizações'}><span className="status-dot" />{connection === 'connected' ? 'Ao vivo' : connection === 'reconnecting' ? 'Reconectando' : 'Conectando'}</span></div></header>
      {status?.mode === 'mock' && <div className="demo-banner"><span className="demo-tag">DEMO</span> Você está testando a interface. Neste modo, nenhuma ação é executada na máquina.</div>}
      {error && <div className="error-banner" role="alert"><span>{error}</span><button className="icon-button" aria-label="Fechar aviso" onClick={() => setError('')}><Icon name="close" size={17} /></button></div>}
      <section className="chat-scroll" ref={scrollRef} onScroll={() => { const el = scrollRef.current; if (el) nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 180; }} aria-label="Mensagens da conversa">
        {sshDisconnected && <SshConnect key={session.csrfToken} csrf={session.csrfToken} occupied={status.ownedByAnotherSession} onConnected={sshConnected} onUnauthorized={showError} />}
        {!messages.length && !busy ? !sshDisconnected && <div className="welcome"><div className="welcome-emblem"><Brand compact /></div><span className="eyebrow">DA IDEIA À AÇÃO</span><h2>O que vamos fazer hoje?</h2><p>Converse, investigue e construa.<br />Seu próximo projeto começa com uma mensagem.</p><div className="suggestions">{examples.map((text, index) => <button key={text} onClick={() => { setDraft(text); composerRef.current?.focus(); }}><span className="suggestion-number">0{index + 1}</span><span>{text}</span><span className="suggestion-arrow">↗</span></button>)}</div></div> : <div className="messages">{messages.map(message => <article key={message.id} className={`message message-${message.role}`}><div className={`message-avatar ${message.role === 'user' ? 'user-avatar' : ''}`}>{message.role === 'user' ? session.user.username.slice(0, 1).toUpperCase() : <Icon name={message.role === 'tool' ? 'terminal' : 'chat'} size={17} />}</div><div className="message-body"><div className="message-meta"><strong>{message.role === 'user' ? 'Você' : message.role === 'assistant' ? 'Jarvis' : message.role === 'tool' ? 'Execução' : 'Sistema'}</strong><time>{formatTime(message.createdAt)}</time></div>{message.role === 'tool' ? <pre className="tool-output">{message.text}</pre> : <div className="message-text">{message.text}</div>}</div></article>)}{busy && <div className="working-indicator"><span className="spinner" />{approvals.length ? 'Aguardando sua aprovação…' : 'Jarvis está trabalhando…'}</div>}{approvals.map(approval => <Approval key={approval.id} approval={approval} disabled={deciding} onDecide={decide} />)}<div ref={endRef} /></div>}
      </section>
      <div className="composer-wrap"><form className="composer" onSubmit={send}><textarea ref={composerRef} aria-label="Sua mensagem para o Jarvis" placeholder={sshDisconnected ? 'Conecte sua VPS para enviar uma mensagem' : 'Fala, Jarvis…'} disabled={sshDisconnected} value={draft} maxLength={16000} rows={2} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(event); } }} /><div className="composer-toolbar"><span><Icon name="terminal" size={14} />{status?.mode === 'mock' ? 'Demonstração' : sshMode ? 'Codex via SSH' : 'Codex'}<span className="composer-divider">/</span><span className="keyboard-hint">Enter para enviar</span></span>{busy ? <button type="button" className="stop-button" onClick={interrupt} disabled={sending} aria-label="Interromper resposta"><Icon name="stop" size={15} /> Parar</button> : <button className="send-button" type="submit" disabled={sshDisconnected || !draft.trim() || sending || (selected !== null && !conversation)} aria-label="Enviar mensagem"><Icon name="arrow" size={20} /></button>}</div></form><p className="composer-note">{status?.mode === 'mock' ? 'Modo de teste · As respostas são simuladas.' : 'Confira os comandos e as alterações antes de aprovar.'}<span>JARVIS WORKSPACE</span></p></div>
    </main>
  </div>;
}
