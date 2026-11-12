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
const humanSize = size => size > 1048576 ? `${(size / 1048576).toFixed(1)} MB` : size > 1024 ? `${Math.round(size / 1024)} KB` : `${size} B`;
function emit(name, value) { for (const callback of listeners.get(name) || []) callback(value); }
function notice(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 6000); }
function run(name) { const item = commands.get(name); if (item) return Promise.resolve().then(item.run).catch(error => notice(error.message)); }
function addCommand(item) { commands.set(item.id, item); return () => commands.delete(item.id); }
function editButton(key) { return `<button class="inline-edit" data-edit-word="${key}" title="Edit this text in the source code" aria-label="Edit ${key}">✎</button>`; }
function word(key, tag = 'p') { return `<${tag}>${escape(words[key])} ${editButton(key)}</${tag}>`; }

function modal(title, content, setup) {
  const dialog = $('#dialog');
  if (dialog.open) dialog.close();
  dialog.innerHTML = `<header class="dialog-header"><h2>${escape(title)}</h2><button data-close aria-label="Close dialog">×</button></header><div class="dialog-body">${content}</div>`;
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  dialog.showModal();
  setup?.(dialog);
  return dialog;
}
function promptText(title, label, initial = '') {
  return new Promise(resolve => {
    const dialog = modal(title, `<form><label class="field"><span>${escape(label)}</span><input name="value" value="${escape(initial)}" required autocomplete="off"></label><div class="dialog-actions"><button type="button" data-cancel>Cancel</button><button class="primary">Save</button></div></form>`);
    let result = null;
    dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
    dialog.querySelector('form').onsubmit = event => { event.preventDefault(); result = dialog.querySelector('input').value; dialog.close(); };
    dialog.addEventListener('close', () => resolve(result), { once: true });
    const input = dialog.querySelector('input'); input.focus(); input.select();
  });
}
function choose(title, message, options) {
  return new Promise(resolve => {
    const dialog = modal(title, `<p>${escape(message)}</p><div class="dialog-actions">${options.map((option, index) => `<button data-choice="${index}" class="${index === 0 ? 'primary' : ''}">${escape(option)}</button>`).join('')}</div>`);
    let result = -1;
    for (const button of dialog.querySelectorAll('[data-choice]')) button.onclick = () => { result = Number(button.dataset.choice); dialog.close(); };
    dialog.addEventListener('close', () => resolve(result), { once: true });
  });
}
async function editWords(key) {
  const dialog = modal('Edit YHWH text', `<p>Saving updates <code>app/words.json</code> in this app’s source code.</p><form><label class="field"><span>${escape(key)}</span><textarea name="words">${escape(words[key])}</textarea></label><div class="dialog-actions"><button type="button" data-cancel>Cancel</button><button class="primary">Save to source</button></div></form>`);
  dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
  dialog.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    try { words = await call('words:save', { [key]: dialog.querySelector('textarea').value }); dialog.close(); for (const tab of tabs) if (!tab.file) welcome(tab); pluginKey = ''; update(); notice('Saved to app/words.json.'); }
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
  tab.terminal = new Terminal({ cursorBlink: true, fontFamily: '"DejaVu Sans Mono", monospace', fontSize: 12, scrollback: 5000, theme: { background: '#131317', foreground: '#d4d0da', cursor: '#b7a1ef', selectionBackground: '#5c447977' } });
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
  tab.document.innerHTML = `<section class="welcome"><span class="paleo">𐤉𐤄𐤅𐤄</span><div class="eyebrow">A little room for creation</div>${word('welcomeTitle', 'h1')}${word('welcomeBody')}<div class="welcome-actions"><button class="primary" data-command="open-file">Open a file <small>Ctrl+O</small></button><button data-command="new-file">New file <small>Ctrl+N</small></button></div><div class="shortcut-list"><div><span>Show or hide files</span><kbd>Ctrl E</kbd></div><div><span>Give files the whole space</span><kbd>Ctrl D</kbd></div><div><span>Show or hide the terminal</span><kbd>Ctrl B</kbd></div><div><span>Go up a directory</span><kbd>Alt ↑</kbd></div><div><span>A fresh tab, a fresh shell</span><kbd>Ctrl T</kbd></div></div><div class="welcome-bottom"><button data-command="offerings">Offerings</button><span>·</span><button data-command="about">About YHWH</button><span>·</span><button data-command="upgrades">Coming soon</button></div></section>`;
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
  $('#tabs').innerHTML = tabs.map(tab => `<div class="tab" role="tab" aria-selected="${tab.id === activeId}" data-tab="${tab.id}"><span title="${escape(tab.file?.path || tab.cwd)}">${tab.dirty ? '● ' : ''}${escape(tab.file?.name || basename(tab.cwd))}</span><button data-close-tab="${tab.id}" aria-label="Close ${escape(tab.file?.name || basename(tab.cwd))}">×</button></div>`).join('');
}
function renderFiles() {
  const tab = active(); if (!tab) return;
  const filter = $('#file-filter').value.toLocaleLowerCase();
  const rows = [{ name: '..', path: parent(tab.cwd), directory: true, parent: true }, ...tab.entries.filter(entry => entry.name.toLocaleLowerCase().includes(filter))];
  $('#file-list').innerHTML = rows.map(entry => `<div class="file-row ${entry.directory ? 'directory' : ''} ${entry.parent ? 'parent-row' : ''} ${tab.selected.has(entry.path) ? 'selected' : ''}" role="option" aria-selected="${tab.selected.has(entry.path)}" data-path="${escape(entry.path)}" data-directory="${entry.directory}" data-parent="${!!entry.parent}" title="${escape(entry.path)}"><span class="file-icon">${entry.parent ? '↑' : entry.broken ? '!' : entry.directory ? '▱' : '≡'}</span><span class="file-name">${escape(entry.name)}</span><span class="file-size">${entry.parent ? '' : entry.directory ? 'Directory' : humanSize(entry.size)}</span><span class="file-date">${entry.modified ? new Date(entry.modified).toLocaleString() : ''}</span></div>`).join('');
  $('#file-count').textContent = `${tab.entries.length} items${tab.selected.size ? ` · ${tab.selected.size} selected` : ''}`;
  $('#location').value = tab.cwd;
  $('#terminal-cwd').textContent = tab.cwd;
  $('#shell-state').textContent = tab.terminalExited ? 'Shell exited' : '↔ Files';
}
function update() {
  const tab = active(); if (!tab) return;
  tabTitles(); renderFiles();
  $('#navigation-area').hidden = !tab.showFiles && tab.expanded !== 'files';
  $('#terminal-panel').hidden = !tab.showTerminal && tab.expanded !== 'terminal';
  $('#workspace').dataset.expanded = tab.expanded;
  $('#title-row').hidden = !tab.file;
  $('#file-title').value = tab.file?.name || '';
  $('#dirty-indicator').textContent = tab.dirty ? 'Unsaved' : '';
  $('#document-path').textContent = tab.file ? parent(tab.file.path) : tab.cwd;
  $('#language-button').textContent = tab.file?.language || 'Plain text';
  $('#file-encoding').textContent = tab.file?.kind === 'text' ? `UTF-8 · ${tab.file.newline === '\r\n' ? 'CRLF' : 'LF'}` : '';
  $('#view-mode').textContent = tab.file?.language === 'markdown' ? tab.file.mode === 'source' ? 'Source' : tab.file.mode === 'reading' ? 'Reading' : 'Live Preview' : ['json', 'html'].includes(tab.file?.language) ? 'Pretty format' : 'Source';
  $('#view-mode').disabled = tab.file?.kind !== 'text';
  applyConfig(tab.config);
}
let temporaryEnergy;
function applyConfig(config) {
  const values = config.values, style = document.documentElement.style;
  for (const [property, value] of Object.entries({ '--editor-size': `${Number(values.font_size) || 16}px`, '--sidebar-width': `${Number(values.sidebar_width) || 258}px`, '--terminal-height': `${Number(values.terminal_height) || 240}px`, '--editor-font': values.editor_font || "'Segoe UI', system-ui, sans-serif", '--line-width': values.line_width || '820px' })) style.setProperty(property, value);
  const energy = temporaryEnergy ?? (values.theme === 'dawkins' ? 0 : values.theme === 'nietzsche' ? 50 : Number(values.energy ?? 100));
  document.body.dataset.theme = energy === 0 ? 'dawkins' : energy < 100 ? 'nietzsche' : 'yhwh';
  document.body.classList.toggle('theme-dark', values.theme !== 'light'); document.body.classList.toggle('theme-light', values.theme === 'light');
  $('#energy').value = energy;
  $('#mode-name').textContent = energy === 0 ? 'Dawkins' : energy < 100 ? 'Nietzsche' : 'YHWH';
  $('#divine-footnote').textContent = energy === 0 ? words.dawkins : energy < 100 ? words.nietzsche : words.footer;
  $('#workspace').style.backgroundImage = config.background ? `linear-gradient(#1b1b20ce,#1b1b20ce), url("${config.background}")` : '';
  $('#user-theme').textContent = config.css || '';
  document.title = values.title || `${active()?.file?.name || basename(active()?.cwd || '')} — YHWH`;
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
  const choice = await choose('Unsaved changes', `Save changes to ${tab.file.name}?`, ['Save', 'Discard', 'Cancel']);
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
  tab.document.innerHTML = '<div class="editor-host"></div><div class="reading-view markdown-rendered" hidden></div>';
  if (file.kind === 'text') {
    tab.editor = await createEditor(tab.document.querySelector('.editor-host'), file, content => {
      tab.dirty = content !== tab.file.content.replace(/\r\n/g, '\n');
      if (tab.id === activeId) { $('#dirty-indicator').textContent = tab.dirty ? 'Unsaved' : ''; tabTitles(); }
      emit('change', { path: file.path, content });
    }, (line, column) => { if (tab.id === activeId) $('#cursor-position').textContent = `Ln ${line}, Col ${column}`; });
  } else if (file.kind === 'image') tab.document.innerHTML = `<div class="image-view"><img src="${file.data}" alt="${escape(file.name)}"></div>`;
  else tab.document.innerHTML = `<div class="binary-view"><h2>${escape(file.name)}</h2><p>${escape(file.mime)} · ${humanSize(file.size)}</p><p>This format opens in your desktop’s default application.</p><button class="primary" data-command="open-external">Open externally</button></div>`;
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
  const tab = active(), name = await promptText(directory ? 'New directory' : 'New file', 'Name, including any extension');
  if (!name) return;
  const filename = await call('file:create', join(tab.cwd, name), directory);
  await refresh(tab);
  if (!directory) await openFile(filename, tab);
}
async function renameFile(filename = active()?.file?.path) {
  if (!filename) return;
  const name = await promptText('Rename', 'Name', basename(filename));
  if (!name || name === basename(filename)) return;
  await renameTo(filename, name);
}
async function renameTo(filename, name) {
  if (!name.trim() || /[/\\]/.test(name) || ['.', '..'].includes(name)) throw new Error('Use a filename without slashes.');
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
  if (await choose('Move to Trash', `Move ${paths.length} item(s) to the desktop Trash?`, ['Move to Trash', 'Cancel']) !== 0) return;
  for (const filename of paths) await call('file:trash', filename);
  active().selected.clear(); await refresh();
}

