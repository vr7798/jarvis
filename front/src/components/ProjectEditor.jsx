import { memo, useEffect, useRef, useState } from 'react';

export function languageFor(name = '') {
  const extension = name.split('.').pop().toLowerCase();
  return ({ js: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript', jsx: 'React JSX', ts: 'TypeScript', tsx: 'React TSX', py: 'Python', json: 'JSON', html: 'HTML', css: 'CSS', scss: 'SCSS', md: 'Markdown', sh: 'Shell', bash: 'Shell', yml: 'YAML', yaml: 'YAML', sql: 'SQL', php: 'PHP', go: 'Go', rs: 'Rust', java: 'Java', txt: 'Texto' })[extension] || 'Texto';
}

function ProjectEditor({ file, readOnly, onChange, onSave }) {
  const input = useRef(null), numbers = useRef(null), selection = useRef(null);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const lines = file.content.split('\n').length;
  useEffect(() => { input.current?.focus({ preventScroll: true }); }, [file.path]);
  useEffect(() => {
    if (selection.current && input.current) {
      input.current.setSelectionRange(...selection.current); selection.current = null;
    }
  }, [file.content]);
  function updateCursor() {
    const el = input.current;
    if (!el) return;
    const before = el.value.slice(0, el.selectionStart), previousLine = before.lastIndexOf('\n');
    setCursor({ line: before.split('\n').length, column: el.selectionStart - previousLine });
  }
  function key(event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); onSave(); return; }
    if (event.key !== 'Tab' || readOnly) return;
    event.preventDefault();
    const el = event.currentTarget, start = el.selectionStart, end = el.selectionEnd;
    const lineStart = file.content.lastIndexOf('\n', start - 1) + 1;
    if (start !== end && file.content.slice(start, end).includes('\n')) {
      const nextBreak = file.content.indexOf('\n', Math.max(start, end - 1));
      const blockEnd = nextBreak < 0 ? file.content.length : nextBreak;
      const block = file.content.slice(lineStart, blockEnd).split('\n');
      const removed = block.map(line => /^ {1,2}|^\t/.exec(line)?.[0].length || 0);
      const changed = block.map((line, i) => event.shiftKey ? line.slice(removed[i]) : `  ${line}`).join('\n');
      onChange(file.content.slice(0, lineStart) + changed + file.content.slice(blockEnd));
      selection.current = event.shiftKey
        ? [Math.max(lineStart, start - removed[0]), end - removed.reduce((sum, amount) => sum + amount, 0)]
        : [start + 2, end + block.length * 2];
      return;
    }
    if (event.shiftKey) {
      const indent = /^ {1,2}|^\t/.exec(file.content.slice(lineStart))?.[0].length || 0;
      if (indent) {
        onChange(file.content.slice(0, lineStart) + file.content.slice(lineStart + indent));
        selection.current = [Math.max(lineStart, start - indent), Math.max(lineStart, end - indent)];
      }
    } else {
      onChange(file.content.slice(0, start) + '  ' + file.content.slice(end));
      selection.current = [start + 2, start + 2];
    }
  }
  return <div className="project-editor">
    <div className="project-editor-content"><pre className="project-line-numbers" ref={numbers} aria-hidden="true">{Array.from({ length: lines }, (_, i) => i + 1).join('\n')}</pre><textarea ref={input} aria-label={`Editor de ${file.name}`} className="project-code-input" value={file.content} readOnly={readOnly} onChange={event => { onChange(event.target.value); updateCursor(); }} onKeyDown={key} onClick={updateCursor} onKeyUp={updateCursor} onSelect={updateCursor} onScroll={event => { if (numbers.current) numbers.current.scrollTop = event.currentTarget.scrollTop; }} autoCapitalize="off" autoCorrect="off" spellCheck={false} wrap="off" /></div>
    <div className="project-editor-status"><span>{readOnly ? 'Somente leitura' : file.content !== file.original ? 'Alterações não salvas' : 'Salvo no servidor'}</span><span>Ln {cursor.line}, Col {cursor.column}</span><span>UTF-8</span><span>{languageFor(file.name)}</span></div>
  </div>;
}

export default memo(ProjectEditor);
