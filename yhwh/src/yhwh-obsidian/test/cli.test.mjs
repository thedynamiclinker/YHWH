import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = join(root, '../../bin/obsidian/cli.mjs');
function run(...args) { return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' }); }
test('help is the default and publication dry runs never need GitHub credentials', () => {
  assert.match(run().stdout, /Usage: yhwh-obsidian/);
  const publish = run('publish', '--repo', 'example/yhwh', '--dry-run', '--submit');
  assert.equal(publish.status, 0, publish.stderr);
  assert.match(publish.stdout, /community.obsidian.md/);
  assert.notEqual(run('publish', '--repo', 'bad repo', '--dry-run').status, 0);
  assert.notEqual(run('install').status, 0);
});
test('installation preserves settings and the other enabled plugins; dry run writes nothing', async () => {
  const vault = await mkdtemp(join(tmpdir(), 'yhwh-install-'));
  try {
    const conf = join(vault, '.obsidian'), plugin = join(conf, 'plugins/yhwh');
    await mkdir(plugin, { recursive: true });
    await writeFile(join(plugin, 'data.json'), '{"energy":0}');
    await writeFile(join(conf, 'community-plugins.json'), '["other-plugin"]');
    const before = await readdir(plugin);
    assert.equal(run('install', vault, '--enable', '--dry-run').status, 0);
    assert.deepEqual(await readdir(plugin), before);
    let result = run('install', vault, '--enable');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await readFile(join(plugin, 'data.json'), 'utf8'), '{"energy":0}');
    assert.deepEqual(JSON.parse(await readFile(join(conf, 'community-plugins.json'), 'utf8')), ['other-plugin', 'yhwh']);
    assert.equal(JSON.parse(await readFile(join(plugin, 'manifest.json'), 'utf8')).id, 'yhwh');
    result = run('install', vault, '--enable');
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(await readFile(join(conf, 'community-plugins.json'), 'utf8')), ['other-plugin', 'yhwh']);
  } finally { await rm(vault, { recursive: true, force: true }); }
});
test('direct-directory installation and custom configuration folders work', async () => {
  const vault = await mkdtemp(join(tmpdir(), 'yhwh-custom-'));
  try {
    assert.equal(run('install', vault, '--config-dir', '.custom').status, 0);
    assert.equal(JSON.parse(await readFile(join(vault, '.custom/plugins/yhwh/manifest.json'), 'utf8')).id, 'yhwh');
    const destination = join(vault, 'direct');
    assert.equal(run('install', '--plugin-dir', destination).status, 0);
    assert.equal(JSON.parse(await readFile(join(destination, 'manifest.json'), 'utf8')).id, 'yhwh');
    await writeFile(join(destination, 'manifest.json'), '{"id":"someone-else"}');
    assert.notEqual(run('install', '--plugin-dir', destination).status, 0);
    assert.notEqual(run('install', vault, '--config-dir', '../escape').status, 0);
  } finally { await rm(vault, { recursive: true, force: true }); }
});
test('standalone export includes buildable plugin source and excludes parent vault data', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'yhwh-export-'));
  try {
    const destination = join(temp, 'source');
    const result = run('export', destination);
    assert.equal(result.status, 0, result.stderr);
    assert.equal((await readFile(join(destination, 'manifest.json'), 'utf8')).includes('"id": "yhwh"'), true);
    const files = await readdir(destination);
    for (const file of ['src', 'scripts', 'test', 'assets', 'main.js', 'LICENSE', 'README.md']) assert.ok(files.includes(file));
    for (const file of ['.obsidian', '.git', 'root', 'data.json', 'node_modules']) assert.ok(!files.includes(file));
    const installed = spawnSync(process.execPath, [join(destination, 'scripts/cli.mjs'), 'install', '--plugin-dir', join(temp, 'installed')], { encoding: 'utf8' });
    assert.equal(installed.status, 0, installed.stderr);
    assert.match(installed.stdout, /bundled plugin assets/);
    assert.notEqual(run('export', resolve(root, 'src')).status, 0);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
