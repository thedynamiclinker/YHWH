const { execFile } = require('node:child_process');
const os = require('node:os');
const { promisify } = require('node:util');
const { executable, systemDirs } = require('./executable.cjs');

const exec = promisify(execFile);
const sudoArgs = ['-i', '-u', 'root'];
const help = 'cvnt · Covenant\nUsage: cvnt | yhwh cvnt\nOpen a root login shell through system sudo. Type exit to return.';
const terminals = [
  ['xdg-terminal-exec', '--'],
  ['x-terminal-emulator', '-e'],
  ['gnome-terminal', '--'],
  ['konsole', '-e'],
  ['kitty'],
  ['alacritty', '-e'],
  ['foot'],
  ['xterm', '-e'],
];

async function sudo() {
  return executable('sudo', [...systemDirs, '/usr/local/bin'])
    .catch(() => { throw new Error('Covenant requires system sudo.'); });
}

async function main(args, execute) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) { console.log(help); return 0; }
  if (args.length) throw new Error('Usage: cvnt | yhwh cvnt');
  if (!process.getuid) throw new Error('Covenant requires a Unix host with system sudo.');
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Run cvnt in an interactive terminal.');
  return execute(await sudo(), sudoArgs);
}

async function open() {
  if (!['linux', 'darwin'].includes(process.platform)) {
    throw new Error('Covenant opens a Unix root shell on Linux and macOS.');
  }
  const program = await sudo();
  const options = { cwd: os.homedir() };
  if (process.platform === 'darwin') {
    await exec('/usr/bin/osascript', [
      '-e', 'on run argv',
      '-e', 'tell application "Terminal"',
      '-e', 'activate',
      '-e', 'do script ("exec " & quoted form of (item 1 of argv) & " -i -u root")',
      '-e', 'end tell',
      '-e', 'end run',
      program,
    ], options);
    return;
  }
  for (const [name, ...flags] of terminals) {
    const terminal = await executable(name).catch(() => null);
    if (!terminal) continue;
    await exec(terminal, [...flags, program, ...sudoArgs], options);
    return;
  }
  throw new Error('Open a system terminal and run yhwh cvnt.');
}

module.exports = { main, open };
