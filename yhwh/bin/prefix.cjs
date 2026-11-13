#!/usr/bin/env node
const fs=require('node:fs/promises'),sync=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {root,output}=require('../lib/paths.cjs');
const manifest=require('../package.json'),names=Object.keys(manifest.bin);
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const exists=async p=>!!await fs.lstat(p).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
async function atomic(file,data){await fs.mkdir(path.dirname(file),{recursive:true});const temp=file+'.'+process.pid+'.tmp';await fs.writeFile(temp,data);await fs.rename(temp,file);}
async function json(file){return JSON.parse(await fs.readFile(file,'utf8'));}
function run(cmd,args,cwd=root){const r=spawnSync(cmd,args,{cwd,stdio:'inherit'});if(r.error||r.status!==0)throw new Error(r.error?.message||`${cmd} failed (${r.status})`);}
async function noSymlinkAncestors(target){let current=path.parse(target).root;for(const part of target.slice(current.length).split(path.sep).filter(Boolean)){current=path.join(current,part);const st=await fs.lstat(current).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(st?.isSymbolicLink())throw new Error('Prefix ancestor is a symlink: '+current);}}
async function tree(prefix){
 const out={};
 async function visit(dir){for(const item of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const full=path.join(dir,item.name),relative=path.relative(prefix,full);if(relative==='var/lib/yhwh/installed.json')continue;const st=await fs.lstat(full);out[relative]=st.isSymbolicLink()?{link:await fs.readlink(full)}:st.isDirectory()?{directory:true}:{hash:hash(await fs.readFile(full))};if(st.isDirectory())await visit(full);}}
 if(await exists(prefix))await visit(prefix);return out;
}
async function verify(prefix,record){
 if(record.owner!==manifest.name||!record.entries||typeof record.entries!=="object")throw new Error("Unrecognized prefix ownership record; nothing removed.");
 const actual=await tree(prefix),errors=[];
 for(const [file,value]of Object.entries(actual)){
  // A nested, separately recorded Sinai prefix is audited independently.
  if(file==='mnt'||file==='mnt/sinai'||file.startsWith('mnt/sinai/'))continue;
  if(!record.entries[file]||JSON.stringify(value)!==JSON.stringify(record.entries[file]))errors.push(file);
 }
 for(const file of Object.keys(record.entries))if(!actual[file])errors.push(file+' (missing)');
 if(errors.length)throw new Error('Prefix contains unrelated or modified data; preserved: '+errors.slice(0,15).join(', '));
}
async function install(mode,prefix){
 await noSymlinkAncestors(prefix);
 const recordFile=path.join(prefix,'var/lib/yhwh/installed.json'),packagePath=path.join(prefix,'lib/node_modules',manifest.name);
 const existing=await exists(recordFile)?await json(recordFile):null;
 if(existing&&existing.owner!=='yhwh-system')throw new Error('Unrecognized prefix ownership record.');
 if(existing)await verify(prefix,existing);
 const destinations=[packagePath,path.join(prefix,'etc/yhwh'),...names.map(n=>path.join(prefix,'bin',n))];
 for(const target of destinations)if(await exists(target)&&!existing?.entries[path.relative(prefix,target)])throw new Error('Unrelated installation conflict: '+target);
 // Refuse pre-existing unknown files, rather than claiming them as our own.
 const before=await tree(prefix);
 const allowedDirectories=new Set(['bin','lib','lib/node_modules','etc','var','var/lib','var/lib/yhwh','var/tmp','var/tmp/yhwh','mnt']);
 if(!existing&&Object.entries(before).some(([file,v])=>!file.startsWith('mnt/sinai/')&&file!=='mnt/sinai'&&(!v.directory||!allowedDirectories.has(file))))throw new Error('Prefix contains unrelated data; choose a dedicated prefix.');
 if(!existing&&await exists(path.join(prefix,'mnt/sinai'))) {
   const nested=path.join(prefix,'mnt/sinai/var/lib/yhwh/installed.json');
   if(!await exists(nested))throw new Error('Nested Sinai contains unowned data.');
   await verify(path.join(prefix,'mnt/sinai'),await json(nested));
 }
 let tarball, staged;
 if(mode==='install'){
  await fs.mkdir(output('packages'),{recursive:true});
  const result=spawnSync('npm',['pack','--json','--pack-destination',output('packages')],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024});
  if(result.error||result.status!==0)throw new Error(result.stderr||'npm pack failed');
  tarball=path.join(output('packages'),JSON.parse(result.stdout)[0].filename);
  staged=await fs.mkdtemp(output('install-'));
  try {run('npm',['install','--global','--prefix',staged,'--offline','--ignore-scripts','--no-audit','--no-fund',tarball]);}
  catch(error){await fs.rm(staged,{recursive:true,force:true});throw error;}
 }
 await fs.mkdir(path.join(prefix,'bin'),{recursive:true});await fs.mkdir(path.join(prefix,'lib/node_modules'),{recursive:true});await fs.mkdir(path.join(prefix,'etc'),{recursive:true});
 const prepared=packagePath+'.new-'+process.pid;
 if(mode==='install')await fs.cp(path.join(staged,'lib/node_modules',manifest.name),prepared,{recursive:true,dereference:false});
 if(existing){for(const name of names)await fs.rm(path.join(prefix,'bin',name),{force:true});await fs.rm(path.join(prefix,'etc/yhwh'),{force:true});await fs.rm(packagePath,{recursive:true,force:true});}
 // Publish npm's installed package with ordinary relative executable links.
 if(mode==='develop')await fs.symlink(root,packagePath,'dir');
 else {await fs.rename(prepared,packagePath);await fs.rm(staged,{recursive:true,force:true});}
 for(const name of names)await fs.symlink(path.relative(path.join(prefix,'bin'),path.join(packagePath,manifest.bin[name])),path.join(prefix,'bin',name));
 await fs.symlink(path.relative(path.join(prefix,'etc'),path.join(packagePath,'etc')),path.join(prefix,'etc/yhwh'),'dir');
 await fs.mkdir(path.join(prefix,'var/tmp/yhwh'),{recursive:true});
 const world=path.join(prefix,'var/lib/yhwh/world');
 await atomic(world,`${manifest.name}\t${manifest.version}\t${mode}\n`);
 const entries=await tree(prefix);await atomic(recordFile,JSON.stringify({owner:manifest.name,version:manifest.version,mode,entries},null,2)+'\n');
 console.log(`${mode}: ${prefix}\nPATH: ${prefix}/bin\nCompletion: source ${prefix}/etc/yhwh/completions/yhwh.bash`);
}
async function uninstall(){
 const expected=path.join(os.homedir(),'world');
 await noSymlinkAncestors(expected);
 if(!await exists(expected)){console.log('No ~/world installation.');return;}
 if(await fs.realpath(expected)!==expected)throw new Error('Resolved uninstall path is not exactly ~/world.');
 const outer=path.join(expected,'var/lib/yhwh/installed.json'),sinai=path.join(expected,'mnt/sinai'),inner=path.join(sinai,'var/lib/yhwh/installed.json');
 if(await exists(outer))await verify(expected,await json(outer));
 else {const entries=await fs.readdir(expected);if(entries.some(e=>e!=='mnt'))throw new Error('Unowned data in ~/world; nothing removed.');}
 if(await exists(sinai)){if(!await exists(inner))throw new Error('Sinai contains unowned data; nothing removed.');await verify(sinai,await json(inner));}
 if(await exists(path.join(expected,'mnt'))&&(await fs.readdir(path.join(expected,'mnt'))).some(n=>n!=='sinai'))throw new Error('Unrelated mount directories; nothing removed.');
 // fs.rm removes symlinks themselves and never traverses their targets.
 await fs.rm(expected,{recursive:true});console.log('Removed '+expected);
}
const [command,override]=process.argv.slice(2);
(async()=>{
 if(command==='uninstall'){if(override)throw new Error('Uninstall always targets exactly ~/world; PREFIX overrides are refused.');return uninstall();}
 if(!['develop','install'].includes(command))throw new Error('Use prefix.cjs develop|install|uninstall.');
 const world=path.join(os.homedir(),'world'),prefix=path.resolve(override||(command==='develop'?world:path.join(world,'mnt/sinai')));
 if(prefix===root||prefix.startsWith(root+path.sep)||root.startsWith(prefix+path.sep))throw new Error('Installation prefix must be outside the checkout.');
 await install(command,prefix);
})().catch(error=>{console.error('yhwh install: '+error.message);process.exitCode=1;});
