import { Children, isValidElement, memo, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ImagePreview from './ImagePreview.jsx';

function CodeBlock({ children }) {
  const code = Children.toArray(children).find(isValidElement);
  const language = /language-([^\s]+)/.exec(code?.props.className || '')?.[1] || 'código';
  const text = String(code?.props.children || '').replace(/\n$/, '');
  const [feedback, setFeedback] = useState('');
  const timeout = useRef(null);
  useEffect(() => () => clearTimeout(timeout.current), []);
  async function copy() {
    clearTimeout(timeout.current);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('unavailable');
      await navigator.clipboard.writeText(text);
      setFeedback('Copiado!');
    } catch { setFeedback('Não foi possível copiar'); }
    timeout.current = setTimeout(() => setFeedback(''), 2200);
  }
  return <div className="code-block">
    <div className="code-header"><span>{language}</span><button type="button" onClick={copy} aria-label="Copiar código"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V4H4v12h4" /></svg><span aria-live="polite">{feedback || 'Copiar código'}</span></button></div>
    <pre><code className={code?.props.className}>{text}</code></pre>
  </div>;
}

export function workspaceDownloadUrl(value, conversationId, workspace, preview = false) {
  if (!value || !conversationId || typeof value !== 'string') return null;
  if (/^(?:https?:|mailto:|#|\/\/|\/api\/)/i.test(value)) return null;
  let path = value.replace(/^(?:sandbox:|file:\/\/)/i, '');
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return null;
  path = path.replace(/#(?:L)?\d+(?:[-:]\d+)?$/, '');
  const underWorkspace = workspace && (path === workspace || path.startsWith(`${workspace.replace(/\/$/, '')}/`));
  const looksLikeFile = /\.[a-z0-9]{1,12}$/i.test(path);
  if (!underWorkspace && !looksLikeFile && !/^(?:sandbox:|file:)/i.test(value)) return null;
  return `/api/conversations/${encodeURIComponent(conversationId)}/files?path=${encodeURIComponent(path)}${preview ? '&preview=1' : ''}`;
}
const rasterImage = value => typeof value === 'string' && /\.(?:png|jpe?g|webp|gif)(?:#(?:L)?\d+(?:[-:]\d+)?)?$/i.test(value);
function imageKey(value, conversationId, workspace) {
  const endpoint = workspaceDownloadUrl(value, conversationId, workspace);
  if (!endpoint || !rasterImage(value)) return null;
  try {
    const file = new URL(endpoint, 'https://luck.invalid').searchParams.get('path');
    const base = `${String(workspace || '/').replace(/\/$/, '')}/`;
    return new URL(file.startsWith('/') ? file : base + file, 'https://luck.invalid').pathname;
  } catch { return endpoint; }
}
function walk(node, callback) { callback(node); for (const child of node.children || []) walk(child, callback); }
function previewImages({ conversationId, workspace }) {
  return tree => {
    const explicit = new Set(), shown = new Set();
    walk(tree, node => { if (node.type === 'image') { const key = imageKey(node.url, conversationId, workspace); if (key) explicit.add(key); } });
    walk(tree, node => {
      if (!['image', 'link'].includes(node.type)) return;
      const key = imageKey(node.url, conversationId, workspace);
      if (!key) return;
      let mode;
      if (node.type === 'image') { mode = shown.has(key) ? 'hidden' : 'preview'; shown.add(key); }
      else if (node.children?.some(child => child.type === 'image')) mode = 'wrapper';
      else if (!explicit.has(key) && !shown.has(key)) { mode = 'preview'; shown.add(key); }
      else mode = 'download';
      node.data = { ...node.data, hProperties: { ...node.data?.hProperties, 'data-luck-image-mode': mode } };
    });
  };
}
const fileName = value => { try { return decodeURIComponent(value.replace(/^(?:sandbox:|file:\/\/)/i, '').split('/').at(-1) || 'Imagem criada pelo Luck'); } catch { return 'Imagem criada pelo Luck'; } };

/** Local image links display real authenticated previews. Raw HTML is never interpreted. */
function MarkdownMessage({ text = '', children, conversationId, workspace }) {
  const plugins = useMemo(() => [remarkGfm, [previewImages, { conversationId, workspace }]], [conversationId, workspace]);
  const components = useMemo(() => ({
    pre: CodeBlock,
    a: ({ node, children, href, 'data-luck-image-mode': mode, ...props }) => {
      const file = workspaceDownloadUrl(href, conversationId, workspace);
      const image = rasterImage(href) && workspaceDownloadUrl(href, conversationId, workspace, true);
      if (mode === 'wrapper' || node.children?.some(child => child.tagName === 'img')) return <span className="luck-image-link-wrap">{children}</span>;
      if (file && image && mode === 'preview') return <ImagePreview src={image} downloadUrl={file} title={fileName(href)} />;
      return <a {...props} href={file || href} target="_blank" rel="noopener noreferrer" className={file ? 'generated-file-link' : undefined} {...(file ? { download: true } : {})}>{children}{file && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-label="Baixar arquivo"><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" /></svg>}</a>;
    },
    img: ({ node, src, alt, 'data-luck-image-mode': mode, ...props }) => {
      if (mode === 'hidden') return null;
      const image = rasterImage(src) && workspaceDownloadUrl(src, conversationId, workspace, true);
      const download = image && workspaceDownloadUrl(src, conversationId, workspace);
      if (!image) return <img {...props} src={src} alt={alt || ''} loading="lazy" />;
      return <ImagePreview src={image} downloadUrl={download} alt={alt || ''} title={alt || fileName(src)} />;
    },
    table: ({ node, children, ...props }) => <div className="markdown-table-wrap" tabIndex={0} role="region" aria-label="Tabela da resposta"><table {...props}>{children}</table></div>,
  }), [conversationId, workspace]);
  const transform = value => workspaceDownloadUrl(value, conversationId, workspace) ? value : defaultUrlTransform(value);
  return <div className="markdown-content"><ReactMarkdown remarkPlugins={plugins} components={components} urlTransform={transform} skipHtml>{String(children ?? text)}</ReactMarkdown></div>;
}

/** Read formatting as ordinary prose when using browser speech synthesis. */
export function plainText(text = '') {
  return String(text)
    .replace(/```[^\n]*\n([\s\S]*?)```/g, '$1')
    .replace(/~~~[^\n]*\n([\s\S]*?)~~~/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<https?:\/\/[^>]+>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/gm, '')
    .replace(/^\s*(?:[-*_]\s*){3,}$/gm, '')
    .replace(/\[([ xX])\]\s*/g, '')
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1')
    .replace(/\|/g, ', ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default memo(MarkdownMessage);
