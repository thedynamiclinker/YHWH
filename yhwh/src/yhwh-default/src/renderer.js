import { text as interfaceText } from '../../../lib/text.cjs';
import interfaceCopy from '../../../etc/default/text-renderer.json';
const ui = interfaceText(interfaceCopy);
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { createEditor, setLanguage, formatText, renderMarkdown, languageNames } from './editor.js';

const bridge = window.yhwh;
const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const call = (channel, ...args) => bridge.call(channel, ...args);
const tabs = [], commands = new Map(), listeners = new Map();
let activeId, boot, words, toastTimer, clipboardFiles, pluginCleanup = [], pluginKey = '', pluginGeneration = 0;
const active = () => tabs.find(tab => tab.id === activeId);
const basename = filename => filename.replace(/[/\\]+$/, '').split(/[/\\]/).at(-1) || filename;
const join = (directory, name) => /^(?:[/\\]|[A-Z]:[/\\])/i.test(name) ? name : `${directory.replace(/[/\\]$/, '')}/${name}`;
const parent = filename => { const value = filename.replace(/[/\\][^/\\]+[/\\]?$/, '') || (boot.platform === 'win32' ? filename.slice(0, 3) : '/'); return /^[A-Z]:$/i.test(value) ? `${value}/` : value; };
const humanSize = size => size > 1048576 ? ui("mb", (size / 1048576).toFixed(1)) : size > 1024 ? ui("kb", Math.round(size / 1024)) : ui("b", size);
function emit(name, value) { for (const callback of listeners.get(name) || []) callback(value); }
function notice(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 6000); }
function run(name) { const item = commands.get(name); if (item) return Promise.resolve().then(item.run).catch(error => notice(error.message)); }
function addCommand(item) { commands.set(item.id, item); return () => commands.delete(item.id); }
function editButton(key) { return ui("-", key, key); }
function word(key, tag = 'p') { return `<${tag}>${escape(words[key])} ${editButton(key)}</${tag}>`; }

function modal(title, content, setup) {
  const dialog = $('#dialog');
  if (dialog.open) dialog.close();
  dialog.innerHTML = ui("--2", escape(title), content);
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  dialog.showModal();
  setup?.(dialog);
  return dialog;
}
function promptText(title, label, initial = '') {
  return new Promise(resolve => {
    const dialog = modal(title, ui("cancel-save", escape(label), escape(initial)));
    let result = null;
    dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
    dialog.querySelector('form').onsubmit = event => { event.preventDefault(); result = dialog.querySelector('input').value; dialog.close(); };
    dialog.addEventListener('close', () => resolve(result), { once: true });
    const input = dialog.querySelector('input'); input.focus(); input.select();
  });
}
function choose(title, message, options) {
  return new Promise(resolve => {
    const dialog = modal(title, ui("template", escape(message), options.map((option, index) => `<button data-choice="${index}" class="${index === 0 ? 'primary' : ''}">${escape(option)}</button>`).join('')));
    let result = -1;
    for (const button of dialog.querySelectorAll('[data-choice]')) button.onclick = () => { result = Number(button.dataset.choice); dialog.close(); };
    dialog.addEventListener('close', () => resolve(result), { once: true });
  });
}
async function editWords(key) {
  const dialog = modal(ui("edit-yhwh-text"), ui("saving-updates-yhwh-etc-default-words-json-in-th", escape(key), escape(words[key])));
  dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
  dialog.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    try { words = await call('words:save', { [key]: dialog.querySelector('textarea').value }); dialog.close(); for (const tab of tabs) if (!tab.file) welcome(tab); pluginKey = ''; update(); notice(ui("saved-to-yhwh-etc-default-words-json-")); }
    catch (error) { notice(error.message); }
  };
}

