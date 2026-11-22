import { text as interfaceText } from '../../../lib/text.cjs';
import interfaceCopy from '../../../etc/default/text-renderer.json';
const ui = interfaceText(interfaceCopy);
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { createEditor, setLanguage, setEditorMode, formatText, renderMarkdown, languageNames } from './editor.js';
import { linkAt } from './live-markdown.js';
import { createVerseUI } from './verses.js';
import verseCopy from '../../../etc/default/text-verses.json';
import { canonical, fromEvent, match as matchKey } from '../../../lib/key-names.cjs';
import panelKeys from '../../../etc/default/panel-keys.json';
import { showHotkeys } from './hotkeys.js';
import { mountViewer } from './viewers.js';
import { registerWheelZoom } from './wheel-zoom.js';
import { installFileDrag } from './file-drag.js';
import { fileIcons } from './file-icons.js';
import { showWorkspaceDialog } from './preview-dialog.js';
import { mountChat } from './chat.js';
import { createMerch } from './merch.js';
import installNHS from '../plugins/new-human-school/main.js';
import '../../../lib/nhs/view.css';
import { yhwhAddress } from '../../../lib/mail-message.cjs';
import { installInitial } from './initial.js';
import actionLetters from '../../../etc/default/action-letters.json';
import { nightLetters, canReceiveLetter, nextNightLetter } from '../../../lib/presence.cjs';
import { ORIGIN as circusOrigin } from '../../../lib/circus.cjs';
import { stripe, levelAt, freeEnergy, unlockedLevels, editionState, nextUpgrade, unstealUpgrade, createLevelAsides, addressCopy } from '../../../lib/levels.cjs';
import { primarySender, letters as startupLetters, emailLetters, startNight, nextStartupLetter, nextEmailLetter, nextMidnightLetter, nextMidnight, senderFor } from '../../../lib/inbox.cjs';
import polygynyAttachment from '../../../etc/assets/mail/biblical-polygyny.png';
const polygynyAttachmentURL = new URL(polygynyAttachment, import.meta.url).href;

const bridge = window.yhwh;
const interfaceZoomLevels = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
let interfaceZoomIndex = interfaceZoomLevels.indexOf(1);
registerWheelZoom(window, direction => {
  const next = Math.max(0, Math.min(interfaceZoomLevels.length - 1, interfaceZoomIndex + direction));
  if (next === interfaceZoomIndex) return;
  interfaceZoomIndex = next;
  const factor = interfaceZoomLevels[next];
  if (bridge.setInterfaceZoom) bridge.setInterfaceZoom(factor);
  else document.documentElement.style.setProperty('--mobile-zoom', factor);
});
const $ = selector => document.querySelector(selector);
for (const button of document.querySelectorAll('#files [data-file-icon]')) button.innerHTML = fileIcons[button.dataset.fileIcon];
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const call = (channel, ...args) => bridge.call(channel, ...args);
const verseUI = createVerseUI({ call, modal, notice });
const tabs = [], commands = new Map(), listeners = new Map(), focusViews = new Map();
let activeId, boot, words, toastTimer, clipboardFiles, pluginCleanup = [], pluginKey = '', pluginGeneration = 0;
const active = () => tabs.find(tab => tab.id === activeId);
const merch = createMerch({
  modal, escape, call,
  settings: () => active()?.config.values || {},
  async saveSettings(key, value) {
    await call('settings:save', { [key]: value }, '/');
    await Promise.all(tabs.map(tab => refresh(tab)));
  },
});
const editionKey = 'yhwh:edition:v1';
let edition = readEdition();
function readEdition() {
  try { return editionState(JSON.parse(localStorage.getItem(editionKey))); }
  catch { return editionState(); }
}
function saveEdition(value) {
  localStorage.setItem(editionKey, JSON.stringify(value));
  edition = value;
}
let temporaryEnergy, energySave = Promise.resolve(), energyRevision = 0;
const currentEnergy = (config = active()?.config) => temporaryEnergy ?? edition.selected ?? freeEnergy(config?.values || {});
const currentLevel = () => levelAt(currentEnergy());
const nextLevelAside = createLevelAsides();
const address = (value, nameIndex = 0) => addressCopy(value, currentLevel(), nameIndex);
const closedTabs = [];
const keyModules = new Map();
function keyContext(target = document.activeElement) {
  return $('#file-list').contains(target) ? 'files' : $('#terminals').contains(target) ? 'terminal' : target?.closest?.('.cm-editor') ? 'editor' : '';
}
function bindingFor(event) {
  const context = keyContext(event.target);
  const config = active()?.config;
  if (!config) return;
  const combo = fromEvent(event);
  const binding = matchKey(config.keys?.bindings || [], combo, context);
  if (combo) for (const [id, spec] of Object.entries(panelKeys)) {
    if (boot.interface === 'mobile' && spec.panel === 'terminal') continue;
    const custom = config.values['key_' + id];
    if (combo === (custom || spec.key) && (custom || !binding)) return { kind: 'panel', spec };
  }
  if (!binding?.when && (context === 'terminal' && ['view-mode', 'markdown-source'].includes(binding?.command)
    || context === 'editor' && binding?.command === 'parent')) return;
  return binding;
}
async function executeBinding(binding) {
  if (binding.kind === 'disabled') return;
  const tab = active(), focus = keyContext();
  if (boot.interface === 'mobile' && binding.kind === 'js') return run(binding.command);
  const context = `cwd\t${tab.cwd}\nfile\t${tab.file?.path || ''}\n${[...tab.selected].map(path => `selected\t${path}\n`).join('')}`;
  const result = binding.kind === 'js' ? binding : await call('keys:run', tab.id, binding.combo, context);
  if (result.kind === 'js') {
    if (!keyModules.has(result.source)) {
      if (keyModules.size >= 256) keyModules.clear();
      const url = URL.createObjectURL(new Blob([result.source], { type: 'text/javascript' }));
      keyModules.set(result.source, import(url).finally(() => URL.revokeObjectURL(url)));
    }
    const module = await keyModules.get(result.source);
    if (typeof module.default !== 'function') throw new Error('Key module needs export default api => …');
    await module.default({ ...pluginAPI(), run, refresh, active, newTab, openFile, keyContext: focus });
  } else if (result.kind === 'unsupported') throw new Error('This host imports .js modules. Make shell/Python files executable and include a shebang.');
  else if (result.stdout || result.stderr || result.code) modal(`Key command · ${binding.combo}`, `<pre class="key-output">${escape(result.stdout || '')}${escape(result.stderr || '')}${result.code ? `\nExit ${result.code}` : ''}</pre>`);
}
const basename = filename => filename.replace(/[/\\]+$/, '').split(/[/\\]/).at(-1) || filename;
const join = (directory, name) => /^(?:[/\\]|[A-Z]:[/\\])/i.test(name) ? name : `${directory.replace(/[/\\]$/, '')}/${name}`;
const parent = filename => { const value = filename.replace(/[/\\][^/\\]+[/\\]?$/, '') || (boot.platform === 'win32' ? filename.slice(0, 3) : '/'); return /^[A-Z]:$/i.test(value) ? `${value}/` : value; };
const humanSize = size => size > 1048576 ? ui("mb", (size / 1048576).toFixed(1)) : size > 1024 ? ui("kb", Math.round(size / 1024)) : ui("b", size);
function emit(name, value) { for (const callback of listeners.get(name) || []) callback(value); }
function notice(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 6000); }
function run(name) { const item = commands.get(name); if (item) return Promise.resolve().then(item.run).catch(error => notice(error.message)); }
function addCommand(item) { commands.set(item.id, item); return () => commands.delete(item.id); }
function editButton(key) { return ui("-", key, key); }
function word(key, tag = 'p', level = currentLevel()) {
  const nameIndex = key === 'aboutBody' ? 2 : key === 'landRegistry' ? 4 : 0;
  return `<${tag}><span class="character-copy">${escape(addressCopy(words[key], level, nameIndex))}</span> ${editButton(key)}</${tag}>`;
}

function modal(title, content, setup) {
  const dialog = $('#dialog');
  if (dialog.open) dialog.close();
  dialog.innerHTML = ui("--2", escape(title), content);
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  showWorkspaceDialog(dialog);
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
async function choose(title, message, options) {
  const previous = $('#dialog');
  if (previous.open) await new Promise(resolve => { previous.addEventListener('close', resolve, { once: true }); previous.close(); });
  return new Promise(resolve => {
    const dialog = modal(title, ui("template", escape(message), options.map((option, index) => `<button data-choice="${index}" class="${index === 0 ? 'primary' : ''}">${escape(option)}</button>`).join('')));
    let result = -1;
    for (const button of dialog.querySelectorAll('[data-choice]')) button.onclick = () => { result = Number(button.dataset.choice); dialog.close(); };
    dialog.addEventListener('close', () => resolve(result), { once: true });
  });
}
async function editWords(key) {
  const dialog = modal(ui("edit-yhwh-text"), ui("saving-updates-yhwh-etc-default-words-json-in-th", escape(key), escape(words[key])));
  if (boot.interface === 'mobile') {
    dialog.querySelector('p').textContent = 'Save this wording on this device.';
    dialog.querySelector('.primary').textContent = 'Save on this device';
  }
  dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
  dialog.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    try { words = await call('words:save', { [key]: dialog.querySelector('textarea').value }); dialog.close(); for (const tab of tabs) if (!tab.file) welcome(tab); pluginKey = ''; update(); notice(boot.interface === 'mobile' ? 'Saved on this device.' : ui("saved-to-yhwh-etc-default-words-json-")); }
    catch (error) { notice(error.message); }
  };
}

