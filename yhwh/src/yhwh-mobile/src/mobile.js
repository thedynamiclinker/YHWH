import { HOME, normalize } from './bridge.mjs';
import { undo, redo } from '@codemirror/commands';

const escape = value => String(value).replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
function sheet(title) {
  let dialog = document.querySelector('#mobile-dialog');
  if (!dialog) { dialog = document.createElement('dialog'); dialog.id = 'mobile-dialog'; document.body.append(dialog); }
  if (dialog.open) dialog.close();
  dialog.innerHTML = `<header><h2>${escape(title)}</h2><button type="button" aria-label="Close">×</button></header><div class="mobile-sheet-content"></div>`;
  dialog.querySelector('header button').onclick = () => dialog.close();
  dialog.showModal(); return dialog;
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
      const row = (label, handler) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.onclick = () => Promise.resolve().then(handler).catch(error => { content.querySelector('[role=alert]').textContent = error.message; }); list.append(button); };
      if (path !== HOME) row('↑ Parent folder', () => render(path.slice(0, path.lastIndexOf('/'))));
      if (kind === 'directory') row('Use this folder', () => { result = path; dialog.close(); });
      for (const item of entries.filter(item => !item.name.startsWith('.')).sort((a,b) => Number(b.directory)-Number(a.directory) || a.name.localeCompare(b.name))) {
        if (kind === 'directory' && !item.directory) continue;
        row(`${item.directory ? '▸ ' : ''}${item.name}`, () => {
          if (item.directory) return render(item.path);
          if (kind === 'save') { content.querySelector('input').value = item.name; return; }
          result = item.path; dialog.close();
        });
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
  const closeDrawer = () => { if (app.active().showFiles) app.run('toggle-files'); };
  const closeSheets = () => { for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close(); };
  const command = (id, name, run) => app.addCommand({ id, name, run });
  const nav = document.createElement('nav'); nav.id = 'mobile-nav'; nav.setAttribute('aria-label', 'Mobile navigation');
  nav.innerHTML = '<button data-command="toggle-files" aria-label="Files">▤<small>Files</small></button><button data-command="mobile-back" aria-label="Back">←<small>Back</small></button><button data-command="mobile-create" aria-label="Create or find note">⊕<small>Note</small></button><button data-command="mobile-tabs" aria-label="Manage tabs"><span id="mobile-tab-count">1</span><small>Tabs</small></button><button data-command="mobile-actions" aria-label="Open menu">☰<small>Menu</small></button>';
  const toolbar = document.createElement('nav'); toolbar.id = 'mobile-editor-toolbar'; toolbar.setAttribute('aria-label', 'Editing tools');
  toolbar.innerHTML = '<button data-command="mobile-undo" aria-label="Undo">↶</button><button data-command="mobile-redo" aria-label="Redo">↷</button><button data-command="mobile-bold" aria-label="Bold"><b>B</b></button><button data-command="mobile-link" aria-label="Insert link">[[ ]]</button><button data-command="view-mode" aria-label="Change view">◫</button><button data-command="save" aria-label="Save file">Save</button><button data-command="mobile-hide-keyboard" aria-label="Hide keyboard">⌄</button>';
  // Retain the editor selection when tapping the toolbar.
  toolbar.onpointerdown = event => event.preventDefault();
  body.append(toolbar, nav);
  const backdrop = document.createElement('button'); backdrop.id = 'mobile-drawer-backdrop'; backdrop.setAttribute('aria-label', 'Close file drawer'); backdrop.onclick = closeDrawer; body.append(backdrop);
  const sync = () => {
    document.querySelector('#mobile-tab-count').textContent = app.tabs.length;
    const visible = !document.querySelector('#navigation-area').hidden;
    backdrop.hidden = !visible; nav.querySelector('[data-command="toggle-files"]').setAttribute('aria-expanded', String(visible));
    toolbar.hidden = !app.active()?.editor;
  };
  new MutationObserver(sync).observe(document.querySelector('#navigation-area'), { attributes: true, attributeFilter: ['hidden'] });
  for (const event of ['focus', 'tab', 'navigate', 'change', 'save']) app.on(event, sync);
  app.on('open', () => { closeDrawer(); closeSheets(); sync(); });
  // File rows are touch targets. Desktop click/double-click behavior stays in
  // the shared renderer; a touch tap opens the row once, without double-tap.
  document.querySelector('#file-list').addEventListener('pointerup', event => {
    if (event.pointerType !== 'touch') return;
    const row = event.target.closest('[data-path]'); if (!row) return;
    event.preventDefault();
    (row.dataset.directory === 'true' ? app.navigate(row.dataset.path) : app.openFile(row.dataset.path)).catch(error => app.notice(error.message));
  });
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
    if (document.activeElement?.isContentEditable) { document.activeElement.blur(); return; }
    return app.run('back');
  });
  command('mobile-tabs', 'Manage tabs', () => {
    const dialog = sheet('Tabs'), content = dialog.querySelector('.mobile-sheet-content');
    for (const tab of app.tabs) {
      const row = document.createElement('div'); row.className = 'mobile-tab-row';
      const button = document.createElement('button'); button.textContent = `${tab.dirty ? '● ' : ''}${tab.file?.name || tab.cwd.split('/').at(-1)}`; button.setAttribute('aria-current', String(tab.id === app.active().id));
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
  command('mobile-actions', 'Mobile menu', () => menu('YHWH', [['Commands', 'palette'], ['Settings', 'settings'], ['In the margins', 'margins'], ['Inbox', 'inbox'], ['Import files…', 'mobile-import'], ['Export or share file…', 'mobile-share'], ['Files and backups', 'mobile-guide']]));
  command('mobile-guide', 'Mobile files and backups', () => {
    const dialog = sheet('Files and backups'); dialog.querySelector('.mobile-sheet-content').innerHTML = '<p>Your notes are ordinary files in this app’s YHWH folder. Use Import files to copy files from your device, and Export or share file to send them elsewhere. On iOS the folder is also available in Files → On My iPhone/iPad → YHWH.</p><p>Save edits before leaving. YHWH also keeps a recovery draft if the operating system stops the app. Trash moves files to the workspace’s hidden .Trash folder; enable hidden files to recover them.</p><p>Keep exported backups. Uninstalling the app removes its local files and settings. Folder sync, arbitrary external vault access, Unix shells, Bash rc files and the desktop Codex chat service are not implemented on mobile.</p>';
  });
  command('open-guide', 'Open the mobile guide', () => app.run('mobile-guide'));
  command('expand-files', 'Open file drawer', () => app.run('toggle-files'));
  for (const id of ['toggle-terminal', 'expand-terminal', 'focus-terminal', 'toggle-navigation']) {
    command(id, `${app.commands.get(id)?.name || id} (desktop)`, () => app.notice('Local Unix shells are available on desktop.'));
  }
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

  // Recover unsaved work after the OS evicts the WebView. Saving remains
  // explicit and recovery never overwrites the document on disk.
  let draftTimer;
  const persistDraft = () => {
    clearTimeout(draftTimer);
    const drafts = app.tabs.filter(tab => tab.dirty && tab.editor).map(tab => ({ path: tab.file.path, text: tab.editor.state.doc.toString(), modified: tab.file.modified }));
    try { localStorage.setItem('yhwh:mobile:drafts', JSON.stringify(drafts)); } catch { app.notice('Recovery storage is full. Save your changes.'); }
  };
  app.on('change', () => { clearTimeout(draftTimer); draftTimer = setTimeout(persistDraft, 250); });
  app.on('save', persistDraft);
  document.addEventListener('visibilitychange', () => { if (document.hidden) persistDraft(); });
  let drafts;
  try { drafts = JSON.parse(localStorage.getItem('yhwh:mobile:drafts') || '[]'); } catch { drafts = []; }
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
