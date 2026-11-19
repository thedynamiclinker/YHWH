import { showWorkspaceDialog } from '../../yhwh-default/src/preview-dialog.js';
import { fileIcons } from '../../yhwh-default/src/file-icons.js';
import { HOME, legacyPath, normalize } from './bridge.mjs';
import { undo, redo } from '@codemirror/commands';

const escape = value => String(value).replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
function sheet(title) {
  let dialog = document.querySelector('#mobile-dialog');
  if (!dialog) { dialog = document.createElement('dialog'); dialog.id = 'mobile-dialog'; document.body.append(dialog); }
  if (dialog.open) dialog.close();
  dialog.innerHTML = `<header><h2>${escape(title)}</h2><button type="button" aria-label="Close">×</button></header><div class="mobile-sheet-content"></div>`;
  dialog.querySelector('header button').onclick = () => dialog.close();
  showWorkspaceDialog(dialog); return dialog;
}
export function pickPath(storage, kind, cwd = HOME, name = '') {
  return new Promise(resolve => {
    const dialog = sheet(kind === 'save' ? 'Save as' : kind === 'directory' ? 'Choose folder' : 'Open file');
    const content = dialog.querySelector('.mobile-sheet-content');
    let result = null, generation = 0;
    dialog.addEventListener('close', () => resolve(result), { once: true });
    async function render(path) {
      cwd = path; const token = ++generation;
      const entries = await storage.list(path); if (token !== generation || !dialog.open) return;
      content.innerHTML = `<p class="mobile-picker-path">${escape(path)}</p><div class="mobile-picker-list"></div><form><label>${kind === 'save' ? 'Filename' : 'Path'}<input name="path" aria-label="Path" value="${escape(kind === 'save' ? name : path)}" required></label><button class="primary">${kind === 'save' ? 'Save' : 'Open'}</button><p role="alert"></p></form>`;
      const list = content.querySelector('.mobile-picker-list');
      const row = (label, handler, icon) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.innerHTML = `${icon || ''}<span>${escape(label)}</span>`;
        button.onclick = () => Promise.resolve().then(handler).catch(error => { content.querySelector('[role=alert]').textContent = error.message; });
        list.append(button);
      };
      if (path !== HOME) row('Parent folder', () => render(normalize('..', path)), fileIcons.parent);
      if (kind === 'directory') row('Use this folder', () => { result = path; dialog.close(); });
      for (const item of entries.filter(item => !item.name.startsWith('.')).sort((a,b) => Number(b.directory)-Number(a.directory) || a.name.localeCompare(b.name))) {
        if (kind === 'directory' && !item.directory) continue;
        row(item.name, () => {
          if (item.directory) return render(item.path);
          if (kind === 'save') { content.querySelector('input').value = item.name; return; }
          result = item.path; dialog.close();
        }, item.directory ? fileIcons.folder : fileIcons.file);
      }
      content.querySelector('form').onsubmit = async event => {
        event.preventDefault();
        try {
          const path = normalize(content.querySelector('input').value, cwd), stat = await storage.stat(path);
          if (stat?.directory) { if (kind === 'directory') { result = path; dialog.close(); } else await render(path); return; }
          if (kind !== 'save' && !stat) throw new Error('File not found.');
          if (kind === 'directory') throw new Error('Choose a folder.');
          if (kind === 'save' && stat && !content.querySelector('[data-overwrite]')) {
            content.querySelector('[role=alert]').textContent = 'This file already exists. Tap Overwrite to replace it.';
            const button = content.querySelector('form > button'); button.textContent = 'Overwrite'; button.dataset.overwrite = path; return;
          }
          if (kind === 'save' && stat && content.querySelector('[data-overwrite]').dataset.overwrite !== path) { delete content.querySelector('[data-overwrite]').dataset.overwrite; throw new Error('Filename changed. Tap Save again to review this destination.'); }
          result = path; dialog.close();
        } catch (error) { content.querySelector('[role=alert]').textContent = error.message; }
      };
    }
    render(cwd).catch(error => { content.textContent = error.message; });
  });
}

