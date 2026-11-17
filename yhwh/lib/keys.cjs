const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { canonical, listing, modifiers } = require('./key-names.cjs');
const { root } = require('./paths.cjs');
const defaults = path.join(root, 'etc/keys');
// Upgrade only byte-for-byte copies of the retired terminal-tab defaults.
// Custom modules, masks, executable programs and symlinks remain user-owned.
const terminalTabDefaults = Object.fromEntries([
  ['ctrl/tab.js', 'next-tab', "api.keyContext === 'terminal' ? 'next-terminal' : 'next-tab'"],
  ['ctrl/pagedown.js', 'next-tab', "api.keyContext === 'terminal' ? 'next-terminal' : 'next-tab'"],
  ['ctrl/pageup.js', 'previous-tab', "api.keyContext === 'terminal' ? 'previous-terminal' : 'previous-tab'"],
  ['ctrl/shift/tab.js', 'previous-tab', "api.keyContext === 'terminal' ? 'previous-terminal' : 'previous-tab'"],
  ['ctrl/shift/t.js', 'reopen-tab', "api.keyContext === 'terminal' ? 'new-terminal' : 'reopen-tab'"],
  ['ctrl/shift/backtick.js', 'new-terminal', "'new-terminal'"],
  ['ctrl/shift/w.js', 'quit', "api.keyContext === 'terminal' ? 'close-terminal' : 'quit'"],
].map(([name, command, action]) => [name, `// command: ${command}\nexport default api => api.run(${action});\n`]));

