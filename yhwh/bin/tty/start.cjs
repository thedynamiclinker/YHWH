#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { root, output } = require('../../lib/paths.cjs');

const help = `yhwh-tty — el shaddai, the terminal interface

Usage: yhwh tty [PATH]
       yhwh open tty [PATH]
       el-shaddai [PATH]
       make tty [WORKSPACE=PATH]

shaddai: Nobody knows. Maybe mountains or ttys.

Ranger columns, file editor, tabs, persistent shells, settings, read-only
conversation, verses, inbox, worlds and executable English workflows.
Ctrl+P: all commands · F1: help · Ctrl+Q: quit · Escape: files
Edit the definition in Settings or with the Edit shaddai definition command.
Defaults: etc/tty/words.json. Personal edits: YHWH_TTY_DATA_DIR/session.json
(default: ~/.config/yhwh/state-tty). No display or Electron is required.
`;
async function remote(socket, target, tab) {
  await new Promise((resolve, reject) => {
    const client = net.createConnection(socket); let response = '';
    client.setTimeout(5000, () => client.destroy(new Error('Terminal interface did not respond.')));
    client.on('connect', () => client.write(JSON.stringify({ path: target, tab }) + '\n'));
    client.on('data', data => { response += data; if (response.includes('\n')) { client.end(); try { const result = JSON.parse(response); result.error ? reject(new Error(result.error)) : resolve(); } catch (error) { reject(error); } } });
    client.on('error', reject);
  });
}
async function main(args = process.argv.slice(2)) {
  if (args.some(arg => ['--help','-h','help'].includes(arg))) { console.log(help); return; }
  if (args[0] === '--version') { console.log(require('../../package.json').version); return; }
  let target, tab;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (['--open','--cwd','--tab'].includes(arg)) { const value = args[++i]; if (!value) throw new Error(`${arg} needs a value.`); if (arg === '--tab') tab = value; else target = value; }
    else if (arg.startsWith('--open=') || arg.startsWith('--cwd=')) target = arg.slice(arg.indexOf('=') + 1);
    else if (arg.startsWith('--tab=')) tab = arg.slice(6);
    else if (arg.startsWith('-')) throw new Error(`Unknown option ${arg}. Use --help.`);
    else if (target) throw new Error('Open one path at a time.'); else target = arg;
  }
  target = path.resolve(target || process.cwd());
  if (process.env.YHWH_TTY_SOCKET) return remote(process.env.YHWH_TTY_SOCKET, target, tab || process.env.YHWH_TAB);
  const built = output('tty/app.cjs');
  try { await fs.access(built); } catch { throw new Error(`Build the terminal interface first: make -C ${root} tty-build`); }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    if (process.env.YHWH_TTY_LAUNCHED) throw new Error('A real interactive terminal is required. Run make tty in a terminal.');
    const { commands } = require('../../lib/cli.cjs');
    // Locate terminal launchers without shell interpolation of workspace paths.
    const available = async name => {
      for (const directory of (process.env.PATH || '').split(path.delimiter)) {
        try { const candidate = path.join(directory, name); await fs.access(candidate, require('node:fs').constants.X_OK); return candidate; } catch {}
      }
    };
    for (const [name, flags] of [['xdg-terminal-exec', []], ['x-terminal-emulator', ['-e']], ['kitty', ['--']], ['alacritty', ['-e']], ['konsole', ['-e']], ['gnome-terminal', ['--']], ['xterm', ['-e']]]) {
      const executable = await available(name); if (!executable) continue;
      await new Promise((resolve, reject) => {
        const child = spawn(executable, [...flags, process.execPath, path.join(root, 'bin/yhwh-tty'), target], { detached: true, stdio: 'ignore', env: { ...process.env, YHWH_TTY_LAUNCHED: '1' } });
        child.once('error', reject); child.once('spawn', () => { child.unref(); resolve(); });
      }); return;
    }
    throw new Error('No interactive terminal or terminal launcher found. Run make tty in a terminal.');
  }
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'el-shaddai-')), socket = path.join(directory, 'open.sock');
  let app;
  const server = net.createServer(client => {
    let data = '', handled = false;
    client.setTimeout(10000, () => client.destroy());
    client.on('error', () => {});
    client.on('data', chunk => {
      data += chunk;
      if (data.length > 65536) return client.destroy();
      if (handled || !data.includes('\n')) return; handled = true;
      (async () => {
        const request = JSON.parse(data.slice(0, data.indexOf('\n'))), target = path.resolve(request.path);
        const tab = app.workspace.tabs.find(item => item.id === request.tab);
        if (tab) {
          await app.switchTab(app.workspace.tabs.indexOf(tab));
          if ((await fs.stat(target)).isDirectory()) await app.navigate(target); else await app.open(target, tab);
        } else { await app.workspace.newTab(target); app.watch(); app.setFocus('files'); }
        client.end('{}\n');
      })().catch(error => client.end(JSON.stringify({ error: error.message }) + '\n'));
    });
  });
  const cleanup = async () => { server.close(); await fs.rm(directory, { recursive: true, force: true }); };
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socket, resolve); });
    const { Workspace } = require('../../src/yhwh-tty/model.cjs'), { Interface } = require(built);
    const workspace = new Workspace(); await workspace.init();
    app = new Interface(workspace, { socket, onClose: cleanup }); await app.start(target);
    if (workspace.state.recovery?.length) app.notice('Recovered buffers are available in state-tty/session.json.');
  } catch (error) {
    if (app) await app.quit(true); else await cleanup(); throw error;
  }
}
module.exports = { main, remote };