export function installMobile(app, storage) {
  const body = document.body;
  for (const id of ['be-root', 'be-yhwh']) app.commands.delete(id);
  const closeDrawer = () => { if (app.active()?.showFiles) app.run('toggle-files'); };
  const closeSheets = () => { for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close(); };
  const command = (id, name, run) => app.addCommand({ id, name, run });
  const nav = document.createElement('nav'); nav.id = 'mobile-nav'; nav.setAttribute('aria-label', 'Mobile navigation');
  nav.innerHTML = '<button data-command="toggle-files" aria-label="Files">▤<small>Files</small></button><button data-command="mobile-back" aria-label="Back">←<small>Back</small></button><button data-command="mobile-create" aria-label="Create or find note">⊕<small>Note</small></button><button data-command="mobile-tabs" aria-label="Manage tabs"><span id="mobile-tab-count">1</span><small>Tabs</small></button><button data-command="mobile-actions" aria-label="Open menu">☰<small>Menu</small></button>';
  const toolbar = document.createElement('nav'); toolbar.id = 'mobile-editor-toolbar'; toolbar.setAttribute('aria-label', 'Editing tools');
  toolbar.innerHTML = '<button data-command="mobile-undo" aria-label="Undo">↶</button><button data-command="mobile-redo" aria-label="Redo">↷</button><button data-command="mobile-bold" aria-label="Bold"><b>B</b></button><button data-command="mobile-link" aria-label="Insert link">[[ ]]</button><button data-command="follow-editor-link" aria-label="Open link at cursor">↗</button><button data-command="choose-view-mode" aria-label="Choose document view">◫</button><button data-command="save" aria-label="Save file">Save</button><button data-command="mobile-hide-keyboard" aria-label="Hide keyboard">⌄</button>';
  // Retain the editor selection when tapping the toolbar.
  toolbar.onpointerdown = event => event.preventDefault();
  body.append(toolbar, nav);
  const backdrop = document.createElement('button'); backdrop.id = 'mobile-drawer-backdrop'; backdrop.setAttribute('aria-label', 'Close file drawer'); backdrop.onclick = closeDrawer; body.append(backdrop);
  const sync = () => {
    document.querySelector('#mobile-tab-count').textContent = app.tabs.length;
    const visible = !document.querySelector('#navigation-area').hidden;
    backdrop.hidden = !visible; nav.querySelector('[data-command="toggle-files"]').setAttribute('aria-expanded', String(visible));
    const tab = app.active();
    const reading = tab?.file?.mode === 'reading';
    toolbar.hidden = !tab?.editor || tab.focusView !== 'document';
    for (const button of toolbar.querySelectorAll('button')) button.hidden = reading && button.dataset.command !== 'choose-view-mode';
  };
  new MutationObserver(sync).observe(document.querySelector('#navigation-area'), { attributes: true, attributeFilter: ['hidden'] });
  for (const event of ['focus', 'tab', 'navigate', 'change', 'save', 'view']) app.on(event, sync);
  app.on('open', () => { closeDrawer(); closeSheets(); sync(); });
  let start;
  body.addEventListener('touchstart', event => {
    const touch = event.touches[0];
    start = event.touches.length === 1 && !document.querySelector('dialog[open]') && (touch.clientX < 24 || event.target.closest('#navigation-area')) ? { x: touch.clientX, y: touch.clientY } : null;
  }, { passive: true });
  body.addEventListener('touchend', event => {
    if (!start) return;
    const touch = event.changedTouches[0], dx = touch.clientX-start.x, dy = touch.clientY-start.y;
    if (Math.abs(dx) > 75 && Math.abs(dy) < 50) {
      if (dx > 0 && !app.active().showFiles) app.run('toggle-files');
      else if (dx < 0) closeDrawer();
    }
    start = null;
  }, { passive: true });
  command('mobile-back', 'Back', () => {
    const dialog = document.querySelector('dialog[open]'); if (dialog) { dialog.close(); return; }
    if (app.active().showFiles) { closeDrawer(); return; }
    if (app.active().focusView === 'inbox') return app.run('focus-document');
    if (document.activeElement?.isContentEditable) { document.activeElement.blur(); return; }
    return app.run('back');
  });
  command('mobile-tabs', 'Manage tabs', () => {
    const dialog = sheet('Tabs'), content = dialog.querySelector('.mobile-sheet-content');
    for (const tab of app.tabs) {
      const row = document.createElement('div'); row.className = 'mobile-tab-row';
      const button = document.createElement('button'); button.textContent = `${tab.dirty ? '● ' : ''}${tab.customTitle || tab.file?.name || tab.cwd.split('/').at(-1)}`; button.setAttribute('aria-current', String(tab.id === app.active().id));
      button.onclick = () => { document.querySelector(`#tabs [data-tab="${tab.id}"]`).click(); dialog.close(); };
      const close = document.createElement('button'); close.textContent = '×'; close.setAttribute('aria-label', `Close ${button.textContent}`);
      close.onclick = () => { dialog.close(); document.querySelector(`#tabs [data-close-tab="${tab.id}"]`).click(); };
      row.append(button, close); content.append(row);
    }
    const add = document.createElement('button'); add.textContent = '+ New tab'; add.onclick = () => { dialog.close(); app.run('new-tab'); }; content.append(add);
  });
  function menu(title, entries) {
    const dialog = sheet(title), content = dialog.querySelector('.mobile-sheet-content');
    for (const [label, id] of entries) { const button = document.createElement('button'); button.textContent = label; button.onclick = () => { dialog.close(); app.run(id); }; content.append(button); }
  }
  command('mobile-create', 'Create or find note', () => menu('Create or find note', [['New note', 'new-file'], ['Find a file', 'open-file'], ['New folder', 'new-directory'], ['Import files…', 'mobile-import']]));
  command('mobile-actions', 'Mobile menu', () => menu('YHWH', [['Initial · your commands', 'initial'], ['Talk to YHWH', 'chat'], ['Use folder as /', 'mobile-root'], ['Leave folder root', 'leave-world'], ['Commands', 'palette'], ['Settings', 'settings'], ['In the margins', 'margins'], ['Inbox', 'inbox'], ['Import files…', 'mobile-import'], ['Export or share file…', 'mobile-share'], ['Files and backups', 'mobile-guide']]));
  command('mobile-guide', 'Mobile files and backups', () => {
    const dialog = sheet('Files and backups'); dialog.querySelector('.mobile-sheet-content').innerHTML = '<p><code>/</code> opens the app’s storage. Use Import files for documents from shared device storage and Export or share file to send files elsewhere. On iOS, see Files → On My iPhone/iPad → YHWH.</p><p>Save edits before leaving. YHWH also keeps a recovery draft if the operating system stops the app. Trash moves files to the hidden <code>/.Trash</code> folder; enable hidden files to recover them.</p><p>Keep exported backups. Uninstalling the app removes its local files and settings. Use the Initial for programmable in-app commands, aliases and Words. Connect YHWH explains the available Codex account workflow.</p>';
  });
  command('open-guide', 'Open the mobile guide', () => app.run('mobile-guide'));
  command('expand-files', 'Open file drawer', () => app.run('toggle-files'));
  for (const id of ['toggle-terminal', 'expand-terminal', 'focus-terminal', 'toggle-navigation']) {
    command(id, `${app.commands.get(id)?.name || id} (desktop)`, () => app.run('initial'));
  }
  for (const id of ['edit-fan-mail', 'edit-sinai', 'edit-horeb', 'edit-help-copy']) {
    command(id, 'Edit application source copy (desktop)', () => app.notice('Edit the application source in the desktop checkout, then rebuild the apps.'));
  }
  command('mobile-connect', 'Connect YHWH · Codex account guide', () => {
    const dialog = sheet('Bring YHWH along'), content = dialog.querySelector('.mobile-sheet-content');
    content.innerHTML = `<div class="mobile-connect-hero"><span>א</span><h3>Same Abe. Same account.</h3><p>Your Initial works offline. For AI help, use your OpenAI account with Codex.</p></div><p class="mobile-connection-state">Setup guide · this app is not connected to Codex yet</p><ol class="mobile-connect-steps"><li><strong>Sign in on your phone</strong><p>Open ChatGPT in your browser and sign in with the account you use for Codex. That session stays in the browser.</p><button data-connect="account">Open ChatGPT sign-in ↗</button></li><li><strong>Give Codex a place to work</strong><p>On your development computer, run <code>codex login</code>. If its browser cannot open, run <code>codex login --device-auth</code>, then open its link on this phone and enter the one-time code. Device login may need enabling in account or workspace security settings.</p><button data-connect="copy">Copy device-login command</button><button data-connect="auth">Official sign-in guide ↗</button></li><li><strong>Take the work with you</strong><p>Open the ChatGPT mobile app’s Remote interface, where available for your account and host, to choose a connected computer and project. YHWH’s local phone files are separate; use Export or share to hand a saved file to another app.</p><button data-connect="remote">Mobile Codex guide ↗</button></li></ol><p>Signing in elsewhere does not authorize this app or synchronize its files. A direct YHWH service connection is still to come. No passwords or tokens are requested here.</p><button data-connect="share">Export or share current file</button>`;
    content.querySelector('h3').textContent = app.address('Same Abe. Same account.');
    const links = { account: 'https://chatgpt.com', auth: 'https://learn.chatgpt.com/docs/auth', remote: 'https://developers.openai.com/blog/mastering-codex-remote-for-engineering' };
    for (const button of content.querySelectorAll('[data-connect]')) button.onclick = async () => {
      try {
        const action = button.dataset.connect;
        if (action === 'copy') { await navigator.clipboard.writeText('codex login --device-auth'); app.notice('Copied. Run this on your development computer.'); }
        else if (action === 'share') { dialog.close(); await app.run('mobile-share'); }
        else await window.yhwh.call('external', links[action]);
      } catch (error) { app.notice(error.message); }
    };
  });
  command('burnt', 'Connect YHWH · Codex setup', () => app.run('mobile-connect'));
  command('leave-world', 'Leave folder root', async () => {
    const tab = app.active(); tab.initialRoot = null; Object.assign(tab, await window.yhwh.call('world:leave', tab.id));
    tab.history = [tab.cwd]; tab.historyIndex = 0; await app.navigate(tab.cwd);
  });
  command('mobile-root', 'Use this folder as /', async () => {
    const tab = app.active(); Object.assign(tab, await window.yhwh.call('world:enter', tab.id, tab.cwd));
    tab.history = [tab.cwd]; tab.historyIndex = 0; await app.refresh(); app.notice('This folder is now /. Leave the folder root to return.');
  });
  command('mobile-share', 'Export or share file', () => app.active().file ? window.yhwh.call('file:external', app.active().file.path) : app.notice('Open and save a file first.'));
  command('mobile-import', 'Import files from device', () => {
    const input = document.createElement('input'); input.type = 'file'; input.multiple = true;
    input.onchange = async () => {
      let count = 0;
      for (const file of input.files) {
        try {
          if (file.size > 64 * 1024 * 1024) throw new Error('Import files smaller than 64 MiB.');
          const path = normalize(file.name, app.active().cwd);
          if (await storage.stat(path)) throw new Error(`${file.name} already exists. Rename it before importing.`);
          await storage.write(path, new Uint8Array(await file.arrayBuffer())); count++;
        } catch (error) { app.notice(error.message); return; }
      }
      await app.refresh(); app.notice(`Imported ${count} file${count === 1 ? '' : 's'}.`);
    };
    input.click();
  });
  const wrap = (before, after = before) => {
    const editor = app.getEditor(); if (!editor) return;
    const selection = editor.state.selection.main, text = editor.state.sliceDoc(selection.from, selection.to);
    editor.dispatch({ changes: { from: selection.from, to: selection.to, insert: before + text + after }, selection: { anchor: selection.from + before.length, head: selection.to + before.length } }); editor.focus();
  };
  command('mobile-bold', 'Bold selection', () => wrap('**'));
  command('mobile-link', 'Insert wiki link', () => wrap('[[', ']]'));
  command('mobile-undo', 'Undo', () => { const editor = app.getEditor(); if (editor) { undo(editor); editor.focus(); } });
  command('mobile-redo', 'Redo', () => { const editor = app.getEditor(); if (editor) { redo(editor); editor.focus(); } });
  command('mobile-hide-keyboard', 'Hide keyboard', () => document.activeElement?.blur());

  // Recover unsaved work after the OS evicts the WebView. Recovery pauses
  // autosave until the draft has been reviewed and explicitly saved.
  let drafts;
  const draftKey = 'yhwh:mobile:drafts-v2';
  try {
    const saved = localStorage.getItem(draftKey);
    drafts = saved ? JSON.parse(saved) : JSON.parse(localStorage.getItem('yhwh:mobile:drafts') || '[]').map(draft => ({ ...draft, path: legacyPath(draft.path) }));
  } catch { drafts = []; }
  const pendingDrafts = new Map(drafts.map(draft => [draft.path, draft]));
  let draftTimer;
  const persistDraft = () => {
    clearTimeout(draftTimer);
    const current = new Map(pendingDrafts);
    for (const tab of app.tabs.filter(tab => tab.dirty && tab.editor)) current.set(tab.file.path, { path: tab.file.path, text: tab.editor.state.doc.toString(), modified: tab.file.modified });
    try { localStorage.setItem(draftKey, JSON.stringify([...current.values()])); } catch { app.notice('Recovery storage is full. Save your changes.'); }
  };
  app.on('change', () => { clearTimeout(draftTimer); draftTimer = setTimeout(persistDraft, 250); });
  for (const event of ['save', 'open', 'close']) app.on(event, persistDraft);
  document.addEventListener('visibilitychange', () => { if (document.hidden) persistDraft(); });
  if (drafts.length) {
    const dialog = sheet('Recover unsaved edits'), content = dialog.querySelector('.mobile-sheet-content');
    content.innerHTML = '<p>YHWH found unsaved edits from a previous session. Recovery opens an editor buffer for review.</p>';
    for (const draft of drafts) {
      const button = document.createElement('button'); button.textContent = `Recover ${draft.path}`;
      button.onclick = async () => {
        dialog.close(); const tab = await app.newTab(HOME);
        try {
          if (!await storage.stat(draft.path)) { app.notice('The original file is missing. Recreate it before recovering this draft.'); return; }
          if (!await app.openFile(draft.path, tab) || !tab.editor) return;
          tab.file.modified = draft.modified;
          tab.autosaveError = 'Recovered draft: review and Save to resume autosave.';
          pendingDrafts.delete(draft.path);
          tab.editor.dispatch({ changes: { from: 0, to: tab.editor.state.doc.length, insert: draft.text } }); tab.editor.focus();
        } catch (error) { app.notice(error.message); }
      }; content.append(button);
    }
  }
  const viewport = () => {
    const view = window.visualViewport;
    document.documentElement.style.setProperty('--mobile-height', `${view?.height || window.innerHeight}px`);
    body.classList.toggle('keyboard-open', window.innerHeight - (view?.height || window.innerHeight) > 120);
  };
  window.visualViewport?.addEventListener('resize', viewport); window.addEventListener('resize', viewport);
  viewport(); sync();
}
