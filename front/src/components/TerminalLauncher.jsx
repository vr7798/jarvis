import { useRef } from 'react';
import '../terminal-launcher.css';

// Keep horizontal gestures on this handle, leaving chat scrolling and text selection alone.
export default function TerminalLauncher({ onOpen, onPrepare }) {
  const gesture = useRef(null);
  const suppressClick = useRef(false);

  function reset(element) {
    gesture.current = null;
    element.style.removeProperty('--terminal-pull');
    element.removeAttribute('data-dragging');
  }

  return <button type="button" className="terminal-launcher" aria-label="Abrir terminal" aria-haspopup="dialog"
    title="Terminal · arraste para a esquerda ou use Ctrl + `" onPointerEnter={onPrepare} onFocus={onPrepare}
    onPointerDown={event => {
      if (!event.isPrimary || event.button !== 0) return;
      onPrepare?.();
      suppressClick.current = false;
      gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      const start = gesture.current;
      if (!start || event.pointerId !== start.id) return;
      const distance = start.x - event.clientX;
      if (Math.abs(event.clientY - start.y) > 38) { suppressClick.current = true; reset(event.currentTarget); return; }
      if (distance > 6) {
        event.currentTarget.dataset.dragging = 'true';
        event.currentTarget.style.setProperty('--terminal-pull', `${-Math.min(50, distance * .45)}px`);
      }
    }}
    onPointerUp={event => {
      const start = gesture.current;
      if (!start || event.pointerId !== start.id) return;
      const dx = start.x - event.clientX, dy = Math.abs(event.clientY - start.y);
      reset(event.currentTarget);
      if (Math.abs(dx) > 10 || dy > 10) {
        suppressClick.current = true;
        if (dx >= 45 && dy < 38) onOpen();
      }
    }}
    onPointerCancel={event => { suppressClick.current = true; reset(event.currentTarget); }}
    onLostPointerCapture={event => reset(event.currentTarget)}
    onClick={event => { if (event.detail !== 0 && suppressClick.current) { suppressClick.current = false; return; } onOpen(); }}>
    <span className="terminal-launcher-grip" aria-hidden="true" />
    <span className="terminal-launcher-icon" aria-hidden="true">❯_</span>
    <span className="terminal-launcher-label">TERMINAL</span>
    <span className="terminal-launcher-arrow" aria-hidden="true">‹</span>
  </button>;
}
