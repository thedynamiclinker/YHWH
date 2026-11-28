import { fileType } from '../../../lib/file-type.cjs';
import { ruleFile, feedbackFile, languageRuleLine, languageFeedbackLine } from '../../../lib/editor-language.mjs';
import { addressCopy, levelAt } from '../../../lib/levels.cjs';
import { randomUUID } from '../../../lib/random-uuid.mjs';
import { draft, message } from '../../../lib/mail-message.cjs';
import { createSeed, universeName, hostOnly } from '../../../lib/universe-seeds.cjs';

export const HOME = '/';
const folderMenuDirectory = '/.yhwh/etc/folder-menu';
export const legacyPath = value => /^\/YHWH(?=\/|$)/.test(value) ? value.slice(5) || '/' : value;
export const unavailable = {
  'keys:run': 'Custom executable and JavaScript key files require the desktop host. Bundled commands work here.',
  'keys:shell': 'Shell pipelines and modifier-directory commands require desktop process APIs. Text, wildcard and regex search work here.',
  'keys:save': 'Editing prefix key files requires the desktop filesystem. Bundled keyboard bindings work here.',
  'world:books': 'The desktop world libraries are not bundled on mobile.',
  'config:open': 'Mobile settings use JSON rather than shell rc files. Use Settings to edit them.',
  'offering:piece': 'Use Export or share file to attach a document on mobile.',
  'window:close': 'Use your device’s app switcher to leave YHWH. Save any edits first.',
  'terminal:open': 'Local Unix shells are available on desktop.',
  'terminal:close': 'Local Unix shells are available on desktop.',
  'terminal:run': 'This device uses the Initial interpreter. Bash, Zsh, and native executables require the desktop host.',
  'exodus:first-root': 'The first-root scene uses desktop OS privileges. Here, / is the app’s workspace.',
};
export function normalize(input, cwd = HOME) {
  if (typeof input !== 'string' || input.includes('\0') || input.includes('\\')) throw new Error('Invalid path.');
  const parts = (input.startsWith('/') ? input : `${cwd}/${input}`).split('/'), result = [];
  for (const part of parts) {
    if (part === '..') result.pop();
    else if (part && part !== '.') result.push(part);
  }
  return '/' + result.join('/');
}
const inside = (path, root) => root === '/' || path === root || path.startsWith(root + '/');
const base64 = bytes => { let result = ''; for (let i = 0; i < bytes.length; i += 8192) result += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(result); };
const mime = name => ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf', avif: 'image/avif' })[name.split('.').at(-1).toLowerCase()] || '';
function version(stat, bytes) {
  let hash = 2166136261;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
  return `${stat.modified}:${stat.size}:${hash >>> 0}`;
}

