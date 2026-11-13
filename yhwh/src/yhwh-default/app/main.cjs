const ui = require('../../../lib/text.cjs').text(require('../../../etc/default/text-main.json'));
const { app, BrowserWindow, ipcMain, dialog, Menu, shell, clipboard } = require('electron');
const fs = require('node:fs/promises');
const watch = require('node:fs').watch;
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const files = require('../../../lib/files.cjs');
const { resolveConfig, configLocations, userDirectory, saveSettings } = require('./config.cjs');

const root = path.join(__dirname, '..');
const profile = process.env.YHWH_DATA_DIR || path.join(userDirectory(), 'state');
app.setPath(ui("userdata"), profile);
app.setName(ui("yhwh"));
const entry = pathToFileURL(require('../../../lib/paths.cjs').etc('default', 'index.html')).href;
let window, host, loaded = false, quitting = false;
const focuses = new Map();
const pendingOpens = [];
const configCache = new Map();
function send(channel, message) { if (window && !window.isDestroyed()) window.webContents.send(channel, message); }
function command(name) { send('command', name); }
function flag(argv, name) { const inline = argv.find(arg => arg.startsWith(`${name}=`)); if (inline) return inline.slice(name.length + 1); const index = argv.indexOf(name); return index < 0 ? null : argv[index + 1]; }
function request(argv, cwd = process.cwd()) {
  const filename = flag(argv, '--open');
  return { path: path.resolve(cwd, filename || flag(argv, '--cwd') || cwd), tab: flag(argv, '--tab'), theme: flag(argv, '--theme') };
}

