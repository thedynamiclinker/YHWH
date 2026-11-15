import { Filesystem, Directory } from '@capacitor/filesystem';
import { HOME, normalize } from './bridge.mjs';

const encode = bytes => { let result = ''; for (let i = 0; i < bytes.length; i += 8192) result += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(result); };
const missing = error => error.code === 'OS-PLUG-FILE-0008' || /(?:does not exist|not found|ENOENT)/i.test(error.message);
export function createStorage() {
  const location = path => ({ directory: Directory.Data, path: `YHWH${normalize(path).slice(HOME.length)}` });
  const state = name => ({ directory: Directory.Library, path: `yhwh/${name}.json` });
  const statResult = result => ({ directory: result.type === 'directory', size: result.size, modified: result.mtime });
  const api = {
    async stat(path) { try { return statResult(await Filesystem.stat(location(path))); } catch (error) { if (missing(error)) return null; throw error; } },
    async init() { if (!await api.stat(HOME)) await Filesystem.mkdir({ ...location(HOME), recursive: true }); },
    async list(path) { return (await Filesystem.readdir(location(path))).files.map(item => ({ name: item.name, path: `${path}/${item.name}`, ...statResult(item) })); },
    async read(path) {
      const { data } = await Filesystem.readFile(location(path));
      if (typeof data !== 'string') return new Uint8Array(await data.arrayBuffer());
      return Uint8Array.from(atob(data), char => char.charCodeAt(0));
    },
    write: (path, bytes) => Filesystem.writeFile({ ...location(path), data: encode(bytes) }),
    mkdir: path => Filesystem.mkdir(location(path)),
    move: (from, to) => Filesystem.rename({ directory: Directory.Data, from: location(from).path, to: location(to).path }),
    async copy(from, to) {
      if ((await api.stat(from))?.directory) {
        await api.mkdir(to);
        for (const entry of await api.list(from)) await api.copy(entry.path, `${to}/${entry.name}`);
      } else await Filesystem.copy({ directory: Directory.Data, from: location(from).path, to: location(to).path });
    },
    uri: async path => (await Filesystem.getUri(location(path))).uri,
    async loadState(name, fallback) {
      try { const { data } = await Filesystem.readFile({ ...state(name), encoding: 'utf8' }); return JSON.parse(data); }
      catch (error) { if (missing(error)) return fallback; throw error; }
    },
    async saveState(name, value) {
      const target = state(name), temporary = `${target.path}.tmp`;
      await Filesystem.writeFile({ ...target, path: temporary, data: JSON.stringify(value), encoding: 'utf8', recursive: true });
      await Filesystem.rename({ directory: target.directory, from: temporary, to: target.path });
    },
  };
  return api;
}
