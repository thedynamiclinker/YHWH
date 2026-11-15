const blessed = require('blessed');
const fs = require('node:fs/promises');
const { watch } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { Transform } = require('node:stream');
const { Workspace, Document } = require('./model.cjs');
const { Shells, terminalLines } = require('./terminal.cjs');
const files = require('../../lib/files.cjs');
const worlds = require('../yhwh-default/app/worlds.cjs');
const paths = require('../../lib/paths.cjs');
const words = require('../../etc/default/words.json');
const { quote } = require('../../lib/shell.cjs');
const clean = value => String(value ?? '').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '').replace(/\t/g, '    ');
const esc = value => blessed.escape(clean(value));
const size = bytes => bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)}M` : bytes > 1024 ? `${Math.round(bytes / 1024)}K` : `${bytes}B`;

// Keep paste atomic (including newlines and control characters), even when its
// delimiters arrive split across reads. Pasted text never becomes app shortcuts.
function pasteInput(source, onPaste) {
  let pending = '', pasting = false, paste = '', flush;
  const start = '\x1b[200~', end = '\x1b[201~';
  const input = new Transform({ decodeStrings: false, transform(chunk, encoding, done) {
    clearTimeout(flush); pending += chunk.toString();
    for (;;) {
      const marker = pasting ? end : start, found = pending.indexOf(marker);
      if (found >= 0) {
        const text = pending.slice(0, found); pending = pending.slice(found + marker.length);
        if (pasting) { onPaste(paste + text); paste = ''; } else if (text) this.push(text);
        pasting = !pasting; continue;
      }
      let keep = 0;
      for (let n = 1; n < marker.length; n++) if (pending.endsWith(marker.slice(0, n))) keep = n;
      const text = pending.slice(0, pending.length - keep); pending = pending.slice(pending.length - keep);
      if (pasting) paste = (paste + text).slice(0, 16 * 1024 * 1024); else if (text) this.push(text);
      break;
    }
    if (!pasting && pending) flush = setTimeout(() => { this.push(pending); pending = ''; }, 30);
    done();
  } });
  input.on('close', () => clearTimeout(flush));
  source.setEncoding('utf8'); source.pipe(input);
  input.isTTY = source.isTTY; input.setRawMode = value => source.setRawMode?.(value);
  return input;
}

class Interface {
  constructor(workspace, { socket, onClose = () => {} } = {}) {
    this.workspace = workspace; this.onClose = onClose; this.focus = 'files'; this.clipboard = null; this.sequence = 0;
    this.input = pasteInput(process.stdin, text => this.paste(text));
    this.screen = blessed.screen({ input: this.input, output: process.stdout, smartCSR: true, fullUnicode: true, dockBorders: true, title: workspace.words.name, terminal: process.env.TERM || 'xterm-256color' });
    this.screen.program.write('\x1b[?2004h');
    const base = { parent: this.screen, tags: false, mouse: true, border: 'line', style: { fg: '#d4d4dc', bg: '#16161c', border: { fg: '#454552' }, selected: { bg: '#414158', fg: '#ffffff', bold: true } } };
    this.header = blessed.box({ parent: this.screen, top: 0, height: 1, tags: true, style: { bg: '#252532', fg: '#d4d4dc' } });
    this.tabs = blessed.box({ parent: this.screen, top: 1, height: 1, tags: true, mouse: true });
    this.parent = blessed.list({ ...base, top: 2, keys: false, label: ' parent ', scrollbar: { ch: '│' } });
    this.list = blessed.list({ ...base, top: 2, keys: false, tags: true, label: ' files ', scrollbar: { ch: '│' } });
    this.preview = blessed.box({ ...base, top: 2, label: ' preview ', tags: true, scrollable: true, alwaysScroll: true, scrollbar: { ch: '│' } });
    this.terminal = blessed.box({ ...base, label: ' shell ', tags: false });
    this.status = blessed.box({ parent: this.screen, bottom: 1, height: 1, tags: true, style: { bg: '#252532' } });
    this.hints = blessed.box({ parent: this.screen, bottom: 0, height: 1, content: ' h j k l: move   Enter: open   Tab: focus   ^P: commands   ^B: shell   F1: help', style: { fg: '#8c8c9e' } });
    this.shells = new Shells({ YHWH_INTERFACE: 'tty', YHWH_TTY_SOCKET: socket || '' });
    this.shells.on('render', () => this.schedule());
    this.shells.on('failure', message => this.notice(message));
    this.shells.on('cwd', (id, cwd) => {
      const tab = workspace.tabs.find(tab => tab.id === id);
      if (tab && cwd !== tab.cwd && !tab.worldRoot) this.safe(async () => { await workspace.navigate(cwd, tab, { fromShell: true }); if (tab === workspace.active) this.watch(); });
    });
    workspace.on('tab', tab => this.shells.start(tab));
    workspace.on('navigate', tab => this.safe(async () => this.shells.send('cd', tab.id, { cwd: await worlds.physical(tab) })));
    workspace.on('change', () => this.schedule());
    this.list.on('select item', () => { this.previewSelection(); this.schedule(); });
    this.list.on('select', () => this.safe(() => this.openSelected()));
    this.parent.on('select', (_, index) => this.safe(() => this.navigate(this.parentEntries[index]?.path)));
    for (const [widget, name] of [[this.list, 'files'], [this.preview, 'editor'], [this.terminal, 'terminal']]) widget.on('click', () => { if (!this.dialog) this.setFocus(name); });
    this.preview.on('wheeldown', () => { if (!this.dialog) { if (this.tab.document) this.tab.document.top += 3; else this.preview.scroll(3); this.schedule(); } });
    this.preview.on('wheelup', () => { if (!this.dialog) { if (this.tab.document) this.tab.document.top = Math.max(0, this.tab.document.top - 3); else this.preview.scroll(-3); this.schedule(); } });
    this.terminal.on('wheeldown', () => this.scrollShell(-3)); this.terminal.on('wheelup', () => this.scrollShell(3));
    this.screen.on('keypress', (ch, key) => this.safe(() => this.key(ch, key)));
    this.screen.on('resize', () => this.schedule());
    this.commands = this.commandList();
    this.exitSignal = () => this.safe(() => this.quit(true));
    process.on('SIGTERM', this.exitSignal); process.on('SIGHUP', this.exitSignal);
  }
  get tab() { return this.workspace.active; }
  safe(action) { return Promise.resolve().then(action).catch(error => this.notice(error.message)); }
  schedule() { if (!this.timer && !this.closed) this.timer = setTimeout(() => { this.timer = null; this.render(); }, 25); }
  notice(message) { this.message = clean(message); clearTimeout(this.messageTimer); this.messageTimer = setTimeout(() => { this.message = ''; this.schedule(); }, 8000); this.schedule(); }
  setFocus(name) { this.focus = name; if (name === 'files') this.tab.showFiles = true; if (name === 'terminal') this.tab.showTerminal = true; ({ files: this.list, editor: this.preview, terminal: this.terminal })[name].focus(); this.schedule(); }
  async start(target) { await this.workspace.newTab(target); this.watch(); this.setFocus('files'); this.render(); }
  watch() {
    this.watcher?.close(); clearTimeout(this.watchTimer);
    if (!this.tab) return;
    this.safe(async () => {
      const tab = this.tab;
      this.watcher = watch(await worlds.physical(tab), () => {
        clearTimeout(this.watchTimer); this.watchTimer = setTimeout(() => this.safe(() => this.workspace.refresh(tab)), 120);
      });
      this.watcher.on('error', error => this.notice(error.message));
    });
  }
  async navigate(target) {
    if (!target) return;
    const previous = this.tab.cwd; await this.workspace.navigate(target); this.watch();
    const index = this.tab.entries.findIndex(entry => entry.path === previous);
    this.list.select(Math.max(0, index)); this.setFocus('files'); this.previewSelection();
  }
  entries() { return this.tab.entries.filter(entry => entry.name.toLowerCase().includes(this.tab.filter.toLowerCase())); }
  selected() { return this.entries()[this.list.selected]; }
  selectedPaths() { return this.tab.selected.size ? [...this.tab.selected] : this.selected() ? [this.selected().path] : []; }
  async previewSelection() {
    const sequence = ++this.sequence, entry = this.selected();
    if (this.tab.document) return;
    let content = '';
    try {
      if (entry?.directory) content = (await files.list(await worlds.physical(this.tab, entry.path), this.tab.config.values.show_hidden === 'true')).slice(0, 300).map(row => `${row.directory ? '▸' : ' '} ${row.name}${row.directory ? '/' : ''}`).join('\n');
      else if (entry) {
        if (entry.size > 512 * 1024) content = `${entry.name}\n\n${size(entry.size)} · Enter to open`;
        else { const file = await files.read(entry.path, this.tab.config.values); content = file.kind === 'text' ? file.content.split('\n').slice(0, 500).join('\n') : `${entry.name}\n\n${file.mime} · ${size(entry.size)}\n\nPress Enter to open externally.`; }
      }
    } catch (error) { content = error.message; }
    if (sequence !== this.sequence) return;
    this.previewText = content; this.preview.setScroll(0); this.schedule();
  }
  layout() {
    const width = this.screen.width, height = this.screen.height, tab = this.tab;
    const area = Math.max(3, height - 4), termHeight = tab.showTerminal ? (tab.expanded === 'terminal' ? area : Math.max(5, Math.floor(area * .36))) : 0;
    const bodyHeight = Math.max(0, area - termHeight), showFiles = tab.showFiles && tab.expanded !== 'terminal';
    const parentWidth = showFiles && width >= 100 ? Math.floor(width * .18) : 0;
    const filesWidth = showFiles ? (tab.expanded === 'files' ? width - parentWidth : width < 65 ? (this.focus === 'files' ? width : 0) : Math.floor(width * .30)) : 0;
    this.parent.hidden = !parentWidth || !bodyHeight; this.list.hidden = !filesWidth || !bodyHeight;
    Object.assign(this.parent, { left: 0, width: parentWidth, height: bodyHeight });
    Object.assign(this.list, { left: parentWidth, width: filesWidth, height: bodyHeight });
    Object.assign(this.preview, { left: parentWidth + filesWidth, width: Math.max(1, width - parentWidth - filesWidth), height: bodyHeight });
    this.preview.hidden = tab.expanded === 'files' || !bodyHeight || (width < 65 && this.focus === 'files' && showFiles);
    this.terminal.hidden = !termHeight; Object.assign(this.terminal, { top: 2 + bodyHeight, left: 0, width, height: termHeight });
    if (termHeight) this.shells.resize(tab.id, width - 2, termHeight - 2);
  }
  render() {
    if (this.closed || !this.tab) return;
    const tab = this.tab; this.layout();
    this.screen.title = this.workspace.words.name;
    this.header.setContent(` {bold}${esc(this.workspace.words.name)}{/bold}  {#9393aa-fg}shaddai: ${esc(this.workspace.words.shaddai.replace(/\n/g, ' '))}{/}`);
    this.tabs.setContent(this.workspace.tabs.map((item, index) => `${index === this.workspace.index ? '{bold}{#d1b38a-fg}' : ''} ${index + 1}:${item.document?.dirty ? '*' : ''}${esc(item.document?.file.name || path.basename(item.cwd) || '/')} ${index === this.workspace.index ? '{/}' : ''}`).join(' ') + `  {#9393aa-fg}${esc(tab.cwd)}${tab.worldRoot ? ' [world]' : ''}{/}`);
    const rows = this.entries(), selected = this.selected()?.path;
    const labels = rows.map(entry => `${tab.selected.has(entry.path) ? '*' : ' '}${entry.directory ? '{#8faee0-fg}' : ''}${esc(entry.name)}${entry.directory ? '/{/}' : ''}${entry.symlink ? ' @' : ''}`);
    if (this.list.ritems.join('\n') !== labels.join('\n')) { this.list.setItems(labels); const index = rows.findIndex(entry => entry.path === selected); if (index >= 0) this.list.select(index); }
    this.list.setLabel(` files${tab.filter ? ' /' + clean(tab.filter) : ''} · ${rows.length} `);
    this.refreshParent();
    const doc = tab.document;
    if (doc) this.renderDocument(doc);
    else {
      this.preview.setLabel(' preview ');
      this.preview.setContent(this.previewText ? esc(this.previewText) : `{bold}${esc(this.workspace.words.name)}{/bold}\n\nshaddai\n${esc(this.workspace.words.shaddai)}\n\nEnter opens a file.\nCtrl+P opens every command.\nF2 on this welcome edits the definition.`);
    }
    const session = this.shells.sessions.get(tab.id);
    if (session && tab.showTerminal) { this.terminal.setLabel(` shell${session.exited ? ' · exited; use Restart shell in commands' : session.scroll ? ' · scrollback' : ''} `); this.terminal.setContent(terminalLines(session)); }
    for (const [widget, name] of [[this.list, 'files'], [this.preview, 'editor'], [this.terminal, 'terminal']]) widget.style.border.fg = this.focus === name ? '#c2a978' : '#454552';
    const entry = this.selected(), p = doc?.position;
    const unread = this.workspace.state.letters.filter(letter => !letter.read).length;
    this.status.setContent(` ${this.message ? esc(this.message) : `${esc(this.focus)}${doc ? ` · ${esc(doc.file.name || 'untitled')}${doc.dirty ? ' [+]' : ''} · ${p.row + 1}:${p.column + 1} · ${tab.mode}` : entry ? ` · ${size(entry.size)} · ${esc(entry.name)}` : ''}`} {right}${unread ? `inbox:${unread}  ` : ''}Need Some Help?  ^P {/right}`);
    this.screen.render();
    this.screen.program.hideCursor();
    if (!this.dialog && this.focus === 'terminal' && tab.showTerminal && session && !session.scroll) {
      const b = session.term.buffer.active;
      this.screen.program.cup(this.terminal.atop + 1 + b.cursorY, 1 + Math.min(session.term.cols - 1, b.cursorX)); this.screen.program.showCursor();
    }
  }
  refreshParent() {
    const target = path.dirname(this.tab.cwd);
    if (this.parentTarget === target && this.parentCurrent === this.tab.cwd) return;
    this.parentTarget = target; this.parentCurrent = this.tab.cwd;
    this.safe(async () => {
      const entries = await files.list(target, this.tab.config.values.show_hidden === 'true');
      if (target !== this.parentTarget) return;
      this.parentEntries = entries; this.parent.setItems(entries.map(entry => clean(entry.name) + (entry.directory ? '/' : '')));
      this.parent.select(entries.findIndex(entry => entry.path === this.tab.cwd)); this.schedule();
    });
  }
  renderDocument(doc) {
    const tab = this.tab, p = doc.position, height = Math.max(1, this.preview.height - 2), width = Math.max(1, this.preview.width - 9);
    const lines = doc.text.split('\n');
    if (this.focus === 'editor' && tab.mode !== 'reading') {
      if (p.row < doc.top) doc.top = p.row; if (p.row >= doc.top + height) doc.top = p.row - height + 1;
      if (p.column < doc.left) doc.left = p.column; if (p.column >= doc.left + width) doc.left = p.column - width + 1;
    }
    doc.top = Math.max(0, Math.min(doc.top, lines.length - 1));
    this.preview.setLabel(` ${clean(doc.file.name || 'untitled')}${doc.dirty ? ' [+]' : ''} · ${tab.mode} `);
    const content = lines.slice(doc.top, doc.top + height).map((line, index) => {
      const row = index + doc.top, points = Array.from(line), from = doc.left;
      let text = esc(points.slice(from, from + width).join(''));
      if (this.focus === 'editor' && tab.mode !== 'reading' && row === p.row) {
        text = esc(points.slice(from, p.column).join('')) + '{inverse}' + esc(points[p.column] || ' ') + '{/inverse}' + esc(points.slice(p.column + 1, from + width).join(''));
      }
      if (/^## /.test(line)) text = `{#6d9eeb-fg}${text}{/}`; else if (/^### /.test(line)) text = `{#ffe599-fg}${text}{/}`;
      if (tab.mode === 'reading') text = esc(line.replace(/^#{1,6}\s+/, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)'));
      return `{#66667d-fg}${String(row + 1).padStart(5)} {/}${text}`;
    }).join('\n');
    this.preview.setContent(content); this.preview.setScroll(0);
  }
  async guard(tab = this.tab) {
    if (!tab.document?.dirty) return true;
    const choice = await this.pick('Unsaved changes', ['Save', 'Discard', 'Cancel']);
    if (choice === 0) { await this.save(tab); return !tab.document.dirty; }
    return choice === 1;
  }
  async openSelected() { const entry = this.selected(); if (entry?.directory) await this.navigate(entry.path); else if (entry) await this.open(entry.path); }
  async open(filename, tab = this.tab) {
    if (!await this.guard(tab)) return;
    const result = await this.workspace.open(filename, tab);
    if (result.kind !== 'text') {
      if (await this.pick('Open in desktop application?', [result.name, 'Cancel']) === 0) await this.external(filename);
    } else this.setFocus('editor');
  }
  async save(tab = this.tab, as = false, force = false) {
    if (!tab.document) return;
    let filename;
    if (as || !tab.document.file.path) { filename = await this.prompt('Save as · existing destinations are protected', tab.document.file.path || path.join(tab.cwd, '')); if (!filename) return; }
    await this.workspace.save(tab, { filename, force }); this.notice('Saved.');
  }
  async switchTab(index) { this.workspace.index = (index + this.workspace.tabs.length) % this.workspace.tabs.length; this.parentTarget = null; this.list.select(0); this.watch(); await this.previewSelection(); this.schedule(); }
  async closeTab() {
    if (!await this.guard()) return;
    if (this.workspace.tabs.length === 1) return this.quit();
    this.shells.closeTab(this.tab.id); this.workspace.tabs.splice(this.workspace.index, 1); await this.switchTab(Math.max(0, this.workspace.index - 1));
  }
  async quit(signal = false) {
    if (this.closed || this.quitting) return;
    this.quitting = true;
    try {
      if (!signal) for (const tab of this.workspace.tabs) if (!await this.guard(tab)) return;
      if (signal) {
        // Preserve unsaved buffers if the surrounding terminal disappears.
        this.workspace.state.recovery = this.workspace.tabs.filter(tab => tab.document?.dirty).map(tab => ({ path: tab.document.file.path, text: tab.document.text }));
      }
      await this.workspace.persist(); this.closed = true;
      clearTimeout(this.timer); clearTimeout(this.messageTimer); clearTimeout(this.watchTimer); this.watcher?.close();
      process.off('SIGTERM', this.exitSignal); process.off('SIGHUP', this.exitSignal);
      this.shells.close(); this.screen.program.write('\x1b[?2004l'); this.screen.destroy();
      process.stdin.unpipe(this.input); process.stdin.pause(); this.input.destroy(); await this.onClose();
    } finally { this.quitting = false; }
  }
  scrollShell(delta) { const session = this.shells.sessions.get(this.tab.id); if (session) { session.scroll = Math.max(0, Math.min(session.term.buffer.active.baseY, session.scroll + delta)); this.schedule(); } }
  paste(text) {
    if (this.dialog?.paste) this.dialog.paste(text);
    else if (this.focus === 'editor' && this.tab.document && this.tab.mode !== 'reading') this.tab.document.insert(text);
    else if (this.focus === 'terminal') this.shells.sessions.get(this.tab.id)?.term.paste(text);
    this.schedule();
  }
  async key(ch, key = {}) {
    if (this.closed) return;
    if (this.dialog) { this.dialog.key(ch, key); return; }
    const full = key.full || key.name, tab = this.tab;
    if (full === 'C-q' || full === 'f10') return this.quit();
    if (full === 'C-p') return this.palette();
    if (full === 'f1') return this.help();
    if (full === 'C-b') { tab.showTerminal = !tab.showTerminal; this.setFocus(tab.showTerminal ? 'terminal' : 'files'); return; }
    if (full === 'C-e') { tab.showFiles = !tab.showFiles; this.setFocus(tab.showFiles ? 'files' : 'editor'); return; }
    if (full === 'C-t') { await this.workspace.newTab(); this.watch(); this.setFocus('files'); return; }
    if (full === 'C-w') return this.closeTab();
    if (full === 'M-right' || full === 'C-pagedown') return this.switchTab(this.workspace.index + 1);
    if (full === 'M-left' || full === 'C-pageup') return this.switchTab(this.workspace.index - 1);
    if (/^M-[1-9]$/.test(full)) return this.switchTab(Number(full.at(-1)) - 1);
    if (full === 'C-l' && tab.showTerminal) { this.setFocus('terminal'); this.shells.write(tab.id, '\x0c'); return; }
    if (full === 'tab' && this.focus !== 'editor' && this.focus !== 'terminal' || full === 'S-tab') {
      const panes = ['files', 'editor', ...(tab.showTerminal ? ['terminal'] : [])]; this.setFocus(panes[(panes.indexOf(this.focus) + 1) % panes.length]); return;
    }
    if (full === 'escape') { tab.expanded = ''; this.setFocus('files'); return; }
    if (this.focus === 'terminal') {
      if (full === 'S-pageup') return this.scrollShell(10);
      if (full === 'S-pagedown') return this.scrollShell(-10);
      let sequence = key.sequence || ch;
      const session = this.shells.sessions.get(tab.id);
      if (session?.term.modes.applicationCursorKeysMode && ['up','down','left','right'].includes(key.name)) sequence = '\x1bO' + ({ up: 'A', down: 'B', right: 'C', left: 'D' })[key.name];
      if (sequence) this.shells.write(tab.id, sequence);
      return;
    }
    if (full === 'C-s') return this.save();
    if (full === 'C-o') { const filename = await this.prompt('Open file or directory', tab.cwd + path.sep); if (filename) { const target = path.resolve(tab.cwd, filename); if ((await fs.stat(target)).isDirectory()) await this.navigate(target); else await this.open(target); } return; }
    if (full === 'C-n') return this.create(false);
    if (full === 'C-r') { const modes = ['hybrid', 'reading', 'source']; tab.mode = modes[(modes.indexOf(tab.mode) + 1) % modes.length]; this.schedule(); return; }
    if (full === 'C-l') { const target = await this.prompt('Go to directory', tab.cwd); if (target) await this.navigate(path.resolve(tab.cwd, target)); return; }
    if (this.focus === 'editor' && tab.document) {
      if (tab.mode === 'reading') { if (['up','k'].includes(full)) tab.document.top = Math.max(0, tab.document.top - 1); if (['down','j'].includes(full)) tab.document.top++; if (full === 'pageup') tab.document.top = Math.max(0, tab.document.top - 10); if (full === 'pagedown') tab.document.top += 10; }
      else this.editKey(tab.document, ch, key);
      this.schedule(); return;
    }
    if (full === 'up' || ch === 'k') this.list.up();
    else if (full === 'down' || ch === 'j') this.list.down();
    else if (full === 'pageup') this.list.up(Math.max(1, this.list.height - 3));
    else if (full === 'pagedown') this.list.down(Math.max(1, this.list.height - 3));
    else if (full === 'home' || ch === 'g') this.list.select(0);
    else if (full === 'end' || ch === 'G') this.list.select(this.entries().length - 1);
    else if (['enter','return','right'].includes(full) || ch === 'l') return this.openSelected();
    else if (['left','backspace'].includes(full) || ch === 'h') return this.navigate(path.dirname(tab.cwd));
    else if (ch === 'q') return this.quit();
    else if (ch === '/' || ch === 'f') { const filter = await this.prompt('Filter files · empty shows all', tab.filter); if (filter !== null) { tab.filter = filter; this.list.select(0); await this.previewSelection(); } }
    else if (ch === ':') return this.commandPrompt();
    else if (ch === '!') { this.setFocus('terminal'); const command = await this.prompt('Shell command'); if (command) this.shells.write(tab.id, command + '\r'); }
    else if (full === 'C-h' || ch === '.') { await this.workspace.settings({ show_hidden: String(tab.config.values.show_hidden !== 'true') }); this.parentTarget = null; }
    else if (ch === ' ' && this.selected()) { const target = this.selected().path; if (tab.selected.has(target)) tab.selected.delete(target); else tab.selected.add(target); this.list.down(); }
    else if (ch === 'y') { this.clipboard = { paths: this.selectedPaths(), cut: false }; this.notice('Copied paths. Press p to paste.'); }
    else if (ch === 'x') { this.clipboard = { paths: this.selectedPaths(), cut: true }; this.notice('Cut paths. Press p to move.'); }
    else if (ch === 'p') return this.pasteFiles();
    else if (ch === 'a') return this.create(false);
    else if (ch === 'A') return this.create(true);
    else if (full === 'f2') return this.rename();
    else if (full === 'f5') return this.workspace.refresh();
    else if (ch === 'D' || full === 'delete') return this.trash();
    else if (ch === '?') return this.help();
    this.schedule();
  }
  editKey(doc, ch, key) {
    const name = key.full || key.name;
    if (name === 'left') doc.move(0, -1); else if (name === 'right') doc.move(0, 1);
    else if (name === 'up') doc.move(-1); else if (name === 'down') doc.move(1);
    else if (name === 'pageup') doc.move(-10); else if (name === 'pagedown') doc.move(10);
    else if (name === 'home' || name === 'C-a') doc.edge(false); else if (name === 'end' || name === 'C-e') doc.edge(true);
    else if (name === 'C-z') doc.history(); else if (name === 'C-y') doc.history(false);
    else if (name === 'backspace') doc.backspace(); else if (name === 'delete') doc.delete();
    else if (name === 'enter' || name === 'return') doc.insert('\n'); else if (name === 'tab') doc.insert('    ');
    else if (name === 'C-f') this.safe(async () => { const value = await this.prompt('Find in document'); if (value && !doc.find(value)) this.notice('No match.'); });
    else if (ch && !key.ctrl && !key.meta && !/[\x00-\x1f\x7f]/.test(ch)) doc.insert(ch);
  }
  modal(title, setup) {
    if (this.dialog) return Promise.resolve(null);
    return new Promise(resolve => {
      const box = blessed.box({ parent: this.screen, top: 'center', left: 'center', width: '85%', height: '75%', border: 'line', tags: true, label: ` ${clean(title)} `, style: { bg: '#20202b', border: { fg: '#c2a978' } } });
      const dialog = this.dialog = { box, close: value => { if (this.dialog !== dialog) return; this.dialog = null; box.destroy(); this.schedule(); resolve(value); } };
      setup(dialog); box.setFront(); this.schedule();
    });
  }
  prompt(title, initial = '', multiline = false, onChange) {
    return this.modal(title, dialog => {
      const doc = new Document({ content: initial, newline: '\n' }); doc.cursor = doc.points.length;
      const draw = () => {
        const p = doc.position, lines = doc.text.split('\n'), top = Math.max(0, p.row - Math.max(1, dialog.box.height - 6));
        dialog.box.setContent(`${multiline ? 'Ctrl+S: save' : 'Enter: accept'} · Escape: cancel\n\n` + lines.slice(top).map((line, row) => row + top === p.row ? esc(Array.from(line).slice(0, p.column).join('')) + '{inverse}' + esc(Array.from(line)[p.column] || ' ') + '{/inverse}' + esc(Array.from(line).slice(p.column + 1).join('')) : esc(line)).join('\n'));
        onChange?.(doc.text); this.schedule();
      };
      dialog.paste = text => { doc.insert(multiline ? text : text.replace(/[\r\n]+/g, ' ')); draw(); };
      dialog.key = (ch, key) => {
        if (key.name === 'escape') return dialog.close(null);
        if (key.full === 'C-s' || !multiline && ['enter','return'].includes(key.name)) return dialog.close(doc.text);
        this.editKey(doc, ch, key); draw();
      }; draw();
    });
  }
  pick(title, choices) {
    return this.modal(title, dialog => {
      let query = '', index = 0, found = choices.map((label, index) => ({ label, index }));
      const draw = () => {
        found = choices.map((label, index) => ({ label, index })).filter(item => item.label.toLowerCase().includes(query.toLowerCase()));
        index = Math.max(0, Math.min(index, found.length - 1));
        const count = Math.max(1, dialog.box.height - 5), top = Math.max(0, index - count + 1);
        dialog.box.setContent(`Type to filter: ${esc(query)}\n\n${found.slice(top, top + count).map((item, row) => `${row + top === index ? '{inverse}> ' : '  '}${esc(item.label)}${row + top === index ? '{/inverse}' : ''}`).join('\n')}\n\n{#9393aa-fg}↑↓ select · Enter choose · Escape cancel{/}`); this.schedule();
      };
      dialog.key = (ch, key) => {
        if (key.name === 'escape') return dialog.close(null);
        if (['enter','return'].includes(key.name)) return dialog.close(found[index]?.index ?? null);
        if (key.name === 'up') index--; else if (key.name === 'down') index++;
        else if (key.name === 'backspace') { query = Array.from(query).slice(0, -1).join(''); index = 0; }
        else if (ch && !key.ctrl && !key.meta && !/[\x00-\x1f]/.test(ch)) { query += ch; index = 0; }
        draw();
      };
      dialog.paste = text => { query += text.replace(/[\r\n]/g, ''); index = 0; draw(); }; draw();
    });
  }
  text(title, content, { edit } = {}) {
    return this.modal(title, dialog => {
      let top = 0;
      const draw = () => { const width = Math.max(10, dialog.box.width - 4), lines = clean(content).split('\n').flatMap(line => { const points = Array.from(line), out = []; do { out.push(points.splice(0, width).join('')); } while (points.length); return out; }); dialog.box.setContent(lines.slice(top, top + dialog.box.height - 4).map(esc).join('\n') + `\n\n{#9393aa-fg}↑↓ scroll · Escape close${edit ? ' · e edit' : ''}{/}`); this.schedule(); };
      dialog.key = (ch, key) => { if (key.name === 'escape' || ch === 'q' || ['enter','return'].includes(key.name)) return dialog.close(null); if (ch === 'e' && edit) return dialog.close('edit'); if (key.name === 'down' || ch === 'j') top++; if (key.name === 'up' || ch === 'k') top = Math.max(0, top - 1); if (key.name === 'pagedown') top += 10; if (key.name === 'pageup') top = Math.max(0, top - 10); draw(); }; draw();
    });
  }
  async palette() { const items = [...this.commands]; const index = await this.pick('Commands', items.map(item => item[1])); if (index !== null) await items[index][2](); }
  async commandPrompt() {
    const line = await this.prompt(': command'); if (!line) return;
    const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(line.trim()), command = match[1], argument = match[2] || '';
    if (command === 'cd') return this.navigate(path.resolve(this.tab.cwd, argument || os.homedir()));
    if (command === 'open') return this.open(path.resolve(this.tab.cwd, argument));
    if (command === 'mkdir') { await files.create(path.resolve(this.tab.cwd, argument), true); return this.workspace.refresh(); }
    if (command === 'set') { const equals = argument.indexOf('='); if (equals < 1) throw new Error('Use :set name=value'); return this.workspace.settings({ [argument.slice(0, equals)]: argument.slice(equals + 1) }); }
    if (command.startsWith('!')) { this.setFocus('terminal'); this.shells.write(this.tab.id, line.slice(1) + '\r'); return; }
    const item = this.commands.find(item => item[0] === command); if (!item) throw new Error('Unknown command. Ctrl+P lists commands.'); await item[2]();
  }
  async create(directory) {
    const filename = await this.prompt(directory ? 'New directory' : 'New file', this.tab.cwd + path.sep); if (!filename) return;
    const target = path.resolve(this.tab.cwd, filename); await files.create(target, directory); await this.workspace.refresh(); if (!directory) await this.open(target);
  }
  async rename() {
    const target = this.focus === 'editor' ? this.tab.document?.file.path : this.selected()?.path; if (!target) return;
    const name = await this.prompt('Rename / move · existing destinations are protected', target); if (!name || name === target) return;
    const destination = path.resolve(this.tab.cwd, name); await files.move(target, destination);
    if (this.tab.document?.file.path === target) { this.tab.document.file.path = destination; this.tab.document.file.name = path.basename(destination); }
    await this.workspace.refresh();
  }
  async pasteFiles() {
    if (!this.clipboard) return;
    for (const source of this.clipboard.paths) {
      const destination = path.join(await worlds.physical(this.tab), path.basename(source));
      if (this.clipboard.cut) await files.move(source, destination);
      else await fs.cp(source, destination, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
    }
    if (this.clipboard.cut) this.clipboard = null; await this.workspace.refresh();
  }
  async trash() {
    const targets = this.selectedPaths(); if (!targets.length) return;
    if (await this.pick(`Move ${targets.length} item(s) to desktop Trash?`, ['Cancel', 'Move to Trash']) !== 1) return;
    const { execFile } = require('node:child_process');
    for (const filename of targets) await new Promise((resolve, reject) => execFile('gio', ['trash', '--', filename], error => error ? reject(error) : resolve()));
    this.tab.selected.clear(); await this.workspace.refresh();
  }
  async external(target) {
    const { spawn } = require('node:child_process');
    await new Promise((resolve, reject) => { const child = spawn('xdg-open', [target], { stdio: 'ignore' }); child.on('error', reject); child.on('exit', code => code ? reject(new Error(`xdg-open exited ${code}`)) : resolve()); });
  }
  async workflow(command) {
    await new Promise((resolve, reject) => {
      this.screen.program.write('\x1b[?2004l');
      const child = this.screen.spawn(process.execPath, [paths.root + '/bin/yhwh', command], { cwd: this.tab.cwd, env: { ...process.env, YHWH_INTERFACE: 'tty' } });
      child.once('error', reject); child.once('exit', () => { this.screen.program.write('\x1b[?2004h'); resolve(); });
    }); await this.workspace.refresh();
  }
  async editDefinition() { const value = await this.prompt('shaddai · editable definition', this.workspace.words.shaddai, true); if (value !== null) await this.workspace.setWord('shaddai', value); }
  async settings() {
    const tab = this.tab, fields = [['show_hidden','Hidden files'], ['energy','Amount of YHWH (0–100)'], ['inbox','Inbox letters'], ['narrative','Optional walk'], ['file_manager','File manager visible on new tabs'], ['terminal','Shell visible on new tabs']];
    const index = await this.pick('Settings', [...fields.map(([key, label]) => `${label}: ${tab.config.values[key]}`), 'Edit shaddai definition', 'Edit hierarchical rc', 'Reload configuration']);
    if (index === null) return;
    if (index === fields.length) return this.editDefinition();
    if (index === fields.length + 1) return this.editConfig();
    if (index === fields.length + 2) return this.workspace.refresh();
    const [key] = fields[index]; let value;
    if (key === 'energy') { value = await this.prompt('Amount of YHWH · 0 Dawkins / 50 Nietzsche / 100 YHWH', tab.config.values[key]); if (value === null) return; if (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100) throw new Error('Choose a number from 0 to 100.'); }
    else value = String(tab.config.values[key] !== 'true');
    const scope = await this.pick('Apply setting to', ['This directory and children', 'Everywhere']); if (scope === null) return;
    const values = { [key]: value }; if (key === 'energy') values.theme = Number(value) === 0 ? 'dawkins' : Number(value) < 100 ? 'nietzsche' : 'yhwh';
    await this.workspace.settings(values, scope === 0 ? tab.cwd : '/');
  }
  async editConfig() {
    const filename = path.join(require('../yhwh-default/app/config.cjs').userDirectory(), 'rc');
    await fs.mkdir(path.dirname(filename), { recursive: true }); const handle = await fs.open(filename, 'a', 0o600); await handle.close(); await this.open(filename);
  }
  async chat() {
    const tab = this.tab, directory = await worlds.physical(tab), log = this.workspace.conversation(directory);
    const index = await this.pick('Conversation · Codex · read only', ['Write / retry message', 'Read conversation', 'Clear conversation']);
    if (index === 1) return this.text('Conversation', log.messages.map(message => `${message.role === 'user' ? 'Abe' : 'el shaddai'}\n${message.content}`).join('\n\n') || 'No messages yet.');
    if (index === 2) { if (await this.pick('Clear local conversation?', ['Cancel', 'Clear']) === 1) { log.messages = []; await this.workspace.persist(); } return; }
    if (index !== 0) return;
    const draft = await this.prompt('Message · Ctrl+S send · Escape keeps draft', log.draft, true, value => { log.draft = value; });
    await this.workspace.persist(); if (draft === null || !draft.trim()) return;
    if (this.chatPending?.has(directory)) throw new Error('A reply is already pending for this directory.');
    (this.chatPending ||= new Set()).add(directory); this.notice('Waiting for Codex. You can keep working.');
    this.workspace.chat(tab).then(answer => { this.notice('Reply received · Ctrl+P → Conversation'); return answer; }).catch(error => this.notice(error.message)).finally(() => { this.chatPending.delete(directory); this.schedule(); });
  }
  async verses() {
    const catalog = await this.workspace.verses.catalog(), books = catalog.map(book => book.book);
    const bookIndex = await this.pick('We The Nameless · books', [...books, 'Random verse', 'Type a reference']); if (bookIndex === null) return;
    let verses;
    if (bookIndex === books.length) verses = [await this.workspace.verses.random()];
    else if (bookIndex === books.length + 1) { const reference = await this.prompt('Verse reference', 'Genesis 18:1'); if (!reference) return; verses = await this.workspace.verses.get(reference); }
    else {
      const book = catalog[bookIndex], chapterIndex = await this.pick(book.book, book.chapters.map(chapter => `Chapter ${chapter}`)); if (chapterIndex === null) return;
      const rows = await this.workspace.verses.chapter(book.book, book.chapters[chapterIndex]);
      const verseIndex = await this.pick(`${book.book} ${book.chapters[chapterIndex]}`, rows.map(verse => verse.reference)); if (verseIndex === null) return;
      verses = await this.workspace.verses.get(rows[verseIndex].id);
    }
    for (const verse of verses) {
      const content = `${verse.original || ''}\n\n${verse.english || ''}\n\nCommentary\n${verse.commentary || ''}`;
      if (await this.text(verse.reference, content, { edit: true }) === 'edit') { const value = await this.prompt('Edit verse commentary', verse.commentary || '', true); if (value !== null) await this.workspace.verses.saveCommentary(verse.id, value); }
    }
  }
  async inbox() {
    const letterWords = { house: ['A small housing question','letterHouse'], bread: ['You saved something','letterBread'], offering: ['About the rent','letterOffering'], inspect: ['I came down to look','letterInspect'], seed: ['The land department','letterSeed'], covenant: ['Long-term support','letterCovenant'] };
    const letters = this.workspace.state.letters;
    const index = await this.pick('Inbox · local letters', letters.length ? letters.map(letter => `${letter.read ? '' : '* '}${letterWords[letter.id]?.[0] || letter.id}`) : ['No letters. A quiet miracle, Abe.']);
    if (index === null || !letters.length) return;
    const letter = letters[index]; letter.read = true; await this.workspace.persist(); const [title, key] = letterWords[letter.id]; await this.text(title, words[key] + '\n\nLiterary adaptation · We The Nameless.');
  }
  async narrative() {
    const state = this.workspace.state, steps = [['open','Open a file'], ['save','Save something'], ['navigate','Explore a directory'], ['shell','Open the shell'], ['world','Visit another world']];
    state.walk = true; await this.workspace.persist();
    await this.text('Take a walk', steps.map(([id, label]) => `${state.steps.includes(id) ? '[x]' : '[ ]'} ${label}`).join('\n') + '\n\nProgress follows real actions. Pause from the command palette.');
  }
  async help() {
    await this.text('el shaddai · keyboard', `shaddai: ${this.workspace.words.shaddai}\n\nFiles: h/j/k/l or arrows; Enter open; / filter; . hidden\nSpace select; y copy; x cut; p paste; a file; A directory\nF2 rename; D Trash (asks first); g/G first/last\n\nCtrl+P commands; : command; Ctrl+O open; Ctrl+N new\nCtrl+S save; Ctrl+F find; Ctrl+Z undo; Ctrl+Y redo\nCtrl+R hybrid / reading / source; Escape files\nCtrl+B shell; Shift+Tab cycle focus; Tab indents in editor\nCtrl+T new tab; Ctrl+W close; Alt+Left/Right switch tabs\nCtrl+L clears visible shell, otherwise edits location\nShell: normal keys including Ctrl+C/D; Shift+PageUp scrollback\nCtrl+Q or F10 quit; q quits from files; F1 help\n\n:cd PATH · :open PATH · :mkdir PATH · :set name=value\n:! COMMAND · Ctrl+P exposes settings, chat, verses, worlds,\ninbox, copy, offerings and the executable English workflow.\n\nYour terminal controls its own font and colors. Browser DOM\nplugins and spatial effects stay in the desktop interface.`);
  }
  commandList() {
    const command = (id, title, run) => [id, title, run];
    return [
      command('open','Open file / directory · Ctrl+O', () => this.key('', { full: 'C-o' })),
      command('new-file','New file', () => this.create(false)), command('new-directory','New directory', () => this.create(true)),
      command('save','Save · Ctrl+S', () => this.save()), command('save-as','Save as', () => this.save(this.tab, true)),
      command('overwrite','Overwrite changed file with buffer', async () => { if (await this.pick('Overwrite disk with editor contents?', ['Cancel','Overwrite']) === 1) await this.save(this.tab, false, true); }),
      command('reload','Reload file from disk', () => this.tab.document?.file.path && this.open(this.tab.document.file.path)),
      command('close-document','Close document / return to preview', async () => { if (await this.guard()) { this.tab.document = null; this.setFocus('files'); await this.previewSelection(); } }),
      command('rename','Rename / move', () => this.rename()), command('trash','Move selection to Trash', () => this.trash()),
      command('external','Open current file in desktop application', () => this.external(this.tab.document?.file.path || this.selected()?.path || this.tab.cwd)),
      command('parent','Parent directory', () => this.navigate(path.dirname(this.tab.cwd))), command('home','Home directory', () => this.navigate(os.homedir())),
      command('back','Back in directory history', () => this.workspace.goBack(-1)), command('forward','Forward in directory history', () => this.workspace.goBack(1)),
      command('refresh','Refresh files and configuration', () => this.workspace.refresh()),
      command('new-tab','New app tab', async () => { await this.workspace.newTab(); this.watch(); this.setFocus('files'); await this.workspace.work('covenant','tab'); }),
      command('close-tab','Close app tab', () => this.closeTab()), command('next-tab','Next tab', () => this.switchTab(this.workspace.index + 1)),
      command('focus-files','Focus files', () => this.setFocus('files')), command('focus-editor','Focus editor', () => this.setFocus('editor')),
      command('focus-terminal','Focus shell', async () => { this.setFocus('terminal'); await this.workspace.work('inspect','shell'); }),
      command('expand-files','Expand / restore files', () => { this.tab.expanded = this.tab.expanded === 'files' ? '' : 'files'; this.setFocus('files'); }),
      command('expand-terminal','Expand / restore shell', () => { this.tab.expanded = this.tab.expanded === 'terminal' ? '' : 'terminal'; this.setFocus('terminal'); }),
      command('restart-shell','Restart shell in current directory', () => { this.shells.closeTab(this.tab.id); this.shells.start(this.tab); this.setFocus('terminal'); }),
      command('view-mode','Cycle hybrid / reading / source', () => this.key('', { full: 'C-r' })),
      command('settings','Settings · directory scopes and presence', () => this.settings()), command('edit-config','Edit hierarchical rc', () => this.editConfig()),
      command('shaddai','shaddai · definition / edit', async () => { if (await this.text('shaddai', this.workspace.words.shaddai, { edit: true }) === 'edit') await this.editDefinition(); }),
      command('edit-shaddai','Edit shaddai definition', () => this.editDefinition()),
      command('chat','Conversation · Codex · read only', () => this.chat()), command('verses','Browse We The Nameless · chapter / verse / commentary', () => this.verses()),
      command('inbox','Inbox · local letters', () => this.inbox()), command('narrative','Take a walk · optional narrative', () => this.narrative()),
      command('pause-walk','Pause the walk', async () => { this.workspace.state.walk = false; await this.workspace.persist(); await this.workspace.settings({ narrative: 'false' }); }),
      command('higher-help','Need Some Help? · God / Man', async () => { const index = await this.pick('Need Some Help?', ['God','Man']); if (index !== null) { await this.workspace.enterWorld(index === 0 ? 'yhwh' : 'root'); this.watch(); } }),
      command('leave-world','Return to ordinary files', async () => { await this.workspace.leaveWorld(); this.watch(); }),
      ...['sinai','horeb'].map(name => command(name, `Books · ${name}`, async () => { const library = await worlds.books(name); const index = await this.pick(name, library.items.map(item => item.title)); if (index !== null) { const item = library.items[index]; if (item.url) await this.external(item.url); else await this.text(item.title, words.booksUnavailable); } })),
      command('about','About el shaddai', () => this.text('el shaddai', this.workspace.words.shaddai + '\n\n' + words.aboutBody)),
      command('team','About Us · Our Team', () => this.text('Our Team', words.teamBody)), command('roadmap','About Us · Roadmap', () => this.text('Roadmap', words.roadmapBody)),
      command('seed-funding','Seed funding', async () => { await this.text(words.seedTitle, words.seedBody + '\n\n' + words.seedQuote + '\n' + words.seedAttribution); const url = this.tab.config.values.stripe_payment_link; if (url && /^https:\/\/buy\.stripe\.com\//.test(url) && await this.pick('Open donation checkout?', ['Cancel','Open payment page']) === 1) await this.external(url); }),
      command('offerings','Offerings', () => this.text(words.offeringsTitle, words.offeringsBody + '\n\n' + words.burntBody + '\n\n' + words.pieceBody)),
      command('fan-mail','Fan mail', async () => { const items = JSON.parse(await fs.readFile(paths.etc('default/fan-mail.json'), 'utf8')); await this.text(words.fanTitle, JSON.stringify(items, null, 2)); }),
      command('edit-copy','Edit character copy', () => this.open(paths.etc('default/words.json'))),
      command('upgrades','Coming soon · Sync / Stuff / Three / Dating', () => this.text('Coming soon', words.upgrades)),
      command('guide','Open the full guide', () => this.open(path.join(paths.root, 'src/yhwh-tty/README.md'))), command('help','Help / keyboard shortcuts · F1', () => this.help()),
      ...['begin','review','run','add','commit'].map(name => command(name, `Workflow · yhwh ${name}`, () => this.workflow(name))),
      command('quit','Quit · Ctrl+Q', () => this.quit()),
    ];
  }
}
module.exports = { Interface, pasteInput };
