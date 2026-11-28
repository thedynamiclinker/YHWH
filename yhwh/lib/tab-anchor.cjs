const fs = require('node:fs/promises');
const { readFileSync, rmSync, watch } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const commands = ['@-get', '@-set'];
const read = filename => fs.readFile(filename, 'utf8');

async function write(filename, anchor) {
  const temporary = path.join(path.dirname(filename), randomUUID());
  try {
    await fs.writeFile(temporary, anchor, { mode: 0o600, flag: 'wx' });
    await fs.rename(temporary, filename);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

async function create(anchor, changed) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yhwh-tab-'));
  const filename = path.join(directory, '@');
  try {
    await write(filename, anchor);
    const watcher = watch(directory, (_event, name) => {
      if (name && name !== '@') return;
      let current;
      try { current = readFileSync(filename, 'utf8'); } catch { return; }
      if (current === anchor) return;
      anchor = current;
      changed(anchor);
    });
    watcher.on('error', () => watcher.close());
    return { filename, close() { watcher.close(); rmSync(directory, { recursive: true, force: true }); } };
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function cli(command, args) {
  const set = command === '@-set';
  const usage = `Usage: ${command}${set ? ' [DIRECTORY]' : ''} (from a YHWH tab shell)`;
  if (args.length === 1 && ['-h', '--help'].includes(args[0])) { console.log(usage); return; }
  const values = args[0] === '--' ? args.slice(1) : args;
  if (values.length > Number(set) || values[0] === '') throw new Error(usage);
  const filename = process.env.YHWH_TAB_ANCHOR;
  if (!filename || !path.isAbsolute(filename) || path.basename(filename) !== '@') throw new Error('Run this command from a YHWH tab shell.');
  const previous = await read(filename).catch(error => {
    if (error.code === 'ENOENT') throw new Error('That YHWH tab has closed.');
    throw error;
  });
  if (!set) { console.log(previous); return; }
  const directory = path.resolve(values[0] ?? '.');
  if (!(await fs.stat(directory).catch(() => null))?.isDirectory()) throw new Error(`Choose an existing directory for @. ${directory}`);
  await write(filename, directory);
}

module.exports = { commands, create, read, write, cli };