async function newTab(directory = active()?.cwd || boot.home) {
  const id = crypto.randomUUID();
  const state = await call('focus:new', id, directory);
  const tab = { id, ...state, file: null, selected: new Set(), history: [state.cwd], historyIndex: 0, showFiles: state.config.values.file_manager !== 'false', showTerminal: state.config.values.terminal === 'true', expanded: '', terminalExited: false };
  tab.document = document.createElement('section'); tab.document.className = 'document-content'; tab.document.dataset.tab = id;
  $('#documents').append(tab.document);
  tab.terminalElement = document.createElement('div'); tab.terminalElement.className = 'terminal-instance'; tab.terminalElement.dataset.tab = id;
  $('#terminals').append(tab.terminalElement);
  tab.terminal = new Terminal({ cursorBlink: true, fontFamily: ui("-dejavu-sans-mono-monospace"), fontSize: 12, scrollback: 5000, theme: { background: '#131317', foreground: '#d4d0da', cursor: '#b7a1ef', selectionBackground: '#5c447977' } });
  tab.fit = new FitAddon(); tab.terminal.loadAddon(tab.fit); tab.terminal.open(tab.terminalElement);
  tab.terminal.onData(data => bridge.terminal('write', { id, data }));
  tab.terminal.attachCustomKeyEventHandler(event => {
    if ((event.ctrlKey || event.metaKey) && ['b', 'e', 'd', 't', 'w', 'p', ','].includes(event.key.toLowerCase())) return false;
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'c') { navigator.clipboard.writeText(tab.terminal.getSelection()).catch(() => {}); return false; }
    return true;
  });
  tabs.push(tab); welcome(tab); activate(id);
  for (const message of pendingTerminal.get(id) || []) terminalMessage(message);
  pendingTerminal.delete(id);
  emit('tab', tab); return tab;
}
function welcome(tab) {
  tab.document.innerHTML = ui("-a-little-room-for-creation-open-a-file-ctrl-o-n", word('welcomeTitle', 'h1'), word('welcomeBody'));
}
function activate(id) {
  activeId = id;
  for (const tab of tabs) { tab.document.hidden = tab.id !== id; tab.terminalElement.hidden = tab.id !== id; }
  $('#file-filter').value = '';
  update();
  requestAnimationFrame(() => fitTerminal());
  emit('focus', active());
}
function tabTitles() {
  $('#tabs').innerHTML = tabs.map(tab => ui("--3", tab.id === activeId, tab.id, escape(tab.file?.path || tab.cwd), tab.dirty ? '● ' : '', escape(tab.file?.name || basename(tab.cwd)), tab.id, escape(tab.file?.name || basename(tab.cwd)))).join('');
}
function renderFiles() {
  const tab = active(); if (!tab) return;
  const filter = $('#file-filter').value.toLocaleLowerCase();
  const rows = [{ name: '..', path: parent(tab.cwd), directory: true, parent: true }, ...tab.entries.filter(entry => entry.name.toLocaleLowerCase().includes(filter))];
  $('#file-list').innerHTML = rows.map(entry => ui("template-2", entry.directory ? 'directory' : '', entry.parent ? 'parent-row' : '', tab.selected.has(entry.path) ? 'selected' : '', tab.selected.has(entry.path), escape(entry.path), entry.directory, !!entry.parent, escape(entry.path), entry.parent ? '↑' : entry.broken ? '!' : entry.directory ? '▱' : '≡', escape(entry.name), entry.parent ? '' : entry.directory ? 'Directory' : humanSize(entry.size), entry.modified ? new Date(entry.modified).toLocaleString() : '')).join('');
  $('#file-count').textContent = `${tab.entries.length} items${tab.selected.size ? ` · ${tab.selected.size} selected` : ''}`;
  $('#location').value = tab.cwd;
  $('#terminal-cwd').textContent = tab.cwd;
  $('#shell-state').textContent = tab.terminalExited ? ui("shell-exited") : ui("-files");
}
function update() {
  const tab = active(); if (!tab) return;
  tabTitles(); renderFiles();
  $('#navigation-area').hidden = !tab.showFiles && tab.expanded !== 'files';
  $('#terminal-panel').hidden = !tab.showTerminal && tab.expanded !== 'terminal';
  $('#workspace').dataset.expanded = tab.expanded;
  $('#title-row').hidden = !tab.file;
  $('#file-title').value = tab.file?.name || '';
  $('#dirty-indicator').textContent = tab.dirty ? ui("unsaved") : '';
  $('#document-path').textContent = tab.file ? parent(tab.file.path) : tab.cwd;
  $('#language-button').textContent = tab.file?.language || ui("plain-text");
  $('#file-encoding').textContent = tab.file?.kind === 'text' ? ui("utf-8-", tab.file.newline === '\r\n' ? 'CRLF' : 'LF') : '';
  $('#view-mode').textContent = tab.file?.language === 'markdown' ? tab.file.mode === 'source' ? ui("source") : tab.file.mode === 'reading' ? ui("reading") : ui("live-preview") : ['json', 'html'].includes(tab.file?.language) ? ui("pretty-format") : ui("source");
  $('#view-mode').disabled = tab.file?.kind !== 'text';
  applyConfig(tab.config);
}
let temporaryEnergy;
function applyConfig(config) {
  const values = config.values, style = document.documentElement.style;
  for (const [property, value] of Object.entries({ '--editor-size': `${Number(values.font_size) || 16}px`, '--sidebar-width': `${Number(values.sidebar_width) || 258}px`, '--terminal-height': `${Number(values.terminal_height) || 240}px`, '--editor-font': values.editor_font || ui("-segoe-ui-system-ui-sans-serif"), '--line-width': values.line_width || '820px' })) style.setProperty(property, value);
  const energy = temporaryEnergy ?? (values.theme === 'dawkins' ? 0 : values.theme === 'nietzsche' ? 50 : Number(values.energy ?? 100));
  document.body.dataset.theme = energy === 0 ? 'dawkins' : energy < 100 ? 'nietzsche' : 'yhwh';
  document.body.classList.toggle('theme-dark', values.theme !== 'light'); document.body.classList.toggle('theme-light', values.theme === 'light');
  $('#energy').value = energy;
  $('#mode-name').textContent = energy === 0 ? ui("dawkins") : energy < 100 ? ui("nietzsche") : ui("yhwh");
  $('#divine-footnote').textContent = energy === 0 ? words.dawkins : energy < 100 ? words.nietzsche : words.footer;
  $('#workspace').style.backgroundImage = config.background ? `linear-gradient(#1b1b20ce,#1b1b20ce), url("${config.background}")` : '';
  $('#user-theme').textContent = config.css || '';
  document.title = values.title || ui("-yhwh", active()?.file?.name || basename(active()?.cwd || ''));
  reloadPlugins(config).catch(error => notice(error.message));
}
function fitTerminal() {
  const tab = active(); if (!tab || $('#terminal-panel').hidden) return;
  try { tab.fit.fit(); bridge.terminal('resize', { id: tab.id, cols: tab.terminal.cols, rows: tab.terminal.rows }); } catch {}
}
async function refresh(tab = active()) {
  if (!tab) return;
  const state = await call('list', tab.id);
  Object.assign(tab, state);
  if (tab.id === activeId) { renderFiles(); applyConfig(tab.config); }
}
async function navigate(directory, tab = active(), history = true) {
  const state = await call('navigate', tab.id, directory);
  Object.assign(tab, state); tab.selected.clear();
  if (history && tab.history[tab.historyIndex] !== tab.cwd) { tab.history.splice(tab.historyIndex + 1); tab.history.push(tab.cwd); tab.historyIndex = tab.history.length - 1; }
  if (tab.id === activeId) { $('#file-filter').value = ''; update(); }
  emit('navigate', { id: tab.id, cwd: tab.cwd });
}
async function mayReplace(tab) {
  if (!tab.dirty) return true;
  const choice = await choose(ui("unsaved-changes"), ui("save-changes-to-", tab.file.name), [ui("save"), ui("discard"), ui("cancel")]);
  if (choice === 0) { await save(tab); return true; }
  return choice === 1;
}
function clearDocument(tab) { tab.editor?.destroy(); tab.editor = null; tab.document.innerHTML = ''; }
async function openFile(filename, tab = active()) {
  if (!await mayReplace(tab)) return false;
  const file = await call('file:read', filename);
  await navigate(parent(file.path), tab);
  clearDocument(tab);
  file.mode = file.language === 'markdown' && file.config.values.live_preview !== 'false' ? 'live' : 'source';
  tab.file = file; tab.config = file.config; tab.dirty = false;
  tab.selected = new Set([file.path]);
  tab.document.dataset.filename = file.path;
  tab.document.innerHTML = ui("template-3");
  if (file.kind === 'text') {
    tab.editor = await createEditor(tab.document.querySelector('.editor-host'), file, content => {
      tab.dirty = content !== tab.file.content.replace(/\r\n/g, '\n');
      if (tab.id === activeId) { $('#dirty-indicator').textContent = tab.dirty ? ui("unsaved") : ''; tabTitles(); }
      emit('change', { path: file.path, content });
    }, (line, column) => { if (tab.id === activeId) $('#cursor-position').textContent = ui("ln-col", line, column); });
  } else if (file.kind === 'image') tab.document.innerHTML = ui("template-4", file.data, escape(file.name));
  else tab.document.innerHTML = ui("-this-format-opens-in-your-desktop-s-default-app", escape(file.name), escape(file.mime), humanSize(file.size));
  tab.expanded = '';
  tab.document.dataset.language = file.language; tab.document.dataset.mode = file.mode;
  if (tab.id === activeId) { update(); tab.editor?.focus(); }
  emit('open', file); return true;
}
async function save(tab = active(), force = false) {
  if (!tab?.editor) return;
  const text = tab.editor.state.doc.toString();
  const content = tab.file.newline === '\r\n' ? text.replace(/\n/g, '\r\n') : text;
  const state = await call('file:save', tab.file.path, content, tab.file.modified, force);
  Object.assign(tab.file, state, { content }); tab.dirty = tab.editor.state.doc.toString() !== text;
  if (tab.id === activeId) update();
  emit('save', tab.file);
}
async function closeTab(id = activeId) {
  const tab = tabs.find(item => item.id === id);
  if (!tab || !await mayReplace(tab)) return;
  await call('focus:close', id);
  tab.editor?.destroy(); tab.terminal.dispose(); tab.document.remove(); tab.terminalElement.remove();
  const index = tabs.indexOf(tab); tabs.splice(index, 1);
  if (!tabs.length) await newTab(tab.cwd);
  else activate(tabs[Math.min(index, tabs.length - 1)].id);
}
async function newFile(directory = false) {
  const tab = active(), name = await promptText(directory ? ui("new-directory") : ui("new-file"), ui("name-including-any-extension"));
  if (!name) return;
  const filename = await call('file:create', join(tab.cwd, name), directory);
  await refresh(tab);
  if (!directory) await openFile(filename, tab);
}
async function renameFile(filename = active()?.file?.path) {
  if (!filename) return;
  const name = await promptText(ui("rename"), ui("name"), basename(filename));
  if (!name || name === basename(filename)) return;
  await renameTo(filename, name);
}
async function renameTo(filename, name) {
  if (!name.trim() || /[/\\]/.test(name) || ['.', '..'].includes(name)) throw new Error(ui("use-a-filename-without-slashes-"));
  const destination = await call('file:move', filename, join(parent(filename), name));
  for (const tab of tabs) {
    if (tab.file?.path === filename) {
      const updated = await call('file:read', destination);
      tab.file.path = destination; tab.file.name = name; tab.file.modified = updated.modified; tab.file.language = updated.language;
      tab.document.dataset.filename = destination; tab.document.dataset.language = updated.language;
      if (tab.editor) await setLanguage(tab.editor, updated.language, tab.file.mode !== 'source');
    }
  }
  await refresh(); update();
}
function selectedPaths() { return [...active().selected].filter(filename => filename !== parent(active().cwd)); }
async function pasteFiles() {
  if (!clipboardFiles) return;
  for (const filename of clipboardFiles.paths) await call(clipboardFiles.cut ? 'file:move' : 'file:copy', filename, join(active().cwd, basename(filename)));
  if (clipboardFiles.cut) clipboardFiles = null;
  await refresh();
}
async function trashFiles(paths = selectedPaths()) {
  if (!paths.length) return;
  if (await choose(ui("move-to-trash"), ui("move-item-s-to-the-desktop-trash-", paths.length), [ui("move-to-trash"), ui("cancel")]) !== 0) return;
  for (const filename of paths) await call('file:trash', filename);
  active().selected.clear(); await refresh();
}

