// Run under the launcher's Node, so node-pty uses the same ABI that npm built
// it for. Electron never loads a native addon built for a different runtime.
const pty = require('node-pty');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { quote } = require('../../lib/shell.cjs');
const sessions = new Map();
const send = message => { if (process.connected) process.send(message); };

function start({ id, cwd, env = {} }) {
  const shell = process.env.YHWH_SHELL || process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : '/bin/bash');
  const name = path.basename(shell), environment = { ...process.env, ...env, TERM: 'xterm-256color', COLORTERM: 'truecolor', YHWH_TAB: id };
  let args = [], temporary;
  if (/bash/.test(name)) args = ['--rcfile', require('../../lib/paths.cjs').etc('shell', 'bashrc'), '-i'];
  else if (/zsh/.test(name)) {
    temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'yhwh-zsh-'));
    environment.YHWH_ZDOTDIR = process.env.ZDOTDIR || os.homedir();
    fs.copyFileSync(require('../../lib/paths.cjs').etc('shell', 'zshrc'), path.join(temporary, '.zshrc'));
    environment.ZDOTDIR = temporary;
    args = ['-i'];
  } else if (/fish/.test(name)) args = ['-i', '--init-command', 'function __yhwh_cwd --on-event fish_prompt; printf "\\e]7;file://localhost%s\\a\\e]133;A\\a" "$PWD"; end'];
  else if (/powershell|pwsh/.test(name)) args = ['-NoLogo', '-NoExit', '-Command', 'function global:prompt { [Console]::Write("`e]7;file://localhost" + $PWD.Path + "`a`e]133;A`a"); "PS $($PWD)> " }'];
  const terminal = pty.spawn(shell, args, { cwd, env: environment, name: 'xterm-256color', cols: 100, rows: 25 });
  const session = { terminal, cwd, name, pending: null, ready: false, hooked: false, tail: '', temporary };
  sessions.set(id, session);
  terminal.onData(data => {
    send({ type: 'data', id, data });
    session.tail = (session.tail + data).slice(-32768);
    const expression = /\x1b\]7;file:\/\/[^/]*(.*?)\x07/g;
    let match, latest;
    while ((match = expression.exec(session.tail))) latest = match[1];
    if (latest) {
      try { latest = decodeURIComponent(latest); } catch {}
      if (process.platform === 'win32' && /^\/[A-Z]:/i.test(latest)) latest = latest.slice(1);
      if (latest !== session.cwd) { session.cwd = latest; send({ type: 'cwd', id, cwd: latest }); }
    }
    if (session.tail.includes('\x1b]133;A\x07')) {
      session.ready = true; session.hooked = true;
      session.tail = '';
      if (session.pending) changeDirectory(session, session.pending);
    }
  });
  terminal.onExit(({ exitCode }) => {
    if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
    sessions.delete(id);
    send({ type: 'exit', id, code: exitCode });
  });
}

function changeDirectory(session, cwd) {
  if (cwd === session.cwd) { session.pending = null; return; }
  if (!session.ready) { session.pending = cwd; return; }
  session.pending = null; session.ready = false;
  let command = ` cd -- ${quote(cwd)}`;
  if (/powershell|pwsh/.test(session.name)) command = `Set-Location -LiteralPath '${cwd.replace(/'/g, "''")}'`;
  // Clear a partially entered command before inserting navigation. A running
  // program never receives a cd command: it waits for the next shell prompt.
  session.terminal.write(`\x15${command}\r`);
}

process.on('message', message => {
  try {
    if (message.type === 'start') return start(message);
    const session = sessions.get(message.id);
    if (!session) return;
    if (message.type === 'write') { if (/[\r\n]/.test(message.data)) session.ready = false; session.terminal.write(message.data); }
    if (message.type === 'resize') session.terminal.resize(Math.max(2, Math.min(500, message.cols)), Math.max(2, Math.min(200, message.rows)));
    if (message.type === 'cd') changeDirectory(session, message.cwd);
    if (message.type === 'close') session.terminal.kill();
  } catch (error) { send({ type: 'error', id: message.id, message: error.message }); }
});

// Linux exposes the real shell cwd even with a custom prompt or unsupported
// shell. Hooks above cover macOS/Windows and avoid polling a remote command.
const timer = setInterval(() => {
  if (process.platform !== 'linux') return;
  for (const [id, session] of sessions) {
    if (session.hooked) continue;
    try {
      const cwd = fs.readlinkSync(`/proc/${session.terminal.pid}/cwd`);
      if (cwd !== session.cwd) { session.cwd = cwd; send({ type: 'cwd', id, cwd }); }
    } catch {}
  }
}, 400);
process.on('disconnect', () => { clearInterval(timer); for (const session of sessions.values()) session.terminal.kill(); process.exit(); });
