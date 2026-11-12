import { spawnSync, spawn } from 'node:child_process';
import { access, copyFile, cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const assets = ['main.js', 'manifest.json', 'styles.css'];
const sourceFiles = [...assets, 'README.md', 'LICENSE', 'versions.json', 'package.json', 'package-lock.json', 'tsconfig.json', '.gitignore', 'src', 'assets', 'scripts', 'test'];
const directory = 'https://community.obsidian.md';
const help = `YHWH · a normal Obsidian community plugin

Usage: yhwh-obsidian <command> [options]

  help                          Show this help (the default)
  build                         Compile main.js and styles.css
  check                         Type-check and run tests
  install VAULT                 Install into VAULT/.obsidian/plugins/yhwh
  install --plugin-dir DIR      Install directly into a specific plugin directory
  package DIR                   Copy release assets, README and licenses into DIR
  export DIR                    Copy a standalone, publishable source repository
  publish --repo OWNER/REPO     Push source and a versioned GitHub release
  submit --repo OWNER/REPO      Verify release and open Obsidian's submission portal

Options:
  --enable                      Add YHWH to community-plugins.json when installing
  --config-dir NAME             Vault config directory (default: .obsidian)
  --dry-run                     Describe install/export/package/publish/submit without changing anything
  --submit                      Open community submission after publishing
  --no-open                     Print the submission URL instead of opening a browser
  -h, --help                    Show help

Examples:
  bin/yhwh-obsidian install "$HOME/obsidian/Notes" --enable
  bin/yhwh-obsidian install --plugin-dir /tmp/test-vault/.obsidian/plugins/yhwh
  bin/yhwh-obsidian publish --repo yourname/yhwh --dry-run
  bin/yhwh-obsidian publish --repo yourname/yhwh --submit

publish requires git, authenticated gh, and an existing PUBLIC GitHub repository
dedicated to this plugin. It commits source at the repository root, pushes it,
and attaches main.js, manifest.json and styles.css to a matching version tag.
Community listing requires signing into Obsidian and linking GitHub in the
official portal; it cannot be pushed directly from a CLI.
`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.error) throw new Error(`${command}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} ${args[0] ?? ''} failed: ${(result.stderr || result.stdout || '').trim()}`);
  return result.stdout?.trim() ?? '';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch(error => { console.error(`yhwh-obsidian: ${error.message}`); process.exitCode = 1; });
}
async function exists(path) { try { await access(path); return true; } catch { return false; } }
async function json(path) { return JSON.parse(await readFile(path, 'utf8')); }
function repoName(value) {
  if (!value || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) throw new Error('Use --repo OWNER/REPO for a dedicated public GitHub repository.');
  return value;
}
async function build() {
  if (!await exists(join(root, 'node_modules/esbuild'))) throw new Error(`Build dependencies missing. Run npm --prefix ${root} ci first.`);
  run(process.execPath, [join(root, 'scripts/build.mjs')], { stdio: 'inherit' });
}
async function validate() {
  const manifest = await json(join(root, 'manifest.json'));
  if (!/^[a-z0-9-]+$/.test(manifest.id) || manifest.id.includes('obsidian')) throw new Error('Invalid community plugin ID.');
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error('Use a plain x.y.z manifest version.');
  for (const key of ['name', 'description', 'author', 'minAppVersion']) if (!manifest[key]) throw new Error(`Missing manifest ${key}.`);
  for (const file of [...assets, 'README.md', 'LICENSE', 'versions.json']) await access(join(root, file), constants.R_OK);
  if ((await json(join(root, 'package.json'))).version !== manifest.version) throw new Error('package.json and manifest.json versions differ.');
  if ((await json(join(root, 'versions.json')))[manifest.version] !== manifest.minAppVersion) throw new Error('versions.json is missing this version and minimum app version.');
  return manifest;
}
async function atomicCopy(source, destination) {
  const temp = `${destination}.${process.pid}.tmp`;
  try { await copyFile(source, temp); await rename(temp, destination); }
  finally { await rm(temp, { force: true }); }
}
async function copyFiles(destination, files) {
  await mkdir(destination, { recursive: true });
  for (const file of files) {
    const source = join(root, file), target = join(destination, file);
    if ((await stat(source)).isDirectory()) await cp(source, target, { recursive: true });
    else await atomicCopy(source, target);
  }
}
function outsideSource(destination) {
  const path = relative(root, destination);
  if (!path || (!path.startsWith('..' + sep) && path !== '..' && !isAbsolute(path)))
    throw new Error('Choose an output directory outside the plugin source tree.');
}
async function checkTarget(target, id) {
  if (await exists(join(target, 'manifest.json')) && (await json(join(target, 'manifest.json'))).id !== id)
    throw new Error('The target contains a different plugin. Choose its own directory.');
}
function open(url) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'rundll32' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.on('error', error => console.error(`Could not open the browser: ${error.message}. Open ${url} yourself.`));
  child.unref();
}
async function verifyRemote(repo, manifest) {
  const remote = JSON.parse(run('gh', ['api', `repos/${repo}`]));
  if (remote.private) throw new Error('The community directory needs a public source repository.');
  const committed = JSON.parse(run('gh', ['api', `repos/${repo}/contents/manifest.json`, '-H', 'Accept: application/vnd.github.raw+json']));
  if (committed.id !== manifest.id || committed.version !== manifest.version) throw new Error('The default branch manifest does not match this plugin and version.');
  const release = JSON.parse(run('gh', ['release', 'view', manifest.version, '--repo', repo, '--json', 'assets,isDraft,isPrerelease,url']));
  if (release.isDraft || release.isPrerelease) throw new Error('Publish a non-draft, non-prerelease version first.');
  for (const file of assets) if (!release.assets.some(asset => asset.name === file)) throw new Error(`Release is missing ${file}.`);
  const temp = await mkdtemp(join(tmpdir(), 'yhwh-verify-'));
  try {
    run('gh', ['release', 'download', manifest.version, '--repo', repo, '--dir', temp, ...assets.flatMap(file => ['--pattern', file])]);
    for (const file of assets) {
      if (!(await readFile(join(root, file))).equals(await readFile(join(temp, file)))) throw new Error(`Released ${file} differs from the local build. Publish a new version.`);
    }
  } finally { await rm(temp, { recursive: true, force: true }); }
  return release.url;
}

