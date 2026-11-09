import { Fragment, useEffect, useRef } from 'react';
import { commandCategories, filterCommands } from './commandCatalog.js';

export { filterCommands } from './commandCatalog.js';

function CommandIcon({ name }) {
  const paths = {
    chat: <path d="M20 11a8 8 0 0 1-8 8H5l-3 2 1.5-5A8 8 0 1 1 20 11Z" />,
    history: <><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6M12 7v5l3 2" /></>,
    brain: <><path d="M12 5C8 1 4 5 6 8c-5 2-3 8 0 8 0 4 5 6 6 2M12 5c4-4 8 0 6 3 5 2 3 8 0 8 0 4-5 6-6 2M12 5v13M6 8l3 2M18 8l-3 2" /></>,
    bolt: <path d="m13 2-8 12h6l-1 8 9-13h-6l1-7Z" />,
    spark: <><path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3Z" /><path d="M21 2v4M19 4h4" /></>,
    mic: <><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M9 22h6" /></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="8" r="1.5" /><path d="m3 17 5-5 4 4 4-6 5 7" /></>,
    design: <><path d="m4 16 12-12 4 4L8 20H4v-4ZM13 7l4 4M3 3h6M3 3v6M21 15v6h-6" /></>,
    video: <><rect x="3" y="5" width="13" height="14" rx="3" /><path d="m16 10 5-3v10l-5-3" /></>,
    slides: <><rect x="3" y="3" width="18" height="13" rx="2" /><path d="M12 16v5M8 21h8M7 8h10M7 11h6" /></>,
    folder: <path d="M3 6h7l2 2h9v12H3V6Z" />,
    terminal: <><path d="m4 6 6 6-6 6M13 18h7" /></>,
    code: <><path d="m7 6-6 6 6 6M17 6l6 6-6 6M14 3l-4 18" /></>,
    diff: <><path d="M5 3v12a4 4 0 0 0 4 4h2M15 3h6M18 0v6M15 16h6" /></>,
    attachment: <path d="m8 12 7-7a4 4 0 0 1 6 6l-9 9a6 6 0 0 1-8-8l9-9M7 15l9-9a2 2 0 0 1 3 3l-9 9" />,
    download: <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />,
    copy: <><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V3H3v13h5" /></>,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8 12 3 3 5-6" /></>,
    search: <><circle cx="10" cy="10" r="7" /><path d="m15 15 6 6" /></>,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3M12 17h.01" /></>,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
    check: <path d="m5 12 4 4L19 6" />,
    compact: <><path d="M3 3h7v7H3V3ZM14 14h7v7h-7v-7ZM14 10l7-7M16 3h5v5M3 16v5h5M3 21l7-7" /></>,
    plan: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1" /></>,
    settings: <><path d="M4 7h16M4 17h16" /><circle cx="8" cy="7" r="3" /><circle cx="16" cy="17" r="3" /></>,
    trash: <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />,
    clear: <><path d="m4 14 9-10 8 8-8 9H9l-5-4v-3ZM9 9l8 8M13 21h8" /></>,
    plug: <><path d="M8 3v5M16 3v5M6 8h12v3a6 6 0 0 1-12 0V8ZM12 17v5" /></>,
    status: <><circle cx="12" cy="12" r="9" /><path d="M7 12h3l2-5 2 10 2-5h2" /></>,
  };
  return <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.spark}</svg>;
}

