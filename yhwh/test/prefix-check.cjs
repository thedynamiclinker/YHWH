// Explicit installation integration test. Deliberately excluded from make check.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
(async()=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'yhwh-prefix-home-')),app=path.resolve(__dirname,'..');
 console.log('Disposable HOME:',home);
 const env={...process.env,HOME:home,npm_config_cache:path.join(os.homedir(),'.npm')};
 function run(cmd,args,expected=0,options={}){const r=spawnSync(cmd,args,{cwd:app,env,encoding:'utf8',maxBuffer:8*1024*1024,...options});assert.equal(r.status,expected,r.stderr+'\n'+r.stdout);return r.stdout;}
 const world=path.join(home,'world');
 await fs.mkdir(path.join(world,'bin'),{recursive:true});await fs.writeFile(path.join(world,'bin/yhwh'),'unrelated');
 run('make',['develop'],2);assert.equal(await fs.readFile(path.join(world,'bin/yhwh'),'utf8'),'unrelated');await fs.unlink(path.join(world,'bin/yhwh'));
 run('make',['develop']);run('make',['develop']);assert.equal(await fs.realpath(path.join(world,'lib/node_modules/yhwh-system')),app);assert.equal(await fs.realpath(path.join(world,'etc/yhwh')),path.join(app,'etc'));
 assert.match(await fs.readFile(path.join(world,'var/lib/yhwh/world'),'utf8'),/^yhwh-system\t[^\t]+\tdevelop\n$/);assert.match(run(path.join(world,'bin/yhwh'),['--help']),/Usage: yhwh/);
 run('make',['install']);const sinai=path.join(world,'mnt/sinai');assert.match(await fs.readFile(path.join(sinai,'var/lib/yhwh/world'),'utf8'),/\tinstall\n$/);
 const installed=path.join(sinai,'lib/node_modules/yhwh-system');assert.equal((await fs.lstat(installed)).isSymbolicLink(),false);
 assert.match(run(path.join(sinai,'bin/yhwh'),['--help']),/Usage: yhwh/);
 const oldWorld=await fs.readFile(path.join(sinai,'var/lib/yhwh/world'),'utf8');
 const mock=path.join(home,'mock-bin');await fs.mkdir(mock);
 const npmPath=spawnSync('which',['npm'],{encoding:'utf8'}).stdout.trim();
 await fs.writeFile(path.join(mock,'npm'),'#!/usr/bin/env node\nif(process.argv[2]==="install"&&process.argv.includes("--global"))process.exit(41);\nconst r=require("node:child_process").spawnSync('+JSON.stringify(npmPath)+',process.argv.slice(2),{stdio:"inherit"});process.exit(r.status??1);\n',{mode:0o755});
 run('make',['install'],2,{env:{...env,PATH:mock+path.delimiter+env.PATH}});
 assert.equal(await fs.readFile(path.join(sinai,'var/lib/yhwh/world'),'utf8'),oldWorld);assert.match(run(path.join(sinai,'bin/yhwh'),['--help']),/Usage: yhwh/);

 assert.match(run(path.join(installed,'bin/company/review'),['--help']),/usage:/);
 const runtime=path.join(home,'electron'),capture=path.join(home,'launch.json');await fs.writeFile(runtime,'#!/usr/bin/env node\nrequire("node:fs").writeFileSync(process.env.CAPTURE,JSON.stringify(process.argv.slice(2)));\n',{mode:0o755});
 for(const interfaceName of ['default','three']){
  run(path.join(sinai,'bin/yhwh'),['open',interfaceName],0,{cwd:home,env:{...env,YHWH_ELECTRON:runtime,CAPTURE:capture}});
  const args=JSON.parse(await fs.readFile(capture,'utf8'));assert.ok(args[0].startsWith(installed+path.sep));assert.ok(!args[0].startsWith(app+path.sep));
 }
 // Relocate the installed prefix; no launcher embeds its old location or checkout.
 const relocated=path.join(home,'relocated');await fs.rename(sinai,relocated);assert.match(run(path.join(relocated,'bin/yhwh'),['--version']),/0\.3\.0/);await fs.rename(relocated,sinai);
 await fs.writeFile(path.join(world,'human-notes.txt'),'preserve me');run('make',['uninstall'],2);assert.equal(await fs.readFile(path.join(world,'human-notes.txt'),'utf8'),'preserve me');await fs.unlink(path.join(world,'human-notes.txt'));
 // Refuse a symlinked prefix without following it.
 const saved=path.join(home,'saved-world');await fs.rename(world,saved);await fs.symlink(saved,world,'dir');run('make',['uninstall'],2);assert.ok(await fs.stat(path.join(saved,'bin')));await fs.unlink(world);await fs.rename(saved,world);
 run('make',['uninstall','PREFIX='+path.join(home,'wrong')],2);assert.ok(await fs.stat(world));
 run('make',['uninstall']);assert.equal(await fs.lstat(world).catch(()=>null),null);assert.ok(await fs.stat(app));run('make',['uninstall']);
 console.log('PASS: conflicts, editable links, standalone package, relocation, world records, guarded uninstall.');
 console.log('Retained disposable home for inspection:',home);
})().catch(e=>{console.error(e);process.exitCode=1;});
