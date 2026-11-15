const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
const files = require('../../lib/files.cjs');
const config = require('../yhwh-default/app/config.cjs');
const worlds = require('../yhwh-default/app/worlds.cjs');

// Cursor offsets are Unicode code points; saving preserves the original newline.
class Document {
  constructor(file = { content: '', newline: '\n' }) {
    this.file = file; this.text = file.content; this.saved = file.content;
    this.cursor = 0; this.top = 0; this.left = 0; this.undo = []; this.redo = [];
  }
  get dirty() { return this.text !== this.saved; }
  get points() { return Array.from(this.text); }
  get position() {
    const before = this.points.slice(0, this.cursor).join('').split('\n');
    return { row: before.length - 1, column: Array.from(before.at(-1)).length };
  }
  snapshot() { return { text: this.text, cursor: this.cursor }; }
  restore(state) { this.text = state.text; this.cursor = state.cursor; }
  replace(start, end, value) {
    this.undo.push(this.snapshot()); if (this.undo.length > 200) this.undo.shift(); this.redo = [];
    const points = this.points; points.splice(start, end - start, ...Array.from(value));
    this.text = points.join(''); this.cursor = start + Array.from(value).length;
  }
  insert(value) { this.replace(this.cursor, this.cursor, value.replace(/\r\n?/g, '\n')); }
  backspace() { if (this.cursor) this.replace(this.cursor - 1, this.cursor, ''); }
  delete() { if (this.cursor < this.points.length) this.replace(this.cursor, this.cursor + 1, ''); }
  move(rows = 0, columns = 0) {
    if (!rows) { this.cursor = Math.max(0, Math.min(this.points.length, this.cursor + columns)); return; }
    const position = this.position, lines = this.text.split('\n');
    const row = Math.max(0, Math.min(lines.length - 1, position.row + rows));
    this.cursor = lines.slice(0, row).reduce((total, line) => total + Array.from(line).length + 1, 0) + Math.min(position.column, Array.from(lines[row]).length);
  }
  edge(end) { const p = this.position, line = this.text.split('\n')[p.row]; this.cursor += end ? Array.from(line).length - p.column : -p.column; }
  history(back = true) {
    const source = back ? this.undo : this.redo, target = back ? this.redo : this.undo;
    if (source.length) { target.push(this.snapshot()); this.restore(source.pop()); }
  }
  find(needle) {
    const offset = this.points.slice(0, this.cursor + 1).join('').length;
    let index = this.text.toLowerCase().indexOf(needle.toLowerCase(), offset);
    if (index < 0) index = this.text.toLowerCase().indexOf(needle.toLowerCase());
    if (index >= 0) this.cursor = Array.from(this.text.slice(0, index)).length;
    return index >= 0;
  }
}

