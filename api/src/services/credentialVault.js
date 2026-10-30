import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, randomUUID } from 'node:crypto';

const failure = (message, status = 409) => Object.assign(new Error(message), { status, expose: true });
const CORRUPT = 'Não foi possível abrir a conexão salva. Exclua o perfil salvo e conecte a VPS novamente.';
const SAVE_FAILED = 'A VPS foi conectada, mas não foi possível salvar as credenciais com segurança. Confira as permissões de armazenamento e tente novamente.';

function validateProfile(profile) {
  const { host, port, username, password, workspace, fingerprint, savedAt } = profile || {};
  if (typeof host !== 'string' || !host.length || host.length > 253 || (!net.isIP(host) && !/^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?$/.test(host))) throw new Error('Invalid host');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
  if (typeof username !== 'string' || !/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,63}$/.test(username)) throw new Error('Invalid username');
  if (typeof password !== 'string' || !password.length || password.length > 1024) throw new Error('Invalid password');
  if (typeof workspace !== 'string' || !workspace.startsWith('/') || workspace.length > 2048 || /[\x00-\x1f\x7f]/.test(workspace)) throw new Error('Invalid workspace');
  if (typeof fingerprint !== 'string' || !/^SHA256:[A-Za-z0-9+/]{43}$/.test(fingerprint)) throw new Error('Invalid fingerprint');
  if (typeof savedAt !== 'string' || !Number.isFinite(Date.parse(savedAt))) throw new Error('Invalid timestamp');
  return { host, port, username, password, workspace, fingerprint, savedAt };
}

/** Server-only encrypted storage. Neither the derived key nor plaintext reaches disk. */
export class CredentialVault {
  constructor(config, { filesystem = fs } = {}) {
    this.fs = filesystem;
    this.file = path.join(config.dataDir, 'vps-profile.enc.json');
    this.key = Buffer.from(hkdfSync('sha256', config.sessionSecret, `luck-vps-profile:${config.username}`, 'luck/credential-vault/aes-256-gcm/v1', 32));
    this.aad = Buffer.from(JSON.stringify({ purpose: 'luck-vps-profile', version: 1, owner: config.username }));
    this.fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
  }
  load() {
    let descriptor, plaintext;
    try {
      try { descriptor = this.fs.openSync(this.file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
      const stat = this.fs.fstatSync(descriptor);
      if (!stat.isFile() || stat.size > 32768) throw new Error('Invalid vault file');
      const envelope = JSON.parse(this.fs.readFileSync(descriptor, 'utf8'));
      if (envelope.version !== 1 || envelope.algorithm !== 'aes-256-gcm' || !/^[A-Za-z0-9+/]{16}$/.test(envelope.iv) || !/^[A-Za-z0-9+/]{22}==$/.test(envelope.tag) || typeof envelope.ciphertext !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(envelope.ciphertext)) throw new Error('Invalid vault envelope');
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(envelope.iv, 'base64'));
      decipher.setAAD(this.aad);
      decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
      plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]);
      return validateProfile(JSON.parse(plaintext.toString('utf8')));
    } catch { throw failure(CORRUPT); }
    finally { plaintext?.fill(0); if (descriptor !== undefined) { try { this.fs.closeSync(descriptor); } catch {} } }
  }
  publicProfile() {
    const profile = this.load();
    if (!profile) return null;
    const { password, ...metadata } = profile;
    return metadata;
  }
  inspect() {
    try { return { profile: this.publicProfile(), error: null }; }
    catch { return { profile: null, error: CORRUPT }; }
  }
  save(input) {
    let descriptor, plaintext;
    const temporary = this.file + '.' + randomUUID() + '.tmp';
    try {
      const profile = validateProfile({ ...input, savedAt: new Date().toISOString() });
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', this.key, iv);
      cipher.setAAD(this.aad);
      plaintext = Buffer.from(JSON.stringify(profile));
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const envelope = JSON.stringify({ version: 1, algorithm: 'aes-256-gcm', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') });
      descriptor = this.fs.openSync(temporary, 'wx', 0o600);
      this.fs.writeFileSync(descriptor, envelope, 'utf8');
      this.fs.fsyncSync(descriptor);
      this.fs.closeSync(descriptor); descriptor = undefined;
      this.fs.renameSync(temporary, this.file);
      // Atomic rename preserves the temporary file's private permissions.
      const { password, ...metadata } = profile;
      return metadata;
    } catch { throw failure(SAVE_FAILED, 500); }
    finally {
      plaintext?.fill(0);
      if (descriptor !== undefined) { try { this.fs.closeSync(descriptor); } catch {} }
      try { this.fs.unlinkSync(temporary); } catch {}
    }
  }
  forget() {
    try { this.fs.unlinkSync(this.file); }
    catch (error) { if (error.code !== 'ENOENT') throw failure('Não foi possível excluir a conexão salva. Confira as permissões de armazenamento.', 500); }
  }
}
