import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { createTerminalInput } from './terminalInput.js';
import { TERMINAL_THEMES, loadTerminalPreferences, saveTerminalPreferences } from './terminalPreferences.js';
import '@xterm/xterm/css/xterm.css';
import '../terminal.css';

function Glyph({ name, size = 18 }) {
  const paths = {
    terminal: <><path d="m4 5 7 7-7 7M13 19h7" /></>,
    hide: <><path d="M4 12h16m-6-6 6 6-6 6" /></>,
    expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />,
    collapse: <path d="M3 8h5V3m8 0v5h5M8 21v-5H3m13 5v-5h5" />,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V3H3v13h5" /></>,
    paste: <><path d="M9 5H5v16h14V5h-4" /><rect x="9" y="2" width="6" height="5" rx="1" /><path d="M8 12h8m-8 4h5" /></>,
    clear: <><path d="m4 16 9-12 7 5-9 12H8l-4-5ZM9 10l7 5M13 21h8" /></>,
    exit: <><path d="M10 3H4v18h6m4-14 5 5-5 5m-5-5h12" /></>,
    check: <path d="m5 12 4 4L19 6" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const sizeOf = term => ({ cols: Math.max(20, Math.min(300, term.cols)), rows: Math.max(5, Math.min(120, term.rows)) });
const stateLabels = { opening: 'Conectando', connected: 'Conectado', reconnecting: 'Reconectando', closed: 'Encerrado', failed: 'Indisponível' };
const extraKeys = [['Esc', '\x1b'], ['Tab', '\t'], ['Home', '\x1b[H'], ['↑', '\x1b[A', 'Comando anterior'], ['End', '\x1b[F'], ['/', '/'], ['−', '-'], ['|', '|'], ['←', '\x1b[D', 'Mover cursor à esquerda'], ['↓', '\x1b[B', 'Comando seguinte'], ['→', '\x1b[C', 'Mover cursor à direita']];

/** A real SSH PTY. Hiding the drawer keeps this component and the shell alive. */
export default function TerminalPanel({ csrf, visible = true, initialDirectory = null, onClose, onExit, onError, onUnauthorized }) {
  const host = useRef(null), panel = useRef(null), terminal = useRef(null), identifier = useRef(null);
  const visibleRef = useRef(visible); visibleRef.current = visible;
  const handlers = useRef({ onClose, onError, onUnauthorized }); handlers.current = { onClose, onError, onUnauthorized };
  const refit = useRef(() => {}), previousFocus = useRef(null), swipe = useRef(null), noticeTimer = useRef(null);
  const modifiersRef = useRef({ ctrl: false, alt: false });
  const [modifiers, setModifiers] = useState(modifiersRef.current);
  const [preferences, setPreferences] = useState(loadTerminalPreferences);
  const preferencesRef = useRef(preferences); preferencesRef.current = preferences;
  const [state, setState] = useState('opening'), [problem, setProblem] = useState(''), [details, setDetails] = useState(null);
  const [revision, setRevision] = useState(0), [fullscreen, setFullscreen] = useState(false), [notice, setNotice] = useState('');
  const [dimensions, setDimensions] = useState({ cols: 0, rows: 0 });
  const [viewport, setViewport] = useState(null);
  const palette = TERMINAL_THEMES[preferences.theme] || TERMINAL_THEMES.obsidian;

  const call = useCallback(async (path, { method = 'POST', body, ...options } = {}) => {
    const response = await fetch(`/api${path}`, { method, credentials: 'same-origin', ...options, headers: { 'X-CSRF-Token': csrf, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = Object.assign(new Error(result.error || 'Não foi possível acessar o terminal.'), { status: response.status });
      if (response.status === 401) handlers.current.onUnauthorized?.(error);
      throw error;
    }
    return result;
  }, [csrf]);

  useEffect(() => { saveTerminalPreferences(preferences); }, [preferences]);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setViewport({ height: Math.round(vv.height), top: Math.round(vv.offsetTop) });
    update(); vv.addEventListener('resize', update); vv.addEventListener('scroll', update);
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
  }, []);

  useEffect(() => {
    const initial = preferencesRef.current;
    const term = new Terminal({ cursorBlink: true, cursorStyle: 'bar', fontSize: initial.fontSize, fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace', lineHeight: 1.18, scrollback: 5000, allowProposedApi: false, theme: TERMINAL_THEMES[initial.theme].theme });
    const fitter = new FitAddon();
    term.loadAddon(fitter); term.open(host.current); terminal.current = term;
    term.attachCustomKeyEventHandler(event => !((event.ctrlKey || event.metaKey) && event.code === 'Backquote'));
    let disposed = false, openedId = null, source = null, input = null, reconnectTimer, resizeTimer, fitFrame, openFrame;
    let lastSize = '';
    const fail = error => {
      if (disposed) return;
      setProblem(error.message); setState('failed');
      // Keep recoverable terminal failures within the drawer.
      if (error.status === 401) return;
    };
    const fitNow = () => {
      if (disposed || !visibleRef.current || !host.current?.clientWidth || !host.current?.clientHeight) return;
      try { fitter.fit(); } catch { return; }
      const size = sizeOf(term), signature = `${size.cols}:${size.rows}`;
      setDimensions(current => current.cols === size.cols && current.rows === size.rows ? current : size);
      clearTimeout(resizeTimer);
      if (!identifier.current || signature === lastSize) return;
      resizeTimer = setTimeout(() => {
        if (disposed || !visibleRef.current || !identifier.current || signature === lastSize) return;
        lastSize = signature;
        call(`/terminal/${identifier.current}/resize`, { body: size }).catch(fail);
      }, 100);
    };
    const scheduleFit = () => { cancelAnimationFrame(fitFrame); fitFrame = requestAnimationFrame(fitNow); };
    refit.current = scheduleFit;
    const dataListener = term.onData(value => {
      if (!identifier.current || disposed) return;
      let data = value;
      const armed = modifiersRef.current;
      if ((armed.ctrl || armed.alt) && data.length === 1) {
        if (armed.ctrl && /[a-zA-Z@\[\]\\^_? ]/.test(data)) data = data === '?' ? '\x7f' : String.fromCharCode(data === ' ' ? 0 : data.toUpperCase().charCodeAt(0) & 31);
        if (armed.alt) data = `\x1b${data}`;
        modifiersRef.current = { ctrl: false, alt: false }; setModifiers(modifiersRef.current);
      }
      if (!input?.write(data)) setProblem('A entrada é muito grande. Cole trechos menores no terminal.');
    });
    term.writeln('\x1b[90mAbrindo seu shell SSH…\x1b[0m');
    const observer = new ResizeObserver(scheduleFit); observer.observe(host.current);
    openFrame = requestAnimationFrame(() => {
      if (disposed) return;
      fitNow();
      const size = sizeOf(term); lastSize = `${size.cols}:${size.rows}`;
      call('/terminal/open', { body: size }).then(data => {
        openedId = data.id;
        if (disposed) { call(`/terminal/${data.id}`, { method: 'DELETE', keepalive: true }).catch(() => {}); return; }
        identifier.current = data.id; setDetails({ ...data, workspace: initialDirectory || data.workspace }); term.clear();
        input = createTerminalInput({ id: data.id, csrf, call, onError: error => { if (error.status === 401) handlers.current.onUnauthorized?.(error); fail(error); } });
        // This runs only in a newly opened shell, never in an existing foreground program.
        if (typeof initialDirectory === 'string' && initialDirectory.startsWith('/') && !/[\x00-\x1f\x7f]/.test(initialDirectory)) {
          const quoted = "'" + initialDirectory.replace(/'/g, "'\"'\"'") + "'";
          input.write(`cd -- ${quoted}\r`);
        }
        source = new EventSource(`/api/terminal/${data.id}/events`, { withCredentials: true });
        source.addEventListener('output', event => {
          if (disposed) return;
          try { const output = JSON.parse(event.data).data; if (typeof output === 'string') term.write(output); } catch {}
        });
        source.addEventListener('ready', () => {
          if (disposed) return;
          clearTimeout(reconnectTimer); setState('connected'); setProblem('');
          if (visibleRef.current) term.focus();
        });
        source.addEventListener('closed', event => {
          if (disposed) return;
          let message = 'Terminal encerrado.'; try { message = JSON.parse(event.data).message || message; } catch {}
          clearTimeout(reconnectTimer); source.close(); identifier.current = null; input?.close(); setState('closed');
          term.writeln(`\r\n\x1b[90m${message}\x1b[0m`);
        });
        source.onerror = () => {
          if (disposed) return;
          setState('reconnecting'); setProblem('Conexão interrompida. Tentando restabelecer o terminal…');
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => {
            if (disposed) return;
            source.close(); identifier.current = null; input?.close(); setState('failed');
            setProblem('Não foi possível restabelecer o terminal. Confira o SSH e abra uma nova sessão.');
          }, 10000);
        };
        scheduleFit();
      }).catch(fail);
    });
    return () => {
      disposed = true; clearTimeout(reconnectTimer); clearTimeout(resizeTimer); cancelAnimationFrame(fitFrame); cancelAnimationFrame(openFrame);
      observer.disconnect(); dataListener.dispose(); input?.close(); source?.close(); refit.current = () => {};
      identifier.current = null; terminal.current = null; term.dispose();
      if (openedId) call(`/terminal/${openedId}`, { method: 'DELETE', keepalive: true }).catch(() => {});
    };
  }, [call, revision, initialDirectory]);

  useEffect(() => {
    if (!terminal.current) return;
    terminal.current.options.theme = palette.theme;
    terminal.current.options.fontSize = preferences.fontSize;
    refit.current();
  }, [preferences, palette, revision]);

  useEffect(() => {
    if (!visible) return;
    previousFocus.current = document.activeElement;
    const frame = requestAnimationFrame(() => { refit.current(); terminal.current?.focus(); });
    const focusTerminal = () => { if (visibleRef.current && !panel.current?.contains(document.activeElement)) terminal.current?.focus(); };
    const key = event => {
      if (event.key === 'Escape' && !host.current?.contains(document.activeElement)) { event.preventDefault(); handlers.current.onClose?.(); return; }
      // xterm owns Tab while typing, including shell completion and Shift+Tab.
      if (event.key !== 'Tab' || host.current?.contains(document.activeElement)) return;
      const nodes = [...(panel.current?.querySelectorAll('button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || [])].filter(node => node.getClientRects().length);
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key); document.addEventListener('focusin', focusTerminal);
    return () => {
      cancelAnimationFrame(frame); document.removeEventListener('keydown', key); document.removeEventListener('focusin', focusTerminal);
      const previous = previousFocus.current;
      const target = previous?.isConnected && previous !== document.body && previous.getClientRects().length && !previous.closest('aside') ? previous : document.querySelector('.terminal-launcher, [aria-label="Abrir terminal"]');
      target?.focus({ preventScroll: true });
    };
  }, [visible]);

  function announce(message) { setNotice(message); clearTimeout(noticeTimer.current); noticeTimer.current = setTimeout(() => setNotice(''), 3500); }
  function control(value) { if (state !== 'connected' || !identifier.current) return; terminal.current?.input(value, true); terminal.current?.focus(); }
  function arm(key) { modifiersRef.current = { ...modifiersRef.current, [key]: !modifiersRef.current[key] }; setModifiers(modifiersRef.current); terminal.current?.focus(); }
  function reconnect() { setProblem(''); setState('opening'); setDetails(null); setModifiers({ ctrl: false, alt: false }); modifiersRef.current = { ctrl: false, alt: false }; setRevision(value => value + 1); }
  async function copySelection() {
    const selection = terminal.current?.getSelection();
    if (!selection) { announce('Selecione um trecho do terminal para copiar.'); return; }
    try { await navigator.clipboard.writeText(selection); announce('Seleção copiada.'); } catch { announce('Use Ctrl+Shift+C ou o menu do navegador para copiar.'); }
  }
  async function paste() {
    if (state !== 'connected') return;
    try {
      const text = await navigator.clipboard.readText();
      if (text.length > 30000) { announce('Cole trechos de até 30 mil caracteres.'); return; }
      modifiersRef.current = { ctrl: false, alt: false }; setModifiers(modifiersRef.current);
      terminal.current?.paste(text); terminal.current?.focus();
    } catch { announce('Permita o acesso à área de transferência ou use Ctrl+Shift+V.'); }
  }
  function headerDown(event) {
    if (event.button !== 0 || event.target.closest('button, select, input, a')) return;
    swipe.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function headerUp(event) {
    const start = swipe.current; swipe.current = null;
    if (start && start.id === event.pointerId && event.clientX - start.x > 75 && Math.abs(event.clientY - start.y) < 50) onClose?.();
  }

  const colorStyle = { '--term-bg': palette.theme.background, '--term-fg': palette.theme.foreground, '--term-accent': palette.accent, '--term-chrome': palette.chrome, '--term-border': palette.border, '--term-muted': palette.muted, ...(viewport ? { '--term-viewport-height': `${viewport.height}px`, '--term-viewport-top': `${viewport.top}px` } : {}) };
  return <div className={`terminal-backdrop${fullscreen ? ' is-fullscreen' : ''}`} data-theme={preferences.theme} hidden={!visible} inert={!visible ? true : undefined} aria-hidden={!visible || undefined} style={colorStyle}>
    <button className="terminal-scrim" type="button" tabIndex={-1} aria-label="Recolher terminal" onClick={onClose} />
    <section ref={panel} className="terminal-panel" role="dialog" aria-modal={visible ? 'true' : undefined} aria-labelledby="terminal-title">
      <header className="terminal-heading" onPointerDown={headerDown} onPointerUp={headerUp} onPointerCancel={() => { swipe.current = null; }}>
        <div className="terminal-brand"><span className="terminal-brand-icon"><Glyph name="terminal" size={21} /></span><div><div className="terminal-heading-title"><h2 id="terminal-title">Terminal<span>pro</span></h2><span className="terminal-mode">SSH</span></div><p>{details ? `${details.username}@VPS` : 'Seu servidor. Seu controle.'}</p></div></div>
        <div className="terminal-window-actions"><button type="button" title={fullscreen ? 'Sair da tela cheia' : 'Tela cheia'} aria-label={fullscreen ? 'Sair da tela cheia' : 'Tela cheia'} aria-pressed={fullscreen} onClick={() => setFullscreen(value => !value)}><Glyph name={fullscreen ? 'collapse' : 'expand'} /></button><button type="button" title="Recolher terminal e manter sessão" aria-label="Recolher terminal" onClick={onClose}><Glyph name="hide" size={20} /></button></div>
      </header>
      <div className="terminal-toolbar">
        <label className="terminal-theme-picker"><span className="terminal-color-dot" /><span className="sr-only">Tema do terminal</span><select aria-label="Tema do terminal" value={preferences.theme} onChange={event => setPreferences(current => ({ ...current, theme: event.target.value }))}>{Object.values(TERMINAL_THEMES).map(theme => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</select></label>
        <div className="terminal-font-controls" aria-label="Tamanho da fonte"><button type="button" aria-label="Diminuir fonte" disabled={preferences.fontSize <= 11} onClick={() => setPreferences(current => ({ ...current, fontSize: Math.max(11, current.fontSize - 1) }))}>A−</button><span>{preferences.fontSize}</span><button type="button" aria-label="Aumentar fonte" disabled={preferences.fontSize >= 22} onClick={() => setPreferences(current => ({ ...current, fontSize: Math.min(22, current.fontSize + 1) }))}>A+</button></div>
        <div className="terminal-tool-actions"><button type="button" title="Copiar seleção" aria-label="Copiar seleção" onClick={copySelection}><Glyph name="copy" size={16} /></button><button type="button" title="Colar" aria-label="Colar no terminal" disabled={state !== 'connected'} onClick={paste}><Glyph name="paste" size={16} /></button><button type="button" title="Limpar tela" aria-label="Limpar terminal" onClick={() => { terminal.current?.clear(); terminal.current?.focus(); }}><Glyph name="clear" size={17} /></button></div>
      </div>
      <div className="terminal-session-strip"><div className="terminal-session-tab"><span className={`terminal-state ${state}`} /><span>shell</span><span className="terminal-tab-number">01</span></div><span className="terminal-workspace" title={details?.workspace}>{details?.workspace || 'Conexão direta por SSH'}</span></div>
      {problem && <div className="terminal-problem" role="alert"><span>{problem}</span>{['failed', 'closed', 'reconnecting'].includes(state) && <button type="button" onClick={reconnect}>Nova sessão</button>}</div>}
      {state === 'closed' && !problem && <div className="terminal-problem"><span>A sessão do shell foi encerrada.</span><button type="button" onClick={reconnect}>Abrir novamente</button></div>}
      <div className="terminal-screen" ref={host} aria-label="Terminal interativo SSH" />
      <div className="terminal-extra-bar"><div className="terminal-modifier-keys"><button type="button" disabled={state !== 'connected'} aria-pressed={modifiers.ctrl} onClick={() => arm('ctrl')}>CTRL</button><button type="button" disabled={state !== 'connected'} aria-pressed={modifiers.alt} onClick={() => arm('alt')}>ALT</button><button type="button" disabled={state !== 'connected'} title="Interromper comando" onPointerDown={event => event.preventDefault()} onClick={() => control('\x03')}>^C</button><button type="button" disabled={state !== 'connected'} title="Fim de entrada" onPointerDown={event => event.preventDefault()} onClick={() => control('\x04')}>^D</button></div><div className="terminal-virtual-keys">{extraKeys.map(([label, value, accessible]) => <button key={label} type="button" disabled={state !== 'connected'} aria-label={accessible || label} onPointerDown={event => event.preventDefault()} onClick={() => control(value)}>{label}</button>)}</div></div>
      <footer className="terminal-footer"><span className="terminal-footer-state" role="status"><span className={`terminal-state ${state}`} />{stateLabels[state]}</span><span className="terminal-dimensions">{dimensions.cols ? `${dimensions.cols} × ${dimensions.rows}` : 'PTY'}<span>UTF-8</span></span><button className="terminal-exit" type="button" title="Encerrar sessão do terminal" aria-label="Encerrar sessão do terminal" onClick={onExit || onClose}><Glyph name="exit" size={14} /><span>Encerrar</span></button></footer>
      <p className="terminal-security-note">Comandos diretos com seu usuário SSH · recolher mantém a sessão ativa.</p>
      <div className={`terminal-toast${notice ? ' is-visible' : ''}`} role="status" aria-live="polite">{notice && <><Glyph name="check" size={16} />{notice}</>}</div>
    </section>
  </div>;
}