class Workspace extends EventEmitter {
  constructor({ stateDirectory } = {}) {
    super();
    this.stateDirectory = stateDirectory || process.env.YHWH_TTY_DATA_DIR || path.join(config.userDirectory(), 'state-tty');
    this.stateFile = path.join(this.stateDirectory, 'session.json');
    this.state = { words: {}, chats: {}, letters: [], steps: [], walk: false };
    this.writing = Promise.resolve(); this.tabs = []; this.index = 0;
    this.words = { ...require('../../etc/tty/words.json') };
    this.verses = require('../../lib/verses.cjs').createVerseStore({ stateDirectory: this.stateDirectory });
  }
  async init() {
    try { Object.assign(this.state, JSON.parse(await fs.readFile(this.stateFile, 'utf8'))); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error(`Cannot read terminal state: ${error.message}`); }
    Object.assign(this.words, this.state.words);
  }
  persist() {
    const data = JSON.stringify(this.state, null, 2) + '\n';
    const operation = this.writing.then(async () => {
      await fs.mkdir(this.stateDirectory, { recursive: true, mode: 0o700 });
      const temp = this.stateFile + '.tmp';
      await fs.writeFile(temp, data, { mode: 0o600 }); await fs.rename(temp, this.stateFile);
    });
    this.writing = operation.catch(() => {}); return operation;
  }
  get active() { return this.tabs[this.index]; }
  async newTab(target = this.active?.cwd || process.cwd()) {
    target = path.resolve(target);
    const stat = await fs.stat(target), cwd = stat.isDirectory() ? target : path.dirname(target);
    const tab = { id: randomUUID(), cwd, entries: [], selected: new Set(), history: [cwd], historyIndex: 0, filter: '', document: null, mode: 'source', showFiles: true, showTerminal: false };
    this.tabs.push(tab); this.index = this.tabs.length - 1;
    await this.refresh(tab);
    tab.showFiles = tab.config.values.file_manager !== 'false'; tab.showTerminal = tab.config.values.terminal === 'true';
    if (!stat.isDirectory()) await this.open(target, tab);
    this.emit('tab', tab); return tab;
  }
  async refresh(tab = this.active) {
    tab.config = await config.resolveConfig(tab.cwd);
    tab.entries = await worlds.list(tab, tab.config.values.show_hidden === 'true');
    this.emit('change', tab);
  }
  async navigate(target, tab = this.active, { fromShell = false, history = true } = {}) {
    const destination = worlds.directory(tab, target);
    if (!(await fs.stat(await worlds.physical(tab, destination))).isDirectory()) throw new Error('Choose a directory.');
    tab.cwd = destination; tab.filter = ''; tab.selected.clear();
    if (history && tab.history[tab.historyIndex] !== destination) { tab.history.splice(++tab.historyIndex); tab.history.push(destination); }
    await this.refresh(tab);
    if (!fromShell) this.emit('navigate', tab);
    await this.work('seed', 'navigate');
  }
  async goBack(delta) {
    const tab = this.active, index = tab.historyIndex + delta;
    if (index < 0 || index >= tab.history.length) return;
    await this.navigate(tab.history[index], tab, { history: false }); tab.historyIndex = index;
  }
  async open(filename, tab = this.active) {
    const file = await files.read(filename, (await config.resolveConfig(filename)).values);
    if (file.kind !== 'text') return file;
    file.content = file.content.replace(/\r\n/g, '\n');
    tab.document = new Document(file); tab.mode = file.language === 'markdown' ? 'hybrid' : 'source';
    this.emit('change', tab); await this.work('house', 'open'); return file;
  }
  async save(tab = this.active, { filename, force = false } = {}) {
    const doc = tab.document; if (!doc) return;
    const destination = filename ? path.resolve(tab.cwd, filename) : doc.file.path;
    if (!destination) throw new Error('Choose a filename with Save as.');
    if (filename && destination !== doc.file.path) {
      await fs.lstat(destination).then(() => { throw new Error('A file with that name already exists.'); }, error => { if (error.code !== 'ENOENT') throw error; });
    }
    const content = doc.text.replace(/\n/g, doc.file.newline || '\n');
    const result = await files.save(destination, content, destination === doc.file.path ? doc.file.modified : null, force);
    doc.file = { ...doc.file, path: destination, name: path.basename(destination), modified: result.modified }; doc.saved = doc.text;
    await this.refresh(tab); await this.work('bread', 'save');
  }
  async enterWorld(name) {
    const tab = this.active; tab.returnDirectory ||= tab.cwd; tab.worldRoot = await worlds.enter(name);
    await this.navigate(tab.worldRoot); await this.work('offering', 'world');
  }
  async leaveWorld() {
    const tab = this.active, target = tab.returnDirectory || os.homedir();
    tab.worldRoot = null; tab.returnDirectory = null; await this.navigate(target);
  }
  async setWord(key, value) { this.words[key] = value; this.state.words[key] = value; await this.persist(); this.emit('change'); }
  async settings(values, scope = this.active.cwd) { await config.saveSettings(values, scope); await this.refresh(); }
  conversation(cwd = this.active.cwd) { return this.state.chats[cwd] ||= { messages: [], draft: '' }; }
  async chat(tab = this.active) {
    const directory = await worlds.physical(tab), log = this.conversation(directory), draft = log.draft.trim();
    if (!draft) throw new Error('Write a message first.');
    const conversation = [...log.messages, { role: 'user', content: draft }].slice(-79);
    // Keep the draft and history untouched until a real backend answer arrives.
    await this.persist();
    const answer = await require('../yhwh-default/app/chat.cjs').chat({ directory, energy: Number(tab.config.values.energy), messages: conversation });
    log.messages = [...conversation, { role: 'assistant', content: answer }];
    if (log.draft.trim() === draft) log.draft = '';
    await this.persist(); return answer;
  }
  async work(id, step) {
    const values = this.active?.config.values || {};
    if ((this.state.walk || values.narrative === 'true') && !this.state.steps.includes(step)) this.state.steps.push(step);
    if (values.inbox !== 'false' && Number(values.energy) > 0 && !this.state.letters.some(letter => letter.id === id) && (!this.state.lastLetter || Date.now() - this.state.lastLetter >= 300000)) {
      this.state.letters.push({ id, read: false }); this.state.lastLetter = Date.now();
    }
    await this.persist();
  }
}
module.exports = { Document, Workspace };
