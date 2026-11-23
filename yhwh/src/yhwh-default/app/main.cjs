const ui = require('../../../lib/text.cjs').text(require('../../../etc/default/text-main.json'));
const { app, BrowserWindow, ipcMain, dialog, Menu, shell, clipboard } = require('electron');
const fs = require('node:fs/promises');
const watch = require('node:fs').watch;
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const files = require('../../../lib/files.cjs');
const { ruleFile, feedbackFile, languageRuleLine, languageFeedbackLine } = require('../../../lib/editor-language.mjs');
const { resolveConfig, configLocations, userDirectory, saveSettings } = require('./config.cjs');
const keys = require('../../../lib/keys.cjs');
const { freeEnergy, levelAt } = require('../../../lib/levels.cjs');
const { mail } = require('./mail.cjs');
const { chat } = require('./chat.cjs');
const paths = require('../../../lib/paths.cjs');

const root = path.join(__dirname, '..');
const worlds = require('./worlds.cjs');
const three = process.env.YHWH_INTERFACE === 'three';
const configOptions = three ? { variant: 'three' } : {};
const development = process.env.YHWH_DESKTOP_FLAVOR === 'development';
const profile = (three ? process.env.YHWH_THREE_DATA_DIR : process.env.YHWH_DATA_DIR) || path.join(userDirectory(), three ? 'state-three' : development ? 'state-development' : 'state');
const verses = require('../../../lib/verses.cjs').createVerseStore({ stateDirectory: profile });
app.setPath(ui("userdata"), profile);
app.setName(ui("yhwh"));
if (process.platform === 'linux') {
  app.setDesktopName(development ? 'yhwh-development.desktop' : 'yhwh.desktop');
  app.commandLine.appendSwitch('class', development ? 'yhwh-development' : 'yhwh');
}
const entry = pathToFileURL(require('../../../lib/paths.cjs').etc('default', 'index.html')).href;
let window, host, loaded = false, quitting = false;
const focuses = new Map();
const terminals = new Map();
const pendingOpens = [];
const configCache = new Map();
const conversations = new Map();
function send(channel, message) { if (window && !window.isDestroyed()) window.webContents.send(channel, message); }
function command(name) { send('command', name); }
function flag(argv, name) { const inline = argv.find(arg => arg.startsWith(`${name}=`)); if (inline) return inline.slice(name.length + 1); const index = argv.indexOf(name); return index < 0 ? null : argv[index + 1]; }
const defaultDirectory = async () => (await resolveConfig(path.parse(os.homedir()).root, { ...configOptions, globalOnly: true })).values.default_directory;
async function request(argv, cwd = process.cwd(), configured) {
  let filename = flag(argv, '--open') || flag(argv, '--cwd') || (three && (flag(argv, '--root') || process.env.YHWH_THREE_OPEN));
  let warning;
  if (!filename && argv.includes('--desktop-launch')) {
    const value = configured ?? await defaultDirectory();
    const home = os.homedir();
    filename = path.resolve(home, value === '~' ? '' : value.replace(/^~[\\/]/, ''));
    if (!await fs.stat(filename).then(stat => stat.isDirectory(), () => false)) {
      warning = `Default directory is unavailable: ${filename}`;
      filename = home;
    }
  }
  return { path: path.resolve(cwd, filename || cwd), tab: flag(argv, '--tab'), theme: flag(argv, '--theme'), warning };
}

const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
else {
  app.on('second-instance', (_event, argv, cwd) => {
    window?.show(); window?.focus();
    request(argv, cwd).then(opening => { if (loaded) send('open', opening); else pendingOpens.push(opening); }).catch(error => send('error', error.message));
  });
  app.on('open-file', (event, filename) => { event.preventDefault(); const opening = { path: filename }; if (loaded) send('open', opening); else pendingOpens.push(opening); });
  app.whenReady().then(launch).catch(error => { dialog.showErrorBox(ui("yhwh-could-not-start"), error.stack || error.message); app.quit(); });
}

function handle(name, callback) {
  ipcMain.handle(name, (event, ...args) => {
    if (event.senderFrame.url !== entry) throw new Error(ui("untrusted-window-"));
    return callback(...args);
  });
}

