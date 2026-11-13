const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
(async () => {
  let number = 90;
  while (fs.existsSync(`/tmp/.X11-unix/X${number}`) || fs.existsSync(`/tmp/.X${number}-lock`)) number++;
  const display = `:${number}`;
  let executable = process.env.YHWH_XVFB || 'Xvfb';
  if (!process.env.YHWH_XVFB && fs.existsSync('/etc/NIXOS') && spawnSync('which',['Xvfb']).status !== 0) {
    const result=spawnSync('nix-build',['<nixpkgs>','-A','xorg.xorgserver','--no-out-link'],{encoding:'utf8'});
    if(result.status!==0)throw new Error(result.stderr||'Install Xvfb or set YHWH_XVFB.');
    executable=result.stdout.trim().split('\n').at(-1)+'/bin/Xvfb';
  }
  const server = spawn(executable, [display, '-screen', '0', '1600x1000x24', '-nolisten', 'tcp'], { stdio: 'ignore' });
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  let child;
  const stop = () => { child?.kill(); server.kill(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop); process.on('exit', stop);
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error('Xvfb exited before creating a display.');
    if (fs.existsSync(`/tmp/.X11-unix/X${number}`)) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  for (const script of process.argv.slice(2)) {
    const code=await new Promise((resolve,reject)=>{
      child=spawn(process.execPath,[script],{env:{...process.env,DISPLAY:display},stdio:'inherit'});
      child.on('error',reject);child.on('exit',code=>resolve(code??1));
    });
    if(code){process.exitCode=code;break;}
  }
  server.kill();
})().catch(error => { console.error(error); process.exitCode = 1; });
