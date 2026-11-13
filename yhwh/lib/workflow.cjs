const fs = require('node:fs/promises');
const sync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const paths = require('./paths.cjs');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const stamp = () => new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z').replace('T','-');
const slug = value => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'').slice(0,80) || 'task';
const exists = async p => !!await fs.lstat(p).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
function git(root,args,options={}) {
  const result=spawnSync('git',['-C',root,...args],{encoding:'utf8',maxBuffer:32*1024*1024,...options});
  if(result.error||result.status!==0)throw new Error(result.error?.message || result.stderr?.trim() || `git ${args[0]} failed`);
  return result.stdout;
}
async function context() {
  const root=git(process.cwd(),['rev-parse','--show-toplevel']).trim();
  const state=path.resolve(root,git(root,['rev-parse','--git-path','yhwh']).trim());
  return {root,state};
}
async function atomic(file,value,mode=0o600) {
  await fs.mkdir(path.dirname(file),{recursive:true});
  const temp=file+'.'+process.pid+'.tmp';
  await fs.writeFile(temp,value,{mode});await fs.rename(temp,file);
}
const writeJSON=(p,v)=>atomic(p,JSON.stringify(v,null,2)+'\n');
const readJSON=async p=>JSON.parse(await fs.readFile(p,'utf8'));
async function safe(root,relative,{missing=true}={}) {
  if(!relative || path.isAbsolute(relative)||relative.split(/[\\/]/).some(x=>x==='..'||x==='.git')||relative.includes('\0'))throw new Error('Use a path within the workspace.');
  let current=root;
  for(const part of relative.split('/')) {
    current=path.join(current,part);
    const stat=await fs.lstat(current).catch(e=>{if(e.code==='ENOENT'&&missing)return null;throw e;});
    if(stat?.isSymbolicLink())throw new Error(`Refusing symlink in workflow path: ${relative}`);
  }
  return current;
}
async function records(ctx) {
  const dir=path.join(ctx.state,'tasks');if(!await exists(dir))return [];
  return Promise.all((await fs.readdir(dir)).filter(f=>f.endsWith('.json')).sort().map(f=>readJSON(path.join(dir,f))));
}
const save=(ctx,task)=>writeJSON(path.join(ctx.state,'tasks',task.id+'.json'),task);
async function lock(ctx,operation) {
  await fs.mkdir(ctx.state,{recursive:true});const dir=path.join(ctx.state,'lock');
  try {await fs.mkdir(dir);}
  catch(e) {
    if(e.code!=='EEXIST')throw e;
    let owner;try{owner=await readJSON(path.join(dir,'owner.json'));}catch{}
    if(!owner)throw new Error(`Workflow lock has no owner. Inspect ${dir} before removing it.`);
    let active=true;try{process.kill(owner.pid,0);}catch(e){if(e.code==='ESRCH')active=false;}
    if(active||owner.host!==os.hostname())throw new Error(`Another workflow command owns ${dir}.`);
    await fs.rm(dir,{recursive:true});await fs.mkdir(dir);
  }
  await writeJSON(path.join(dir,'owner.json'),{pid:process.pid,host:os.hostname()});
  try{return await operation();}finally{await fs.rm(dir,{recursive:true,force:true});}
}
async function inventory(ctx,directory,filter=()=>true) {
  const base=await safe(ctx.root,directory);if(!await exists(base))return [];
  const out=[];
  async function visit(dir) {
    for(const entry of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
      if(entry.name.startsWith('.'))continue;
      const full=path.join(dir,entry.name),relative=path.relative(ctx.root,full);
      if(entry.isDirectory())await visit(full);
      else if(entry.isFile()&&filter(entry.name,full))out.push({name:path.relative(base,full),path:relative});
    }
  }
  await visit(base);return out;
}
async function todos(ctx) {
  const out=await inventory(ctx,'kanban',name=>name.endsWith('.md'));
  out.forEach(item=>{item.id=hash(item.path).slice(0,16);item.title=item.name.replace(/\.md$/,'');});
  const board=path.join(ctx.root,'COVENANT.md');
  if(await exists(board))for(const line of (await fs.readFile(board,'utf8')).split('\n')) {
    const match=line.match(/^\s*- \[ \]\s+(.+)$/);if(!match)continue;
    const link=match[1].match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/),title=link?.[2]||link?.[1]||match[1];
    out.push({id:hash('COVENANT.md:'+match[1]).slice(0,16),name:link?.[1]||slug(title),title,card:match[1],path:'COVENANT.md',link:link?.[1]});
  }
  const linked=new Set(out.filter(t=>t.link).map(t=>t.link.replace(/\.md$/,'')));
  return out.filter(t=>t.card||!linked.has(t.path.replace(/\.md$/,'')));
}
function resolveName(items,name) {
  if(!name||path.isAbsolute(name)||name.split(/[\\/]/).includes('..'))throw new Error('Use a listed task name, without traversal.');
  let matches=items.filter(x=>x.id===name||x.name===name||x.title===name||x.path===name);
  if(!matches.length)matches=items.filter(x=>path.basename(x.name)===name||path.basename(x.name,path.extname(x.name))===name||slug(x.title||'')===name);
  if(matches.length!==1)throw new Error(matches.length?`Ambiguous name '${name}': ${matches.map(x=>x.name+' ['+x.id+']').join(', ')}`:`No eligible task named '${name}'. Use --list.`);
  return matches[0];
}
async function select(items,names,{multiple=false,infer=false,message='Select a task'}={}) {
  if(!items.length)throw new Error('No eligible tasks.');
  if(names.length)return [...new Map(names.map(name=>{const item=resolveName(items,name);return[item.id||item.path,item];})).values()];
  if(infer&&items.length===1)return [items[0]];
  if(!process.stdin.isTTY)throw new Error('Selection needs a terminal. Supply an explicit name or use --list.');
  const prompts=await import('@inquirer/prompts');
  const choices=items.map(item=>({name:`${item.title||item.name} (${item.name})`,value:item}));
  return multiple ? prompts.checkbox({message:message+' (Space selects, Enter runs; a selects all)',choices,required:true,loop:false}) : [await prompts.select({message,choices,loop:false})];
}
async function agent(phase,data,ctx) {
  const cfg=await readJSON(paths.etc('workflow/agent.json'));
  const request=JSON.stringify({phase,repository:ctx.root,instructions:await fs.readFile(paths.etc('workflow',phase+'.txt'),'utf8'),...data});
  const command=process.env.YHWH_AGENT||cfg.command,args=process.env.YHWH_AGENT?[]:cfg.args;
  console.error(`Generating ${phase} instructions…`);
  const response=await new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd:ctx.root,stdio:['pipe','pipe','inherit']});let output='';
    child.stdout.on('data',data=>{output+=data;if(output.length>8*1024*1024){child.kill();reject(new Error('Agent response exceeds 8 MiB.'));}});
    child.on('error',e=>reject(new Error(`Agent unavailable: ${e.message}. Configure YHWH_AGENT or etc/workflow/agent.json.`)));
    child.on('exit',code=>code===0?resolve(output):reject(new Error(`Agent exited ${code}; the phase can be retried.`)));
    child.stdin.on('error',()=>{});child.stdin.end(request);
  });
  try{return JSON.parse(response.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));}
  catch{throw new Error('Agent must return the documented JSON response. No task was advanced.');}
}
function validateDraft(draft) {
  if(typeof draft.intent!=='string'||typeof draft.implementation!=='string'||!draft.implementation.trim())throw new Error('Agent omitted the intended result or implementation.');
  for(const key of ['questions','blockers','assumptions'])if(!Array.isArray(draft[key]))throw new Error(`Agent omitted ${key}.`);
  const ids=new Set();
  for(const q of draft.questions) {
    if(!q.id||ids.has(q.id)||!q.prompt||q.choices&&(!Array.isArray(q.choices)||q.choices.some(c=>typeof c!=='string')))throw new Error('Invalid or duplicate agent question.');ids.add(q.id);
  }
}
function draftText(item,draft) {
  return `<!-- yhwh-task: ${item.id} -->\n# ${draft.title||item.title}\n\n## Original task\n${item.original}\n\n## Intended result\n${draft.intent}\n\n## Proposed implementation\n${draft.implementation}\n\n## Questions\n${draft.questions.length?draft.questions.map(q=>`- ${q.id}: ${q.prompt}${q.choices?' ['+q.choices.join(' / ')+']':''}`).join('\n'):'None.'}\n\n## Blockers\n${draft.blockers.join('\n')||'None.'}\n\n## Assumptions\n${draft.assumptions.join('\n')||'None.'}\n\n<!-- yhwh-review-data\n${JSON.stringify(draft,null,2)}\n-->\n`;
}
async function begin(ctx,names) {
  const [item]=await select(await todos(ctx),names,{message:'Begin a kanban item'});
  let task=(await records(ctx)).find(t=>t.id===item.id);
  if(task){console.log(`Already ${task.status}: ${task.draft||task.script||task.name}`);return;}
  item.original=item.title;
  if(item.path!=='COVENANT.md')item.original+='\n'+await fs.readFile(await safe(ctx.root,item.path),'utf8');
  else if(item.link) {
    const candidates=[item.link,item.link+'.md'];
    for(const p of candidates){const full=await safe(ctx.root,p);if(await exists(full)){item.original+='\n'+await fs.readFile(full,'utf8');break;}}
  }
  const draft=await agent('begin',{task:item},ctx);validateDraft(draft);
  const name=slug(draft.title||item.title)+'-'+item.id.slice(0,6);
  task={...item,name,status:'draft',draft:`tmp/${name}.md`,answers:{},created:new Date().toISOString()};
  const file=await safe(ctx.root,task.draft);await fs.mkdir(path.dirname(file),{recursive:true});
  await fs.writeFile(file,draftText(item,draft),{flag:'wx',mode:0o644});await save(ctx,task);console.log(task.draft);
}
async function drafts(ctx) {
  const tasks=await records(ctx),out=[];
  for(const file of await inventory(ctx,'tmp',n=>n.endsWith('.md')&&n!=='README.md')) {
    const text=await fs.readFile(await safe(ctx.root,file.path),'utf8'),id=text.match(/<!-- yhwh-task: ([a-f\d]+) -->/)?.[1];
    const task=tasks.find(t=>t.id===id);
    if(!task||task.status==='draft')out.push({...file,id,title:task?.title||file.name,task});
  }
  return out;
}
async function review(ctx,names,answersFile) {
  if(names.length===1) { const prior=(await records(ctx)).find(t=>(t.name===names[0]||t.id===names[0])&&t.status==='ready'); if(prior){console.log(prior.script);return;} }
  const [item]=await select(await drafts(ctx),names,{message:'Review an implementation draft'});
  const text=await fs.readFile(await safe(ctx.root,item.path),'utf8');
  const data=text.match(/<!-- yhwh-review-data\n([\s\S]*?)\n-->/);
  if(!data||!item.id)throw new Error('This is a legacy draft. Run yhwh begin for its kanban item to generate questions and stable metadata first.');
  const draft=JSON.parse(data[1]);validateDraft(draft);
  const task=item.task||{id:item.id,name:path.basename(item.name,'.md'),title:draft.title,draft:item.path,answers:{},status:'draft'};
  if(answersFile)Object.assign(task.answers,await readJSON(path.resolve(answersFile)));
  await save(ctx,task);
  const clarified=await agent('questions',{draft,answers:task.answers},ctx);
  validateDraft({...draft,questions:clarified.questions});
  task.reviewQuestions=clarified.questions;await save(ctx,task);
  for(const q of task.reviewQuestions) {
    if(task.answers[q.id]!==undefined&&String(task.answers[q.id]).trim())continue;
    console.log(q.prompt);
    if(!process.stdin.isTTY)throw new Error(`Answer '${q.id}' using --answers FILE (JSON object); review remains in tmp/.`);
    const prompts=await import('@inquirer/prompts');
    task.answers[q.id]=q.choices?.length?await prompts.select({message:q.prompt,choices:q.choices.map(value=>({name:value,value}))}):await prompts.input({message:q.prompt,required:q.required!==false});
    await save(ctx,task);
  }
  const final=await agent('review',{draft:text,answers:task.answers},ctx);
  if(!Array.isArray(final.questions)||!Array.isArray(final.blockers)||final.questions.length||final.blockers.length||typeof final.prompt!=='string'||!final.prompt.trim())throw new Error('Review is not ready: '+JSON.stringify(final.questions||final.blockers||'missing final prompt'));
  if(/^EOF\r?$/m.test(final.prompt))throw new Error('The prompt contains an EOF delimiter line. Ask the agent to rephrase that line.');
  task.script=`run/${task.name}`;
  const body=`#!/usr/bin/env bash\n# yhwh-task: ${task.id}\n# yhwh-draft: ${task.draft}\n\nlordhavemercy -f --verbose << "EOF"\n${final.prompt.replace(/\n$/,'')}\nEOF\n`;
  const target=await safe(ctx.root,task.script);await fs.mkdir(path.dirname(target),{recursive:true});
  if(await exists(target)){if(await fs.readFile(target,'utf8')!==body)throw new Error('A different approved script already exists; it was preserved.');}
  else await fs.writeFile(target,body,{flag:'wx',mode:0o755});
  await fs.chmod(target,0o755);task.status='ready';await save(ctx,task);
  await fs.unlink(await safe(ctx.root,item.path));console.log(task.script);
}
async function snapshot(ctx) {
  const index=path.join(ctx.state,`snapshot-${process.pid}.index`),env={...process.env,GIT_INDEX_FILE:index};
  try{git(ctx.root,['read-tree','HEAD'],{env});git(ctx.root,['add','-A','--','.'],{env});return git(ctx.root,['write-tree'],{env}).trim();}
  finally{await fs.rm(index,{force:true});}
}
const changed=(ctx,a,b)=>git(ctx.root,['diff','--name-only','-z',a,b]).split('\0').filter(Boolean);
function samePaths(ctx,a,b,names) {return !names.length||git(ctx.root,['diff','--quiet',a,b,'--',...names])==='';}
async function ready(ctx) {return inventory(ctx,'run',(n,p)=>!!(sync.statSync(p).mode&0o111));}
async function executeTasks(ctx,names,all=false) {
  const items=await ready(ctx),selected=all?items:await select(items,names,{multiple:true,message:'Run approved tasks'});
  const ordered=[],visiting=new Set(),done=new Set();
  async function order(item) {
    if(done.has(item.path))return;if(visiting.has(item.path))throw new Error('Task dependency cycle.');visiting.add(item.path);
    const text=await fs.readFile(await safe(ctx.root,item.path),'utf8');
    for(const dependency of (text.match(/^# yhwh-depends:\s*(.*)$/m)?.[1]||'').split(',').map(x=>x.trim()).filter(Boolean)) {
      const prior=(await records(ctx)).find(t=>(t.name===dependency||t.id===dependency)&&['accepted','committed','succeeded'].includes(t.status));
      if(!prior)await order(resolveName(items,dependency));
    }
    visiting.delete(item.path);done.add(item.path);ordered.push(item);
  }
  for(const item of selected)await order(item);
  for(const item of ordered) {
    const original=await safe(ctx.root,item.path,{missing:false}),bytes=await fs.readFile(original);
    const embedded=bytes.toString().match(/^# yhwh-task: ([a-f\d]+)$/m)?.[1];
    let task=(await records(ctx)).find(t=>t.id===(embedded||hash(item.path).slice(0,16)));
    if(task&&['succeeded','accepted','committed','running'].includes(task.status))throw new Error(`${item.name} is ${task.status}. Use add/commit, or run --retry NAME explicitly after inspection.`);
    task ||= {id:embedded||hash(item.path).slice(0,16),name:item.name,title:item.name,script:item.path};
    const attempt=(task.attempt||0)+1,dir=path.join(ctx.state,'executions',task.id,String(attempt));await fs.mkdir(dir,{recursive:true});
    const executed=path.join(dir,'script');await fs.writeFile(executed,bytes,{flag:'wx',mode:0o755});
    const now=await snapshot(ctx),before=task.initialBefore||now;task.initialBefore=before;Object.assign(task,{status:'running',attempt,before,executed,scriptHash:hash(bytes),head:task.head||git(ctx.root,['rev-parse','HEAD']).trim(),started:new Date().toISOString()});await save(ctx,task);
    console.log(`Running ${item.name} (${attempt})`);
    const log=sync.createWriteStream(path.join(dir,'output.log'),{flags:'wx'});
    const code=await new Promise((resolve,reject)=>{
      const child=spawn(executed,[],{cwd:ctx.root,stdio:['inherit','pipe','pipe'],env:{...process.env,PATH:path.join(paths.root,'bin')+path.delimiter+process.env.PATH}});
      const int=()=>child.kill('SIGINT'),term=()=>child.kill('SIGTERM');process.on('SIGINT',int);process.on('SIGTERM',term);
      child.stdout.on('data',d=>{process.stdout.write(d);log.write(d);});child.stderr.on('data',d=>{process.stderr.write(d);log.write(d);});
      child.on('error',reject);child.on('exit',(code,signal)=>{process.off('SIGINT',int);process.off('SIGTERM',term);resolve(code??(signal==='SIGINT'?130:143));});
    }).catch(error=>{console.error(error.message);return 126;});
    await new Promise(resolve=>log.end(resolve));task.exitCode=code;task.finished=new Date().toISOString();task.after=await snapshot(ctx);task.status=code===0?'succeeded':'failed';await save(ctx,task);
    if(code!==0){console.error(`${item.name} failed (${code}); left in run/ for inspection. No automatic retry.`);return code;}
    console.log(`${item.name}: succeeded; inspect results, then yhwh add ${task.name}`);
  }return 0;
}
async function add(ctx,names) {
  const tasks=await records(ctx),pending=tasks.filter(t=>t.status==='succeeded');
  if(names.length===1){const prior=tasks.find(t=>(t.name===names[0]||t.id===names[0])&&['accepted','documented','committing','committed'].includes(t.status));if(prior){console.log('Already accepted: '+prior.archive);return;}}
  const [task]=await select(pending,names,{message:'Accept successful results'});
  const current=await snapshot(ctx),changes=changed(ctx,task.before,task.after);
  const dirty=changed(ctx,task.head,task.before);
  const overlaps=changes.filter(p=>dirty.includes(p));
  if(overlaps.length)throw new Error('Task touched pre-existing human changes; separate them before accepting: '+overlaps.join(', '));
  // Changes after execution must be inspected and rerun, never silently attributed.
  if(changes.length)try{samePaths(ctx,task.after,current,changes);}catch{throw new Error('Task files changed since execution; inspect and rerun explicitly before acceptance.');}
  for(const other of tasks.filter(t=>t.id!==task.id&&['accepted','documented','committing'].includes(t.status)))if(changes.some(p=>other.changes?.includes(p)))throw new Error('Another accepted task owns overlapping files. Commit it first.');
  const bytes=await fs.readFile(task.executed);if(hash(bytes)!==task.scriptHash)throw new Error('Executed snapshot checksum mismatch.');
  if(!task.archive){task.archive=`doc/imperative/${stamp()}-${slug(task.name)}-${task.id.slice(0,6)}-${task.attempt}`;await save(ctx,task);}
  const archive=await safe(ctx.root,task.archive);await fs.mkdir(path.dirname(archive),{recursive:true});
  if(await exists(archive)){if(!(await fs.readFile(archive)).equals(bytes))throw new Error('Archive collision; history was preserved.');}
  else await fs.writeFile(archive,bytes,{flag:'wx',mode:0o755});
  const script=await safe(ctx.root,task.script);
  if(await exists(script)){if(hash(await fs.readFile(script))===task.scriptHash)await fs.unlink(script);else console.error('Preserved the edited run/ script; its executed snapshot was archived.');}
  task.changes=[...new Set([...changes,task.archive,...(!await exists(script)?[task.script]:[])])];
  task.status='accepted';task.accepted=new Date().toISOString();task.acceptedTree=await snapshot(ctx);await save(ctx,task);
  git(ctx.root,['add','-A','--',...task.changes.filter(p=>awaitablePath(ctx,p))]);
  console.log(`Accepted ${task.name}: ${task.archive}. Next: yhwh commit ${task.name}`);
}
// A deleted untracked run script has no Git path to stage.
function awaitablePath(ctx,p){return sync.existsSync(path.join(ctx.root,p))||git(ctx.root,['ls-files','--',p]).trim().length>0;}
function promptBody(script) {
  const match=script.match(/^lordhavemercy -f --verbose << ["']EOF["']\r?\n([\s\S]*?)^EOF\r?$/m);
  if(!match)throw new Error('Archive has no complete quoted lordhavemercy EOF heredoc.');return match[1];
}
async function commit(ctx,names) {
  const tasks=await records(ctx),eligible=tasks.filter(t=>['accepted','documented','committing'].includes(t.status));
  if(names.length===1){const prior=tasks.find(t=>(t.name===names[0]||t.id===names[0])&&t.status==='committed');if(prior){console.log(prior.commit);return;}}
  const [task]=await select(eligible,names,{infer:true,message:'Commit accepted work'});
  if(task.status==='committing') {
    const current=git(ctx.root,['rev-parse','HEAD']).trim();
    if(current!==task.commitParent && git(ctx.root,['show','-s','--format=%P',current]).trim()===task.commitParent && git(ctx.root,['show','-s','--format=%B',current]).trim()===task.message.trim()) {
      git(ctx.root,['reset','-q','HEAD','--',...task.changes.filter(p=>awaitablePath(ctx,p))]);task.commit=current;task.status='committed';await save(ctx,task);console.log(current);return;
    }
    if(current!==task.commitParent)throw new Error('HEAD changed during an interrupted commit. Inspect task state before retrying.');
  }
  const archive=await safe(ctx.root,task.archive,{missing:false}),bytes=await fs.readFile(archive);
  if(hash(bytes)!==task.scriptHash)throw new Error('Imperative archive changed; refusing to rewrite history.');
  const current=await snapshot(ctx);
  try{samePaths(ctx,task.acceptedTree,current,task.changes.filter(p=>!task.documents?.includes(p)));}catch{throw new Error('Accepted files changed. Preserve/separate those edits before committing.');}
  if(!task.documentation) {
    const diff=git(ctx.root,['diff','--binary',task.before,task.after]);
    const result=await agent('commit',{task:{name:task.name,archive:task.archive},acceptedDiff:diff,prompt:promptBody(bytes.toString())},ctx);
    if(typeof result.summary!=='string'||!result.summary.trim()||/[\r\n]/.test(result.summary)||!Array.isArray(result.documents)||!result.documents.length&&(!result.unnecessary||!result.reason))throw new Error('Agent must provide a concise summary and verified documents or an explicit reason none are needed.');
    task.documentation=result;await save(ctx,task);
  }
  task.documents=[];
  for(const doc of task.documentation.documents) {
    if(!doc.path?.startsWith('doc/declarative/')||!doc.path.endsWith('.md')||typeof doc.content!=='string')throw new Error('Declarative documentation must be Markdown under doc/declarative/.');
    const target=await safe(ctx.root,doc.path);
    const docChanged=changed(ctx,task.acceptedTree,current).includes(doc.path);
    if(docChanged&&(!await exists(target)||await fs.readFile(target,'utf8')!==doc.content))throw new Error('Declarative document has later human changes: '+doc.path);
    if(changed(ctx,task.head,task.before).includes(doc.path))throw new Error('Declarative document contains unrelated human work: '+doc.path);
    if(tasks.some(t=>t.id!==task.id&&['accepted','documented','committing'].includes(t.status)&&t.changes?.includes(doc.path)))throw new Error('Declarative document belongs to another pending task.');
    // Retry only writes the exact generated content; never overwrite a later human edit.
    if(task.documentedContents?.[doc.path]&&await fs.readFile(target,'utf8')!==task.documentedContents[doc.path])throw new Error('Declarative document changed after generation: '+doc.path);
    await fs.mkdir(path.dirname(target),{recursive:true});await atomic(target,doc.content,0o644);task.documents.push(doc.path);
    task.documentedContents ||= {};task.documentedContents[doc.path]=doc.content;await save(ctx,task);
  }
  task.changes=[...new Set([...task.changes,...task.documents])];task.status='documented';await save(ctx,task);
  const body=promptBody(bytes.toString()),fold=spawnSync('fold',['-s','-w','72'],{input:body,encoding:'utf8'});
  if(fold.error||fold.status!==0)throw new Error('fold -s -w 72 is required to format the original instructions.');
  task.message=task.documentation.summary.trim()+'\n\n'+fold.stdout;task.commitParent=git(ctx.root,['rev-parse','HEAD']).trim();task.status='committing';await save(ctx,task);
  const index=path.join(ctx.state,'commit.index'),env={...process.env,GIT_INDEX_FILE:index};await fs.rm(index,{force:true});
  try {
    git(ctx.root,['read-tree','HEAD'],{env});
    const selected=task.changes.filter(p=>awaitablePath(ctx,p));git(ctx.root,['add','-A','--',...selected],{env});
    if(!git(ctx.root,['diff','--cached','--name-only'],{env}).trim())throw new Error('No changes to commit. Empty commits are not created.');
    const msg=path.join(ctx.state,'commit-message');await atomic(msg,task.message);
    git(ctx.root,['commit','--cleanup=verbatim','-F',msg],{env});
    task.commit=git(ctx.root,['rev-parse','HEAD']).trim();await save(ctx,task);
    git(ctx.root,['reset','-q','HEAD','--',...selected]);task.status='committed';await save(ctx,task);console.log(`${task.name}: ${task.commit}`);
    const remaining=git(ctx.root,['status','--short']);if(remaining)console.log('Unrelated or later work remains:\n'+remaining);
  } finally {await fs.rm(index,{force:true});}
}
async function complete(command) {
  try {
    const ctx=await context();let items;
    if(command==='begin')items=await todos(ctx);
    else if(command==='review')items=await drafts(ctx);
    else if(command==='run')items=await ready(ctx);
    else items=(await records(ctx)).filter(t=>command==='add'?t.status==='succeeded':['accepted','documented','committing'].includes(t.status));
    // Full relative names remain available when basenames are duplicated.
    const counts=new Map();for(const t of items){const base=path.basename(t.name);counts.set(base,(counts.get(base)||0)+1);}
    return items.map(t=>counts.get(path.basename(t.name))===1?path.basename(t.name):t.name+'').sort();
  }catch{return [];}
}
async function main(command,args) {
  if(args.includes('--help')||args.includes('-h')) {console.log(await fs.readFile(paths.etc('workflow',command+'-help.txt'),'utf8'));return 0;}
  const ctx=await context();
  if(args.includes('--list')){console.log((await complete(command)).join('\n'));return 0;}
  const names=[],options={};
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--answers')options.answers=args[++i];
    else if(args[i]==='--all')options.all=true;
    else if(args[i]==='--retry')options.retry=true;
    else if(args[i]==='--record-direct')options.direct=true;
    else if(args[i]==='--baseline')options.baseline=args[++i]||true;
    else if(args[i]==='--executed-script')options.executed=args[++i];
    else if(args[i]==='--exit-code')options.exitCode=Number(args[++i]);
    else if(args[i].startsWith('-'))throw new Error('Unknown option: '+args[i]);else names.push(args[i]);
  }
  if(command!=='run'&&names.length>1)throw new Error('Select one task for this phase.');
  return lock(ctx,async()=>{
    if(command==='begin')return begin(ctx,names);
    if(command==='review')return review(ctx,names,options.answers);
    if(command==='run') {
      if(options.baseline===true&&!options.direct){console.log(await snapshot(ctx));return 0;}
      if(options.direct) {
        if(names.length!==1||typeof options.baseline!=='string'||!options.executed||!Number.isInteger(options.exitCode))throw new Error('Use run --record-direct NAME --baseline TREE --executed-script SNAPSHOT --exit-code CODE. This explicitly attests to the direct execution.');
        const [item]=await select(await ready(ctx),names),bytes=await fs.readFile(path.resolve(options.executed));
        const id=bytes.toString().match(/^# yhwh-task: ([a-f\d]+)$/m)?.[1]||hash(item.path).slice(0,16);
        const task=(await records(ctx)).find(t=>t.id===id)||{id,name:item.name,title:item.name,script:item.path};
        if(['accepted','committed','running','succeeded'].includes(task.status))throw new Error('Task already has an execution awaiting its next phase.');
        const before=git(ctx.root,['rev-parse',options.baseline+'^{tree}']).trim();
        const attempt=(task.attempt||0)+1,dir=path.join(ctx.state,'executions',id,String(attempt));await fs.mkdir(dir,{recursive:true});
        const executed=path.join(dir,'script');await fs.writeFile(executed,bytes,{flag:'wx',mode:0o755});
        Object.assign(task,{before,after:await snapshot(ctx),head:git(ctx.root,['rev-parse','HEAD']).trim(),attempt,executed,scriptHash:hash(bytes),exitCode:options.exitCode,status:options.exitCode===0?'succeeded':'failed',directAttestation:true,finished:new Date().toISOString()});
        await save(ctx,task);console.log('Recorded explicit direct-execution attestation: '+task.name);return 0;
      }
      if(options.retry) {
        if(names.length!==1)throw new Error('Use run --retry NAME after inspecting the previous result.');
        const [item]=await select(await ready(ctx),names);const task=(await records(ctx)).find(t=>t.script===item.path);
        if(task&&['running','failed','succeeded'].includes(task.status)){task.status='retry';await save(ctx,task);}else throw new Error('Only interrupted, failed or unaccepted successful executions can be retried.');
      }
      return executeTasks(ctx,names,options.all);
    }
    if(command==='add')return add(ctx,names);
    if(command==='commit')return commit(ctx,names);
  });
}
module.exports={main,complete,promptBody};
