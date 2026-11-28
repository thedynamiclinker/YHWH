const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const paths = require('./paths.cjs');
const workflows = ['begin','review','run','add','commit'];
const files = ['create','read','append','prepend','list','search','move','rename','config'];
const interfaces = ['default','three','obsidian'];
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
  if(command==='commands'){console.log([...new Set(['open','inbox','keys','nu','cd','go',...workflows,...files,...commands().keys()])].sort().join('\n'));return 0;}
  if (['nu', 'cd', 'go'].includes(command.toLowerCase())) return universe(command.toLowerCase(), rest);
  if (command === 'inbox') {
    if (rest.length === 1 && ['-h', '--help'].includes(rest[0])) {
      console.log('Usage: yhwh inbox [MESSAGE-ID]\nList bundled YHWH email subjects and IDs, or read a message.');
      return 0;
    }
    if (rest.length > 1) throw new Error('Usage: yhwh inbox [MESSAGE-ID]');
    const { primarySender, emailLetters } = require('./inbox.cjs');
    if (!rest.length) {
      for (const letter of emailLetters) console.log(`${letter.id}\t${letter.title}`);
      return 0;
    }
    const letter = emailLetters.find(item => item.id === rest[0]);
    if (!letter) throw new Error(`Unknown YHWH email: ${rest[0]}. Run yhwh inbox to list messages.`);
    const words = JSON.parse(fs.readFileSync(paths.etc('default', 'words.json'), 'utf8'));
    console.log(`From: YHWH <${primarySender}>\nSubject: ${letter.title}\n\n${words[letter.textKey]}`);
    return 0;
  }
  if(command==='keys')return require('./keys-cli.cjs').main(rest);
  if(command==='completion') {
    const shell=rest[0]||'bash';if(!['bash','zsh'].includes(shell))throw new Error('Use completion bash|zsh.');
    process.stdout.write(fs.readFileSync(paths.etc('completions','yhwh.'+shell),'utf8'));return 0;
  }
  if(command==='_complete'){console.log((await require('./workflow.cjs').complete(rest[0])).join('\n'));return 0;}
  if(command==='open') {
    const name=interfaces.includes(rest[0])?rest.shift():process.env.YHWH_INTERFACE||'default';
    const client=commands().get(name);
    if(!client)throw new Error('Unknown interface: '+name);
    return execute(client,rest,{env:{...process.env,YHWH_INTERFACE:name}});
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
async function universe(command, args) {
  const { parseArgs } = require('node:util');
  const { seeds } = require('./universe-seeds.cjs');
  const universes = require('./universes.cjs');
  const help = {
    nu: 'Usage: yhwh nu DIRECTORY [--template ID | --from IMAGE]\n       yhwh nu --list',
    cd: 'Usage: cd -- "$(yhwh cd DIRECTORY)"\nPrint the absolute path of a universe. The calling shell owns cd.',
    go: 'Usage: yhwh go [DIRECTORY] [--mount PATH ...] [--mount-rw PATH ...] [--network] [--sudo] [-- /absolute/guest/command ARG ...]',
  };
  if (args.length === 1 && ['-h', '--help'].includes(args[0])) { console.log(help[command]); return 0; }
  const delimiter = args.indexOf('--');
  const cut = command === 'go' && delimiter >= 0 ? delimiter : args.length;
  const options = command === 'nu' ? { list: { type: 'boolean' }, template: { type: 'string' }, from: { type: 'string' } } :
    command === 'go' ? { mount: { type: 'string', multiple: true }, 'mount-rw': { type: 'string', multiple: true }, network: { type: 'boolean' }, sudo: { type: 'boolean' } } : {};
  const { values, positionals } = parseArgs({ args: args.slice(0, cut), options, allowPositionals: true });
  if (command === 'nu') {
    if (values.list && args.length === 1) {
      for (const seed of seeds) console.log(`${seed.id}\t${seed.label}\t${seed.image || seed.description}`);
      return 0;
    }
    if (positionals.length !== 1 || values.list || (values.from && values.template)) throw new Error(help.nu);
    const controller = new AbortController();
    const stop = () => controller.abort();
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    try {
      console.log(await universes.create(positionals[0], values.from === undefined ? values.template : 'oci', values.from,
        { signal: controller.signal, output: chunk => process.stderr.write(chunk) }));
      return 0;
    } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); }
  }
  if (positionals.length > 1) throw new Error(help[command]);
  if (command === 'cd') { console.log(await universes.enter(positionals[0] || '.')); return 0; }
  const target = await universes.go(positionals[0] || '.', {
    mounts: values.mount, writableMounts: values['mount-rw'], network: values.network, sudo: values.sudo,
    command: cut < args.length ? args.slice(cut + 1) : undefined,
  });
  return execute(target.program, target.args, { cwd: target.cwd });
}
module.exports={main,commands,execute};