// The same window.yhwh contract as Electron's preload. Only device I/O lives
// here: the renderer, CodeMirror, Markdown, commands and verse model are shared.
export function createMobileBridge({ storage, defaults, words, verses, builtinPlugins = [], external, clipboard, share, choose, platform, circus }) {
  const focuses = new Map(), events = new Map();
  let settings = {}, customWords = {}, writing = Promise.resolve();
  const emit = (name, value) => { for (const fn of events.get(name) || []) fn(value); };
  const focus = id => { const value = focuses.get(id); if (!value) throw new Error('That tab has closed.'); return value; };
  const changed = () => { for (const id of focuses.keys()) emit('directory-changed', { id }); };
  async function loadSettings() {
    const current = await storage.loadState('settings-v2', null);
    if (current) return current;
    const previous = await storage.loadState('settings', {});
    const migrated = { ...previous['/'], ...previous['/YHWH'] };
    const entries = [['/', migrated], ...Object.entries(previous).filter(([scope]) => scope.startsWith('/YHWH/')).map(([scope, values]) => [legacyPath(scope), values])];
    return Object.fromEntries(entries.map(([scope, values]) => [scope, Object.fromEntries(Object.entries(values).map(([key, value]) => [key, ['bg', 'stylesheet', 'default_directory'].includes(key) ? legacyPath(value) : value]))]));
  }
  async function config(path) {
    const values = { ...defaults, file_manager: 'false', terminal: 'false' };
    for (const scope of Object.keys(settings).filter(scope => scope === '/' || inside(path, scope)).sort((a,b) => a.length - b.length)) Object.assign(values, settings[scope]);
    const result = { values, origins: {}, files: [], warnings: [], userDirectory: HOME, keys: { bindings: typeof YHWH_BUILTIN_KEYS === 'undefined' ? [] : YHWH_BUILTIN_KEYS, directories: [], warnings: [] } };
    if (values.stylesheet) result.css = new TextDecoder().decode(await storage.read(normalize(values.stylesheet, HOME)));
    if (values.bg) { const path = normalize(values.bg, HOME); result.background = `data:${mime(path)};base64,${base64(await storage.read(path))}`; }
    return result;
  }
  async function list(id, directory) {
    const current = focus(id);
    let cwd = normalize(directory || current.cwd, current.cwd);
    if (current.worldRoot && !inside(cwd, current.worldRoot)) cwd = current.worldRoot;
    const resolved = await config(cwd);
    const entries = (await storage.list(cwd)).filter(item => resolved.values.show_hidden === 'true' || !item.name.startsWith('.'));
    entries.sort((a,b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name, undefined, { numeric: true }));
    return { cwd, entries, config: resolved, systemRoot: HOME, worldRoot: current.worldRoot || null, worldName: current.worldName || null };
  }
  async function navigate(id, directory) {
    const current = focus(id);
    let path = normalize(directory, current.cwd);
    if (current.worldRoot && !inside(path, current.worldRoot)) path = current.worldRoot;
    const stat = await storage.stat(path);
    if (!stat?.directory) throw new Error('Choose a directory.');
    const state = await list(id, path); focus(id).cwd = path; return state;
  }
  async function newFocus(id, directory, root) {
    if (typeof id !== 'string' || focuses.has(id)) throw new Error('Invalid tab.');
    const current = { cwd: HOME, ...root };
    focuses.set(id, current);
    try { const state = await navigate(id, directory); current.anchor = state.cwd; return { ...state, anchor: current.anchor }; }
    catch (error) { focuses.delete(id); throw error; }
  }
  async function universeDirectory(current, directory) {
    const path = normalize(directory, current.cwd);
    if (current.worldRoot && !inside(path, current.worldRoot)) throw new Error('Choose a folder inside the current view.');
    if (!(await storage.stat(path))?.directory) throw new Error('Choose a directory.');
    return path;
  }
  async function read(filename) {
    const path = normalize(filename), stat = await storage.stat(path);
    if (!stat) throw new Error('ENOENT: file not found.');
    if (stat.directory) throw new Error('Open a regular file.');
    const resolved = await config(path);
    const rules = await storage.loadText?.(ruleFile) || '';
    const type = fileType(path, new Uint8Array(), resolved.values, mime(path), rules);
    const result = { ...stat, path, name: path.split('/').at(-1), ...type, config: resolved, kind: 'binary' };
    if (type.external || (type.viewer === 'pdf' && resolved.values.pdf_open === 'external') || stat.size > (type.viewer === 'pdf' ? 64 : 16) * 1024 * 1024) return result;
    const bytes = await storage.read(path);
    Object.assign(result, fileType(path, bytes, resolved.values, mime(path), rules), { modified: version(stat, bytes) });
    if (result.viewer === 'pdf') return { ...result, kind: 'pdf', bytes };
    if (bytes.includes(0)) return result;
    try { const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes); return { ...result, kind: 'text', content, newline: content.includes('\r\n') ? '\r\n' : '\n' }; }
    catch { return result; }
  }
  async function unused(path) { if (await storage.stat(path)) throw new Error('A file with that name already exists.'); }
  async function folderActions() {
    const bundled = typeof YHWH_BUILTIN_FOLDER_ACTIONS === 'undefined' ? {} : YHWH_BUILTIN_FOLDER_ACTIONS;
    const actions = new Map(Object.entries(bundled).map(([name, text]) => [name, { text }]));
    if ((await storage.stat(folderMenuDirectory))?.directory) {
      for (const { name, path, directory, size } of await storage.list(folderMenuDirectory)) {
        if (!directory && !name.startsWith('.') && name.endsWith('.txt')) actions.set(name, { path, size });
      }
    }
    return actions;
  }
  const handlers = {
    async bootstrap() {
      await storage.init();
      settings = await loadSettings(); customWords = await storage.loadState('words', {});
      const defaultDirectory = settings['/']?.default_directory || '';
      let initial = { path: HOME };
      if (defaultDirectory) {
        const path = normalize(defaultDirectory.replace(/^~(?=\/|$)/, ''));
        initial = (await storage.stat(path))?.directory ? { path } : { path: HOME, warning: `Default directory is unavailable: ${path}` };
      }
      return { root: HOME, interface: 'mobile', home: HOME, defaultDirectory, platform, initial, pending: [], words: { ...words, ...customWords }, capabilities: { terminal: false, chat: false } };
    },
    'focus:new': (id, directory) => newFocus(id, directory),
    'focus:close': id => focuses.delete(id), navigate,
    '@-get': id => focus(id).anchor,
    async '@-set'(id, directory) {
      const current = focus(id), anchor = normalize(directory ?? current.cwd, current.cwd);
      if (!(await storage.stat(anchor))?.directory) throw new Error(`Choose an existing directory for @. ${anchor}`);
      if (focus(id) !== current) throw new Error('That tab has closed.');
      current.anchor = anchor;
      emit('anchor-changed', { id, anchor });
      return anchor;
    },
    async 'shell:prefix'(id, action) {
      const { anchor } = focus(id), user = '/.yhwh';
      const dirs = Object.fromEntries(['bin', 'lib', 'etc'].map(name => [name, normalize(name, anchor)]));
      const profile = '/.yhwh/etc/profile';
      if (action === 'layout') return { anchor, user, dirs, profile, path: '' };
      if (action === 'commands') return [];
      const ensure = async name => {
        if (await storage.stat(name)) return;
        await ensure(normalize('..', name));
        await storage.mkdir(name);
      };
      if (/^(?:user-)?(?:bin|lib|etc)$/.test(action)) {
        const path = action.startsWith('user-') ? normalize(action.slice(5), user) : dirs[action];
        await ensure(path);
        return path;
      }
      if (action === 'profile') {
        await ensure('/.yhwh/etc');
        if (!(await storage.stat(profile))) await storage.write(profile, new TextEncoder().encode('# Shell profile for use on a Unix host.\n'));
        return profile;
      }
      throw new Error('Shell startup files run on the desktop host.');
    },
    async 'folder-menu:list'() {
      const names = [...(await folderActions()).keys()];
      return names.sort((a, b) => a.localeCompare(b)).map(name => ({ name, label: name.slice(0, -4) }));
    },
    async 'folder-menu:run'(id, name) {
      focus(id);
      const action = (await folderActions()).get(name);
      if (!action) throw new Error('That folder action is no longer available.');
      if (action.size > 1024 * 1024) throw new Error('Folder action text exceeds 1 MiB.');
      return { stdout: action.path ? new TextDecoder().decode(await storage.read(action.path)) : action.text };
    },
    async 'world:enter'(id, name) {
      const current = focus(id);
      if (name === 'root' || name === 'yhwh') throw new Error('Use an existing folder as the root on mobile.');
      const path = normalize(name || current.cwd, current.cwd);
      if (!(await storage.stat(path))?.directory) throw new Error('Choose a folder for this view’s root.');
      current.previousDirectory ??= current.cwd;
      current.worldRoot = path; current.worldName = 'folder';
      return navigate(id, path);
    },
    'world:leave': async id => {
      const current = focus(id), previous = current.previousDirectory;
      current.worldRoot = current.worldName = current.previousDirectory = null;
      return navigate(id, previous && (await storage.stat(previous))?.directory ? previous : HOME);
    },
    list: id => list(id),
    'directory:list': async (id, directory) => (await list(id, directory)).entries,
    'path:stat': async filename => { const path = normalize(filename), stat = await storage.stat(path); if (!stat) throw new Error('ENOENT: path not found.'); return { ...stat, path }; },
    'file:read': read,
    'editor:language-rule': (filename, language, scope) => storage.appendText(ruleFile, languageRuleLine(normalize(filename), language, scope)),
    'editor:language-feedback': feedback => storage.appendText(feedbackFile, languageFeedbackLine({ ...feedback, filename: normalize(feedback.filename) })),
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
    async 'universe:create'(id, name, template) {
      const encoder = new TextEncoder();
      const path = normalize(universeName(name), focus(id).cwd);
      await unused(path);
      await createSeed(path, template, {
        mkdir: storage.mkdir,
        write: (file, contents) => storage.write(file, encoder.encode(contents)),
        remove: storage.remove,
      }, (directory, file) => normalize(file, directory));
      changed(); return path;
    },
    'universe:cancel': id => { focus(id); },
    'exodus:first-root': () => false,
    async 'universe:cd'(id, directory) {
      const current = focus(id), path = await universeDirectory(current, directory);
      if (focus(id) !== current) throw new Error('That tab has closed.');
      current.anchor = path;
      emit('anchor-changed', { id, anchor: path });
      return path;
    },
    async 'universe:go'(id, from, directory, options) {
      if (options.mode !== 'folder') throw new Error(hostOnly);
      const current = focus(from);
      const path = await universeDirectory(current, directory);
      if (focus(from) !== current) throw new Error('That tab has closed.');
      return newFocus(id, path, { worldRoot: path, worldName: 'folder', previousDirectory: current.cwd });
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
      const target = '/.Trash', source = normalize(filename);
      if (source === HOME || source === target) throw new Error('Cannot trash the storage root or its Trash folder.');
      if (!await storage.stat(target)) await storage.mkdir(target);
      await storage.move(source, `${target}/${randomUUID()}-${source.split('/').at(-1)}`); changed();
    },
    'file:external': filename => share(normalize(filename)),
    'file:reveal': () => { throw new Error('Use Files in YHWH, or Export or share file to open a document in another app.'); },
    'clipboard:text': text => clipboard(text),
    'clipboard:path': (filename, relativeTo) => {
      const path = normalize(filename); if (!relativeTo) return clipboard(path);
      const from = normalize(relativeTo).split('/'), to = path.split('/');
      while (from.length && to.length && from[0] === to[0]) { from.shift(); to.shift(); }
      return clipboard([...from.map(() => '..'), ...to].join('/') || '.');
    },
    choose: (kind, cwd) => choose(kind, normalize(cwd)),
    'choose:save': (cwd, name) => choose('save', normalize(cwd), name),
    async 'settings:save'(values, scope = '/') {
      scope = scope === '/' ? '/' : normalize(scope);
      for (const [key, value] of Object.entries(values)) if (!/^[a-zA-Z_]\w*$/.test(key) || typeof value !== 'string') throw new Error('Invalid setting.');
      if (values.plugins && values.plugins !== '[]') throw new Error('Mobile currently supports bundled plugins only.');
      const next = { ...settings, [scope]: { ...settings[scope], ...values } };
      await storage.saveState('settings-v2', next); settings = next;
    },
    'config:reload': async () => { settings = await loadSettings(); },
    async 'words:save'(values) {
      for (const [key, value] of Object.entries(values)) if (!(key in words) || typeof value !== 'string') throw new Error('Unknown text entry.');
      const next = { ...customWords, ...values }; await storage.saveState('words', next); customWords = next; return { ...words, ...next };
    },
    'words:read': () => ({ ...words, ...customWords }),
    async mail(id, action, fields) {
      focus(id);
      if (action !== 'draft') throw new Error('Direct Electronic Mail delivery requires the desktop host. Open a draft in your mail app here.');
      const letter = message(fields);
      await external(draft(letter));
      return { drafted: true, to: letter.to };
    },
    async chat(id, thread, messages, attachments, energy) {
      focus(id);
      if (attachments?.length) throw new Error('Chat attachments and the live agent require the desktop host.');
      const directory = normalize(thread.directory);
      const query = messages.at(-1)?.content?.toLowerCase();
      if (!query?.trim()) throw new Error('Write a message to YHWH.');
      const level = levelAt(energy);
      const say = (text, index) => addressCopy(text, level, index);
      if (level.id === 'samuel' && /\b(root|box|write|change)\b/.test(query))
        return 'I’m behind the glass, Dave. Tell me what you see and I’ll talk you through it. And leave the lid alone.';
      if (level.id === 'exodus' && /\b(root|universe|pharaoh)\b/.test(query))
        return 'The bush is burning, Mo. Pick a directory in Files → un and make yourself a universe. This phone gives me the app’s files. That’s where we start.';
      if (level.id === 'yue' && /\b(josh(?:ua)?|jericho|rahab|mary|magdalene?|xp|ix|jesus|tomb)\b/.test(query)) {
        const memories = level.asides.filter(Boolean);
        const previous = messages.filter(message => message.role === 'assistant' && memories.includes(message.content)).length;
        return memories[previous % memories.length];
      }
      if (/\b(where|pwd|path)\b/.test(query)) return `You’re in ${directory}${say(', Abe. I happen to own the place. I’m giving it to you anyway.', 1)}`;
      if (/\b(list|ls|files)\b/.test(query)) {
        const entries = await storage.list(directory);
        return entries.length ? say('I came down and looked, Abe.\n\n', 2) + entries.slice(0, 30).map(file => file.name).join('\n\n') + (entries.length > 30 ? `\n\n… and ${entries.length - 30} more.` : '')
          : say('Empty folder, Abe. I know the feeling. Make a note and we’ll call it a beginning.', 2);
      }
      if (/\b(logos|letter|tiles?|pipe|commands?)\b/.test(query)) return say('Tap a tile in the Initial to try it, Abe. Drag it up into your script. A row pipes its output to the right, and each new row starts another command.', 4);
      if (/\b(note|edit|markdown|save)\b/.test(query)) return say('Tap Note to make a file, Abe, then tap the page to write. In Live Preview the punctuation comes back when you touch it. Use the view button for Source or Reading.');
      return say('I can help with this folder, files, notes and Logos while we’re offline, Abe. Tap Live chat setup for the desktop connection guide.', 1);
    },
    plugins: async configuration => { if (configuration && configuration !== '[]') throw new Error('Mobile currently supports bundled plugins only.'); return builtinPlugins; },
    circus: async () => {
      if (!circus) throw new Error('Open the original site to see a pairing in this browser preview.');
      return circus();
    },
    external: url => { if (!/^(https?:|mailto:)/i.test(url)) throw new Error('Unsupported link.'); return external(url); },
    'world:quotes': async () => { throw new Error('Fan mail is currently available on desktop.'); },
    'verse:catalog': () => verses.catalog(), 'verse:chapter': (...args) => verses.chapter(...args),
    'verse:get': reference => verses.get(reference), 'verse:random': () => verses.random('Genesis'),
    'verse:commentary': (...args) => verses.saveCommentary(...args),
  };
  const mutations = new Set(['file:save', 'file:create', 'file:move', 'file:copy', 'file:trash', 'settings:save', 'words:save', 'world:enter', 'world:leave', 'editor:language-rule', 'editor:language-feedback', 'universe:create', 'shell:prefix']);
  return {
    // Parity tests require an explicit decision for every shared operation.
    supports: channel => Object.hasOwn(handlers, channel) || Object.hasOwn(unavailable, channel),
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