function settings() {
  const tab = active(), values = tab.config.values;
  const descriptions = { theme: 'Theme · yhwh, nietzsche, dawkins', energy: 'YHWH-ness · 0 to 100', font_size: 'Editor font size', show_hidden: 'Show hidden files · true or false', bg: 'Background image path', stylesheet: 'Theme CSS path (Obsidian theme CSS can be used)', plugins: 'Plugin directories · JSON array', editor_font: 'Editor font family', sidebar_width: 'File manager width', terminal_height: 'Terminal height', layout: 'Panel positions · JSON object', live_preview: 'Markdown Live Preview · true or false' };
  const keys = String(values.settings_fields || '').split(',').map(key => key.trim()).filter(key => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key));
  const dialog = modal('Settings', `<form id="settings-form">${keys.map(key => `<label class="field"><span>${escape(descriptions[key] || key)}</span><input name="${key}" value="${escape(values[key] || '')}" autocomplete="off"></label>`).join('')}<label class="field"><span>Apply to</span><select name="_scope"><option value="/">Everywhere (user configuration)</option><option value="${escape(tab.cwd)}">${escape(tab.cwd)} and its children</option></select></label><p><button type="button" data-edit-config>Edit rc file</button> <button type="button" data-reload-config>Reload configuration and plugins</button></p><small>Settings are saved as ordinary sections in ${escape(tab.config.userDirectory)}/rc. <code>settings_fields</code> changes the fields in this menu.</small>${tab.config.warnings.length ? `<p class="warning">${escape(tab.config.warnings.join('\n'))}</p>` : ''}<div class="dialog-actions"><button class="primary">Save settings</button></div></form>`);
  dialog.querySelector('[data-edit-config]').onclick = async () => { dialog.close(); const filename = await call('config:open'); await openFile(filename); };
  dialog.querySelector('[data-reload-config]').onclick = async () => { pluginKey = ''; await call('config:reload'); await refresh(); dialog.close(); notice('Configuration reloaded.'); };
  dialog.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    try {
      const data = Object.fromEntries(new FormData(event.target)), scope = data._scope; delete data._scope;
      if (data.plugins) { const parsed = JSON.parse(data.plugins); if (!Array.isArray(parsed)) throw new Error('plugins must be a JSON array.'); }
      if (data.layout) JSON.parse(data.layout);
      if (data.energy && !(Number(data.energy) >= 0 && Number(data.energy) <= 100)) throw new Error('YHWH-ness must be between 0 and 100.');
      temporaryEnergy = undefined;
      await call('settings:save', data, scope); await refresh(); dialog.close();
    } catch (error) { notice(error.message); }
  };
}
function languageMenu() {
  const tab = active(); if (!tab.file || !tab.editor) return;
  const names = languageNames();
  if (!names.includes(tab.file.language)) names.push(tab.file.language);
  const dialog = modal('File type', `<form><label class="field"><span>Language (inferred: ${escape(tab.file.mime)})</span><select name="language">${names.map(name => `<option ${tab.file.language === name ? 'selected' : ''}>${escape(name)}</option>`).join('')}</select></label><label class="field"><span>Remember this choice</span><select name="remember"><option value="no">Only for this open file</option><option value="extension">For this extension everywhere</option><option value="filename">For this filename everywhere</option><option value="directory">For this extension under ${escape(tab.cwd)}</option></select></label><div class="dialog-actions"><button class="primary">Apply</button></div></form>`);
  dialog.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    try {
      const data = Object.fromEntries(new FormData(event.target));
      if (data.remember !== 'no') {
        const extension = tab.file.name.includes('.') ? tab.file.name.split('.').at(-1) : '';
        if (!extension && data.remember !== 'filename') throw new Error('This file has no extension. Choose the filename rule.');
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
    ['Open in a new app tab', () => openRequest({ path: filename })],
    ['Rename…', () => renameFile(filename)],
    ['Copy', () => { clipboardFiles = { paths: [filename], cut: false }; }],
    ['Cut', () => { clipboardFiles = { paths: [filename], cut: true }; }],
    ['Copy path', () => call('clipboard:path', filename)],
    ['Open in desktop application', () => call('file:external', filename)],
    ['Show in desktop file manager', () => call('file:reveal', filename)],
    ['Reading view (Markdown)', readingView],
    ['Overwrite file with editor contents…', async () => { if (await choose('Overwrite file', 'Replace the on-disk contents with this editor’s contents?', ['Overwrite', 'Cancel']) === 0) await save(active(), true); }],
    ['Move to Trash…', () => trashFiles([filename])],
  ];
  const dialog = modal(basename(filename), `<div class="menu-list">${items.map(([label], i) => `<button data-menu="${i}">${escape(label)}</button>`).join('')}</div>`);
  for (const button of dialog.querySelectorAll('[data-menu]')) button.onclick = () => { dialog.close(); Promise.resolve().then(items[Number(button.dataset.menu)][1]).catch(error => notice(error.message)); };
}
function palette() {
  const dialog = modal('Commands', '<input id="palette-search" placeholder="Type a command…" aria-label="Find a command"><div class="menu-list" id="palette-results"></div>');
  const render = () => {
    const filter = $('#palette-search').value.toLowerCase();
    const found = [...commands.values()].filter(item => item.name.toLowerCase().includes(filter));
    $('#palette-results').innerHTML = found.map(item => `<button data-palette-command="${escape(item.id)}">${escape(item.name)}${item.keys ? `<kbd>${escape(item.keys)}</kbd>` : ''}</button>`).join('');
    for (const button of dialog.querySelectorAll('[data-palette-command]')) button.onclick = () => { dialog.close(); run(button.dataset.paletteCommand); };
  };
  dialog.querySelector('input').oninput = render;
  dialog.querySelector('input').onkeydown = event => { if (event.key === 'Enter') dialog.querySelector('[data-palette-command]')?.click(); if (event.key === 'ArrowDown') { event.preventDefault(); dialog.querySelector('[data-palette-command]')?.focus(); } };
  render(); dialog.querySelector('input').focus();
}
function offerings() {
  modal(words.offeringsTitle, `${editButton('offeringsTitle')}${word('offeringsBody')}<div class="menu-list"><button data-command="burnt">Burnt Offering <span>Support the work ↗</span></button><button data-command="piece">Piece Offering <span>Share something you made ↗</span></button></div>`);
}
function burnt() {
  modal(words.burntTitle, `${editButton('burntTitle')}${word('burntBody')}<div class="setup-step"><h3>1. Create the LD Stripe account</h3><p>Use the business email. Stripe’s activation flow asks for business and identity details. Enter those on Stripe.</p><button class="primary" data-url="https://dashboard.stripe.com/register">Open Stripe signup ↗</button></div><div class="setup-step"><h3>2. Connect a bank for payouts</h3><p>During activation, add the bank account that should receive payouts. Stripe may require verification before live payments work.</p><button data-url="https://docs.stripe.com/get-started/account/activate">Account activation guide ↗</button></div><div class="setup-step"><h3>3. Make a Payment Link in a sandbox</h3><p>Choose “Customers choose what to pay.” Name it Burnt Offering, choose any suggested amount, and test the checkout. Stripe’s documentation links the current requirements for tips and donations.</p><button data-url="https://docs.stripe.com/payment-links/create">Payment Links instructions ↗</button><button data-url="https://dashboard.stripe.com/payment-links">Open Payment Links ↗</button></div><div class="setup-step"><h3>4. Connect the live link</h3><p>After activation and testing, create the live link and put <code>stripe_payment_link='https://buy.stripe.com/…'</code> in your user rc. No secret API key belongs in this app. Add a backend and webhooks later if account upgrades need payment verification.</p><button data-command="edit-config">Open user rc</button></div><p class="warning">This is a setup guide. No payment is being collected by this stub.</p>${active().config.values.stripe_payment_link ? '<button class="primary" data-command="pay">Open configured payment page ↗</button>' : ''}`);
}
function piece() {
  modal(words.pieceTitle, `${editButton('pieceTitle')}${word('pieceBody')}<p>Recipient: <a href="mailto:yhwh@thedynamiclinker.com">yhwh@thedynamiclinker.com</a>. No file is uploaded by this stub.</p><button class="primary" data-command="choose-offering">Choose file and prepare email…</button><button data-url="https://thedynamiclinker.com">Visit LD ↗</button>`);
}
function about() {
  modal(words.aboutTitle, `${editButton('aboutTitle')}<span class="paleo">𐤉𐤄𐤅𐤄</span>${word('aboutBody')}<div class="dialog-actions"><button data-url="https://thedynamiclinker.com">About Us ↗</button><button class="primary" data-url="https://www.amazon.com/dp/B0HNQ23QKT">Genesis by The Nameless ↗</button></div>`);
}
function upgrades() { modal('Coming soon', `${word('upgrades')}${word('comingSoon')}<div class="dialog-actions"><button data-command="burnt">Support development</button></div>`); }
async function circus() {
  const dialog = modal('Nietzsche Family Circus', '<p>Fetching a cartoon and a wildly inappropriate philosophical companion…</p><button data-command="circus">Next pairing</button><button data-url="https://nietzschefamilycircus.com">Original site ↗</button>');
  try {
    const pair = await call('circus');
    if (!dialog.open || dialog.querySelector('h2')?.textContent !== 'Nietzsche Family Circus') return;
    dialog.querySelector('.dialog-body').innerHTML = `<img class="circus-image" src="${pair.image}" alt="Family Circus cartoon"><p class="circus-quote">${escape(pair.quote)}</p><small>Cartoon and pairing from Nietzsche Family Circus.</small><div class="dialog-actions"><button data-url="${escape(pair.permalink)}">Original pairing ↗</button><button class="primary" data-command="circus">Next pairing</button></div>`;
  } catch (error) { if (dialog.open) dialog.querySelector('.dialog-body p').textContent = error.message; }
}
function modes() {
  const dialog = modal('YHWH-ness', `<div class="menu-list"><button data-energy="100">YHWH <span>All the personality</span></button><button data-energy="50">Nietzsche <span>A little doubt</span></button><button data-energy="0">Dawkins <span>Just the files</span></button><button data-command="circus">Nietzsche Family Circus ↗</button></div>`);
  for (const button of dialog.querySelectorAll('[data-energy]')) button.onclick = () => { setEnergy(Number(button.dataset.energy)); dialog.close(); };
}
async function setEnergy(value) {
  temporaryEnergy = value; applyConfig(active().config);
  await call('settings:save', { theme: value === 0 ? 'dawkins' : value < 100 ? 'nietzsche' : 'yhwh', energy: String(value) });
  temporaryEnergy = undefined; await refresh();
}
function help() {
  modal('Help', `<p>Each tab is a directory, a shell, and an optional file. Going up never closes the file. The terminal stays alive while hidden. No browsing directory needs configuration.</p><div class="shortcut-list">${[...commands.values()].filter(item => item.keys).map(item => `<div><span>${escape(item.name)}</span><kbd>${escape(item.keys)}</kbd></div>`).join('')}</div><p>The file manager also supports ↑/↓, Enter, Left/Backspace to go up, F2 to rename, Ctrl+C/X/V, Ctrl+A, and Delete to move to Trash. Double-click opens a directory or file. Ctrl+click selects multiple files.</p><p><button data-command="edit-config">Edit user rc</button><button data-command="open-guide">Open the full guide</button><button data-command="about">About YHWH</button><button data-url="https://thedynamiclinker.com">About Us ↗</button></p>`);
}

const panels = new Map();
function movePanel(id, area) {
  const element = panels.get(id)?.element || ({ files: $('#navigation-area'), terminal: $('#terminal-panel'), document: $('#document') })[id];
  if (!element) throw new Error(`Unknown panel: ${id}`);
  const destination = ({ right: $('#right-panels'), center: $('#center-panels'), bottom: $('#focus-area'), left: $('#workspace') })[area];
  if (!destination || element.contains(destination)) throw new Error('Invalid panel position.');
  if (area === 'left') destination.insertBefore(element, $('#focus-area')); else destination.append(element);
  requestAnimationFrame(fitTerminal);
}
function addPanel({ id, title, area = 'right', render }) {
  if (panels.has(id)) throw new Error(`Panel already exists: ${id}`);
  const element = document.createElement('section'); element.className = 'plugin-panel workspace-leaf'; element.dataset.panel = id;
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
    } catch (error) { notice(`Plugin ${basename(module.directory)}: ${error.message}`); }
    finally { URL.revokeObjectURL(url); }
  }
  try { for (const [id, area] of Object.entries(JSON.parse(config.values.layout || '{}'))) movePanel(id, area); } catch (error) { notice(`Layout: ${error.message}`); }
}