async function newTab(directory = active()?.cwd || boot.home) {
  const id = crypto.randomUUID();
  startingTerminals.add(id);
  let state;
  try { state = await call('focus:new', id, directory); }
  catch (error) { startingTerminals.delete(id); pendingTerminal.delete(id); throw error; }
  const tab = { id, ...state, file: null, markdownEditMode: 'live', focusView: 'document', selected: new Set(), folders: new Map(), history: [state.cwd], historyIndex: 0, showFiles: state.config.values.file_manager !== 'false', showTerminal: state.config.values.terminal === 'true', expanded: '', panelSizes: {} };
  tab.document = document.createElement('section'); tab.document.className = 'document-content'; tab.document.tabIndex = -1; tab.document.dataset.tab = id;
  $('#documents').append(tab.document);
  tab.terminalElement = document.createElement('div'); tab.terminalElement.className = 'terminal-instance'; tab.terminalElement.dataset.tab = id;
  $('#terminals').append(tab.terminalElement);
  tab.terminals = [];
  if (boot.capabilities?.terminal !== false) createTerminal(tab, id);
  tabs.push(tab); welcome(tab); activate(id);
  for (const message of pendingTerminal.get(id) || []) terminalMessage(message);
  pendingTerminal.delete(id);
  startingTerminals.delete(id);
  emit('tab', tab); return tab;
}
function createTerminal(tab, id = crypto.randomUUID()) {
  const element = document.createElement('div'); element.className = 'terminal-session';
  tab.terminalElement.append(element);
  const terminal = new Terminal({ cursorBlink: true, fontFamily: ui("-dejavu-sans-mono-monospace"), fontSize: 15, scrollback: 5000, theme: { background: '#131317', foreground: '#d4d0da', cursor: '#b7a1ef', selectionBackground: '#5c447977' } });
  const fit = new FitAddon(); terminal.loadAddon(fit); terminal.open(element);
  const session = { id, terminal, fit, element, cwd: tab.cwd };
  terminal.onData(data => bridge.terminal('write', { id, data }));
  terminal.attachCustomKeyEventHandler(event => {
    const binding = bindingFor(event);
    return !binding || binding.kind === 'disabled';
  });
  tab.terminals.push(session);
  tab.terminalId = id; tab.terminal = terminal; tab.fit = fit;
  return session;
}
async function newTerminal(tab = active()) {
  if (tab.terminals.length) return tab.terminals[0];
  if (tab.startingTerminal) return tab.startingTerminal;
  tab.startingTerminal = startTerminal(tab).finally(() => { tab.startingTerminal = null; });
  return tab.startingTerminal;
}
async function startTerminal(tab) {
  if (boot.capabilities?.terminal === false) throw new Error('Local Unix shells are available on desktop.');
  const id = crypto.randomUUID();
  startingTerminals.add(id);
  try { await call('terminal:open', tab.id, id); }
  catch (error) { startingTerminals.delete(id); pendingTerminal.delete(id); throw error; }
  const session = createTerminal(tab, id);
  for (const message of pendingTerminal.get(id) || []) terminalMessage(message);
  pendingTerminal.delete(id);
  startingTerminals.delete(id);
  tab.showTerminal = tab.terminals.length > 0; tab.expanded = '';
  if (active() === tab) { update(); focusTerminal(tab); }
  return session;
}
function focusTerminal(tab = active()) {
  requestAnimationFrame(() => {
    if (active() !== tab || $('#terminal-panel').hidden || document.querySelector('dialog[open]')) return;
    if (window.YHWH?.initial?.focusTerminal()) return;
    fitTerminal(); tab.terminal?.focus();
  });
}
async function revealTerminal(tab = active()) {
  if (!tab.terminals.length) await newTerminal(tab);
  tab.showTerminal = tab.terminals.length > 0; update(); fitTerminal(); focusTerminal(tab);
}
async function closeTerminal(id = active()?.terminalId, exited = false) {
  const tab = tabs.find(item => item.terminals.some(session => session.id === id)); if (!tab) return;
  const index = tab.terminals.findIndex(item => item.id === id), session = tab.terminals[index];
  if (!exited) await call('terminal:close', tab.id, id);
  session.terminal.dispose(); session.element.remove(); tab.terminals.splice(index, 1);
  tab.terminalId = null; tab.terminal = null; tab.fit = null;
  if ($('#terminals').hidden && active() === tab) return;
  tab.showTerminal = false; if (tab.expanded === 'terminal') tab.expanded = '';
  if (active() === tab) { update(); if (tab.lastFocus === 'terminal') restoreAfterTerminal(tab); }
}
function levelLabel(level) {
  return `YHWH level ${level.label}${level.edition ? ` · ${level.edition}` : ''}`;
}
function levelPoem(text) {
  return text ? `<pre class="level-poem" dir="ltr" tabindex="0"><code>${escape(text)}</code></pre>` : '';
}
function welcome(tab, level = levelAt(currentEnergy(tab.config))) {
  if (tab.initialView) return;
  if (tab.welcomeLevel !== level.id) tab.welcomeAside = nextLevelAside(level);
  tab.welcomeLevel = level.id;
  const [headline, ...lines] = [level.welcome, ...(level.lines || [])].filter(Boolean);
  const eyebrow = level.id === 'yhwh' ? '' : `<div class="eyebrow">${escape(levelLabel(level))}</div>`;
  const heading = level.id === 'yhwh'
    ? `<p class="level-greeting">${escape(headline)}</p>${word('welcomeTitle', 'h1', level)}`
    : `<h1>${escape(headline)}</h1>`;
  const greeting = level.welcome ? word('welcomeBody', 'p', level) : '';
  const aside = tab.welcomeAside ? `<p class="level-aside">${escape(tab.welcomeAside)}</p>` : '';
  const copy = lines.map(line => `<p>${escape(line)}</p>`).join('');
  tab.document.innerHTML = ui('welcome-screen', eyebrow, heading,
    `<div class="level-copy">${copy}${levelPoem(level.welcomePoem)}${greeting}${aside}${levelPoem(level.poem)}</div>`);
}
function activate(id) {
  const tab = tabs.find(item => item.id === id);
  if (!tab) return;
  const previous = active();
  if (previous && previous !== tab) {
    previous.filesScroll = $('#file-list').scrollTop;
    previous.filesFilter = $('#file-filter').value;
    if (document.activeElement === $('#file-title')) $('#file-title').blur();
  }
  activeId = id;
  for (const tab of tabs) { tab.document.hidden = tab.id !== id; tab.terminalElement.hidden = tab.id !== id; }
  $('#file-filter').value = tab.filesFilter || '';
  update();
  if (previous !== tab) $('#file-list').scrollTop = tab.filesScroll || 0;
  requestAnimationFrame(() => fitTerminal());
  if (active().focusView === 'inbox') renderInbox();
  emit('focus', active());
  requestAnimationFrame(() => {
    if (active() !== tab || document.querySelector('dialog[open]')) return;
    if (tab.lastFocus === 'terminal' && !$('#terminal-panel').hidden) focusTerminal(tab);
    else if (tab.lastFocus === 'files' && !$('#navigation-area').hidden) $('#file-list').focus();
    else if (boot.interface !== 'mobile') focusCurrent(tab);
  });
}
function tabTitles() {
  const label = tab => tab.customTitle || focusViews.get(tab.focusView)?.title || ({ margins: 'In the margins', inbox: 'Inbox', chat: 'Conversation' })[tab.focusView] || tab.file?.name || basename(tab.cwd);
  $('#tabs').innerHTML = tabs.map(tab => ui("--3", tab.id === activeId, tab.id, escape(tab.file?.path || tab.cwd), tab.dirty ? '● ' : '', escape(label(tab)), tab.id, escape(label(tab)))).join('');
  for (const element of $('#tabs').querySelectorAll('[data-tab]')) element.draggable = true;
}
let renderedFileRows;
function renderFiles() {
  const tab = active(); if (!tab) return;
  const filter = $('#file-filter').value.toLocaleLowerCase();
  const rows = [{ name: '..', path: tab.cwd === tab.worldRoot ? tab.cwd : parent(tab.cwd), directory: true, parent: true }, ...tab.entries.filter(entry => entry.name.toLocaleLowerCase().includes(filter))];
  const list = $('#file-list');
  const oldControl = list.contains(document.activeElement) && document.activeElement !== list ? document.activeElement : null;
  const html = rows.map(entry => fileRow(tab, entry)).join('');
  if (renderedFileRows !== html) {
    const path = oldControl?.closest('[data-path]')?.dataset.path;
    const attribute = oldControl?.hasAttribute('data-row-menu') ? 'data-row-menu' : 'data-expand-folder';
    list.innerHTML = html;
    renderedFileRows = html;
    if (path) (list.querySelector(`[data-path="${CSS.escape(path)}"] [${attribute}]`) || list).focus({ preventScroll: true });
  }
  $('#file-count').textContent = `${tab.entries.length} items${tab.selected.size ? ` · ${tab.selected.size} selected` : ''}`;
  const hiddenFiles = tab.config.values.show_hidden === 'true';
  const hiddenToggle = $('#files [data-command="toggle-hidden"]');
  hiddenToggle.setAttribute('aria-pressed', String(hiddenFiles));
  hiddenToggle.innerHTML = fileIcons[hiddenFiles ? 'visible' : 'hidden'];
  $('#location').value = tab.worldRoot ? tab.cwd.slice(tab.worldRoot.length) || '/' : tab.cwd;
  $('#terminal-cwd').textContent = tab.cwd;
  $('#shell-state').textContent = ui("-files");
}
function fileRow(tab, entry, depth = 0) {
  const folder = entry.parent ? undefined : tab.folders.get(entry.path);
  const expanded = !!folder?.open;
  const icon = fileIcons[entry.parent ? 'parent' : entry.directory ? 'expand' : 'file'];
  let row = ui("template-2", entry.directory ? 'directory' : '', entry.parent ? 'parent-row' : '', tab.selected.has(entry.path) ? 'selected' : '', tab.selected.has(entry.path), escape(entry.path), entry.directory, !!entry.parent, escape(entry.parent ? ui('parent-directory') : entry.path), icon, escape(entry.name), entry.directory ? 'Directory' : humanSize(entry.size), '');
  if (boot.interface === 'mobile' && !entry.parent) {
    if (entry.directory) {
      row = row.replace(/<span class="file-icon">.*?<\/span>/, () => `<button type="button" class="file-icon" data-expand-folder draggable="false" aria-label="Toggle contents of ${escape(entry.name)}" aria-expanded="${expanded}">${icon}</button>`);
    }
    row = row.replace(/<\/[^>]+>$/, match => `<button type="button" draggable="false" data-row-menu aria-label="Actions for ${escape(entry.name)}">${fileIcons.more}</button>${match}`);
  }
  return row.replace('role="option"', `draggable="${!entry.parent}" style="padding-left:${9 + depth * 18}px" data-depth="${depth}" ${entry.directory && !entry.parent ? `aria-expanded="${expanded}"` : ''} role="option"`) + (expanded ? `<div class="folder-children" data-children="${escape(entry.path)}">${folder.entries.map(child => fileRow(tab, child, depth + 1)).join('') || '<small class="empty-folder">Empty directory</small>'}</div>` : '');
}
async function toggleFolder(row, expand) {
  const tab = active(), path = row.dataset.path;
  if (row.dataset.directory !== 'true' || row.dataset.parent === 'true') return;
  let folder = tab.folders.get(path);
  const open = expand ?? !folder?.open;
  if (open) {
    const entries = await call('directory:list', tab.id, path);
    if (active() !== tab || !row.isConnected) return;
    folder = { open: true, entries }; tab.folders.set(path, folder);
  } else if (folder) folder.open = false;
  renderedFileRows = null;
  if (row.nextElementSibling?.dataset.children === path) row.nextElementSibling.remove();
  row.setAttribute('aria-expanded', String(open));
  row.querySelector('[data-expand-folder]')?.setAttribute('aria-expanded', String(open));
  if (open) {
    const group = document.createElement('div'); group.className = 'folder-children'; group.dataset.children = path;
    group.innerHTML = folder.entries.map(entry => fileRow(tab, entry, Number(row.dataset.depth) + 1)).join('') || '<small class="empty-folder">Empty directory</small>';
    row.after(group);
  }
}
function restoreAfterTerminal(tab) {
  if (tab.lastNonTerminalFocus === 'files' && !$('#navigation-area').hidden) $('#file-list').focus();
  else focusCurrent(tab);
}
function focusCurrent(tab = active()) {
  if (!tab || active() !== tab || document.querySelector('dialog[open]')) return;
  if (tab.focusView === 'chat') { if (boot.interface !== 'mobile') chatPanel?.element.querySelector('textarea')?.focus(); return; }
  if (tab.focusView === 'inbox') { $('#inbox-view').querySelector('button')?.focus(); return; }
  if (tab.pluginView?.id === tab.focusView) { tab.pluginView.element.focus({ preventScroll: true }); return; }
  if (tab.focusView !== 'document') return;
  if (tab.file?.mode === 'reading') tab.document.querySelector('.reading-view').focus({ preventScroll: true });
  else if (tab.editor && boot.interface !== 'mobile') tab.editor.focus();
  else tab.document.focus({ preventScroll: true });
}
function focusView(view) {
  active().focusView = view; update();
  if (view === 'inbox') renderInbox();
  emit('view', active()); focusCurrent();
}

function panelSize(panel) {
  const files = panel === 'files';
  const element = $(files ? '#navigation-area' : '#terminal-panel');
  const minimum = files ? 180 : 90;
  const mobileDrawer = files && boot.interface === 'mobile' && matchMedia('(max-width: 799px)').matches;
  const maximum = files ? $('#workspace').clientWidth - (mobileDrawer ? 0 : 350) : $('#focus-area').clientHeight - 90;
  return { element, minimum, maximum: Math.max(minimum, maximum), property: files ? 'sidebar_width' : 'terminal_height', axis: files ? 'width' : 'height' };
}

