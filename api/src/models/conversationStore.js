import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class ConversationStore {
  constructor(directory) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.file = path.join(directory, 'store.json');
    this.conversations = [];
    if (fs.existsSync(this.file)) {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (data.version !== 1 || !Array.isArray(data.conversations)) throw new Error('Histórico inválido; restaure o backup de data/store.json.');
      this.conversations = data.conversations;
    }
    for (const c of this.conversations) {
      if (c.busy) this.addMessage(c, 'system', 'O servidor reiniciou. A tarefa anterior foi interrompida; confira o resultado antes de repetir comandos.');
      c.busy = false;
      c.activeTurnId = null;
    }
    this.flush();
  }
  list() { return [...this.conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  get(id) { return this.conversations.find(c => c.id === id); }
  public(c) {
    const { threadId, contextKey, ...visible } = c;
    return visible;
  }
  create() {
    if (this.conversations.length >= 100) throw Object.assign(new Error('Limite de 100 conversas atingido. Faça backup e arquive o histórico antes de continuar.'), { status: 409 });
    const now = new Date().toISOString();
    const c = { id: randomUUID(), title: 'Nova conversa', createdAt: now, updatedAt: now, messages: [], busy: false, activeTurnId: null, threadId: null };
    this.conversations.push(c);
    this.flush();
    return c;
  }
  addMessage(c, role, text, id = randomUUID()) {
    const m = { id, role, text: String(text).slice(-64000), createdAt: new Date().toISOString() };
    c.messages.push(m);
    c.messages = c.messages.slice(-500);
    this.touch(c);
    return m;
  }
  upsert(c, id, role, text, append = false) {
    let m = c.messages.find(x => x.id === id);
    if (!m) m = this.addMessage(c, role, '', id);
    m.text = (append ? m.text + text : text).slice(-64000);
    this.touch(c);
  }
  touch(c) { c.updatedAt = new Date().toISOString(); this.schedule(); }
  schedule() {
    if (!this.timer) this.timer = setTimeout(() => { this.timer = null; this.flush(); }, 200);
  }
  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, conversations: this.conversations }), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }
}
