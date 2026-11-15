// No WebGL process, software rasterizer or graphics-restart loop is needed.
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const paths = require('../../lib/paths.cjs');
for (const file of ['three/renderer.js', 'default/ui/renderer.js']) {
  if (!fs.existsSync(paths.output(file))) throw new Error('Build YHWH Three first: make three-build');
}
const env = { ...process.env, YHWH_INTERFACE: 'three', YHWH_NODE: process.execPath };
delete env.ELECTRON_RUN_AS_NODE;
const args = [...process.argv.slice(2)];
if (env.YHWH_TAB && !args.some(arg => arg === '--tab' || arg.startsWith('--tab='))) args.push('--tab', env.YHWH_TAB);
const child = spawn(require('../../lib/electron.cjs')(), [path.join(__dirname, '../../src/yhwh-three'), ...args], { env, stdio: 'inherit' });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