async function moveSplit({ panel, step, incremental }) {
  const tab = active(), files = panel === 'files', visibility = files ? 'showFiles' : 'showTerminal';
  const current = tab.expanded === panel ? 2 : tab[visibility] ? 1 : 0;
  const element = $(files ? '#navigation-area' : '#terminal-panel');
  if (incremental && current === 1 && element.getClientRects().length) {
    const { minimum, maximum, property, axis } = panelSize(panel);
    const delta = Math.max(1, Math.min(500, Number(tab.config.values.panel_resize_pixels) || 24));
    tab.panelSizes[property] = Math.max(minimum, Math.min(maximum, element.getBoundingClientRect()[axis] + step * delta));
    update();
    return;
  }
  const next = Math.max(0, Math.min(2, current + step));
  if (next === current) return;
  const wasFocused = element.contains(document.activeElement);
  if (files || next > 0) {
    const dock = files ? 'left' : 'bottom';
    if (element.dataset.area && element.dataset.area !== dock) movePanel(panel, dock);
  }
  if (!files && next > 0 && !tab.terminals.length) await newTerminal(tab);
  if (next === 2) tab.expanded = panel;
  else if (tab.expanded === panel || (!files && step > 0)) tab.expanded = '';
  tab[visibility] = next > 0;
  if (active() !== tab) return;
  update();
  if (document.querySelector('dialog[open]')) return;
  if (next === 2 || (wasFocused && next === 0)) {
    if (next === 2) {
      if (files) $('#file-list').focus(); else focusTerminal(tab);
    } else if (files) focusCurrent(tab);
    else restoreAfterTerminal(tab);
  }
}
function update() {
  const tab = active(); if (!tab) return;
  tabTitles(); renderFiles();
  const view = tab.focusView || 'document';
  $('#document').hidden = view !== 'document';
  $('#inbox-view').hidden = view !== 'inbox';
  if (chatPanel) chatPanel.element.hidden = view !== 'chat';
  for (const item of tabs) if (item.pluginView)
    item.pluginView.element.hidden = item !== tab || view !== item.pluginView.id;
  for (const button of document.querySelectorAll('.ribbon [data-command]')) button.setAttribute('aria-pressed', String(button.dataset.command === ({ document: 'focus-document', margins: 'margins', inbox: 'inbox', chat: 'chat' })[view]));
  $('#navigation-area').hidden = !tab.showFiles && tab.expanded !== 'files';
  const terminalPanel = $('#terminal-panel');
  const terminalWasHidden = terminalPanel.hidden;
  terminalPanel.hidden = !tab.showTerminal && tab.expanded !== 'terminal';
  if (terminalWasHidden && !terminalPanel.hidden) { progressWalk('shell'); receive('inspect'); }
  if (terminalWasHidden && !terminalPanel.hidden) requestAnimationFrame(() => {
    if (active() === tab && !terminalPanel.hidden) fitTerminal();
  });
  $('#workspace').dataset.expanded = tab.expanded;
  $('#title-row').hidden = !tab.file;
  if (document.activeElement !== $('#file-title')) $('#file-title').value = tab.file?.name || '';
  $('#dirty-indicator').textContent = tab.autosaveError ? 'Autosave paused · unsaved' : tab.dirty ? ui("unsaved") : '';
  $('#document-path').textContent = tab.file ? parent(tab.file.path) : tab.cwd;
  $('#language-button').textContent = tab.file?.language || ui("plain-text");
  $('#file-encoding').textContent = tab.file?.kind === 'text' ? ui("utf-8-", tab.file.newline === '\r\n' ? 'CRLF' : 'LF') : '';
  $('#view-mode').textContent = tab.file?.language === 'markdown' ? ({ live: 'Live Preview', source: 'Source', reading: 'Reading' })[tab.file.mode] : ['json', 'html'].includes(tab.file?.language) ? ui("pretty-format") : ui("source");
  $('#view-mode').disabled = tab.file?.kind !== 'text';
  $('#title-row [data-command="save"]').disabled = !tab.editor;
  applyConfig(tab.config);
}
function applyConfig(config) {
  const values = config.values, style = document.documentElement.style;
  const sizes = active()?.panelSizes || {};
  for (const [property, value] of Object.entries({ '--editor-size': `${Number(values.font_size) || 18}px`, '--ui-size': `${Math.max(14, Math.min(24, Number(values.ui_font_size) || 16))}px`, '--sidebar-width': `${sizes.sidebar_width || Number(values.sidebar_width) || 258}px`, '--terminal-height': `${sizes.terminal_height || Number(values.terminal_height) || 240}px`, '--editor-font': values.editor_font || ui("-segoe-ui-system-ui-sans-serif"), '--line-width': values.line_width || '820px' })) style.setProperty(property, value);
  if (sizes.sidebar_width) style.setProperty('--drawer-width', `${sizes.sidebar_width}px`);
  else style.removeProperty('--drawer-width');
  for (const tab of tabs) for (const session of tab.terminals) session.terminal.options.fontSize = Math.max(12, Math.min(28, Number(tab.config.values.terminal_font_size) || 15));
  const energy = currentEnergy(config), level = levelAt(energy);
  const levelChanged = document.body.dataset.level !== level.id;
  document.body.dataset.level = level.id;
  document.body.dataset.theme = energy < 100 ? level.id : 'yhwh';
  const isNietzsche = level.id === 'nietzsche';
  if (levelChanged) {
    if (isNietzsche) addCommand({ id: 'circus', name: ui('nietzsche-family-circus'), run: circus });
    else {
      commands.delete('circus');
      $('#dialog[open]:has([data-circus-dialog])')?.close();
    }
  }
  const view = active()?.focusView || 'document';
  $('#margin-box').classList.toggle('margin-widget', view === 'document');
  verseUI.setMargin(document.body.dataset.theme, view === 'margins' || (view === 'document' && isNietzsche));
  document.body.classList.toggle('theme-dark', values.theme !== 'light'); document.body.classList.toggle('theme-light', values.theme === 'light');
  const slider = $('#energy');
  const stops = unlockedLevels(edition.unlocked);
  slider.max = String(stops.length - 1);
  slider.value = String(stops.indexOf(level));
  slider.setAttribute('aria-valuetext', levelLabel(level));
  $('#mode-name').textContent = level.glyph || level.label;
  $('#mode-name').setAttribute('aria-label', `${levelLabel(level)}. Choose level`);
  const upgrade = nextUpgrade(edition.unlocked), upgradeButton = $('#upgrade-button');
  upgradeButton.hidden = !upgrade;
  if (upgrade) {
    upgradeButton.textContent = upgrade.glyph || upgrade.label;
    upgradeButton.title = upgrade.offer.title;
    upgradeButton.setAttribute('aria-label', upgrade.offer.title);
  }
  $('#divine-footnote').textContent = addressCopy(words[footerKey(level)], level, 1);
  $('.window-title').textContent = level.tagline || 'Toward a pro-human AI apocalypse.';
  $('#file-filter').placeholder = level.filter || 'Filter files…';
  const tab = active();
  if (tab && !tab.file && tab.welcomeLevel !== level.id) welcome(tab, level);
  if (levelChanged && tab?.focusView === 'chat') renderChat();
  if (levelChanged && tab?.focusView === 'inbox') renderInbox();
  $('#workspace').style.backgroundImage = config.background ? `linear-gradient(#1b1b20ce,#1b1b20ce), url("${config.background}")` : '';
  $('#user-theme').textContent = config.css || '';
  document.title = values.title || ui("-yhwh", active()?.file?.name || basename(active()?.cwd || ''));
  reloadPlugins(config).catch(error => notice(error.message));
  emit('config', config);
}
function footerKey(level) {
  return level.id === 'dawkins' || level.id === 'nietzsche' ? level.id : 'footer';
}
function fitTerminal() {
  const tab = active(); if (!tab || $('#terminal-panel').hidden || $('#terminals').hidden) return;
  const session = tab.terminals.find(item => item.id === tab.terminalId); if (!session) return;
  // A panel can be hidden by an ancestor (for example expanded Files). Fitting
  // that zero-size box sends a 2x1 resize to the running shell.
  const box = tab.terminalElement.getBoundingClientRect();
  if (box.width < 40 || box.height < 30) return;
  try {
    tab.fit.fit();
    const size = `${tab.terminal.cols}x${tab.terminal.rows}`;
    if (session.shellSize !== size) { bridge.terminal('resize', { id: session.id, cols: tab.terminal.cols, rows: tab.terminal.rows }); session.shellSize = size; }
  } catch {}
}
async function refresh(tab = active()) {
  if (!tab) return;
  const state = await call('list', tab.id);
  Object.assign(tab, state);
  await Promise.all([...tab.folders].filter(([, folder]) => folder.open).map(async ([path, folder]) => {
    try { folder.entries = await call('directory:list', tab.id, path); } catch { tab.folders.delete(path); }
  }));
  if (tab.id === activeId) { renderFiles(); applyConfig(tab.config); }
  emit('refresh', tab);
}
async function navigate(directory, tab = active(), history = true, focusFiles = false) {
  if (tab.initialRoot && directory !== tab.initialRoot && !directory.startsWith(tab.initialRoot + '/')) directory = tab.initialRoot;
  const state = await call('navigate', tab.id, directory);
  Object.assign(tab, state); tab.selected.clear(); tab.filesFilter = ''; tab.filesScroll = 0;
  const session = tab.terminals.find(item => item.id === tab.terminalId); if (session) session.cwd = tab.cwd;
  if (focusFiles && tab.entries.length) tab.selected.add(tab.entries[0].path);
  if (history && tab.history[tab.historyIndex] !== tab.cwd) { tab.history.splice(tab.historyIndex + 1); tab.history.push(tab.cwd); tab.historyIndex = tab.history.length - 1; }
  if (tab.id === activeId) {
    $('#file-filter').value = ''; update();
    if (focusFiles) { $('#file-list').focus(); $('#file-list').scrollTop = 0; }
  }
  emit('navigate', { id: tab.id, cwd: tab.cwd });
}
const navigateFiles = (directory, tab = active(), history = true) => navigate(directory, tab, history, true);
async function mayReplace(tab) {
  await tab.saveQueue?.catch(() => {});
  await flushAutosave(tab);
  if (!tab.dirty) return true;
  const choice = await choose(ui("unsaved-changes"), ui("save-changes-to-", tab.file.name), [ui("save"), ui("discard"), ui("cancel")]);
  if (choice === 0) { await save(tab); return true; }
  return choice === 1;
}
function clearDocument(tab) { tab.initialView = null; tab.customTitle = null; tab.welcomeLevel = undefined; clearTimeout(tab.autosaveTimer); tab.viewerCleanup?.(); tab.viewerCleanup = null; tab.editor?.destroy(); tab.editor = null; tab.document.innerHTML = ''; }
async function pdfAction(file) {
  const preference = file.config.values.pdf_open;
  if (['preview', 'external'].includes(preference)) return preference;
  const answer = await new Promise(resolve => {
    const dialog = modal('Open PDF', `<p>${escape(file.name)}</p><p>Preview here or use your system’s preferred PDF app?</p><label><input type="checkbox" name="remember-pdf"> Remember for all PDFs</label><div class="dialog-actions"><button data-pdf="preview">Preview here</button><button data-pdf="external">System app</button><button data-pdf="cancel">Cancel</button></div>`);
    let result = { action: 'cancel', remember: false };
    for (const button of dialog.querySelectorAll('[data-pdf]')) button.onclick = () => { result = { action: button.dataset.pdf, remember: dialog.querySelector('[name="remember-pdf"]').checked }; dialog.close(); };
    dialog.addEventListener('close', () => resolve(result), { once: true });
  });
  if (answer.remember && answer.action !== 'cancel') {
    await call('settings:save', { pdf_open: answer.action }, '/');
    file.config.values.pdf_open = answer.action;
    for (const tab of tabs) await refresh(tab);
  }
  return answer.action;
}
async function openFile(filename, tab = active(), options = {}) {
  if (options.external) { await call('file:external', filename); return true; }
  const generation = tab.openGeneration = (tab.openGeneration || 0) + 1;
  const current = () => tab.openGeneration === generation && tabs.includes(tab);
  const file = await call('file:read', filename);
  if (!current()) return false;
  if (tab.file?.path === file.path && !options.reload) {
    tab.focusView = 'document'; tab.expanded = '';
    if (tab === active()) { update(); focusCurrent(tab); }
    emit('open', tab.file); return true;
  }
  const action = file.kind === 'text' ? 'preview' : file.kind === 'pdf' ? await pdfAction(file) : 'external';
  if (action === 'cancel') return false;
  if (action === 'external') { await call('file:external', file.path); return true; }
  if (!current() || !await mayReplace(tab) || !current()) return false;
  if (options.reload) Object.assign(file, await call('file:read', filename));
  if (!current()) return false;
  const filenameParent = parent(file.path);
  if (filenameParent !== tab.cwd) await navigate(filenameParent, tab);
  if (!current()) return false;
  clearDocument(tab); tab.focusView = 'document';
  file.mode = file.language === 'markdown' ? tab.markdownEditMode : 'source';
  tab.file = file; tab.config = file.config; tab.dirty = false; tab.autosaveError = null;
  tab.selected = new Set([file.path]);
  tab.document.dataset.filename = file.path;
  tab.document.innerHTML = ui("template-3");
  if (file.kind === 'text') {
    const editor = await createEditor(tab.document.querySelector('.editor-host'), file, content => {
      tab.dirty = content !== tab.file.content.replace(/\r\n/g, '\n');
      if (tab.id === activeId) { $('#dirty-indicator').textContent = tab.autosaveError ? 'Autosave paused · unsaved' : tab.dirty ? ui("unsaved") : ''; tabTitles(); }
      emit('change', { path: file.path, content });
      scheduleAutosave(tab);
    }, (line, column) => { if (tab.id === activeId) $('#cursor-position').textContent = ui("ln-col", line, column); }, followLink);
    if (tab.file !== file || !tabs.includes(tab)) { editor.destroy(); return false; }
    tab.editor = editor;
  } else if (file.kind === 'pdf') {
    tab.document.replaceChildren();
    tab.viewerCleanup = await mountViewer(tab.document, file);
  }
  else {
    tab.document.innerHTML = ui("-this-format-opens-in-your-desktop-s-default-app", escape(file.name), escape(file.mime), humanSize(file.size));
    if (boot.interface === 'mobile') {
      tab.document.querySelector('.binary-view p:last-of-type').textContent = 'Open or share this file in another app.';
      tab.document.querySelector('[data-command="open-external"]').textContent = 'Open or share';
    }
  }
  tab.expanded = '';
  tab.document.dataset.language = file.language; tab.document.dataset.mode = file.mode;
  if (tab.id === activeId) {
    update();
    if (options.edit) tab.editor?.focus();
    else focusCurrent(tab);
  }
  emit('open', file); return true;
}
function scheduleAutosave(tab) {
  clearTimeout(tab.autosaveTimer);
  if (!tab.dirty || tab.movingFile || tab.config.values.autosave === 'false' || tab.autosaveError) return;
  tab.autosaveTimer = setTimeout(() => save(tab).catch(error => {
    tab.autosaveError = error.message;
    if (active() === tab) update();
    notice(`Autosave paused: ${error.message}`);
  }), 700);
}
async function flushAutosave(tab) {
  if (!tab.dirty || tab.config.values.autosave === 'false' || tab.autosaveError) return;
  try { await save(tab); }
  catch (error) { tab.autosaveError = error.message; if (active() === tab) update(); notice(`Autosave paused: ${error.message}`); }
}
function save(tab = active(), force = false) {
  if (!tab?.editor) return Promise.resolve();
  if (tab.movingFile) return moveFinished.then(() => save(tab, force));
  clearTimeout(tab.autosaveTimer);
  const file = tab.file, editor = tab.editor;
  const operation = (tab.saveQueue || Promise.resolve()).catch(() => {}).then(async () => {
    if (tab.file !== file || tab.editor !== editor) return;
    const text = editor.state.doc.toString();
    const content = file.newline === '\r\n' ? text.replace(/\n/g, '\r\n') : text;
    const state = await call('file:save', file.path, content, file.modified, force);
    Object.assign(file, state, { content });
    tab.dirty = editor.state.doc.toString() !== text; tab.autosaveError = null;
    if (tab.id === activeId) update();
    emit('save', file); scheduleAutosave(tab);
    if (presence.steps.length >= 2) receive('offering');
  });
  tab.saveQueue = operation;
  return operation;
}
async function closeTab(id = activeId) {
  const tab = tabs.find(item => item.id === id);
  if (!tab || tab.closing) return;
  tab.closing = true;
  try {
    if (!await mayReplace(tab)) return;
    await call('focus:close', id);
    const index = tabs.indexOf(tab);
    closedTabs.push({ cwd: tab.cwd, file: tab.file?.path, focusView: focusViews.has(tab.focusView) ? 'document' : tab.focusView, showFiles: tab.showFiles, showTerminal: tab.showTerminal, index });
    if (closedTabs.length > 30) closedTabs.shift();
    clearDocument(tab);
    disposeFocusView(tab);
    for (const session of tab.terminals) session.terminal.dispose();
    tab.document.remove();
    tab.terminalElement.remove();
    tabs.splice(index, 1);
    if (!tabs.length) {
      try { await newTab(tab.cwd); }
      catch (error) {
        if (tab.cwd === boot.home) throw error;
        if (!tabs.length) await newTab(boot.home);
      }
    } else if (activeId === id) activate(tabs[Math.min(index, tabs.length - 1)].id);
    else update();
    emit('close', { id });
  } finally { tab.closing = false; }
}
async function reopenTab() {
  const state = closedTabs.pop(); if (!state) return;
  const tab = await newTab(state.cwd);
  if (state.file) await openFile(state.file, tab);
  Object.assign(tab, { focusView: state.focusView, showFiles: state.showFiles, showTerminal: state.showTerminal });
  tabs.splice(tabs.indexOf(tab), 1); tabs.splice(Math.min(state.index, tabs.length), 0, tab); update();
}
function moveTab(delta) {
  const index = tabs.indexOf(active()), next = Math.max(0, Math.min(tabs.length - 1, index + delta));
  tabs.splice(next, 0, tabs.splice(index, 1)[0]); tabTitles();
}
async function newFile(directory = false) {
  const tab = active(), name = await promptText(directory ? ui("new-directory") : ui("new-file"), ui("name-including-any-extension"));
  if (!name) return;
  const filename = await call('file:create', join(tab.cwd, name), directory);
  await refresh(tab);
  if (!directory) await openFile(filename, tab, { edit: true });
}
async function renameFile(filename = active()?.file?.path) {
  if (!filename) return;
  const name = await promptText(ui("rename"), ui("name"), basename(filename));
  if (!name || name === basename(filename)) return;
  await renameTo(filename, name);
}
async function renameTo(filename, name) {
  if (!name.trim() || /[/\\]/.test(name) || ['.', '..'].includes(name)) throw new Error(ui("use-a-filename-without-slashes-"));
  await moveItems([{ source: filename, destination: join(parent(filename), name) }]);
}
const withinPath = (value, root) => value === root || value?.startsWith(root.replace(/[/\\]$/, '') + (root.includes('\\') ? '\\' : '/'));
const moveRoots = paths => [...new Set(paths)].filter(filename => !paths.some(other => other !== filename && withinPath(filename, other)));
let movingFiles = false, moveFinished = Promise.resolve();
async function moveItems(items) {
  if (movingFiles) throw new Error('Wait for the current move to finish.');
  items = items.filter(item => item.source !== item.destination);
  if (!items.length) return;
  for (const { source, destination } of items) {
    if (withinPath(destination, source)) throw new Error('Cannot move a folder into itself.');
  }
  if (new Set(items.map(item => item.destination)).size !== items.length) throw new Error('The selected items have the same destination name.');
  movingFiles = true;
  let finishMove;
  moveFinished = new Promise(resolve => { finishMove = resolve; });
  const affected = tabs.filter(tab => items.some(item => withinPath(tab.file?.path, item.source)));
  for (const tab of affected) { tab.movingFile = true; clearTimeout(tab.autosaveTimer); }
  try {
    await Promise.all(affected.map(tab => tab.saveQueue?.catch(() => {})));
    // Check the whole selection before moving any item. The bridge also refuses
    // collisions at the time of each move; a failure never overwrites a file.
    for (const { destination } of items) {
      const entries = await call('directory:list', active().id, parent(destination));
      if (entries.some(entry => entry.name === basename(destination))) throw new Error(`A file named ${basename(destination)} already exists.`);
    }
    for (const { source, destination } of items) {
      await call('file:move', source, destination);
      const remap = value => withinPath(value, source) ? destination + value.slice(source.length) : value;
      for (const tab of tabs) {
        tab.selected = new Set([...tab.selected].map(remap));
        tab.history = tab.history.map(remap);
        tab.folders = new Map([...tab.folders].map(([filename, folder]) => [remap(filename), folder]));
        if (withinPath(tab.cwd, source)) await navigate(remap(tab.cwd), tab, false);
        for (const session of tab.terminals) session.cwd = remap(session.cwd);
        if (!withinPath(tab.file?.path, source)) continue;
        const filename = remap(tab.file.path);
        tab.file.path = filename; tab.file.name = basename(filename); tab.document.dataset.filename = filename;
        const updated = await call('file:read', filename);
        // Keep a stale version stale if an external edit preceded the move.
        if (updated.content === tab.file.content) tab.file.modified = updated.modified;
        tab.file.language = updated.language; tab.document.dataset.language = updated.language;
        if (tab.editor) await setLanguage(tab.editor, updated.language, tab.file.mode !== 'source');
      }
    }
  } finally {
    movingFiles = false;
    finishMove();
    for (const tab of affected) { tab.movingFile = false; scheduleAutosave(tab); }
    await Promise.all(tabs.map(tab => refresh(tab).catch(error => notice(error.message))));
    update();
  }
}
async function moveToDirectory(paths, directory) {
  await moveItems(moveRoots(paths).map(source => ({ source, destination: join(directory, basename(source)) })));
}
async function moveFile(filename) {
  const directory = await call('choose', 'directory', active().cwd);
  if (directory) await moveToDirectory([filename], directory);
}
function selectedPaths() { return [...active().selected].filter(filename => filename !== parent(active().cwd) && filename !== active().worldRoot); }
async function pasteFiles() {
  if (!clipboardFiles) return;
  if (clipboardFiles.cut) { await moveToDirectory(clipboardFiles.paths, active().cwd); clipboardFiles = null; }
  else for (const filename of moveRoots(clipboardFiles.paths)) await call('file:copy', filename, join(active().cwd, basename(filename)));
  await refresh();
}
async function trashFiles(paths = selectedPaths()) {
  if (!paths.length) return;
  if (await choose(ui("move-to-trash"), boot.interface === 'mobile' ? `Move ${paths.length} item(s) to the workspace’s hidden .Trash folder?` : ui("move-item-s-to-the-desktop-trash-", paths.length), [ui("move-to-trash"), ui("cancel")]) !== 0) return;
  for (const filename of paths) {
    const within = value => value === filename || value?.startsWith(filename + '/');
    const affected = tabs.filter(tab => within(tab.file?.path));
    for (const tab of affected) if (!await mayReplace(tab)) return;
    for (const tab of affected) clearTimeout(tab.autosaveTimer);
    await call('file:trash', filename);
    for (const tab of affected) { clearDocument(tab); tab.file = null; tab.dirty = false; tab.autosaveError = null; welcome(tab); }
    for (const tab of tabs) if (within(tab.cwd)) await navigate(parent(filename), tab);
  }
  active().selected.clear(); await Promise.all(tabs.map(tab => refresh(tab))); update();
}

