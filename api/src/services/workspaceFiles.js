import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

export const fileError = (message, status = 400) => Object.assign(new Error(message), { status, expose: true });
const inside = (root, target) => target === root || target.startsWith(root === '/' ? '/' : root + '/');
const call = (client, method, ...args) => new Promise((resolve, reject) => client[method](...args, (error, result) => error ? reject(error) : resolve(result)));
const imageTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };

export function resolveWorkspacePath(workspace, input = '.') {
  if (typeof input !== 'string' || input.length > 4096 || /[\x00-\x1f\x7f\\]/.test(input)) throw fileError('Caminho de arquivo inválido.');
  const target = path.posix.resolve(workspace, input);
  if (!inside(path.posix.resolve(workspace), target)) throw fileError('O arquivo precisa estar dentro da pasta de trabalho.', 403);
  return target;
}

export class WorkspaceFiles {
  constructor(config, chat) { this.config = config; this.chat = chat; }
  workspace() {
    const root = this.chat.workspace();
    if (!root || (this.config.mode === 'ssh' && !this.chat.transport.ready)) throw fileError('Conecte a VPS para acessar os arquivos.', 409);
    return root;
  }
  async sftp() {
    const connection = this.chat.transport.connection;
    if (!connection || !this.chat.transport.ready) throw fileError('A conexão SSH não está disponível para transferência.', 409);
    return call(connection, 'sftp');
  }
  async resolve(input = '.', sftp) {
    const workspace = this.workspace();
    const requested = resolveWorkspacePath(workspace, input);
    const canonicalRoot = sftp ? await call(sftp, 'realpath', workspace) : await fsp.realpath(workspace);
    const canonical = sftp ? await call(sftp, 'realpath', requested) : await fsp.realpath(requested);
    if (!inside(canonicalRoot, canonical)) throw fileError('Links para fora da pasta de trabalho não são permitidos.', 403);
    return { path: canonical, root: canonicalRoot, relative: path.posix.relative(canonicalRoot, canonical) || '.' };
  }
  async list(input = '.') {
    let sftp;
    try {
      if (this.config.mode === 'ssh') sftp = await this.sftp();
      const resolved = await this.resolve(input, sftp);
      const stat = sftp ? await call(sftp, 'stat', resolved.path) : await fsp.stat(resolved.path);
      if (!stat.isDirectory()) throw fileError('Selecione uma pasta para listar os arquivos.');
      const entries = sftp ? await call(sftp, 'readdir', resolved.path) : await fsp.readdir(resolved.path, { withFileTypes: true });
      const files = [];
      for (const entry of entries.slice(0, 500)) {
        const name = entry.filename || entry.name;
        if (name === '.' || name === '..') continue;
        const full = path.posix.join(resolved.path, name);
        try {
          // Resolve each entry before exposing links; escaped symlinks never appear.
          const checked = await this.resolve(full, sftp);
          const info = entry.attrs && !entry.attrs.isSymbolicLink() ? entry.attrs : sftp ? await call(sftp, 'stat', checked.path) : await fsp.stat(checked.path);
          if (!info.isFile() && !info.isDirectory()) continue;
          files.push({ name, path: path.posix.relative(resolved.root, full), size: info.isFile() ? info.size : 0, type: info.isDirectory() ? 'directory' : 'file' });
        } catch (error) { if (![403, 404].includes(error.status) && !['ENOENT', 'EACCES', 2, 3].includes(error.code)) throw error; }
      }
      files.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, 'pt-BR') : a.type === 'directory' ? -1 : 1));
      return { path: resolved.relative, files, truncated: entries.length > 500 };
    } catch (error) { throw this.safeError(error); }
    finally { sftp?.end(); }
  }
  async transfer(localPath, fileName, { directory = 'uploads' } = {}) {
    if (!['uploads', 'outputs'].includes(directory)) throw fileError('Pasta de transferência inválida.');
    let sftp;
    try {
      if (this.config.mode === 'ssh') sftp = await this.sftp();
      const root = await this.resolve('.', sftp);
      let folder = root.path;
      for (const segment of ['.luck', directory]) {
        folder = path.posix.join(folder, segment);
        if (sftp) { try { await call(sftp, 'mkdir', folder, { mode: 0o700 }); } catch (error) { if (error.code !== 4 && error.code !== 11) throw error; } }
        else { try { await fsp.mkdir(folder, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; } }
        const canonical = sftp ? await call(sftp, 'realpath', folder) : await fsp.realpath(folder);
        if (!inside(root.path, canonical)) throw fileError('A pasta de anexos aponta para fora do workspace.', 403);
        folder = canonical;
      }
      const destination = path.posix.join(folder, fileName);
      if (sftp) await pipeline(fs.createReadStream(localPath), sftp.createWriteStream(destination, { flags: 'wx', mode: 0o600 }));
      else await fsp.copyFile(localPath, destination, fs.constants.COPYFILE_EXCL);
      return destination;
    } catch (error) { throw this.safeError(error); }
    finally { sftp?.end(); }
  }
  async download(input, res, { preview = false } = {}) {
    let sftp, handle;
    try {
      if (this.config.mode === 'ssh') sftp = await this.sftp();
      const resolved = await this.resolve(input, sftp);
      let stream, stat;
      if (sftp) {
        const info = await call(sftp, 'stat', resolved.path);
        if (!info.isFile()) throw fileError('O caminho solicitado não é um arquivo.');
        stream = sftp.createReadStream(resolved.path);
        stat = info;
      } else {
        handle = await fsp.open(resolved.path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        // Check the opened object, including ancestors changed during resolution.
        const actual = await fsp.realpath(`/proc/self/fd/${handle.fd}`);
        if (!inside(resolved.root, actual)) throw fileError('O arquivo está fora da pasta de trabalho.', 403);
        stat = await handle.stat();
        if (!stat.isFile()) throw fileError('O caminho solicitado não é um arquivo.');
        stream = handle.createReadStream({ autoClose: false });
      }
      if (stat.size > 250 * 1024 * 1024) { stream.destroy(); throw fileError('O download excede o limite de 250 MB.', 413); }
      const name = path.posix.basename(resolved.path);
      const mime = preview ? imageTypes[path.posix.extname(name).toLowerCase()] : undefined;
      res.set('Content-Type', mime || 'application/octet-stream');
      res.set('Content-Disposition', `${mime ? 'inline' : 'attachment'}; filename="${name.replace(/[^\x20-\x7e]|["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`);
      res.set('X-Content-Type-Options', 'nosniff');
      res.set('Content-Security-Policy', "default-src 'none'; sandbox");
      res.set('Content-Length', String(stat.size));
      await pipeline(stream, res);
    } catch (error) { throw this.safeError(error); }
    finally { await handle?.close().catch(() => {}); sftp?.end(); }
  }
  safeError(error) {
    if (error.status) return error;
    if (error.code === 'ENOENT' || error.code === 2) return fileError('Arquivo ou pasta não encontrado.', 404);
    if (error.code === 'EACCES' || error.code === 3) return fileError('Sem permissão para acessar este arquivo.', 403);
    return fileError('Não foi possível acessar ou transferir o arquivo. Confira a conexão e as permissões da pasta.', 502);
  }
}
