import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { quotePosix } from './sshTransport.js';

const MAX_TEXT = 1024 * 1024;
const MAX_ENTRIES = 500;
const locks = new WeakMap();
const fail = (message, status = 400) => Object.assign(new Error(message), { status, expose: true });
const inside = (root, target) => target === root || target.startsWith(root === '/' ? '/' : root + '/');
const missing = error => [2, 'ENOENT'].includes(error?.code);
const exists = error => [11, 'EEXIST', 'ENOTEMPTY'].includes(error?.code);
const revisionOf = value => createHash('sha256').update(value).digest('hex');
const gitOptions = '-c core.hooksPath=/dev/null -c core.fsmonitor=false -c core.untrackedCache=false -c protocol.allow=never -c protocol.https.allow=always -c protocol.http.allow=always -c protocol.ssh.allow=always -c protocol.ext.allow=never -c protocol.file.allow=never';

function safe(error) {
  if (error?.expose && error.status) return error;
  if (missing(error)) return fail('Arquivo ou pasta não encontrado.', 404);
  if ([3, 'EACCES', 'EPERM'].includes(error?.code)) return fail('Sem permissão para acessar este caminho.', 403);
  if (exists(error)) return fail('Já existe um arquivo ou pasta com esse nome.', 409);
  return fail('Não foi possível acessar o projeto. Confira a conexão SSH e as permissões.', 502);
}

function validName(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 255 || Buffer.byteLength(value) > 255 || ['.', '..'].includes(value) || /[\x00-\x1f\x7f/\\]/.test(value)) throw fail('Informe um nome de arquivo ou pasta válido, sem barras.');
  return value;
}

export function validateProjectGitUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || !value.length || /[\x00-\x20\x7f\\]/.test(value) || value.startsWith('-')) throw fail('Informe uma URL Git HTTPS ou SSH válida, sem credenciais.');
  if (/^https?:\/\//i.test(value) || /^ssh:\/\//i.test(value)) {
    let url; try { url = new URL(value); } catch { throw fail('URL Git inválida.'); }
    if (!url.hostname || url.hostname.startsWith('-') || url.search || url.hash || url.password || (['http:', 'https:'].includes(url.protocol) && url.username) || !['http:', 'https:', 'ssh:'].includes(url.protocol) || url.pathname.length <= 1) throw fail('A URL Git deve estar sem senhas, tokens ou parâmetros de autenticação.');
    if (url.protocol === 'ssh:') {
      let remotePath; try { remotePath = decodeURIComponent(url.pathname); } catch { throw fail('URL SSH inválida.'); }
      if ((url.username && !/^[a-zA-Z0-9._-]{1,64}$/.test(url.username)) || !/^\/[a-zA-Z0-9_./~+%-]+$/.test(remotePath)) throw fail('Informe um caminho Git SSH válido.');
    }
    return value;
  }
  // SCP-style Git addresses are deliberately restricted to ordinary repository paths.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value) || /^(?:file|ext|git|ftp|ftps|rsync|data|javascript):/i.test(value) || /^[a-zA-Z]:\//.test(value)) throw fail('Esse protocolo ou caminho local não é permitido para clonar.');
  if (/^(?:[a-zA-Z0-9._-]{1,64}@)?[a-zA-Z0-9][a-zA-Z0-9.-]*:[a-zA-Z0-9_./~+%-]+$/.test(value)) return value;
  throw fail('Use uma URL Git HTTPS, HTTP ou SSH; caminhos locais e outros protocolos não são permitidos.');
}

/** SSH/SFTP-only project operations scoped to one immutable workspace. */
export class ProjectFiles {
  constructor({ config = {}, connection, workspace }) {
    if (!connection || typeof connection.sftp !== 'function' || typeof workspace !== 'string' || !workspace.startsWith('/') || /[\x00-\x1f\x7f\\]/.test(workspace)) throw fail('Conecte a VPS e selecione uma pasta de trabalho.', 409);
    Object.defineProperties(this, { connection: { value: connection, enumerable: true }, workspace: { value: path.posix.resolve(workspace), enumerable: true } });
    this.config = config;
    this.timeoutMs = config.projectOperationTimeoutMs || 15000;
  }

