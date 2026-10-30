import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import '../terminal.css';

/** A real SSH PTY. Chat approval/sandbox rules do not apply to manually typed commands. */
export default function TerminalPanel({ csrf, onClose, onError, onUnauthorized }) {
  const host = useRef(null), terminal = useRef(null), fit = useRef(null), identifier = useRef(null), events = useRef(null);
  const inputQueue = useRef(''), sending = useRef(false), alive = useRef(true), resizeTimer = useRef(null);
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose;
  const handlers = useRef({ onError, onUnauthorized }); handlers.current = { onError, onUnauthorized };
  const [state, setState] = useState('opening'), [problem, setProblem] = useState(''), [details, setDetails] = useState(null);
  const [revision, setRevision] = useState(0);

  const call = useCallback(async (path, { method = 'POST', body, ...options } = {}) => {
    const response = await fetch(`/api${path}`, { method, credentials: 'same-origin', ...options, headers: { 'X-CSRF-Token': csrf, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { const error = Object.assign(new Error(result.error || 'Não foi possível acessar o terminal.'), { status: response.status }); if (response.status === 401) handlers.current.onUnauthorized?.(error); throw error; }
    return result;
  }, [csrf]);

  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement;
    const term = new Terminal({ cursorBlink: true, fontSize: 13, fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace', scrollback: 3000, allowProposedApi: false, theme: { background: '#101514', foreground: '#e1e8e2', cursor: '#a4e7c1', selectionBackground: '#59846e66', black: '#17201b', red: '#ed9c93', green: '#a4e7c1', yellow: '#e0cc99', blue: '#a4bddb', magenta: '#c8add8', cyan: '#a1d8d1', white: '#e1e8e2', brightBlack: '#87978d', brightRed: '#ffb4a9', brightGreen: '#c1f3d5', brightYellow: '#f5e1b1', brightBlue: '#b8d4f5', brightMagenta: '#e0c6ed', brightCyan: '#b2ece4', brightWhite: '#fff' } });
    const fitter = new FitAddon();
    term.loadAddon(fitter); term.open(host.current); terminal.current = term; fit.current = fitter;
    let disposed = false, openedId = null, observer, reconnectTimer;
    const fail = error => { if (disposed) return; setProblem(error.message); setState('failed'); handlers.current.onError?.(error); };
    const fitNow = () => {
      if (disposed) return;
      try { fitter.fit(); } catch {}
      clearTimeout(resizeTimer.current);
      resizeTimer.current = setTimeout(() => { if (!disposed && identifier.current) call(`/terminal/${identifier.current}/resize`, { body: { cols: Math.max(20, Math.min(300, term.cols)), rows: Math.max(5, Math.min(120, term.rows)) } }).catch(fail); }, 180);
    };
    const flush = async () => {
      if (sending.current || !identifier.current || disposed) return;
      sending.current = true;
      try {
        while (inputQueue.current && !disposed && identifier.current) {
          // At most 8192 bytes even when every UTF-16 unit encodes as four bytes.
          const data = inputQueue.current.slice(0, 2048); inputQueue.current = inputQueue.current.slice(data.length);
          await call(`/terminal/${identifier.current}/input`, { body: { data } });
        }
      } catch (error) { inputQueue.current = ''; fail(error); }
      finally { sending.current = false; }
    };
    const dataListener = term.onData(data => {
      if (!identifier.current || disposed) return;
      if (data.length + inputQueue.current.length > 32768) { setProblem('A entrada é muito grande. Cole trechos menores no terminal.'); return; }
      inputQueue.current += data; flush();
    });
    term.writeln('\x1b[90mConectando ao terminal da VPS…\x1b[0m');
    requestAnimationFrame(() => {
      if (disposed) return;
      fitNow();
      call('/terminal/open', { body: { cols: Math.max(20, Math.min(300, term.cols)), rows: Math.max(5, Math.min(120, term.rows)) } }).then(data => {
        openedId = data.id;
        if (disposed) { call(`/terminal/${data.id}`, { method: 'DELETE', keepalive: true }).catch(() => {}); return; }
        identifier.current = data.id; setDetails(data); setState('connected'); term.clear();
        const source = new EventSource(`/api/terminal/${data.id}/events`, { withCredentials: true }); events.current = source;
        source.addEventListener('output', event => { if (!disposed) { try { term.write(JSON.parse(event.data).data); } catch {} } });
        source.addEventListener('ready', () => { if (!disposed) { clearTimeout(reconnectTimer); setState('connected'); setProblem(''); term.focus(); } });
        source.addEventListener('closed', event => {
          if (disposed) return;
          let message = 'Terminal encerrado.'; try { message = JSON.parse(event.data).message || message; } catch {}
          clearTimeout(reconnectTimer); source.close(); identifier.current = null; inputQueue.current = ''; setState('closed'); term.writeln(`\r\n\x1b[90m${message}\x1b[0m`);
        });
        source.onerror = () => { if (!disposed) { setState('reconnecting'); setProblem('A conexão do terminal foi interrompida. Reconectando…'); clearTimeout(reconnectTimer); reconnectTimer = setTimeout(() => { if (disposed) return; source.close(); identifier.current = null; inputQueue.current = ''; setState('failed'); setProblem('Não foi possível restabelecer o terminal. Confira sua conexão SSH e abra novamente.'); }, 8000); } };
        fitNow();
      }).catch(fail);
      observer = new ResizeObserver(fitNow); observer.observe(host.current);
    });
    const key = event => {
      if (event.key === 'Escape' && !host.current?.contains(document.activeElement)) { event.preventDefault(); onCloseRef.current?.(); }
      if (event.key === 'Tab') {
        const dialog = host.current?.closest('[role="dialog"]');
        const nodes = [...(dialog?.querySelectorAll('button:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || [])].filter(node => node.getClientRects().length);
        const first = nodes[0], last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      disposed = true; alive.current = false; clearTimeout(reconnectTimer); clearTimeout(resizeTimer.current); observer?.disconnect(); dataListener.dispose(); document.removeEventListener('keydown', key);
      events.current?.close(); events.current = null; inputQueue.current = ''; identifier.current = null; terminal.current = null; fit.current = null; term.dispose();
      if (openedId) call(`/terminal/${openedId}`, { method: 'DELETE', keepalive: true }).catch(() => {});
      previous?.focus();
    };
  }, [call, revision]);

  function control(value) {
    if (state !== 'connected' || !identifier.current) return;
    // Route virtual keys through xterm so normal input ordering and queue limits apply.
    terminal.current?.input(value, true); terminal.current?.focus();
  }
  function reconnect() { setProblem(''); setState('opening'); setDetails(null); setRevision(value => value + 1); }
  return <div className="terminal-backdrop"><section className="terminal-panel" role="dialog" aria-modal="true" aria-labelledby="terminal-title"><header className="terminal-heading"><div><div className="terminal-heading-title"><span className={`terminal-state ${state}`} /><h2 id="terminal-title">Terminal do admin</h2><span className="terminal-mode">SSH</span></div><p>{details ? `${details.username}@VPS · ${details.workspace}` : 'Conexão direta com sua VPS'}</p></div><div className="terminal-window-actions"><button type="button" className="icon-button" title="Limpar tela" aria-label="Limpar terminal" onClick={() => terminal.current?.clear()}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6" /></svg></button><button type="button" className="icon-button" title="Fechar terminal" aria-label="Fechar terminal" onClick={onClose}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div></header><div className="terminal-notice"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /></svg><p>Os comandos são executados diretamente com seu usuário SSH. As aprovações e o sandbox do chat não se aplicam ao terminal manual.</p></div>{problem && <div className="terminal-problem" role="alert"><span>{problem}</span>{['failed', 'closed', 'reconnecting'].includes(state) && <button type="button" className="subtle-button" onClick={reconnect}>Reconectar</button>}</div>}<div className="terminal-screen" ref={host} aria-label="Terminal interativo SSH" /><footer className="terminal-footer"><div className="terminal-virtual-keys"><button type="button" disabled={state !== 'connected'} onClick={() => control('\x03')}>Ctrl C</button><button type="button" disabled={state !== 'connected'} onClick={() => control('\x04')}>Ctrl D</button><button type="button" disabled={state !== 'connected'} onClick={() => control('\t')}>Tab</button><button type="button" disabled={state !== 'connected'} onClick={() => control('\x1b')}>Esc</button><button type="button" disabled={state !== 'connected'} aria-label="Comando anterior" onClick={() => control('\x1b[A')}>↑</button><button type="button" disabled={state !== 'connected'} aria-label="Comando seguinte" onClick={() => control('\x1b[B')}>↓</button></div><span className="terminal-footer-state" role="status">{state === 'connected' ? 'Conectado' : state === 'opening' ? 'Conectando…' : state === 'reconnecting' ? 'Reconectando…' : state === 'closed' ? 'Encerrado' : 'Indisponível'}</span>{state === 'closed' && <button type="button" className="subtle-button" onClick={reconnect}>Abrir novamente</button>}</footer></section></div>;
}
