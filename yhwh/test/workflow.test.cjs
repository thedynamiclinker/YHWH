const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const cli=path.resolve(__dirname,'../bin/yhwh');
async function fixture(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'yhwh-workflow-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const root=path.join(dir,'repo'),bin=path.join(dir,'bin');await fs.mkdir(root);await fs.mkdir(bin);
 const env={...process.env,PATH:bin+path.delimiter+process.env.PATH,YHWH_AGENT:path.join(bin,'agent'),GIT_AUTHOR_NAME:'Workflow Test',GIT_AUTHOR_EMAIL:'test@example.invalid',GIT_COMMITTER_NAME:'Workflow Test',GIT_COMMITTER_EMAIL:'test@example.invalid'};
 const git=(...args)=>{const r=spawnSync('git',args,{cwd:root,env,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout;};
 git('init','-q');await fs.writeFile(path.join(root,'.gitignore'),'fail\n');await fs.writeFile(path.join(root,'COVENANT.md'),'## Todo\n\n- [ ] [[kanban/improve|Improve the result]]\n');await fs.mkdir(path.join(root,'kanban'));await fs.writeFile(path.join(root,'kanban/improve.md'),'Make the result useful.');await fs.writeFile(path.join(root,'result.txt'),'before\n');git('add','.');git('commit','-qm','Initial');
 await fs.writeFile(path.join(bin,'agent'),`#!/usr/bin/env node
let input='';process.stdin.on('data',d=>input+=d);process.stdin.on('end',()=>{const r=JSON.parse(input);if(r.phase==='begin')console.log(JSON.stringify({title:'Improve result',intent:'A useful result',implementation:'Inspect and improve result.txt.',questions:[{id:'tone',prompt:'Which tone?',choices:['Plain','Warm'],required:true}],blockers:[],assumptions:[]}));if(r.phase==='questions')console.log(JSON.stringify({questions:r.draft.questions}));if(r.phase==='review')console.log(JSON.stringify({prompt:'Make result.txt useful. Use a '+r.answers.tone+' tone. '+ 'Preserve the exact original English instruction while wrapping its companion commit message at seventy-two columns. '.repeat(2),questions:[],blockers:[]}));if(r.phase==='commit')console.log(JSON.stringify({summary:'Make the result useful',documents:[{path:'doc/declarative/result.md',content:'# Result\\n\\nThe result is useful.\\n'}],unnecessary:false}));});\n`,{mode:0o755});
 await fs.writeFile(path.join(bin,'lordhavemercy'),'#!/usr/bin/env bash\ncat > /dev/null\nif [[ -e fail ]]; then printf "failed\\n"; exit 9; fi\nprintf "useful\\n" > result.txt\n',{mode:0o755});
 const run=(...args)=>spawnSync(process.execPath,[cli,...args],{cwd:root,env,encoding:'utf8'});
 const ok=(...args)=>{const r=run(...args);assert.equal(r.status,0,r.stderr+'\n'+r.stdout);return r.stdout.trim();};
 return {root,bin,env,git,run,ok};
}
async function prepared(f){f.ok('begin','Improve the result');const draft=f.ok('review','--list').split('\n').find(x=>x.startsWith('improve-result'));const answers=path.join(f.root,'answers.json');await fs.writeFile(answers,'{"tone":"Plain"}');f.ok('review',draft,'--answers',answers);await fs.unlink(answers);return f.ok('run','--list');}
test('begin/review/direct execution/run/add/commit preserve exact instructions and clean Git state',async t=>{
 const f=await fixture(t);assert.match(f.ok('begin','--list'),/improve/);const task=await prepared(f);
 const script=await fs.readFile(path.join(f.root,'run',task));assert.match(script.toString(),/lordhavemercy -f --verbose << "EOF"/);
 let direct=spawnSync(path.join(f.root,'run',task),[],{cwd:f.root,env:f.env});assert.equal(direct.status,0);
 assert.equal(f.ok('add','--list'),'');assert.ok(await fs.stat(path.join(f.root,'run',task)));assert.equal(f.git('rev-list','--count','HEAD').trim(),'1');
 await fs.writeFile(path.join(f.root,'result.txt'),'before\n');f.ok('run',task);assert.notEqual(f.run('run',task).status,0);assert.equal(f.git('rev-list','--count','HEAD').trim(),'1');
 f.ok('add',task);f.ok('add',task);const archives=await fs.readdir(path.join(f.root,'doc/imperative'));assert.equal(archives.length,1);assert.deepEqual(await fs.readFile(path.join(f.root,'doc/imperative',archives[0])),script);
 f.ok('commit',task);const head=f.git('rev-parse','HEAD');f.ok('commit',task);assert.equal(f.git('rev-parse','HEAD'),head);assert.equal(f.git('status','--porcelain'),'');
 const message=f.git('show','-s','--format=%B');assert.match(message,/^Make the result useful\n\nMake result.txt useful/);assert.doesNotMatch(message,/lordhavemercy|^EOF$/m);assert.ok(message.trim().split('\n').every(l=>l.length<=72));
});
test('failed tasks remain available, retries are explicit, and later script edits do not alter history',async t=>{
 const f=await fixture(t),task=await prepared(f);await fs.writeFile(path.join(f.root,'fail'),'yes');assert.equal(f.run('run',task).status,9);assert.equal(f.ok('add','--list'),'');await fs.unlink(path.join(f.root,'fail'));
 f.ok('run','--retry',task);const exact=await fs.readFile(path.join(f.root,'run',task));await fs.appendFile(path.join(f.root,'run',task),'# future revision\n');f.ok('add',task);
 const [archive]=await fs.readdir(path.join(f.root,'doc/imperative'));assert.deepEqual(await fs.readFile(path.join(f.root,'doc/imperative',archive)),exact);assert.match(await fs.readFile(path.join(f.root,'run',task),'utf8'),/future revision/);
});
test('questions resume, ambiguous basenames and traversal fail, and unrelated staged work is preserved',async t=>{
 const f=await fixture(t);f.ok('begin','Improve the result');const draft=f.ok('review','--list').split('\n').find(n=>n.startsWith('improve-result'));assert.notEqual(f.run('review',draft).status,0);
 const task=await (async()=>{const answers=path.join(f.root,'answers.json');await fs.writeFile(answers,'{"tone":"Warm"}');f.ok('review',draft,'--answers',answers);await fs.unlink(answers);return f.ok('run','--list');})();
 assert.notEqual(f.run('run','../result.txt').status,0);await fs.writeFile(path.join(f.root,'unrelated.txt'),'human\n');f.git('add','unrelated.txt');f.ok('run',task);f.ok('add',task);f.ok('commit',task);
 assert.match(f.git('status','--porcelain'),/A  unrelated.txt/);assert.doesNotMatch(f.git('show','--format=','--name-only','HEAD'),/unrelated/);
 await fs.mkdir(path.join(f.root,'run/a'),{recursive:true});await fs.mkdir(path.join(f.root,'run/b'));for(const dir of ['a','b'])await fs.writeFile(path.join(f.root,'run',dir,'same'),'#!/bin/sh\nexit 0\n',{mode:0o755});assert.match(f.run('run','same').stderr,/Ambiguous/);assert.match(f.ok('_complete','run'),/a\/same/);
});
test('external commands are discovered only through --help and retain exit status; recursion is excluded',async t=>{
 const f=await fixture(t);await fs.writeFile(path.join(f.bin,'yhwh-boop'),'#!/bin/sh\nif [ "$1" = --help ]; then echo "yhwh-boop — A small greeting"; else echo boop; exit 7; fi\n',{mode:0o755});await fs.symlink(cli,path.join(f.bin,'yhwh-loop'));
 assert.match(f.ok('--help'),/boop\s+A small greeting/);assert.doesNotMatch(f.ok('commands'),/^loop$/m);assert.equal(f.run('boop').status,7);assert.equal(f.run('missing').status,127);
 const bash=spawnSync('bash',['--noprofile','--norc','-c','source "$1"; COMP_WORDS=(yhwh begin imp); COMP_CWORD=2; _yhwh_complete; printf "%s\\n" "${COMPREPLY[@]}"','bash',path.resolve(__dirname,'../etc/completions/yhwh.bash')],{cwd:f.root,env:{...f.env,PATH:path.dirname(cli)+path.delimiter+f.env.PATH},encoding:'utf8'});assert.match(bash.stdout,/improve/);
});
test('archive and commit failures resume without re-execution or duplicate history',async t=>{
 const f=await fixture(t),task=await prepared(f);f.ok('run',task);
 await fs.mkdir(path.join(f.root,'doc'));await fs.writeFile(path.join(f.root,'doc/imperative'),'blocked');assert.notEqual(f.run('add',task).status,0);assert.ok(await fs.stat(path.join(f.root,'run',task)));await fs.unlink(path.join(f.root,'doc/imperative'));f.ok('add',task);
 const hook=path.join(f.root,'.git/hooks/pre-commit');await fs.writeFile(hook,'#!/bin/sh\nexit 1\n',{mode:0o755});assert.notEqual(f.run('commit',task).status,0);assert.equal(f.git('rev-list','--count','HEAD').trim(),'1');await fs.unlink(hook);
 f.ok('commit',task);assert.equal((await fs.readdir(path.join(f.root,'doc/imperative'))).length,1);assert.equal(f.git('rev-list','--count','HEAD').trim(),'2');assert.equal(f.git('status','--porcelain'),'');
});
test('dependency ordering is sequential, traversal through symlinks is refused, and direct attestations are explicit',async t=>{
 const f=await fixture(t);await fs.mkdir(path.join(f.root,'run'));
 for(const [name,dep] of [['second','first'],['first','']])await fs.writeFile(path.join(f.root,'run',name),'#!/usr/bin/env bash\n'+(dep?'# yhwh-depends: '+dep+'\n':'')+'printf "'+name+'\\n" >> order.txt\n',{mode:0o755});
 f.ok('run','second');assert.equal(await fs.readFile(path.join(f.root,'order.txt'),'utf8'),'first\nsecond\n');
 await fs.symlink(f.bin,path.join(f.root,'run','outside'));assert.notEqual(f.run('run','outside/agent').status,0);
 const g=await fixture(t),task=await prepared(g),baseline=g.ok('run','--baseline'),copy=path.join(g.bin,'executed');await fs.copyFile(path.join(g.root,'run',task),copy);await fs.chmod(copy,0o755);assert.equal(spawnSync(copy,[],{cwd:g.root,env:g.env}).status,0);
 assert.notEqual(g.run('add',task).status,0);g.ok('run','--record-direct',task,'--baseline',baseline,'--executed-script',copy,'--exit-code','0');g.ok('add',task);
});
test('later edits to accepted files and unrelated declarative documents are never overwritten',async t=>{
 const f=await fixture(t),task=await prepared(f);f.ok('run',task);f.ok('add',task);await fs.writeFile(path.join(f.root,'result.txt'),'later human edit');assert.notEqual(f.run('commit',task).status,0);assert.equal(await fs.readFile(path.join(f.root,'result.txt'),'utf8'),'later human edit');await fs.writeFile(path.join(f.root,'result.txt'),'useful\n');
 await fs.mkdir(path.join(f.root,'doc/declarative'),{recursive:true});await fs.writeFile(path.join(f.root,'doc/declarative/result.md'),'human documentation');assert.notEqual(f.run('commit',task).status,0);assert.equal(await fs.readFile(path.join(f.root,'doc/declarative/result.md'),'utf8'),'human documentation');
});
test('no-argument workflow commands offer working keyboard TUIs',async t=>{
 const f=await fixture(t);
 const python=`import os,pty,select,sys,time,re,signal,json
command=sys.argv[3]
steps={'begin':[('Begin a kanban item',b'\\r')],'review':[('Review an implementation draft',b'\\r'),('Which tone?',b'\\r')],'run':[('Run approved tasks',b' \\r')],'add':[('Accept successful results',b'\\r')]}.get(command,[])
pid,fd=pty.fork()
if pid==0: os.execv(sys.argv[1],[sys.argv[1],sys.argv[2],command])
output=b''; deadline=time.time()+20
while time.time()<deadline:
 if select.select([fd],[],[],.1)[0]:
  try: output+=os.read(fd,65536)
  except OSError: break
  clean=re.sub(r'\\x1b\\[[0-9;?]*[A-Za-z]','',output.decode(errors='replace'))
  if steps and steps[0][0] in clean:
   os.write(fd,steps.pop(0)[1]);output=b''
 finished,status=os.waitpid(pid,os.WNOHANG)
 if finished: sys.stdout.write(output.decode(errors='replace'));sys.exit(os.waitstatus_to_exitcode(status))
else:
 os.kill(pid,signal.SIGKILL);os.waitpid(pid,0);print(output.decode(errors='replace'));sys.exit(99)
_,status=os.waitpid(pid,0);sys.stdout.write(output.decode(errors='replace'));sys.exit(os.waitstatus_to_exitcode(status))
`;
 for(const command of ['begin','review','run','add','commit']) {
  const result=spawnSync('python3',['-c',python,process.execPath,cli,command],{cwd:f.root,env:{...f.env,TERM:'xterm-256color'},encoding:'utf8',timeout:25000});
  assert.equal(result.status,0,command+': '+result.stdout+'\n'+result.stderr);
 }
 assert.equal(f.git('rev-list','--count','HEAD').trim(),'2');assert.equal(f.git('status','--porcelain'),'');
});
