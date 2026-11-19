import { gridSize, gridSource } from '../../../lib/initial-grid.mjs';
import { asText, tokenize } from '../../../lib/initial.mjs';

const kinds = [
  ['Atomics', 'Atomics', '/bin'], ['Builtins', 'Builtins', '/usr/bin'],
  ['Initials', 'Letters', '~/.bashrc'], ['Words', 'Logos', '~/bin'],
];
const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
};

export function createWorkbench({ catalog, token, run, details, save, readDraft, writeDraft, actions, report, address }) {
  const shell = element('section', null, 'initial-workbench');
  shell.innerHTML = `<section class="initial-preview" aria-label="Initial workspace">
      <header class="initial-preview-bar">
        <b aria-hidden="true">曰</b><span data-screen-path dir="auto">/dev/stdout</span>
        <button type="button" data-screen="output" title="Command output" aria-pressed="true">Output</button>
        <button type="button" data-screen="grid" title="Edit a Logos" aria-pressed="false">Script</button>
      </header>
      <div class="initial-screen"></div>
    </section>
    <section class="initial-launcher" aria-label="Command launcher">
      <nav class="initial-categories" aria-label="Command locations"></nav>
      <div class="initial-search">
        <input type="search" data-search aria-label="Find or type a command" placeholder="Find or type a command" autocomplete="off" autocapitalize="off" spellcheck="false">
        <button type="button" data-layout aria-pressed="false" aria-label="List view">☷</button>
        <button type="button" data-add aria-pressed="false" title="Add tiles to your script">＋</button>
      </div>
      <div class="initial-shelf" aria-label="Commands"></div>
      <footer class="initial-workbench-tools">
        <details data-options><summary aria-label="Shell options">⋯</summary>
          <label><input type="checkbox" data-full> Open app actions in workspace</label>
          <button type="button" data-tool="compose">Text composer</button>
          <button type="button" data-tool="alias">New Letter</button>
          <button type="button" data-tool="draw">Match a gesture</button>
        </details>
        <button type="button" data-tool="guide">Guide</button>
        <button type="button" data-tool="tutorial">Let there be Logos</button>
      </footer>
      <p role="status" class="initial-shell-status"></p>
    </section>`;
  const $ = selector => shell.querySelector(selector);
  const preview = $('.initial-preview'), screen = $('.initial-screen'), shelf = $('.initial-shelf'), search = $('[data-search]');
  const setStatus = message => { $('.initial-shell-status').textContent = message; };
  let category = 'Atomics', list = false, adding = false, running = false;
  const draft = readDraft();
  let cells = draft.cells || {}, editing = draft.file || null, selected = null, currentScreen = 'output';
  let outputPanel = null, scriptOutput = null;
  let matches = [];
  let pending, execution = 0;
  const action = fn => async (...args) => {
    try { return await fn(...args); }
    catch (error) { report(error); setStatus(error.message); }
  };
  function button(label, fn, aria) {
    const node = element('button', label);
    node.type = 'button';
    if (aria) node.setAttribute('aria-label', aria);
    node.onclick = action(fn);
    return node;
  }

  for (const [id, label, path] of kinds) {
    const tab = button(label, () => {
      category = id;
      search.value = '';
      renderCatalog();
      tab.focus();
    });
    tab.dataset.kind = id;
    tab.title = id === 'Initials' ? 'Like ~/.bashrc in Bash. YHWH reads ~/.initialrc.' : path;
    tab.append(element('small', path));
    $('.initial-categories').append(tab);
  }
  for (const [name, fn] of Object.entries(actions)) {
    const control = $(`[data-tool="${name}"]`);
    if (control) control.onclick = action(() => { $('[data-options]').open = false; return fn(); });
  }
  function fragment() {
    return search.value.trimStart().match(/(?:^|[|;]\s*)([\p{L}\p{N}_.\/~\-]+)$/u)?.[1] || '';
  }
  search.oninput = () => renderCatalog();
  search.onkeydown = event => {
    if (event.isComposing) return;
    if (event.key === 'ArrowDown' && matches.length) { event.preventDefault(); shelf.querySelector('.initial-tile')?.focus(); }
    const prefix = fragment();
    if (event.key === 'Tab' && !event.shiftKey && prefix) {
      const candidates = matches.filter(item => item.name.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase()));
      if (candidates.length === 1 && token(candidates[0]) !== prefix) {
        event.preventDefault();
        search.value = search.value.slice(0, -prefix.length) + token(candidates[0]) + ' ';
        renderCatalog();
      }
    }
    if (event.key !== 'Enter' || !search.value.trim()) return;
    event.preventDefault();
    const value = search.value.trim();
    if (adding) action(() => place(value))();
    else execute(matches.length === 1 && !/\s/.test(value) ? token(matches[0]) : value);
  };
  $('[data-layout]').onclick = () => {
    list = !list;
    $('[data-layout]').setAttribute('aria-pressed', String(list));
    $('[data-layout]').setAttribute('aria-label', list ? 'Icon view' : 'List view');
    $('[data-layout]').textContent = list ? '▦' : '☷';
    renderCatalog();
  };
  $('[data-add]').onclick = () => {
    adding = !adding;
    $('[data-add]').setAttribute('aria-pressed', String(adding));
    if (adding) {
      showScript();
      setStatus('Tap a command to add it. Select a square to choose its position.');
    } else setStatus('');
  };
  $('[data-screen="grid"]').onclick = showScript;
  $('[data-screen="output"]').onclick = () => show('output');

  function renderCatalog() {
    const query = (fragment() || search.value.trim()).toLocaleLowerCase();
    for (const tab of shell.querySelectorAll('[data-kind]')) tab.setAttribute('aria-pressed', String(tab.dataset.kind === category));
    matches = catalog().filter(item => query ? [item.name, item.label, item.detail].join(' ').toLocaleLowerCase().includes(query) : item.kind === category);
    shelf.classList.toggle('as-list', list);
    shelf.replaceChildren();
    if (!query && category === 'Initials') {
      const definition = element('p', 'Letter (noun) · One who lets, or a little command that lets something happen. e.g., Let there be light.', 'initial-letter-definition');
      shelf.append(definition);
    }
    if (!matches.length) shelf.append(element('p', 'No matching commands.', 'initial-empty'));
    for (const item of matches) {
      const card = element('article', null, 'initial-command' + (item.kind === 'Initials' ? '' : ' is-command'));
      const tile = button('', () => adding ? place(token(item)) : execute(token(item), item));
      tile.className = 'initial-tile';
      tile.title = item.detail;
      const name = element('b', item.name); name.dir = 'auto';
      tile.append(name);
      if (item.kind !== 'Initials' || list) tile.append(element('span', item.kind === 'Words' ? item.detail : item.label));
      else tile.setAttribute('aria-label', item.name + ' · ' + item.label);
      const menu = button('⋯', () => details(item), 'Details for ' + item.name);
      menu.className = 'initial-details';
      card.append(tile, menu);
      shelf.append(card);
      draggable(tile, { command: token(item), label: item.name });
    }
  }

  function pathTitle() {
    $('[data-screen-path]').textContent = currentScreen === 'grid' ? '~/bin/' + (editing?.name || '$word') : '/dev/stdout';
  }
  function showOutput(container) {
    const grid = currentScreen === 'grid';
    const panel = grid ? scriptOutput : outputPanel;
    container.replaceChildren(panel || element('p', grid ? 'Script output appears here.' : address('Try a command, Abe. Drag it up here when it does what you want.', 1), 'initial-empty'));
  }
  function showScript() {
    show('grid');
    if (!scriptOutput && Object.keys(cells).length) execute(gridSource(cells), undefined, { automatic: true, script: true });
  }
  function show(which) {
    currentScreen = which;
    for (const button of shell.querySelectorAll('[data-screen]')) button.setAttribute('aria-pressed', String(button.dataset.screen === which));
    pathTitle();
    screen.replaceChildren();
    if (which === 'grid') renderGrid();
    else showOutput(screen);
    screen.classList.remove('initial-screen-enter');
    requestAnimationFrame(() => screen.classList.add('initial-screen-enter'));
  }
  function renderGrid() {
    const stdout = element('div', null, 'initial-grid-output');
    stdout.setAttribute('aria-label', 'Script stdout');
    stdout.setAttribute('aria-live', 'polite');
    showOutput(stdout);
    screen.append(stdout);
    const layout = element('div', null, 'initial-grid');
    layout.setAttribute('aria-label', 'Script grid, five rows and five columns');
    for (let index = 0; index < gridSize; index++) {
      const command = cells[index];
      const first = command?.match(/^(?:'(?:[^']*)'|\S+)/u)?.[0];
      const label = catalog().find(item => token(item) === first || item.names?.includes(first))?.name || first;
      const square = button(label || '·', () => {
        selected = selected === index ? null : index;
        for (const [i, item] of [...layout.children].entries()) item.setAttribute('aria-pressed', String(selected === i));
        setStatus(selected != null && !command ? 'Choose a command for this square.' : '');
        edit.disabled = remove.disabled = selected == null || !cells[selected];
        editor.hidden = true;
      }, `Row ${1 + Math.floor(index / 5)}, column ${1 + index % 5}${command ? ': ' + command : ': empty'}`);
      square.dataset.cell = index;
      square.title = command || '';
      square.classList.toggle('has-tile', !!command);
      square.setAttribute('aria-pressed', String(selected === index));
      if (command) draggable(square, { command, label, index });
      layout.append(square);
    }
    const tools = element('div', null, 'initial-grid-tools');
    const editor = element('form', null, 'initial-inline-form');
    editor.hidden = true;
    const input = element('input');
    input.setAttribute('aria-label', 'Tile command and options');
    input.spellcheck = false;
    input.autocomplete = 'off';
    const apply = element('button', 'Apply');
    apply.type = 'submit';
    editor.append(input, apply, button('Cancel', () => { editor.hidden = true; edit.focus(); }));
    editor.onsubmit = action(event => {
      event.preventDefault();
      const command = input.value.trim();
      if (!validTile(command)) return;
      if (cells[selected] === command) { editor.hidden = true; edit.focus(); return; }
      cells[selected] = command;
      changed(selected);
    });
    const edit = button('Edit tile', () => {
      editor.hidden = false;
      input.value = cells[selected];
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
    const clear = button('New', () => {
      if (Object.keys(cells).length && !confirm('Clear this script and start a new one?')) return;
      editGrid({}, null);
    });
    const remove = button('Remove', () => removeTile(selected));
    clear.disabled = !editing && !Object.keys(cells).length;
    edit.disabled = remove.disabled = selected == null || !cells[selected];
    const runGrid = button('Run', () => execute(gridSource(cells), undefined, { script: true }));
    const saveGrid = button('Save Logos', () => save(cells, editing));
    runGrid.disabled = saveGrid.disabled = !gridSource(cells);
    tools.append(clear, edit, remove, runGrid, saveGrid);
    screen.append(layout, editor, tools);
  }

  function renderOutput(value, { open, title } = {}, script) {
    outputPanel = element('div', null, 'initial-output-panel');
    if (title) outputPanel.append(element('h3', title));
    if (value.entries) {
      const files = element('ul', null, 'initial-preview-files');
      for (const entry of value.entries.slice(0, 500)) {
        const row = element('li');
        if (open) row.append(button((entry.directory ? '▱ ' : '≡ ') + entry.name, () => open(entry)));
        else row.textContent = (entry.directory ? '▱ ' : '≡ ') + entry.name;
        files.append(row);
      }
      outputPanel.append(files);
      if (value.entries.length > 500) outputPanel.append(element('p', `Showing 500 of ${value.entries.length} entries.`, 'initial-empty'));
      if (!value.entries.length) outputPanel.append(element('p', 'Empty directory.', 'initial-empty'));
    } else {
      outputPanel.append(element('pre', asText(value) || 'Completed.', 'initial-output'));
    }
    if (script) scriptOutput = outputPanel;
    if (currentScreen === 'output') showOutput(screen);
    else if (script) showOutput($('.initial-grid-output'));
    return outputPanel;
  }

  function execute(source, item, { automatic = false, script = false } = {}) {
    if (!automatic) { setStatus(''); show('output'); }
    pending = { source, item, automatic, script, id: ++execution };
    if (!source.trim()) {
      pending = null;
      if (outputPanel === scriptOutput) outputPanel = null;
      scriptOutput = null;
      showOutput(currentScreen === 'grid' ? $('.initial-grid-output') : screen);
    } else renderOutput({ text: 'Running…' }, undefined, script);
    return drain();
  }

  async function drain() {
    if (running || !pending) return;
    running = true;
    try {
      while (pending) {
        const { source, item, automatic, script, id } = pending;
        pending = null;
        const publish = (value, options) => id === execution ? renderOutput(value, options, script) : element('div');
        try {
          const result = await run(source, { preview, full: !automatic && $('[data-full]').checked, item, renderOutput: publish, automatic });
          if (result) publish(result);
        } catch (error) {
          publish({ text: error.message }, { title: '/dev/stderr' });
          if (!automatic && id === execution) report(error);
        }
      }
    } finally { running = false; }
  }

  function changed(focus = null) {
    setStatus('');
    writeDraft(cells, editing);
    show('grid');
    if (focus !== null) screen.querySelector(`[data-cell="${focus}"]`)?.focus({ preventScroll: true });
    execute(gridSource(cells), undefined, { automatic: true, script: true });
  }
  function validTile(command) {
    try {
      const tokens = tokenize(command);
      if (tokens[0]?.word && !tokens.some(part => part === ';' || part === '|')) return true;
      setStatus('Use one command per square. The grid adds the pipes and newlines.');
    } catch (error) { setStatus(error.message); }
    return false;
  }
  function removeTile(index) {
    delete cells[index]; selected = null; changed(index);
  }
  function place(command, at = selected, from, focus = true) {
    if (!validTile(command)) return;
    if (at == null || (!Object.keys(cells).length && from == null)) {
      at = Array.from({ length: gridSize }, (_, index) => index).find(index => !cells[index]);
    }
    if (at == null) { setStatus('This grid is full. Remove a tile first.'); return; }
    if (from === at) return;
    if (from != null) {
      if (cells[at]) cells[from] = cells[at];
      else delete cells[from];
    } else if (cells[at]) {
      setStatus('That square is occupied. Drop on an empty square, or move its tile first.');
      return;
    }
    cells[at] = command;
    selected = null;
    changed(focus ? at : null);
  }
  function editGrid(next, file) {
    cells = { ...next }; editing = file; selected = null;
    changed();
  }

  // A vertical pull off the shelf moves a tile. Swipes elsewhere scroll the
  // catalog, and squares already in the script can move in any direction.
  function draggable(tile, payload) {
    let drag, ghost, suppress = false;
    tile.oncontextmenu = event => event.preventDefault();
    tile.onpointerdown = event => {
      if (!event.isPrimary || event.button !== 0) return;
      suppress = false;
      drag = { x: event.clientX, y: event.clientY, pointer: event.pointerId, lastY: event.clientY, scroll: false };
      tile.setPointerCapture(event.pointerId);
    };
    tile.onpointermove = event => {
      if (!drag || event.pointerId !== drag.pointer) return;
      const dy = event.clientY - drag.y;
      const dx = event.clientX - drag.x;
      const sideBySide = preview.getBoundingClientRect().right <= shelf.getBoundingClientRect().left;
      if (!ghost && !drag.scroll && payload.index == null && event.pointerType === 'touch' && dy > 10) drag.scroll = true;
      if (drag.scroll) {
        suppress = true;
        shelf.scrollTop += drag.lastY - event.clientY;
        drag.lastY = event.clientY;
        return;
      }
      if (!ghost && (payload.index != null ? Math.hypot(dx, dy) > 7 : sideBySide ? dx < -10 : dy < -10)) {
        suppress = true;
        ghost = element('span', payload.label, 'initial-drag-tile');
        shell.append(ghost);
        preview.classList.add('accepting-tile');
      }
      if (ghost) {
        if (event.pointerType === 'touch' && payload.index == null && event.clientY >= shelf.getBoundingClientRect().top) {
          shelf.scrollTop += drag.lastY - event.clientY;
        }
        drag.lastY = event.clientY;
        ghost.style.left = event.clientX + 'px';
        ghost.style.top = event.clientY + 'px';
      }
    };
    function finish(event, drop) {
      if (!drag) return;
      drag = null;
      if (!ghost) return;
      ghost.remove(); ghost = null;
      preview.classList.remove('accepting-tile');
      if (!drop) return;
      const target = document.elementFromPoint(event.clientX, event.clientY);
      if (preview.contains(target)) {
        const cell = target.closest('[data-cell]');
        place(payload.command, cell ? Number(cell.dataset.cell) : null, payload.index, event.pointerType !== 'touch');
      } else if (payload.index != null && shelf.contains(target)) removeTile(payload.index);
    }
    tile.onpointerup = event => finish(event, true);
    tile.onpointercancel = event => finish(event, false);
    tile.onlostpointercapture = event => finish(event, false);
    tile.addEventListener('click', event => {
      if (suppress && event.detail) { event.preventDefault(); event.stopImmediatePropagation(); }
      suppress = false;
    }, true);
  }
  renderCatalog(); show('output');
  return { shell, execute, renderCatalog, editGrid, select(kind) { category = kind; search.value = ''; renderCatalog(); }, focus: () => $('[data-screen="output"]').focus() };
}
