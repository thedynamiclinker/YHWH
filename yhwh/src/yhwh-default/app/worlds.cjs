// A file-manager overlay, not an OS chroot. Shells retain ordinary user permissions.
const fs = require('node:fs/promises');
const path = require('node:path');
const files = require('../../../lib/files.cjs');
const mount = path.resolve(__dirname, '../../../../mnt');
const shared = path.join(mount, 'we');
const inside = (root, target) => target === root || target.startsWith(root + path.sep);
async function enter(name) {
  if (!['root', 'yhwh'].includes(name)) throw new Error('Unknown world.');
  const root = path.join(mount, name); await fs.access(root); return root;
}
function directory(focus, target) {
  target = path.resolve(focus.cwd, target);
  if (focus.guest) return inside(focus.guest.cwd, target) ? target : focus.guest.cwd;
  if (!focus.worldRoot) return target;
  if (inside(shared, target)) return path.join(focus.worldRoot, path.relative(shared, target));
  return inside(focus.worldRoot, target) ? target : focus.worldRoot;
}
async function physical(focus, target = focus.cwd) {
  if (focus.guest) return require('../../../lib/universes.cjs').guestPath(focus.guest.cwd, path.relative(focus.guest.cwd, directory(focus, target)));
  if (!focus.worldRoot) return target;
  const overlay = path.join(shared, path.relative(focus.worldRoot, target));
  try { await fs.access(overlay); return overlay; } catch (error) { if (error.code !== 'ENOENT') throw error; return target; }
}
async function list(focus, hidden) {
  if (focus.guest) {
    const physicalDirectory = await physical(focus);
    const entries = await files.list(physicalDirectory, hidden, filename => physical(focus, path.join(focus.cwd, path.basename(filename))));
    return entries.map(row => ({ ...row, path: path.join(focus.cwd, row.name) }));
  }
  if (!focus.worldRoot) return files.list(focus.cwd, hidden);
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
  const filename = path.join(mount, name === 'sinai' ? 'yhwh/mnt/sinai/README.md' : 'root/mnt/horeb/READWE.md');
  const source = await fs.readFile(filename, 'utf8');
  return { filename, items: source.split('\n').flatMap(line => {
    const match = line.match(/^\d+\.\s+(?:\[([^\]]+)\]\((https?:\/\/[^)]+)\)|(.+))$/);
    return match ? [{ title: match[1] || match[3], url: match[2] || null }] : [];
  }) };
}
module.exports = { enter, directory, physical, list, books };