const definitions = [
  ['new-tab', 'New tab', 'Ctrl+T', () => newTab()],
  ['close-tab', 'Close tab', 'Ctrl+W', () => closeTab()],
  ['next-tab', 'Next tab', 'Ctrl+Tab / Ctrl+PageDown', () => activate(tabs[(tabs.indexOf(active()) + 1) % tabs.length].id)],
  ['previous-tab', 'Previous tab', 'Ctrl+Shift+Tab / Ctrl+PageUp', () => activate(tabs[(tabs.indexOf(active()) + tabs.length - 1) % tabs.length].id)],
  ['new-file', 'New file', 'Ctrl+N', () => newFile()],
  ['new-directory', 'New directory', '', () => newFile(true)],
  ['open-file', 'Open file…', 'Ctrl+O', async () => { const filename = await call('choose', 'file', active().cwd); if (filename) await openFile(filename); }],
  ['open-directory', 'Go to directory…', 'Ctrl+Shift+O', async () => { const directory = await call('choose', 'directory', active().cwd); if (directory) await navigate(directory); }],
  ['save', 'Save file', 'Ctrl+S', () => save()],
  ['save-as', 'Save as…', 'Ctrl+Shift+S', async () => {
    const tab = active(); if (!tab.editor) return;
    const filename = await call('choose:save', tab.cwd, tab.file.name); if (!filename) return;
    const content = tab.editor.state.doc.toString();
    await call('file:save', filename, content, null, true); tab.dirty = false; await openFile(filename, tab);
  }],
  ['toggle-files', 'Toggle file manager', 'Ctrl+E', () => { const tab = active(); tab.showFiles = !tab.showFiles; tab.expanded = ''; update(); if (tab.showFiles) $('#file-list').focus(); requestAnimationFrame(fitTerminal); }],
  ['expand-files', 'Expand file manager', 'Ctrl+D', () => { const tab = active(); tab.expanded = tab.expanded === 'files' ? '' : 'files'; tab.showFiles = true; update(); $('#file-list').focus(); requestAnimationFrame(fitTerminal); }],
  ['toggle-terminal', 'Toggle terminal', 'Ctrl+B / Ctrl+` / Alt+Shift+T', () => { const tab = active(); tab.showTerminal = !tab.showTerminal; tab.expanded = ''; update(); requestAnimationFrame(() => { fitTerminal(); if (tab.showTerminal) tab.terminal.focus(); }); }],
  ['expand-terminal', 'Expand terminal', 'Ctrl+Shift+B', () => { const tab = active(); tab.expanded = tab.expanded === 'terminal' ? '' : 'terminal'; tab.showTerminal = true; update(); requestAnimationFrame(() => { fitTerminal(); tab.terminal.focus(); }); }],
  ['toggle-navigation', 'Toggle files and terminal together', 'Ctrl+Shift+D', () => { const tab = active(); const show = !(tab.showFiles || tab.showTerminal); tab.showFiles = show; tab.showTerminal = show; tab.expanded = ''; update(); requestAnimationFrame(fitTerminal); }],
  ['focus-editor', 'Focus editor', 'Ctrl+1', () => { active().expanded = ''; update(); active().editor?.focus(); requestAnimationFrame(fitTerminal); }],
  ['focus-files', 'Focus file manager', 'Ctrl+2', () => { active().showFiles = true; active().expanded = ''; update(); $('#file-list').focus(); }],
  ['focus-terminal', 'Focus terminal', 'Ctrl+3', () => { active().showTerminal = true; active().expanded = ''; update(); requestAnimationFrame(() => { fitTerminal(); active().terminal.focus(); }); }],
  ['parent', 'Parent directory', 'Alt+Up', () => navigate(parent(active().cwd))],
  ['home', 'Home directory', '', () => navigate(boot.home)],
  ['back', 'Back', 'Alt+Left', async () => { const tab = active(); if (tab.historyIndex > 0) { tab.historyIndex--; await navigate(tab.history[tab.historyIndex], tab, false); } }],
  ['forward', 'Forward', 'Alt+Right', async () => { const tab = active(); if (tab.historyIndex < tab.history.length - 1) { tab.historyIndex++; await navigate(tab.history[tab.historyIndex], tab, false); } }],
  ['location', 'Edit location', 'Ctrl+L', () => { active().showFiles = true; update(); $('#location').focus(); $('#location').select(); }],
  ['refresh', 'Refresh directory and configuration', 'F5', () => refresh()],
  ['toggle-hidden', 'Toggle hidden files', 'Ctrl+H (in files)', async () => { const tab = active(); await call('settings:save', { show_hidden: tab.config.values.show_hidden === 'true' ? 'false' : 'true' }, tab.cwd); await refresh(); }],
  ['view-mode', 'Toggle source / pretty view', 'Ctrl+Shift+E', viewMode],
  ['reading-view', 'Markdown reading view', '', readingView],
  ['reload-file', 'Reload file from disk', '', async () => { if (active().file) await openFile(active().file.path); }],
  ['file-menu', 'File actions', '', () => fileMenu()],
  ['open-external', 'Open current file externally', '', () => active().file && call('file:external', active().file.path)],
  ['palette', 'Command palette', 'Ctrl+P / Ctrl+Shift+P', palette],
  ['language', 'File type / syntax highlighting', '', languageMenu],
  ['settings', 'Settings', 'Ctrl+,', settings],
  ['edit-config', 'Edit user rc', '', async () => { const filename = await call('config:open'); $('#dialog').close(); await openFile(filename); }],
  ['open-guide', 'Open the full guide', '', async () => { $('#dialog').close(); await openFile(join(boot.root, 'README.md')); }],
  ['about', 'About YHWH', '', about], ['help', 'Help and keyboard shortcuts', 'F1', help],
  ['offerings', 'Offerings', '', offerings], ['burnt', 'Burnt Offering · setup guide', '', burnt], ['piece', 'Piece Offering', '', piece],
  ['choose-offering', 'Choose a Piece Offering', '', async () => { const filename = await call('offering:piece', active().cwd); if (filename) notice(`Email prepared. Attach ${filename} yourself before sending. Nothing has been uploaded.`); }],
  ['pay', 'Open configured payment page', '', () => { const url = active().config.values.stripe_payment_link; if (!/^https:\/\/buy\.stripe\.com\//.test(url || '')) throw new Error('Set a valid Stripe Payment Link in your rc.'); return call('external', url); }],
  ['upgrades', 'Coming soon · YHWH Sync, Stuff, 3D, Dating', '', upgrades],
  ['modes', 'YHWH / Nietzsche / Dawkins', '', modes], ['circus', 'Nietzsche Family Circus', '', circus],
  ['edit-footer', 'Edit status text', '', () => editWords(document.body.dataset.theme === 'dawkins' ? 'dawkins' : document.body.dataset.theme === 'nietzsche' ? 'nietzsche' : 'footer')],
  ['quit', 'Quit', 'Ctrl+Q', async () => { for (const tab of tabs) if (!await mayReplace(tab)) return; await call('window:close'); }],
];
for (const [id, name, keys, fn] of definitions) addCommand({ id, name, keys, run: fn });

const pendingTerminal = new Map();
function terminalMessage(message) {
  const tab = tabs.find(item => item.id === message.id);
  if (!tab) { if (message.id && !message.closed) { if (!pendingTerminal.has(message.id)) pendingTerminal.set(message.id, []); pendingTerminal.get(message.id).push(message); } else if (message.type === 'error') notice(message.message); return; }
  if (message.type === 'data') tab.terminal.write(message.data);
  if (message.type === 'exit') { tab.terminalExited = true; tab.terminal.write(`\r\n[Shell exited ${message.code}]\r\n`); }
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
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)));
    tab.selected = new Set([rows[next]?.dataset.path]); renderFiles(); $('#file-list').querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
  } else if (['ArrowLeft', 'Backspace'].includes(event.key)) action = () => navigate(parent(tab.cwd));
  else if (event.key === 'Enter' || event.key === 'ArrowRight') { const row = rows[current]; if (row) action = () => row.dataset.directory === 'true' ? navigate(row.dataset.path) : openFile(row.dataset.path); }
  else if (event.key === 'F2') action = () => renameFile(selectedPaths()[0]);
  else if (event.key === 'Delete') action = () => trashFiles();
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
$('#file-title').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); event.target.blur(); } if (event.key === 'Escape') { event.target.value = active().file.name; event.target.blur(); } };
$('#file-title').onblur = async event => { const tab = active(); if (!tab.file || tab.file.name === event.target.value) return; try { await renameTo(tab.file.path, event.target.value); } catch (error) { event.target.value = tab.file.name; notice(error.message); } };
$('#energy').oninput = event => { temporaryEnergy = Number(event.target.value); applyConfig(active().config); };
$('#energy').onchange = event => setEnergy(Number(event.target.value)).catch(error => notice(error.message));

