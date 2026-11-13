const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const paths = require('./paths.cjs');
const workflows = ['begin','review','run','add','commit'];
const files = ['create','read','append','prepend','list','search','move','rename','config'];
function commands(additional=[]) {
  const found = new Map();
  for (const directory of [...additional, path.join(paths.root,'bin'), ...(process.env.PATH || '').split(path.delimiter)]) {
    if (!directory) continue;
    let entries; try { entries = fs.readdirSync(directory).sort(); } catch { continue; }
    for (const name of entries) {
      if (!/^yhwh-[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(name)) continue;
      const full = path.resolve(directory,name), command = name.slice(5);
      if (found.has(command)) continue;
      try {
        fs.accessSync(full,fs.constants.X_OK);
        if (!fs.statSync(full).isFile() || fs.realpathSync(full) === fs.realpathSync(path.join(paths.root,'bin/yhwh'))) continue;
        found.set(command,full);
      } catch {}
    }
  }
  return found;
}
async function execute(executable,args,options={}) {
  return new Promise((resolve,reject) => {
    const child=spawn(executable,args,{stdio:'inherit',...options});
    const relays=Object.fromEntries(['SIGINT','SIGTERM'].map(signal=>[signal,()=>child.kill(signal)]));
    for(const [signal,relay] of Object.entries(relays))process.on(signal,relay);
    const cleanup=()=>Object.entries(relays).forEach(([signal,relay])=>process.off(signal,relay));
    child.on('error',error=>{cleanup();reject(error);});
    child.on('exit',(code,signal)=>{cleanup();resolve(code ?? (signal==='SIGINT'?130:143));});
  });
}
function description(command, executable) {
  const result=spawnSync(executable,['--help'],{encoding:'utf8',timeout:1000,maxBuffer:16384,stdio:['ignore','pipe','ignore'],env:{...process.env,YHWH_INTROSPECTION:'1'}});
  if(result.error||result.status!==0)return '(help unavailable)';
  const line=(result.stdout||'').split(/\r?\n/).map(s=>s.trim()).find(Boolean);
  if(!line||/^usage:/i.test(line))return '(use --help)';
  return line.replace(new RegExp('^yhwh-'+command+'\\s*[—:-]\\s*','i'),'').replace(/[\x00-\x1f\x7f-\x9f]/g,'').slice(0,100);
}
async function main(args=process.argv.slice(2)) {
  const [command,...rest]=args;
  if(!command||['--help','-h','help'].includes(command)) {
    console.log(fs.readFileSync(paths.etc('help.txt'),'utf8').trimEnd());
    if(process.env.YHWH_INTROSPECTION)return 0;
    console.log('\nInterface and external commands (PATH):');
    for(const [name,full] of commands())if(!workflows.includes(name))console.log('  '+name.padEnd(16)+description(name,full));
    return 0;
  }
  if(command==='--version'){console.log(require('../package.json').version);return 0;}
  if(command==='commands'){console.log([...new Set(['open',...workflows,...files,...commands().keys()])].sort().join('\n'));return 0;}
  if(command==='completion') {
    const shell=rest[0]||'bash';if(!['bash','zsh'].includes(shell))throw new Error('Use completion bash|zsh.');
    process.stdout.write(fs.readFileSync(paths.etc('completions','yhwh.'+shell),'utf8'));return 0;
  }
  if(command==='_complete'){console.log((await require('./workflow.cjs').complete(rest[0])).join('\n'));return 0;}
  if(command==='open') {
    let name='default';if(['default','three','obsidian'].includes(rest[0]))name=rest.shift();
    return execute(path.join(paths.root,'bin','yhwh-'+name),rest);
  }
  if(workflows.includes(command))return require('./workflow.cjs').main(command,rest);
  if(files.includes(command)){await require('../bin/default/cli.cjs').main([command,...rest]);return process.exitCode||0;}
  const external=commands().get(command);
  if(external){
    const active=JSON.parse(process.env.YHWH_COMMAND_STACK||'[]');
    if(active.includes(external))throw new Error('Recursive external command: '+command);
    return execute(external,rest,{env:{...process.env,YHWH_COMMAND_STACK:JSON.stringify([...active,external])}});
  }
  console.error(`yhwh: unknown command '${command}'. See 'yhwh --help'.`);return 127;
}
module.exports={main,commands,execute};
