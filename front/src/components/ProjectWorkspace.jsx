import { useCallback, useEffect, useRef, useState } from 'react';
import ProjectEditor from './ProjectEditor.jsx';
import '../projects.css';

function Icon({ name, size = 18 }) {
  const shapes = {
    folder: <path d="M3 6h7l2 2h9v12H3V6Z" />,
    file: <><path d="M5 3h9l5 5v13H5V3Z" /><path d="M14 3v6h5" /></>,
    branch: <><circle cx="6" cy="5" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="6" cy="19" r="2" /><path d="M6 7v10m0-3c0-5 12-1 12-6" /></>,
    terminal: <><path d="m4 6 6 6-6 6M13 18h7" /></>,
    back: <path d="m10 5-7 7 7 7M3 12h18" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    plus: <path d="M12 4v16M4 12h16" />,
    refresh: <><path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5" /></>,
    search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></>,
    save: <><path d="M4 3h13l4 4v14H4V3Z" /><path d="M8 3v6h8V3M8 21v-8h9v8" /></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" /></>,
    arrow: <><path d="M5 12h14m-6-6 6 6-6 6" /></>,
    chat: <path d="M21 11a9 9 0 0 1-9 9H5l-3 2 1-6A9 9 0 1 1 21 11Z" />,
    clone: <><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V3H3v13h5m7-3v5m-2-2 2 2 2-2" /></>,
    menu: <path d="M3 5h18M3 12h18M3 19h18" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name] || shapes.file}</svg>;
}
const basename = path => String(path).replace(/\/$/, '').split('/').pop() || 'Workspace';
const isFolder = entry => ['directory', 'folder'].includes(entry.type);
const sortEntries = entries => [...entries].sort((a, b) => Number(isFolder(b)) - Number(isFolder(a)) || a.name.localeCompare(b.name, 'pt-BR'));
const recentKey = workspace => `jarvis.projects.recent.v1:${workspace || '.'}`;
function loadRecent(workspace) {
  try { const value = JSON.parse(localStorage.getItem(recentKey(workspace))); return Array.isArray(value) ? value.filter(item => typeof item?.path === 'string' && typeof item.name === 'string').slice(0, 6) : []; } catch { return []; }
}

