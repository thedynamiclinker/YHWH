const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../lib/initial.mjs');
async function fixture() {
  const { createInitial }=await modulePromise;
  const files=new Map([['/YHWH',{directory:true}],['/YHWH/notes',{directory:true}]]);let cwd='/YHWH',root=null,revision=0;const views=[];
  const stat=async path=>{if(!files.has(path))throw new Error('ENOENT: not found');return files.get(path);};
  const read=async path=>{const file=await stat(path);return {...file,kind:file.directory?'directory':'text',path};};
  const list=async path=>{if(!(await stat(path)).directory)throw new Error('Not a folder');return [...files.entries()].filter(([name])=>name.startsWith(path+'/')&&!name.slice(path.length+1).includes('/')).map(([name,value])=>({...value,name:name.split('/').at(-1),path:name}));};
  const create=async(path,directory)=>{if(files.has(path))throw new Error('Already exists');if(!files.get(path.slice(0,path.lastIndexOf('/')))?.directory)throw new Error('Parent not found');files.set(path,{directory,content:'',modified:++revision});};
  const save=async(path,content,modified)=>{const old=await stat(path);if(modified!=null&&modified!==old.modified)throw new Error('This file changed');const file={...old,content,modified:++revision};files.set(path,file);return{modified:file.modified};};
  const host={home:'/YHWH',cwd:()=>cwd,root:()=>root,stat,read,list,create,save,
    navigate:async path=>{cwd=path;},chroot:async path=>{root=path;cwd=path||'/YHWH';},
    view:async value=>views.push(value),open:async()=>{},copy:async(from,to)=>{if(files.has(to))throw new Error('Already exists');files.set(to,{...(await stat(from))});},move:async(from,to)=>{if(files.has(to))throw new Error('Already exists');files.set(to,await stat(from));files.delete(from);},trash:async path=>files.delete(path),builtins:()=>[{id:'save',name:'Save note',run:async()=>{}}]};
  const initial=createInitial(host);await initial.reload();return{initial,files,host,views};
}
test('Initials retain Unicode, shell quoting, search names and gesture metadata in ordinary rc text',async()=>{
  const {parseRC,printRC,quote}=await modulePromise;
  const aliases=[{name:'愛',names:['ai','love','amor'],script:"echo 'Abe’s $HOME'",gesture:[[0,0],[1,0],[1,1],[0,1]]}];
  assert.deepEqual(parseRC(printRC(aliases)),aliases);
  assert.equal((await fixture()).initial.help('alpha').includes('ls | view'),true);
  assert.match(quote("can't"),/\\'/);
  assert.throws(()=>parseRC("alias A 'pwd'\nnames A 'same'\nalias B 'pwd'\nnames B 'same'"),/already used/);
});
test('Words compose typed file output, aliases and app actions, and reload from files',async()=>{
  const {initial,files}=await fixture();
  await initial.saveAlias({name:'愛',names:['ai','love','amor'],script:'echo beloved'});
  await initial.saveWord('morning',"mkdir journal\n愛 > journal/hello.md\nls journal | view");
  await initial.run('morning');
  assert.equal(files.get('/YHWH/journal/hello.md').content,'beloved');
  assert.equal((await initial.run('amor')).text,'beloved');
  await initial.reload();assert.ok(initial.catalog().some(item=>item.name==='morning'&&item.kind==='Words'));
});
test('pipes preserve file records through filtering; substitutions are data rather than executable syntax',async()=>{
  const {initial}=await fixture();
  await initial.run("touch 'one.md'; touch 'two.txt'");
  const list=await initial.run('ls | grep md | sort | head 1');assert.equal(list.kind,'entries');assert.equal(list.entries[0].name,'one.md');
  assert.equal((await initial.run("echo $(echo 'hello; mkdir evil')")).text,'hello; mkdir evil');
  assert.equal((await initial.run('echo "$(echo $(echo nested))"')).text,'nested');
  assert.equal((await initial.run("echo '$HOME'" )).text,'$HOME');
  await initial.saveAlias({name:'G',names:['gee'],script:'grep md'});assert.equal((await initial.run('ls | G')).entries.length,1);
});
test('redirects append and read saved text with optimistic versions',async()=>{
  const {initial,files}=await fixture();
  await initial.run('echo one > out.txt; echo two >> out.txt');
  assert.equal((await initial.run('cat < out.txt')).text,'onetwo');
  assert.equal((await initial.run('pwd')).text,'/YHWH');assert.equal(files.get('/YHWH/out.txt').content,'onetwo');
});
test('Word arguments and explicit paths use the same resolver; recursive scripts fail within bounds',async()=>{
  const {initial}=await fixture();
  await initial.saveWord('make','mkdir "$1"\nls "$1"');
  assert.equal((await initial.run("~/bin/make 'with spaces'")).kind,'entries');
  await initial.saveWord('loop','loop');await assert.rejects(initial.run('loop'),/Recursive/);
  await assert.rejects(initial.run('echo unfinished |'),/after/);
  await assert.rejects(initial.run('unknown-action'),/No command/);
  assert.equal((await initial.run('/bin/pwd')).text,'/YHWH');
});
test('stale alias and Word edits preserve externally edited files',async()=>{
  const {initial,host,files}=await fixture();
  await initial.saveAlias({name:'Z',names:['zed'],script:'pwd'});
  const old=files.get('/YHWH/.initialrc');await host.save('/YHWH/.initialrc',old.content+'# external\n',old.modified);
  await assert.rejects(initial.saveAlias({name:'Y',names:['why'],script:'pwd'}),/changed/);
  await initial.reload();await initial.saveWord('a','pwd');const file=await initial.readWord('a');
  await host.save('/YHWH/bin/a','echo external',file.modified);
  await assert.rejects(initial.saveWord('a','echo overwritten',file.modified),/changed/);
  assert.equal(files.get('/YHWH/bin/a').content,'echo external');
});
test('folder root constrains relative and absolute operations and leaves explicitly',async()=>{
  const {initial,files}=await fixture();
  await initial.run('chroot notes');assert.equal((await initial.run('pwd')).text,'/');
  await initial.run('touch /inside');assert.ok(files.has('/YHWH/notes/inside'));
  await assert.rejects(initial.run('cat ../outside'),/leaves/);
  await initial.run('chroot --leave');assert.equal((await initial.run('pwd')).text,'/YHWH');
});
test('live and fixed views have different output semantics; help and pipeline errors are explicit',async()=>{
  const {initial,views}=await fixture();
  await initial.run('ls | view');await initial.run('fm .');
  assert.equal(views[0].kind,'snapshot');assert.equal(views[1].kind,'live');
  assert.match((await initial.run('ls --help')).text,/fixed list/);
  await assert.rejects(initial.run('echo $(save)'),/do not produce/);
  await assert.rejects(initial.run('cat >'),/redirect/);
});
test('gestures match size-independent paths and reject unknown or ambiguous marks',async()=>{
  const {normalizeGesture,matchGesture}=await modulePromise;
  const stroke=[[0,0],[0,30],[0,60],[0,90],[40,90],[80,90]];
  const gesture=normalizeGesture(stroke),aliases=[{name:'L',gesture}];
  assert.equal(matchGesture(stroke.map(([x,y])=>[x*2+50,y*2+90]),aliases).alias.name,'L');
  assert.equal(matchGesture(stroke,[...aliases,{name:'B',gesture}]).ambiguous,true);
  assert.equal(matchGesture([[0,100],[30,60],[60,20],[100,0]],aliases),null);
});

test('default aliases can be removed before rc exists; explicit /bin bypasses user names',async()=>{
  const {initial}=await fixture();await initial.removeAlias('F');assert.ok(!initial.catalog().some(item=>item.name==='F'));
  await initial.saveAlias({name:'pwd',names:['where'],script:'echo mine'});
  assert.equal((await initial.run('pwd')).text,'mine');assert.equal((await initial.run('/bin/pwd')).text,'/YHWH');
  await initial.saveWord('native','#!/bin/sh\nmkdir unsafe');await assert.rejects(initial.run('native'),/native interpreter/);
});
