const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const exec = promisify(require('node:child_process').execFile);
const keys = require('../../../lib/keys.cjs');
const names = require('../../../lib/key-names.cjs');
const { resolveConfig } = require('../app/config.cjs');
async function fixture(t) { const base = await fs.mkdtemp(path.join(os.tmpdir(), 'yhwh-keys-')); t.after(() => fs.rm(base, { recursive: true, force: true })); return base; }
async function write(filename, source, mode = 0o644) { await fs.mkdir(path.dirname(filename), { recursive: true }); await fs.writeFile(filename, source, { mode }); }
test('prefix profiles, nested overrides, reordered modifiers, masks and external edits', async t => {
  const base = await fixture(t), user = path.join(base, 'user'), work = path.join(base, 'work'), nested = path.join(work, 'a/b');
  await fs.mkdir(nested, { recursive: true });
  await write(path.join(user, 'etc/profile'), 'export yhwh_keys_directory=etc/buttons\nexport yhwh_title="Abe owns the machine"\nexport ABE_KEY_ENV=hello\n');
  await write(path.join(user, 'etc/buttons/ctrl/alt/k.js'), "export default api => api.notice('user');\n");
  await write(path.join(work, '.yhwh/etc/buttons/alt/ctrl/k.js'), "export default api => api.notice('local');\n");
  await write(path.join(nested, '.yhwh/etc/buttons/ctrl/b'), '');
  const config = await resolveConfig(nested, { user, system: path.join(base, 'system') });
  assert.equal(config.values.title, 'Abe owns the machine'); assert.equal(config.environment.ABE_KEY_ENV, 'hello');
  assert.equal(JSON.stringify(config).includes('ABE_KEY_ENV'), true); // Explicit profile settings are inspectable; host env is not copied.
  assert.equal(Object.keys(config).includes('environment'), false);
  let result = await keys.load(config);
  assert.match(result.bindings.find(item => item.combo === 'ctrl/alt/k').source, /local/);
  assert.equal(result.bindings.find(item => item.combo === 'ctrl/b').kind, 'disabled');
  await write(path.join(work, '.yhwh/etc/buttons/alt/ctrl/k.js'), "export default api => api.notice('changed');\n");
  result = await keys.load(config); assert.match(result.bindings.find(item => item.combo === 'ctrl/alt/k').source, /changed/);
  assert.deepEqual(keys.namespace(result.bindings, 'cd alt/ctrl').bindings, keys.namespace(result.bindings, 'cd ctrl/alt').bindings);
  assert.equal(result.warnings.length, 0);
});
test('executable bits win over suffixes; symlinks execute with stdin, stdout, environment and cwd', async t => {
  const base = await fixture(t), directory = path.join(base, 'keys'), executable = path.join(base, 'custom.sh');
  await write(executable, '#!/bin/sh\nprintf "%s:%s:" "$ABE_KEY_ENV" "$PWD"\ncat\n', 0o755);
  await fs.mkdir(path.join(directory, 'ctrl'), { recursive: true }); await fs.symlink(executable, path.join(directory, 'ctrl/k.js'));
  await write(path.join(directory, 'ctrl/p.py'), 'print("requires an interpreter host")\n');
  await fs.symlink(directory, path.join(directory, 'loop'));
  const result = await keys.scan(directory); assert.equal(result.find(item => item.combo === 'ctrl/k').kind, 'exec'); assert.equal(result.find(item => item.combo === 'ctrl/p').kind, 'unsupported');
  await write(path.join(directory, 'ctrl/k'), '#!/bin/sh\nprintf extensionless\n', 0o755);
  await write(path.join(directory, 'ctrl/b.js'), "export default api => api.notice('module');\n");
  await write(path.join(directory, 'ctrl/b'), '');
  const layered = await keys.load({ prefixes: [base], values: { keys_directory: 'keys' } });
  assert.equal(layered.bindings.find(item => item.combo === 'ctrl/b').kind, 'disabled');
  const output = await keys.program(path.join(directory, 'ctrl/k.js'), [], { cwd: base, env: { ...process.env, ABE_KEY_ENV: 'hi' }, input: 'selected\tfile\n' });
  assert.equal(output.stdout, `hi:${base}:selected\tfile\n`); assert.equal(output.code, 0);
  const failed = await keys.program('/bin/sh', ['-c', 'echo message >&2; exit 7'], { cwd: base, env: process.env }); assert.equal(failed.code, 7); assert.match(failed.stderr, /message/);
});
test('line listings support filters, regexes, pipelines and namespace browsing', async t => {
  const base = await fixture(t), bindings = await keys.scan(keys.defaults);
  assert.equal(bindings.some(item => item.combo === 'ctrl/e'), false);
  assert.ok(names.filter(bindings, 'ctrl').length > 20); assert.ok(names.filter(bindings, '/ctrl.*shift/').length > 4);
  assert.ok(names.filter(bindings, 'ctrl/*/k').some(item => item.command === 'hotkeys'));
  const result = await keys.program('/bin/sh', ['-c', 'grep ctrl | grep -v alt'], { cwd: base, env: process.env, input: names.listing(bindings) });
  assert.match(result.stdout, /ctrl\/t\tjs\tnew-tab/); assert.doesNotMatch(result.stdout, /ctrl\/alt/);
  const output = names.listing(keys.namespace(bindings, 'cd alt/ctrl').bindings);
  assert.match(output, /ctrl\/alt\/shift\/k/); assert.doesNotMatch(output, /ctrl\/t\t/);
});
test('profile paths and completions are sourced by Bash using ordinary prefixes', async t => {
  const base = await fixture(t), user = path.join(base, 'user');
  await write(path.join(user, 'etc/profile'), 'export yhwh_bashrc_file=etc/interactive\nexport yhwh_completions_directory=lib/complete\n');
  await write(path.join(user, 'etc/interactive'), 'export ABE_INTERACTIVE=yes\n');
  await write(path.join(user, 'lib/complete/abe'), 'abe_complete() { printf works; }\n');
  const result = await exec('bash', ['--noprofile', '--norc', '-c', 'eval "$("$YHWH_NODE" "$YHWH_PREFIX_SHELL")"; printf "%s:" "$ABE_INTERACTIVE"; abe_complete'], { cwd: base, env: { ...process.env, YHWH_CONFIG_HOME: user, YHWH_SYSTEM_CONFIG: path.join(base, 'system'), YHWH_NODE: process.execPath, YHWH_PREFIX_SHELL: path.resolve(__dirname, '../../../bin/prefix-shell.cjs') } });
  assert.equal(result.stdout, 'yes:works');
});
test('keyboard names preserve exact modifier combinations and physical digit keys', () => {
  assert.equal(names.canonical('alt/ctrl/shift/k.js'), 'ctrl/alt/shift/k');
  assert.equal(names.fromEvent({ key: 'E', code: 'KeyE', ctrlKey: true, shiftKey: false }), 'ctrl/e');
  assert.equal(names.fromEvent({ key: '!', code: 'Digit1', ctrlKey: true, shiftKey: true }), 'ctrl/shift/1');
  assert.throws(() => names.canonical('../ctrl/k'));
  const clipboard = [{ combo: 'ctrl/c', when: 'files', command: 'files-copy' }];
  assert.equal(names.match(clipboard, 'ctrl/c', 'files').command, 'files-copy');
  assert.equal(names.match(clipboard, 'ctrl/c', 'terminal'), undefined);
  assert.equal(names.match(clipboard, 'ctrl/c'), undefined); // Inputs retain native editing.
});

