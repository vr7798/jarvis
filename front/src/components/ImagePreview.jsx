import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import '../image-preview.css';

function safeImageUrl(value) {
  if (typeof value !== 'string' || !value.startsWith('/api/') || value.startsWith('//')) return false;
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin && (/^\/api\/conversations\/[^/]+\/files$/.test(url.pathname) || /^\/api\/attachments\/[a-f0-9-]+$/i.test(url.pathname));
  } catch { return false; }
}

function ExpandIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5M3 3l6 6m12-6-6 6M3 21l6-6m12 6-6-6" /></svg>; }
function DownloadIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" /></svg>; }

function ImageLightbox({ src, downloadUrl, title, onClose }) {
  const ref = useRef(null), close = useRef(onClose); close.current = onClose;
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const previous = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; ref.current?.focus();
    const key = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key !== 'Tab') return;
      const controls = [...ref.current.querySelectorAll('button:not(:disabled), a[href]')];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('keydown', key, true); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return createPortal(<div className="luck-image-lightbox-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><section ref={ref} className="luck-image-lightbox" role="dialog" aria-modal="true" aria-labelledby="luck-image-lightbox-title" tabIndex={-1}><header><div><span>IMAGEM DO WORKSPACE</span><h2 id="luck-image-lightbox-title">{title}</h2></div><button type="button" className="icon-button" aria-label="Fechar imagem ampliada" onClick={onClose}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></header><div className="luck-image-lightbox-canvas">{failed ? <p role="alert">Não foi possível carregar esta imagem. Você ainda pode tentar baixar o arquivo.</p> : <img src={src} alt={title} onError={() => setFailed(true)} />}</div><footer><span>Prévia do arquivo salvo na sua pasta de trabalho</span><a className="image-download" href={downloadUrl} download><DownloadIcon />Baixar imagem</a></footer></section></div>, document.body);
}

/** Only authenticated image routes can be used for rich previews. */
export default function ImagePreview({ src, downloadUrl, alt = '', title = '' }) {
  const [state, setState] = useState('loading'), [expanded, setExpanded] = useState(false), [attempt, setAttempt] = useState(0);
  const label = String(title || alt || 'Imagem criada pelo Luck').slice(0, 180);
  useEffect(() => { setState('loading'); setExpanded(false); }, [src]);
  if (!safeImageUrl(src) || !safeImageUrl(downloadUrl)) return null;
  return <span className={`luck-image-preview generated-image is-${state}`} role="group" aria-label={`Prévia: ${label}`}>
    <span className="luck-image-preview-canvas">
      {state === 'loading' && <span className="luck-image-skeleton" role="status"><span className="spinner" />Carregando imagem…</span>}
      {state === 'failed' && <span className="luck-image-error" role="status"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" /><path d="m3 17 6-6 4 4 3-3 5 5M7 7h.01" /></svg><strong>Prévia indisponível</strong><span>Confira a conexão ou tente baixar o arquivo.</span><button type="button" onClick={() => { setState('loading'); setAttempt(value => value + 1); }}>Tentar novamente</button></span>}
      <button type="button" className="luck-image-open" aria-label={`Ampliar imagem: ${label}`} disabled={state !== 'loaded'} onClick={() => setExpanded(true)}>
        <img key={`${src}:${attempt}`} src={src} alt={alt || label} loading="lazy" onLoad={() => setState('loaded')} onError={() => setState('failed')} />
        {state === 'loaded' && <span className="luck-image-expand"><ExpandIcon /><span>Ampliar</span></span>}
      </button>
    </span>
    <span className="luck-image-preview-footer"><span className="luck-image-caption" title={label}>{label}</span><a className="image-download generated-file-link" href={downloadUrl} download><DownloadIcon /><span>Baixar imagem</span></a></span>
    {expanded && <ImageLightbox src={src} downloadUrl={downloadUrl} title={label} onClose={() => setExpanded(false)} />}
  </span>;
}