export async function main(argv) {
  const { values: flags, positionals } = parseArgs({ args: argv, allowPositionals: true, options: {
    help: { type: 'boolean', short: 'h' }, enable: { type: 'boolean' }, 'dry-run': { type: 'boolean' },
    'plugin-dir': { type: 'string' }, 'config-dir': { type: 'string' }, repo: { type: 'string' },
    submit: { type: 'boolean' }, 'no-open': { type: 'boolean' },
  } });
  const [command = 'help', argument, ...extra] = positionals;
  if (flags.help || command === 'help') { console.log(help); return; }
  if (extra.length) throw new Error('Too many arguments. Run yhwh-obsidian help.');
  if (!['build', 'check', 'install', 'package', 'export', 'publish', 'submit'].includes(command)) throw new Error(`Unknown command: ${command}. Run yhwh-obsidian help.`);
  if (argument && ['build', 'check', 'publish', 'submit'].includes(command)) throw new Error(`${command} takes options, not a directory argument.`);
  if (command === 'build') { if (flags['dry-run']) { console.log('Would compile main.js and styles.css.'); return; } await build(); return; }
  if (command === 'check') {
    run('npm', ['run', 'check'], { cwd: root, stdio: 'inherit' });
    run('npm', ['test'], { cwd: root, stdio: 'inherit' }); return;
  }
  if (!flags['dry-run'] && command !== 'submit') {
    if (command === 'publish' || await exists(join(root, 'node_modules/esbuild'))) await build();
    else console.log('Using bundled plugin assets. After changing source, run npm ci and npm run build.');
  }
  const manifest = await validate();
  if (command === 'install') {
    if ((!argument && !flags['plugin-dir']) || (argument && flags['plugin-dir'])) throw new Error('Provide a vault directory OR --plugin-dir DIR.');
    if (flags['enable'] && flags['plugin-dir']) throw new Error('--enable requires a vault directory so its configuration is unambiguous.');
    const configDir = flags['config-dir'] ?? '.obsidian';
    if (isAbsolute(configDir) || configDir.split(/[\\/]/).some(part => part === '..' || !part)) throw new Error('--config-dir must be a relative vault config directory.');
    const vault = argument ? resolve(argument) : undefined;
    if (vault && (!await exists(vault) || !(await stat(vault)).isDirectory())) throw new Error('The vault directory must already exist.');
    const destination = resolve(flags['plugin-dir'] ?? join(vault, configDir, 'plugins', manifest.id));
    outsideSource(destination); await checkTarget(destination, manifest.id);
    console.log(`${flags['dry-run'] ? 'Would install' : 'Installing'} YHWH ${manifest.version} → ${destination}`);
    const enabledFile = vault ? join(vault, configDir, 'community-plugins.json') : undefined;
    let enabled;
    if (flags.enable) {
      enabled = await exists(enabledFile) ? await json(enabledFile) : [];
      if (!Array.isArray(enabled) || enabled.some(id => typeof id !== 'string')) throw new Error('community-plugins.json must contain an array of plugin IDs.');
      if (!enabled.includes(manifest.id)) enabled.push(manifest.id);
    }
    if (flags['dry-run']) { if (flags.enable) console.log(`Would enable ${manifest.id} in ${enabledFile}`); return; }
    await copyFiles(destination, [...assets, 'LICENSE']);
    if (flags.enable) {
      const temp = `${enabledFile}.${process.pid}.tmp`;
      await writeFile(temp, JSON.stringify(enabled, null, 2) + '\n'); await rename(temp, enabledFile);
    }
    console.log(flags.enable ? 'Enabled in vault configuration. Reload Obsidian to load the plugin.' : 'Enable YHWH in Obsidian → Settings → Community plugins.');
    console.log('Existing data.json and other plugins were preserved.'); return;
  }
  if (command === 'package' || command === 'export') {
    if (!argument) throw new Error(`Provide an output directory for ${command}.`);
    const destination = resolve(argument); outsideSource(destination); await checkTarget(destination, manifest.id);
    console.log(`${flags['dry-run'] ? 'Would write' : 'Writing'} ${command === 'export' ? 'standalone plugin source' : 'release assets'} → ${destination}`);
    if (!flags['dry-run']) await copyFiles(destination, command === 'export' ? sourceFiles : [...assets, 'README.md', 'LICENSE']);
    return;
  }
  const repo = repoName(flags.repo);
  if (flags['dry-run']) {
    console.log(command === 'publish' ? `Would type-check, test, copy standalone source into ${repo}, commit and push its default branch, then publish GitHub release ${manifest.version} with ${assets.join(', ')}.` : `Would verify ${repo} default branch, release ${manifest.version} and matching assets.`);
    if (command === 'submit' || flags.submit) console.log(`Would open ${directory} for account linking and community review.`);
    return;
  }
  if (command === 'publish') {
    run('npm', ['run', 'check'], { cwd: root, stdio: 'inherit' });
    run('npm', ['test'], { cwd: root, stdio: 'inherit' });
    const remote = JSON.parse(run('gh', ['api', `repos/${repo}`]));
    if (remote.private) throw new Error('Use an existing public GitHub repository dedicated to this plugin.');
    const temp = await mkdtemp(join(tmpdir(), 'yhwh-publish-'));
    try {
      const checkout = join(temp, 'repository');
      run('gh', ['repo', 'clone', repo, checkout], { stdio: 'inherit' });
      const git = args => run('git', ['-C', checkout, ...args]);
      await checkTarget(checkout, manifest.id);
      if (!await exists(join(checkout, 'manifest.json'))) {
        const existing = await readdir(checkout);
        if (existing.some(file => !['.git', '.gitignore', 'README.md', 'LICENSE'].includes(file)))
          throw new Error('Repository contains other work. Use a dedicated plugin repository.');
      }
      const tag = spawnSync('git', ['-C', checkout, 'show-ref', '--verify', '--quiet', `refs/tags/${manifest.version}`]);
      if (tag.status === 0) throw new Error(`Tag ${manifest.version} already exists. Increment package.json, manifest.json and versions.json before publishing.`);
      if (tag.status !== 1) throw new Error('Could not inspect existing release tags.');
      const branch = remote.default_branch || 'main';
      git(['checkout', '-B', branch]);
      await copyFiles(checkout, sourceFiles);
      git(['add', '--', ...sourceFiles]);
      const changes = spawnSync('git', ['-C', checkout, 'diff', '--cached', '--quiet']);
      if (changes.status === 1) git(['commit', '-m', `Release YHWH ${manifest.version}`]);
      else if (changes.status !== 0) throw new Error('Could not inspect staged plugin source.');
      git(['push', '--set-upstream', 'origin', `HEAD:refs/heads/${branch}`]);
      const notes = join(temp, 'release-notes.md');
      await writeFile(notes, `YHWH ${manifest.version}\n\nVault navigator, synchronized command line, editable personality and WebGL directory.\n\nInstall through Obsidian after community review, or copy the attached plugin files into your vault's plugin directory.\n`);
      console.log(run('gh', ['release', 'create', manifest.version, '--repo', repo, '--target', branch,
        '--title', `YHWH ${manifest.version}`, '--notes-file', notes, ...assets.map(file => join(root, file))]));
    } finally { await rm(temp, { recursive: true, force: true }); }
    if (!flags.submit) console.log(`Published ${await verifyRemote(repo, manifest)}\nNext: yhwh-obsidian submit --repo ${repo}`);
  }
  if (command === 'submit' || flags.submit) {
    const url = await verifyRemote(repo, manifest);
    console.log(`Verified release: ${url}\nSubmit at ${directory}: sign in, link GitHub, then add ${repo}.`);
    if (!flags['no-open']) open(directory);
  }
}