function settings() {
  const tab = active(), values = tab.config.values;
  const mobile = boot.interface === 'mobile';
  const keyControls = Object.entries(panelKeys).filter(([, spec]) => !mobile || spec.panel === 'files');
  const row = (label, description, control) => `<label class="setting-row"><span><strong>${label}</strong><small>${description}</small></span>${control}</label>`;
  const number = (key, min, max) => `<input type="number" name="${key}" min="${min}" max="${max}" value="${escape(values[key])}">`;
  const toggle = key => `<input type="checkbox" role="switch" name="${key}" ${(key === 'narrative' ? presence.enabled || values[key] === 'true' : values[key] === 'true') ? 'checked' : ''}>`;
  const dialog = modal('Settings', `<form id="settings-form" class="settings-layout"><nav aria-label="Settings categories"><button type="button" data-category="appearance" aria-pressed="true">Appearance</button><button type="button" data-category="files" aria-pressed="false">Files & editor</button><button type="button" data-category="keys" aria-pressed="false">Keys</button><button type="button" data-category="presence" aria-pressed="false">Presence</button><button type="button" data-category="advanced" aria-pressed="false">Advanced</button></nav><div class="settings-content">
    <section data-section="appearance"><h3>Appearance</h3>${row('Interface size', 'Text throughout the app, in pixels.', number('ui_font_size',14,24))}${row('Editor size', 'Give your words some room.', number('font_size',12,36))}${row('Terminal size', 'Shell text, in pixels.', number('terminal_font_size',12,28))}${window.YHWH?.three ? row('Impossible surfaces', 'Brief melting type and elastic windows. Paused while typing; respects reduced motion.', `<input type="checkbox" role="switch" name="spatial_effects" ${values.spatial_effects !== 'false' && !['0','false'].includes(values.motion) ? 'checked' : ''}>`) : ''}</section>
    <section data-section="files" hidden><h3>Files & editor</h3>${row('Hidden files', 'Show names beginning with a dot.', toggle('show_hidden'))}${row('Autosave', 'Save edits after a short pause. Conflicts pause autosave for review.', toggle('autosave'))}${row('Open PDFs', 'Choose once for all PDFs, or ask each time. Double-click or Ctrl+click uses the system app.', `<select name="pdf_open">${[['ask','Ask each time'],['preview','Preview here'],['external','System app']].map(([value,label]) => `<option value="${value}" ${values.pdf_open === value ? 'selected' : ''}>${label}</option>`).join('')}</select>`)}<p class="muted">Other attachments open with your system’s preferred app.</p><p class="muted">Markdown opens in source view. Use Ctrl+R or the toolbar button to toggle preview.</p><p class="muted">Click a folder to unfold it. Double-click or Enter to go there. Arrow keys unfold and collapse.</p></section>
    <section data-section="presence" hidden><h3>Presence</h3>${row('Free YHWH-ness', 'Dawkins ← Nietzsche → YHWH. Use the title bar to switch preview editions.', `<input type="range" name="energy" min="0" max="100" value="${freeEnergy(values)}" aria-label="Free YHWH-ness">`)}${row('Inbox messages', 'Occasional letters while you work. No popups.', toggle('inbox'))}${row('Take a walk', 'An optional story through files, shell, and the world underneath.', toggle('narrative'))}<p><button type="button" data-command="narrative">Continue the walk →</button></p><details class="divine-aside"><summary>Land registry</summary>${word('landRegistry')}</details></section>
    <section data-section="keys" hidden><h3>Keys</h3><p class="muted">${mobile ? 'These shortcuts use a hardware keyboard. Open the Initial from the command menu for an in-app shell.' : 'Panel shortcuts work from the terminal, editor, and file manager.'} Enter a combination such as Ctrl+Up, or use off to disable it.</p>
      ${row('Resize step', 'Pixels per keypress.', number('panel_resize_pixels', 1, 500))}
      ${keyControls.map(([id, spec]) => row(spec.label, spec.incremental ? 'Adjust the split a little.' : 'Step between hidden, split and maximized.', `<input name="key_${id}" value="${escape((values['key_' + id] || spec.key).replaceAll('/', '+'))}" autocomplete="off" spellcheck="false">`)).join('')}
    </section>
    <section data-section="advanced" hidden><h3>Advanced</h3><p class="muted">Ordinary shell configuration. Bring your own tools.</p>${row('Background', 'Image path', `<input name="bg" value="${escape(values.bg || '')}">`)}${row('Stylesheet', 'CSS path', `<input name="stylesheet" value="${escape(values.stylesheet || '')}">`)}${row('Plugins', 'Directory paths as a JSON array', `<input name="plugins" value="${escape(values.plugins || '[]')}">`)}${boot.interface === 'mobile' ? '' :
      row('Your email address', 'The sender address and where YHWH sends mail to you.', `<input type="email" name="mail_self" value="${escape(values.mail_self || '')}">`) +
      row('Outgoing mail command', 'A configured sendmail-compatible executable, such as /usr/sbin/sendmail.', `<input name="mail_transport" value="${escape(values.mail_transport || '')}">`)}<p><button type="button" data-edit-config>Edit rc file</button><button type="button" data-reload-config>Reload</button></p><small>${escape(tab.config.userDirectory)}/rc</small>${tab.config.warnings.map(w => `<p class="warning">${escape(w)}</p>`).join('')}</section>
    <footer><label>Apply to <select name="_scope"><option value="/">Everywhere</option><option value="${escape(tab.cwd)}">This directory and children</option></select></label><button class="primary" type="submit">Save settings</button></footer></div></form>`);
  dialog.querySelector('[data-section="files"] h3').insertAdjacentHTML('afterend', row('Default directory', mobile ? 'Opens from the app icon. Leave blank to open the app’s storage root (/).' : 'Opens from the app launcher. Leave blank to open your home directory.', `<input name="default_directory" value="${escape(boot.defaultDirectory)}" autocomplete="off" spellcheck="false">`));
  dialog.querySelector('[data-section="presence"]').insertAdjacentHTML('beforeend', '<p><button type="button" data-command="merch-setup">Merch store setup</button></p>');
  if (boot.interface === 'mobile') {
    dialog.querySelector('[name="terminal_font_size"]').closest('label').hidden = true;
    dialog.querySelector('[name="pdf_open"]').closest('label').querySelector('small').textContent = 'Preview here, or export/share through your device. Choose once for all PDFs or ask each time.';
    dialog.querySelector('[data-section="files"] p.muted').textContent = 'Other attachments use your device’s export/share sheet.';
    dialog.querySelector('[data-section="advanced"] p.muted').textContent = 'Settings are saved on this device. Image and CSS paths refer to your YHWH workspace.';
    dialog.querySelector('[data-edit-config]').hidden = true;
    dialog.querySelector('[name="plugins"]').closest('label').hidden = true;
    dialog.querySelector('[data-section="advanced"] > small').textContent = 'Bundled plugins are included automatically.';
  }
  for (const button of dialog.querySelectorAll('[data-category]')) button.onclick = () => {
    for (const section of dialog.querySelectorAll('[data-section]')) section.hidden = section.dataset.section !== button.dataset.category;
    for (const item of dialog.querySelectorAll('[data-category]')) item.setAttribute('aria-pressed', String(item === button));
  };
  dialog.querySelector('[data-edit-config]').onclick = async () => { dialog.close(); const filename = await call('config:open'); await openFile(filename); };
  dialog.querySelector('[data-reload-config]').onclick = async () => { pluginKey = ''; await call('config:reload'); await refresh(); for (const item of tabs) scheduleAutosave(item); dialog.close(); notice(ui("configuration-reloaded-")); };
  dialog.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    try {
      const data = Object.fromEntries(new FormData(event.target)), scope = data._scope; delete data._scope;
      const startDirectory = data.default_directory.trim();
      delete data.default_directory;
      if (startDirectory !== (boot.defaultDirectory || '') && startDirectory) {
        const destination = startDirectory === '~' ? boot.home : join(boot.home, startDirectory.replace(/^~\//, ''));
        if (!(await call('path:stat', destination)).directory) throw new Error('Choose an existing default directory.');
      }
      const assignedKeys = new Set();
      for (const [id, { key }] of keyControls) {
        const name = 'key_' + id, value = data[name].trim();
        const combo = value.toLowerCase() === 'off' ? 'off' : value ? canonical(value.replace(/\s+/g, '').replaceAll('+', '/')) : key;
        if (combo !== 'off' && assignedKeys.has(combo)) throw new Error(`Choose a different panel shortcut for ${combo.replaceAll('/', '+')}.`);
        if (combo !== 'off') assignedKeys.add(combo);
        if (combo === (values[name] || key)) delete data[name];
        else data[name] = combo === key ? '' : combo;
      }
      for (const key of ['show_hidden', 'autosave', 'inbox', 'narrative']) data[key] = String(event.target.elements[key].checked);
      if (event.target.elements.spatial_effects) { data.spatial_effects = String(event.target.elements.spatial_effects.checked); data.motion = event.target.elements.spatial_effects.checked ? '1' : '0'; }
      data.theme = Number(data.energy) === 0 ? 'dawkins' : Number(data.energy) < 100 ? 'nietzsche' : 'yhwh';
      if (data.plugins) { const parsed = JSON.parse(data.plugins); if (!Array.isArray(parsed)) throw new Error(ui("plugins-must-be-a-json-array-")); }
      if (data.layout) JSON.parse(data.layout);
      if (data.energy && !(Number(data.energy) >= 0 && Number(data.energy) <= 100)) throw new Error(ui("yhwh-ness-must-be-between-0-and-100-"));
      for (const [key, min, max] of [['ui_font_size',14,24], ['font_size',12,36], ['terminal_font_size',12,28], ['panel_resize_pixels',1,500]]) if (!Number.isFinite(Number(data[key])) || Number(data[key]) < min || Number(data[key]) > max) throw new Error(`${key} must be between ${min} and ${max}.`);
      temporaryEnergy = undefined;
      if (startDirectory !== (boot.defaultDirectory || '')) {
        if (scope === '/') data.default_directory = startDirectory;
        else await call('settings:save', { default_directory: startDirectory }, '/');
      }
      await call('settings:save', data, scope);
      boot.defaultDirectory = startDirectory;
      presence.enabled = data.narrative === 'true'; savePresence(); await Promise.all(tabs.map(tab => refresh(tab))); for (const item of tabs) scheduleAutosave(item); dialog.close();
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
      changeMarkdownMode(tab, data.language === 'markdown' ? tab.markdownEditMode : 'source');
      await setLanguage(tab.editor, data.language, tab.file.mode, followLink);
      dialog.close(); update(); focusCurrent(tab);
    } catch (error) { notice(error.message); }
  };
}
async function viewMode() {
  const tab = active(); if (!tab?.editor || tab.focusView !== 'document') return;
  if (tab.file.language === 'markdown') {
    if (tab.file.mode === 'reading') return changeMarkdownMode(tab, tab.markdownEditMode);
    return readingView();
  }
  const text = await formatText(tab.editor.state.doc.toString(), tab.file.language);
  tab.editor.dispatch({ changes: { from: 0, to: tab.editor.state.doc.length, insert: text } });
  focusCurrent(tab);
}
function toggleMarkdownSource() {
  const tab = active(); if (tab?.file?.language !== 'markdown' || !tab.editor || tab.focusView !== 'document') return;
  const mode = tab.file.mode === 'source' ? 'live' : 'source';
  changeMarkdownMode(tab, mode);
}
function changeMarkdownMode(tab, mode) {
  const editor = tab.document.querySelector('.editor-host');
  const reading = tab.document.querySelector('.reading-view');
  const leavingReading = !reading.hidden;
  if (mode === 'reading') {
    const ratio = tab.editor.scrollDOM.scrollTop / Math.max(1, tab.editor.scrollDOM.scrollHeight - tab.editor.scrollDOM.clientHeight);
    reading.innerHTML = renderMarkdown(tab.editor.state.doc.toString(), tab.file.path);
    reading.tabIndex = 0; reading.setAttribute('aria-label', 'Reading view');
    reading.hidden = false;
    reading.scrollTop = ratio * (reading.scrollHeight - reading.clientHeight);
  } else {
    tab.markdownEditMode = tab.file.language === 'markdown' ? mode : tab.markdownEditMode;
    setEditorMode(tab.editor, tab.file.language, mode, followLink);
    reading.hidden = true;
  }
  editor.hidden = mode === 'reading';
  tab.document.dataset.mode = tab.file.mode = mode;
  update(); emit('view', tab);
  if (active() === tab) {
    if (leavingReading && mode !== 'reading') tab.editor.requestMeasure();
    focusCurrent(tab);
  }
}
function readingView() {
  const tab = active(); if (!tab?.editor || tab.file.language !== 'markdown' || tab.file.mode === 'reading') return;
  tab.focusView = 'document';
  changeMarkdownMode(tab, 'reading');
}
function chooseViewMode() {
  const tab = active();
  if (!tab?.editor || tab.file.language !== 'markdown') return viewMode();
  const dialog = modal('Markdown view', '<div class="menu-list"><button data-mode="live">Live Preview</button><button data-mode="source">Source</button><button data-mode="reading">Reading</button></div>');
  for (const button of dialog.querySelectorAll('[data-mode]')) {
    button.setAttribute('aria-pressed', String(button.dataset.mode === tab.file.mode));
    button.onclick = () => { dialog.close(); changeMarkdownMode(tab, button.dataset.mode); };
  }
}
function fileMenu(filename = active()?.file?.path) {
  if (!filename) return;
  const mobile = boot.interface === 'mobile';
  const folder = active()?.entries.some(entry => entry.path === filename && entry.directory)
    || [...$('#file-list').querySelectorAll('[data-directory="true"]')].some(row => row.dataset.path === filename);
  const items = [
    [ui("open-in-a-new-app-tab"), () => openRequest({ path: filename })],
    [ui("rename-"), () => renameFile(filename)],
    ['Move to folder…', () => moveFile(filename)],
    [ui("copy"), () => { clipboardFiles = { paths: [filename], cut: false }; }],
    [ui("cut"), () => { clipboardFiles = { paths: [filename], cut: true }; }],
    ['Copy Full Path', () => call('clipboard:path', filename)],
    ['Copy Relative Path', () => call('clipboard:path', filename, active().worldRoot || active().cwd)],
    ...(mobile
      ? folder ? [] : [['Export or share…', () => call('file:external', filename)]]
      : [[ui("open-in-desktop-application"), () => call('file:external', filename)],
        [ui("show-in-desktop-file-manager"), () => call('file:reveal', filename)]]),
    [ui("reading-view-markdown-"), readingView],
    [ui("overwrite-file-with-editor-contents-"), async () => { if (await choose(ui("overwrite-file"), ui("replace-the-on-disk-contents-with-this-editor-s-"), [ui("overwrite"), ui("cancel")]) === 0) await save(active(), true); }],
    [ui("move-to-trash-"), () => trashFiles([filename])],
  ];
  const dialog = modal(basename(filename), ui("template-5", items.map(([label], i) => `<button data-menu="${i}">${escape(label)}</button>`).join('')));
  for (const button of dialog.querySelectorAll('[data-menu]')) button.onclick = async () => {
    const action = items[Number(button.dataset.menu)][1];
    await new Promise(resolve => { dialog.addEventListener('close', resolve, { once: true }); dialog.close(); });
    Promise.resolve().then(action).catch(error => notice(error.message));
  };
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
  const notes = (currentLevel().about || []).map(line => `<p class="muted">${escape(line)}</p>`).join('');
  modal(words.aboutTitle, ui("-about-us-genesis-by-the-nameless-", editButton('aboutTitle'), word('aboutBody') + notes + merch.links()));
}
function aboutUs() {
  modal('About Us', `<div class="publisher-signature"><span class="ld-mark" aria-hidden="true"></span><strong>The Dynamic Linker</strong></div><div class="menu-list"><button data-command="our-team">Our Team <span>Meet the people</span></button><button data-command="roadmap">Roadmap <span>A few very large promises</span></button><button data-url="https://thedynamiclinker.com">The Dynamic Linker ↗</button></div>`);
}
function ourTeam() {
  modal('About Us › Our Team', `${word('teamBody')}<button data-command="about-us">← About Us</button>`);
}
function roadmap() {
  modal('About Us › Roadmap', `<p>Here at LD, we believe that</p><div class="seed-proclamation">${word('roadmapBody')}</div><button data-command="seed-funding">Seed funding</button><button data-command="about-us">← About Us</button>`);
}
function seedFunding() {
  const payment = active().config.values.stripe_payment_link;
  modal(words.seedTitle, `${word('seedBody')}<blockquote class="character-copy">${escape(words.seedQuote)}</blockquote><small><span class="character-copy">${escape(words.seedAttribution)}</span> ${editButton('seedQuote')} ${editButton('seedAttribution')}</small><div class="dialog-actions">${payment ? '<button class="primary" data-command="pay">Give YHWH money ↗</button>' : `<p class="muted">${escape(address('Donation checkout is not connected yet, Abe.', 1))}</p>`}</div>`);
}
function comingSoon() { modal(ui("coming-soon"), ui("support-development", word('upgrades'), word('comingSoon'))); }
function upgradeEdition() {
  const upgrade = nextUpgrade(edition.unlocked);
  if (!upgrade) return modes();
  const { title, lines } = upgrade.offer;
  const dialog = modal(title, `<div class="edition-offer">
    <p class="offer-lead">${escape(lines[0])}</p>
    ${lines.slice(1).map(line => `<p>${escape(line)}</p>`).join('')}
    <button class="primary" type="button" data-steal-upgrade>Steal Upgrade</button>
    <p class="muted">${escape(stripe.status)}</p>
    <details class="stripe-setup"><summary>${escape(stripe.title)}</summary>
      <ol>${stripe.steps.map(step => `<li>${escape(step)}</li>`).join('')}</ol>
      ${Object.entries(stripe.links).map(([label, url]) => `<p><a href="${escape(url)}">${escape(label)} ↗</a></p>`).join('')}
    </details>
  </div>`);
  dialog.querySelector('[data-steal-upgrade]').onclick = () => {
    if (nextUpgrade(edition.unlocked) !== upgrade) return;
    try {
      saveEdition({ unlocked: upgrade.energy, selected: upgrade.energy });
      energyRevision++; temporaryEnergy = undefined;
      applyConfig(active().config);
      dialog.close();
      $('#mode-name').focus();
      notice(`${upgrade.edition} unlocked on this device.`);
    } catch (error) { notice(error.message); }
  };
}
function circus() {
  if (currentLevel().id !== 'nietzsche') return;
  const dialog = modal(ui('nietzsche-family-circus'), `<div data-circus-dialog aria-live="polite"></div>
    <div class="dialog-actions"><a data-circus-source href="${circusOrigin}/">Original site ↗</a><button class="primary" type="button" data-circus-next>Next pairing</button></div>`);
  const body = dialog.querySelector('[data-circus-dialog]');
  const source = dialog.querySelector('[data-circus-source]');
  const next = dialog.querySelector('[data-circus-next]');
  async function load() {
    next.disabled = true;
    body.innerHTML = ui('fetching-a-cartoon-and-a-wildly-inappropriate-ph');
    try {
      const pair = await call('circus');
      if (!dialog.open || !body.isConnected) return;
      body.innerHTML = ui('cartoon-and-pairing-from-nietzsche-family-circus', escape(pair.image), escape(pair.quote));
      source.href = pair.permalink || circusOrigin + '/';
      source.textContent = pair.permalink ? 'Original pairing ↗' : 'Original site ↗';
    } catch (error) {
      body.querySelector('p').textContent = error.message;
      source.href = circusOrigin + '/';
      source.textContent = 'Original site ↗';
    } finally { next.disabled = false; }
  }
  next.onclick = load;
  return load();
}
function modes() {
  const current = currentLevel(), upgrade = nextUpgrade(edition.unlocked);
  const canUnsteal = Boolean(unstealUpgrade(edition));
  const choices = unlockedLevels(edition.unlocked).map(level => `<button data-energy="${level.energy}" aria-pressed="${level === current}">${escape(level.label)} ${level.edition ? `<span>${escape(level.edition)}</span>` : ''}</button>`).join('');
  const dialog = modal(ui("yhwh-ness"), `<div class="menu-list edition-menu">${choices}</div>
    <p class="muted">${escape([current.welcome, ...(current.lines || [])].filter(Boolean).join(' '))}</p>
    <div class="dialog-actions edition-actions">${current.id === 'nietzsche' ? `<button data-command="circus">${escape(ui('nietzsche-family-circus'))} ↗</button>` : ''}
      ${upgrade ? `<button data-command="upgrade">${escape(upgrade.offer.title)}</button>` : ''}
      ${canUnsteal ? '<button type="button" data-unsteal-upgrade>Unsteal Upgrade</button>' : ''}</div>`);
  for (const button of dialog.querySelectorAll('[data-energy]')) button.onclick = () => {
    dialog.close(); setEnergy(Number(button.dataset.energy)).catch(error => notice(error.message));
  };
  if (canUnsteal) dialog.querySelector('[data-unsteal-upgrade]').onclick = () => {
    const previous = unstealUpgrade(edition);
    if (!previous) return;
    const locked = levelAt(edition.unlocked);
    try {
      saveEdition(previous);
      applyConfig(active().config);
      dialog.close();
      $('#mode-name').focus();
      notice(`${locked.edition} locked on this device.`);
    } catch (error) { notice(error.message); }
  };
}
async function setEnergy(value) {
  if (!Number.isInteger(value) || value < 0 || value > edition.unlocked) return;
  const level = levelAt(value), revision = ++energyRevision;
  if (level.offer) {
    try { saveEdition({ ...edition, selected: value }); }
    finally { temporaryEnergy = undefined; applyConfig(active().config); }
    return;
  }
  temporaryEnergy = value; applyConfig(active().config);
  const saved = energySave.then(async () => {
    await call('settings:save', { theme: level.id, energy: String(value) });
    if (edition.selected && revision === energyRevision) saveEdition({ ...edition, selected: undefined });
    await Promise.all(tabs.map(tab => refresh(tab)));
  });
  energySave = saved.catch(() => {});
  try { await saved; }
  finally {
    if (revision === energyRevision) { temporaryEnergy = undefined; applyConfig(active().config); }
  }
}
function higherHelp() {
  if (boot.interface === 'mobile') return run('mobile-guide');
  modal(words.helpTitle, `<div class="higher-choices"><button data-command="be-yhwh">${escape(words.god)}</button><button data-command="be-root">${escape(words.man)}</button></div>`);
}
async function enterWorld(name) {
  const choice = await choose(words.helpTitle, words[name + 'Message'], [words[name + 'Confirm'], ui('cancel')]);
  if (choice !== 0) return;
  const tab = await newTab();
  try {
    Object.assign(tab, await call('world:enter', tab.id, name));
    tab.history = [tab.cwd]; tab.historyIndex = 0; tab.showFiles = true; update(); progressWalk('world');
  } catch (error) { await closeTab(tab.id); throw error; }
}
async function fanMail() {
  const quotes = await call('world:quotes');
  modal(words.fanTitle, word('fanTitle', 'h3') + word('fanIntro') + quotes.map(item => `<blockquote><p>“${escape(item.quote)}”</p><footer>${escape(item.author)} · <a href="${escape(item.url)}">${escape(item.work)}</a></footer></blockquote>`).join('') + `<button data-command="edit-fan-mail">${escape(ui('edit-feature-copy'))}</button>`);
}
function sendMail() {
  const tab = active(), direct = boot.interface !== 'mobile' && tab.config.values.mail_transport && tab.config.values.mail_self;
  const form = ui('mail-form', escape(words.mailSubject), escape(words.mailBody), escape(words.mailPrepare), escape(yhwhAddress),
    direct ? '<button class="primary" type="submit" value="send">Send email</button>' : '');
  modal(words.mailTitle, word('mailTitle', 'h3') + word('mailIntro') + form, dialog => {
    dialog.querySelector('form').onsubmit = async event => {
      event.preventDefault();
      const form = event.target, buttons = [...form.querySelectorAll('button')];
      const fields = Object.fromEntries(new FormData(form));
      const action = event.submitter?.value || 'draft';
      for (const button of buttons) button.disabled = true;
      try {
        const result = await call('mail', tab.id, action, fields);
        if (result.accepted) { dialog.close(); notice(`Electronic Mail accepted the message to ${result.to}.`); }
      } catch (error) { notice(error.message); }
      finally { for (const button of buttons) button.disabled = false; }
    };
  });
}
async function bookList(name) {
  const library = await call('world:books', name);
  modal(words[name === 'sinai' ? 'booksSinai' : 'booksHoreb'], `<ol>${library.items.map(item => `<li>${item.url ? `<a href="${escape(item.url)}">${escape(item.title)}</a>` : `${escape(item.title)} <small>${escape(words.booksUnavailable)}</small>`}</li>`).join('')}</ol><button data-command="edit-${name}">${escape(ui('edit-feature-copy'))}</button>`);
}
function help() {
  const keys = active()?.config.keys?.bindings || [];
  modal(ui("help"), `<button data-command="hotkeys">Inspect or change keyboard bindings</button>` + ui("each-tab-is-a-directory-a-shell-and-an-optional-", keys.filter(item => item.kind !== 'disabled').map(item => `<div><span>${escape(commands.get(item.command)?.name || item.command || item.kind)}</span><kbd>${escape(item.combo.replaceAll('/', '+'))}</kbd></div>`).join('')));
}

const panels = new Map();
function movePanel(id, area) {
  const element = panels.get(id)?.element || ({ files: $('#navigation-area'), terminal: $('#terminal-panel'), document: $('#document') })[id];
  if (!element) throw new Error(ui("unknown-panel-", id));
  const destination = ({ right: $('#right-panels'), center: $('#center-panels'), bottom: $('#focus-area'), left: $('#workspace') })[area];
  if (!destination || element.contains(destination)) throw new Error(ui("invalid-panel-position-"));
  if (area === 'left') destination.insertBefore(element, $('#focus-area')); else destination.append(element);
  element.dataset.area = area;
  fitTerminal();
  requestAnimationFrame(fitTerminal);
}
function addPanel({ id, title, area = 'right', render }) {
  if (panels.has(id)) throw new Error(ui("panel-already-exists-", id));
  const element = document.createElement('section'); element.className = ui("plugin-panel-workspace-leaf"); element.dataset.panel = id;
  const header = document.createElement('header'); header.textContent = title; element.append(header);
  const content = document.createElement('div'); element.append(content); render?.(content);
  const panel = { element, remove() { element.remove(); panels.delete(id); } }; panels.set(id, panel); movePanel(id, area); draggable(header, id); return panel;
}
function draggable(header, id) {
  header.draggable = true;
  let control = false;
  header.addEventListener('pointerdown', event => { control = !!event.target.closest('button, input, select, a'); });
  header.ondragstart = event => { if (control) { event.preventDefault(); return; } event.stopPropagation(); event.dataTransfer.setData('application/x-yhwh-panel', id); };
}
function disposeFocusView(tab) {
  const view = tab.pluginView;
  if (!view) return;
  tab.pluginView = undefined;
  try { view.cleanup?.(); } catch (error) { console.error(error); }
  view.element.remove();
}
function addFocusView(view) {
  if (focusViews.has(view.id)) throw new Error('Focus view already exists: ' + view.id);
  focusViews.set(view.id, view);
  return () => {
    focusViews.delete(view.id);
    for (const tab of tabs) if (tab.pluginView?.id === view.id) {
      disposeFocusView(tab);
      if (tab.focusView === view.id) tab.focusView = 'document';
    }
    update();
  };
}
function showFocusView(id, options = {}) {
  const tab = active(), view = focusViews.get(id);
  if (!view) throw new Error('Unknown focus view: ' + id);
  disposeFocusView(tab);
  const element = document.createElement('div');
  element.className = 'workspace-focus-view';
  element.tabIndex = -1;
  const close = () => { if (active() === tab && tab.focusView === id) focusView('document'); };
  tab.pluginView = { id, element };
  $('#center-panels').append(element);
  try { tab.pluginView.cleanup = view.mount(element, { ...options, tab: tab.id, close }); }
  catch (error) { disposeFocusView(tab); focusView('document'); throw error; }
  tab.expanded = '';
  focusView(id);
}
function pluginAPI() {
  return { words, notice, editWords, addCommand, addPanel, movePanel, addFocusView, showFocusView, openFile, navigate, address, currentLevel, getFocus: () => ({ id: active().id, cwd: active().cwd, file: active().file?.path }), getEditor: () => active()?.editor,
    createCitation: verseUI.createCitation, showVerse: verseUI.browse,
    on(name, callback) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); return () => listeners.get(name).delete(callback); },
    injectCSS(css) { const style = document.createElement('style'); style.textContent = css; document.head.append(style); return () => style.remove(); },
    files: { list: (tab, directory) => call('directory:list', tab, directory), read: filename => call('file:read', filename), save: (filename, content, modified) => call('file:save', filename, content, modified) },
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
  ['merch-setup', 'Merch store setup', '', merch.setup],
  ['higher-help', ui('higher-power'), '', higherHelp],
  ['be-root', ui('man'), '', () => enterWorld('root')],
  ['be-yhwh', ui('god'), '', () => enterWorld('yhwh')],
  ['fan-mail', ui('fan-mail'), '', fanMail],
  ['edit-fan-mail', ui('edit-feature-copy'), '', async () => { $('#dialog').close(); await openFile(join(boot.root, '../../etc/default/fan-mail.json'), await newTab()); }],
  ['send-mail', ui('send-mail'), '', sendMail],
  ['sinai', ui('sinai'), '', () => bookList('sinai')],
  ['horeb', ui('horeb'), '', () => bookList('horeb')],
  ...['sinai', 'horeb'].map(name => [`edit-${name}`, ui('edit-feature-copy'), '', async () => { const library = await call('world:books', name); $('#dialog').close(); await openFile(library.filename, await newTab()); }]),
  ['edit-help-copy', ui('edit-feature-copy'), '', () => { $('#dialog').close(); return newTab().then(tab => openFile(join(boot.root, '../../etc/default/words.json'), tab)); }],
  ['leave-world', ui('return-files'), '', async () => { Object.assign(active(), await call('world:leave', active().id)); active().history = [active().cwd]; active().historyIndex = 0; $('#dialog').close(); update(); }],
  ['files-select-all', 'Select all files', '', () => { active().selected = new Set(active().entries.map(entry => entry.path)); renderFiles(); }],
  ['files-copy', 'Copy files', '', () => { clipboardFiles = { paths: selectedPaths(), cut: false }; }],
  ['files-cut', 'Cut files', '', () => { clipboardFiles = { paths: selectedPaths(), cut: true }; }],
  ['files-paste', 'Paste files', '', pasteFiles],
  ['files-rename', 'Rename selected file', '', () => renameFile(selectedPaths()[0])],
  ['files-trash', 'Trash selected files', '', () => trashFiles()],
  ['new-tab', ui("new-tab"), ui("ctrl-t"), () => newTab()],
  ['close-tab', ui("close-tab"), ui("ctrl-w"), () => closeTab()],
  ['reopen-tab', 'Reopen closed tab', 'Ctrl+Shift+T', reopenTab],
  ['move-tab-left', 'Move tab left', 'Ctrl+Shift+PageUp', () => moveTab(-1)],
  ['move-tab-right', 'Move tab right', 'Ctrl+Shift+PageDown', () => moveTab(1)],
  ...Array.from({ length: 9 }, (_, index) => [`tab-${index + 1}`, index === 8 ? 'Last tab' : `Tab ${index + 1}`, `Ctrl+${index + 1}`, () => { const tab = tabs[index === 8 ? tabs.length - 1 : index]; if (tab) activate(tab.id); }]),
  ['hotkeys', 'Keyboard bindings', 'Ctrl+Alt+Shift+K', () => showHotkeys({ modal, active, call, refresh, commands, escape, notice, openFile, newTab, mobile: boot.interface === 'mobile' })],
  ['reload-keys', 'Reload configuration and keys', '', async () => { await call('config:reload'); await refresh(); notice('Configuration and keys reloaded.'); }],
  ['terminal-copy', 'Copy terminal selection', 'Ctrl+Shift+C', () => navigator.clipboard.writeText(active().terminal.getSelection())],
  ['terminal-paste', 'Paste into terminal', 'Ctrl+Shift+V', async () => bridge.terminal('write', { id: active().terminalId, data: await navigator.clipboard.readText() })],
  ['next-tab', ui("next-tab"), ui("ctrl-tab-ctrl-pagedown"), () => activate(tabs[(tabs.indexOf(active()) + 1) % tabs.length].id)],
  ['previous-tab', ui("previous-tab"), ui("ctrl-shift-tab-ctrl-pageup"), () => activate(tabs[(tabs.indexOf(active()) + tabs.length - 1) % tabs.length].id)],
  ['new-file', ui("new-file"), ui("ctrl-n"), () => newFile()],
  ['new-directory', ui("new-directory"), '', () => newFile(true)],
  ['open-file', ui("open-file-"), ui("ctrl-o"), async () => { const filename = await call('choose', 'file', active().cwd); if (filename) await openFile(filename); }],
  ['open-directory', ui("go-to-directory-"), ui("ctrl-shift-o"), async () => { const directory = await call('choose', 'directory', active().cwd); if (directory) await navigateFiles(directory); }],
  ['save', ui("save-file"), ui("ctrl-s"), () => save()],
  ['save-as', ui("save-as-"), ui("ctrl-shift-s"), async () => {
    const tab = active(); if (!tab.editor) return;
    const filename = await call('choose:save', tab.cwd, tab.file.name); if (!filename) return;
    const content = tab.editor.state.doc.toString();
    await call('file:save', filename, content, null, true); tab.dirty = false; await openFile(filename, tab);
  }],
  ['toggle-files', ui("toggle-file-manager"), "Ctrl+Shift+E", () => { const tab = active(); tab.showFiles = !tab.showFiles; tab.expanded = ''; update(); if (tab.showFiles) $('#file-list').focus(); else focusCurrent(tab); requestAnimationFrame(fitTerminal); }],
  ['expand-files', ui("expand-file-manager"), ui("ctrl-d"), () => { const tab = active(); tab.expanded = tab.expanded === 'files' ? '' : 'files'; tab.showFiles = true; update(); $('#file-list').focus(); requestAnimationFrame(fitTerminal); }],
  ['toggle-terminal', ui("toggle-terminal"), 'Ctrl+B / Ctrl+` / Ctrl+Shift+`', async () => { const tab = active(); tab.expanded = ''; if (!tab.showTerminal) await revealTerminal(tab); else { tab.showTerminal = false; update(); restoreAfterTerminal(tab); } }],
  ['close-terminal', 'Close terminal', '', () => closeTerminal()],
  ['expand-terminal', ui("expand-terminal"), ui("ctrl-shift-b"), async () => { const tab = active(), expanded = tab.expanded; movePanel('terminal', 'bottom'); await revealTerminal(tab); tab.expanded = expanded === 'terminal' ? '' : 'terminal'; update(); fitTerminal(); focusTerminal(tab); }],
  ['terminal-bottom', 'Dock terminal below document', '', async () => { movePanel('terminal', 'bottom'); active().expanded = ''; await revealTerminal(); }],
  ['toggle-navigation', ui("toggle-files-and-terminal-together"), ui("ctrl-shift-d"), async () => { const tab = active(); const show = !(tab.showFiles || tab.showTerminal); if (show && boot.capabilities?.terminal !== false && !tab.terminals.length) await newTerminal(tab); tab.showFiles = show; tab.showTerminal = show && boot.capabilities?.terminal !== false; tab.expanded = ''; update(); if (tab.showTerminal) focusTerminal(tab); else focusCurrent(tab); requestAnimationFrame(fitTerminal); }],
  ['focus-editor', ui("focus-editor"), 'Ctrl+Alt+1', () => { active().expanded = ''; focusView('document'); requestAnimationFrame(fitTerminal); }],
  ['focus-files', ui("focus-file-manager"), 'Ctrl+Alt+2', () => { active().showFiles = true; active().expanded = ''; update(); $('#file-list').focus(); }],
  ['focus-terminal', ui("focus-terminal"), 'Ctrl+Alt+3', () => { active().expanded = ''; return revealTerminal(); }],
  ['parent', ui("parent-directory"), ui("alt-up"), () => navigateFiles(parent(active().cwd))],
  ['home', ui("home-directory"), '', () => navigateFiles(boot.home)],
  ['back', ui("back"), ui("alt-left"), async () => { const tab = active(); if (tab.historyIndex > 0) { tab.historyIndex--; await navigateFiles(tab.history[tab.historyIndex], tab, false); } }],
  ['forward', ui("forward"), ui("alt-right"), async () => { const tab = active(); if (tab.historyIndex < tab.history.length - 1) { tab.historyIndex++; await navigateFiles(tab.history[tab.historyIndex], tab, false); } }],
  ['location', 'Clear focused terminal / edit location', ui("ctrl-l"), () => { if (keyContext() === 'terminal' && !$('#terminal-panel').hidden && !$('#terminals').hidden && active().terminalId) { active().terminal?.clear(); active().terminal?.focus(); bridge.terminal('write', { id: active().terminalId, data: '\x0c' }); return; } active().showFiles = true; update(); $('#location').focus(); $('#location').select(); }],
  ['refresh', ui("refresh-directory-and-configuration"), ui("f5"), () => refresh()],
  ['toggle-hidden', ui("toggle-hidden-files"), ui("ctrl-h-in-files-"), async () => { const tab = active(); await call('settings:save', { show_hidden: tab.config.values.show_hidden === 'true' ? 'false' : 'true' }, tab.cwd); await refresh(); }],
  ['view-mode', 'Toggle Reading / editing or format code', 'Ctrl/Alt+R', viewMode],
  ['markdown-source', 'Toggle Markdown Source / Live Preview', 'Ctrl/Alt+E', toggleMarkdownSource],
  ['choose-view-mode', 'Choose document view', '', chooseViewMode],
  ['follow-editor-link', 'Open link at cursor', 'Ctrl+Enter', () => {
    const state = active()?.editor?.state;
    if (state) {
      const link = linkAt(state, state.selection.main.head);
      if (link) return followLink(link);
      notice(address('Place the cursor on a Markdown link, Abe.', 1));
    }
  }],
  ['reading-view', ui("markdown-reading-view"), '', readingView],
  ['reload-file', ui("reload-file-from-disk"), '', async () => { if (active().file) await openFile(active().file.path, active(), { reload: true }); }],
  ['file-menu', ui("file-actions"), '', () => fileMenu()],
  ['open-external', ui("open-current-file-externally"), '', () => active().file && call('file:external', active().file.path)],
  ['palette', ui("command-palette"), ui("ctrl-p-ctrl-shift-p"), palette],
  ['language', ui("file-type-syntax-highlighting"), '', languageMenu],
  ['settings', ui("settings"), ui("ctrl-"), settings],
  ['edit-config', ui("edit-user-rc"), '', async () => { const filename = await call('config:open'); $('#dialog').close(); await openFile(filename); }],
  ['open-guide', ui("open-the-full-guide"), '', async () => { $('#dialog').close(); await openFile(join(boot.root, ui("readme-md"))); }],
  ['about', ui("about-yhwh"), '', about], ['help', ui("help-and-keyboard-shortcuts"), ui("f1"), help],
  ['about-us', 'About Us', '', aboutUs], ['our-team', 'About Us › Our Team', '', ourTeam], ['roadmap', 'About Us › Roadmap', '', roadmap],
  ['seed-funding', 'Seed funding · give YHWH money', '', seedFunding],
  ['offerings', ui("offerings"), '', offerings], ['burnt', ui("burnt-offering-setup-guide"), '', burnt], ['piece', ui("piece-offering"), '', piece],
  ['choose-offering', ui("choose-a-piece-offering"), '', async () => { const filename = await call('offering:piece', active().cwd); if (filename) notice(ui("email-prepared-attach-yourself-before-sending-no", filename)); }],
  ['pay', ui("open-configured-payment-page"), '', () => { const url = active().config.values.stripe_payment_link; if (!/^https:\/\/buy\.stripe\.com\//.test(url || '')) throw new Error(ui("set-a-valid-stripe-payment-link-in-your-rc-")); return call('external', url); }],
  ['upgrade', 'Upgrade YHWH · Pro and Elite preview', '', upgradeEdition],
  ['upgrades', ui("coming-soon-yhwh-sync-stuff-three-dating"), '', comingSoon],
  ['modes', ui("yhwh-nietzsche-dawkins"), '', modes],
  ['edit-footer', ui("edit-status-text"), '', () => editWords(footerKey(currentLevel()))],
  ['quit', ui("quit"), ui("ctrl-q"), async () => { for (const tab of tabs) if (!await mayReplace(tab)) return; await call('window:close'); }],
];
for (const [id, name, keys, fn] of definitions) addCommand({ id, name, keys, run: fn });

const presenceKey = 'yhwh:presence:v1';
function readPresence() {
  try { return JSON.parse(localStorage.getItem(presenceKey)) || {}; } catch { return {}; }
}
let presence = { letters: [], steps: [], enabled: false, ...readPresence() };
const letters = [
  ...Object.entries(actionLetters).map(([id, letter]) => ({ id, ...letter })),
  ...nightLetters,
  ...startupLetters,
  ...emailLetters,
];
function savePresence() { localStorage.setItem(presenceKey, JSON.stringify(presence)); updateInboxBadge(); }
function updateInboxBadge() {
  const count = presence.letters.filter(letter => !letter.read).length;
  $('#inbox-count').textContent = count ? ` · ${count}` : '';
}
function receive(id, midnightOnly = false) {
  if (!active() || document.visibilityState !== 'visible') return;
  const options = { now: Date.now(), inbox: active().config.values.inbox !== 'false', theme: document.body.dataset.theme };
  if (startNight(presence, options.now)) savePresence();
  let letter = nextMidnightLetter(presence, options);
  if (!letter && !midnightOnly) {
    const startup = nextStartupLetter(presence, options);
    const work = id && canReceiveLetter(presence, id, options) && actionLetters[id] && { id, ...actionLetters[id] };
    const shop = id && merch.configured() && canReceiveLetter(presence, 'merch', options) && { id: 'merch', ...actionLetters.merch };
    // Address changes take priority; the name, overnight and work letters keep their slots.
    letter = startup?.afterBlockMinutes !== undefined ? startup
      : nextNightLetter(presence, options) || startup || work || shop || (id && nextEmailLetter(presence, options));
  }
  if (!letter || !canReceiveLetter(presence, letter.id, options)) return;
  const sender = senderFor(presence, letter);
  if (!sender) return;
  presence.letters.push({ id: letter.id, sender, read: false, at: options.now }); presence.lastLetter = options.now; savePresence(); if (active().focusView === 'inbox' && !active().mailId) renderInbox();
}
// Ordinary letters need actual use; seedis also has a visible-app midnight timer.
document.addEventListener('click', () => receive());
document.addEventListener('keydown', () => receive());
// Wake at local midnight even if the user isn't typing. Hidden/suspended apps
// never backfill this letter later in the day. Recheck the clock on resume.
let midnightTimer;
function scheduleMidnightMail() {
  clearTimeout(midnightTimer);
  midnightTimer = setTimeout(() => { receive(undefined, true); scheduleMidnightMail(); }, Math.max(1, Math.min(60000, nextMidnight() - Date.now())));
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { receive(); scheduleMidnightMail(); }
  else for (const tab of tabs) flushAutosave(tab);
});
window.addEventListener('blur', () => { for (const tab of tabs) flushAutosave(tab); });
window.addEventListener('focus', () => { receive(); scheduleMidnightMail(); });
scheduleMidnightMail();
function inbox() { focusView('inbox'); }
function mailSettings() {
  const dialog = modal('Mail settings', `<form id="mail-settings-form"><details class="mail-sender-settings"><summary>Sender controls</summary><label class="setting-row"><span>Block ${primarySender}<small>Applies to this exact address. Earlier letters stay in your inbox.</small></span><input type="checkbox" role="switch" name="blocked_yhwh" ${presence.blockedYhwh ? 'checked' : ''}></label></details><div class="dialog-actions"><button type="button" data-mail-cancel>Cancel</button><button type="submit" class="primary">Save</button></div></form>`);
  dialog.querySelector('[data-mail-cancel]').onclick = () => dialog.close();
  dialog.querySelector('form').onsubmit = event => {
    event.preventDefault();
    const blocked = event.target.elements.blocked_yhwh.checked;
    if (blocked && !presence.blockedYhwh && !Number.isFinite(presence.blockedAt)) presence.blockedAt = Date.now();
    presence.blockedYhwh = blocked;
    savePresence(); dialog.close();
  };
}
$('[data-mail-settings]').onclick = mailSettings;
function mailMarkdown(text) {
  // Render numbered footnotes in editable Markdown letters.
  const footnotes = String(text).replace(/^\[\^(\d+)\]:\s*(.+)$/gm, (_, number, note) => `<p id="mail-footnote-${number}"><sup>${number}</sup> ${escape(note)}</p>`)
    .replace(/\[\^(\d+)\]/g, (_, number) => `<sup><a href="#mail-footnote-${number}" aria-label="Footnote ${number}">${number}</a></sup>`);
  return renderMarkdown(footnotes);
}
function renderInbox() {
  const host = $('#mail-content'), tab = active();
  const available = [...presence.letters].sort((a, b) => b.at - a.at).map(state => ({ state, letter: letters.find(item => item.id === state.id) })).filter(item => item.letter);
  const selected = available.find(item => item.letter.id === tab.mailId);
  $('#mail-unread').textContent = `· ${available.filter(item => !item.state.read).length} unread`;
  if (selected) {
    const { letter, state } = selected;
    const source = letter.source;
    const body = letter.format === 'markdown' ? `<div class="mail-markdown">${mailMarkdown(words[letter.textKey] || '')}</div>${editButton(letter.textKey)}` : word(letter.textKey);
    const shopLinks = letter.id === 'merch' ? merch.links() : '';
    const recipients = `<span>to ${escape(letter.to || address('Abe'))}</span>${letter.cc ? `<span>CC: ${letter.cc.map(escape).join(', ')}</span>` : ''}${letter.bcc ? `<span>BCC: ${letter.bcc.map(escape).join(', ')}</span>` : ''}`;
    const attachment = letter.attachment === 'biblical-polygyny.png' ? `<figure class="mail-attachment"><figcaption>Attachment: ${escape(letter.attachment)}</figcaption><img src="${escape(polygynyAttachmentURL)}" alt="${escape(words.letterSeedisAttachmentAlt)}"></figure>` : '';
    const note = source?.note || letter.note;
    const sources = note || letter.verse ? `<details class="mail-source" open><summary>${escape(verseCopy['mail-sources'])}</summary><p>${escape(note)}</p>${letter.verse ? `<div data-citation="${escape(letter.verse)}"></div>` : ''}</details>` : '';
    host.innerHTML = `<article class="mail-message"><button type="button" data-mail-back>← Inbox</button><h1>${escape(letter.title)}</h1><div class="mail-envelope"><strong>YHWH</strong><span class="mail-address">&lt;${escape(state.sender || primarySender)}&gt;</span>${recipients}<time datetime="${escape(new Date(state.at).toISOString())}">${escape(new Date(state.at).toLocaleString())}</time></div><div class="mail-body">${body}${source ? `<p><a href="${escape(source.url)}">${escape(source.label)}</a></p>` : ''}${shopLinks}</div>${attachment}${letter.command ? `<p><button data-command="${letter.command}">${escape(letter.action)}</button></p>` : ''}${sources}</article>`;
    host.querySelector('[data-mail-back]').onclick = () => {
      tab.mailId = null;
      renderInbox();
      host.querySelector(`[data-mail="${CSS.escape(letter.id)}"]`)?.focus();
    };
    verseUI.hydrate(host, { citeCommentary: true });
  } else {
    const rows = available.map(({ letter, state }) => {
      const text = words[letter.textKey] || '';
      const preview = (letter.format === 'markdown' ? text : address(text)).replace(/\s+/g, ' ').slice(0, 140);
      const sender = state.sender || primarySender;
      return `<button type="button" class="mail-row ${state.read ? '' : 'unread'}" data-mail="${escape(letter.id)}"><span class="mail-sender">${state.read ? '' : '● '}YHWH<small title="${escape(sender)}">${escape(sender)}</small></span><span class="mail-subject">${escape(letter.title)} <span class="mail-preview">— ${escape(preview)}</span></span><time datetime="${escape(new Date(state.at).toISOString())}">${escape(new Date(state.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }))}</time></button>`;
    }).join('');
    host.innerHTML = `<div class="mail-list" aria-label="Messages">${rows || `<p class="mail-empty muted">${escape(address('No letters. A quiet miracle, Abe.', 1))}</p>`}</div>`;
    for (const row of host.querySelectorAll('[data-mail]')) row.onclick = () => {
      tab.mailId = row.dataset.mail;
      presence.letters.find(item => item.id === tab.mailId).read = true;
      savePresence(); renderInbox();
      $('#inbox-view').scrollTop = 0;
      host.querySelector('[data-mail-back]').focus({ preventScroll: true });
    };
  }
}

const walk = [
  { id: 'open', title: 'Go. I’ll show you.', text: 'Open any file. This is your filesystem. No vault. No initiation fee. I have other plans for the fee.', verse: 'Genesis 12:1', command: 'open-file', action: 'Choose a file' },
  { id: 'save', title: 'Make something that stays.', text: 'Edit a file and save it. Grand promises are easy. Persistent state is the covenant.', verse: 'Genesis 15:18', command: 'focus-editor', action: 'Back to the file' },
  { id: 'shell', title: 'Come down and look.', text: 'Open the terminal. Your shell is already here, in this directory. You can look under everything.', verse: 'Genesis 18:21', command: 'focus-terminal', action: 'Open terminal' },
  { id: 'world', title: 'There was a book before the app.', text: 'Under God and Man are other directories. Other voices. We The Nameless. Sudocode. You can leave whenever you like. I’m still asking about the house.', verse: 'Genesis 28:16–17', command: 'higher-help', action: 'Open the door' },
];
function narrative() {
  presence.enabled = true; savePresence();
  const step = walk.find(item => !presence.steps.includes(item.id));
  const dialog = modal('Take a walk', step ? `<span class="eyebrow">${presence.steps.length + 1} / ${walk.length}</span><h3>${escape(step.title)}</h3><p>${escape(step.text)}</p><small>Literary adaptation</small><div data-citation="${escape(step.verse)}"></div><div class="dialog-actions"><button data-command="pause-walk">Pause the walk</button><button class="primary" data-command="${step.command}">${step.action}</button></div><p class="muted">Progress follows what you do. Return here whenever you want.</p>` : '<h3>You found a door, not the bottom.</h3><p>The walk is complete. The rest is yours to explore.</p><button data-command="palette">Keep digging →</button>');
  verseUI.hydrate(dialog);
  for (const button of $('#dialog').querySelectorAll('[data-command]')) button.addEventListener('click', () => $('#dialog').close());
}
function progressWalk(id) {
  if (!(presence.enabled || active()?.config.values.narrative === 'true')) return;
  if (walk.find(item => !presence.steps.includes(item.id))?.id === id) { presence.steps.push(id); savePresence(); }
}
let chatPanel, chatView;
async function showChat() {
  if (active().focusView === 'chat') { focusView('document'); return; }
  if (!chatPanel) {
    chatPanel = addPanel({ id: 'yhwh-chat', title: 'Conversation', area: 'center', render(element) {
      chatView = mountChat(element, { active, address, level: currentLevel, energy: currentEnergy, call, notice,
        mobile: boot.interface === 'mobile',
        workspaceRoot(directory) {
          if (boot.interface === 'mobile') return null;
          const mount = join(parent(parent(parent(boot.root))), 'mnt');
          return ['root', 'yhwh'].map(name => join(mount, name))
            .find(root => directory === root || directory.startsWith(root + '/')) || null;
        },
      });
    }});
    draggable(chatPanel.element.querySelector('.chat-header'), 'yhwh-chat');
    chatPanel.element.hidden = true;
  }
  const tab = active();
  await chatView.ready();
  if (active() === tab) { focusView('chat'); renderChat(); focusCurrent(); }
}
function renderChat() { chatView?.render(); }
addCommand({ id: 'focus-document', name: 'Focus document', run: () => focusView('document') });
addCommand({ id: 'margins', name: 'In the margins · Genesis', run: () => focusView(active().focusView === 'margins' ? 'document' : 'margins') });
addCommand({ id: 'chat', name: 'Talk to YHWH', run: showChat });
addCommand({ id: 'verses', name: 'Browse We The Nameless · chapter and verse', run: () => verseUI.browse() });
addCommand({ id: 'inbox', name: 'Inbox · letters from YHWH', run: inbox });
addCommand({ id: 'narrative', name: 'Take a walk · optional narrative', run: narrative });
addCommand({ id: 'pause-walk', name: 'Pause the walk', run: async () => { presence.enabled = false; savePresence(); await call('settings:save', { narrative: 'false' }); await refresh(); } });
listeners.set('open', new Set([() => { progressWalk('open'); receive('house'); }]));
listeners.set('save', new Set([() => { progressWalk('save'); receive('bread'); }]));
listeners.set('tab', new Set([() => { if (tabs.length > 1) receive('covenant'); }]));
listeners.set('navigate', new Set([() => { receive('seed'); renderChat(); if (active().worldRoot) progressWalk('world'); }]));
listeners.set('focus', new Set([() => { renderChat(); updateInboxBadge(); }]));

const pendingTerminal = new Map(), startingTerminals = new Set();
function terminalMessage(message) {
  const tab = tabs.find(item => item.terminals.some(session => session.id === message.id));
  if (!tab) { if (startingTerminals.has(message.id)) { if (!pendingTerminal.has(message.id)) pendingTerminal.set(message.id, []); pendingTerminal.get(message.id).push(message); } else if (message.type === 'error') notice(message.message); return; }
  const session = tab.terminals.find(item => item.id === message.id);
  if (message.type === 'data') session.terminal.write(message.data);
  if (message.type === 'cwd') session.cwd = message.cwd;
  if (message.type === 'exit') closeTerminal(message.id, true).catch(error => notice(error.message));
  if (message.type === 'error') { notice(message.message); session.terminal.write(`\r\n${message.message}\r\n`); }
}
bridge.on('terminal', terminalMessage);
bridge.on('navigation', state => {
  const tab = tabs.find(item => item.id === state.id); if (!tab) return;
  const changedDirectory = tab.cwd !== state.cwd;
  Object.assign(tab, state);
  if (changedDirectory) {
    tab.selected.clear(); tab.filesFilter = ''; tab.filesScroll = 0;
    if (tab === active()) { $('#file-filter').value = ''; $('#file-list').scrollTop = 0; }
  }
  if (tab.history[tab.historyIndex] !== tab.cwd) { tab.history.splice(tab.historyIndex + 1); tab.history.push(tab.cwd); tab.historyIndex = tab.history.length - 1; }
  if (tab.id === activeId) update(); emit('navigate', { id: tab.id, cwd: tab.cwd });
});
bridge.on('directory-changed', ({ id }) => { const tab = tabs.find(item => item.id === id); if (tab && !movingFiles) refresh(tab).catch(error => notice(error.message)); });
bridge.on('error', notice);
let appRefresh = Promise.resolve();
bridge.on('app-changed', ({ reloadPlugins }) => {
  appRefresh = appRefresh.then(async () => {
    Object.assign(words, await call('words:read'));
    if (reloadPlugins) pluginKey = '';
    for (const tab of tabs) if (!tab.file) tab.welcomeLevel = null;
    await Promise.all(tabs.map(tab => refresh(tab)));
  }).catch(error => notice(error.message));
});
bridge.on('command', run);
bridge.on('open', opening => openRequest(opening).catch(error => notice(error.message)));
async function openRequest(opening) {
  if (opening.warning) notice(opening.warning);
  let tab = tabs.find(item => item.id === opening.tab);
  if (tab) activate(tab.id);
  const info = await call('path:stat', opening.path);
  if (info.directory) { if (tab) await navigate(info.path, tab); else tab = await newTab(info.path); }
  else { tab ||= await newTab(parent(info.path)); await openFile(info.path, tab); }
  if (opening.theme) { temporaryEnergy = opening.theme === 'dawkins' ? 0 : opening.theme === 'nietzsche' ? 50 : 100; applyConfig(active().config); }
}

function followLink({ href, wiki, newTab, anchor }) {
  const tab = active();
  if (!href || !tab) return;
  const follow = async () => {
    if (/^(https?:|mailto:)/i.test(href)) { await call('external', href); return; }
    if (/^[a-z][\w+.-]*:/i.test(href) && !/^[a-z]:[/\\]/i.test(href)) return;
    const hash = href.indexOf('#');
    const decode = value => { try { return decodeURIComponent(value); } catch { return value; } };
    const name = decode(hash < 0 ? href : href.slice(0, hash));
    const heading = hash < 0 ? '' : decode(href.slice(hash + 1));
    const chatDirectory = anchor?.closest('.conversation-log') && tab.chatThread?.directory;
    let destination = tab;
    if (name) {
      let filename = join(chatDirectory || parent(tab.file?.path || join(tab.cwd, '_')), name);
      let info;
      try { info = await call('path:stat', filename); }
      catch (error) {
        if (!wiki || !/ENOENT|not found|does not exist/i.test(error.message) || /\.md$/i.test(filename)) throw error;
        filename += '.md'; info = await call('path:stat', filename);
      }
      if (newTab) destination = await newTab(info.directory ? info.path : parent(info.path));
      if (info.directory) { if (!newTab) await navigateFiles(info.path, tab); return; }
      const readNext = !!anchor?.closest('.reading-view');
      if (!await openFile(info.path, destination)) return;
      if (readNext && active() === destination && destination.file?.language === 'markdown') readingView();
    }
    if (heading && active() === destination && (name || !chatDirectory)) {
      const mail = anchor?.closest('.mail-message');
      if (!mail) readingView();
      const container = mail || destination.document;
      const slug = heading.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s+/g, '-');
      const target = [heading, slug].filter(Boolean).map(id => container.querySelector('#' + CSS.escape(id))).find(Boolean);
      target?.scrollIntoView({ block: 'start' });
    }
  };
  return follow().catch(error => notice(error.message));
}
document.addEventListener('click', event => {
  const edit = event.target.closest('[data-edit-word]'); if (edit) { editWords(edit.dataset.editWord); return; }
  const shop = event.target.closest('[data-merch-store]'); if (shop) { merch.open(shop.dataset.merchStore).catch(error => notice(error.message)); return; }
  const external = event.target.closest('[data-url]'); if (external) { call('external', external.dataset.url).catch(error => notice(error.message)); return; }
  const anchor = event.target.closest('a');
  if (anchor) {
    event.preventDefault();
    followLink({ href: anchor.getAttribute('href'), wiki: anchor.classList.contains('internal-link') || !!anchor.closest('.conversation-log'), newTab: event.ctrlKey || event.metaKey, anchor });
    return;
  }
  const button = event.target.closest('[data-command]'); if (button) { run(button.dataset.command); return; }
  const close = event.target.closest('[data-close-tab]'); if (close) { closeTab(close.dataset.closeTab).catch(error => notice(error.message)); return; }
  const tab = event.target.closest('#tabs [data-tab]'); if (tab) activate(tab.dataset.tab);
});
$('#tabs').addEventListener('auxclick', event => {
  const tab = event.target.closest('[data-tab]');
  if (event.button === 1 && tab) { event.preventDefault(); closeTab(tab.dataset.tab).catch(error => notice(error.message)); }
});
$('#tabs').addEventListener('dragstart', event => {
  const tab = event.target.closest('[data-tab]'); if (!tab) return;
  event.dataTransfer.setData('application/x-yhwh-tab', tab.dataset.tab);
});
$('#tabs').addEventListener('dragover', event => { if (event.dataTransfer.types.includes('application/x-yhwh-tab')) event.preventDefault(); });
$('#tabs').addEventListener('drop', event => {
  const target = event.target.closest('[data-tab]'), id = event.dataTransfer.getData('application/x-yhwh-tab');
  if (!target || !id) return; event.preventDefault();
  const from = tabs.findIndex(tab => tab.id === id), to = tabs.findIndex(tab => tab.id === target.dataset.tab);
  if (from >= 0 && to >= 0) { tabs.splice(to, 0, tabs.splice(from, 1)[0]); tabTitles(); }
});
let pdfClickTimer;
$('#file-list').onclick = event => {
  clearTimeout(pdfClickTimer);
  const row = event.target.closest('[data-path]'); if (!row) return;
  const tab = active();
  if (event.target.closest('[data-expand-folder]')) { toggleFolder(row).catch(error => notice(error.message)); return; }
  if (event.target.closest('[data-row-menu]')) { fileMenu(row.dataset.path); return; }
  if (boot.interface === 'mobile' && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    const openRow = row.dataset.directory === 'true' ? navigateFiles(row.dataset.path) : openFile(row.dataset.path);
    openRow.catch(error => notice(error.message)); return;
  }
  if (event.ctrlKey || event.metaKey) { if (tab.selected.has(row.dataset.path)) tab.selected.delete(row.dataset.path); else tab.selected.add(row.dataset.path); }
  else if (event.shiftKey && tab.selected.size) {
    const rows = [...$('#file-list').querySelectorAll('[data-path]')], first = rows.findIndex(item => tab.selected.has(item.dataset.path)), last = rows.indexOf(row);
    tab.selected = new Set(rows.slice(Math.min(first, last), Math.max(first, last) + 1).map(item => item.dataset.path));
  } else tab.selected = new Set([row.dataset.path]);
  if (event.pointerType !== 'touch' && row.dataset.directory !== 'true' && /\.pdf$/i.test(row.dataset.path)) {
    const filename = row.dataset.path;
    if (event.ctrlKey || event.metaKey) openFile(filename, tab, { external: true }).catch(error => notice(error.message));
    else if (event.detail === 1 && !event.shiftKey) pdfClickTimer = setTimeout(() => { if (active() === tab && tab.selected.has(filename)) openFile(filename, tab).catch(error => notice(error.message)); }, 300);
  }
  // Keep the clicked rows alive so the browser can recognize a double-click.
  for (const item of $('#file-list').querySelectorAll('[data-path]')) {
    const selected = tab.selected.has(item.dataset.path);
    item.classList.toggle('selected', selected);
    item.setAttribute('aria-selected', String(selected));
  }
  $('#file-count').textContent = `${tab.entries.length} items${tab.selected.size ? ` · ${tab.selected.size} selected` : ''}`;
  renderedFileRows = null;
  $('#file-list').focus({ preventScroll: true });
  if (event.detail === 1 && !event.ctrlKey && !event.metaKey && !event.shiftKey) toggleFolder(row).catch(error => notice(error.message));
};
$('#file-list').ondblclick = event => {
  if (boot.interface === 'mobile') return;
  clearTimeout(pdfClickTimer);
  const row = event.target.closest('[data-path]'); if (!row) return;
  (row.dataset.directory === 'true' ? navigateFiles(row.dataset.path) : openFile(row.dataset.path, active(), { external: /\.pdf$/i.test(row.dataset.path) })).catch(error => notice(error.message));
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
installFileDrag({
  list: $('#file-list'), currentDirectory: () => active().cwd, move: moveToDirectory, notice,
  pathsFor(row) {
    const tab = active();
    if (!tab.selected.has(row.dataset.path)) tab.selected = new Set([row.dataset.path]);
    for (const item of $('#file-list').querySelectorAll('[data-path]')) {
      item.classList.toggle('selected', tab.selected.has(item.dataset.path));
      item.setAttribute('aria-selected', String(tab.selected.has(item.dataset.path)));
    }
    renderedFileRows = null;
    return selectedPaths();
  },
});
$('#file-list').onkeydown = event => {
  const rows = [...$('#file-list').querySelectorAll('[data-path]')], tab = active();
  const current = rows.findIndex(row => tab.selected.has(row.dataset.path));
  const control = event.ctrlKey || event.metaKey;
  let action;
  if (event.key === ui("arrowdown") || event.key === ui("arrowup") || event.key === ui("home") || event.key === ui("end")) {
    const next = event.key === ui("home") ? 0 : event.key === ui("end") ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, current + (event.key === ui("arrowdown") ? 1 : -1)));
    tab.selected = new Set([rows[next]?.dataset.path]); renderFiles(); $('#file-list').querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
  } else if (event.key === 'ArrowRight' && rows[current]?.dataset.directory === 'true' && rows[current].dataset.parent !== 'true') action = () => toggleFolder(rows[current], true);
  else if (event.key === 'ArrowLeft' && rows[current]?.getAttribute('aria-expanded') === 'true') action = () => toggleFolder(rows[current], false);
  else if ([ui("arrowleft"), ui("backspace")].includes(event.key)) action = () => navigateFiles(parent(tab.cwd));
  else if (event.key === ui("enter") || event.key === ui("arrowright")) { const row = rows[current]; if (row) action = () => row.dataset.directory === 'true' ? navigateFiles(row.dataset.path) : openFile(row.dataset.path); }
  else if (!control && !event.altKey && event.key.length === 1) {
    typeAhead += event.key.toLowerCase(); clearTimeout(typeTimer); typeTimer = setTimeout(() => typeAhead = '', 700);
    const row = rows.find(row => row.querySelector('.file-name').textContent.toLowerCase().startsWith(typeAhead));
    if (row) { tab.selected = new Set([row.dataset.path]); renderFiles(); $('#file-list').querySelector('.selected')?.scrollIntoView({ block: 'nearest' }); }
  } else return;
  event.preventDefault(); if (action) Promise.resolve().then(action).catch(error => notice(error.message));
};
$('#location-form').onsubmit = event => { event.preventDefault(); let directory = $('#location').value; if (directory === '~' || directory.startsWith('~/')) directory = boot.home + directory.slice(1); if (active().worldRoot && directory.startsWith('/')) directory = active().worldRoot + directory; navigateFiles(directory).catch(error => notice(error.message)); };
$('#file-filter').oninput = renderFiles;
$('#file-title').onkeydown = event => { if (event.key === ui("enter")) { event.preventDefault(); event.target.blur(); } if (event.key === ui("escape")) { event.target.value = active().file.name; event.target.blur(); } };
$('#file-title').onblur = async event => { const tab = active(); if (!tab.file || tab.file.name === event.target.value) return; try { await renameTo(tab.file.path, event.target.value); } catch (error) { event.target.value = tab.file.name; notice(error.message); } };
$('#energy').oninput = event => {
  const level = unlockedLevels(edition.unlocked)[Number(event.target.value)];
  setEnergy(level.energy).catch(error => notice(error.message));
};

