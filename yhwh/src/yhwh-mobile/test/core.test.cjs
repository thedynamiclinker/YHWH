const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createVerseLibrary } = require('../../../lib/verse-library.cjs');
const defaults = require('../../../etc/default/defaults.json');
const words = require('../../../etc/default/words.json');
const modulePromise = import('../src/bridge.mjs');
function memoryStorage() {
  const files = new Map([['/', { directory: true, modified: 1, size: 0 }]]), state = new Map();
  return {
    files, state, init: async () => {},
    stat: async path => files.get(path) || null,
    list: async path => [...files].filter(([name]) => name !== path && name.slice(0, name.lastIndexOf('/')) === path.replace(/\/$/, '')).map(([name, stat]) => ({ ...stat, name: name.split('/').at(-1), path: name })),
    read: async path => { if (!files.has(path)) throw new Error('ENOENT'); return files.get(path).bytes; },
    write: async (path, bytes) => { files.set(path, { bytes, size: bytes.length, directory: false, modified: 1 }); },
    mkdir: async path => files.set(path, { directory: true, modified: 1, size: 0 }),
    move: async (source, target) => { for (const [name, value] of [...files]) if (name === source || name.startsWith(source + '/')) { files.set(target + name.slice(source.length), value); files.delete(name); } },
    copy: async (source, target) => { for (const [name, value] of [...files]) if (name === source || name.startsWith(source + '/')) files.set(target + name.slice(source.length), structuredClone(value)); },
    loadState: async (name, fallback) => structuredClone(state.get(name) ?? fallback),
    saveState: async (name, value) => state.set(name, structuredClone(value)),
    loadText: async name => state.get(name) || '',
    appendText: async (name, text) => state.set(name, (state.get(name) || '') + text),
  };
}
async function fixture(storage = memoryStorage()) {
  const { createMobileBridge } = await modulePromise;
  const bridge = createMobileBridge({ storage, defaults, words, platform: 'android', verses: {}, builtinPlugins: [], clipboard: async () => {}, share: async () => {}, external: async () => {}, choose: async () => null });
  await bridge.call('bootstrap'); await bridge.call('focus:new', 'one', '/');
  return { bridge, storage, call: bridge.call };
}
test('logical paths stay inside the workspace', async () => {
  const { normalize } = await modulePromise;
  assert.equal(normalize('notes/../a.md'), '/a.md');
  assert.equal(normalize('/'), '/');
  assert.equal(normalize('../../outside', '/notes'), '/outside');
  for (const value of ['a\0b', 'a\\b']) assert.throws(() => normalize(value));
});
test('Yue remembers both Joshes offline and still answers workspace questions', async () => {
  const { call } = await fixture(), messages = [];
  const ask = async content => {
    messages.push({ role: 'user', content });
    const reply = await call('chat', 'one', { directory: '/' }, messages, [], 140);
    messages.push({ role: 'assistant', content: reply });
    return reply;
  };
  assert.match(await ask('Where was Jesus at Jericho?'), /Josh, remember Jericho.*XP\? IX\?/);
  assert.match(await ask('And Rahab?'), /Rahab.*Josh.*Mary Magdalene/);
  assert.match(await ask('Tell me about the tomb'), /Jericho.*tomb.*remember when we did both/);
  assert.match(await ask('Where am I?'), /You’re in \/, Josh/);
});
test('native app schemes without randomUUID still get valid unique IDs', async t => {
  const { randomUUID } = await import('../../../lib/random-uuid.mjs');
  const getRandomValues = crypto.getRandomValues.bind(crypto);
  t.mock.getter(globalThis, 'crypto', () => ({ getRandomValues }));
  const ids = new Set(Array.from({ length: 8 }, randomUUID));
  assert.equal(ids.size, 8);
  for (const id of ids) assert.match(id, /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/);
});
test('the tab anchor and folder actions use ordinary directories and independent tabs', async () => {
  const { bridge, call, storage } = await fixture();
  await storage.mkdir('/outside repo');
  await call('focus:new', 'two', '/outside repo');
  const changes = [];
  bridge.on('anchor-changed', event => changes.push(event));
  await call('@-set', 'one', '/outside repo');
  await call('@-set', 'two', '/');
  assert.equal(await call('@-get', 'one'), '/outside repo');
  assert.equal(await call('@-get', 'two'), '/');
  assert.equal((await call('list', 'one')).cwd, '/');
  assert.equal((await call('list', 'two')).cwd, '/outside repo');
  assert.deepEqual(await storage.list('/outside repo'), []);
  assert.deepEqual(changes, [{ id: 'one', anchor: '/outside repo' }, { id: 'two', anchor: '/' }]);
  await assert.rejects(call('@-set', 'one', '/missing'), /existing directory/);
  const config = '/.yhwh/etc/folder-menu';
  await storage.mkdir(config);
  await storage.write(`${config}/Greetings.txt`, new TextEncoder().encode('Hello, Abe.'));
  assert.deepEqual(await call('folder-menu:list'), [{ name: 'Greetings.txt', label: 'Greetings' }]);
  assert.deepEqual(await call('folder-menu:run', 'one', 'Greetings.txt'), { stdout: 'Hello, Abe.' });
  await call('focus:close', 'one');
  await assert.rejects(call('@-get', 'one'), /closed/);
});
test('Nu and Cd use the shared starter format inside mobile storage', async () => {
  const { storage, call } = await fixture();
  const root = await call('universe:create', 'one', 'Workshop', 'workshop');
  assert.equal(root, '/Workshop');
  assert.match(new TextDecoder().decode((await storage.stat('/Workshop/.@')).bytes), /^# un root\nhello:/);
  assert.equal(await call('universe:cd', 'one', root), root);
  assert.equal(await call('@-get', 'one'), root);
  const state = await call('list', 'one');
  assert.equal(state.cwd, '/');
  assert.equal(state.systemRoot, '/');
  assert.equal(await call('shell:prefix', 'one', 'bin'), '/Workshop/bin');
  assert.ok((await storage.stat('/Workshop/bin')).directory);
  const profile = await call('shell:prefix', 'one', 'profile');
  assert.equal(profile, '/.yhwh/etc/profile');
  await storage.write(profile, new TextEncoder().encode('yhwh_bin=tools\n'));
  await call('shell:prefix', 'one', 'profile');
  assert.equal((await call('file:read', profile)).content, 'yhwh_bin=tools\n');
  await assert.rejects(call('universe:create', 'one', 'Workshop', 'empty'), /already exists/);
  await assert.rejects(call('universe:create', 'one', '../escape', 'empty'), /without slashes/);
  await assert.rejects(call('universe:create', 'one', 'Alpine', 'alpine'), /Linux/);
  assert.equal(await storage.stat('/Alpine'), null);
  await assert.rejects(call('universe:go', 'guest', 'one', root, {}), /Linux/);
  const plain = await call('universe:create', 'one', 'Plain', 'plain');
  assert.equal(await storage.stat(plain + '/.@'), null);
  assert.equal(await call('universe:cd', 'one', plain), plain);
  assert.equal((await call('universe:go', 'folder-plain', 'one', plain, { mode: 'folder' })).cwd, plain);
  const folder = await call('universe:go', 'folder', 'one', root, { mode: 'folder' });
  assert.equal(folder.worldRoot, root);
  assert.equal(folder.anchor, root);
  assert.equal((await call('navigate', 'folder', '/')).cwd, root);
  assert.equal((await call('list', 'one')).worldRoot, null);
  assert.equal((await call('world:leave', 'folder')).cwd, '/');
});
test('files preserve UTF-8 and CRLF and reject conflicting changes even at the same timestamp', async () => {
  const { storage, call } = await fixture();
  await storage.write('/note.md', new TextEncoder().encode('שלום\r\nhello\r\n'));
  const original = await call('file:read', '/note.md');
  assert.equal(original.language, 'markdown'); assert.equal(original.newline, '\r\n');
  await storage.write(original.path, new TextEncoder().encode('changed on disk'));
  await assert.rejects(call('file:save', original.path, 'my edit', original.modified), /changed/);
  await call('file:save', original.path, original.content, original.modified, true);
  assert.equal((await call('file:read', original.path)).content, original.content);
  storage.files.delete(original.path);
  await assert.rejects(call('file:save', original.path, 'lost', original.modified), /removed/);
});
test('binary, non-UTF8, oversized and PDF documents never become editable text', async () => {
  const { storage, call } = await fixture();
  for (const [name, bytes] of [['binary', [65, 0, 66]], ['bad.txt', [255, 254]], ['document.dat', [0, 66]]]) {
    await storage.write('/' + name, new Uint8Array(bytes)); assert.equal((await call('file:read', '/' + name)).kind, 'binary');
  }
  storage.files.set('/huge.txt', { size: 17000000, modified: 1 });
  assert.equal((await call('file:read', '/huge.txt')).kind, 'binary');
});
test('mobile attachments delegate without reading media/workbooks; only PDF retains its preview', async () => {
  const { storage, call } = await fixture();
  const read = storage.read;
  storage.read = async () => { throw new Error('Attachment data should be left to the native opener.'); };
  for (const name of ['picture.svg', 'table.csv', 'table.tsv', 'book.xlsx', 'movie.mp4', 'sound.wav']) {
    await storage.write('/' + name, new TextEncoder().encode('Attachment bytes'));
    const file = await call('file:read', '/' + name);
    assert.equal(file.kind, 'binary', name); assert.equal(file.content, undefined, name);
  }
  storage.read = read;
  await storage.write('/preview.pdf', new TextEncoder().encode('%PDF-1.4\n'));
  assert.equal((await call('file:read', '/preview.pdf')).kind, 'pdf');
});
test('mobile remembers manual language rules and appends explanations in plain text', async () => {
  const { ruleFile, feedbackFile } = require('../../../lib/editor-language.mjs');
  const { storage, call } = await fixture();
  await storage.write('/script', new TextEncoder().encode('#!/bin/sh\ntrue\n'));
  assert.equal((await call('file:read', '/script')).language, 'shell');
  await Promise.all([
    call('editor:language-feedback', { filename: '/script', mime: 'application/octet-stream', detected: 'shell', selected: 'plain', explanation: 'Read the raw text.\nKeep this line.' }),
    call('editor:language-rule', '/script', 'plain', 'filename'),
  ]);
  assert.match(await storage.loadText(feedbackFile), /\t\/script\tapplication\/octet-stream\tshell\tplain\tRead the raw text\.\\nKeep this line\.\n$/);
  assert.equal(await storage.loadText(ruleFile), 'filename\tscript\tplain\n');
  const { call: reopened } = await fixture(storage);
  assert.equal((await reopened('file:read', '/script')).language, 'plain');
});
test('create is exclusive under concurrent calls and failed writes do not block later operations', async () => {
  const { call } = await fixture();
  const results = await Promise.allSettled([call('file:create', '/a'), call('file:create', '/a')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  await call('file:create', '/b');
  await assert.rejects(call('file:move', '/a', '/b'), /already exists/);
  await call('file:move', '/a', '/c');
});
test('trash is recoverable and directory self-moves/copies are rejected', async () => {
  const { call, storage } = await fixture();
  await call('file:create', '/folder', true); await call('file:create', '/folder/a');
  await assert.rejects(call('file:move', '/folder', '/folder/child'), /itself/);
  await assert.rejects(call('file:copy', '/folder', '/folder/child'), /itself/);
  await call('file:trash', '/folder');
  assert.equal(await storage.stat('/folder'), null);
  const items = await storage.list('/.Trash'); assert.equal(items.length, 1);
  await call('file:move', items[0].path, '/restored'); assert.ok(await storage.stat('/restored/a'));
});
test('directory-scoped settings and character overrides survive relaunch and preserve global defaults', async () => {
  const { call, storage } = await fixture();
  await call('file:create', '/notes', true);
  await call('settings:save', { font_size: '20' }); await call('settings:save', { font_size: '24' }, '/notes');
  await call('words:save', { welcomeTitle: 'On a phone' });
  const { call: reopened } = await fixture(storage);
  assert.equal((await reopened('bootstrap')).words.welcomeTitle, 'On a phone');
  assert.equal((await reopened('navigate', 'one', '/notes')).config.values.font_size, '24');
  assert.equal((await reopened('navigate', 'one', '/')).config.values.font_size, '20');
});
test('unsupported platform services and future unknown operations fail explicitly', async () => {
  const { call } = await fixture();
  for (const operation of ['world:books', 'config:open', 'a-new-desktop-feature']) await assert.rejects(call(operation), /desktop|mobile/i);
  await assert.rejects(call('shell:covenant'), /Unix terminal with system sudo/);
  await assert.rejects(call('external', 'javascript:alert(1)'), /Unsupported/);
});
test('every shared desktop bridge operation has an explicit mobile implementation or limitation', async () => {
  const { bridge } = await fixture();
  for (const channel of require('../../../lib/bridge-contract.cjs').callChannels) assert.ok(bridge.supports(channel), `${channel}: add mobile support or document a platform limitation`);
});
test('shared verse model persists commentary and resolves combined and split verse numbers', async () => {
  const filename = path.resolve(__dirname, '../../../etc/verses/we-the-nameless.json');
  const data = JSON.parse(await fs.readFile(filename, 'utf8')); let saved = {};
  const options = { loadData: async () => data, loadEdits: async () => saved, persistEdits: async edits => { saved = edits; } };
  const store = createVerseLibrary(options);
  assert.equal((await store.get('Genesis 2:7'))[0].verse, '6-7');
  assert.equal((await store.get('Genesis 49:24')).length, 2);
  const verse = (await store.get('Genesis 18:1'))[0]; await store.saveCommentary(verse.id, 'Mobile note');
  assert.equal((await createVerseLibrary(options).get(verse.id))[0].commentary, 'Mobile note');
});
test('native sharing and iOS privacy configuration remain present', async () => {
  const config = require('../../../capacitor.config.json'); assert.equal(config.server?.url, undefined);
  const root = path.resolve(__dirname, '..');
  assert.match(await fs.readFile(path.join(root, 'android/app/src/main/res/xml/file_paths.xml'), 'utf8'), /files-path[^>]+YHWH\//);
  assert.match(await fs.readFile(path.join(root, 'ios/App/App/Info.plist'), 'utf8'), /UIFileSharingEnabled/);
  assert.match(await fs.readFile(path.join(root, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8'), /PrivacyInfo.xcprivacy in Resources/);
  assert.match(await fs.readFile(path.join(root, 'ios/App/App/PrivacyInfo.xcprivacy'), 'utf8'), /C617.1/);
  assert.match(await fs.readFile(path.join(root, 'android/app/build.gradle'), 'utf8'), /prepareYhwhWeb/);
  assert.match(await fs.readFile(path.join(root, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8'), /prepare.cjs ios/);
});

test('mobile folder roots constrain navigation per tab and can be left', async () => {
  const { call } = await fixture();
  await call('file:create', '/project', true);
  await call('file:create', '/project/child', true);
  await call('focus:new', 'two', '/');
  const world = await call('world:enter', 'one', '/project');
  assert.equal(world.worldRoot, '/project');
  assert.equal((await call('navigate', 'one', '/')).cwd, '/project');
  assert.equal((await call('navigate', 'one', '/project/child')).cwd, '/project/child');
  assert.equal((await call('list', 'two')).cwd, '/');
  assert.equal((await call('world:leave', 'one')).cwd, '/');
  assert.equal((await call('list', 'one')).worldRoot, null);
  await assert.rejects(call('world:enter', 'one', 'yhwh'), /existing folder/);
  assert.equal((await call('list', 'one')).entries.some(entry => entry.name === 'Worlds'), false);
});

test('mobile startup remembers its default directory and upgrades legacy scoped settings', async () => {
  const storage = memoryStorage();
  await storage.mkdir('/notes');
  await storage.saveState('settings', { '/': { font_size: '20' }, '/YHWH/notes': { font_size: '24' } });
  const { call } = await fixture(storage);
  assert.equal((await call('list', 'one')).config.values.font_size, '20');
  await call('settings:save', { default_directory: '/notes' });
  const { call: reopened } = await fixture(storage);
  assert.equal((await reopened('bootstrap')).initial.path, '/notes');
  assert.equal((await reopened('navigate', 'one', '/notes')).config.values.font_size, '24');
});