function settings() {
  const tab = active(), values = tab.config.values;
  const descriptions = { theme: ui("theme-yhwh-nietzsche-dawkins"), energy: ui("yhwh-ness-0-to-100"), font_size: ui("editor-font-size"), show_hidden: ui("show-hidden-files-true-or-false"), bg: ui("background-image-path"), stylesheet: ui("theme-css-path-obsidian-theme-css-can-be-used-"), plugins: ui("plugin-directories-json-array"), editor_font: ui("editor-font-family"), sidebar_width: ui("file-manager-width"), terminal_height: ui("terminal-height"), layout: ui("panel-positions-json-object"), live_preview: ui("markdown-live-preview-true-or-false") };
  const keys = String(values.settings_fields || '').split(',').map(key => key.trim()).filter(key => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key));
  const dialog = modal(ui("settings"), ui("apply-to-everywhere-user-configuration-and-its-c", keys.map(key => `<label class="field"><span>${escape(descriptions[key] || key)}</span><input name="${key}" value="${escape(values[key] || '')}" autocomplete="off"></label>`).join(''), escape(tab.cwd), escape(tab.cwd), escape(tab.config.userDirectory), tab.config.warnings.length ? `<p class="warning">${escape(tab.config.warnings.join('\n'))}</p>` : ''));
  dialog.querySelector('[data-edit-config]').onclick = async () => { dialog.close(); const filename = await call('config:open'); await openFile(filename); };
  dialog.querySelector('[data-reload-config]').onclick = async () => { pluginKey = ''; await call('config:reload'); await refresh(); dialog.close(); notice(ui("configuration-reloaded-")); };
  dialog.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    try {
      const data = Object.fromEntries(new FormData(event.target)), scope = data._scope; delete data._scope;
      if (data.plugins) { const parsed = JSON.parse(data.plugins); if (!Array.isArray(parsed)) throw new Error(ui("plugins-must-be-a-json-array-")); }
      if (data.layout) JSON.parse(data.layout);
      if (data.energy && !(Number(data.energy) >= 0 && Number(data.energy) <= 100)) throw new Error(ui("yhwh-ness-must-be-between-0-and-100-"));
      temporaryEnergy = undefined;
      await call('settings:save', data, scope); await refresh(); dialog.close();
    } catch (error) { notice(error.message); }
  };
}
function languageMenu() {
  const tab = active(); if (!tab.file || !tab.editor) return;
  const names = languageNames();
  if (!names.includes(tab.file.language)) names.push(tab.file.language);
  const dialog = modal(ui("file-type"), ui("language-inferred-remember-this-choice-only-for-", escape(tab.file.mime), names.map(name => `<option ${tab.file.language === name ? 'selected' : ''}>${escape(name)}</option>`).join(''), escape(tab.cwd)));
  dialog.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    try {
      const data = Object.fromEntries(new FormData(event.target));
      if (data.remember !== 'no') {
        const extension = tab.file.name.includes('.') ? tab.file.name.split('.').at(-1) : '';
        if (!extension && data.remember !== 'filename') throw new Error(ui("this-file-has-no-extension-choose-the-filename-r"));
        const rule = data.remember === 'filename' ? { filename: `^${tab.file.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, language: data.language } : { extension, language: data.language };
        const rules = JSON.parse(tab.config.values.file_types || '[]'); rules.push(rule);
        await call('settings:save', { file_types: JSON.stringify(rules) }, data.remember === 'directory' ? tab.cwd : '/');
      }
      tab.file.language = data.language; tab.document.dataset.language = data.language;
      await setLanguage(tab.editor, data.language, tab.file.mode !== 'source');
      dialog.close(); update();
    } catch (error) { notice(error.message); }
  };
}
async function viewMode() {
  const tab = active(); if (!tab?.editor) return;
  if (tab.file.language === 'markdown') {
    tab.file.mode = tab.file.mode === 'live' ? 'source' : 'live';
    tab.document.querySelector('.editor-host').hidden = false;
    tab.document.querySelector('.reading-view').hidden = true;
    await setLanguage(tab.editor, 'markdown', tab.file.mode === 'live');
  } else {
    const text = await formatText(tab.editor.state.doc.toString(), tab.file.language);
    tab.editor.dispatch({ changes: { from: 0, to: tab.editor.state.doc.length, insert: text } });
  }
  tab.document.dataset.mode = tab.file.mode;
  update(); tab.editor.focus();
}
function readingView() {
  const tab = active(); if (!tab?.editor || tab.file.language !== 'markdown') return;
  const reading = tab.document.querySelector('.reading-view');
  if (tab.file.mode === 'reading') return viewMode();
  reading.innerHTML = renderMarkdown(tab.editor.state.doc.toString(), tab.file.path);
  reading.hidden = false; tab.document.querySelector('.editor-host').hidden = true; tab.file.mode = 'reading'; tab.document.dataset.mode = 'reading'; update();
}
function fileMenu(filename = active()?.file?.path) {
  if (!filename) return;
  const items = [
    [ui("open-in-a-new-app-tab"), () => openRequest({ path: filename })],
    [ui("rename-"), () => renameFile(filename)],
    [ui("copy"), () => { clipboardFiles = { paths: [filename], cut: false }; }],
    [ui("cut"), () => { clipboardFiles = { paths: [filename], cut: true }; }],
    [ui("copy-path"), () => call('clipboard:path', filename)],
    [ui("open-in-desktop-application"), () => call('file:external', filename)],
    [ui("show-in-desktop-file-manager"), () => call('file:reveal', filename)],
    [ui("reading-view-markdown-"), readingView],
    [ui("overwrite-file-with-editor-contents-"), async () => { if (await choose(ui("overwrite-file"), ui("replace-the-on-disk-contents-with-this-editor-s-"), [ui("overwrite"), ui("cancel")]) === 0) await save(active(), true); }],
    [ui("move-to-trash-"), () => trashFiles([filename])],
  ];
  const dialog = modal(basename(filename), ui("template-5", items.map(([label], i) => `<button data-menu="${i}">${escape(label)}</button>`).join('')));
  for (const button of dialog.querySelectorAll('[data-menu]')) button.onclick = () => { dialog.close(); Promise.resolve().then(items[Number(button.dataset.menu)][1]).catch(error => notice(error.message)); };
}
function palette() {
  const dialog = modal(ui("commands"), ui("template-6"));
  const render = () => {
    const filter = $('#palette-search').value.toLowerCase();
    const found = [...commands.values()].filter(item => item.name.toLowerCase().includes(filter));
    $('#palette-results').innerHTML = found.map(item => ui("template-7", escape(item.id), escape(item.name), item.keys ? `<kbd>${escape(item.keys)}</kbd>` : '')).join('');
    for (const button of dialog.querySelectorAll('[data-palette-command]')) button.onclick = () => { dialog.close(); run(button.dataset.paletteCommand); };
  };
  dialog.querySelector('input').oninput = render;
  dialog.querySelector('input').onkeydown = event => { if (event.key === ui("enter")) dialog.querySelector('[data-palette-command]')?.click(); if (event.key === ui("arrowdown")) { event.preventDefault(); dialog.querySelector('[data-palette-command]')?.focus(); } };
  render(); dialog.querySelector('input').focus();
}
function offerings() {
  modal(words.offeringsTitle, ui("burnt-offering-support-the-work-piece-offering-s", editButton('offeringsTitle'), word('offeringsBody')));
}
function burnt() {
  modal(words.burntTitle, ui("1-create-the-ld-stripe-account-use-the-business-", editButton('burntTitle'), word('burntBody'), active().config.values.stripe_payment_link ? '<button class="primary" data-command="pay">Open configured payment page ↗</button>' : ''));
}
function piece() {
  modal(words.pieceTitle, ui("recipient-yhwh-thedynamiclinker-com-no-file-is-u", editButton('pieceTitle'), word('pieceBody')));
}
function about() {
  modal(words.aboutTitle, ui("-about-us-genesis-by-the-nameless-", editButton('aboutTitle'), word('aboutBody')));
}
function upgrades() { modal(ui("coming-soon"), ui("support-development", word('upgrades'), word('comingSoon'))); }
async function circus() {
  const dialog = modal(ui("nietzsche-family-circus"), ui("fetching-a-cartoon-and-a-wildly-inappropriate-ph"));
  try {
    const pair = await call('circus');
    if (!dialog.open || dialog.querySelector('h2')?.textContent !== ui("nietzsche-family-circus")) return;
    dialog.querySelector('.dialog-body').innerHTML = ui("cartoon-and-pairing-from-nietzsche-family-circus", pair.image, escape(pair.quote), escape(pair.permalink));
  } catch (error) { if (dialog.open) dialog.querySelector(ui("-dialog-body-p")).textContent = error.message; }
}
function modes() {
  const dialog = modal(ui("yhwh-ness"), ui("yhwh-all-the-personality-nietzsche-a-little-doub"));
  for (const button of dialog.querySelectorAll('[data-energy]')) button.onclick = () => { setEnergy(Number(button.dataset.energy)); dialog.close(); };
}
async function setEnergy(value) {
  temporaryEnergy = value; applyConfig(active().config);
  await call('settings:save', { theme: value === 0 ? 'dawkins' : value < 100 ? 'nietzsche' : 'yhwh', energy: String(value) });
  temporaryEnergy = undefined; await refresh();
}
function help() {
  modal(ui("help"), ui("each-tab-is-a-directory-a-shell-and-an-optional-", [...commands.values()].filter(item => item.keys).map(item => `<div><span>${escape(item.name)}</span><kbd>${escape(item.keys)}</kbd></div>`).join('')));
}

const panels = new Map();
function movePanel(id, area) {
  const element = panels.get(id)?.element || ({ files: $('#navigation-area'), terminal: $('#terminal-panel'), document: $('#document') })[id];
  if (!element) throw new Error(ui("unknown-panel-", id));
  const destination = ({ right: $('#right-panels'), center: $('#center-panels'), bottom: $('#focus-area'), left: $('#workspace') })[area];
  if (!destination || element.contains(destination)) throw new Error(ui("invalid-panel-position-"));
  if (area === 'left') destination.insertBefore(element, $('#focus-area')); else destination.append(element);
  requestAnimationFrame(fitTerminal);
}
function addPanel({ id, title, area = 'right', render }) {
  if (panels.has(id)) throw new Error(ui("panel-already-exists-", id));
  const element = document.createElement('section'); element.className = ui("plugin-panel-workspace-leaf"); element.dataset.panel = id;
  const header = document.createElement('header'); header.textContent = title; element.append(header);
  const content = document.createElement('div'); element.append(content); render?.(content);
  const panel = { element, remove() { element.remove(); panels.delete(id); } }; panels.set(id, panel); movePanel(id, area); draggable(header, id); return panel;
}
function draggable(header, id) { header.draggable = true; header.ondragstart = event => event.dataTransfer.setData('application/x-yhwh-panel', id); }
function pluginAPI() {
  return { words, notice, editWords, addCommand, addPanel, movePanel, openFile, navigate, getFocus: () => ({ id: active().id, cwd: active().cwd, file: active().file?.path }), getEditor: () => active()?.editor,
    on(name, callback) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); return () => listeners.get(name).delete(callback); },
    injectCSS(css) { const style = document.createElement('style'); style.textContent = css; document.head.append(style); return () => style.remove(); },
    files: { read: filename => call('file:read', filename), save: (filename, content, modified) => call('file:save', filename, content, modified) },
  };
}
async function reloadPlugins(config) {
  const key = `${config.values.plugins || ''}|${config.origins.plugins || ''}|${config.values.layout || ''}`;
  if (key === pluginKey) return;
  pluginKey = key;
  const generation = ++pluginGeneration;
  for (const cleanup of pluginCleanup.splice(0)) { try { cleanup(); } catch (error) { console.error(error); } }
  const modules = await call('plugins', config.values.plugins, config.origins);
  if (generation !== pluginGeneration) return;
  for (const module of modules) {
    if (module.error) { notice(module.error); continue; }
    const url = URL.createObjectURL(new Blob([module.source], { type: 'text/javascript' }));
    try {
      const plugin = await import(url);
      const cleanup = await plugin.default(pluginAPI());
      if (generation !== pluginGeneration) { cleanup?.(); return; }
      if (typeof cleanup === 'function') pluginCleanup.push(cleanup);
    } catch (error) { notice(ui("plugin-", basename(module.directory), error.message)); }
    finally { URL.revokeObjectURL(url); }
  }
  try { for (const [id, area] of Object.entries(JSON.parse(config.values.layout || '{}'))) movePanel(id, area); } catch (error) { notice(ui("layout-", error.message)); }
}

const definitions = [
  ['new-tab', ui("new-tab"), ui("ctrl-t"), () => newTab()],
  ['close-tab', ui("close-tab"), ui("ctrl-w"), () => closeTab()],
  ['next-tab', ui("next-tab"), ui("ctrl-tab-ctrl-pagedown"), () => activate(tabs[(tabs.indexOf(active()) + 1) % tabs.length].id)],
  ['previous-tab', ui("previous-tab"), ui("ctrl-shift-tab-ctrl-pageup"), () => activate(tabs[(tabs.indexOf(active()) + tabs.length - 1) % tabs.length].id)],
  ['new-file', ui("new-file"), ui("ctrl-n"), () => newFile()],
  ['new-directory', ui("new-directory"), '', () => newFile(true)],
  ['open-file', ui("open-file-"), ui("ctrl-o"), async () => { const filename = await call('choose', 'file', active().cwd); if (filename) await openFile(filename); }],
  ['open-directory', ui("go-to-directory-"), ui("ctrl-shift-o"), async () => { const directory = await call('choose', 'directory', active().cwd); if (directory) await navigate(directory); }],
  ['save', ui("save-file"), ui("ctrl-s"), () => save()],
  ['save-as', ui("save-as-"), ui("ctrl-shift-s"), async () => {
    const tab = active(); if (!tab.editor) return;
    const filename = await call('choose:save', tab.cwd, tab.file.name); if (!filename) return;
    const content = tab.editor.state.doc.toString();
    await call('file:save', filename, content, null, true); tab.dirty = false; await openFile(filename, tab);
  }],
  ['toggle-files', ui("toggle-file-manager"), ui("ctrl-e"), () => { const tab = active(); tab.showFiles = !tab.showFiles; tab.expanded = ''; update(); if (tab.showFiles) $('#file-list').focus(); requestAnimationFrame(fitTerminal); }],
  ['expand-files', ui("expand-file-manager"), ui("ctrl-d"), () => { const tab = active(); tab.expanded = tab.expanded === 'files' ? '' : 'files'; tab.showFiles = true; update(); $('#file-list').focus(); requestAnimationFrame(fitTerminal); }],
  ['toggle-terminal', ui("toggle-terminal"), ui("ctrl-b-ctrl-alt-shift-t"), () => { const tab = active(); tab.showTerminal = !tab.showTerminal; tab.expanded = ''; update(); requestAnimationFrame(() => { fitTerminal(); if (tab.showTerminal) tab.terminal.focus(); }); }],
  ['expand-terminal', ui("expand-terminal"), ui("ctrl-shift-b"), () => { const tab = active(); tab.expanded = tab.expanded === 'terminal' ? '' : 'terminal'; tab.showTerminal = true; update(); requestAnimationFrame(() => { fitTerminal(); tab.terminal.focus(); }); }],
  ['toggle-navigation', ui("toggle-files-and-terminal-together"), ui("ctrl-shift-d"), () => { const tab = active(); const show = !(tab.showFiles || tab.showTerminal); tab.showFiles = show; tab.showTerminal = show; tab.expanded = ''; update(); requestAnimationFrame(fitTerminal); }],
  ['focus-editor', ui("focus-editor"), ui("ctrl-1"), () => { active().expanded = ''; update(); active().editor?.focus(); requestAnimationFrame(fitTerminal); }],
  ['focus-files', ui("focus-file-manager"), ui("ctrl-2"), () => { active().showFiles = true; active().expanded = ''; update(); $('#file-list').focus(); }],
  ['focus-terminal', ui("focus-terminal"), ui("ctrl-3"), () => { active().showTerminal = true; active().expanded = ''; update(); requestAnimationFrame(() => { fitTerminal(); active().terminal.focus(); }); }],
  ['parent', ui("parent-directory"), ui("alt-up"), () => navigate(parent(active().cwd))],
  ['home', ui("home-directory"), '', () => navigate(boot.home)],
  ['back', ui("back"), ui("alt-left"), async () => { const tab = active(); if (tab.historyIndex > 0) { tab.historyIndex--; await navigate(tab.history[tab.historyIndex], tab, false); } }],
  ['forward', ui("forward"), ui("alt-right"), async () => { const tab = active(); if (tab.historyIndex < tab.history.length - 1) { tab.historyIndex++; await navigate(tab.history[tab.historyIndex], tab, false); } }],
  ['location', ui("edit-location"), ui("ctrl-l"), () => { active().showFiles = true; update(); $('#location').focus(); $('#location').select(); }],
  ['refresh', ui("refresh-directory-and-configuration"), ui("f5"), () => refresh()],
  ['toggle-hidden', ui("toggle-hidden-files"), ui("ctrl-h-in-files-"), async () => { const tab = active(); await call('settings:save', { show_hidden: tab.config.values.show_hidden === 'true' ? 'false' : 'true' }, tab.cwd); await refresh(); }],
  ['view-mode', ui("toggle-source-pretty-view"), ui("ctrl-shift-e"), viewMode],
  ['reading-view', ui("markdown-reading-view"), '', readingView],
  ['reload-file', ui("reload-file-from-disk"), '', async () => { if (active().file) await openFile(active().file.path); }],
  ['file-menu', ui("file-actions"), '', () => fileMenu()],
  ['open-external', ui("open-current-file-externally"), '', () => active().file && call('file:external', active().file.path)],
  ['palette', ui("command-palette"), ui("ctrl-p-ctrl-shift-p"), palette],
  ['language', ui("file-type-syntax-highlighting"), '', languageMenu],
  ['settings', ui("settings"), ui("ctrl-"), settings],
  ['edit-config', ui("edit-user-rc"), '', async () => { const filename = await call('config:open'); $('#dialog').close(); await openFile(filename); }],
  ['open-guide', ui("open-the-full-guide"), '', async () => { $('#dialog').close(); await openFile(join(boot.root, ui("readme-md"))); }],
  ['about', ui("about-yhwh"), '', about], ['help', ui("help-and-keyboard-shortcuts"), ui("f1"), help],
  ['offerings', ui("offerings"), '', offerings], ['burnt', ui("burnt-offering-setup-guide"), '', burnt], ['piece', ui("piece-offering"), '', piece],
  ['choose-offering', ui("choose-a-piece-offering"), '', async () => { const filename = await call('offering:piece', active().cwd); if (filename) notice(ui("email-prepared-attach-yourself-before-sending-no", filename)); }],
  ['pay', ui("open-configured-payment-page"), '', () => { const url = active().config.values.stripe_payment_link; if (!/^https:\/\/buy\.stripe\.com\//.test(url || '')) throw new Error(ui("set-a-valid-stripe-payment-link-in-your-rc-")); return call('external', url); }],
  ['upgrades', ui("coming-soon-yhwh-sync-stuff-three-dating"), '', upgrades],
  ['modes', ui("yhwh-nietzsche-dawkins"), '', modes], ['circus', ui("nietzsche-family-circus"), '', circus],
  ['edit-footer', ui("edit-status-text"), '', () => editWords(document.body.dataset.theme === 'dawkins' ? 'dawkins' : document.body.dataset.theme === 'nietzsche' ? 'nietzsche' : 'footer')],
  ['quit', ui("quit"), ui("ctrl-q"), async () => { for (const tab of tabs) if (!await mayReplace(tab)) return; await call('window:close'); }],
];
for (const [id, name, keys, fn] of definitions) addCommand({ id, name, keys, run: fn });

const pendingTerminal = new Map();
function terminalMessage(message) {
  const tab = tabs.find(item => item.id === message.id);
  if (!tab) { if (message.id && !message.closed) { if (!pendingTerminal.has(message.id)) pendingTerminal.set(message.id, []); pendingTerminal.get(message.id).push(message); } else if (message.type === 'error') notice(message.message); return; }
  if (message.type === 'data') tab.terminal.write(message.data);
  if (message.type === 'exit') { tab.terminalExited = true; tab.terminal.write(ui("-shell-exited-", message.code)); }
  if (message.type === 'error') { notice(message.message); tab.terminal.write(`\r\n${message.message}\r\n`); }
}
bridge.on('terminal', terminalMessage);
bridge.on('navigation', state => {
  const tab = tabs.find(item => item.id === state.id); if (!tab) return;
  Object.assign(tab, state); tab.selected.clear();
  if (tab.history[tab.historyIndex] !== tab.cwd) { tab.history.splice(tab.historyIndex + 1); tab.history.push(tab.cwd); tab.historyIndex = tab.history.length - 1; }
  if (tab.id === activeId) update(); emit('navigate', { id: tab.id, cwd: tab.cwd });
});
bridge.on('directory-changed', ({ id }) => { const tab = tabs.find(item => item.id === id); if (tab) refresh(tab).catch(error => notice(error.message)); });
bridge.on('error', notice);
bridge.on('command', run);
bridge.on('open', opening => openRequest(opening).catch(error => notice(error.message)));
async function openRequest(opening) {
  let tab = tabs.find(item => item.id === opening.tab);
  if (tab) activate(tab.id);
  const info = await call('path:stat', opening.path);
  if (info.directory) { if (tab) await navigate(info.path, tab); else tab = await newTab(info.path); }
  else { tab ||= await newTab(parent(info.path)); await openFile(info.path, tab); }
  if (opening.theme) { temporaryEnergy = opening.theme === 'dawkins' ? 0 : opening.theme === 'nietzsche' ? 50 : 100; applyConfig(active().config); }
}

document.addEventListener('click', event => {
  const edit = event.target.closest('[data-edit-word]'); if (edit) { editWords(edit.dataset.editWord); return; }
  const external = event.target.closest('[data-url]'); if (external) { call('external', external.dataset.url).catch(error => notice(error.message)); return; }
  const anchor = event.target.closest('a');
  if (anchor) {
    event.preventDefault(); const href = anchor.getAttribute('href'); if (!href) return;
    if (/^(https?:|mailto:)/.test(href)) call('external', href).catch(error => notice(error.message));
    else if (href.startsWith('#')) active()?.document.querySelector(`[id="${CSS.escape(href.slice(1))}"]`)?.scrollIntoView();
    else {
      let decoded = href; try { decoded = decodeURIComponent(href); } catch {}
      const filename = join(parent(active().file?.path || join(active().cwd, '_')), decoded);
      openFile(filename).catch(error => { if (/ENOENT/.test(error.message) && anchor.classList.contains('internal-link')) return openFile(`${filename}.md`); throw error; }).catch(error => notice(error.message));
    }
    return;
  }
  const button = event.target.closest('[data-command]'); if (button) { run(button.dataset.command); return; }
  const close = event.target.closest('[data-close-tab]'); if (close) { closeTab(close.dataset.closeTab).catch(error => notice(error.message)); return; }
  const tab = event.target.closest('#tabs [data-tab]'); if (tab) activate(tab.dataset.tab);
});
$('#file-list').onclick = event => {
  const row = event.target.closest('[data-path]'); if (!row) return;
  const tab = active();
  if (event.ctrlKey || event.metaKey) { if (tab.selected.has(row.dataset.path)) tab.selected.delete(row.dataset.path); else tab.selected.add(row.dataset.path); }
  else if (event.shiftKey && tab.selected.size) {
    const rows = [...$('#file-list').querySelectorAll('[data-path]')], first = rows.findIndex(item => tab.selected.has(item.dataset.path)), last = rows.indexOf(row);
    tab.selected = new Set(rows.slice(Math.min(first, last), Math.max(first, last) + 1).map(item => item.dataset.path));
  } else tab.selected = new Set([row.dataset.path]);
  renderFiles(); $('#file-list').focus();
};
$('#file-list').ondblclick = event => {
  const row = event.target.closest('[data-path]'); if (!row) return;
  (row.dataset.directory === 'true' ? navigate(row.dataset.path) : openFile(row.dataset.path)).catch(error => notice(error.message));
};
$('#file-list').onauxclick = event => {
  if (event.button !== 1) return;
  const row = event.target.closest('[data-path]');
  if (row) { event.preventDefault(); openRequest({ path: row.dataset.path }).catch(error => notice(error.message)); }
};
$('#file-list').oncontextmenu = event => {
  const row = event.target.closest('[data-path]'); if (!row || row.dataset.parent === 'true') return;
  event.preventDefault(); active().selected = new Set([row.dataset.path]); renderFiles(); fileMenu(row.dataset.path);
};
let typeAhead = '', typeTimer;
$('#file-list').onkeydown = event => {
  const rows = [...$('#file-list').querySelectorAll('[data-path]')], tab = active();
  const current = rows.findIndex(row => tab.selected.has(row.dataset.path));
  const control = event.ctrlKey || event.metaKey;
  let action;
  if (event.key === ui("arrowdown") || event.key === ui("arrowup") || event.key === ui("home") || event.key === ui("end")) {
    const next = event.key === ui("home") ? 0 : event.key === ui("end") ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, current + (event.key === ui("arrowdown") ? 1 : -1)));
    tab.selected = new Set([rows[next]?.dataset.path]); renderFiles(); $('#file-list').querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
  } else if ([ui("arrowleft"), ui("backspace")].includes(event.key)) action = () => navigate(parent(tab.cwd));
  else if (event.key === ui("enter") || event.key === ui("arrowright")) { const row = rows[current]; if (row) action = () => row.dataset.directory === 'true' ? navigate(row.dataset.path) : openFile(row.dataset.path); }
  else if (event.key === ui("f2")) action = () => renameFile(selectedPaths()[0]);
  else if (event.key === ui("delete")) action = () => trashFiles();
  else if (control && event.key.toLowerCase() === 'a') { tab.selected = new Set(tab.entries.map(entry => entry.path)); renderFiles(); }
  else if (control && ['c', 'x'].includes(event.key.toLowerCase())) clipboardFiles = { paths: selectedPaths(), cut: event.key.toLowerCase() === 'x' };
  else if (control && event.key.toLowerCase() === 'v') action = pasteFiles;
  else if (!control && !event.altKey && event.key.length === 1) {
    typeAhead += event.key.toLowerCase(); clearTimeout(typeTimer); typeTimer = setTimeout(() => typeAhead = '', 700);
    const row = rows.find(row => row.querySelector('.file-name').textContent.toLowerCase().startsWith(typeAhead));
    if (row) { tab.selected = new Set([row.dataset.path]); renderFiles(); $('#file-list').querySelector('.selected')?.scrollIntoView({ block: 'nearest' }); }
  } else return;
  event.preventDefault(); if (action) Promise.resolve().then(action).catch(error => notice(error.message));
};
$('#location-form').onsubmit = event => { event.preventDefault(); let directory = $('#location').value; if (directory === '~' || directory.startsWith('~/')) directory = boot.home + directory.slice(1); navigate(directory).catch(error => notice(error.message)); };
$('#file-filter').oninput = renderFiles;
$('#file-title').onkeydown = event => { if (event.key === ui("enter")) { event.preventDefault(); event.target.blur(); } if (event.key === ui("escape")) { event.target.value = active().file.name; event.target.blur(); } };
$('#file-title').onblur = async event => { const tab = active(); if (!tab.file || tab.file.name === event.target.value) return; try { await renameTo(tab.file.path, event.target.value); } catch (error) { event.target.value = tab.file.name; notice(error.message); } };
$('#energy').oninput = event => { temporaryEnergy = Number(event.target.value); applyConfig(active().config); };
$('#energy').onchange = event => setEnergy(Number(event.target.value)).catch(error => notice(error.message));

document.addEventListener('keydown', event => {
  const control = event.ctrlKey || event.metaKey, key = event.key.toLowerCase();
  if ($('#dialog').open) { if (event.key === ui("escape")) return; if (!(control && key === 'q')) return; }
  let id;
  if (control && event.shiftKey) id = ({ b: 'expand-terminal', d: 'toggle-navigation', e: 'view-mode', o: 'open-directory', p: 'palette', s: 'save-as', tab: 'previous-tab' })[key];
  else if (control) id = ({ e: 'toggle-files', d: 'expand-files', b: 'toggle-terminal', '`': 'toggle-terminal', t: 'new-tab', w: 'close-tab', n: 'new-file', o: 'open-file', s: 'save', p: 'palette', ',': 'settings', l: 'location', tab: 'next-tab', pagedown: 'next-tab', pageup: 'previous-tab', '1': 'focus-editor', '2': 'focus-files', '3': 'focus-terminal', q: 'quit' })[key];
  if (event.altKey && event.shiftKey && key === 't') id = 'toggle-terminal';
  if (event.altKey && !event.shiftKey) id = ({ arrowup: 'parent', arrowleft: 'back', arrowright: 'forward' })[key];
  if (key === 'f1') id = 'help'; if (key === 'f5') id = 'refresh';
  if (control && key === 'h' && $('#files').contains(event.target)) id = 'toggle-hidden';
  if (id) { event.preventDefault(); event.stopPropagation(); run(id); }
  if (event.key === ui("escape") && active()?.expanded && !$('#dialog').open) { active().expanded = ''; update(); requestAnimationFrame(fitTerminal); }
}, true);

function resizer(selector, property, position, minimum, maximum) {
  $(selector).onpointerdown = event => {
    const start = position(event), initial = parseInt(getComputedStyle(document.documentElement).getPropertyValue(property));
    event.target.setPointerCapture(event.pointerId);
    event.target.onpointermove = current => { const size = Math.max(minimum, Math.min(maximum(), initial + position(current) - start)); document.documentElement.style.setProperty(property, `${size}px`); fitTerminal(); };
    event.target.onpointerup = () => { event.target.onpointermove = null; active().config.values[property === '--sidebar-width' ? 'sidebar_width' : 'terminal_height'] = parseInt(getComputedStyle(document.documentElement).getPropertyValue(property)); };
  };
}
resizer('.sidebar-resize', '--sidebar-width', event => event.clientX, 180, () => innerWidth - 350);
resizer('.terminal-resize', '--terminal-height', event => -event.clientY, 90, () => innerHeight - 180);
new ResizeObserver(() => fitTerminal()).observe($('#terminal-panel'));
for (const [selector, id] of [['#files > header', 'files'], ['#terminal-panel > header', 'terminal'], ['#document > header', 'document']]) draggable($(selector), id);
for (const [selector, area] of [['#navigation-area', 'left'], ['#right-panels', 'right'], ['#center-panels', 'center'], ['#terminal-panel', 'bottom']]) {
  const element = $(selector);
  element.ondragover = event => { if (event.dataTransfer.types.includes('application/x-yhwh-panel')) event.preventDefault(); };
  element.ondrop = event => { const id = event.dataTransfer.getData('application/x-yhwh-panel'); if (id) { event.preventDefault(); try { movePanel(id, area); } catch (error) { notice(error.message); } } };
}

(async () => {
  boot = await call('bootstrap'); words = boot.words;
  try { await openRequest(boot.initial); } catch (error) { notice(error.message); if (!tabs.length) await newTab(boot.home); }
  for (const opening of boot.pending) await openRequest(opening);
  for (const [id, messages] of pendingTerminal) { if (tabs.some(tab => tab.id === id)) for (const message of messages) terminalMessage(message); }
  pendingTerminal.clear();
  // A small public surface for plugins and interactive inspection. No Node in
  // the renderer; disk operations still cross the explicit preload boundary.
  window.YHWH = { ...pluginAPI(), commands, tabs, active, run, refresh, newTab, openFile };
})().catch(error => { console.error(error); notice(error.message); });