async function configFor(target) {
  const previous = configCache.get(target);
  const locations = await configLocations(path.resolve(target), configOptions);
  async function stamp(values = {}) {
    const configurations = ['etc/profile', 'rc', ruleFile, ...(three ? ['rc.three'] : [])];
    const tracked = [...locations.flatMap(location => configurations.map(name => path.join(location.directory, name))), ...locations.map(location => location.directory), ...[values.stylesheet, values.bg].filter(Boolean)];
    return (await Promise.all(tracked.map(async filename => { try { const stat = await fs.stat(filename); return `${filename}:${stat.mtimeMs}:${stat.size}:${stat.mode}`; } catch { return filename; } }))).join('|');
  }
  const signature = await stamp(previous?.config.values);
  if (previous?.signature === signature) { previous.config.keys = await keys.load(previous.config); return previous.config; }
  const config = await resolveConfig(target, configOptions);
  config.keys = await keys.load(config);
  const rules = await Promise.all(config.prefixes.map(async prefix => {
    const filename = path.join(prefix, ruleFile);
    try { return await fs.readFile(filename, 'utf8'); }
    catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error.code)) config.warnings.push(`${filename}: ${error.message}`);
      return '';
    }
  }));
  Object.defineProperty(config, 'languageRules', { value: rules.join('\n') });
  if (config.values.stylesheet) {
    try {
      const filename = config.values.stylesheet.startsWith('file:') ? require('node:url').fileURLToPath(config.values.stylesheet) : config.values.stylesheet;
      config.css = await fs.readFile(filename, 'utf8');
    } catch (error) { config.warnings.push(ui("theme-", error.message)); }
  }
  if (config.values.bg) {
    try {
      const filename = config.values.bg.startsWith('file:') ? require('node:url').fileURLToPath(config.values.bg) : config.values.bg;
      const bytes = await fs.readFile(filename);
      const mime = (await files.detect(filename, bytes)).mime;
      if (mime.startsWith('image/') && bytes.length < 16 * 1024 * 1024) config.background = `data:${mime};base64,${bytes.toString('base64')}`;
    } catch (error) { config.warnings.push(ui("background-", error.message)); }
  }
  configCache.set(target, { signature: await stamp(config.values), config });
  return config;
}

async function appendEditorRecord(relative, line) {
  const filename = path.join(userDirectory(), relative);
  await fs.mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const handle = await fs.open(filename, 'a+', 0o600);
  try {
    const { size } = await handle.stat();
    const tail = Buffer.alloc(1);
    if (size) await handle.read(tail, 0, 1, size - 1);
    await handle.appendFile(size && tail[0] !== 10 ? '\n' + line : line, 'utf8');
  } finally { await handle.close(); }
}

function refreshApp(reloadPlugins = false) {
  configCache.clear();
  send('app-changed', { reloadPlugins });
  return { refreshing: true };
}

async function agentAction(focus, tabId, directory, action, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Provide an app action with a JSON object.');
  if (action === 'app.refresh') return refreshApp(true);
  if (action === 'app.open') {
    if (typeof args.path !== 'string' || !args.path) throw new Error('Provide a path.');
    const filename = path.resolve(directory, args.path);
    await fs.stat(filename);
    send('open', { path: filename, tab: focuses.get(tabId)?.worldRoot ? undefined : tabId });
    return { opening: filename };
  }
  if (action === 'settings.set') {
    const { values, scope = focus.cwd } = args;
    if (!values || typeof values !== 'object' || Array.isArray(values) || !Object.keys(values).length ||
        Object.values(values).some(value => !['string', 'number', 'boolean'].includes(typeof value)) ||
        typeof scope !== 'string' || !path.isAbsolute(scope)) throw new Error('Provide settings values and an absolute scope.');
    if (Object.hasOwn(values, 'plugins')) {
      const plugins = JSON.parse(values.plugins);
      if (!Array.isArray(plugins) || plugins.some(item => typeof item !== 'string')) throw new Error('Plugins must be a JSON array of paths.');
    }
    await saveSettings(values, scope, configOptions);
    refreshApp();
    return { saved: Object.keys(values), scope };
  }
  const config = await configFor(focus.cwd);
  if (action === 'settings.get') {
    const keys = args.keys;
    if (keys !== undefined && (!Array.isArray(keys) || keys.some(key => typeof key !== 'string'))) throw new Error('Provide an array of setting names.');
    return { directory: focus.cwd, configDirectory: config.userDirectory, files: config.files,
      ...(keys ? { values: Object.fromEntries(keys.map(key => [key, Object.hasOwn(config.values, key) ? config.values[key] : null])) } : { keys: Object.keys(config.values).sort() }) };
  }
  if (action === 'mail.status') return { selfAddressConfigured: Boolean(config.values.mail_self), transportConfigured: Boolean(config.values.mail_transport) };
  if (action === 'mail.send' || action === 'mail.draft') return mail(action.slice(5), args, { config, directory, openExternal: url => shell.openExternal(url) });
  throw new Error('Unknown app action.');
}

