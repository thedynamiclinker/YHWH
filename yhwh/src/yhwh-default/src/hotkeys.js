import { fromEvent, filter } from '../../../lib/key-names.cjs';

export function showHotkeys({ modal, active, call, refresh, commands, escape, notice, openFile, newTab, mobile }) {
  let combo = '', advanced = false, directory = '', bindings = active().config.keys?.bindings || [];
  const dialog = modal('Keyboard bindings', `
    <div class="hotkeys">
      <div class="key-modes" role="group" aria-label="Search mode"><button data-normal aria-pressed="true">Normal</button><button data-advanced aria-pressed="false">Advanced</button><button data-reload>Reload keys</button></div>
      <label class="field key-normal"><span>Press a keyboard combination</span><input data-capture readonly placeholder="Click here, then press the keys" aria-label="Press a keyboard combination"><small>Escape stops recording. The combination is shown without running it.</small></label>
      <form class="key-advanced" hidden><label class="field"><span>Text, wildcard, /regex/, or shell command</span><input data-query spellcheck="false" placeholder="ctrl · ctrl/*/k · /ctrl.*shift/ · grep ctrl | grep -v alt" aria-label="Advanced key search"></label><div class="key-modes"><button type="button" data-filter>Filter</button><button data-shell>Run shell</button><code data-namespace>/</code></div><small>Shell commands receive the list on stdin and run in the current file directory. “cd ctrl/alt” browses the modifier namespace; “ls” lists it. Shell commands run only when submitted.</small></form>
      ${mobile ? '<p>Bundled bindings and search work here. Executables, shell pipelines and editable prefix files require desktop process APIs.</p>' : ''}
      <p class="key-status" role="status"></p><div class="key-results"></div>
      <pre class="key-output" data-output hidden></pre>
      <details class="key-edit"><summary>Bind the captured combination</summary><label class="field"><span>Interface command</span><select data-action>${[...commands.values()].map(command => `<option value="${escape(command.id)}">${escape(command.name)}</option>`).join('')}</select></label><label class="field"><span>When focused</span><select data-when><option value="">Any pane</option><option value="files">File list</option><option value="terminal">Terminal</option><option value="editor">Editor</option></select></label><div class="key-modes"><button data-bind>Bind</button><button data-disable>Disable</button><button data-reset>Use inherited binding</button></div><small>Edits are ordinary .js or empty files in your user prefix. Open a source below to write a module or replace it with an executable.</small></details>
      <details><summary>Configuration prefixes</summary><pre>${escape((active().config.keys?.directories || []).join('\n'))}</pre><pre>${escape((active().config.keys?.warnings || []).join('\n'))}</pre></details>
    </div>`);
  const capture = dialog.querySelector('[data-capture]'), query = dialog.querySelector('[data-query]'), status = dialog.querySelector('.key-status');
  const output = dialog.querySelector('[data-output]');
  const nsBindings = () => bindings.filter(binding => directory.split('/').filter(Boolean).every(part => binding.combo.split('/').includes(part)));
  function render(rows) {
    status.textContent = `${rows.length} binding${rows.length === 1 ? '' : 's'}${combo && !advanced ? ` for ${combo}` : ''}`;
    dialog.querySelector('.key-results').innerHTML = rows.map(binding => `<article class="key-row"><kbd>${escape(binding.combo.replaceAll('/', '+'))}</kbd><span><strong>${escape(commands.get(binding.command)?.name || binding.command || (binding.kind === 'disabled' ? 'Disabled' : binding.kind === 'exec' ? 'Executable' : 'Custom module'))}</strong><small>${escape(binding.kind)} · ${escape(binding.when || 'any focus')}</small><code>${escape(binding.filename || 'bundled')}</code></span>${binding.filename && !mobile ? `<button data-source="${escape(binding.filename)}">Open source</button>` : ''}</article>`).join('') || '<p>No binding. This combination passes through to the focused control.</p>';
    for (const button of dialog.querySelectorAll('[data-source]')) button.onclick = async () => { dialog.close(); try { await openFile(button.dataset.source, await newTab()); } catch (error) { notice(error.message); } };
    for (const row of dialog.querySelectorAll('.key-row')) {
      const binding = rows[[...row.parentElement.children].indexOf(row)];
      if (binding?.kind !== 'exec' || mobile) continue;
      const button = document.createElement('button'); button.textContent = '--help'; button.title = 'Run this executable with --help'; row.append(button);
      button.onclick = async () => { try { const result = await call('keys:run', active().id, binding.combo, '', true); output.hidden = false; output.textContent = (result.stdout || '') + (result.stderr || '') + (result.code ? `\nExit ${result.code}` : ''); } catch (error) { status.textContent = error.message; } };
    }
  }
  function search() {
    output.hidden = true;
    try { render(advanced ? filter(nsBindings(), query.value) : combo ? bindings.filter(binding => binding.combo === combo) : bindings); }
    catch (error) { status.textContent = `Search: ${error.message}. Use Run shell for a pipeline.`; }
  }
  function mode(value) {
    advanced = value;
    dialog.querySelector('.key-normal').hidden = value; dialog.querySelector('.key-advanced').hidden = !value;
    dialog.querySelector('[data-normal]').setAttribute('aria-pressed', String(!value)); dialog.querySelector('[data-advanced]').setAttribute('aria-pressed', String(value));
    search(); (value ? query : capture).focus();
  }
  capture.addEventListener('keydown', event => {
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.key === 'Escape') { capture.blur(); return; }
    const value = fromEvent(event);
    if (value) { combo = value; capture.value = combo.replaceAll('/', '+'); const binding = bindings.find(item => item.combo === combo); if (binding?.command && commands.has(binding.command)) dialog.querySelector('[data-action]').value = binding.command; dialog.querySelector('[data-when]').value = binding?.when || ''; search(); }
  });
  dialog.querySelector('[data-normal]').onclick = () => mode(false);
  dialog.querySelector('[data-advanced]').onclick = () => mode(true);
  query.oninput = search;
  dialog.querySelector('[data-filter]').onclick = search;
  dialog.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    try {
      const result = await call('keys:shell', active().id, query.value, directory);
      if (result.directory !== undefined) { directory = result.directory; dialog.querySelector('[data-namespace]').textContent = '/' + directory; }
      output.hidden = false; output.textContent = (result.stdout || '') + (result.stderr || '') + (result.code ? `\nExit ${result.code}` : '');
      status.textContent = 'Command finished.';
    } catch (error) { status.textContent = error.message; }
  };
  dialog.querySelector('[data-reload]').onclick = async () => { try { await call('config:reload'); await refresh(); bindings = active().config.keys?.bindings || []; search(); } catch (error) { status.textContent = error.message; } };
  for (const action of ['bind', 'disable', 'reset']) dialog.querySelector(`[data-${action}]`).onclick = async () => {
    if (!combo) { status.textContent = 'Capture a combination first.'; return; }
    try { await call('keys:save', active().id, combo, action, dialog.querySelector('[data-action]').value, bindings.find(binding => binding.combo === combo) || null, dialog.querySelector('[data-when]').value); await refresh(); bindings = active().config.keys.bindings; search(); }
    catch (error) { status.textContent = error.message; }
  };
  search(); capture.focus();
}
