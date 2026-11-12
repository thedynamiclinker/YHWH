const { spawn } = require('node:child_process');
const fs = require('node:fs');
(async () => {
  let number = 90;
  while (fs.existsSync(`/tmp/.X11-unix/X${number}`) || fs.existsSync(`/tmp/.X${number}-lock`)) number++;
  const display = `:${number}`;
  const server = spawn(process.env.YHWH_XVFB || 'Xvfb', [display, '-screen', '0', '1600x1000x24', '-nolisten', 'tcp'], { stdio: 'ignore' });
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  let child;
  const stop = () => { child?.kill(); server.kill(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop); process.on('exit', stop);
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error('Xvfb exited before creating a display.');
    if (fs.existsSync(`/tmp/.X11-unix/X${number}`)) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  child = spawn(process.execPath, process.argv.slice(2), { env: { ...process.env, DISPLAY: display }, stdio: 'inherit' });
  child.on('exit', code => { server.kill(); process.exitCode = code || 0; });
})().catch(error => { console.error(error); process.exitCode = 1; });
