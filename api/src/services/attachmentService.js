import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import multer from 'multer';
import { fileError } from './workspaceFiles.js';

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;
export const MAX_ATTACHMENTS = 8;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const textExtensions = new Set(['.txt','.md','.csv','.json','.js','.jsx','.ts','.tsx','.html','.css','.xml','.yaml','.yml','.log','.py','.sh','.sql','.ini','.toml']);
const imageExtensions = new Set(['.png','.jpg','.jpeg','.gif','.webp']);
const officeExtensions = new Set(['.docx','.xlsx','.pptx','.odt','.ods','.odp']);

export function inspectAttachment(buffer, name, declared = '') {
  const extension = path.extname(name).toLowerCase();
  let mime = 'application/octet-stream', kind = 'file';
  if (buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) mime = 'image/png';
  else if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) mime = 'image/jpeg';
  else if (/^GIF8[79]a$/.test(buffer.subarray(0,6).toString('ascii'))) mime = 'image/gif';
  else if (buffer.subarray(0,4).toString() === 'RIFF' && buffer.subarray(8,12).toString() === 'WEBP') mime = 'image/webp';
  else if (buffer.subarray(0,5).toString() === '%PDF-') { mime = 'application/pdf'; kind = 'document'; }
  else if (buffer[0] === 80 && buffer[1] === 75 && ((buffer[2] === 3 && buffer[3] === 4) || (buffer[2] === 5 && buffer[3] === 6) || (buffer[2] === 7 && buffer[3] === 8))) { mime = 'application/zip'; kind = officeExtensions.has(extension) ? 'document' : 'archive'; }
  else if (buffer[0] === 31 && buffer[1] === 139) { mime = 'application/gzip'; kind = 'archive'; }
  else if (buffer.subarray(0,7).equals(Buffer.from([82,97,114,33,26,7,0])) || buffer.subarray(0,8).equals(Buffer.from([82,97,114,33,26,7,1,0]))) { mime = 'application/vnd.rar'; kind = 'archive'; }
  else if (buffer.subarray(0,6).equals(Buffer.from([55,122,188,175,39,28]))) { mime = 'application/x-7z-compressed'; kind = 'archive'; }
  else if (buffer.length >= 512 && buffer.subarray(257,262).toString('ascii') === 'ustar') { mime = 'application/x-tar'; kind = 'archive'; }
  else if (textExtensions.has(extension) && !buffer.includes(0)) { mime = 'text/plain'; kind = 'document'; }
  if (mime.startsWith('image/')) kind = 'image';
  if ((imageExtensions.has(extension) || /^image\/(png|jpe?g|gif|webp)$/i.test(declared)) && kind !== 'image') throw fileError('A imagem enviada não tem um formato PNG, JPEG, GIF ou WebP válido.');
  if ((extension === '.pdf' || declared === 'application/pdf') && mime !== 'application/pdf') throw fileError('O arquivo PDF enviado não tem uma assinatura válida.');
  if ((extension === '.zip' || officeExtensions.has(extension)) && mime !== 'application/zip') throw fileError('O arquivo compactado enviado não tem uma assinatura ZIP válida.');
  const archiveMime = { '.rar': 'application/vnd.rar', '.7z': 'application/x-7z-compressed', '.tar': 'application/x-tar', '.gz': 'application/gzip', '.gzip': 'application/gzip', '.tgz': 'application/gzip' }[extension];
  if (archiveMime && mime !== archiveMime) throw fileError('O arquivo compactado enviado não tem uma assinatura válida para sua extensão.');
  return { mime, kind };
}

function displayName(input) {
  let name = String(input || 'arquivo');
  // Multipart filenames commonly arrive as latin1 even when browsers send UTF-8.
  if ([...name].every(c => c.charCodeAt(0) <= 255)) { const utf8 = Buffer.from(name, 'latin1').toString('utf8'); if (!utf8.includes('\ufffd')) name = utf8; }
  return path.posix.basename(name.replace(/\\/g, '/')).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 180) || 'arquivo';
}
const remoteName = name => name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]/g,'_').replace(/^\.+/,'').slice(0,120) || 'arquivo';

