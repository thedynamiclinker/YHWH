const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');

const { lordSource } = require('./universe-seeds.cjs');

async function executable(name, env, cwd) {
  const names = process.platform === 'win32' ? [name + '.exe', name + '.com'] : [name];
  const searchPath = env.PATH ?? env.Path;
  if (searchPath === undefined) return;
  for (const directory of searchPath.split(path.delimiter)) {
    for (const name of names) {
      const file = path.resolve(cwd, directory, name);
      if (await isExecutable(file)) return file;
    }
  }
}

async function isExecutable(file) {
  try {
    await fs.access(file, constants.X_OK);
    return (await fs.stat(file)).isFile();
  } catch { return false; }
}

function run(program, args, { cwd, env, signal, output } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { cwd, env, signal, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let stderr = '', launchError;
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-8000); output?.(chunk); });
    child.once('error', error => { launchError = error; });
    child.once('close', code => {
      if (launchError) reject(launchError);
      else if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `${path.basename(program)} exited ${code ?? 'after a signal'}.`));
    });
  });
}

async function resolveProvider({ env = process.env, cwd = process.cwd(), signal, output, configure } = {}) {
  signal?.throwIfAborted();
  const installed = await executable('un', env, cwd);
  if (installed) return installed;
  if (process.platform === 'win32') throw new Error('Lord’s un requires a Unix Python runtime. Install a native un on PATH, or use a bundled template.');
  const source = env.YHWH_LORD_IS || await configure?.() || lordSource;
  const repository = !source.includes(':') && !path.isAbsolute(source) ? path.resolve(cwd, source) : source;
  const cache = path.join(env.XDG_CACHE_HOME || path.join(env.HOME || os.homedir(), '.cache'), 'yhwh', 'lord');
  const checkout = path.join(cache, createHash('sha256').update(repository).digest('hex'));
  const command = path.join(checkout, 'bin', 'un');
  if (await isExecutable(command)) return command;
  const git = await executable('git', env, cwd);
  if (!git) throw new Error('Install git or put un on PATH.');
  await fs.mkdir(cache, { recursive: true, mode: 0o700 });
  const draft = await fs.mkdtemp(path.join(cache, '.clone-'));
  try {
    await run(git, ['clone', '--depth', '1', '--', repository, draft], { cwd, env, signal, output });
    signal?.throwIfAborted();
    if (!await isExecutable(path.join(draft, 'bin', 'un'))) throw new Error('The configured lord checkout has no executable bin/un.');
    try { await fs.rename(draft, checkout); }
    catch (error) { if (!await isExecutable(command)) throw error; }
    return command;
  } finally { await fs.rm(draft, { recursive: true, force: true }); }
}

async function createPlain(destination, options = {}) {
  const context = { cwd: path.dirname(destination), ...options };
  context.signal?.throwIfAborted();
  await fs.mkdir(destination, { mode: 0o755 });
  try {
    if (process.platform === 'win32' && !await executable('un', context.env ?? process.env, context.cwd)) return destination;
    const command = await resolveProvider(context);
    await run(command, ['nu', destination], context);
    return destination;
  } catch (error) {
    await fs.rmdir(destination).catch(() => {});
    throw error;
  }
}

module.exports = { lordSource, resolveProvider, createPlain, run };
