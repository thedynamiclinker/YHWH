const fs = require('node:fs/promises');
const path = require('node:path');
const { etc } = require('../../../lib/paths.cjs');
const { program } = require('../../../lib/keys.cjs');
const { userDirectory } = require('./config.cjs');

async function actions() {
  const entries = new Map();
  for (const directory of [etc('folder-menu'), path.join(userDirectory(), 'etc/folder-menu')]) {
    let names;
    try { names = await fs.readdir(directory); }
    catch (error) { if (['ENOENT', 'ENOTDIR'].includes(error.code)) continue; throw error; }
    for (const name of names) {
      if (name.startsWith('.')) continue;
      const filename = path.join(directory, name);
      const stat = await fs.stat(filename).catch(error => { if (error.code !== 'ENOENT') throw error; });
      if (!stat?.isFile()) continue;
      const executable = !!(stat.mode & 0o111);
      if (!executable && !name.endsWith('.txt')) continue;
      const label = executable ? name : name.slice(0, -4);
      entries.set(name, { name, label, filename, executable, size: stat.size });
    }
  }
  return [...entries.values()].sort((a, b) => a.label.localeCompare(b.label));
}

async function list() {
  return (await actions()).map(({ name, label }) => ({ name, label }));
}

async function run(name, cwd, env) {
  const action = (await actions()).find(item => item.name === name);
  if (!action) throw new Error('That folder action is no longer available.');
  if (action.executable) return program(action.filename, [cwd], { cwd, env });
  if (action.size > 1024 * 1024) throw new Error('Folder action text exceeds 1 MiB.');
  return { stdout: await fs.readFile(action.filename, 'utf8') };
}

module.exports = { list, run };
