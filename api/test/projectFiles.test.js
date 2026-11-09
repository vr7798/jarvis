import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { ProjectFiles, validateProjectGitUrl } from '../src/services/projectFiles.js';

async function fixture(t, { config = {} } = {}) {
  const temporary = await fsp.mkdtemp('/tmp/jarvis-project-files-');
  const root = path.join(temporary, 'workspace'), outside = path.join(temporary, 'private');
  await fsp.mkdir(root); await fsp.mkdir(outside);
  const state = { opened: 0, ended: 0, commands: [], cloneCode: 0, renameError: null };
  const connection = {
    sftp(callback) {
      state.opened++;
      const client = {
        realpath: fs.realpath, lstat: fs.lstat, stat: fs.stat, mkdir: fs.mkdir, unlink: fs.unlink, rmdir: fs.rmdir, chmod: fs.chmod,
        readdir(file, cb) { fs.readdir(file, async (error, names) => {
          if (error) return cb(error);
          try { cb(null, await Promise.all(names.map(async filename => ({ filename, attrs: await fsp.lstat(path.join(file, filename)) })))); } catch (err) { cb(err); }
        }); },
        createReadStream: fs.createReadStream, createWriteStream: fs.createWriteStream,
        ext_openssh_rename(from, to, cb) { state.renameError ? cb(state.renameError) : fs.rename(from, to, cb); },
        rename(from, to, cb) { fs.lstat(to, error => { if (!error) return cb(Object.assign(new Error('exists'), { code: 'EEXIST' })); fs.rename(from, to, cb); }); },
        end() { state.ended++; },
      };
      callback(null, client);
    },
    exec(command, options, callback) {
      state.commands.push(command);
      const channel = new EventEmitter(); channel.stderr = new EventEmitter(); channel.setEncoding = () => {}; channel.close = () => channel.emit('close', 1); channel.signal = () => {};
      callback(null, channel);
      setImmediate(async () => {
        if (command.includes(' clone ')) {
          const staging = command.match(/'([^']+\.luck-clone-[a-f0-9-]+)'$/)?.[1];
          assert.ok(staging, 'clone uses a generated staging path');
          await fsp.mkdir(path.join(staging, '.git'));
          await fsp.writeFile(path.join(staging, 'README.md'), '# Project\n');
          if (state.cloneCode) await fsp.symlink(outside, path.join(staging, 'outside-link'));
          channel.stderr.emit('data', 'private token must never appear in error messages');
          channel.emit('exit', state.cloneCode); channel.emit('close', state.cloneCode);
        } else if (command.includes('symbolic-ref')) { channel.emit('data', 'main\n'); channel.emit('exit', 0); channel.emit('close', 0); }
        else { channel.emit('data', ' M index.js\0?? novo.js\0'); channel.emit('exit', 0); channel.emit('close', 0); }
      });
    },
  };
  const service = new ProjectFiles({ config, connection, workspace: root });
  t.after(() => fsp.rm(temporary, { recursive: true, force: true }));
  return { service, connection, root, outside, state };
}

test('project explorer stays within workspace and hides symbolic links and heavy metadata by default', async t => {
  const f = await fixture(t);
  await fsp.mkdir(path.join(f.root, 'src')); await fsp.mkdir(path.join(f.root, '.git')); await fsp.mkdir(path.join(f.root, 'node_modules'));
  await fsp.writeFile(path.join(f.root, 'README.md'), '# Test'); await fsp.writeFile(path.join(f.root, '.env'), 'private');
  await fsp.symlink(f.outside, path.join(f.root, 'escape'));
  await fsp.symlink(path.join(f.root, 'README.md'), path.join(f.root, 'inside-link'));
  assert.deepEqual((await f.service.list()).files.map(item => item.name), ['src', 'README.md']);
  assert.ok((await f.service.list('.', { showHidden: true })).files.some(item => item.name === '.env'));
  await assert.rejects(f.service.open('../private/secret'), { status: 400 });
  await assert.rejects(f.service.open(path.join(f.outside, 'secret')), { status: 403 });
  await assert.rejects(f.service.open('escape/secret'), { status: 403 });
  await assert.rejects(f.service.open('inside-link'), { status: 403 });
  assert.equal(f.state.opened, f.state.ended);
});