export class AttachmentService {
  constructor(config, chat, workspaceFiles) {
    this.config = config; this.chat = chat; this.workspaceFiles = workspaceFiles;
    this.directory = path.join(config.dataDir, 'attachments');
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    this.indexPath = path.join(this.directory, 'index.json');
    this.items = fs.existsSync(this.indexPath) ? JSON.parse(fs.readFileSync(this.indexPath, 'utf8')) : [];
    const storage = {
      _handleFile: (req, file, cb) => {
        const filename = randomUUID() + '.pending';
        const target = path.join(this.directory, filename);
        (req.uploadPaths ||= []).push(target);
        let size = 0;
        const counter = new Transform({ transform(chunk, encoding, done) {
          size += chunk.length; req.uploadBytes = (req.uploadBytes || 0) + chunk.length;
          done(req.uploadBytes > MAX_UPLOAD_BYTES ? fileError('Envie no máximo 60 MB de anexos por vez.', 413) : null, chunk);
        } });
        pipeline(file.stream, counter, fs.createWriteStream(target, { flags: 'wx', mode: 0o600 }))
          .then(() => cb(null, { path: target, size, filename }))
          .catch(error => { fs.unlink(target, () => cb(error)); });
      },
      _removeFile: (req, file, cb) => fs.unlink(file.path, error => cb(error?.code === 'ENOENT' ? null : error)),
    };
    this.receive = multer({ storage, limits: { fileSize: MAX_FILE_BYTES, files: MAX_ATTACHMENTS, fields: 0, parts: MAX_ATTACHMENTS + 1 } }).array('files', MAX_ATTACHMENTS);
  }
  public(item) { return { id: item.id, name: item.name, size: item.size, mime: item.mime, kind: item.kind, url: `/api/attachments/${item.id}` }; }
  flush() { fs.writeFileSync(this.indexPath+'.tmp', JSON.stringify(this.items), { mode: 0o600 }); fs.renameSync(this.indexPath+'.tmp', this.indexPath); }
  upload = async (req, res, next) => {
    const contextKey = this.chat.contextKey();
    if (Number(req.get('content-length')) > MAX_UPLOAD_BYTES + 128 * 1024) return next(fileError('Envie no máximo 60 MB de anexos por vez.', 413));
    this.receive(req, res, async error => {
      try {
        if (error) throw error;
        if (contextKey !== this.chat.contextKey() || (this.config.mode === 'ssh' && !this.chat.transport.ready)) throw fileError('A conexão mudou durante o envio. Conecte novamente e reenvie os anexos.', 409);
        if (!req.files?.length) throw fileError('Selecione pelo menos um arquivo.');
        if (this.items.reduce((total, item) => total + item.size, 0) + req.uploadBytes > 2 * 1024 * 1024 * 1024) throw fileError('O armazenamento de anexos atingiu o limite de 2 GB.', 413);
        const accepted = [];
        for (const file of req.files) {
          const name = displayName(file.originalname);
          const handle = await fsp.open(file.path, 'r');
          const header = Buffer.alloc(Math.min(file.size, 8192));
          try { await handle.read(header, 0, header.length, 0); } finally { await handle.close(); }
          const type = inspectAttachment(header, name, file.mimetype);
          const id = randomUUID();
          const extension = path.extname(remoteName(name)).slice(0,12);
          const filename = id + extension;
          const destination = path.join(this.directory, filename);
          await fsp.rename(file.path, destination); (req.uploadPaths ||= []).push(destination);
          accepted.push({ id, name, size: file.size, ...type, filename, contextKey, createdAt: new Date().toISOString() });
        }
        this.items.push(...accepted); this.flush();
        res.status(201).json({ attachments: accepted.map(item => this.public(item)) });
      } catch (failure) {
        await Promise.all((req.uploadPaths || []).map(target => fsp.unlink(target).catch(() => {})));
        if (failure instanceof multer.MulterError) return next(fileError(failure.code === 'LIMIT_FILE_SIZE' ? 'Cada arquivo pode ter no máximo 25 MB.' : 'Envie até 8 arquivos no campo files, sem outros campos.', 413));
        next(failure);
      }
    });
  };
  resolve(ids = []) {
    if (!Array.isArray(ids) || ids.length > MAX_ATTACHMENTS || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !uuid.test(id))) throw fileError('Informe até 8 identificadores de anexos válidos.');
    const result = ids.map(id => this.items.find(item => item.id === id));
    if (result.some(item => !item)) throw fileError('Um dos anexos não foi encontrado. Envie o arquivo novamente.', 404);
    if (result.some(item => item.contextKey !== this.chat.contextKey())) throw fileError('Os anexos pertencem a outro servidor ou pasta. Envie os arquivos novamente neste ambiente.', 409);
    if (result.reduce((total, item) => total + item.size, 0) > MAX_UPLOAD_BYTES) throw fileError('Use no máximo 60 MB de anexos por mensagem.', 413);
    return result;
  }
  async prepare(items) {
    const prepared = [];
    for (const item of items) {
      const filename = `${item.id}-${randomUUID().slice(0,8)}-${remoteName(item.name)}`;
      const target = await this.workspaceFiles.transfer(path.join(this.directory, item.filename), filename);
      prepared.push({ ...this.public(item), path: target });
    }
    return prepared;
  }
  download = (req, res, next) => {
    const item = this.items.find(value => value.id === req.params.attachmentId);
    if (!item) return next(fileError('Anexo não encontrado.', 404));
    res.set('Content-Security-Policy', "default-src 'none'; sandbox");
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Type', item.kind === 'image' ? item.mime : 'application/octet-stream');
    const inline = item.kind === 'image' && req.query.download !== '1';
    res.set('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${remoteName(item.name)}"; filename*=UTF-8''${encodeURIComponent(item.name)}`);
    res.sendFile(path.join(this.directory, item.filename), error => { if (error) next(fileError('Não foi possível ler o anexo.', error.status || 404)); });
  };
}
