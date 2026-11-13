const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

const defaults = require('../../../etc/default/defaults.json');
const userDirectory = () => process.env.YHWH_CONFIG_HOME || path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'yhwh');
const within = (target, scope) => { const relative = path.relative(scope, target); return !relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)); };

function sections(text) {
  const result = [];
  for (const [i, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) result.push({ scope: line.trim(), lines: [], line: i + 1 });
    else {
      if (!result.length) throw new Error(`Line ${i + 1}: shell statements need a path above them.`);
      result.at(-1).lines.push(line.replace(/^(?:\t| {1,4})/, ''));
    }
  }
  return result;
}

// Bash owns shell syntax, expansion, and command substitution. FD 3 keeps
// config output (including arbitrary commands) separate from returned values.
function shell(code, { cwd, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.YHWH_BASH || 'bash', ['--noprofile', '--norc', '-c', code], {
      cwd, env, stdio: ['ignore', 'pipe', 'pipe', 'pipe'], windowsHide: true,
    });
    let data = '', errors = '', bytes = 0, settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => { child.kill(); finish(new Error('Config shell exceeded 5 seconds.')); }, 5000);
    child.stdio[3].on('data', chunk => { bytes += chunk.length; if (bytes > 1024 * 1024) { child.kill(); finish(new Error('Config output exceeds 1 MiB.')); } else data += chunk; });
    child.stdout.on('data', () => {});
    child.stderr.on('data', chunk => { if (errors.length < 8000) errors += chunk; });
    child.on('error', error => finish(error));
    child.on('close', code => finish(code ? new Error(errors.trim() || `Config shell exited ${code}.`) : null, data));
  });
}

async function readableRc(filename) {
  try {
    const stat = await fs.stat(filename);
    const uid = process.getuid?.();
    if (!stat.isFile()) return false;
    // Treat rc files as executable shell startup files. Root does not execute
    // another user's configuration; writable-by-everyone files are skipped.
    if (uid !== undefined && ((stat.uid !== uid && stat.uid !== 0) || (stat.mode & 0o022)))
      throw new Error('Shell config must be owned by you or root and not writable by group/others.');
    return true;
  } catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false; throw error; }
}

async function configLocations(target, { system = process.env.YHWH_SYSTEM_CONFIG || '/etc/yhwh', user = userDirectory() } = {}) {
  const locations = [{ directory: system, base: system }, { directory: user, base: user }];
  const ancestors = [];
  for (let directory = target;; directory = path.dirname(directory)) {
    ancestors.unshift(directory);
    if (directory === path.dirname(directory)) break;
  }
  for (const directory of ancestors) locations.push({ directory: path.join(directory, '.yhwh'), base: directory });
  return locations;
}

async function resolveConfig(target, options = {}) {
  target = path.resolve(target);
  const values = { ...defaults }, origins = {}, files = [], warnings = [];
  let environment = { ...process.env, ...options.env };
  const locations = await configLocations(target, options);
  for (const { directory, base } of locations) {
    const filename = path.join(directory, 'rc');
    try {
      if (!await readableRc(filename)) continue;
      files.push(filename);
      const entries = sections(await fs.readFile(filename, 'utf8'));
      const code = 'set -e\n' + entries.map(entry => `__yhwh_scope="${entry.scope}"\nprintf '%s\\0' "$__yhwh_scope" >&3`).join('\n');
      const expanded = (await shell(code, { cwd: base, env: environment })).split('\0');
      const matching = entries.map((entry, i) => ({ ...entry, scope: path.resolve(base, expanded[i]) }))
        .filter(entry => within(target, entry.scope)).sort((a, b) => a.scope.length - b.scope.length || a.line - b.line);
      if (!matching.length) continue;
      const output = await shell(`set -ae\n${matching.flatMap(entry => entry.lines).join('\n')}\nenv -0 >&3`, { cwd: base, env: environment });
      const next = Object.fromEntries(output.split('\0').filter(Boolean).map(item => { const i = item.indexOf('='); return [item.slice(0, i), item.slice(i + 1)]; }));
      const assigned = new Set(matching.flatMap(entry => entry.lines).map(line => line.match(/^\s*(?:export\s+)?([a-zA-Z_][a-zA-Z0-9_]*)=/)?.[1]).filter(Boolean));
      // Keep shell variables available for later files. Only changed variables
      // become settings, so the host's PATH, HOME, etc. remain ordinary env vars.
      for (const [key, value] of Object.entries(next).sort(([a], [b]) => Number(a.startsWith('yhwh_')) - Number(b.startsWith('yhwh_')))) {
        if ((value !== environment[key] || assigned.has(key)) && !key.startsWith('__yhwh_') && !['PWD', 'OLDPWD', 'SHLVL', '_', 'YHWH_EXPAND', 'SHELLOPTS'].includes(key)) {
          const setting = key.replace(/^yhwh_/, '');
          values[setting] = value; origins[setting] = base;
        }
      }
      environment = next;
    } catch (error) { warnings.push(`${filename}: ${error.message}`); }
  }
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('yhwh_')) { values[key.slice(5)] = value; origins[key.slice(5)] = process.cwd(); }
  }
  for (const key of ['bg', 'stylesheet']) {
    if (values[key] && !/^(?:https?:|data:|file:)/.test(values[key])) values[key] = path.resolve(origins[key] || userDirectory(), values[key]);
  }
  return { values, origins, files, warnings, userDirectory: options.user || userDirectory() };
}

const { quote } = require('../../../lib/shell.cjs');

async function saveSettings(values, scope = path.parse(os.homedir()).root) {
  const directory = userDirectory();
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const lines = Object.entries(values).map(([key, value]) => {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) throw new Error('Invalid setting name.');
    if (String(value).includes('\n')) throw new Error('Use the rc editor for multiline settings.');
    return `    ${key}=${quote(value)}`;
  });
  if (/[\r\n]/.test(scope)) throw new Error('Use the rc editor for a scope containing a newline.');
  const literalScope = scope.replace(/[\\"$`]/g, char => `\\${char}`);
  // Appending an ordinary section preserves hand-written shell and comments.
  await fs.appendFile(path.join(directory, 'rc'), `\n# Saved from YHWH settings\n${literalScope}\n${lines.join('\n')}\n`, { mode: 0o600 });
}

module.exports = { defaults, sections, resolveConfig, configLocations, userDirectory, saveSettings, quote, within };