test('binding editor writes ordinary files, restores inheritance and protects changed/custom sources', async t => {
  const base = await fixture(t), user = path.join(base, 'user'); await fs.mkdir(user);
  const config = { userDirectory: user, prefixes: [user], values: { keys_directory: 'etc/keys' } };
  const find = async combo => (await keys.load(config)).bindings.find(binding => binding.combo === combo) || null;
  await keys.save(config, 'ctrl/alt/j', 'bind', 'new-tab', null, 'files');
  assert.equal((await find('ctrl/alt/j')).when, 'files');
  assert.equal(await fs.readFile(path.join(user, 'etc/keys/ctrl/alt/j.js'), 'utf8'), keys.commandSource('new-tab', 'files'));
  const before = await find('ctrl/alt/j');
  await fs.writeFile(before.filename, keys.commandSource('close-tab', 'files'));
  await assert.rejects(keys.save(config, before.combo, 'bind', 'new-tab', before), /changed on disk/);
  assert.match(await fs.readFile(before.filename, 'utf8'), /close-tab/);
  await keys.save(config, 'ctrl/b', 'disable', 'toggle-terminal', await find('ctrl/b'));
  assert.equal((await find('ctrl/b')).kind, 'disabled');
  await keys.save(config, 'ctrl/b', 'reset', 'toggle-terminal', await find('ctrl/b'));
  assert.equal((await find('ctrl/b')).command, 'toggle-terminal');
  await fs.writeFile(before.filename, "export default api => api.notice('custom');\n");
  await assert.rejects(keys.save(config, before.combo, 'bind', 'new-tab', await find(before.combo)), /custom file/);
});

test('default prefix installation preserves user files and every shipped module calls its documented command', async t => {
  const base = await fixture(t), filename = path.join(base, 'etc/keys/ctrl/b.js');
  await write(filename, 'my own module'); await write(path.join(base, 'etc/profile'), '# my profile\n');
  await keys.seed(base);
  assert.equal(await fs.readFile(filename, 'utf8'), 'my own module');
  assert.equal(await fs.readFile(path.join(base, 'etc/profile'), 'utf8'), '# my profile\n');
  for (const binding of await keys.scan(keys.defaults)) {
    const module = await import(`data:text/javascript;base64,${Buffer.from(binding.source).toString('base64')}`);
    const invoked = []; await module.default({ run: command => invoked.push(command) });
    assert.deepEqual(invoked, [binding.command]);
  }
});

test('retired terminal-tab defaults upgrade without changing customized, executable or symlink bindings', async t => {
  const base = await fixture(t), directory = path.join(base, 'etc/keys');
  const legacy = "// command: new-terminal\nexport default api => api.run('new-terminal');\n";
  await write(path.join(directory, 'ctrl/shift/backtick.js'), legacy);
  await write(path.join(directory, 'ctrl/tab.js'), "export default api => api.notice('custom');\n");
  const executable = "// command: reopen-tab\nexport default api => api.run(api.keyContext === 'terminal' ? 'new-terminal' : 'reopen-tab');\n";
  await write(path.join(directory, 'ctrl/shift/t.js'), executable, 0o755);
  const source = path.join(base, 'linked.js'); await write(source, legacy);
  await fs.symlink(source, path.join(directory, 'ctrl/shift/w.js'));
  await keys.seed(base);
  assert.match(await fs.readFile(path.join(directory, 'ctrl/shift/backtick.js'), 'utf8'), /run\('toggle-terminal'\)/);
  assert.match(await fs.readFile(path.join(directory, 'ctrl/tab.js'), 'utf8'), /notice\('custom'\)/);
  assert.equal(await fs.readFile(path.join(directory, 'ctrl/shift/t.js'), 'utf8'), executable);
  assert.equal((await fs.lstat(path.join(directory, 'ctrl/shift/w.js'))).isSymbolicLink(), true);
  assert.equal(await fs.readFile(source, 'utf8'), legacy);
});