document.addEventListener('focusin', event => {
  const tab = active();
  if (!tab) return;
  const target = event.target;
  if ($('#terminals').contains(target) || $('#terminal-initial').contains(target)) tab.lastFocus = 'terminal';
  else if ($('#files').contains(target)) tab.lastNonTerminalFocus = tab.lastFocus = 'files';
  else if (target.closest('.document-content, #inbox-view, [data-panel="yhwh-chat"]')) {
    tab.lastNonTerminalFocus = tab.lastFocus = 'document';
  }
});
document.addEventListener('keydown', event => {
  document.body.classList.toggle('mod-follow', event.ctrlKey || event.metaKey);
  if (event.isComposing) return;
  const binding = bindingFor(event);
  if (binding?.kind === 'panel') {
    event.preventDefault(); event.stopImmediatePropagation();
    if (!event.repeat || binding.spec.incremental) moveSplit(binding.spec).catch(error => notice(error.message));
    return;
  }
  if (document.querySelector('dialog[open]') || event.target.closest('.initial-workbench input')) return;
  if (event.key === 'Enter' && event.target.closest('#yhwh-chat-form textarea')) return;
  if (event.key === 'Escape' && event.target.closest('[data-panel="yhwh-chat"]')) {
    event.preventDefault(); focusView('document'); return;
  }
  if (binding && binding.kind !== 'disabled') {
    event.preventDefault(); event.stopImmediatePropagation();
    if (!event.repeat) executeBinding(binding).catch(error => notice(error.message));
    return;
  }
  if (event.key === 'Escape' && event.target.closest('#inbox-view')) {
    event.preventDefault();
    focusView('document');
    return;
  }
  if (event.key === 'Escape' && active()?.expanded) { active().expanded = ''; update(); requestAnimationFrame(fitTerminal); }
}, true);

