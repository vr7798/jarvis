import { useEffect, useRef } from 'react';

export function filterCommands(commands = [], query = '') {
  const needle = query.replace(/^\//, '').trim().toLocaleLowerCase('pt-BR');
  return commands.filter(command => !needle || [command.name, command.label, command.description].some(value => String(value || '').toLocaleLowerCase('pt-BR').includes(needle)));
}

export default function SlashMenu({ query = '', commands = [], onSelect, onClose, activeIndex = 0, onActiveIndexChange }) {
  const ref = useRef(null);
  const filtered = filterCommands(commands, query);
  useEffect(() => {
    ref.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);
  return <div className="slash-menu" ref={ref} role="region" aria-label="Menu de comandos"><div className="slash-menu-heading"><span>COMANDOS</span><button type="button" aria-label="Fechar comandos" onMouseDown={event => event.preventDefault()} onClick={onClose}>Esc <span aria-hidden="true">×</span></button></div><div id="slash-command-menu" className="slash-command-options" role="listbox" aria-label="Comandos disponíveis">{filtered.length ? filtered.map((command, index) => <button type="button" id={`slash-command-${index}`} data-index={index} key={`${command.name}-${command.action}`} role="option" aria-selected={index === activeIndex} aria-disabled={command.enabled === false} tabIndex={-1} className={`slash-command ${index === activeIndex ? 'is-active' : ''} ${command.enabled === false ? 'is-unavailable' : ''}`} onMouseDown={event => event.preventDefault()} onMouseEnter={() => onActiveIndexChange?.(index)} onClick={() => onSelect(command)}><span className="slash-symbol" aria-hidden="true">/</span><span className="slash-command-copy"><strong>/{command.name.replace(/^\//, '')}<span>{command.label}</span></strong><small>{command.enabled === false ? 'Conecte o Codex para usar. ' : ''}{command.description}</small></span><span className="slash-source">{command.source || 'Luck'}</span>{index === activeIndex && <span className="slash-enter" aria-hidden="true">↵</span>}</button>) : <p className="slash-empty">Nenhum comando encontrado. Continue digitando sua mensagem.</p>}</div><div className="slash-menu-note"><span>↑ ↓ navegar · Enter selecionar · Esc fechar</span><span>Luck Admin</span></div></div>;
}