const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
else {
  app.on('second-instance', (_event, argv, cwd) => {
    const opening = request(argv, cwd);
    if (loaded) send('open', opening); else pendingOpens.push(opening);
    window?.show(); window?.focus();
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
  const locations = await configLocations(path.resolve(target));
  async function stamp(values = {}) {
    const tracked = [...locations.map(location => path.join(location.directory, 'rc')), ...[values.stylesheet, values.bg].filter(Boolean)];
    return (await Promise.all(tracked.map(async filename => { try { const stat = await fs.stat(filename); return `${filename}:${stat.mtimeMs}:${stat.size}:${stat.mode}`; } catch { return filename; } }))).join('|');
  }
  const signature = await stamp(previous?.config.values);
  if (previous?.signature === signature) return previous.config;
  const config = await resolveConfig(target);
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

function watchDirectory(focus) {
  focus.watcher?.close();
  clearTimeout(focus.watchTimer);
  try {
    focus.watcher = watch(focus.cwd, () => {
      clearTimeout(focus.watchTimer);
      focus.watchTimer = setTimeout(() => send('directory-changed', { id: focus.id }), 150);
    });
    focus.watcher.on('error', () => {});
  } catch {}
}

async function navigate(id, directory, fromShell = false) {
  const focus = focuses.get(id);
  if (!focus) throw new Error(ui("that-tab-has-closed-"));
  directory = path.resolve(focus.cwd, directory);
  const stat = await fs.stat(directory);
  if (!stat.isDirectory()) throw new Error(ui("choose-a-directory-"));
  focus.cwd = directory;
  watchDirectory(focus);
  if (!fromShell) host.send({ type: 'cd', id, cwd: directory });
  const config = await configFor(directory);
  return { cwd: directory, entries: await files.list(directory, config.values.show_hidden === 'true'), config };
}

async function launch() {
  await fs.mkdir(profile, { recursive: true });
  host = spawn(process.env.YHWH_NODE || 'node', [path.join(__dirname, '../../../bin/default/terminal-host.cjs')], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true,
  });
  host.stderr.on('data', data => process.stderr.write(data));
  host.stdout.on('data', () => {});
  host.on('error', error => send('terminal', { type: 'error', message: error.message }));
  host.on('exit', code => { if (!quitting) send('terminal', { type: 'error', message: ui("terminal-process-exited-restart-the-app-to-start", code) }); });
  host.on('message', async message => {
    send('terminal', message);
    if (message.type === 'cwd' && focuses.has(message.id)) {
      try { send('navigation', { id: message.id, ...await navigate(message.id, message.cwd, true) }); }
      catch (error) { send('error', error.message); }
    }
  });
  handle('bootstrap', async () => {
    loaded = true;
    return { root, initial: request(process.argv), pending: pendingOpens.splice(0), words: JSON.parse(await fs.readFile(require('../../../lib/paths.cjs').etc('default', 'words.json'), 'utf8')), home: os.homedir(), platform: process.platform };
  });
  handle('focus:new', async (id, directory) => {
    if (typeof id !== 'string' || focuses.has(id)) throw new Error(ui("invalid-tab-"));
    const focus = { id, cwd: path.resolve(directory) };
    focuses.set(id, focus);
    try {
      const result = await navigate(id, focus.cwd, true);
      host.send({ type: 'start', id, cwd: focus.cwd, env: { PATH: `${path.join(root, '../../bin')}${path.delimiter}${path.join(root, 'bin')}${path.delimiter}${process.env.PATH}` } });
      return result;
    } catch (error) { focuses.delete(id); throw error; }
  });
  handle('focus:close', id => { const focus = focuses.get(id); focus?.watcher?.close(); clearTimeout(focus?.watchTimer); focuses.delete(id); host.send({ type: 'close', id }); });
  handle('navigate', navigate);
  handle('list', async id => { const focus = focuses.get(id); if (!focus) throw new Error(ui("closed-tab-")); const config = await configFor(focus.cwd); return { cwd: focus.cwd, entries: await files.list(focus.cwd, config.values.show_hidden === 'true'), config }; });
  handle('file:read', async filename => { const config = await configFor(filename); return { ...await files.read(filename, config.values), config }; });
  handle('path:stat', async filename => { const absolute = path.resolve(filename); const stat = await fs.stat(absolute); return { path: absolute, directory: stat.isDirectory() }; });
  handle('file:save', files.save);
  handle('file:create', files.create);
  handle('file:move', files.move);
  handle('file:copy', async (source, destination) => { await fs.cp(source, destination, { recursive: true, errorOnExist: true, force: false }); return destination; });
  handle('file:trash', filename => shell.trashItem(filename));
  handle('file:external', filename => shell.openPath(filename));
  handle('file:reveal', filename => shell.showItemInFolder(filename));
  handle('clipboard:path', filename => clipboard.writeText(filename));
  handle('choose', async (kind, directory) => {
    const result = await dialog.showOpenDialog(window, { defaultPath: directory, properties: kind === 'directory' ? [ui("opendirectory")] : [ui("openfile")] });
    return result.canceled ? null : result.filePaths[0];
  });
  handle('choose:save', async (directory, name) => { const result = await dialog.showSaveDialog(window, { defaultPath: path.join(directory, name) }); return result.canceled ? null : result.filePath; });
  handle('settings:save', async (values, scope) => { await saveSettings(values, scope); configCache.clear(); });
  handle('config:reload', () => configCache.clear());
  handle('config:open', async () => { await fs.mkdir(userDirectory(), { recursive: true }); const filename = path.join(userDirectory(), 'rc'); await fs.appendFile(filename, '', { mode: 0o600 }); return filename; });
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
    ipcMain.on(channel, (event, message) => { if (event.senderFrame.url === entry && focuses.has(message.id)) host.send({ ...message, type }); });
  }
  const template = [
    { label: ui("file"), submenu: [
      { label: ui("new-tab"), click: () => command('new-tab') }, { label: ui("new-file"), click: () => command('new-file') },
      { label: ui("open-file-"), click: () => command('open-file') }, { label: ui("open-directory-"), click: () => command('open-directory') },
      { label: ui("save"), click: () => command('save') }, { type: 'separator' }, { label: ui("close-tab"), click: () => command('close-tab') }, { role: 'quit' },
    ] },
    { role: ui("editmenu") },
    { label: ui("view"), submenu: [
      ...[[ui("toggle-file-manager"), 'toggle-files'], [ui("expand-file-manager"), 'expand-files'], [ui("toggle-terminal"), 'toggle-terminal'], [ui("expand-terminal"), 'expand-terminal'], [ui("focus-editor"), 'focus-editor'], [ui("command-palette"), 'palette'], [ui("settings"), 'settings']].map(([label, id]) => ({ label, click: () => command(id) })),
      { type: 'separator' }, { role: 'reload' }, { role: ui("toggledevtools") }, { role: 'togglefullscreen' },
    ] },
    { label: ui("offerings"), submenu: [{ label: ui("burnt-offering"), click: () => command('burnt') }, { label: ui("piece-offering"), click: () => command('piece') }] },
    { label: ui("help"), submenu: [
      { label: ui("keyboard-shortcuts"), click: () => command('help') },
      { label: ui("about-us"), click: () => shell.openExternal('https://thedynamiclinker.com') },
      { label: ui("about-yhwh"), click: () => command('about') },
    ] },
  ];
  if (process.platform === 'darwin') template.unshift({ role: ui("appmenu") });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  window = new BrowserWindow({
    ...require('../../../etc/default/window.json'),
        
    title: ui("yhwh"), icon: require('../../../lib/paths.cjs').etc('assets', 'icon.png'), autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
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
  for (const focus of focuses.values()) { focus.watcher?.close(); clearTimeout(focus.watchTimer); }
  host?.disconnect();
});