document.addEventListener('keyup', event => document.body.classList.toggle('mod-follow', event.ctrlKey || event.metaKey));
window.addEventListener('blur', () => document.body.classList.remove('mod-follow'));

function resizer(selector, panel, position) {
  $(selector).onpointerdown = event => {
    const tab = active(), handle = event.currentTarget;
    if (tab.expanded === panel) return;
    const { element, minimum, maximum, property, axis } = panelSize(panel);
    const start = position(event), initial = element.getBoundingClientRect()[axis];
    handle.setPointerCapture(event.pointerId);
    handle.onpointermove = current => {
      if (active() !== tab) return;
      const size = Math.max(minimum, Math.min(maximum, initial + position(current) - start));
      tab.panelSizes[property] = size;
      document.documentElement.style.setProperty(`--${property.replace('_', '-')}`, `${size}px`);
    };
    handle.onlostpointercapture = () => { handle.onpointermove = null; };
  };
}
resizer('.sidebar-resize', 'files', event => event.clientX);
resizer('.terminal-resize', 'terminal', event => -event.clientY);
new ResizeObserver(() => fitTerminal()).observe($('#terminal-panel'));
for (const [selector, id] of [['#files > header', 'files'], ['#terminal-panel > header', 'terminal'], ['#document > header', 'document']]) draggable($(selector), id);
for (const [selector, area] of [['#navigation-area', 'left'], ['#right-panels', 'right'], ['#center-panels', 'center'], ['#terminal-panel', 'bottom']]) {
  const element = $(selector);
  element.ondragover = event => { if (event.dataTransfer.types.includes('application/x-yhwh-panel')) event.preventDefault(); };
  element.ondrop = event => { const id = event.dataTransfer.getData('application/x-yhwh-panel'); if (id) { event.preventDefault(); event.stopPropagation(); try { movePanel(id, area); } catch (error) { notice(error.message); } } };
}

