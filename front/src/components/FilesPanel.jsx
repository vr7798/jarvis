import { useEffect, useRef, useState } from 'react';

function FileIcon({ folder = false }) {
  return <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">{folder ? <path d="M3 6h7l2 2h9v12H3V6Z" /> : <><path d="M5 3h9l5 5v13H5V3Z" /><path d="M14 3v6h5M8 13h8M8 17h5" /></>}</svg>;
}
const formatSize = value => { const size = Number(value) || 0; return size < 1024 ? `${size} B` : size < 1024 ** 2 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 ** 2).toFixed(1)} MB`; };

export default function FilesPanel({ conversationId, onClose, onError }) {
  const [path, setPath] = useState('.');
  const [listing, setListing] = useState(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const ref = useRef(null);
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose;
  const onErrorRef = useRef(onError); onErrorRef.current = onError;
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.focus();
    const key = event => {
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); }
      if (event.key === 'Tab') {
        const controls = [...ref.current.querySelectorAll('button:not(:disabled),a[href]')];
        const first = controls[0], last = controls.at(-1);
        if (!controls.length) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setPending(true); setError('');
    fetch(`/api/files?path=${encodeURIComponent(path)}`, { credentials: 'same-origin', signal: controller.signal }).then(async response => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { const failure = new Error(data.error || 'Não foi possível carregar os arquivos.'); failure.status = response.status; throw failure; }
      if (!controller.signal.aborted) setListing(data);
    }).catch(err => {
      if (controller.signal.aborted) return;
      setListing(null); setError(err.message); if (err.status === 401) onErrorRef.current?.(err);
    }).finally(() => { if (!controller.signal.aborted) setPending(false); });
    return () => controller.abort();
  }, [path, revision]);
  const current = listing?.path || path;
  const files = Array.isArray(listing?.files) ? [...listing.files].sort((a, b) => (a.type === 'directory' ? -1 : 1) - (b.type === 'directory' ? -1 : 1) || a.name.localeCompare(b.name, 'pt-BR')) : [];
  const parent = () => { const parts = String(current).split('/').filter(p => p && p !== '.'); parts.pop(); setPath(parts.join('/') || '.'); };
  return <div className="files-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><section className="files-panel" ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="files-title"><header><div><span className="files-eyebrow">LUCK ADMIN</span><h2 id="files-title">Arquivos do workspace</h2></div><button className="icon-button" aria-label="Fechar arquivos" onClick={onClose}>×</button></header><p className="files-description">Navegue pelos arquivos da pasta de trabalho. Baixe imagens, documentos e entregas criadas pelo Luck.</p><div className="files-toolbar"><button className="subtle-button" onClick={() => setPath('.')} disabled={pending || current === '.'}>Início</button><button className="subtle-button" aria-label="Pasta anterior" onClick={parent} disabled={pending || current === '.'}>↑</button><code title={current}>{current === '.' ? 'Workspace' : current}</code><button className="icon-button" title="Atualizar arquivos" aria-label="Atualizar arquivos" onClick={() => setRevision(n => n + 1)} disabled={pending}>↻</button></div><div className="files-list" aria-busy={pending}>{pending ? <div className="files-empty" role="status"><span className="spinner" />Carregando arquivos…</div> : error ? <div className="files-empty files-error" role="alert"><p>{error}</p><button className="subtle-button" onClick={() => setRevision(n => n + 1)}>Tentar novamente</button></div> : files.length ? files.map(file => <div className="workspace-file" key={file.path}><span className={`workspace-file-icon ${file.type === 'directory' ? 'is-folder' : ''}`}><FileIcon folder={file.type === 'directory'} /></span>{file.type === 'directory' ? <button className="workspace-file-name" onClick={() => setPath(file.path)}><strong>{file.name}</strong><small>Pasta</small></button> : <div className="workspace-file-name"><strong title={file.name}>{file.name}</strong><small>{formatSize(file.size)}</small></div>}{file.type === 'directory' ? <button className="icon-button" aria-label={`Abrir pasta ${file.name}`} onClick={() => setPath(file.path)}>›</button> : conversationId ? <a className="file-download" href={`/api/conversations/${encodeURIComponent(conversationId)}/files?path=${encodeURIComponent(file.path)}`} download aria-label={`Baixar ${file.name}`}><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" /></svg><span>Baixar</span></a> : <span className="file-conversation-note">Abra uma conversa para baixar</span>}</div>) : <div className="files-empty"><FileIcon folder /><p>Esta pasta está vazia.</p></div>}</div><footer>O acesso é limitado ao workspace da conexão atual. Para enviar um arquivo ao Luck, use o botão de anexo na mensagem.</footer></section></div>;
}