  writable() { if (this.config.readOnly === true || this.config.sandbox === 'read-only') throw fail('Este workspace está em modo somente leitura.', 403); }
  input(value = '.') {
    if (typeof value !== 'string' || value.length > 4096 || /[\x00-\x1f\x7f\\]/.test(value) || value.split('/').includes('..')) throw fail('Caminho de projeto inválido.');
    const target = path.posix.resolve(this.workspace, value);
    if (!inside(this.workspace, target)) throw fail('O caminho precisa estar dentro do workspace.', 403);
    return target;
  }
  call(sftp, method, ...args) {
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (error, result) => { if (done) { if (method === 'sftp') result?.end?.(); return; } done = true; clearTimeout(timer); error ? reject(error) : resolve(result); };
      const timer = setTimeout(() => { finish(fail('Tempo limite ao acessar os arquivos pela conexão SSH.', 504)); sftp.end?.(); }, this.timeoutMs); timer.unref();
      try { sftp[method](...args, finish); } catch (error) { finish(error); }
    });
  }
  async using(work) {
    let sftp;
    try {
      sftp = await this.call(this.connection, 'sftp');
      const root = await this.call(sftp, 'realpath', this.workspace);
      if (typeof root !== 'string' || !root.startsWith('/')) throw fail('A pasta de trabalho remota é inválida.', 502);
      const context = { sftp, root: path.posix.resolve(root) };
      return await work(context);
    } catch (error) { throw safe(error); }
    finally { sftp?.end?.(); }
  }
  relative(context, target) { return path.posix.relative(context.root, target) || '.'; }
  async resolve(context, input = '.') {
    const requested = this.input(input);
    const relative = path.posix.relative(this.workspace, requested);
    let current = context.root;
    for (const segment of relative.split('/').filter(Boolean)) {
      current = path.posix.join(current, segment);
      const info = await this.call(context.sftp, 'lstat', current);
      // Avoid following symlinks in either reads or mutations, including Git control paths.
      if (info.isSymbolicLink()) throw fail('Links simbólicos não podem ser acessados no editor de projetos.', 403);
    }
    const canonical = await this.call(context.sftp, 'realpath', current);
    if (!inside(context.root, canonical)) throw fail('O caminho aponta para fora do workspace.', 403);
    return canonical;
  }
  async directory(context, input) {
    const target = await this.resolve(context, input);
    const info = await this.call(context.sftp, 'lstat', target);
    if (!info.isDirectory()) throw fail('Selecione uma pasta do projeto.');
    return target;
  }
  async read(context, target) {
    const info = await this.call(context.sftp, 'lstat', target);
    if (!info.isFile()) throw fail('Selecione um arquivo de texto.');
    if (info.size > MAX_TEXT) throw fail('O editor abre arquivos de até 1 MB.', 413);
    const bytes = await new Promise((resolve, reject) => {
      const stream = context.sftp.createReadStream(target);
      const chunks = []; let count = 0, done = false;
      const finish = (error, value) => { if (done) return; done = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
      const timer = setTimeout(() => { finish(fail('Tempo limite ao ler o arquivo.', 504)); stream.destroy(); }, this.timeoutMs); timer.unref();
      stream.on('data', chunk => { count += chunk.length; if (count > MAX_TEXT) { finish(fail('O editor abre arquivos de até 1 MB.', 413)); stream.destroy(); } else chunks.push(Buffer.from(chunk)); });
      stream.on('error', error => finish(error)); stream.on('end', () => finish(null, Buffer.concat(chunks)));
    });
    let content;
    try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw fail('Este arquivo é binário ou usa uma codificação diferente de UTF-8.', 415); }
    if (content.includes('\0') || /[\x01-\x08\x0e-\x1f]/.test(content)) throw fail('Arquivos binários não podem ser editados aqui.', 415);
    return { path: this.relative(context, target), name: path.posix.basename(target), content, revision: revisionOf(bytes), size: bytes.length };
  }
  async write(context, target, content, { onOpen, mode = 0o600 } = {}) {
    await new Promise((resolve, reject) => {
      const stream = context.sftp.createWriteStream(target, { flags: 'wx', mode });
      let done = false;
      const finish = error => { if (done) return; done = true; clearTimeout(timer); error ? reject(error) : resolve(); };
      const timer = setTimeout(() => { finish(fail('Tempo limite ao gravar o arquivo.', 504)); stream.destroy(); }, this.timeoutMs); timer.unref();
      stream.once('open', () => onOpen?.());
      stream.on('error', finish); stream.on('close', () => finish()); stream.end(content, 'utf8');
    });
  }
  async locked(key, work) {
    let active = locks.get(this.connection); if (!active) { active = new Map(); locks.set(this.connection, active); }
    const previous = active.get(key) || Promise.resolve();
    const current = previous.catch(() => {}).then(work); active.set(key, current);
    try { return await current; } finally { if (active.get(key) === current) active.delete(key); }
  }

  async list(input = '.', { showHidden = false } = {}) {
    return this.using(async context => {
      const target = await this.directory(context, input), entries = await this.call(context.sftp, 'readdir', target);
      const files = [];
      for (const entry of entries) {
        const name = entry.filename, info = entry.attrs;
        if (!name || name === '.' || name === '..' || /[\x00-\x1f\x7f/\\]/.test(name) || (!showHidden && (name.startsWith('.') || name === 'node_modules')) || info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) continue;
        files.push({ name, path: this.relative(context, path.posix.join(target, name)), type: info.isDirectory() ? 'directory' : 'file', size: info.isFile() ? info.size : 0, modifiedAt: Number.isFinite(info.mtime) ? new Date(info.mtime * 1000).toISOString() : null });
        if (files.length >= MAX_ENTRIES) break;
      }
      files.sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name, 'pt-BR') : a.type === 'directory' ? -1 : 1);
      return { path: this.relative(context, target), files, truncated: entries.length > MAX_ENTRIES };
    });
  }
  async open(input) { return this.using(async context => this.read(context, await this.resolve(context, input))); }
  async save(input, content, revision) {
    this.writable();
    if (typeof content !== 'string' || Buffer.byteLength(content) > MAX_TEXT) throw fail('Salve um texto UTF-8 de até 1 MB.', 413);
    if (content.includes('\0') || typeof revision !== 'string' || !/^[a-f0-9]{64}$/.test(revision)) throw fail('Informe a revisão original do arquivo antes de salvar.');
    return this.locked(this.input(input), () => this.using(async context => {
      const target = await this.resolve(context, input), current = await this.read(context, target);
      const original = await this.call(context.sftp, 'lstat', target);
      if (current.revision !== revision) throw fail('Este arquivo mudou na VPS. Reabra a versão atual antes de salvar.', 409);
      if (typeof context.sftp.ext_openssh_rename !== 'function') throw fail('O servidor SSH não oferece gravação atômica. O arquivo original foi preservado.', 409);
      const temporary = path.posix.join(path.posix.dirname(target), `.luck-save-${randomUUID()}.tmp`);
      let written = false;
      try {
        await this.write(context, temporary, content, { onOpen: () => { written = true; }, mode: original.mode & 0o777 }); written = true;
        await this.call(context.sftp, 'chmod', temporary, original.mode & 0o777);
        const latest = await this.read(context, await this.resolve(context, input));
        if (latest.revision !== revision) throw fail('O arquivo mudou durante a gravação. Reabra a versão atual antes de salvar.', 409);
        await this.call(context.sftp, 'ext_openssh_rename', temporary, target); written = false;
        return { path: current.path, name: current.name, content, revision: revisionOf(Buffer.from(content)), size: Buffer.byteLength(content) };
      } finally { if (written) await this.call(context.sftp, 'unlink', temporary).catch(() => {}); }
    }));
  }
  async create({ parent = '.', name, type = 'file' } = {}) {
    this.writable(); validName(name);
    if (!['file', 'directory'].includes(type)) throw fail('Escolha arquivo ou pasta.');
    return this.using(async context => {
      const folder = await this.directory(context, parent), target = path.posix.join(folder, name);
      try { await this.call(context.sftp, 'lstat', target); throw fail('Já existe um arquivo ou pasta com esse nome.', 409); } catch (error) { if (!missing(error)) throw error; }
      if (type === 'directory') await this.call(context.sftp, 'mkdir', target, { mode: 0o755 });
      else await this.write(context, target, '');
      return { path: this.relative(context, target), name, type };
    });
  }
  async isGit(context, directory) {
    try { const marker = await this.call(context.sftp, 'lstat', path.posix.join(directory, '.git')); return marker.isDirectory() && !marker.isSymbolicLink(); }
    catch (error) { if (missing(error)) return false; throw error; }
  }
  async projects() {
    return this.using(async context => {
      const projects = [], seen = new Set();
      const add = async directory => {
        const relative = this.relative(context, directory); if (seen.has(relative)) return; seen.add(relative);
        projects.push({ name: relative === '.' ? path.posix.basename(context.root) || 'Workspace' : path.posix.basename(directory), path: relative, isGit: await this.isGit(context, directory) });
      };
      await add(context.root);
      for (const folder of [context.root, path.posix.join(context.root, 'projects')]) {
        let entries;
        try { await this.resolve(context, this.relative(context, folder)); entries = await this.call(context.sftp, 'readdir', folder); } catch (error) { if (missing(error) || error.status === 403) continue; throw error; }
        for (const entry of entries.slice(0, 100)) {
          if (!entry.attrs.isDirectory() || entry.attrs.isSymbolicLink() || entry.filename.startsWith('.') || entry.filename === 'node_modules' || /[\x00-\x1f\x7f/\\]/.test(entry.filename)) continue;
          await add(path.posix.join(folder, entry.filename));
        }
      }
      return { workspace: this.workspace, projects };
    });
  }
  exec(command, { timeoutMs = this.timeoutMs, maxOutput = MAX_TEXT } = {}) {
    return new Promise((resolve, reject) => {
      let stream, timer, done = false, output = '', count = 0, exitCode = null;
      const finish = (error, value) => { if (done) return; done = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
      const stop = () => { try { stream?.signal?.('TERM'); stream?.close?.(); } catch {} };
      timer = setTimeout(() => { finish(fail('Tempo limite ao executar a operação Git.', 504)); stop(); }, timeoutMs); timer.unref();
      try { this.connection.exec(command, { pty: false }, (error, channel) => {
        if (done) { channel?.close?.(); return; }
        if (error) return finish(fail('Não foi possível iniciar a operação Git na VPS.', 502));
        stream = channel; stream.setEncoding?.('utf8');
        stream.on('data', value => { count += Buffer.byteLength(value); if (count > maxOutput) { finish(fail('A resposta Git excedeu o limite permitido.', 413)); stop(); } else output += value; });
        stream.stderr?.on('data', () => {}); // Remote diagnostics may contain credentials; never expose them.
        stream.on('exit', code => { exitCode = code; });
        stream.on('error', () => finish(fail('A operação Git perdeu a conexão com a VPS.', 502)));
        stream.on('close', code => finish(null, { code: exitCode ?? code ?? 1, output }));
      }); } catch { finish(fail('Não foi possível executar o Git na VPS.', 502)); }
    });
  }
  async gitInfo(input = '.') {
    return this.using(async context => {
      const target = await this.directory(context, input), relative = this.relative(context, target);
      if (!await this.isGit(context, target)) return { path: relative, isGit: false, branch: null, changedFiles: [], changedCount: 0 };
      for (const marker of ['config', 'HEAD', 'index', 'packed-refs', 'refs', 'objects', 'commondir', 'gitdir', 'objects/info/alternates']) {
        try {
          await this.resolve(context, path.posix.join(relative, '.git', marker));
          if (['commondir', 'gitdir', 'objects/info/alternates'].includes(marker)) throw fail('Este repositório usa metadados Git compartilhados. Consulte seu estado pelo terminal.', 403);
        } catch (error) { if (!missing(error)) throw error; }
      }
      const prefix = `GIT_TERMINAL_PROMPT=0 GIT_OPTIONAL_LOCKS=0 git ${gitOptions} -C ${quotePosix(target)} --git-dir=${quotePosix(path.posix.join(target, '.git'))} --work-tree=${quotePosix(target)}`;
      const branch = await this.exec(`${prefix} symbolic-ref --quiet --short HEAD`);
      const status = await this.exec(`${prefix} status --porcelain=v1 -z --untracked-files=normal --ignore-submodules=all`);
      if (status.code !== 0) throw fail('Não foi possível consultar o estado Git deste projeto.', 502);
      const changedFiles = [], fields = status.output.split('\0');
      for (let index = 0; index < fields.length; index++) {
        const field = fields[index]; if (!field) continue;
        const entry = { status: field.slice(0, 2), path: field.slice(3) };
        if (/[RC]/.test(entry.status)) entry.originalPath = fields[++index] || '';
        changedFiles.push(entry);
      }
      return { path: relative, isGit: true, branch: branch.code === 0 ? branch.output.trim() : 'HEAD', changedFiles, changedCount: changedFiles.length };
    });
  }
  async removeOwned(context, directory, depth = 0, count = { value: 0 }) {
    if (depth > 64 || ++count.value > 20000) return;
    const info = await this.call(context.sftp, 'lstat', directory);
    if (!info.isDirectory() || info.isSymbolicLink()) { await this.call(context.sftp, 'unlink', directory); return; }
    const entries = await this.call(context.sftp, 'readdir', directory);
    for (const entry of entries) {
      if (!entry.filename || ['.', '..'].includes(entry.filename) || /[\x00-\x1f\x7f/\\]/.test(entry.filename)) continue;
      await this.removeOwned(context, path.posix.join(directory, entry.filename), depth + 1, count);
    }
    await this.call(context.sftp, 'rmdir', directory);
  }
  async clone({ url, name, parent = 'projects' } = {}) {
    this.writable(); validateProjectGitUrl(url);
    this.input(parent);
    if (!name) {
      let candidate = url.split(/[/:]/).at(-1).replace(/\.git$/i, '');
      try { candidate = decodeURIComponent(candidate); } catch {}
      name = candidate;
    }
    validName(name);
    return this.locked(this.input(path.posix.join(parent, name)), () => this.using(async context => {
      let folder;
      try { folder = await this.directory(context, parent); }
      catch (error) {
        if (!missing(error) || parent !== 'projects') throw error;
        const destination = path.posix.join(context.root, 'projects');
        try { await this.call(context.sftp, 'mkdir', destination, { mode: 0o755 }); } catch (mkdirError) { if (!exists(mkdirError)) throw mkdirError; }
        folder = await this.directory(context, parent);
      }
      const destination = path.posix.join(folder, name), staging = path.posix.join(folder, `.luck-clone-${randomUUID()}`);
      try { await this.call(context.sftp, 'lstat', destination); throw fail('Já existe um projeto com esse nome.', 409); } catch (error) { if (!missing(error)) throw error; }
      let owned = false;
      try {
        await this.call(context.sftp, 'mkdir', staging, { mode: 0o700 }); owned = true;
        const result = await this.exec(`GIT_TERMINAL_PROMPT=0 GIT_SSH_COMMAND='ssh -o BatchMode=yes' git ${gitOptions} clone --quiet --no-recurse-submodules -- ${quotePosix(url)} ${quotePosix(staging)}`, { timeoutMs: 180000, maxOutput: 65536 });
        if (result.code !== 0) throw fail('Não foi possível clonar. Confira a URL, o acesso Git da VPS e a chave SSH do provedor.', 502);
        if (!await this.isGit(context, staging)) throw fail('O clone não produziu um repositório Git válido.', 502);
        // Standard SFTP rename must fail for an existing target; unlike the OpenSSH
        // overwrite extension used for saving, it does not replace another project.
        try { await this.call(context.sftp, 'lstat', destination); throw fail('Outro projeto foi criado com esse nome. Escolha um nome diferente.', 409); } catch (error) { if (!missing(error)) throw error; }
        await this.call(context.sftp, 'rename', staging, destination); owned = false;
        return { path: this.relative(context, destination), name, isGit: true };
      } finally { if (owned) await this.removeOwned(context, staging).catch(() => {}); }
    }));
  }
}