async function watchDirectory(focus) {
  focus.watcher?.close();
  clearTimeout(focus.watchTimer);
  try {
    focus.watcher = watch(await worlds.physical(focus), () => {
      clearTimeout(focus.watchTimer);
      focus.watchTimer = setTimeout(() => send('directory-changed', { id: focus.id }), 150);
    });
    focus.watcher.on('error', () => {});
  } catch {}
}

async function navigate(id, directory, fromShell = false) {
  const focus = focuses.get(id);
  if (!focus) throw new Error(ui("that-tab-has-closed-"));
  directory = worlds.directory(focus, directory);
  const stat = await fs.stat(await worlds.physical(focus, directory));
  if (!stat.isDirectory()) throw new Error(ui("choose-a-directory-"));
  focus.cwd = directory;
  await watchDirectory(focus);
  if (!fromShell && focus.terminalId) host.send({ type: 'cd', id: focus.terminalId, cwd: await worlds.physical(focus, directory) });
  const config = await configFor(directory);
  return { worldRoot: focus.worldRoot || null, cwd: directory, entries: await worlds.list(focus, config.values.show_hidden === 'true'), config };
}

async function sourcePath(filename) {
  const focus = [...focuses.values()].find(item => item.worldRoot && (filename === item.worldRoot || filename.startsWith(item.worldRoot + path.sep)));
  return focus ? worlds.physical(focus, filename) : filename;
}

async function destination(filename) {
  const focus = [...focuses.values()].find(item => item.worldRoot && (filename === item.worldRoot || filename.startsWith(item.worldRoot + path.sep)));
  if (!focus) return filename;
  return path.join(await worlds.physical(focus, path.dirname(filename)), path.basename(filename));
}

async function startTerminal(focus, id) {
  if (typeof id !== 'string' || terminals.has(id)) throw new Error('Invalid terminal.');
  const config = await configFor(focus.cwd);
  const cwd = await worlds.physical(focus);
  if (focuses.get(focus.id) !== focus) throw new Error('Closed tab.');
  if (terminals.has(id)) throw new Error('Invalid terminal.');
  if ([...terminals.values()].includes(focus.id)) throw new Error('This app tab already has a shell.');
  terminals.set(id, focus.id); focus.terminalId = id;
  host.send({ type: 'start', id, cwd, env: { ...config.environment, YHWH_TAB: focus.id, YHWH_PREFIX_SHELL: path.join(root, '../../bin/prefix-shell.cjs'), YHWH_INTERFACE: three ? 'three' : 'default', YHWH_THREE_DATA_DIR: three ? profile : '', PATH: `${path.join(root, '../../bin')}${path.delimiter}${path.join(root, 'bin')}${path.delimiter}${config.environment.PATH || process.env.PATH}` } });
}