(async () => {
  boot = await call('bootstrap'); words = boot.words; $('#higher-help').textContent = words.helpButton;
  installNHS(pluginAPI());
  $('#merch-shortcut').innerHTML = merch.links();
  try { await openRequest(boot.initial); } catch (error) { notice(error.message); if (!tabs.length) await newTab(boot.home); }
  for (const opening of boot.pending) await openRequest(opening);
  for (const [id, messages] of pendingTerminal) { if (tabs.some(tab => tab.id === id)) for (const message of messages) terminalMessage(message); }
  pendingTerminal.clear();
  // A small public surface for plugins and interactive inspection. No Node in
  // the renderer; disk operations still cross the explicit preload boundary.
  window.YHWH = { ...pluginAPI(), commands, tabs, active, run, refresh, newTab, openFile };
  window.YHWH.initial = installInitial(window.YHWH, { home: boot.home, mobile: boot.interface === 'mobile', call });
  window.dispatchEvent(new Event('yhwh:ready'));
  if (boot.interface === 'three') {
    try { const { install } = await import(boot.effectsURL); window.YHWH.three = install(window.YHWH); }
    catch (error) { console.error(error); notice('Visual effects could not load. All tools are still available.'); }
  }
})().catch(error => { console.error(error); notice(error.message); });
