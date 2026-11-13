const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const { resolveConfig, saveSettings, quote } = require('../app/config.cjs');
const files = require('../../../lib/files.cjs');
const root = path.resolve(__dirname, '..');
async function fixture(t) { const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yhwh-test-')); t.after(() => fs.rm(directory, { recursive: true, force: true })); return directory; }
async function rc(directory, text) { await fs.mkdir(directory, { recursive: true }); await fs.writeFile(path.join(directory, 'rc'), text, { mode: 0o600 }); }

 test('missing configuration is ordinary; browsing creates no directory metadata', async t => {
  const base = await fixture(t), directory = path.join(base, 'files'); await fs.mkdir(directory);
  const config = await resolveConfig(directory, { system: path.join(base, 'system'), user: path.join(base, 'user') });
  assert.equal(config.values.theme, 'yhwh'); assert.deepEqual(config.warnings, []);
  assert.deepEqual(await fs.readdir(directory), []);
 });
 test('system → user → ancestor → child configuration; scopes match complete path components', async t => {
  const base = await fixture(t), system = path.join(base, 'system'), user = path.join(base, 'user'), folder = path.join(base, 'work'), child = path.join(folder, 'notes');
  await fs.mkdir(child, { recursive: true });
  await rc(system, `/\n    title='system'\n${folder}\n    font_size=18\n`);
  await rc(user, `/\n    title='user'\n${folder}-other\n    font_size=99\n`);
  await rc(path.join(folder, '.yhwh'), `.\n    title='ancestor'\nnotes\n    theme=nietzsche\n    bg='notes/boop.png'\n`);
  await rc(path.join(child, '.yhwh'), `.\n    title='child'\n`);
  const config = await resolveConfig(path.join(child, 'uncreated.md'), { system, user });
  assert.deepEqual(config.warnings, []);
  assert.equal(config.values.title, 'child'); assert.equal(config.values.font_size, '18'); assert.equal(config.values.theme, 'nietzsche');
  assert.equal(config.values.bg, path.join(folder, 'notes/boop.png'));
 });
 test('shell expansion, command substitution, comments, arbitrary commands, and relative assets use the config base', async t => {
  const base = await fixture(t), user = path.join(base, 'config'), target = path.join(base, 'some directory'); await fs.mkdir(target);
  await rc(user, `$YHWH_TEST_TARGET\n    title="hello $YHWH_TEST_NAME" # normal shell comment\n    bg="$(printf 'wallpaper.png')"\n    printf 'stdout is not a setting'\n    printf done > shell-command-ran\n`);
  const config = await resolveConfig(target, { system: path.join(base, 'missing'), user, env: { YHWH_TEST_TARGET: target, YHWH_TEST_NAME: 'Abe' } });
  assert.deepEqual(config.warnings, []); assert.equal(config.values.title, 'hello Abe'); assert.equal(config.values.bg, path.join(user, 'wallpaper.png'));
  assert.equal(await fs.readFile(path.join(user, 'shell-command-ran'), 'utf8'), 'done');
 });
 test('more specific scopes win within one rc, regardless of where its root section is written', async t => {
  const base = await fixture(t), user = path.join(base, 'config');
  await rc(user, `${base}\n    title=specific\n/\n    title=general\n`);
  const config = await resolveConfig(base, { system: path.join(base, 'missing'), user });
  assert.equal(config.values.title, 'specific');
 });
 test('a local identical relative value still has a new origin; mangled setting names win', async t => {
  const base = await fixture(t), user = path.join(base, 'config'), target = path.join(base, 'notes'); await fs.mkdir(target);
  await rc(user, `/\n    bg='same.png'\n`);
  await rc(path.join(target, '.yhwh'), `.\n    bg='same.png'\n    title=ordinary\n    yhwh_title=mangled\n`);
  const config = await resolveConfig(target, { system: path.join(base, 'missing'), user });
  assert.equal(config.values.bg, path.join(target, 'same.png')); assert.equal(config.values.title, 'mangled');
 });
 test('unsafe permissions and failing shell code produce actionable warnings', async t => {
  const base = await fixture(t), user = path.join(base, 'config');
  await rc(user, `/\n    false\n`);
  let config = await resolveConfig(base, { system: path.join(base, 'missing'), user }); assert.match(config.warnings[0], /exited 1/);
  if (process.getuid) { await fs.chmod(path.join(user, 'rc'), 0o666); config = await resolveConfig(base, { system: path.join(base, 'missing'), user }); assert.match(config.warnings[0], /not writable/); }
 });
 test('GUI settings save literal path names and quoted text, never shell source from a filename', async t => {
  const base = await fixture(t), user = path.join(base, 'config'), target = path.join(base, 'literal $name $(printf surprise)');
  await fs.mkdir(target);
  const previous = process.env.YHWH_CONFIG_HOME; process.env.YHWH_CONFIG_HOME = user;
  try { await saveSettings({ title: "Abe's directory" }, target); }
  finally { if (previous === undefined) delete process.env.YHWH_CONFIG_HOME; else process.env.YHWH_CONFIG_HOME = previous; }
  const config = await resolveConfig(target, { system: path.join(base, 'missing'), user });
  assert.deepEqual(config.warnings, []); assert.equal(config.values.title, "Abe's directory");
 });
 test('extensionless files follow desktop MIME detection or their shebang; language overrides are declarative', async t => {
  const base = await fixture(t), plain = path.join(base, 'boop'), script = path.join(base, 'executable');
  await fs.writeFile(plain, 'hello there\n'); await fs.writeFile(script, '#!/usr/bin/env python3\nprint("hi")\n');
  assert.equal((await files.read(plain)).language, 'plain'); assert.equal((await files.read(script)).language, 'python');
  assert.equal((await files.read(plain, { file_types: '[{"filename":"^boop$","language":"markdown"}]' })).language, 'markdown');
  for (const [name, language] of [['notes.tex', 'latex'], ['app.swift', 'swift'], ['app.rs', 'rust']]) { const filename = path.join(base, name); await fs.writeFile(filename, ''); assert.equal((await files.read(filename)).language, language); }
 });
 test('text saves preserve symlinks; conflicts and filename collisions preserve the existing data', async t => {
  const base = await fixture(t), filename = path.join(base, 'one'), alias = path.join(base, 'alias'), other = path.join(base, 'two');
  await files.create(filename); await fs.symlink(filename, alias); await fs.writeFile(other, 'other');
  const original = await files.read(alias); await files.save(alias, 'first', original.modified);
  assert.equal((await fs.lstat(alias)).isSymbolicLink(), true); assert.equal(await fs.readFile(filename, 'utf8'), 'first');
  await assert.rejects(files.save(alias, 'bad', original.modified - 100), /changed on disk/);
  await assert.rejects(files.move(filename, other), /already exists/);
  assert.equal(await fs.readFile(other, 'utf8'), 'other');
  await fs.unlink(other);
  await assert.rejects(files.save(other, 'unexpected resurrection', 1), /removed from disk/);
 });
 test('binary files are never decoded as editable text; newly created files have no imposed extension', async t => {
  const base = await fixture(t), binary = path.join(base, 'binary'), plain = path.join(base, 'boop');
  await fs.writeFile(binary, Buffer.from([0, 1, 2, 3])); await files.create(plain);
  assert.equal((await files.read(binary)).kind, 'binary'); assert.equal((await files.read(plain)).kind, 'text');
  assert.deepEqual((await fs.readdir(base)).sort(), ['binary', 'boop']);
 });
 test('CLI shares file operations, accepts Obsidian-style args, and dispatches adjacent executables', async t => {
  const base = await fixture(t), bin = path.join(base, 'bin'); await fs.mkdir(bin);
  const filename = path.join(base, 'boop');
  const cli = async args => (await exec(process.execPath, [path.join(root, '../../bin/default/cli.cjs'), ...args], { cwd: base, env: { ...process.env, YHWH_BIN: bin } })).stdout;
  await cli(['create', `path=${filename}`, 'content=hello']); await cli(['append', filename, ' world']);
  assert.equal(await cli(['read', filename]), 'hello world');
  await fs.writeFile(path.join(bin, 'yhwh-three'), '#!/bin/sh\nprintf "three:%s" "$1"\n', { mode: 0o755 });
  assert.equal(await cli(['three', 'works']), 'three:works'); assert.match(await cli(['commands']), /^three$/m);
 });
 test('Bash completion discovers the same adjacent yhwh-* commands', async t => {
  const base = await fixture(t), bin = path.join(base, 'bin'); await fs.mkdir(bin);
  await fs.writeFile(path.join(bin, 'yhwh'), '#!/bin/sh\nexec node '+quote(path.join(root, '../../bin/yhwh'))+' \"$@\"\n', { mode: 0o755 });
  await fs.writeFile(path.join(bin, 'yhwh-three'), '#!/bin/sh\n', { mode: 0o755 });
  const output = await exec('bash', ['--noprofile', '--norc', '-c', `source ${quote(path.join(root, '../../etc/completions/yhwh.bash'))}\nCOMP_WORDS=(yhwh thr); COMP_CWORD=1; _yhwh_complete; printf '%s\\n' "\${COMPREPLY[@]}"`], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
  assert.match(output.stdout, /^three$/m);
 });
 test('real shell cd and file-manager cd share cwd; navigation waits for a foreground command', { timeout: 12000 }, async t => {
  const base = await fixture(t), other = path.join(base, "quoted ' %20 # directory"); await fs.mkdir(other);
  const child = spawn(process.execPath, [path.join(root, '../../bin/default/terminal-host.cjs')], { env: { ...process.env, YHWH_SHELL: '/bin/bash', YHWH_NO_SHELL_RC: '1', HISTFILE: '/dev/null' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  t.after(() => { if (child.connected) child.disconnect(); });
  const messages = []; let stderr = ''; child.stderr.on('data', data => stderr += data); child.on('message', message => messages.push(message));
  async function until(predicate) { for (let i = 0; i < 150; i++) { if (predicate()) return; if (child.exitCode !== null) throw new Error(stderr || 'Shell host exited'); await new Promise(resolve => setTimeout(resolve, 40)); } throw new Error('Timed out waiting for shell event'); }
  child.send({ type: 'start', id: 'one', cwd: base });
  await until(() => messages.some(message => message.data?.includes('133;A')));
  child.send({ type: 'write', id: 'one', data: `cd -- ${quote(other)}\r` });
  await until(() => messages.some(message => message.type === 'cwd' && message.cwd === other));
  messages.length = 0;
  child.send({ type: 'write', id: 'one', data: 'sleep 0.4; printf "finished\\n"\r' });
  child.send({ type: 'cd', id: 'one', cwd: base });
  await until(() => messages.some(message => message.type === 'cwd' && message.cwd === base));
  assert.equal(messages.some(message => message.data?.includes('finished')), true);
  assert.equal(messages.some(message => message.type === 'error'), false);
 });
