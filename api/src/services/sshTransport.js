import { EventEmitter } from 'node:events';
import ssh2 from 'ssh2';
import path from 'node:path';
import { CodexTransport } from './codexTransport.js';

const MAX_BUFFER = 40 * 1024 * 1024;
const { Client } = ssh2;

function validateAddress({ host, port = 22 }) {
  if (typeof host !== 'string' || !host || host.length > 253 || !/^[a-zA-Z0-9.:%_-]+$/.test(host)) throw new Error('Endereço SSH inválido. Informe somente o IP ou nome do servidor.');
  const number = Number(port);
  if (!Number.isInteger(number) || number < 1 || number > 65535) throw new Error('Porta SSH inválida.');
  return { host, port: number };
}

export function fingerprintFromHash(hash) {
  if (!/^[a-f0-9]{64}$/i.test(hash)) throw new Error('Chave de host SSH inválida.');
  return `SHA256:${Buffer.from(hash, 'hex').toString('base64').replace(/=+$/, '')}`;
}

export function quotePosix(value) { return `'${value.replace(/'/g, `'"'"'`)}'`; }

export function remoteCommand(workspace, bin = 'codex') {
  const inner = `cd -- ${quotePosix(workspace)} && exec ${quotePosix(bin)} -c features.fast_mode=true app-server`;
  return `exec bash -lc ${quotePosix(inner)}`;
}

function connectionError(error, mismatch = false) {
  if (mismatch) return new Error('A impressão digital SSH não coincide. Confira a identidade da VPS antes de conectar.');
  if (error?.level === 'client-authentication') return new Error('O servidor SSH recusou o usuário ou a senha.');
  if (error?.code === 'ENOTFOUND') return new Error('Não foi possível encontrar o endereço da VPS.');
  if (error?.code === 'ECONNREFUSED') return new Error('A conexão SSH foi recusada. Confira a porta e o serviço SSH.');
  return new Error('A conexão SSH falhou ou foi encerrada. Confira o endereço, a porta e o acesso à VPS.');
}

// Probe deliberately rejects the key before SSH user authentication begins.
// Returning a fingerprint is discovery only; the user must independently check it.
export function probeHost(address, { ClientType = Client, timeoutMs = 10000 } = {}) {
  const endpoint = validateAddress(address);
  return new Promise((resolve, reject) => {
    const connection = new ClientType();
    let finished = false;
    const done = (error, result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      connection.destroy();
      if (error) reject(error); else resolve(result);
    };
    const timer = setTimeout(() => done(new Error('Tempo limite ao consultar a chave SSH da VPS.')), timeoutMs);
    connection.on('error', error => done(connectionError(error)));
    connection.on('close', () => { if (!finished) done(new Error('A VPS encerrou a consulta SSH antes de enviar a chave.')); });
    try {
      connection.connect({ ...endpoint, username: 'jarvis-host-probe', readyTimeout: timeoutMs, hostHash: 'sha256',
        hostVerifier: hash => { done(null, { fingerprint: fingerprintFromHash(hash) }); return false; },
      });
    } catch (error) { done(connectionError(error)); }
  });
}

export class SshTransport extends CodexTransport {
  constructor({ ClientType = Client, requestTimeoutMs = 30000, connectionTimeoutMs = 15000 } = {}) {
    super({ requestTimeoutMs });
    this.ClientType = ClientType;
    this.connectionTimeoutMs = connectionTimeoutMs;
    this.connection = null;
    this.credentials = null;
    this.endpoint = null;
    this.accountType = null;
    this.generation = 0;
  }

  configure(input) {
    if (this.child || this.starting || this.ready) throw Object.assign(new Error('Desconecte a sessão SSH atual antes de conectar outra.'), { status: 409 });
    const endpoint = validateAddress(input);
    const { username, password, fingerprint, workspace, bin = 'codex' } = input;
    if (typeof username !== 'string' || !/^[\w.@-]{1,128}$/.test(username)) throw new Error('Usuário SSH inválido.');
    if (typeof password !== 'string' || !password || password.length > 1024) throw new Error('Informe a senha SSH.');
    if (typeof fingerprint !== 'string' || !/^SHA256:[A-Za-z0-9+/]{43}$/.test(fingerprint)) throw new Error('Confirme a impressão digital SSH da VPS antes de conectar.');
    if (typeof workspace !== 'string' || workspace.length > 2048 || !path.posix.isAbsolute(workspace) || /[\x00-\x1f\x7f]/.test(workspace)) throw new Error('A pasta remota deve ser um caminho absoluto Linux, como /var/www.');
    if (typeof bin !== 'string' || !/^(?:\/[\w./-]+|[\w.-]+)$/.test(bin)) throw new Error('Caminho do Codex inválido. Informe codex ou um caminho absoluto sem argumentos.');
    this.credentials = { ...endpoint, username, password, fingerprint, workspace, bin };
    this.generation++;
    this.endpoint = { ...endpoint, username, workspace, fingerprint };
    this.accountType = null;
    this.closing = false;
  }

  async startProcess() {
    if (!this.credentials) throw new Error('Conecte sua VPS por SSH na interface antes de enviar uma mensagem.');
    const credentials = this.credentials;
    const connection = new this.ClientType();
    const child = new EventEmitter();
    child.stdin = null;
    this.connection = connection;
    this.child = child;
    this.closing = false;
    let mismatch = false;
    let buffer = '';
    const configuration = {
      host: credentials.host, port: credentials.port, username: credentials.username,
      password: credentials.password, readyTimeout: this.connectionTimeoutMs,
      keepaliveInterval: 15000, keepaliveCountMax: 3, hostHash: 'sha256',
      hostVerifier: hash => { mismatch = fingerprintFromHash(hash) !== credentials.fingerprint; return !mismatch; },
      tryKeyboard: false,
    };
    const command = remoteCommand(credentials.workspace, credentials.bin);
    // Credentials are connection-scoped, never saved for automatic reconnection.
    this.credentials = null;
    try {
      await new Promise((resolve, reject) => {
        let channelReady = false;
        const timer = setTimeout(() => {
          reject(new Error('Tempo limite ao iniciar o Codex pela conexão SSH.'));
          connection.destroy();
        }, this.connectionTimeoutMs);
        const fail = error => {
          clearTimeout(timer);
          const safe = connectionError(error, mismatch);
          if (!channelReady) reject(safe);
          this.failed(child, safe);
          connection.destroy();
        };
        connection.on('error', fail);
        connection.on('close', () => {
          clearTimeout(timer);
          if (!channelReady) reject(new Error('A conexão SSH foi encerrada durante a inicialização.'));
          this.failed(child, new Error('A conexão SSH com a VPS foi encerrada. Conecte novamente para continuar.'));
          if (this.connection === connection) this.connection = null;
        });
        connection.once('ready', () => {
          if (this.child !== child || this.closing) {
            clearTimeout(timer);
            reject(new Error('A conexão SSH foi cancelada.'));
            connection.destroy();
            return;
          }
          delete configuration.password;
          delete credentials.password;
          connection.exec(command, (error, stream) => {
            if (error) return fail(error);
            if (this.child !== child || this.closing) { stream.close(); connection.destroy(); reject(new Error('A conexão SSH foi cancelada.')); return; }
            channelReady = true;
            clearTimeout(timer);
            child.stdin = stream;
            child.stdout = stream;
            child.stderr = stream.stderr;
            stream.setEncoding('utf8');
            stream.on('data', chunk => {
              if (this.child !== child) return;
              buffer += chunk;
              if (Buffer.byteLength(buffer) > MAX_BUFFER) {
                this.failed(child, new Error('Resposta SSH excedeu o limite de transporte.'));
                connection.destroy();
                return;
              }
              let newline;
              while ((newline = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, newline).trim();
                buffer = buffer.slice(newline + 1);
                if (!line) continue;
                let packet;
                try { packet = JSON.parse(line); } catch { continue; }
                this.receive(packet);
              }
            });
            stream.stderr.on('data', () => {});
            stream.on('error', () => fail(new Error('SSH channel error')));
            stream.on('close', () => {
              this.failed(child, new Error('O Codex remoto encerrou. Confira se codex está instalado e autenticado na VPS.'));
              connection.end();
            });
            resolve();
          });
        });
        try { connection.connect(configuration); } catch (error) { fail(error); }
      });
      await this.request('initialize', { clientInfo: { name: 'jarvis_ssh', title: 'Luck SSH', version: '3.0.0' } });
      this.send({ method: 'initialized', params: {} });
      const result = await this.request('account/read', { refreshToken: false });
      if (result?.requiresOpenaiAuth && !result.account) throw new Error('Faça codex login no terminal da VPS com o mesmo usuário SSH e conecte novamente.');
      if (this.child !== child) throw new Error('A conexão SSH encerrou durante a inicialização.');
      this.accountType = result?.account?.type || 'external';
      this.ready = true;
    } catch (error) {
      delete credentials.password;
      delete configuration.password;
      this.failed(child, error);
      connection.destroy();
      if (this.connection === connection) this.connection = null;
      throw error;
    }
  }

  async close() {
    const generation = this.generation;
    this.closing = true;
    this.credentials = null;
    this.accountType = null;
    const child = this.child;
    const connection = this.connection;
    const stream = child?.stdin;
    if (child) this.failed(child, new Error('Conexão SSH encerrada.'));
    if (!connection) { this.emit('disconnected'); return; }
    await new Promise(resolve => {
      let finished = false;
      const finish = () => { if (finished) return; finished = true; clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => { connection.destroy(); finish(); }, 1000);
      connection.once('close', finish);
      try {
        if (!stream) connection.destroy();
        else { stream.end(); stream.close(); connection.end(); }
      } catch { connection.destroy(); finish(); }
    });
    if (this.connection === connection) this.connection = null;
    if (this.generation === generation) this.emit('disconnected');
  }
}