async function scan(directory, warnings = []) {
  const found = [];
  async function walk(relative = '', ancestors = new Set()) {
    const full = path.join(directory, relative);
    let real, entries;
    try { real = await fs.realpath(full); if (ancestors.has(real)) return; entries = await fs.readdir(full, { withFileTypes: true }); }
    catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) warnings.push(`${full}: ${error.message}`); return; }
    const next = new Set([...ancestors, real]);
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const name = path.join(relative, entry.name), filename = path.join(directory, name);
      try {
        const stat = await fs.stat(filename);
        if (stat.isDirectory()) { await walk(name, next); continue; }
        if (!stat.isFile()) continue;
        const combo = canonical(name.split(path.sep).join('/'));
        const executable = !!(stat.mode & 0o111);
        const kind = executable ? 'exec' : stat.size === 0 ? 'disabled' : filename.endsWith('.js') ? 'js' : 'unsupported';
        if (!executable && stat.size > 1024 * 1024) throw new Error('Key module exceeds 1 MiB.');
        const source = kind === 'js' ? await fs.readFile(filename, 'utf8') : '';
        const command = source.match(/^\/\/ command: (.+)$/m)?.[1] || '';
        const when = source.match(/^\/\/ when: (files|terminal|editor)$/m)?.[1] || '';
        found.push({ combo, filename, kind, source, command, when, prefix: directory });
      } catch (error) { warnings.push(`${filename}: ${error.message}`); }
    }
  }
  await walk(); return found;
}
async function seed(prefix, keysDirectory = 'etc/keys') {
  const destination = path.resolve(prefix, keysDirectory);
  await fs.mkdir(path.join(prefix, 'etc'), { recursive: true });
  try { await fs.copyFile(path.join(root, 'etc/profile'), path.join(prefix, 'etc/profile'), require('node:fs').constants.COPYFILE_EXCL); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  try { await fs.mkdir(destination, { recursive: true }); }
  catch { return; }
  // Missing defaults are copied with exclusive creation; custom files are never overwritten.
  // The shipped tree also remains the lowest-priority layer; an empty file masks it.
  for (const item of await scan(defaults)) {
    const relative = path.relative(defaults, item.filename), target = path.join(destination, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    try { await fs.copyFile(item.filename, target, require('node:fs').constants.COPYFILE_EXCL); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const legacy = terminalTabDefaults[relative.split(path.sep).join('/')];
      if (!legacy) continue;
      const stat = await fs.lstat(target);
      if (stat.isFile() && !(stat.mode & 0o111) && await fs.readFile(target, 'utf8') === legacy) await fs.copyFile(item.filename, target);
    }
  }
}
async function load(config) {
  const warnings = [], effective = new Map();
  const locations = [{ directory: defaults, prefix: root }, ...config.prefixes.map(prefix => ({ directory: path.resolve(prefix, config.values.keys_directory || 'etc/keys'), prefix }))];
  const directories = [...new Set(locations.map(location => location.directory))];
  for (const directory of directories) {
    const prefix = locations.find(location => location.directory === directory).prefix;
    const seen = new Set();
    // A user can install ctrl/b beside the shipped ctrl/b.js. Programs and
    // extensionless masks take precedence over importable variants in a layer.
    const rank = binding => binding.kind === 'exec' ? 2 : /\.(js|sh|py)$/.test(binding.filename) ? 0 : 1;
    for (const binding of (await scan(directory, warnings)).sort((a, b) => rank(a) - rank(b) || a.filename.localeCompare(b.filename))) {
      if (seen.has(binding.combo)) { warnings.push(`Duplicate ${binding.combo} in ${directory}; ${binding.filename} wins.`); }
      seen.add(binding.combo); effective.set(binding.combo, { ...binding, prefix });
    }
  }
  return { bindings: [...effective.values()].sort((a, b) => a.combo.localeCompare(b.combo)), directories, warnings };
}
function program(executable, args, { cwd, env, input = '', timeout = 30000 }) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32', windowsHide: true });
    let stdout = '', stderr = '', size = 0, settled = false;
    const stop = () => { try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch {} };
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => { stop(); finish(new Error('Key command exceeded 30 seconds.')); }, timeout);
    for (const [stream, name] of [[child.stdout, 'stdout'], [child.stderr, 'stderr']]) stream.on('data', bytes => {
      size += bytes.length;
      if (size > 1024 * 1024) { stop(); finish(new Error('Key command output exceeds 1 MiB.')); return; }
      if (name === 'stdout') stdout += bytes; else stderr += bytes;
    });
    child.stdin.on('error', () => {}); child.stdin.end(input);
    child.on('error', error => finish(error));
    child.on('close', code => finish(null, { stdout, stderr, code }));
  });
}
function namespace(bindings, input, current = '') {
  let value = input.trim().replace(/^cd(?:\s+|$)/, '');
  if (!value || value === '/') value = '';
  else if (value === '..') value = current.split('/').slice(0, -1).join('/');
  else if (value.startsWith('./')) value = [current, value.slice(2)].filter(Boolean).join('/');
  else value = value.replace(/^\//, '');
  const directory = canonical(value, true), required = directory.split('/').filter(Boolean);
  if (required.some(part => !modifiers.includes(part))) throw new Error('A namespace contains modifiers such as ctrl/alt.');
  return { directory, bindings: bindings.filter(binding => required.every(part => binding.combo.split('/').includes(part))) };
}
const commandSource = (command, when = '') => `// command: ${command}\n${when ? `// when: ${when}\n` : ''}export default api => api.run('${command}');\n`;
async function save(config, value, action, command, expected, when = '') {
  const combo = canonical(value), loaded = await load(config);
  const current = loaded.bindings.find(binding => binding.combo === combo) || null;
  if (JSON.stringify(current) !== JSON.stringify(expected)) throw new Error('This binding changed on disk. Reload keys before editing.');
  if (!['bind', 'disable', 'reset'].includes(action) || !/^[a-z0-9][a-z0-9-]*$/.test(command) || !['', 'files', 'terminal', 'editor'].includes(when)) throw new Error('Invalid binding action.');
  const directory = path.resolve(config.userDirectory, config.values.keys_directory || 'etc/keys');
  const existing = (await scan(directory)).filter(binding => binding.combo === combo);
  // Hand-written modules, programs and symlinks stay under the editor's control.
  for (const item of existing) {
    const stat = await fs.lstat(item.filename);
    if (stat.isSymbolicLink() || (stat.mode & 0o111) || (item.source && item.source !== commandSource(item.command, item.when))) throw new Error('Open this binding’s source to edit it; it contains a custom file.');
  }
  for (const item of existing) await fs.unlink(item.filename);
  if (action !== 'reset') {
    const filename = path.join(directory, combo + '.js'); await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.writeFile(filename, action === 'disable' ? '' : commandSource(command, when), { flag: 'wx', mode: 0o644 });
  }
}
module.exports = { defaults, scan, seed, load, program, namespace, listing, save, commandSource };
