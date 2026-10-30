import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CredentialVault } from '../src/services/credentialVault.js';

const secret = 'server-session-secret-'.repeat(4);
const password = 'only-memory-password-não-salvar-em-claro';
const profile = { host:'vps.example.test',port:22,username:'root',password,workspace:'/srv/project',fingerprint:'SHA256:'+'a'.repeat(43) };
function setup(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'luck-vault-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const config={username:'admin',sessionSecret:secret,dataDir:root};
  return {config,vault:new CredentialVault(config)};
}

test('AES-GCM vault persists only ciphertext with private permissions and new nonce per save',t=>{
  const {config,vault}=setup(t);
  assert.equal(vault.load(),null);
  const metadata=vault.save(profile);
  assert.equal(metadata.host,profile.host);assert.equal(metadata.password,undefined);
  const first=fs.readFileSync(vault.file,'utf8');
  for(const value of [password,profile.host,profile.workspace,profile.fingerprint,secret]) assert.ok(!first.includes(value));
  assert.equal(fs.statSync(vault.file).mode & 0o777,0o600);
  const envelope=JSON.parse(first);assert.equal(envelope.algorithm,'aes-256-gcm');assert.equal(Buffer.from(envelope.iv,'base64').length,12);assert.equal(Buffer.from(envelope.tag,'base64').length,16);
  const restored=new CredentialVault(config);assert.equal(restored.load().password,password);assert.deepEqual(restored.publicProfile(),metadata);
  vault.save(profile);assert.notEqual(JSON.parse(fs.readFileSync(vault.file,'utf8')).iv,envelope.iv);
  assert.deepEqual(fs.readdirSync(config.dataDir),['vps-profile.enc.json']);
});

test('vault binds owner/key and detects ciphertext, tag, version and malformed storage without leaking secrets',t=>{
  const {config,vault}=setup(t);vault.save(profile);
  const original=fs.readFileSync(vault.file,'utf8');
  for(const other of [{...config,username:'another-admin'},{...config,sessionSecret:'wrong-secret'.repeat(8)}]){
    const result=new CredentialVault(other).inspect();assert.equal(result.profile,null);assert.match(result.error,/perfil salvo/);assert.ok(!result.error.includes(password));
  }
  for(const change of [e=>({...e,ciphertext:Buffer.from('tampered').toString('base64')}),e=>({...e,tag:Buffer.alloc(16).toString('base64')}),e=>({...e,version:9})]){
    fs.writeFileSync(vault.file,JSON.stringify(change(JSON.parse(original))));assert.equal(vault.inspect().profile,null);assert.throws(()=>vault.load(),error=>error.status===409&&!error.message.includes(password));
  }
  fs.writeFileSync(vault.file,'invalid-json'+password);assert.equal(vault.inspect().profile,null);assert.ok(!JSON.stringify(vault.inspect()).includes(password));
  vault.forget();assert.equal(vault.load(),null);vault.forget();
});

test('failed atomic replacement preserves previous encrypted profile and removes temporary files',t=>{
  const {config,vault}=setup(t);vault.save(profile);const original=fs.readFileSync(vault.file,'utf8');
  const failing=new CredentialVault(config,{filesystem:{...fs,renameSync(){throw Error('disk failure '+password);}}});
  assert.throws(()=>failing.save({...profile,password:'new-private-password'}),error=>!error.message.includes(password));
  assert.equal(fs.readFileSync(vault.file,'utf8'),original);assert.equal(vault.load().password,password);assert.deepEqual(fs.readdirSync(config.dataDir),['vps-profile.enc.json']);
  assert.throws(()=>vault.save({...profile,password:''}),/salvar/);assert.equal(fs.readFileSync(vault.file,'utf8'),original);
});