export default function ProjectWorkspace({ csrf, workspace, visible = true, connected = true, onClose, onError, onTerminal, onChat, onDirtyChange }) {
  const dialog = useRef(null), epoch = useRef(0), treeVersion = useRef(0), booted = useRef(false), live = useRef(true), guardAction = useRef(null), ui = useRef(null), savingRef = useRef(new Set()), hiddenRef = useRef(false);
  const handlers = useRef({ onClose, onError, onTerminal, onChat }); handlers.current = { onClose, onError, onTerminal, onChat };
  const [access, setAccess] = useState(null), [catalog, setCatalog] = useState([]), [recent, setRecent] = useState(() => loadRecent(workspace));
  const accessRef = useRef(access); accessRef.current = access;
  const [project, setProject] = useState(null), [tree, setTree] = useState({}), [expanded, setExpanded] = useState(new Set()), [loadingDirs, setLoadingDirs] = useState(new Set());
  const treeRef = useRef(tree); treeRef.current = tree;
  const [buffers, setBuffers] = useState([]), [activePath, setActivePath] = useState(null), [openingFile, setOpeningFile] = useState('');
  const buffersRef = useRef(buffers); buffersRef.current = buffers;
  const [saving, setSaving] = useState(new Set()), [git, setGit] = useState(null), [search, setSearch] = useState('');
  const [showHidden, setShowHidden] = useState(false), [viewport, setViewport] = useState(null);
  const [form, setForm] = useState(null), [guard, setGuard] = useState(null), [pending, setPending] = useState(false), [guardPending, setGuardPending] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [mobileTree, setMobileTree] = useState(false);
  const [url, setUrl] = useState(''), [name, setName] = useState(''), [parent, setParent] = useState('projects'), [folderPath, setFolderPath] = useState('.');
  const [entryName, setEntryName] = useState(''), [entryParent, setEntryParent] = useState('.');
  const canWrite = connected && Boolean(access?.canWrite), active = buffers.find(item => item.path === activePath), dirty = buffers.filter(item => item.content !== item.original);
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  ui.current = { activePath, form, guard, pending, guardPending, mobileTree, saveFile };

  const call = useCallback(async (path, options = {}) => {
    if (!connected) throw Object.assign(new Error('Reconecte a VPS deste projeto para continuar. Seus rascunhos continuam abertos.'), { status: 409 });
    const { body, ...rest } = options;
    const response = await fetch(`/api/projects${path}`, { credentials: 'same-origin', ...rest, headers: { 'X-CSRF-Token': csrf, ...(accessRef.current?.scope ? { 'X-Project-Context': accessRef.current.scope } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const failure = Object.assign(new Error(data.error || 'Não foi possível concluir esta ação.'), { status: response.status });
      if (response.status === 401) handlers.current.onError?.(failure);
      throw failure;
    }
    return data;
  }, [csrf, connected]);

  useEffect(() => {
    live.current = true;
    const beforeUnload = event => { if (dirtyRef.current.length) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { live.current = false; epoch.current++; window.removeEventListener('beforeunload', beforeUnload); };
  }, []);
  useEffect(() => { onDirtyChange?.(dirty.length > 0); }, [dirty.length, onDirtyChange]);
  useEffect(() => {
    if (!visible || !connected || booted.current) return;
    booted.current = true;
    Promise.allSettled([call('/status'), call('/catalog')]).then(([status, list]) => {
      if (!live.current) return;
      if (status.status === 'fulfilled') setAccess(status.value); else setError(status.reason.message);
      if (list.status === 'fulfilled') setCatalog(list.value.projects || []); else setError(list.reason.message);
      if (status.status === 'rejected' || list.status === 'rejected') booted.current = false;
    });
  }, [visible, connected, call]);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setViewport({ height: Math.round(vv.height), top: Math.round(vv.offsetTop) });
    update(); vv.addEventListener('resize', update); vv.addEventListener('scroll', update);
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
  }, []);
  useEffect(() => {
    if (!visible) return;
    const previous = document.activeElement;
    dialog.current?.focus({ preventScroll: true });
    const key = event => {
      if (event.defaultPrevented) return;
      const current = ui.current;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if (current.activePath && !current.form && !current.guard && !current.pending) current.saveFile(current.activePath).catch(() => {}); }
      if (event.key === 'Escape') {
        event.preventDefault();
        if (current.guard) { if (!current.guardPending) setGuard(null); }
        else if (current.form) { if (!current.pending) setForm(null); }
        else if (current.mobileTree) setMobileTree(false);
        else handlers.current.onClose?.();
      }
      if (event.key === 'Tab' && !event.target.classList.contains('project-code-input')) {
        const scope = dialog.current?.querySelector('.project-modal') || dialog.current;
        const nodes = [...(scope?.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]') || [])].filter(node => node.getClientRects().length);
        if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); if (previous?.isConnected && !dialog.current?.contains(previous)) previous.focus({ preventScroll: true }); };
  }, [visible]);
  useEffect(() => {
    if (!visible || (!form && !guard)) return;
    const previous = document.activeElement;
    const frame = requestAnimationFrame(() => dialog.current?.querySelector('.project-modal input, .project-modal button:not(:disabled)')?.focus({ preventScroll: true }));
    return () => { cancelAnimationFrame(frame); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [visible, form?.kind, Boolean(guard)]);

  async function refreshCatalog() {
    try { const [status, data] = await Promise.all([call('/status'), call('/catalog')]); setAccess(status); setCatalog(data.projects || []); setError(''); }
    catch (failure) { setError(failure.message); }
  }
  async function refreshGit(path) {
    const generation = epoch.current;
    try { const data = await call(`/git?path=${encodeURIComponent(path)}`); if (generation === epoch.current) setGit(data); } catch { if (generation === epoch.current) setGit({ unavailable: true }); }
  }
  async function loadDir(path, force = false) {
    if (!force && treeRef.current[path]) return treeRef.current[path];
    const generation = epoch.current, version = treeVersion.current;
    setLoadingDirs(current => new Set(current).add(path));
    try {
      const result = await call(`/list?path=${encodeURIComponent(path)}${hiddenRef.current ? '&hidden=1' : ''}`);
      if (generation === epoch.current && version === treeVersion.current && live.current) setTree(current => ({ ...current, [path]: result }));
      return result;
    } catch (failure) { if (generation === epoch.current && version === treeVersion.current) setError(failure.message); throw failure; }
    finally { if (generation === epoch.current && version === treeVersion.current) setLoadingDirs(current => { const next = new Set(current); next.delete(path); return next; }); }
  }
  function requestGuard(paths, title, description, action) {
    if (!paths.length) { action(); return; }
    guardAction.current = action; setGuard({ paths, title, description });
  }
  async function resolveGuard(save) {
    if (!guard || guardPending) return;
    setGuardPending(true); setError('');
    try {
      if (save) for (const path of guard.paths) await saveFile(path);
      const action = guardAction.current; setGuard(null); guardAction.current = null; await action?.();
    } catch (failure) { setError(failure.message); }
    finally { setGuardPending(false); }
  }
  async function openProjectNow(path, displayName) {
    setPending(true); setError('');
    try {
      const result = await call(`/list?path=${encodeURIComponent(path || '.')}${hiddenRef.current ? '&hidden=1' : ''}`);
      if (!live.current) return;
      epoch.current++;
      const next = { path: result.path || path || '.', name: displayName || (path === '.' ? 'Workspace' : basename(path)) };
      setProject(next); setTree({ [next.path]: result }); setExpanded(new Set([next.path])); setLoadingDirs(new Set()); setBuffers([]); setActivePath(null); setOpeningFile(''); setSearch(''); setGit(null); setForm(null); setMobileTree(false);
      const nextRecent = [next, ...recent.filter(item => item.path !== next.path)].slice(0, 6); setRecent(nextRecent);
      try { localStorage.setItem(recentKey(workspace), JSON.stringify(nextRecent)); } catch {}
      refreshGit(next.path);
    } catch (failure) { setError(failure.message); }
    finally { setPending(false); }
  }
  function openProject(path, displayName) {
    requestGuard(dirty.map(item => item.path), 'Trocar de projeto?', 'Salve as alterações abertas antes de trocar ou descarte os rascunhos locais.', () => openProjectNow(path, displayName));
  }
  async function toggleDir(entry) {
    if (expanded.has(entry.path)) { setExpanded(current => { const next = new Set(current); next.delete(entry.path); return next; }); return; }
    setExpanded(current => new Set(current).add(entry.path));
    try { await loadDir(entry.path); } catch {}
  }
  async function openFile(entry) {
    if (pending) return;
    setMobileTree(false); setError('');
    if (buffersRef.current.some(item => item.path === entry.path)) { setActivePath(entry.path); return; }
    const generation = epoch.current; setOpeningFile(entry.path);
    try {
      const data = await call(`/file?path=${encodeURIComponent(entry.path)}`);
      if (generation !== epoch.current || !live.current) return;
      const file = { ...data, name: data.name || entry.name, original: data.content };
      setBuffers(current => current.some(item => item.path === file.path) ? current : [...current, file]); setActivePath(file.path);
    } catch (failure) { if (generation === epoch.current) setError(failure.message); }
    finally { if (generation === epoch.current) setOpeningFile(''); }
  }
  async function saveFile(path) {
    const buffer = buffersRef.current.find(item => item.path === path);
    if (!buffer || buffer.content === buffer.original || !canWrite) return;
    if (savingRef.current.has(path)) throw new Error('Aguarde o arquivo terminar de salvar.');
    savingRef.current.add(path);
    setSaving(current => new Set(current).add(path)); setError('');
    const generation = epoch.current, snapshot = buffer.content;
    try {
      const data = await call('/file', { method: 'PUT', body: { path: buffer.path, content: snapshot, revision: buffer.revision } });
      if (generation !== epoch.current || !live.current) return;
      setBuffers(current => current.map(item => item.path === path ? { ...item, revision: data.revision, original: snapshot, size: data.size } : item));
      setNotice(`${buffer.name} salvo.`); if (project) refreshGit(project.path);
    } catch (failure) {
      setError(failure.status === 409 ? `${failure.message} Recarregue o arquivo para ver a versão do servidor; seus rascunhos continuam no editor.` : failure.message); throw failure;
    } finally { savingRef.current.delete(path); setSaving(current => { const next = new Set(current); next.delete(path); return next; }); }
  }
  function closeFile(path) {
    const remove = () => { setBuffers(current => current.filter(item => item.path !== path)); if (activePath === path) setActivePath(buffers.find(item => item.path !== path)?.path || null); };
    requestGuard(dirty.some(item => item.path === path) ? [path] : [], 'Fechar arquivo?', 'Este arquivo tem alterações que ainda não foram salvas na VPS.', remove);
  }
  function reloadFile() {
    if (!active) return;
    const file = active;
    requestGuard(file.content !== file.original ? [file.path] : [], 'Recarregar arquivo?', 'A versão do servidor substituirá o conteúdo aberto no editor.', async () => {
      try { const data = await call(`/file?path=${encodeURIComponent(file.path)}`); setBuffers(current => current.map(item => item.path === file.path ? { ...data, original: data.content } : item)); setNotice('Arquivo recarregado.'); setError(''); } catch (failure) { setError(failure.message); }
    });
  }
  function showCreate(type) { setEntryName(''); setEntryParent(project?.path || '.'); setForm({ kind: 'create', type }); }
  async function createEntry(event) {
    event.preventDefault(); if (pending || !canWrite) return;
    setPending(true); setError('');
    try {
      const result = await call('/create', { method: 'POST', body: { parent: entryParent, name: entryName, type: form.type } });
      setExpanded(current => new Set(current).add(entryParent)); await loadDir(entryParent, true); setForm(null); setNotice(`${form.type === 'directory' ? 'Pasta criada' : 'Arquivo criado'}: ${result.name || entryName}`);
      if (form.type === 'file') {
        const data = await call(`/file?path=${encodeURIComponent(result.path)}`);
        setBuffers(current => [...current, { ...data, original: data.content }]); setActivePath(data.path); setMobileTree(false);
      }
      if (project) refreshGit(project.path);
    } catch (failure) { setError(failure.message); }
    finally { setPending(false); }
  }
  async function clone(event) {
    event.preventDefault(); if (pending || !canWrite) return;
    setPending(true); setError('');
    try {
      const result = await call('/clone', { method: 'POST', body: { url, name: name.trim() || undefined, parent: parent.trim() || 'projects' } });
      const cloned = result.project || result;
      await refreshCatalog(); await openProjectNow(cloned.path, cloned.name); setNotice('Repositório clonado e pronto para editar.');
    } catch (failure) { setError(failure.message); }
    finally { setPending(false); }
  }
  function refreshTree() { for (const path of expanded) loadDir(path, true).catch(() => {}); if (project) refreshGit(project.path); }
  function toggleHidden() {
    hiddenRef.current = !hiddenRef.current; setShowHidden(hiddenRef.current); treeVersion.current++;
    setTree({}); setLoadingDirs(new Set());
    if (project) for (const path of new Set([project.path, ...expanded])) loadDir(path, true).catch(() => {});
  }
  function renderEntries(path, level = 0) {
    const listing = tree[path];
    if (!listing) return loadingDirs.has(path) ? <p className="project-tree-note" role="status">Carregando…</p> : null;
    return <>{sortEntries(listing.files || []).map(entry => <div key={entry.path}><button className={`project-tree-entry${entry.path === activePath ? ' is-active' : ''}`} style={{ '--project-depth': level }} type="button" aria-expanded={isFolder(entry) ? expanded.has(entry.path) : undefined} aria-label={isFolder(entry) ? `Pasta ${entry.name}` : `Abrir arquivo ${entry.name}`} title={entry.path} onClick={() => isFolder(entry) ? toggleDir(entry) : openFile(entry)}><span className={`project-tree-chevron${expanded.has(entry.path) ? ' is-expanded' : ''}`}>{isFolder(entry) ? '›' : ''}</span><Icon name={isFolder(entry) ? 'folder' : 'file'} size={15} /><span>{entry.name}</span>{buffers.some(item => item.path === entry.path && item.content !== item.original) && <i className="project-dirty-dot" />}{loadingDirs.has(entry.path) && <span className="spinner" />}</button>{isFolder(entry) && expanded.has(entry.path) && renderEntries(entry.path, level + 1)}</div>)}{!listing.files?.length && <p className="project-tree-note">Pasta vazia</p>}{listing.truncated && <p className="project-tree-note">Listagem limitada. Use uma subpasta.</p>}</>;
  }
  const matches = search.trim() ? [...new Map(Object.values(tree).flatMap(list => list.files || []).filter(entry => entry.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(entry => [entry.path, entry])).values()] : [];
  const title = project?.name || 'Seus projetos';
  const allProjects = [...new Map([...catalog, ...recent].filter(item => item.path !== '.').map(item => [item.path, item])).values()];
  return <div className="project-workspace" hidden={!visible} inert={!visible ? true : undefined} style={viewport ? { '--project-viewport-height': `${viewport.height}px`, '--project-viewport-top': `${viewport.top}px` } : undefined}>
    <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Área de projetos" className="project-shell">
      <header className="project-header"><button className="project-back" type="button" onClick={onClose}><Icon name="back" size={16} /><span>Voltar ao chat</span></button><div className="project-header-title"><Icon name="folder" size={17} /><strong>{title}</strong><span>WORKSPACE</span></div><div className="project-header-actions">{project && <><button type="button" title="Pedir ajuda ao Luck neste projeto" aria-label="Pedir ajuda ao Luck" disabled={!connected} onClick={() => onChat?.(project)}><Icon name="chat" size={17} /><span>Luck</span></button><button type="button" title="Abrir terminal do projeto" aria-label="Abrir terminal do projeto" disabled={!connected} onClick={() => onTerminal?.(project.path)}><Icon name="terminal" size={17} /><span>Terminal</span></button></>}<span className={`project-connection${connected ? '' : ' is-offline'}`}><i />{connected ? 'VPS' : 'Offline'}</span></div></header>
      {!connected && <div className="project-offline" role="status">Conexão pausada. Seus rascunhos continuam abertos para consulta e cópia. Reconecte a mesma VPS para salvar e acessar os arquivos.</div>}
      {error && !form && !guard && <div className="project-error" role="alert"><span>{error}</span><button type="button" aria-label="Fechar erro de projetos" onClick={() => setError('')}>×</button></div>}
      {!project ? <div className="project-home"><div className="project-home-heading"><span className="project-eyebrow">DO REPOSITÓRIO À PRÓXIMA IDEIA</span><h1>Seu código.<br />Seu próximo projeto<span>.</span></h1><p>Clone um repositório ou abra uma pasta da sua VPS.<br />Edite, salve e trabalhe com o Luck no mesmo lugar.</p></div><div className="project-start-cards"><button type="button" disabled={!canWrite || pending} onClick={() => { setUrl(''); setName(''); setParent('projects'); setForm({ kind: 'clone' }); }}><span className="project-card-icon"><Icon name="clone" size={25} /></span><strong>Clonar repositório</strong><p>Traga um projeto do Git para o seu workspace.</p><span className="project-card-link">Começar com Git <Icon name="arrow" size={16} /></span></button><button type="button" disabled={pending} onClick={() => { setFolderPath('.'); setForm({ kind: 'open' }); }}><span className="project-card-icon"><Icon name="folder" size={25} /></span><strong>Abrir pasta</strong><p>Continue um projeto que já está na sua VPS.</p><span className="project-card-link">Explorar arquivos <Icon name="arrow" size={16} /></span></button></div><div className="project-catalog-heading"><span>PROJETOS NO SEU WORKSPACE</span><button type="button" aria-label="Atualizar projetos" onClick={refreshCatalog}><Icon name="refresh" size={15} /></button></div><div className="project-catalog"><button className="project-catalog-entry" type="button" disabled={pending} onClick={() => openProject('.', 'Workspace')}><Icon name="folder" size={20} /><span><strong>Pasta de trabalho</strong><small title={workspace}>{workspace || '.'}</small></span><Icon name="arrow" size={15} /></button>{allProjects.map(item => <button className="project-catalog-entry" type="button" key={item.path} disabled={pending} onClick={() => openProject(item.path, item.name)}><Icon name={item.isGit ? 'branch' : 'folder'} size={20} /><span><strong>{item.name}</strong><small>{item.path}</small></span><Icon name="arrow" size={15} /></button>)}</div>{access && !canWrite && <p className="project-readonly-note">Sua conexão está em modo de leitura. Você pode explorar e baixar arquivos.</p>}{pending && <p className="project-loading" role="status"><span className="spinner" />Abrindo projeto…</p>}</div> : <>
        <div className="project-body"><button className="project-mobile-explorer-toggle" type="button" aria-label="Alternar explorador de arquivos" aria-expanded={mobileTree} onClick={() => setMobileTree(value => !value)}><Icon name="menu" size={16} />Explorador<span>{active?.name || project.name}</span></button>{mobileTree && <button className="project-explorer-scrim" type="button" aria-label="Fechar explorador" onClick={() => setMobileTree(false)} />}
          <aside className={`project-explorer${mobileTree ? ' is-mobile-open' : ''}`} aria-label="Explorador de arquivos"><div className="project-explorer-top"><span>EXPLORADOR</span><div><button type="button" aria-label="Novo arquivo" title="Novo arquivo" disabled={!canWrite} onClick={() => showCreate('file')}><Icon name="plus" size={15} /></button><button type="button" aria-label="Nova pasta" title="Nova pasta" disabled={!canWrite} onClick={() => showCreate('directory')}><Icon name="folder" size={15} /></button><button type="button" aria-label="Atualizar explorador" title="Atualizar explorador" onClick={refreshTree}><Icon name="refresh" size={14} /></button></div></div><label className="project-search"><Icon name="search" size={14} /><input aria-label="Filtrar arquivos carregados" value={search} onChange={event => setSearch(event.target.value)} placeholder="Filtrar arquivos…" /></label><button className="project-root-name" type="button" title={project.path} onClick={() => toggleDir({ path: project.path })}><span>{expanded.has(project.path) ? '⌄' : '›'}</span><Icon name="folder" size={15} />{project.name}</button><button type="button" className="project-hidden-toggle" aria-label="Mostrar arquivos ocultos" aria-pressed={showHidden} disabled={pending} onClick={toggleHidden}><span aria-hidden="true">{showHidden ? '◉' : '○'}</span>Arquivos ocultos</button><div className="project-file-tree">{search ? <>{matches.map(entry => <button className="project-search-result" type="button" key={entry.path} onClick={() => isFolder(entry) ? toggleDir(entry) : openFile(entry)}><Icon name={isFolder(entry) ? 'folder' : 'file'} size={15} /><span><strong>{entry.name}</strong><small>{entry.path}</small></span></button>)}{!matches.length && <p className="project-tree-note">Nenhum arquivo carregado corresponde à busca.</p>}</> : expanded.has(project.path) && renderEntries(project.path)}</div><div className="project-explorer-bottom"><button type="button" onClick={() => requestGuard(dirty.map(item => item.path), 'Voltar aos projetos?', 'Os arquivos abertos serão fechados. Salve suas alterações para continuar.', () => { epoch.current++; setProject(null); setBuffers([]); setTree({}); setGit(null); refreshCatalog(); })}><Icon name="back" size={14} />Todos os projetos</button><button type="button" onClick={() => { setFolderPath(project.path); setForm({ kind: 'open' }); }}><Icon name="folder" size={14} />Trocar pasta</button></div></aside>
          <main className="project-editing" aria-busy={pending}><div className="project-tabs" role="tablist" aria-label="Arquivos abertos">{buffers.map(file => <div className={`project-tab${activePath === file.path ? ' is-active' : ''}`} key={file.path}><button type="button" role="tab" aria-selected={activePath === file.path} aria-controls="project-editor-panel" title={file.path} onClick={() => setActivePath(file.path)}><Icon name="file" size={14} />{file.name}{file.content !== file.original && <i className="project-dirty-dot" aria-label="Alterações não salvas" />}</button><button type="button" aria-label={`Fechar arquivo ${file.name}`} disabled={pending || saving.has(file.path)} onClick={() => closeFile(file.path)}><Icon name="close" size={12} /></button></div>)}</div>{active ? <><div className="project-file-toolbar"><div className="project-breadcrumb" title={active.path}><Icon name="folder" size={13} /><span>{active.path.split('/').join(' / ')}</span></div><button type="button" aria-label="Recarregar arquivo" title="Recarregar do servidor" onClick={reloadFile}><Icon name="refresh" size={15} /></button><a aria-label={`Baixar ${active.name}`} title="Baixar arquivo salvo" href={connected ? `/api/projects/download?path=${encodeURIComponent(active.path)}${access?.scope ? `&scope=${encodeURIComponent(access.scope)}` : ''}` : undefined} aria-disabled={!connected || undefined} tabIndex={connected ? undefined : -1} onClick={event => { if (!connected) event.preventDefault(); }} download><Icon name="download" size={15} /></a><button type="button" className="project-save" aria-label="Salvar arquivo" title="Salvar (Ctrl+S)" disabled={pending || !canWrite || saving.has(active.path) || active.content === active.original} onClick={() => saveFile(active.path).catch(() => {})}>{saving.has(active.path) ? <span className="spinner" /> : <Icon name="save" size={14} />}<span>{saving.has(active.path) ? 'Salvando' : 'Salvar'}</span></button></div><div id="project-editor-panel" className="project-editor-panel" role="tabpanel" aria-label={active.name}><ProjectEditor key={active.path} file={active} readOnly={!canWrite || pending || guardPending} onChange={content => setBuffers(current => current.map(item => item.path === active.path ? { ...item, content } : item))} onSave={() => saveFile(active.path).catch(() => {})} /></div></> : <div className="project-editor-welcome"><span className="project-editor-emblem"><Icon name="folder" size={42} /></span><span className="project-eyebrow">SEU PROJETO, ABERTO</span><h2>{project.name}</h2><p>Escolha um arquivo no explorador para começar.<br />Seu código é salvo diretamente na VPS.</p><div><span><kbd>Ctrl</kbd><kbd>S</kbd> Salvar arquivo</span><span><kbd>Tab</kbd> Recuar código</span></div><button type="button" className="subtle-button project-mobile-show-tree" onClick={() => setMobileTree(true)}><Icon name="folder" size={16} />Explorar arquivos</button></div>}{openingFile && <div className="project-opening-file" role="status"><span className="spinner" />Abrindo {basename(openingFile)}…</div>}</main>
        </div><footer className="project-workspace-status"><span><Icon name="branch" size={13} />{!git ? 'Consultando Git…' : git.unavailable ? 'Git indisponível' : git.isGit ? git.branch || 'Sem branch' : 'Sem repositório Git'}</span>{git?.isGit && <span>{git.changedCount || 0} alterações no Git</span>}<span className="project-workspace-path" title={project.path}>{project.path}</span><span>{dirty.length ? `${dirty.length} arquivo${dirty.length > 1 ? 's' : ''} não salvo${dirty.length > 1 ? 's' : ''}` : canWrite ? 'Pronto para editar' : 'Somente leitura'}</span></footer>
      </>}
      {notice && <div className="project-notice" role="status"><span>{notice}</span><button type="button" aria-label="Fechar notificação" onClick={() => setNotice('')}>×</button></div>}
      {(form || guard) && <div className="project-modal-backdrop"><section className="project-modal" role="dialog" aria-modal="true" aria-label={guard?.title || (form?.kind === 'clone' ? 'Clonar repositório' : form?.kind === 'open' ? 'Abrir pasta' : form?.type === 'directory' ? 'Nova pasta' : 'Novo arquivo')}><div className="project-modal-heading"><h2>{guard?.title || (form?.kind === 'clone' ? 'Clonar repositório' : form?.kind === 'open' ? 'Abrir pasta' : form?.type === 'directory' ? 'Nova pasta' : 'Novo arquivo')}</h2><button type="button" aria-label="Fechar diálogo de projetos" disabled={pending || guardPending} onClick={() => { setForm(null); setGuard(null); }}><Icon name="close" size={18} /></button></div>{error && <p className="project-modal-error" role="alert">{error}</p>}{guard ? <><p>{guard.description}</p><div className="project-guard-files">{guard.paths.map(path => <span key={path}><i className="project-dirty-dot" />{basename(path)}</span>)}</div><div className="project-modal-actions"><button type="button" className="project-discard" disabled={guardPending} onClick={() => resolveGuard(false)}>Descartar alterações</button><button type="button" className="subtle-button" disabled={guardPending} onClick={() => setGuard(null)}>Cancelar</button><button type="button" className="primary" disabled={guardPending || !canWrite} onClick={() => resolveGuard(true)}>{guardPending ? 'Salvando…' : 'Salvar e continuar'}</button></div></> : form?.kind === 'clone' ? <form onSubmit={clone}><p>O Git clonará o repositório diretamente na sua VPS.</p><label>URL do repositório<input autoFocus required type="text" aria-label="URL do repositório" placeholder="https://github.com/usuario/projeto.git" value={url} onChange={event => setUrl(event.target.value)} disabled={pending} /></label><label>Nome da pasta <span>opcional</span><input aria-label="Nome da pasta do repositório" placeholder="Nome do repositório" value={name} onChange={event => setName(event.target.value)} disabled={pending} /></label><label>Pasta de destino<input required aria-label="Pasta de destino" value={parent} onChange={event => setParent(event.target.value)} disabled={pending} /></label>{pending && <p className="project-clone-progress" role="status"><span className="spinner" />Clonando com Git… aguarde a conclusão.</p>}<div className="project-modal-actions"><button type="button" className="subtle-button" disabled={pending} onClick={() => setForm(null)}>Cancelar</button><button className="primary" disabled={pending || !canWrite}>{pending ? 'Clonando…' : 'Clonar e abrir'}</button></div></form> : form?.kind === 'open' ? <form onSubmit={event => { event.preventDefault(); openProject(folderPath); }}><p>Informe uma pasta dentro do workspace da conexão atual. Use <code>.</code> para abrir a raiz.</p><label>Caminho da pasta<input autoFocus required aria-label="Caminho da pasta" placeholder="projects/meu-projeto" value={folderPath} onChange={event => setFolderPath(event.target.value)} disabled={pending} /></label><div className="project-modal-actions"><button type="button" className="subtle-button" disabled={pending} onClick={() => setForm(null)}>Cancelar</button><button className="primary" disabled={pending}>{pending ? 'Abrindo…' : 'Abrir projeto'}</button></div></form> : <form onSubmit={createEntry}><p>Crie {form.type === 'directory' ? 'uma pasta' : 'um arquivo'} no projeto aberto.</p><label>Nome<input autoFocus required aria-label={form.type === 'directory' ? 'Nome da nova pasta' : 'Nome do novo arquivo'} value={entryName} onChange={event => setEntryName(event.target.value)} disabled={pending} placeholder={form.type === 'directory' ? 'src' : 'novo-arquivo.js'} /></label><label>Pasta<input required aria-label="Pasta do novo item" value={entryParent} onChange={event => setEntryParent(event.target.value)} disabled={pending} /></label><div className="project-modal-actions"><button type="button" className="subtle-button" disabled={pending} onClick={() => setForm(null)}>Cancelar</button><button className="primary" disabled={pending || !canWrite}>{pending ? 'Criando…' : form.type === 'directory' ? 'Criar pasta' : 'Criar arquivo'}</button></div></form>}</section></div>}
    </section>
  </div>;
}