test('editor handles UTF-8 text and rejects binary and oversized files with bounded reads', async t => {
  const f = await fixture(t);
  await fsp.writeFile(path.join(f.root, 'texto.txt'), 'Olá, projeto 🐕\n');
  const opened = await f.service.open('texto.txt');
  assert.equal(opened.content, 'Olá, projeto 🐕\n'); assert.match(opened.revision, /^[a-f0-9]{64}$/);
  await fsp.writeFile(path.join(f.root, 'binary.bin'), Buffer.from([0, 1, 2, 3]));
  await fsp.writeFile(path.join(f.root, 'encoding.txt'), Buffer.from([0xff, 0xfe, 0xfd]));
  await fsp.writeFile(path.join(f.root, 'large.txt'), Buffer.alloc(1024 * 1024 + 1, 97));
  await assert.rejects(f.service.open('binary.bin'), { status: 415 });
  await assert.rejects(f.service.open('encoding.txt'), { status: 415 });
  await assert.rejects(f.service.open('large.txt'), { status: 413 });
  assert.equal(f.state.opened, f.state.ended);
});

test('atomic saves preserve permissions, reject stale revisions and serialize concurrent changes', async t => {
  const f = await fixture(t), file = path.join(f.root, 'run.sh');
  await fsp.writeFile(file, 'old\n', { mode: 0o755 });
  const opened = await f.service.open('run.sh');
  const updated = await f.service.save('run.sh', 'novo 🐕\n', opened.revision);
  assert.equal(await fsp.readFile(file, 'utf8'), updated.content); assert.equal((await fsp.stat(file)).mode & 0o777, 0o755);
  await assert.rejects(f.service.save('run.sh', 'stale', opened.revision), { status: 409 });
  const results = await Promise.allSettled([f.service.save('run.sh', 'one', updated.revision), f.service.save('run.sh', 'two', updated.revision)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.status, 409);
  assert.ok(!(await fsp.readdir(f.root)).some(name => name.startsWith('.luck-save-')));
  f.state.renameError = Object.assign(new Error('denied'), { code: 'EACCES' });
  const latest = await f.service.open('run.sh');
  await assert.rejects(f.service.save('run.sh', 'must not replace', latest.revision), { status: 403 });
  assert.equal(await fsp.readFile(file, 'utf8'), latest.content);
  assert.ok(!(await fsp.readdir(f.root)).some(name => name.startsWith('.luck-save-')));
});

test('create is exclusive and read-only policy prevents every mutation', async t => {
  const f = await fixture(t);
  assert.equal((await f.service.create({ name: 'Novo projeto', type: 'directory' })).path, 'Novo projeto');
  assert.equal((await f.service.create({ parent: 'Novo projeto', name: 'ação.js', type: 'file' })).path, 'Novo projeto/ação.js');
  await assert.rejects(f.service.create({ parent: 'Novo projeto', name: 'ação.js' }), { status: 409 });
  for (const name of ['..', '.', '../escape', 'a/b', 'a\\b', '\0']) await assert.rejects(f.service.create({ name }), { status: 400 });
  const readonly = new ProjectFiles({ connection: f.connection, workspace: f.root, config: { sandbox: 'read-only' } });
  await assert.rejects(readonly.create({ name: 'denied' }), { status: 403 });
  await assert.rejects(readonly.save('anything', 'x', 'a'.repeat(64)), { status: 403 });
  await assert.rejects(readonly.clone({ url: 'https://example.test/owner/repo.git' }), { status: 403 });
  assert.ok((await readonly.list()).files.some(file => file.name === 'Novo projeto'));
});

test('Git URLs reject local paths, forbidden protocols, credentials, query tokens and shell syntax', () => {
  for (const value of ['https://github.com/owner/repo.git', 'http://git.example.test/org/repo', 'ssh://git@github.com/owner/repo.git', 'git@github.com:owner/repo.git']) assert.equal(validateProjectGitUrl(value), value);
  for (const value of ['file:///etc/passwd', 'file:/tmp/repo', 'ext::sh -c id', 'git://host/repo', 'ftp://host/repo', '/tmp/repo', '../repo', 'C:/Users/repo', '--upload-pack=bad', 'https://token@host/org/repo.git', 'https://owner:password@host/repo', 'https://host/repo?token=secret', 'ssh://git:secret@host/repo', 'ssh://-option/repo', 'git@host:repo;id', 'git@host:repo\ncommand']) assert.throws(() => validateProjectGitUrl(value), { status: 400 });
});

test('catalog and Git status identify projects without executing project scripts', async t => {
  const f = await fixture(t);
  await fsp.mkdir(path.join(f.root, 'app/.git'), { recursive: true });
  await fsp.mkdir(path.join(f.root, 'projects/another/.git'), { recursive: true });
  const catalog = await f.service.projects();
  assert.ok(catalog.projects.some(project => project.path === 'app' && project.isGit));
  assert.ok(catalog.projects.some(project => project.path === 'projects/another' && project.isGit));
  const info = await f.service.gitInfo('app');
  assert.equal(info.branch, 'main'); assert.equal(info.changedCount, 2);
  assert.deepEqual(info.changedFiles.map(file => file.path), ['index.js', 'novo.js']);
  assert.ok(f.state.commands.every(command => command.includes('core.hooksPath=/dev/null') && command.includes('core.fsmonitor=false') && command.includes('--work-tree=')));
  await fsp.symlink(path.join(f.outside, 'config'), path.join(f.root, 'app/.git/config'));
  await assert.rejects(f.service.gitInfo('app'), { status: 403 });
});

test('clone stages privately, never overwrites a project and cleans only owned staging files on failure', async t => {
  const f = await fixture(t);
  const cloned = await f.service.clone({ url: 'https://example.test/owner/repo.git', name: 'Projeto novo' });
  assert.equal(cloned.path, 'projects/Projeto novo'); assert.equal(cloned.isGit, true);
  assert.equal(await fsp.readFile(path.join(f.root, cloned.path, 'README.md'), 'utf8'), '# Project\n');
  await assert.rejects(f.service.clone({ url: 'https://example.test/owner/another.git', name: 'Projeto novo' }), { status: 409 });
  assert.equal(f.state.commands.length, 1);
  await fsp.writeFile(path.join(f.outside, 'keep.txt'), 'keep');
  f.state.cloneCode = 1;
  await assert.rejects(f.service.clone({ url: 'git@example.test:owner/repo.git', name: 'failure' }), error => error.status === 502 && !error.message.includes('private token'));
  assert.equal(await fsp.readFile(path.join(f.outside, 'keep.txt'), 'utf8'), 'keep');
  assert.ok(!(await fsp.readdir(path.join(f.root, 'projects'))).some(name => name.startsWith('.luck-clone-')));
  assert.equal(f.state.opened, f.state.ended);
  const command = f.state.commands.at(-1);
  assert.ok(command.includes('GIT_TERMINAL_PROMPT=0') && command.includes('BatchMode=yes') && command.includes('protocol.file.allow=never') && command.includes('--no-recurse-submodules'));
});

test('remote channel deadlines close late SFTP handles and cancel hung Git operations', async () => {
  let ended = 0, signalled = 0;
  const connection = {
    sftp(callback) { setTimeout(() => callback(null, { end() { ended++; } }), 35); },
    exec(command, options, callback) {
      const channel = new EventEmitter(); channel.stderr = new EventEmitter();
      channel.signal = () => { signalled++; }; channel.close = () => channel.emit('close', 1);
      callback(null, channel);
    },
  };
  const service = new ProjectFiles({ connection, workspace: '/workspace', config: { projectOperationTimeoutMs: 10 } });
  await assert.rejects(service.list(), { status: 504 });
  await delay(40); assert.equal(ended, 1);
  // Keep the event loop alive while the service's deliberately unref'd deadline expires.
  await Promise.all([assert.rejects(service.exec('git --version'), { status: 504 }), delay(20)]);
  assert.equal(signalled, 1);
});
