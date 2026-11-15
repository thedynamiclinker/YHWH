import { fileType } from '../../../lib/file-type.cjs';

export const HOME = '/YHWH';
export const unavailable = {
  chat: 'Talking to YHWH requires the desktop Codex service. A mobile service is not configured.',
  'world:enter': 'The desktop world filesystem is not bundled on mobile.',
  'world:leave': 'The desktop world filesystem is not bundled on mobile.',
  'world:books': 'The desktop world libraries are not bundled on mobile.',
  circus: 'The circus network service is currently available on desktop.',
  'config:open': 'Mobile settings use JSON rather than shell rc files. Use Settings to edit them.',
  'offering:piece': 'Use Export or share file to attach a document on mobile.',
  'window:close': 'Use your device’s app switcher to leave YHWH. Save any edits first.',
};
export function normalize(input, cwd = HOME) {
  if (typeof input !== 'string' || input.includes('\0') || input.includes('\\')) throw new Error('Invalid path.');
  if (input === '/') return HOME;
  const parts = (input.startsWith('/') ? input : `${cwd}/${input}`).split('/'), result = [];
  for (const part of parts) {
    if (part === '..') { if (result.length <= 1) throw new Error('Stay inside the YHWH workspace.'); result.pop(); }
    else if (part && part !== '.') result.push(part);
  }
  const path = '/' + result.join('/');
  if (path !== HOME && !path.startsWith(HOME + '/')) throw new Error('Stay inside the YHWH workspace.');
  return path;
}
const inside = (path, root) => path === root || path.startsWith(root + '/');
const base64 = bytes => { let result = ''; for (let i = 0; i < bytes.length; i += 8192) result += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(result); };
const mime = name => ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf', avif: 'image/avif' })[name.split('.').at(-1).toLowerCase()] || '';
function version(stat, bytes) {
  let hash = 2166136261;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
  return `${stat.modified}:${stat.size}:${hash >>> 0}`;
}