async function launch() {
  await fs.mkdir(profile, { recursive: true });
  await fs.mkdir(userDirectory(), { recursive: true });
  const configured = await defaultDirectory();
  const initial = await request(process.argv, process.cwd(), configured);
  const initialConfig = await resolveConfig(initial.path, configOptions);
  await keys.seed(userDirectory(), initialConfig.values.keys_directory);
  host = spawn(process.env.YHWH_NODE || 'node', [path.join(__dirname, '../../../bin/default/terminal-host.cjs')], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true,
  });
  host.stderr.on('data', data => process.stderr.write(data));
  host.stdout.on('data', () => {});
  host.on('error', error => send('terminal', { type: 'error', message: error.message }));
  host.on('exit', code => { if (!quitting) send('terminal', { type: 'error', message: ui("terminal-process-exited-restart-the-app-to-start", code) }); });
  host.on('message', async message => {
    send('terminal', message);
    const focus = focuses.get(terminals.get(message.id));
    if (message.type === 'exit') { terminals.delete(message.id); if (focus?.terminalId === message.id) focus.terminalId = null; }
    if (message.type === 'cwd' && focus?.terminalId === message.id) {
      try { send('navigation', { id: focus.id, ...await navigate(focus.id, message.cwd, true) }); }
      catch (error) { send('error', error.message); }
    }
  });
  handle('bootstrap', async () => {
    loaded = true;
    return { root, interface: three ? 'three' : 'default', effectsURL: three ? pathToFileURL(require('../../../lib/paths.cjs').output('three/renderer.js')).href : null, initial, defaultDirectory: configured, pending: pendingOpens.splice(0), words: JSON.parse(await fs.readFile(require('../../../lib/paths.cjs').etc('default', 'words.json'), 'utf8')), home: os.homedir(), platform: process.platform };
  });
  handle('focus:new', async (id, directory) => {
    if (typeof id !== 'string' || focuses.has(id)) throw new Error(ui("invalid-tab-"));
    const focus = { id, cwd: path.resolve(directory) };
    focuses.set(id, focus);
    try {
      const result = await navigate(id, focus.cwd, true);
      await startTerminal(focus, id);
      return result;
    } catch (error) { focuses.delete(id); throw error; }
  });
  handle('focus:close', id => {
    const focus = focuses.get(id); focus?.watcher?.close(); clearTimeout(focus?.watchTimer); focuses.delete(id);
    for (const [terminalId, owner] of terminals) if (owner === id) { terminals.delete(terminalId); host.send({ type: 'close', id: terminalId }); }
  });
  handle('terminal:open', async (id, terminalId) => {
    const focus = focuses.get(id); if (!focus) throw new Error('Closed tab.');
    await startTerminal(focus, terminalId);
  });
  handle('terminal:close', (id, terminalId) => {
    if (terminals.get(terminalId) !== id) return;
    terminals.delete(terminalId); host.send({ type: 'close', id: terminalId });
    if (focuses.get(id)?.terminalId === terminalId) focuses.get(id).terminalId = null;
  });
  handle('world:enter', async (id, name) => {
    const focus = focuses.get(id);
    const directory = await worlds.enter(name);
    focus.worldRoot = directory;
    return navigate(id, directory);
  });
  handle('world:leave', async id => {
    const focus = focuses.get(id); focus.worldRoot = null;
    return navigate(id, os.homedir());
  });
  handle('world:books', name => worlds.books(name));
  handle('world:quotes', () => fs.readFile(require('../../../lib/paths.cjs').etc('default', 'fan-mail.json'), 'utf8').then(JSON.parse));
  handle('verse:catalog', () => verses.catalog());
  handle('verse:chapter', (book, chapter) => verses.chapter(book, chapter));
  handle('verse:get', reference => verses.get(reference));
  handle('verse:random', () => verses.random('Genesis'));
  handle('verse:commentary', (id, text) => verses.saveCommentary(id, text));
  handle('navigate', navigate);
  handle('list', async id => { const focus = focuses.get(id); if (!focus) throw new Error(ui("closed-tab-")); const config = await configFor(focus.cwd); return { cwd: focus.cwd, entries: await worlds.list(focus, config.values.show_hidden === 'true'), config }; });
  handle('directory:list', async (id, directory) => {
    const focus = focuses.get(id); if (!focus) throw new Error('Closed tab.');
    const cwd = worlds.directory(focus, directory);
    const config = await configFor(cwd);
    return worlds.list({ ...focus, cwd }, config.values.show_hidden === 'true');
  });
  handle('chat', async (tabId, thread, messages, attachments, selectedEnergy) => {
    if (!focuses.has(tabId)) throw new Error('Closed tab.');
    if (!thread || !/^[a-f\d-]{36}$/.test(thread.id) || typeof thread.directory !== 'string' || !path.isAbsolute(thread.directory)) throw new Error('Invalid conversation directory.');
    if (conversations.has(thread.id)) throw new Error('Already waiting for a reply.');
    const controller = new AbortController();
    conversations.set(thread.id, controller);
    try {
      // A resumed conversation keeps its original directory, regardless of
      // which file or tab is currently open.
      const focus = { cwd: path.resolve(thread.directory) };
      if (thread.worldRoot) {
        const world = await worlds.enter(path.basename(thread.worldRoot));
        if (thread.worldRoot !== world || worlds.directory({ ...focus, worldRoot: world }, focus.cwd) !== focus.cwd) throw new Error('Invalid conversation world.');
        focus.worldRoot = world;
      }
      const physical = await worlds.physical(focus);
      if (!await fs.stat(physical).then(stat => stat.isDirectory(), () => false)) throw new Error('This conversation’s directory is unavailable. Start a new chat to work in another directory.');
      const directory = await fs.realpath(physical);
      const config = await configFor(focus.cwd);
      const energy = Number.isInteger(selectedEnergy) && selectedEnergy >= 0 && selectedEnergy <= levelAt(Infinity).energy
        ? selectedEnergy : freeEnergy(config.values);
      const environment = { ...config.environment, YHWH_TAB: tabId, YHWH_INTERFACE: three ? 'three' : 'default',
        PATH: [path.join(paths.root, 'bin'), config.environment.PATH || process.env.PATH].filter(Boolean).join(path.delimiter) };
      const app = { configDirectory: await fs.realpath(userDirectory()), environment,
        dispatch: (action, args) => agentAction(focus, tabId, directory, action, args) };
      return await chat({ directory, energy, messages, attachments, app }, { signal: controller.signal });
    } finally { conversations.delete(thread.id); refreshApp(); }
  });
  // Resolve shortcuts before choosing a language, preview base, or link directory.
  handle('file:read', async filename => { filename = await fs.realpath(await sourcePath(filename)); const config = await configFor(filename); return { ...await files.read(filename, config.values, config.languageRules), config }; });
  handle('editor:language-rule', (filename, language, scope) => appendEditorRecord(ruleFile, languageRuleLine(path.resolve(filename), language, scope)));
  handle('editor:language-feedback', feedback => appendEditorRecord(feedbackFile, languageFeedbackLine(feedback)));
  handle('path:stat', async filename => { const absolute = path.resolve(filename); const stat = await fs.stat(absolute); return { path: absolute, directory: stat.isDirectory() }; });
  handle('file:save', async (filename, ...args) => files.save(await destination(filename), ...args));
  handle('file:create', async (filename, directory) => files.create(await destination(filename), directory));
  handle('file:move', async (source, target) => files.move(await sourcePath(source), await destination(target)));
  handle('file:copy', async (source, target) => { target = await destination(target); await fs.cp(await sourcePath(source), target, { recursive: true, errorOnExist: true, force: false }); return target; });
  handle('file:trash', filename => sourcePath(filename).then(value => require('../../../lib/trash.cjs').trash(value, target => shell.trashItem(target))));
  handle('file:external', async filename => {
    const error = await shell.openPath(await sourcePath(filename));
    if (error) throw new Error(error);
  });
  handle('file:reveal', filename => sourcePath(filename).then(value => shell.showItemInFolder(value)));
  handle('clipboard:path', (filename, relativeTo) => clipboard.writeText(relativeTo ? path.relative(relativeTo, filename) || '.' : path.resolve(filename)));
  handle('choose', async (kind, directory) => {
    const result = await dialog.showOpenDialog(window, { defaultPath: directory, properties: kind === 'directory' ? [ui("opendirectory")] : [ui("openfile")] });
    return result.canceled ? null : result.filePaths[0];
  });
  handle('choose:save', async (directory, name) => { const result = await dialog.showSaveDialog(window, { defaultPath: path.join(directory, name) }); return result.canceled ? null : result.filePath; });
  handle('settings:save', async (values, scope) => { await saveSettings(values, scope, configOptions); configCache.clear(); });
  handle('config:reload', () => configCache.clear());
  handle('words:read', async () => JSON.parse(await fs.readFile(paths.etc('default', 'words.json'), 'utf8')));
  handle('mail', async (id, action, fields) => {
    const focus = focuses.get(id); if (!focus) throw new Error('Closed tab.');
    return mail(action, fields, { config: await configFor(focus.cwd), directory: await worlds.physical(focus), openExternal: url => shell.openExternal(url) });
  });
  handle('keys:save', async (id, value, action, command, expected, when) => {
    const focus = focuses.get(id); if (!focus) throw new Error('Closed tab.');
    await keys.save(await configFor(focus.cwd), value, action, command, expected, when);
  });
  handle('keys:run', async (id, combo, context = '', help = false) => {
    const focus = focuses.get(id); if (!focus) throw new Error('Closed tab.');
    const config = await configFor(focus.cwd);
    const binding = config.keys.bindings.find(item => item.combo === combo);
    if (!binding) throw new Error('Key binding no longer exists. Reload keys.');
    if (binding.kind !== 'exec') return binding;
    return keys.program(binding.filename, help === true ? ['--help'] : [], { cwd: await worlds.physical(focus), env: { ...config.environment, PATH: `${path.join(root, '../../bin')}${path.delimiter}${config.environment.PATH || process.env.PATH}`, YHWH_KEY: combo, YHWH_PREFIX: binding.prefix, YHWH_TAB: id }, input: String(context) });
  });
  handle('keys:shell', async (id, command, directory = '') => {
    const focus = focuses.get(id); if (!focus) throw new Error('Closed tab.');
    const config = await configFor(focus.cwd);
    const view = keys.namespace(config.keys.bindings, `cd ${directory}`);
    if (/^cd(?:\s|$)/.test(command.trim())) { const next = keys.namespace(config.keys.bindings, command, directory); return { directory: next.directory, stdout: keys.listing(next.bindings), code: 0 }; }
    if (['ls', 'pwd'].includes(command.trim())) return { directory, stdout: command.trim() === 'pwd' ? `/${directory}\n` : keys.listing(view.bindings), code: 0 };
    return keys.program(process.env.YHWH_BASH || 'bash', ['--noprofile', '--norc', '-c', command], { cwd: await worlds.physical(focus), env: { ...config.environment, YHWH_KEYS_NAMESPACE: directory, YHWH_PREFIX: config.userDirectory }, input: keys.listing(view.bindings) });
  });
  handle('config:open', async () => { await fs.mkdir(userDirectory(), { recursive: true }); const filename = path.join(userDirectory(), three ? 'rc.three' : 'rc'); await fs.appendFile(filename, '', { mode: 0o600 }); return filename; });
  handle('words:save', async words => {
    const filename = require('../../../lib/paths.cjs').etc('default', 'words.json');
    const original = JSON.parse(await fs.readFile(filename, 'utf8'));
    for (const [key, value] of Object.entries(words)) { if (!(key in original) || typeof value !== 'string') throw new Error(ui("unknown-text-entry-")); original[key] = value; }
    await fs.writeFile(filename, `${JSON.stringify(original, null, 2)}\n`);
    return original;
  });
  handle('plugins', async (configuration, origins = {}) => {
    const directories = [path.join(root, 'plugins', 'hello-world')];
    let extra = [];
    try { extra = JSON.parse(configuration || '[]'); } catch { throw new Error(ui("plugins-must-be-a-json-array-of-plugin-directori")); }
    for (const value of extra) directories.push(path.resolve(origins.plugins || userDirectory(), value));
    const plugins = [];
    for (const directory of [...new Set(directories)]) {
      try { plugins.push({ directory, source: await fs.readFile(path.join(directory, 'main.js'), 'utf8') }); }
      catch (error) { plugins.push({ directory, error: error.message }); }
    }
    return plugins;
  });
  handle('circus', () => require('../../../lib/circus.cjs').nextPair());
  handle('external', async url => {
    const parsed = new URL(url);
    if (!['https:', 'http:', 'mailto:'].includes(parsed.protocol)) throw new Error(ui("only-web-and-email-links-can-open-externally-"));
    await shell.openExternal(parsed.href);
  });
  handle('offering:piece', async directory => {
    const result = await dialog.showOpenDialog(window, { title: ui("choose-a-piece-offering"), defaultPath: directory, properties: [ui("openfile")] });
    if (result.canceled) return null;
    const filename = result.filePaths[0];
    // A mailto cannot attach files portably. State that explicitly; never claim
    // that choosing a file uploaded or emailed its contents.
    const body = ui("i-d-like-to-share-as-a-piece-offering-attach-the", path.basename(filename));
    await shell.openExternal(`mailto:yhwh@thedynamiclinker.com?subject=${encodeURIComponent(ui("piece-offering"))}&body=${encodeURIComponent(body)}`);
    return filename;
  });
  handle('window:close', () => { quitting = true; window.close(); });
  for (const [channel, type] of [['terminal:write', 'write'], ['terminal:resize', 'resize']]) {
    ipcMain.on(channel, (event, message) => { if (event.senderFrame.url === entry && terminals.has(message.id)) host.send({ ...message, type }); });
  }
  Menu.setApplicationMenu(null);
  window = new BrowserWindow({
    ...require('../../../etc/default/window.json'),
        
    title: ui("yhwh"), icon: require('../../../lib/paths.cjs').etc('assets', development ? 'icon-development.png' : 'icon.png'), autoHideMenuBar: true,
    webPreferences: { preload: require('../../../lib/paths.cjs').output('default/ui/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.on('close', event => { if (!quitting) { event.preventDefault(); command('quit'); } });
  app.on('before-quit', event => { if (!quitting) { event.preventDefault(); command('quit'); } });
  window.on('closed', () => app.quit());
  await window.loadURL(entry);
}
app.on('will-quit', () => {
  quitting = true;
  for (const controller of conversations.values()) controller.abort();
  for (const focus of focuses.values()) { focus.watcher?.close(); clearTimeout(focus.watchTimer); }
  host?.disconnect();
});
