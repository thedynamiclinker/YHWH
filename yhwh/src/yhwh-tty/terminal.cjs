const { fork } = require('node:child_process');
const path = require('node:path');
const { Terminal } = require('@xterm/headless');
const { EventEmitter } = require('node:events');

class Shells extends EventEmitter {
  constructor(env = {}) {
    super(); this.sessions = new Map();
    this.host = fork(require('../../lib/paths.cjs').root + '/bin/default/terminal-host.cjs', [], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], env: { ...process.env, ...env } });
    this.host.stderr.on('data', data => this.emit('failure', String(data)));
    this.host.on('error', error => this.emit('failure', error.message));
    this.host.on('exit', code => { if (!this.closed) this.emit('failure', `Shell host exited (${code}).`); });
    this.host.on('message', message => {
      const session = this.sessions.get(message.id); if (!session) return;
      if (message.type === 'data') session.term.write(message.data, () => this.emit('render', message.id));
      else if (message.type === 'exit') { session.exited = true; this.emit('exit', message.id); this.emit('render', message.id); }
      else if (message.type === 'cwd') this.emit('cwd', message.id, message.cwd);
      else if (message.type === 'error') this.emit('failure', message.message);
    });
  }
  send(type, id, extra = {}) { if (this.host.connected) this.host.send({ type, id, ...extra }); }
  start(tab, env = {}) {
    const term = new Terminal({ cols: 80, rows: 12, scrollback: 5000, allowProposedApi: true });
    // Reply to terminal queries through the same PTY, never through the outer tty.
    term.onData(data => this.write(tab.id, data));
    this.sessions.set(tab.id, { term, exited: false, scroll: 0 }); this.send('start', tab.id, { cwd: tab.cwd, env: { ...tab.config?.environment, ...env } });
  }
  write(id, data) { const session = this.sessions.get(id); if (session && !session.exited) { session.scroll = 0; this.send('write', id, { data }); } }
  resize(id, cols, rows) {
    const session = this.sessions.get(id); if (!session) return;
    cols = Math.max(2, Math.min(500, cols)); rows = Math.max(2, Math.min(200, rows));
    if (session.term.cols === cols && session.term.rows === rows) return;
    session.term.resize(cols, rows); this.send('resize', id, { cols, rows });
  }
  closeTab(id) { this.send('close', id); this.sessions.get(id)?.term.dispose(); this.sessions.delete(id); }
  close() { this.closed = true; for (const id of this.sessions.keys()) this.closeTab(id); this.host.disconnect(); }
}

// Translate parsed cells, rather than forwarding untrusted control sequences to
// the outer terminal. Full-screen programs, colors and cursor addressing survive.
function terminalLines(session) {
  const term = session.term, buffer = term.buffer.active;
  const offset = Math.max(0, buffer.baseY - session.scroll), lines = [];
  for (let row = 0; row < term.rows; row++) {
    const line = buffer.getLine(offset + row); let text = '', last = '';
    for (let col = 0; col < term.cols; col++) {
      const cell = line?.getCell(col); if (!cell || cell.getWidth() === 0) continue;
      const attributes = [0];
      if (cell.isBold()) attributes.push(1); if (cell.isDim()) attributes.push(2);
      if (cell.isItalic()) attributes.push(3); if (cell.isUnderline()) attributes.push(4);
      if (cell.isInverse()) attributes.push(7); if (cell.isInvisible()) attributes.push(8);
      for (const [foreground, rgb, palette, color] of [[true, cell.isFgRGB(), cell.isFgPalette(), cell.getFgColor()], [false, cell.isBgRGB(), cell.isBgPalette(), cell.getBgColor()]]) {
        if (rgb) attributes.push(foreground ? 38 : 48, 2, (color >> 16) & 255, (color >> 8) & 255, color & 255);
        else if (palette) attributes.push(foreground ? 38 : 48, 5, color);
      }
      const sgr = `\x1b[${attributes.join(';')}m`;
      if (last !== sgr) { text += sgr; last = sgr; }
      text += cell.getChars() || ' ';
    }
    lines.push(text + '\x1b[0m');
  }
  return lines.join('\n');
}
module.exports = { Shells, terminalLines };