// The same window.yhwh contract as Electron's preload. Only device I/O lives
// here: the renderer, CodeMirror, Markdown, commands and verse model are shared.
export function createMobileBridge({ storage, defaults, words, verses, builtinPlugins = [], external, clipboard, share, choose, platform }) {
  const focuses = new Map(), events = new Map();
  let settings = {}, customWords = {}, writing = Promise.resolve();
  const emit = (name, value) => { for (const fn of events.get(name) || []) fn(value); };
  const focus = id => { const value = focuses.get(id); if (!value) throw new Error('That tab has closed.'); return value; };
  const changed = () => { for (const id of focuses.keys()) emit('directory-changed', { id }); };
  async function config(path) {
    const values = { ...defaults, file_manager: 'false', terminal: 'false' };
    for (const scope of Object.keys(settings).filter(scope => scope === '/' || inside(path, scope)).sort((a,b) => a.length - b.length)) Object.assign(values, settings[scope]);
    const result = { values, origins: {}, files: [], warnings: [], userDirectory: HOME };
    if (values.stylesheet) result.css = new TextDecoder().decode(await storage.read(normalize(values.stylesheet, HOME)));
    if (values.bg) { const path = normalize(values.bg, HOME); result.background = `data:${mime(path)};base64,${base64(await storage.read(path))}`; }
    return result;
  }
  async function list(id, directory) {
    const current = focus(id), cwd = normalize(directory || current.cwd, current.cwd), resolved = await config(cwd);
    const entries = (await storage.list(cwd)).filter(item => resolved.values.show_hidden === 'true' || !item.name.startsWith('.'));
    entries.sort((a,b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name, undefined, { numeric: true }));
    return { cwd, entries, config: resolved };
  }
  async function navigate(id, directory) {
    const path = normalize(directory, focus(id).cwd), stat = await storage.stat(path);
    if (!stat?.directory) throw new Error('Choose a directory.');
    const state = await list(id, path); focus(id).cwd = path; return state;
  }
  async function read(filename) {
    const path = normalize(filename), stat = await storage.stat(path);
    if (!stat) throw new Error('ENOENT: file not found.');
    if (stat.directory) throw new Error('Open a regular file.');
    const resolved = await config(path), type = fileType(path, new Uint8Array(), resolved.values, mime(path));
    const result = { ...stat, path, name: path.split('/').at(-1), ...type, config: resolved, kind: 'binary' };
    if (stat.size > 16 * 1024 * 1024 || type.mime === 'application/pdf') return result;
    const bytes = await storage.read(path);
    Object.assign(result, fileType(path, bytes, resolved.values, mime(path)), { modified: version(stat, bytes) });
    if (result.mime.startsWith('image/') && result.mime !== 'image/svg+xml') return { ...result, kind: 'image', data: `data:${result.mime};base64,${base64(bytes)}` };
    if (bytes.includes(0)) return result;
    try { const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes); return { ...result, kind: 'text', content, newline: content.includes('\r\n') ? '\r\n' : '\n' }; }
    catch { return result; }
  }
  async function unused(path) { if (await storage.stat(path)) throw new Error('A file with that name already exists.'); }
  const handlers = {
    async bootstrap() {
      await storage.init();
      settings = await storage.loadState('settings', {}); customWords = await storage.loadState('words', {});
      return { root: HOME, interface: 'mobile', home: HOME, platform, initial: { path: HOME }, pending: [], words: { ...words, ...customWords }, capabilities: { terminal: false, chat: false } };
    },
    async 'focus:new'(id, directory) {
      if (typeof id !== 'string' || focuses.has(id)) throw new Error('Invalid tab.');
      focuses.set(id, { cwd: HOME });
      try { return await navigate(id, directory); } catch (error) { focuses.delete(id); throw error; }
    },
    'focus:close': id => focuses.delete(id), navigate,
    list: id => list(id),
    'directory:list': async (id, directory) => (await list(id, directory)).entries,
    'path:stat': async filename => { const path = normalize(filename), stat = await storage.stat(path); if (!stat) throw new Error('ENOENT: path not found.'); return { ...stat, path }; },
    'file:read': read,
    async 'file:save'(filename, content, modified, force = false) {
      const path = normalize(filename), stat = await storage.stat(path);
      if (stat?.directory) throw new Error('Open a regular file.');
      if (!force && modified != null && (!stat || version(stat, await storage.read(path)) !== modified)) throw new Error('This file changed or was removed. Reload it, use Save as, or explicitly overwrite from the file menu.');
      await storage.write(path, new TextEncoder().encode(content));
      const result = await read(path); changed(); return { modified: result.modified };
    },
    async 'file:create'(filename, directory = false) {
      const path = normalize(filename); await unused(path);
      if (directory) await storage.mkdir(path); else await storage.write(path, new Uint8Array());
      changed(); return path;
    },
    async 'file:move'(source, destination) {
      source = normalize(source); destination = normalize(destination);
      if (source === HOME || inside(destination, source)) throw new Error('Cannot move a directory into itself.');
      await unused(destination); await storage.move(source, destination); changed(); return destination;
    },
    async 'file:copy'(source, destination) {
      source = normalize(source); destination = normalize(destination);
      if (inside(destination, source)) throw new Error('Cannot copy a directory into itself.');
      await unused(destination); await storage.copy(source, destination); changed(); return destination;
    },
    async 'file:trash'(filename) {
      const source = normalize(filename); if (source === HOME) throw new Error('Cannot trash the workspace.');
      const target = `${HOME}/.Trash`; if (!await storage.stat(target)) await storage.mkdir(target);
      await storage.move(source, `${target}/${crypto.randomUUID()}-${source.split('/').at(-1)}`); changed();
    },
    'file:external': filename => share(normalize(filename)),
    'file:reveal': () => { throw new Error('Use Files in YHWH, or Export or share file to open a document in another app.'); },
    'clipboard:path': filename => clipboard(normalize(filename)),
    choose: (kind, cwd) => choose(kind, normalize(cwd)),
    'choose:save': (cwd, name) => choose('save', normalize(cwd), name),
    async 'settings:save'(values, scope = '/') {
      scope = scope === '/' ? '/' : normalize(scope);
      for (const [key, value] of Object.entries(values)) if (!/^[a-zA-Z_]\w*$/.test(key) || typeof value !== 'string') throw new Error('Invalid setting.');
      if (values.plugins && values.plugins !== '[]') throw new Error('Mobile currently supports bundled plugins only.');
      const next = { ...settings, [scope]: { ...settings[scope], ...values } };
      await storage.saveState('settings', next); settings = next;
    },
    'config:reload': async () => { settings = await storage.loadState('settings', {}); },
    async 'words:save'(values) {
      for (const [key, value] of Object.entries(values)) if (!(key in words) || typeof value !== 'string') throw new Error('Unknown text entry.');
      const next = { ...customWords, ...values }; await storage.saveState('words', next); customWords = next; return { ...words, ...next };
    },
    plugins: async configuration => { if (configuration && configuration !== '[]') throw new Error('Mobile currently supports bundled plugins only.'); return builtinPlugins; },
    external: url => { if (!/^(https?:|mailto:)/i.test(url)) throw new Error('Unsupported link.'); return external(url); },
    'world:quotes': async () => { throw new Error('Fan mail is currently available on desktop.'); },
    'verse:catalog': () => verses.catalog(), 'verse:chapter': (...args) => verses.chapter(...args),
    'verse:get': reference => verses.get(reference), 'verse:random': () => verses.random('Genesis'),
    'verse:commentary': (...args) => verses.saveCommentary(...args),
  };
  const mutations = new Set(['file:save', 'file:create', 'file:move', 'file:copy', 'file:trash', 'settings:save', 'words:save']);
  return {
    async call(channel, ...args) {
      if (unavailable[channel]) throw new Error(unavailable[channel]);
      const fn = handlers[channel]; if (!Object.hasOwn(handlers, channel)) throw new Error(`The operation “${channel}” needs mobile support.`);
      if (!mutations.has(channel)) return fn(...args);
      const operation = writing.then(() => fn(...args)); writing = operation.catch(() => {}); return operation;
    },
    terminal(type) { if (type === 'write') emit('error', 'Local Unix shells are available on desktop.'); },
    on(name, fn) { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(fn); return () => events.get(name).delete(fn); },
    emit,
  };
}
