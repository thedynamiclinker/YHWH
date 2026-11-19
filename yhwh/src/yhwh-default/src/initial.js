import { createInitial, alphabets, transliteration, quote, asText, normalizeGesture, matchGesture, defaultRC, firstLogo } from '../../../lib/initial.mjs';
import './initial.css';
import { createWorkbench } from './initial-workbench.js';
import { readGrid, serializeGrid } from '../../../lib/initial-grid.mjs';
import { inInitialPreview } from './preview-dialog.js';
import { renderMarkdown } from './editor.js';
import { fileIcons } from './file-icons.js';
import logosTutorial from '../../../../yamr/sacred-text/LOGOS.md';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
const draftKey = 'yhwh:initial:draft';
const locations = { Initials: '~/.initialrc', Words: '~/bin', Atomics: '/bin', Builtins: '/usr/bin' };
const gridDraftKey = 'yhwh:initial:grid';

export function installInitial(app, { home, mobile, call }) {
  let dialog, liveTimer, docked = false;
  const scratch = { source: '' };
  try { scratch.source = localStorage.getItem(draftKey) || ''; } catch {}

  const button = (label, action, primary = false) => `<button type="button" data-initial="${action}"${primary ? ' class="primary"' : ''}>${label}</button>`;
  const buttons = items => items.map(([label, action]) => button(label, action)).join('');
  const guarded = fn => async (...args) => {
    try { return await fn(...args); }
    catch (error) { showError(error); }
  };
  function showError(error) {
    const target = dialog?.open && dialog.querySelector('[data-error]');
    if (target) target.textContent = error.message;
    else app.notice(error.message);
  }
  function modal(title, html, { back, drawing = false } = {}) {
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'initial-dialog';
      dialog.setAttribute('aria-labelledby', 'initial-title');
      document.body.append(dialog);
    }
    dialog.classList.remove('initial-shell-dialog');
    dialog.classList.toggle('initial-drawing', drawing);
    dialog.innerHTML = `<header>
      ${back ? '<button type="button" data-initial="back" aria-label="Back">←</button>' : ''}
      <h2 id="initial-title" tabindex="-1" autofocus>${escape(title)}</h2>
      <button type="button" data-close aria-label="Close Initial">×</button>
    </header>${html}<p role="alert" data-error></p>`;
    dialog.querySelector('[data-close]').onclick = () => dialog.close();
    if (back) bind({ back });
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('h2').focus();
    dialog.scrollTop = 0;
  }
  function bind(actions) {
    for (const element of dialog.querySelectorAll('[data-initial]')) {
      const action = actions[element.dataset.initial];
      if (action) element.onclick = guarded(action);
    }
  }

  const root = () => app.active()?.initialRoot || app.active()?.worldRoot;
  const host = {
    home, cwd: () => app.active().cwd, root,
    read: path => call('file:read', path), save: (...args) => call('file:save', ...args),
    stat: path => call('path:stat', path), create: (...args) => call('file:create', ...args),
    list: path => call('directory:list', app.active().id, path),
    copy: (...args) => call('file:copy', ...args), move: (...args) => call('file:move', ...args), trash: path => call('file:trash', path),
    navigate: path => app.navigate(path), open: path => app.openFile(path), view: showView,
    builtins: () => [...app.commands.values()].filter(item => !['initial', 'initial-draw', 'initial-new', 'initial-rc', 'terminal-interface'].includes(item.id)),
    chroot: async path => {
      const tab = app.active();
      tab.initialRoot = mobile ? null : path;
      if (mobile) Object.assign(tab, await call(path ? 'world:enter' : 'world:leave', tab.id, path || undefined));
      await app.navigate(path || home);
      tab.history = [tab.cwd];
      tab.historyIndex = 0;
    },
  };
  const library = createInitial(host);
  library.reload().catch(error => app.notice('Initial: ' + error.message));

  function commandToken(item) {
    const first = library.catalog().find(entry => entry.name === item.name || entry.names?.includes(item.name));
    const name = !first || first.kind === item.kind || item.kind === 'Initials' ? item.name : locations[item.kind] + '/' + item.name;
    return /^[\p{L}\p{N}_.\/~\-]+$/u.test(name) ? name : quote(name);
  }
  async function execute(source, back = shelf) {
    if (!source.trim()) return;
    if (dialog?.open) dialog.close();
    let result;
    try {
      result = await library.run(source);
      await app.refresh();
    } catch (error) {
      await back();
      throw error;
    }
    if (result.kind === 'text' && result.text) {
      modal('Output', `<pre class="initial-output">${escape(result.text)}</pre>
        <div class="initial-tools">${buttons([['View in a tab', 'view'], ['Copy', 'copy']])}</div>`, { back });
      bind({
        view: () => showView({ ...result, root: root() }),
        copy: async () => { await navigator.clipboard.writeText(result.text); app.notice('Copied output.'); },
      });
    } else if (result.kind === 'entries') {
      await showView({ ...result, kind: 'snapshot', root: root() });
    }
  }

  const workbench = createWorkbench({
    catalog: () => library.catalog(), token: commandToken, run: runInWorkbench, details: manual, save: saveGrid,
    actions: { compose: () => compose(scratch), alias: () => aliasEditor(), draw: () => draw(), guide, tutorial },
    report: showError, address: app.address,
    readDraft: () => {
      try {
        const draft = JSON.parse(localStorage.getItem(gridDraftKey) || '{}');
        return { cells: readGrid(draft.source || '') || {}, file: draft.file };
      } catch { return {}; }
    },
    writeDraft: (cells, file) => {
      try { localStorage.setItem(gridDraftKey, JSON.stringify({ source: serializeGrid(cells), file })); } catch {}
    },
  });
  const embedded = document.querySelector('#terminal-initial');
  const terminal = document.querySelector('#terminals');
  const toggle = document.querySelector('[data-command="terminal-interface"]');

  async function shelf() {
    await library.reload();
    workbench.renderCatalog();
    if (docked) {
      if (document.querySelector('#terminal-panel').hidden) await app.run('focus-terminal');
      embedded.append(workbench.shell);
      if (dialog?.open) dialog.close();
      return;
    }
    modal('The Initial', '');
    dialog.classList.add('initial-shell-dialog');
    dialog.insertBefore(workbench.shell, dialog.querySelector('[data-error]'));
  }

  function switchInterface() {
    if (!embedded) return;
    modal('Terminal interface', `<div class="initial-tools">${buttons([['Terminal', 'terminal'], ['Initial', 'initial']])}</div>`);
    const select = async next => {
      if (next) await library.reload();
      dialog.close();
      docked = next;
      terminal.hidden = next;
      embedded.hidden = !next;
      toggle.textContent = next ? 'Initial ▾' : 'Terminal ▾';
      if (next) {
        await shelf();
        workbench.focus();
      } else {
        await app.run('focus-terminal');
      }
    };
    bind({ terminal: () => select(false), initial: () => select(true) });
  }

  function launchFull(action) {
    if (dialog?.open) dialog.close();
    return action();
  }
  async function runInWorkbench(source, { preview, full, item, renderOutput }) {
    let displayed = false;
    const showFile = async path => {
      const file = await host.read(path);
      displayed = true;
      const panel = renderOutput(file.kind === 'text' ? { text: file.content } : { text: file.mime || file.kind }, { title: file.name });
      appendAction(panel, 'Open in workspace', () => launchFull(() => app.openFile(file.path)));
    };
    const showDirectory = async path => {
      displayed = true;
      const entries = await host.list(path);
      const panel = renderOutput({ entries }, { title: path, open: entry => entry.directory ? showDirectory(entry.path) : showFile(entry.path) });
      appendAction(panel, 'Open in workspace', () => launchFull(() => showView({ kind: 'live', path, root: root() })));
    };
    const previewDisplay = {
      open: showFile,
      view: async value => {
        displayed = true;
        if (value.kind === 'live') return showDirectory(value.path);
        const panel = renderOutput(value, { open: entry => entry.directory ? showDirectory(entry.path) : showFile(entry.path) });
        appendAction(panel, 'Open in workspace', () => launchFull(() => showView(value)));
      },
      builtin: async command => {
        const invoke = () => command.run();
        if (command.id === 'open-file' || command.id === 'focus-files') return showDirectory(host.cwd());
        if (['settings', 'new-file', 'new-directory', 'about', 'help', 'about-us', 'palette', 'choose-view-mode', 'verses', 'hotkeys', 'file-menu', ...(mobile ? ['chat', 'mobile-create', 'mobile-connect', 'mobile-actions', 'mobile-tabs'] : [])].includes(command.id)) {
          displayed = true;
          const panel = renderOutput({ text: command.name }, { title: command.id });
          appendAction(panel, 'Reopen here', () => inInitialPreview(preview, invoke));
          appendAction(panel, 'Open in workspace', () => launchFull(invoke));
          await inInitialPreview(preview, invoke);
          return;
        }
        if (['save', 'refresh', 'toggle-hidden', 'files-copy', 'files-cut'].includes(command.id)) return invoke();
        displayed = true;
        const panel = renderOutput({ text: command.name }, { title: command.id });
        appendAction(panel, 'Run in workspace', () => launchFull(invoke));
      },
    };
    const display = full ? {
      open: path => launchFull(() => host.open(path)),
      view: value => launchFull(() => host.view(value)),
      builtin: command => launchFull(() => command.run()),
    } : previewDisplay;
    const commandArgs = { mkdir: 'New-folder', touch: 'Note.md', cat: '', open: '', cp: '', mv: '', trash: '', grep: '', echo: 'Abe' };
    if (item?.kind === 'Atomics' && Object.hasOwn(commandArgs, item.name)) {
      displayed = true;
      const panel = renderOutput({ text: item.usage }, { title: item.label });
      const form = document.createElement('form'); form.className = 'initial-inline-form';
      const inputCount = ['cp', 'mv'].includes(item.name) ? 2 : 1;
      for (let index = 0; index < inputCount; index++) {
        const input = document.createElement('input');
        input.setAttribute('aria-label', inputCount === 2 ? index ? 'Destination' : 'Source' : 'Argument');
        input.value = index ? '' : commandArgs[item.name]; form.append(input);
      }
      const submit = document.createElement('button'); submit.textContent = 'Run'; form.append(submit);
      panel.append(form);
      form.onsubmit = guarded(async event => {
        event.preventDefault();
        submit.disabled = true;
        try {
          displayed = false;
          const result = await library.run([source, ...Array.from(form.querySelectorAll('input'), node => quote(node.value))].join(' '), { collectOutput: true, display });
          if (!displayed || result.text) renderOutput(result);
          await app.refresh();
        }
        catch (error) { renderOutput({ text: error.message }, { title: '/dev/stderr' }); }
      });
      return;
    }
    const result = await library.run(source, { collectOutput: true, display });
    await app.refresh();
    if (!displayed || result.text) return result;
  }

  function appendAction(panel, label, run) {
    const control = document.createElement('button');
    control.type = 'button'; control.textContent = label; control.onclick = guarded(run);
    panel.append(control);
  }

  function tutorial() {
    modal('Let there be Logos', `<div class="initial-guide markdown-rendered">${renderMarkdown(logosTutorial)}</div>
      <div class="initial-tools initial-footer">${button('Try the four tiles', 'load', true)}</div>`, { back: shelf });
    bind({ load: async () => {
      await shelf();
      workbench.select('Initials');
      workbench.editGrid(firstLogo.cells, { name: firstLogo.name });
    } });
  }

  function saveGrid(cells, editing) {
    saveWord({ source: serializeGrid(cells), originalName: editing?.name, version: editing?.version, grid: cells }, shelf);
  }

  function matches(item, search) {
    return [item.name, item.label, item.detail].join(' ').toLocaleLowerCase().includes(search);
  }

  async function manual(item) {
    const editable = item.kind === 'Initials' || item.kind === 'Words';
    const file = item.kind === 'Words' ? item.sample ? { content: firstLogo.source } : await library.readWord(item.name) : null;
    const instruction = item.usage || item.script || file?.content || item.name;
    modal(item.name, `<p class="initial-intro">${escape(item.kind === 'Initials' ? item.label : item.detail)}</p>
      <pre class="initial-output">${escape(instruction)}</pre>
      <p class="initial-path">${escape(locations[item.kind])}</p>
      <div class="initial-tools initial-footer">${button('~ $ Run', 'run', true)}
        ${buttons([['Add to composer', 'use'], ...(editable ? [['Edit', 'edit']] : []), ['Make a Letter', 'alias']])}</div>`, { back: shelf });
    bind({
      run: () => runItem(item, () => manual(item)),
      use: () => { addCommand(scratch, item); compose(scratch); },
      alias: () => aliasEditor({ script: commandToken(item) }, () => manual(item)),
      edit: () => {
        if (!file) return aliasEditor(item, () => manual(item));
        if (typeof file.content !== 'string') throw new Error('Logos must contain UTF-8 text.');
        const cells = item.sample ? firstLogo.cells : readGrid(file.content);
        if (cells) return shelf().then(() => workbench.editGrid(cells, { name: item.name, version: file.modified }));
        compose({ originalName: item.name, version: file.modified, source: file.content });
      },
    });
  }

  function guide() {
    modal(app.address('Start here, Abe', 2), `<div class="initial-guide">
      <p>Terminal → Initial. Same joy, different fingers.</p>
      <ul>
        <li><strong>Letters</strong> are aliases in <code>~/.initialrc</code>, the Initial’s equivalent of <code>~/.bashrc</code>. Draw from the dot to use a trained mark.</li>
        <li><strong>Logos</strong> are saved commands in <code>~/bin</code>. Run a tile below and read <code>/dev/stdout</code> above. Drag tiles up to make a script. Tiles across a row pipe output. Rows run in order. Use <strong>＋</strong> to place tiles by tapping, or type a command.</li>
        <li><strong>Atomics</strong> (<code>/bin</code>) work with files and text. <strong>Builtins</strong> (<code>/usr/bin</code>) are actions already in YHWH. Tap <strong>⋯</strong> on a command for help and options.</li>
      </ul>
      <p><code>ls | view</code> keeps a fixed list. <code>fm .</code> follows a folder as it changes. <code>chroot</code> makes a folder appear as <code>/</code> in this tab.</p>
      </div><div class="initial-tools">${buttons([['Edit ~/.initialrc', 'rc'], ['Gesture dot settings', 'dot'], ['Let there be Logos', 'tutorial']])}</div>`, { back: shelf });
    bind({ rc: openRC, dot: dotSettings, tutorial });
  }
  async function openRC() {
    if (dialog?.open) dialog.close();
    try { await host.stat(library.rcPath); }
    catch (error) {
      if (!/ENOENT|not found|does not exist/i.test(error.message)) throw error;
      await host.create(library.rcPath, false);
      const file = await host.read(library.rcPath);
      await host.save(library.rcPath, defaultRC, file.modified);
    }
    await app.openFile(library.rcPath, await app.newTab(home));
  }
  function dotSettings() {
    modal('Your little dot', `<p>Press near the dot to reveal it. Tap for commands or drag to draw.</p>
      <label>Position<select data-position><option value="center">Center</option><option value="left">Left</option><option value="right">Right</option></select></label>
      <label>Visibility<input type="range" min="0.25" max="1" step="0.05" data-opacity value="${dotOpacity}"></label>
      ${button('Save', 'save', true)}`, { back: guide });
    dialog.querySelector('[data-position]').value = dot.dataset.position || 'center';
    bind({ save: () => {
      const settings = { position: dialog.querySelector('[data-position]').value, opacity: dialog.querySelector('[data-opacity]').value };
      localStorage.setItem('yhwh:initial:dot', JSON.stringify(settings));
      applyDot(settings);
      guide();
    } });
  }

  function glyphPicker(onPick, back) {
    modal('Choose a letter', `<nav class="initial-categories" aria-label="Alphabets">
      ${Object.keys(alphabets).map(name => `<button type="button" data-alphabet="${name}">${name}</button>`).join('')}
      </nav><div class="initial-glyphs"></div>`, { back });
    function render(name) {
      for (const tab of dialog.querySelectorAll('[data-alphabet]')) {
        tab.setAttribute('aria-pressed', String(tab.dataset.alphabet === name));
      }
      const grid = dialog.querySelector('.initial-glyphs');
      grid.innerHTML = alphabets[name].map(([glyph, label], index) => `<button type="button" data-glyph="${index}" title="${label}"><b dir="auto">${glyph}</b><small>${label}</small></button>`).join('');
      for (const button of grid.querySelectorAll('button')) button.onclick = () => onPick(alphabets[name][Number(button.dataset.glyph)][0]);
    }
    for (const tab of dialog.querySelectorAll('[data-alphabet]')) tab.onclick = () => render(tab.dataset.alphabet);
    render('Latin');
  }
  function aliasEditor(item = {}, back = shelf) {
    const used = new Set(library.catalog().filter(entry => entry.kind === 'Initials').flatMap(entry => [entry.name, ...entry.names]));
    const name = item.name || alphabets.Latin.find(([glyph, label]) => !used.has(glyph) && !used.has(label))?.[0] || 'A';
    const alias = { name, script: item.script || 'fm .', names: item.names || [transliteration(name)], gesture: item.gesture };
    let options = false;
    function render() {
      modal(item.name ? 'Edit Letter' : 'A name of your own', `<form data-alias-form>
        <div class="initial-alias-heading">
          <button type="button" class="initial-big-glyph" data-initial="glyph" aria-label="Choose a letter"><b dir="auto">${escape(alias.name)}</b><small>Choose letter</small></button>
          <label>Tile name<input name="name" aria-label="Letter name" value="${escape(alias.name)}" required autocapitalize="off"></label>
        </div>
        <label>Action <code dir="auto">${escape(alias.script)}</code></label>
        ${button('Choose action', 'action')}
        <details class="initial-options"${options ? ' open' : ''}><summary>Search names, script and gesture</summary>
          <label>Search names <small>Separate with commas</small><input name="names" aria-label="Search names" value="${escape(alias.names.join(', '))}"></label>
          ${button('Reset transliteration', 'reset')}
          <label>Script<textarea name="script" aria-label="Letter action" rows="3" spellcheck="false">${escape(alias.script)}</textarea></label>
          <div class="initial-tools">${buttons([[alias.gesture ? 'Retrain gesture' : 'Train gesture', 'train'], ...(alias.gesture ? [['Clear gesture', 'clear-gesture']] : []), ...(item.name ? [['Remove Letter', 'remove']] : [])])}</div>
        </details>
        <div class="initial-tools initial-footer"><button class="primary">Save Letter</button></div>
      </form>`, { back });
      const form = dialog.querySelector('form');
      const details = form.querySelector('details');
      const nameInput = form.elements.name, namesInput = form.elements.names;
      const actionPreview = form.querySelector('code');
      nameInput.oninput = () => {
        if (namesInput.value === transliteration(alias.name)) namesInput.value = transliteration(nameInput.value);
        alias.name = nameInput.value;
      };
      form.elements.script.oninput = () => { actionPreview.textContent = form.elements.script.value; };
      function collect() {
        options = details.open;
        alias.name = nameInput.value.trim();
        alias.names = namesInput.value.split(',').map(value => value.trim()).filter(Boolean);
        alias.script = form.elements.script.value;
      }
      form.onsubmit = guarded(async event => {
        event.preventDefault();
        collect();
        if (!alias.script.trim()) {
          details.open = true;
          form.elements.script.focus();
          throw new Error('Choose an action or enter a script.');
        }
        await library.saveAlias(alias, item.name);
        await shelf();
        workbench.select('Initials');
      });
      const pickLetter = () => {
        collect();
        glyphPicker(glyph => { alias.name = glyph; alias.names = [transliteration(glyph)]; render(); }, render);
      };
      bind({
        glyph: pickLetter,
        reset: () => { namesInput.value = transliteration(nameInput.value); },
        action: () => { collect(); chooseCommand(command => { alias.script = commandToken(command); render(); }, { back: render }); },
        train: () => { collect(); draw(points => { alias.gesture = normalizeGesture(points); render(); }, render); },
        'clear-gesture': () => { collect(); alias.gesture = undefined; render(); },
        remove: async () => { await library.removeAlias(item.name); await shelf(); },
      });
    }
    render();
  }

  function chooseCommand(done, { back, title = 'Choose a command' }) {
    const entries = library.catalog();
    modal(title, `<input type="search" data-find aria-label="Find a command" placeholder="Find a command" autocomplete="off"><div class="initial-choices"></div>`, { back });
    const search = dialog.querySelector('[data-find]');
    const container = dialog.querySelector('.initial-choices');
    function render() {
      const list = entries.filter(item => matches(item, search.value.trim().toLocaleLowerCase()));
      container.innerHTML = list.map((item, index) => `<button type="button" data-choice="${index}"><b dir="auto">${escape(item.name)}</b><span>${escape(item.kind === 'Words' ? 'Saved Logos' : item.label)}<small>${item.kind}</small></span></button>`).join('') || '<p class="initial-empty">No matching commands.</p>';
      for (const choice of container.querySelectorAll('button')) choice.onclick = guarded(() => done(list[Number(choice.dataset.choice)]));
    }
    search.oninput = render;
    render();
  }

  function setSource(program, source) {
    program.source = source;
    if (program === scratch) {
      try { localStorage.setItem(draftKey, source); } catch {}
    }
  }
  function insert(program, token, separator = ' ') {
    program.previous = program.source;
    const needsSeparator = program.source && !/[\s|]$/.test(program.source);
    setSource(program, program.source + (needsSeparator ? separator : '') + token);
  }
  function addCommand(program, item) {
    program.previous = program.source;
    const needsLine = program.source && !/[\n|]\s*$/.test(program.source);
    setSource(program, program.source + (needsLine ? '\n' : '') + commandToken(item));
  }
  function compose(program) {
    const back = () => compose(program);
    modal(program.originalName ? 'Edit ' + program.originalName : 'Compose a command', `
      <label>Commands<textarea rows="6" data-composer aria-label="Command" spellcheck="false" autocapitalize="off" placeholder="Add a command or type one…">${escape(program.source)}</textarea></label>
      <div class="initial-tools">${buttons([['+ Command', 'command'], ['Argument…', 'arg'], ['| Pipe', 'pipe'], ['↵ Then', 'then']])}</div>
      <details class="initial-options"${program.more ? ' open' : ''}><summary>More tools</summary>
        <div class="initial-tools">${buttons([['$()', 'sub'], ['> Save output', 'redirect'], ['Undo', 'undo'], ['Clear', 'clear']])}</div>
      </details>
      <div class="initial-tools initial-footer">${button('~ $ Run', 'run', true)}${button('#! Save Logos', 'save-word')}</div>`, { back: shelf });
    const input = dialog.querySelector('[data-composer]');
    const details = dialog.querySelector('details');
    function updateButtons() {
      dialog.querySelector('[data-initial="run"]').disabled = !program.source.trim();
      dialog.querySelector('[data-initial="save-word"]').disabled = !program.source.trim();
      dialog.querySelector('[data-initial="undo"]').disabled = program.previous == null;
    }
    function update() {
      input.value = program.source;
      input.scrollTop = input.scrollHeight;
      updateButtons();
    }
    input.oninput = () => { program.previous = program.source; setSource(program, input.value); updateButtons(); };
    details.ontoggle = () => { program.more = details.open; };
    bind({
      command: () => chooseCommand(item => { addCommand(program, item); back(); }, { back }),
      arg: () => argument(value => { insert(program, quote(value)); back(); }, { back, title: 'Choose an argument', suggestion: 'New-folder' }),
      pipe: () => { insert(program, '| '); update(); },
      then: () => { insert(program, '\n', ''); update(); },
      sub: () => chooseCommand(item => { insert(program, '$(' + commandToken(item) + ')'); back(); }, { back, title: 'Use command output ($())' }),
      redirect: () => argument(value => { insert(program, '> ' + quote(value)); back(); }, { back, title: 'Save output into a file', suggestion: 'output.txt' }),
      undo: () => { setSource(program, program.previous); program.previous = undefined; update(); },
      clear: () => { program.previous = program.source; setSource(program, ''); update(); },
      run: () => execute(program.source, back),
      'save-word': () => saveWord(program, back),
    });
    update();
  }

  function saveWord(program, back) {
    let index = 1;
    const names = new Set(library.catalog().flatMap(item => [item.name, ...(item.names || [])]));
    while (names.has('word-' + index)) index++;
    const suggested = program.originalName || 'word-' + index;
    const label = 'Save Logos';
    modal(label, `<form>
      <label>Name in <code>~/bin</code><input data-word-name aria-label="Logos name" value="${escape(suggested)}" required autocapitalize="off"></label>
      ${program.originalName ? '<p class="initial-intro">Change the name to save a copy.</p>' : ''}
      <div class="initial-tools initial-footer"><button class="primary">${label}</button></div>
      </form>`, { back });
    dialog.querySelector('form').onsubmit = guarded(async event => {
      event.preventDefault();
      const name = event.currentTarget.querySelector('input').value.trim();
      await library.saveWord(name, program.source, program.originalName === name ? program.version : undefined);
      if (program === scratch) {
        setSource(scratch, '');
        scratch.previous = undefined;
      }
      await shelf();
      workbench.select('Words');
      if (program.grid) {
        const file = await library.readWord(name);
        workbench.editGrid(program.grid, { name, version: file.modified });
      }
      app.notice('Saved ~/bin/' + name);
    });
  }

  function runItem(item, back = shelf) {
    const run = (...args) => execute([commandToken(item), ...args.map(quote)].join(' '), back);
    const textArguments = { echo: 'Abe', grep: 'note', head: '10' };
    if (item.kind === 'Atomics' && Object.hasOwn(textArguments, item.name)) {
      modal(item.label, `<form><label>Argument<input aria-label="Argument" value="${textArguments[item.name]}"></label><button class="primary">Run</button></form>`, { back });
      dialog.querySelector('form').onsubmit = guarded(event => {
        event.preventDefault();
        return run(event.currentTarget.querySelector('input').value);
      });
      return;
    }
    const suggestions = { mkdir: 'New-folder', touch: 'Note.md', cat: '', cd: '.', ls: '.', fm: '.', open: '', cp: '', mv: '', trash: '', chroot: '.' };
    if (item.kind !== 'Atomics' || !Object.hasOwn(suggestions, item.name)) return run();
    const copyOrMove = item.name === 'cp' || item.name === 'mv';
    return argument(value => copyOrMove
      ? argument(destination => run(value, destination), { back, title: 'Choose the destination', suggestion: 'Copy' })
      : run(value), { back, title: copyOrMove ? 'Choose the source' : item.label, suggestion: suggestions[item.name] });
  }
  async function argument(choose, { back, title, suggestion }) {
    let cwd = app.active().cwd;
    async function render() {
      const entries = (await host.list(cwd)).filter(entry => !entry.name.startsWith('.'));
      const parent = cwd !== (root() || home);
      modal(title, `<p class="initial-path">${escape(cwd)}</p>
        <div class="initial-tools">${parent ? button('↑ Parent', 'parent') : ''}${button('Use this folder', 'here')}</div>
        <div class="initial-paths">${entries.map((entry, index) => `<div>
          <button type="button" data-path="${index}">${entry.directory ? '▱' : '≡'} ${escape(entry.name)}</button>
          ${entry.directory ? `<button type="button" data-enter="${index}" aria-label="Browse ${escape(entry.name)}">→</button>` : ''}
        </div>`).join('')}</div>
        <form><label>Text or new name<input aria-label="Argument" value="${escape(suggestion)}"></label><button class="primary">Use this</button></form>`, { back });
      for (const button of dialog.querySelectorAll('[data-path]')) button.onclick = guarded(() => choose(entries[Number(button.dataset.path)].path));
      for (const button of dialog.querySelectorAll('[data-enter]')) button.onclick = guarded(() => { cwd = entries[Number(button.dataset.enter)].path; return render(); });
      dialog.querySelector('form').onsubmit = guarded(event => {
        event.preventDefault();
        return choose(event.currentTarget.querySelector('input').value);
      });
      bind({
        parent: () => { cwd = cwd.slice(0, cwd.lastIndexOf('/')) || '/'; return render(); },
        here: () => choose(cwd),
      });
    }
    await render();
  }

  async function showView(value) {
    if (dialog?.open) dialog.close();
    const tab = await app.newTab(value.path || app.active().cwd);
    tab.initialRoot = mobile ? null : value.root;
    if (mobile && value.root) Object.assign(tab, await call('world:enter', tab.id, value.root));
    if (value.path) await app.navigate(value.path, tab);
    tab.initialView = { value, query: '', grid: true, selecting: false };
    tab.customTitle = value.kind === 'live' ? 'Files · ' + (value.path.split('/').at(-1) || '/') : 'Command output';
    await renderView(tab);
    await app.run('focus-document');
  }

  async function renderView(tab) {
    const state = tab.initialView;
    if (!state) return;
    const { value } = state;
    const live = value.kind === 'live';
    const cwd = tab.cwd;
    const entries = live ? await call('directory:list', tab.id, cwd) : value.entries;
    if (tab.initialView !== state || tab.cwd !== cwd || !app.tabs.includes(tab)) return;
    const boundary = tab.initialRoot || tab.worldRoot;
    const key = JSON.stringify([cwd, boundary, entries, state.grid, state.selecting, [...tab.selected]]);
    if (key === state.rendered) return;
    state.rendered = key;

    const target = tab.document;
    const searchFocused = document.activeElement === target.querySelector('[data-view-search]');
    target.innerHTML = `<section class="initial-file-view">
      <header><div><h2>${escape(live ? cwd.split('/').at(-1) || '/' : 'Command output')}</h2>
        <p>${live ? 'Live folder · ' + escape(boundary ? cwd.slice(boundary.length) || '/' : cwd) : entries ? 'Fixed list · ' + entries.length + ' items' : 'Text output'}</p>
      </div>${live ? button('+ New', 'new', true) : ''}</header>
      ${entries ? `
        <div class="initial-tools initial-file-toolbar">
          ${live && cwd !== (boundary || home) ? button(fileIcons.parent + ' Up', 'parent') : ''}
          ${button(state.grid ? fileIcons.list + ' List' : fileIcons.grid + ' Tiles', 'layout')}
          ${button(state.selecting ? 'Done' : 'Select', 'select')}
          ${live ? button(fileIcons.refresh + ' Refresh', 'refresh') : ''}
          ${boundary ? button('Leave /', 'leave-root') : ''}
        </div>
        <input type="search" data-view-search aria-label="Filter files" placeholder="Filter files" value="${escape(state.query)}">
        ${state.selecting ? `<div class="initial-tools initial-file-actions">${buttons([['Copy', 'copy'], ['Cut', 'cut'], ['Paste', 'paste'], ['Rename', 'rename'], ['Trash', 'trash']])}<span role="status"></span></div>` : ''}
        <div class="initial-file-grid ${state.grid ? '' : 'as-list'} ${state.selecting ? 'is-selecting' : ''}">${entries.map((entry, i) => `<article>
          ${state.selecting ? `<input type="checkbox" aria-label="Select ${escape(entry.name)}" data-select="${i}" ${tab.selected.has(entry.path) ? 'checked' : ''}>` : ''}
          <button type="button" data-open="${i}">${entry.directory ? fileIcons.folder : fileIcons.file}<span>${escape(entry.name)}</span><small>${entry.directory ? 'Folder' : `${entry.size || 0} bytes`}</small></button>
        </article>`).join('')}
        <p class="initial-empty" data-empty>${entries.length ? 'No matching files.' : live ? 'An empty bit of universe. Make something.' : 'No files in this output.'}</p></div>`
        : `<pre class="initial-output">${escape(asText(value))}</pre>`}
    </section>`;

    const control = action => target.querySelector(`[data-initial="${action}"]`);
    const act = (action, fn) => { if (control(action)) control(action).onclick = guarded(fn); };
    if (entries) {
      const search = target.querySelector('[data-view-search]');
      const rows = [...target.querySelectorAll('.initial-file-grid article')];
      function filter() {
        state.query = search.value;
        const query = state.query.trim().toLocaleLowerCase();
        for (const [index, row] of rows.entries()) row.hidden = !entries[index].name.toLocaleLowerCase().includes(query);
        target.querySelector('[data-empty]').hidden = rows.some(row => !row.hidden);
      }
      search.oninput = filter;
      filter();
      if (searchFocused) search.focus();

      function updateSelection() {
        const count = tab.selected.size;
        target.querySelector('.initial-file-actions span').textContent = count + ' selected';
        for (const action of ['copy', 'cut', 'trash']) control(action).disabled = count === 0;
        control('rename').disabled = count !== 1;
      }
      for (const [index, row] of rows.entries()) {
        const entry = entries[index];
        const checkbox = row.querySelector('[data-select]');
        if (checkbox) checkbox.onchange = () => {
          if (checkbox.checked) tab.selected.add(entry.path);
          else tab.selected.delete(entry.path);
          updateSelection();
        };
        row.querySelector('[data-open]').onclick = guarded(async () => {
          if (checkbox) return checkbox.click();
          if (!entry.directory) return app.openFile(entry.path, tab);
          if (!live) return showView({ kind: 'live', path: entry.path, root: boundary });
          await app.navigate(entry.path, tab);
          await renderView(tab);
        });
      }
      if (state.selecting) updateSelection();
      for (const action of ['copy', 'cut', 'paste', 'rename', 'trash']) act(action, async () => {
        await app.run('files-' + action);
        await renderView(tab);
      });
      act('select', async () => {
        state.selecting = !state.selecting;
        if (!state.selecting) tab.selected.clear();
        await renderView(tab);
        control('select')?.focus();
      });
      act('layout', () => { state.grid = !state.grid; return renderView(tab); });
    }
    act('parent', async () => { await app.navigate(cwd.slice(0, cwd.lastIndexOf('/')) || '/', tab); await renderView(tab); });
    act('leave-root', async () => { await host.chroot(null); await renderView(tab); });
    act('refresh', () => renderView(tab));
    act('new', () => app.run(mobile ? 'mobile-create' : 'new-file'));
  }

  function scheduleView() {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      const tab = app.active();
      if (tab?.initialView?.value.kind === 'live') renderView(tab).catch(showError);
    }, 150);
  }
  for (const event of ['focus', 'navigate', 'save', 'refresh']) app.on(event, scheduleView);
  window.yhwh.on('directory-changed', scheduleView);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleView(); });

  const dot = document.createElement('button');
  dot.id = 'initial-dot';
  dot.type = 'button';
  dot.title = 'Initial · tap for commands or draw from here';
  dot.setAttribute('aria-label', 'Open Initial');
  const commandButton = document.createElement('button');
  commandButton.id = 'initial-commands';
  commandButton.textContent = '⌘';
  commandButton.type = 'button';
  commandButton.setAttribute('aria-label', 'Your Initial commands');
  commandButton.title = 'Your Initial commands';
  document.body.append(dot, commandButton);

  let dotOpacity;
  function applyDot(settings = {}) {
    dot.dataset.position = ['center', 'left', 'right'].includes(settings.position) ? settings.position : 'center';
    dotOpacity = Math.max(0.25, Math.min(1, Number(settings.opacity) || 0.6));
    dot.style.setProperty('--initial-dot-opacity', dotOpacity * 0.55);
  }
  try { applyDot(JSON.parse(localStorage.getItem('yhwh:initial:dot') || '{}')); }
  catch { applyDot(); }
  const trace = document.createElement('canvas');
  trace.id = 'initial-trace'; trace.hidden = true; trace.setAttribute('aria-hidden', 'true');
  const gestureResult = document.createElement('div');
  gestureResult.id = 'initial-gesture-result'; gestureResult.hidden = true; gestureResult.setAttribute('role', 'status');
  document.body.append(trace, gestureResult);
  let stroke, drew = false;
  const clearTrace = () => { trace.hidden = true; gestureResult.hidden = true; gestureResult.replaceChildren(); };
  dot.onpointerdown = event => {
    if (!event.isPrimary || event.button !== 0) return;
    clearTrace(); drew = false;
    stroke = { pointer: event.pointerId, points: [[event.clientX, event.clientY]] };
    dot.setPointerCapture(event.pointerId);
    dot.classList.add('pressing');
  };
  dot.onpointermove = event => {
    if (!stroke || stroke.pointer !== event.pointerId) return;
    const point = [event.clientX, event.clientY], first = stroke.points[0];
    if (!drew && Math.hypot(point[0] - first[0], point[1] - first[1]) < 8) return;
    const context = trace.getContext('2d');
    if (!drew) {
      drew = true; trace.hidden = false;
      const dpr = window.devicePixelRatio || 1;
      trace.width = trace.clientWidth * dpr; trace.height = trace.clientHeight * dpr;
      context.scale(dpr, dpr); context.strokeStyle = getComputedStyle(dot).getPropertyValue('--purple');
      context.lineWidth = 4; context.lineCap = 'round'; context.lineJoin = 'round';
    }
    context.beginPath(); context.moveTo(...stroke.points.at(-1)); context.lineTo(...point); context.stroke();
    stroke.points.push(point);
  };
  dot.onpointerup = guarded(async event => {
    if (!stroke || stroke.pointer !== event.pointerId) return;
    const { points } = stroke; stroke = null;
    dot.classList.remove('pressing');
    if (!drew) return;
    gestureResult.hidden = false;
    const label = document.createElement('span');
    gestureResult.append(label);
    appendAction(gestureResult, 'Dismiss', clearTrace);
    try {
      await library.reload();
      if (!label.isConnected) return;
      const match = matchGesture(points, library.catalog().filter(item => item.kind === 'Initials'));
      if (!match || match.ambiguous) {
        label.textContent = match ? 'Two Letters match. Try again.' : 'No Letter matches that mark.';
        return;
      }
      label.textContent = match.alias.name + ' · ' + match.alias.label;
      appendAction(gestureResult, 'Run', async () => { clearTrace(); await shelf(); await workbench.execute(quote(match.alias.name)); });
    } catch (error) { label.textContent = error.message; }
  });
  dot.onpointercancel = dot.onlostpointercapture = event => {
    if (stroke?.pointer !== event.pointerId) return;
    stroke = null;
    dot.classList.remove('pressing');
    clearTrace();
  };
  dot.onclick = guarded(event => (event.detail && drew) ? undefined : shelf());
  commandButton.onclick = guarded(async () => { await shelf(); if (docked) workbench.focus(); });
  document.addEventListener('pointerdown', event => { if (!event.target.closest('#initial-dot, #initial-gesture-result')) clearTrace(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') clearTrace(); });

  async function draw(done, back = shelf) {
    if (!done) await library.reload();
    modal(done ? 'Teach me your mark' : 'Draw a Letter', `
      <p>${done ? 'Draw one continuous mark.' : 'Draw a mark you trained, then tap its match to run it.'}</p>
      <canvas aria-label="Gesture sketch pad"></canvas><p data-match role="status"></p>
      <div class="initial-tools">${button(done ? 'Use this gesture' : 'Match gesture', 'match', true)}${button('Clear', 'clear')}</div>`, { back, drawing: true });
    const canvas = dialog.querySelector('canvas');
    const context = canvas.getContext('2d');
    const match = dialog.querySelector('[data-match]');
    let points = [], drawing = false;
    const box = canvas.getBoundingClientRect();
    canvas.width = box.width * devicePixelRatio;
    canvas.height = box.height * devicePixelRatio;
    context.scale(devicePixelRatio, devicePixelRatio);
    context.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--purple') || '#b7a1ef';
    context.lineWidth = 5;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    function point(event) {
      const rect = canvas.getBoundingClientRect();
      return [event.clientX - rect.left, event.clientY - rect.top];
    }
    function clear() {
      points = [];
      context.clearRect(0, 0, canvas.width, canvas.height);
      match.textContent = '';
    }
    function start(event) {
      if (event.isPrimary === false) return;
      clear();
      canvas.setPointerCapture(event.pointerId);
      drawing = true;
      points = [point(event)];
      context.beginPath();
      context.moveTo(...points[0]);
    }
    canvas.onpointerdown = start;
    canvas.onpointermove = event => {
      if (!drawing) return;
      points.push(point(event));
      context.lineTo(...points.at(-1));
      context.stroke();
    };
    canvas.onpointerup = () => { drawing = false; };
    canvas.onpointercancel = () => { drawing = false; clear(); };
    bind({ clear, match: () => {
      if (done) return done(points);
      const result = matchGesture(points, library.catalog().filter(item => item.kind === 'Initials'));
      if (!result) {
        match.textContent = 'No familiar mark yet. Edit a Letter to train its gesture.';
      } else if (result.ambiguous) {
        match.textContent = 'Two marks look alike. Choose from Commands, or retrain one.';
      } else {
        match.innerHTML = `<button type="button" class="initial-match">${escape(result.alias.name)} · ${escape(result.alias.names.join(' · '))} · Run</button>`;
        match.querySelector('button').onclick = guarded(() => execute(quote(result.alias.name)));
      }
    } });
  }

  app.addCommand({ id: 'initial', name: 'Initial · tiles and scripts', run: shelf });
  if (!mobile) app.addCommand({ id: 'terminal-interface', name: 'Choose Terminal or Initial', run: switchInterface });
  app.addCommand({ id: 'initial-draw', name: 'Draw a Letter', run: () => draw() });
  app.addCommand({ id: 'initial-new', name: 'New Letter', run: async () => { await library.reload(); aliasEditor(); } });
  app.addCommand({ id: 'initial-rc', name: 'Initial · edit aliases file', run: openRC });
  return { ...library, open: shelf, draw: () => draw(), focusTerminal() {
    if (!docked || !embedded?.contains(workbench.shell)) return false;
    workbench.focus(); return true;
  } };
}
