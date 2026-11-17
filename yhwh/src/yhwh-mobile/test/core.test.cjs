const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createVerseLibrary } = require('../../../lib/verse-library.cjs');
const defaults = require('../../../etc/default/defaults.json');
const words = require('../../../etc/default/words.json');
const modulePromise = import('../src/bridge.mjs');
function memoryStorage() {
  const files = new Map([['/YHWH', { directory: true, modified: 1, size: 0 }]]), state = new Map();
  return {
    files, state, init: async () => {},
    stat: async path => files.get(path) || null,
    list: async path => [...files].filter(([name]) => name.startsWith(path + '/') && !name.slice(path.length+1).includes('/')).map(([name, stat]) => ({ ...stat, name: name.split('/').at(-1), path: name })),
    read: async path => { if (!files.has(path)) throw new Error('ENOENT'); return files.get(path).bytes; },
    write: async (path, bytes) => { files.set(path, { bytes, size: bytes.length, directory: false, modified: 1 }); },
    mkdir: async path => files.set(path, { directory: true, modified: 1, size: 0 }),
    move: async (source, target) => { for (const [name, value] of [...files]) if (name === source || name.startsWith(source + '/')) { files.set(target + name.slice(source.length), value); files.delete(name); } },
    copy: async (source, target) => { for (const [name, value] of [...files]) if (name === source || name.startsWith(source + '/')) files.set(target + name.slice(source.length), structuredClone(value)); },
    loadState: async (name, fallback) => structuredClone(state.get(name) ?? fallback),
    saveState: async (name, value) => state.set(name, structuredClone(value)),
  };
}
async function fixture(storage = memoryStorage()) {
  const { createMobileBridge } = await modulePromise;
  const bridge = createMobileBridge({ storage, defaults, words, platform: 'android', verses: {}, builtinPlugins: [], clipboard: async () => {}, share: async () => {}, external: async () => {}, choose: async () => null });
  await bridge.call('bootstrap'); await bridge.call('focus:new', 'one', '/YHWH');
  return { bridge, storage, call: bridge.call };
}
test('logical paths stay inside the workspace', async () => {
  const { normalize } = await modulePromise;
  assert.equal(normalize('notes/../a.md'), '/YHWH/a.md');
  assert.equal(normalize('/'), '/YHWH');
  for (const value of ['../outside', '/YHWH/../../private', '/private', '/YHWH-else/a', 'a\0b', 'a\\b']) assert.throws(() => normalize(value));
});
test('files preserve UTF-8 and CRLF and reject conflicting changes even at the same timestamp', async () => {
  const { storage, call } = await fixture();
  await storage.write('/YHWH/note.md', new TextEncoder().encode('שלום\r\nhello\r\n'));
  const original = await call('file:read', '/YHWH/note.md');
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
    await storage.write('/YHWH/' + name, new Uint8Array(bytes)); assert.equal((await call('file:read', '/YHWH/' + name)).kind, 'binary');
  }
  storage.files.set('/YHWH/huge.txt', { size: 17000000, modified: 1 });
  assert.equal((await call('file:read', '/YHWH/huge.txt')).kind, 'binary');
});
test('mobile attachments delegate without reading media/workbooks; only PDF retains its preview', async () => {
  const { storage, call } = await fixture();
  for (const name of ['picture.svg', 'table.csv', 'table.tsv', 'book.xlsx', 'movie.mp4', 'sound.wav']) {
    await storage.write('/YHWH/' + name, new TextEncoder().encode('Attachment bytes'));
    const file = await call('file:read', '/YHWH/' + name);
    assert.equal(file.kind, 'binary', name); assert.equal(file.bytes, undefined, name); assert.equal(file.content, undefined, name);
  }
  await storage.write('/YHWH/preview.pdf', new TextEncoder().encode('%PDF-1.4\n'));
  assert.equal((await call('file:read', '/YHWH/preview.pdf')).kind, 'pdf');
});
test('create is exclusive under concurrent calls and failed writes do not block later operations', async () => {
  const { call } = await fixture();
  const results = await Promise.allSettled([call('file:create', '/YHWH/a'), call('file:create', '/YHWH/a')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  await call('file:create', '/YHWH/b');
  await assert.rejects(call('file:move', '/YHWH/a', '/YHWH/b'), /already exists/);
  await call('file:move', '/YHWH/a', '/YHWH/c');
});
test('trash is recoverable and directory self-moves/copies are rejected', async () => {
  const { call, storage } = await fixture();
  await call('file:create', '/YHWH/folder', true); await call('file:create', '/YHWH/folder/a');
  await assert.rejects(call('file:move', '/YHWH/folder', '/YHWH/folder/child'), /itself/);
  await assert.rejects(call('file:copy', '/YHWH/folder', '/YHWH/folder/child'), /itself/);
  await call('file:trash', '/YHWH/folder');
  assert.equal(await storage.stat('/YHWH/folder'), null);
  const items = await storage.list('/YHWH/.Trash'); assert.equal(items.length, 1);
  await call('file:move', items[0].path, '/YHWH/restored'); assert.ok(await storage.stat('/YHWH/restored/a'));
});
test('directory-scoped settings and character overrides survive relaunch and preserve global defaults', async () => {
  const { call, storage } = await fixture();
  await call('file:create', '/YHWH/notes', true);
  await call('settings:save', { font_size: '20' }); await call('settings:save', { font_size: '24' }, '/YHWH/notes');
  await call('words:save', { welcomeTitle: 'On a phone' });
  const { call: reopened } = await fixture(storage);
  assert.equal((await reopened('bootstrap')).words.welcomeTitle, 'On a phone');
  assert.equal((await reopened('navigate', 'one', '/YHWH/notes')).config.values.font_size, '24');
  assert.equal((await reopened('navigate', 'one', '/YHWH')).config.values.font_size, '20');
});
test('unsupported platform services and future unknown operations fail explicitly', async () => {
  const { call } = await fixture();
  for (const operation of ['chat', 'world:books', 'config:open', 'a-new-desktop-feature']) await assert.rejects(call(operation), /desktop|mobile/i);
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
  await call('file:create', '/YHWH/project', true);
  await call('file:create', '/YHWH/project/child', true);
  await call('focus:new', 'two', '/YHWH');
  const world = await call('world:enter', 'one', '/YHWH/project');
  assert.equal(world.worldRoot, '/YHWH/project');
  assert.equal((await call('navigate', 'one', '/YHWH')).cwd, '/YHWH/project');
  assert.equal((await call('navigate', 'one', '/YHWH/project/child')).cwd, '/YHWH/project/child');
  assert.equal((await call('list', 'two')).cwd, '/YHWH');
  assert.equal((await call('world:leave', 'one')).cwd, '/YHWH');
  assert.equal((await call('list', 'one')).worldRoot, null);
  assert.equal((await call('world:enter', 'one', 'yhwh')).worldName, 'yhwh');
});
