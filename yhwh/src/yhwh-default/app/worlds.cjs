const fs = require('node:fs/promises');
const path = require('node:path');
const files = require('../../../lib/files.cjs');
const mount = path.resolve(__dirname, '../../../../mnt');
const shared = path.join(mount, 'we');
const names = new Map([['root', 'roots'], ['yhwh', 'sinai']]);
const inside = (root, target) => target === root || target.startsWith(root.endsWith(path.sep) ? root : root + path.sep);
async function enter(name) {
  if (!names.has(name)) throw new Error('Unknown world.');
  const root = path.join(mount, names.get(name)); await fs.access(root); return root;
}
async function conversation(root, cwd) {
  for (const [worldName, directory] of names) {
    if (![path.join(mount, worldName), path.join(mount, directory)].includes(root)) continue;
    if (inside(root, cwd)) {
      const worldRoot = await enter(worldName);
      return { worldName, worldRoot, cwd: path.join(worldRoot, path.relative(root, cwd)) };
    }
  }
  throw new Error('Invalid conversation world.');
}
function directory(focus, target) {
  target = path.resolve(focus.cwd, target);
  if (focus.guest) {
    const root = focus.worldRoot || focus.guest.cwd;
    return inside(root, target) ? target : root;
  }
  if (!focus.worldRoot) return target;
  if (focus.worldName !== 'folder' && inside(shared, target)) return path.join(focus.worldRoot, path.relative(shared, target));
  return inside(focus.worldRoot, target) ? target : focus.worldRoot;
}
async function physical(focus, target = focus.cwd) {
  if (focus.guest) {
    const root = focus.guest.cwd;
    return require('../../../lib/universes.cjs').guestPath(root, inside(root, target) ? path.relative(root, target) : '');
  }
  if (!focus.worldRoot || focus.worldName === 'folder') return target;
  const overlay = path.join(shared, path.relative(focus.worldRoot, target));
  try { await fs.access(overlay); return overlay; } catch (error) { if (error.code !== 'ENOENT') throw error; return target; }
}
async function list(focus, hidden) {
  if (focus.guest) {
    const physicalDirectory = await physical(focus);
    const entries = await files.list(physicalDirectory, hidden, filename => physical(focus, path.join(focus.cwd, path.basename(filename))));
    return entries.map(row => ({ ...row, path: path.join(focus.cwd, row.name) }));
  }
  if (!focus.worldRoot || focus.worldName === 'folder') return files.list(focus.cwd, hidden);
  const overlay = path.join(shared, path.relative(focus.worldRoot, focus.cwd));
  const entries = new Map();
  for (const location of [focus.cwd, overlay]) {
    let rows;
    try { rows = await files.list(location, hidden); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    for (const row of rows) entries.set(row.name, { ...row, path: row.directory ? path.join(focus.cwd, row.name) : row.path });
  }
  return [...entries.values()].sort((a,b) => Number(b.directory)-Number(a.directory) || a.name.localeCompare(b.name));
}
async function books(name) {
  if (!['sinai', 'horeb'].includes(name)) throw new Error('Unknown library.');
  const filename = path.join(mount, name === 'sinai' ? 'sinai/mnt/sinai/README.md' : 'roots/mnt/horeb/READWE.md');
  const source = await fs.readFile(filename, 'utf8');
  return { filename, items: source.split('\n').flatMap(line => {
    const match = line.match(/^\d+\.\s+(?:\[([^\]]+)\]\((https?:\/\/[^)]+)\)|(.+))$/);
    return match ? [{ title: match[1] || match[3], url: match[2] || null }] : [];
  }) };
}
module.exports = { enter, conversation, directory, physical, list, books };
