import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter, once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/services/password.js';
import { inspectAttachment, MAX_FILE_BYTES } from '../src/services/attachmentService.js';

const password = 'test-attachments-password-123';
const passwordHash = await hashPassword(password);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=', 'base64');
const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF');
const zip = Buffer.from([80,75,5,6,...Array(18).fill(0)]);
const fingerprint = 'SHA256:' + 'a'.repeat(43);

class FakeTransport extends EventEmitter {
  ready = false;
  calls = [];
  endpoint = null;
  thread = 0;
  turn = 0;
  configure(value) { const { host, port, username, fingerprint, workspace } = value; this.endpoint = { host, port, username, fingerprint, workspace }; }
  async start() { this.ready = true; }
  async close() { this.ready = false; }
  async request(method, params) {
    this.calls.push({ method, params });
    if (method === 'thread/start') return { thread: { id: 'thread-' + ++this.thread } };
    if (method === 'thread/resume') return { thread: { id: params.threadId } };
    if (method === 'turn/start') return { turn: { id: 'turn-' + ++this.turn } };
    if (method === 'model/list') return { data: [{ id: 'base-id', model: 'base-model', isDefault: true }, { id: 'vision-id', model: 'vision-model' }] };
    return {};
  }
}
async function fixture(t, { ssh = false } = {}) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'luck-files-test-'));
  const transport = new FakeTransport();
  const config = { production:false, host:'127.0.0.1',port:3100,origin:'http://localhost:5173',username:'test',passwordHash,sessionSecret:'z'.repeat(80),mode:ssh?'ssh':'codex',workspace:root+'/workspace',dataDir:root+'/data',codexHome:root+'/codex',sandbox:'workspace-write',bin:'codex',apiKey:ssh?'':'test-api-key' };
  await fsp.mkdir(config.workspace, { recursive:true });
  if (ssh) {
    const local = remote => path.join(config.workspace, path.posix.relative('/srv/project', remote));
    const remote = file => path.posix.join('/srv/project', path.relative(config.workspace, file));
    transport.connection = { sftp(callback) {
      const client = {
        realpath(file, cb) { fs.realpath(local(file), (error, result) => cb(error, result ? remote(result) : undefined)); },
        stat(file, cb) { fs.stat(local(file), cb); },
        mkdir(file, options, cb) { fs.mkdir(local(file), options, cb); },
        readdir(file, cb) { fs.readdir(local(file), {withFileTypes:true}, async (error, entries) => { if (error) return cb(error); cb(null, await Promise.all(entries.map(async entry => ({ filename:entry.name,attrs:await fsp.lstat(path.join(local(file),entry.name)) })))); }); },
        createWriteStream(file, options) { return fs.createWriteStream(local(file), options); },
        createReadStream(file, options) { return fs.createReadStream(local(file), options); },
        end() {},
      };
      callback(null, client);
    } };
  }
  const runtime = createApp(config, { transport, probe: async () => ({ fingerprint }) });
  const server = runtime.app.listen(0,'127.0.0.1'); await once(server,'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await runtime.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fsp.rm(root,{recursive:true,force:true}); });
  const request = async (url, {method='GET', body, form, auth, raw=false, origin=config.origin}={}) => {
    const response = await fetch(base+url,{method,headers:{...(method!=='GET'?{Origin:origin}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...(auth?.cookie?{Cookie:auth.cookie}:{}),...(auth?.csrf?{'X-CSRF-Token':auth.csrf}:{})},body:form|| (body!==undefined?JSON.stringify(body):undefined)});
    return raw?response:{status:response.status,body:await response.json(),headers:response.headers};
  };
  const login = async () => { const r = await request('/api/auth/login',{method:'POST',body:{username:config.username,password}});assert.equal(r.status,200);return {cookie:r.headers.get('set-cookie').split(';')[0],csrf:r.body.csrfToken}; };
  const auth = await login();
  const upload = (files, extra={}) => { const form = new FormData(); for (const file of files) form.append('files',new Blob([file.data],{type:file.mime||'application/octet-stream'}),file.name);return request('/api/attachments',{method:'POST',form,auth,...extra}); };
  const create = async () => {const r=await request('/api/conversations',{method:'POST',body:{},auth});assert.equal(r.status,201);return r.body.conversation;};
  const connect = () => request('/api/connection/connect',{method:'POST',auth,body:{host:'vps.test',port:22,username:'test',password:'only-test-ssh',fingerprint,workspace:'/srv/project'}});
  return {...runtime,config,transport,root,request,login,auth,upload,create,connect};
}
async function eventually(fn) {for(let i=0;i<200;i++){const result=await fn();if(result)return result;await delay(10);}throw Error('Timed out');}

 test('attachment signatures distinguish safe images, PDF/ZIP and executable uploads', () => {
  assert.deepEqual(inspectAttachment(png,'foto.png','image/png'),{mime:'image/png',kind:'image'});
  assert.deepEqual(inspectAttachment(pdf,'doc.pdf','application/pdf'),{mime:'application/pdf',kind:'document'});
  assert.equal(inspectAttachment(zip,'arquivo.zip').kind,'archive');
  const tar = Buffer.alloc(512);tar.write('ustar',257);
  const archives = [
    ['old.rar',Buffer.from([82,97,114,33,26,7,0]),'application/vnd.rar'],
    ['new.rar',Buffer.from([82,97,114,33,26,7,1,0]),'application/vnd.rar'],
    ['backup.7z',Buffer.from([55,122,188,175,39,28]),'application/x-7z-compressed'],
    ['project.tar',tar,'application/x-tar'],
    ['project.tar.gz',Buffer.from([31,139,8]),'application/gzip'],
  ];
  for (const [name,bytes,mime] of archives) assert.deepEqual(inspectAttachment(bytes,name),{mime,kind:'archive'});
  for (const name of ['fake.rar','fake.7z','fake.tar','fake.gz']) assert.throws(()=>inspectAttachment(Buffer.from('invalid'),name),/assinatura/);
  assert.equal(inspectAttachment(Buffer.from('<svg onload=alert(1)>'),'x.svg','image/svg+xml').kind,'file');
  assert.throws(()=>inspectAttachment(Buffer.from('<script>x</script>'),'fake.png','image/png'),/imagem/);
  assert.throws(()=>inspectAttachment(Buffer.from('not pdf'),'fake.pdf'),/PDF/);
  assert.throws(()=>inspectAttachment(Buffer.from('not zip'),'fake.docx'),/ZIP/);
 });

 test('uploads require authentication/CSRF, enforce limits, preserve private metadata and safe downloads', async t => {
  const f=await fixture(t);
  const files=[{name:'foto.png',data:png,mime:'image/png'}];
  assert.equal((await f.upload(files,{auth:undefined})).status,401);
  assert.equal((await f.upload(files,{auth:{cookie:f.auth.cookie}})).status,403);
  assert.equal((await f.upload([{name:'fake.png',data:'<script>alert(1)</script>',mime:'image/png'}])).status,400);
  assert.equal((await f.upload(Array.from({length:9},(_,i)=>({name:`a${i}.txt`,data:'x'})))).status,413);
  assert.equal((await f.upload([{name:'large.bin',data:Buffer.alloc(MAX_FILE_BYTES+1)}])).status,413);
  assert.equal((await f.upload([{name:'1.bin',data:Buffer.alloc(21*1024*1024)},{name:'2.bin',data:Buffer.alloc(21*1024*1024)},{name:'3.bin',data:Buffer.alloc(21*1024*1024)}])).status,413);
  const success=await f.upload([{name:'foto.png',data:png,mime:'image/png'},{name:'relatório.pdf',data:pdf,mime:'application/pdf'},{name:'projeto.zip',data:zip,mime:'application/zip'}]);
  assert.equal(success.status,201);assert.equal(success.body.attachments.length,3);
  const a=success.body.attachments[0];
  assert.deepEqual(Object.keys(a).sort(),['id','kind','mime','name','size','url'].sort());
  assert.equal((await f.request(a.url)).status,401);
  const image=await f.request(a.url,{auth:f.auth,raw:true});
  assert.equal(image.headers.get('content-type'),'image/png');assert.match(image.headers.get('content-disposition'),/^inline/);assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);
  const download=await f.request(a.url+'?download=1',{auth:f.auth,raw:true});assert.match(download.headers.get('content-disposition'),/^attachment/);
  const document=await f.request(success.body.attachments[1].url,{auth:f.auth,raw:true});assert.equal(document.headers.get('content-type'),'application/octet-stream');assert.match(document.headers.get('content-security-policy'),/sandbox/);
  const eight=await f.upload(Array.from({length:8},(_,i)=>({name:`file-${i}.txt`,data:'hello'})));assert.equal(eight.status,201);
  assert.equal((await fsp.readdir(f.attachments.directory)).some(name=>name.endsWith('.pending')),false);
 });

 test('attachment-only messages persist previews and give Codex real local image/doc paths', async t => {
  const f=await fixture(t);const c=await f.create();
  const uploaded=await f.upload([{name:'imagem.png',data:png},{name:'documento.pdf',data:pdf},{name:'arquivo.zip',data:zip}]);
  const ids=uploaded.body.attachments.map(a=>a.id);
  const url=`/api/conversations/${c.id}`;
  const invalid=await f.request(url+'/messages',{method:'POST',auth:f.auth,body:{text:'x',attachmentIds:['../../etc/passwd']}});assert.equal(invalid.status,400);
  const result=await f.request(url+'/messages',{method:'POST',auth:f.auth,body:{text:'',attachmentIds:ids}});assert.equal(result.status,202);
  const turn=await eventually(()=>f.transport.calls.find(call=>call.method==='turn/start'));
  const image=turn.params.input.find(item=>item.type==='localImage');assert.ok(image.path.startsWith(f.config.workspace+'/.luck/uploads/'));assert.deepEqual(await fsp.readFile(image.path),png);
  assert.match(turn.params.input[0].text,/documento.pdf/);assert.match(turn.params.input[0].text,/nunca execute anexos automaticamente/);
  const detail=(await f.request(url,{auth:f.auth})).body.conversation;
  assert.equal(detail.messages[0].text,'');assert.equal(detail.messages[0].attachments.length,3);assert.equal(detail.title,'imagem.png');
  assert.equal(JSON.stringify(detail).includes(f.config.dataDir),false);
  const thread=f.store.get(c.id).threadId;f.transport.emit('notification',{method:'turn/completed',params:{threadId:thread,turn:{id:'turn-1',status:'completed'}}});
 });

 test('workspace browsing and binary downloads reject traversal, external paths and escaped symlinks', async t => {
  const f=await fixture(t);const c=await f.create();
  await fsp.mkdir(f.config.workspace+'/.luck/outputs',{recursive:true});await fsp.writeFile(f.config.workspace+'/.luck/outputs/output.png',png);await fsp.writeFile(f.root+'/secret.txt','outside-secret');await fsp.symlink(f.root+'/secret.txt',f.config.workspace+'/escaped.txt');
  const list=await f.request('/api/files?path=.',{auth:f.auth});assert.equal(list.status,200);assert.equal(list.body.path,'.');assert.ok(list.body.files.some(x=>x.name==='.luck'&&x.path==='.luck'));assert.ok(!list.body.files.some(x=>x.name==='escaped.txt'));
  const fileUrl=p=>`/api/conversations/${c.id}/files?path=${encodeURIComponent(p)}`;
  for(const target of ['../secret.txt','/etc/passwd','escaped.txt'])assert.equal((await f.request(fileUrl(target),{auth:f.auth})).status,403);
  const downloaded=await f.request(fileUrl('.luck/outputs/output.png'),{auth:f.auth,raw:true});assert.equal(downloaded.status,200);assert.match(downloaded.headers.get('content-disposition'),/^attachment/);assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),png);
  const preview=await f.request(fileUrl('.luck/outputs/output.png')+'&preview=1',{auth:f.auth,raw:true});assert.equal(preview.headers.get('content-type'),'image/png');
  const nested=await f.request('/api/files?path=.luck%2Foutputs',{auth:f.auth});assert.equal(nested.body.path,'.luck/outputs');assert.equal(nested.body.files[0].path,'.luck/outputs/output.png');
 });

 test('SSH attachments require owner, transfer via SFTP and pass remote image paths to Codex', async t => {
  const f=await fixture(t,{ssh:true});
  assert.equal((await f.upload([{name:'photo.png',data:png}])).status,409);
  assert.equal((await f.connect()).status,200);
  const other=await f.login();
  assert.equal((await f.upload([{name:'photo.png',data:png}],{auth:other})).status,409);
  const uploaded=await f.upload([{name:'photo.png',data:png}]);assert.equal(uploaded.status,201);
  const c=await f.create();const result=await f.request(`/api/conversations/${c.id}/messages`,{method:'POST',auth:f.auth,body:{attachmentIds:[uploaded.body.attachments[0].id]}});assert.equal(result.status,202);
  const turn=await eventually(()=>f.transport.calls.find(call=>call.method==='turn/start'));
  const image=turn.params.input.find(item=>item.type==='localImage');assert.ok(image.path.startsWith('/srv/project/.luck/uploads/'));assert.ok(!image.path.startsWith('/tmp/'));
  assert.deepEqual(await fsp.readFile(path.join(f.config.workspace,path.posix.relative('/srv/project',image.path))),png);
  const list=await f.request('/api/files?path=.luck/uploads',{auth:f.auth});assert.equal(list.status,200);assert.equal(list.body.files.length,1);
  const download=await f.request(`/api/conversations/${c.id}/files?path=${encodeURIComponent(image.path)}`,{auth:f.auth,raw:true});assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),png);
  assert.equal((await f.request('/api/files',{auth:other})).status,409);
  assert.equal((await f.request(`/api/conversations/${c.id}`,{method:'PATCH',auth:other,body:{model:'vision-model'}})).status,409);
  f.transport.emit('notification',{method:'turn/completed',params:{threadId:f.store.get(c.id).threadId,turn:{id:'turn-1',status:'completed'}}});
 });

 test('conversation model selection validates catalog and resets model on already loaded turns', async t => {
  const f=await fixture(t);await f.transport.start();const c=await f.create();const url=`/api/conversations/${c.id}`;
  assert.equal((await f.request(url,{method:'PATCH',auth:f.auth,body:{model:'nonexistent'}})).status,400);
  const picked=await f.request(url,{method:'PATCH',auth:f.auth,body:{model:'vision-id'}});assert.equal(picked.status,200);assert.equal(picked.body.conversation.model,'vision-model');
  await f.request(url+'/messages',{method:'POST',auth:f.auth,body:{text:'Hi'}});await eventually(()=>f.store.get(c.id).activeTurnId==='turn-1');
  assert.equal(f.transport.calls.find(x=>x.method==='turn/start').params.model,'vision-model');
  f.transport.emit('notification',{method:'turn/completed',params:{threadId:f.store.get(c.id).threadId,turn:{id:'turn-1',status:'completed'}}});
  assert.equal((await f.request(url,{method:'PATCH',auth:f.auth,body:{model:null}})).status,200);
  await f.request(url+'/messages',{method:'POST',auth:f.auth,body:{text:'Again'}});await eventually(()=>f.store.get(c.id).activeTurnId==='turn-2');
  assert.equal(f.transport.calls.filter(x=>x.method==='turn/start')[1].params.model,'base-model');
  f.transport.emit('notification',{method:'turn/completed',params:{threadId:f.store.get(c.id).threadId,turn:{id:'turn-2',status:'completed'}}});
 });
