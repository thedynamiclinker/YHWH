const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const { Document, Workspace } = require('../model.cjs');
const { Interface, pasteInput } = require('../app.cjs');

test('expanded shell retains file columns and sends one consistent terminal size', () => {
  const sizes = [];
  const app = { screen: { width: 120, height: 40 }, tab: { id: 'one', showFiles: true, showTerminal: true, expanded: 'terminal' }, parent: {}, list: {}, preview: {}, terminal: {}, shells: { resize: (...args) => sizes.push(args) } };
  Interface.prototype.layout.call(app);
  assert.equal(app.parent.hidden, false); assert.equal(app.list.hidden, false);
  assert.equal(app.list.height, 36); assert.equal(app.terminal.top, 2);
  assert.ok(app.terminal.left > 0); assert.equal(sizes.length, 1);
});

test('Ctrl+E reaches a focused shell without toggling files', async () => {
  const writes = [];
  const app = { tab: { id: 'one', showFiles: true, config: { keys: { bindings: [] } } }, focus: 'terminal', shells: { sessions: new Map(), write: (...args) => writes.push(args) } };
  await Interface.prototype.key.call(app, '', { full: 'C-e', name: 'e', sequence: '\x05' });
  assert.deepEqual(writes, [['one', '\x05']]); assert.equal(app.tab.showFiles, true);
});

test('closing the final tab delegates its unsaved decision to quit once', async () => {
  let decisions = 0;
  const app = {
    workspace: { tabs: [{}] },
    guard: async () => { decisions++; return true; },
    quit: async () => { await app.guard(); },
  };
  await Interface.prototype.closeTab.call(app);
  assert.equal(decisions, 1);
});

test('terminal emulation renders colors and alternate screens without forwarding OSC', async () => {
  const { Terminal } = require('@xterm/headless');
  const { terminalLines } = require('../terminal.cjs');
  const term = new Terminal({ cols: 30, rows: 4, allowProposedApi: true });
  await new Promise(resolve => term.write('normal\x1b[?1049h\x1b[31mred\x1b]0;untrusted title\x07', resolve));
  const output = terminalLines({ term, scroll: 0 });
  assert.match(output, /red/);
  assert.match(output, /38;5;1/);
  assert.equal(output.includes('untrusted title'), false);
  await new Promise(resolve => term.write('\x1b[?1049l', resolve));
  assert.match(terminalLines({ term, scroll: 0 }), /normal/);
  term.dispose();
});

test('Unicode editing, atomic multiline undo and newline normalization', () => {
  const doc = new Document();
  doc.insert('a🌋\r\nb');
  assert.equal(doc.text, 'a🌋\nb');
  doc.move(-1);
  assert.deepEqual(doc.position, { row: 0, column: 1 });
  doc.delete();
  assert.equal(doc.text, 'a\nb');
  doc.history();
  assert.equal(doc.text, 'a🌋\nb');
  doc.history();
  assert.equal(doc.text, '');
  doc.history(false);
  assert.equal(doc.text, 'a🌋\nb');
});

test('split bracketed paste never dispatches shortcuts', async () => {
  const source = new PassThrough(), pasted = [], keys = [];
  const input = pasteInput(source, text => pasted.push(text));
  input.on('data', data => keys.push(String(data)));
  source.write('j\x1b[20');
  source.write('0~hello\n\x11\x03');
  source.write('\x1b[201');
  source.write('~k');
  assert.deepEqual(pasted, ['hello\n\x11\x03']);
  assert.equal(keys.join(''), 'jk');
  source.unpipe(input); input.destroy(); source.destroy();
});

test('definition persists and documents use shared conflict protection', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shaddai-model-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const stateDirectory = path.join(directory, 'state');
  const workspace = new Workspace({ stateDirectory });
  await workspace.init();
  assert.equal(workspace.words.name, 'el shaddai');
  assert.equal(workspace.words.shaddai, 'Nobody knows. Maybe mountains or ttys.');
  await workspace.setWord('shaddai', 'My definition');
  const restored = new Workspace({ stateDirectory }); await restored.init();
  assert.equal(restored.words.shaddai, 'My definition');
  const filename = path.join(directory, 'example.txt');
  await fs.writeFile(filename, 'original\r\n');
  const tab = await workspace.newTab(filename);
  tab.document.insert('edited ');
  await workspace.save(tab);
  assert.equal(await fs.readFile(filename, 'utf8'), 'edited original\r\n');
  await fs.writeFile(filename, 'external change of different length\n');
  tab.document.insert('more ');
  await assert.rejects(workspace.save(tab));
  assert.equal(await fs.readFile(filename, 'utf8'), 'external change of different length\n');
  const other = await workspace.newTab(directory);
  assert.notEqual(other.id, tab.id);
  assert.equal(tab.document.dirty, true);
});

test('real UI starts, handles resize and quits in an isolated PTY', { timeout: 15000 }, async t => {
  const pty = require('node-pty');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shaddai-ui-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(path.join(directory, 'hello.txt'), 'terminal preview\n');
  const terminal = pty.spawn(process.execPath, [path.resolve(__dirname, '../../../bin/yhwh-tty'), directory], {
    cwd: directory, cols: 110, rows: 32, name: 'xterm-256color',
    env: { ...process.env, TERM: 'xterm-256color', YHWH_TTY_SOCKET: '', YHWH_TTY_DATA_DIR: path.join(directory, 'state'), YHWH_SHELL: '/bin/sh' },
  });
  let output = '', quitSent = false;
  const deadline = setTimeout(() => terminal.kill('SIGKILL'), 10000);
  t.after(() => { clearTimeout(deadline); try { terminal.kill('SIGKILL'); } catch {} });
  const exited = new Promise(resolve => terminal.onExit(resolve));
  terminal.onData(data => {
    output += data;
    if (!quitSent && output.includes('hello.txt')) {
      quitSent = true;
      terminal.resize(80, 24);
      terminal.write('\x11');
    }
  });
  const result = await exited;
  assert.equal(quitSent, true, output.slice(-4000));
  assert.equal(result.exitCode, 0, output.slice(-4000));
  assert.match(output, /el shaddai/);
  assert.match(output, /Nobody knows/);
  assert.match(output, /\x1b\[\?2004l/);
});