export default function SlashMenu({ query = '', commands = [], onSelect, onClose, activeIndex = 0, onActiveIndexChange, onQueryChange, onKeyDown }) {
  const ref = useRef(null);
  const filtered = filterCommands(commands, query);
  const selectedIndex = Math.max(0, Math.min(activeIndex, filtered.length - 1));
  useEffect(() => {
    ref.current?.querySelector(`[data-index="${selectedIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, query]);
  function select(command) {
    if (command.enabled !== false) onSelect(command);
  }
  function keyboard(event) {
    if (event.nativeEvent?.isComposing) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); return; }
    if (!filtered.length) return;
    if (['Enter', 'Tab'].includes(event.key) && !event.shiftKey) { event.preventDefault(); select(filtered[selectedIndex]); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      onActiveIndexChange?.((selectedIndex + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault(); onActiveIndexChange?.(event.key === 'Home' ? 0 : filtered.length - 1);
    }
  }
  function searchKeyboard(event) {
    event.stopPropagation();
    if (event.nativeEvent?.isComposing) return;
    // The search field must never submit or format the separate composer draft.
    if (event.key === 'Enter' && !filtered.length) { event.preventDefault(); return; }
    if (['Home', 'End'].includes(event.key)) { keyboard(event); return; }
    if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)) {
      if (onKeyDown) onKeyDown(event); else keyboard(event);
    }
  }
  return <div className="slash-menu" ref={ref} role="region" aria-label="Paleta de comandos" onKeyDown={keyboard}>
    <div className="slash-menu-heading"><span className="slash-heading-title"><span className="slash-heading-symbol" aria-hidden="true">/</span><span>Central de comandos<small>Digite para buscar uma ação ou habilidade</small></span></span><button type="button" aria-label="Fechar comandos" onMouseDown={event => event.preventDefault()} onClick={onClose}><kbd>esc</kbd><span aria-hidden="true">×</span></button></div>
    {onQueryChange && <div className="slash-search"><CommandIcon name="search" /><input autoFocus role="combobox" aria-label="Buscar comando" aria-expanded="true" aria-controls="slash-command-menu" aria-activedescendant={filtered.length ? `slash-command-${selectedIndex}` : undefined} value={query} placeholder="Buscar ações, modos e habilidades…" onChange={event => { onActiveIndexChange?.(0); onQueryChange(event.target.value); }} onKeyDown={searchKeyboard} /></div>}
    <div id="slash-command-menu" className="slash-command-options" role="listbox" aria-label="Comandos disponíveis">
      {filtered.length ? filtered.map((command, index) => <Fragment key={`${command.name}-${command.action}`}>
        {(!index || filtered[index - 1].category !== command.category) && <div role="presentation" className="slash-category">{commandCategories[command.category] || 'Comandos'}<span aria-hidden="true" /></div>}
        <button type="button" id={`slash-command-${index}`} data-index={index} role="option" aria-selected={index === selectedIndex} aria-disabled={command.enabled === false} tabIndex={-1} className={`slash-command ${index === selectedIndex ? 'is-active' : ''} ${command.enabled === false ? 'is-unavailable' : ''}`} onMouseDown={event => event.preventDefault()} onMouseEnter={() => onActiveIndexChange?.(index)} onClick={() => select(command)}>
          <span className={`slash-symbol slash-symbol-${command.category || 'workspace'}`}><CommandIcon name={command.icon} /></span>
          <span className="slash-command-copy"><strong>{command.label}<code>/{command.name.replace(/^\//, '')}</code></strong><small>{command.enabled === false ? 'Conecte o Codex para usar. ' : ''}{command.description}</small></span>
          <span className={`slash-source ${command.source === 'Prompt' ? 'is-prompt' : ''}`}>{command.source === 'Prompt' ? 'Briefing' : command.source || 'Luck'}</span>{index === selectedIndex && <kbd className="slash-enter" aria-hidden="true">↵</kbd>}
        </button>
      </Fragment>) : <div className="slash-empty"><CommandIcon name="search" /><strong>Nenhum comando encontrado</strong><span>Tente “imagem”, “voz”, “modelo” ou “arquivos”.</span></div>}
    </div>
    <div className="slash-menu-note"><span><kbd>↑</kbd><kbd>↓</kbd> navegar <kbd>↵</kbd> selecionar</span><span>{filtered.length} {filtered.length === 1 ? 'comando' : 'comandos'} disponíveis</span></div>
  </div>;
}