document.addEventListener('keydown', event => {
  const control = event.ctrlKey || event.metaKey, key = event.key.toLowerCase();
  if ($('#dialog').open) { if (event.key === 'Escape') return; if (!(control && key === 'q')) return; }
  let id;
  if (control && event.shiftKey) id = ({ b: 'expand-terminal', d: 'toggle-navigation', e: 'view-mode', o: 'open-directory', p: 'palette', s: 'save-as', tab: 'previous-tab' })[key];
  else if (control) id = ({ e: 'toggle-files', d: 'expand-files', b: 'toggle-terminal', '`': 'toggle-terminal', t: 'new-tab', w: 'close-tab', n: 'new-file', o: 'open-file', s: 'save', p: 'palette', ',': 'settings', l: 'location', tab: 'next-tab', pagedown: 'next-tab', pageup: 'previous-tab', '1': 'focus-editor', '2': 'focus-files', '3': 'focus-terminal', q: 'quit' })[key];
  if (event.altKey && event.shiftKey && key === 't') id = 'toggle-terminal';
  if (event.altKey && !event.shiftKey) id = ({ arrowup: 'parent', arrowleft: 'back', arrowright: 'forward' })[key];
  if (key === 'f1') id = 'help'; if (key === 'f5') id = 'refresh';
  if (control && key === 'h' && $('#files').contains(event.target)) id = 'toggle-hidden';
  if (id) { event.preventDefault(); event.stopPropagation(); run(id); }
  if (event.key === 'Escape' && active()?.expanded && !$('#dialog').open) { active().expanded = ''; update(); requestAnimationFrame(fitTerminal); }
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
