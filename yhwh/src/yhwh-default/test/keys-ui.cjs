// Run with bin/default/headless.cjs, or on an existing desktop display.
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
(async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'yhwh-key-ui-'));
  const config = path.join(temp, 'prefix'), directory = path.join(temp, 'files');
  await fs.mkdir(directory); await fs.mkdir(path.join(config, 'etc/keys/alt/ctrl'), { recursive: true });
  await fs.writeFile(path.join(config, 'rc'), '/\n    autosave=false\n', { mode: 0o600 });
  const outputFile = path.join(directory, 'from-executable');
  await fs.writeFile(path.join(config, 'etc/keys/alt/ctrl/u'), '#!/bin/sh\ncat > from-executable\nprintf "%s\\n" "$YHWH_KEY"\n', { mode: 0o755 });
  const variant = process.env.YHWH_TEST_INTERFACE === 'three' ? 'three' : 'default';
  const env = { ...process.env, YHWH_CONFIG_HOME: config, YHWH_SYSTEM_CONFIG: path.join(temp, 'system'), YHWH_DATA_DIR: path.join(temp, 'profile'), YHWH_THREE_DATA_DIR: path.join(temp, 'profile-three'), YHWH_SHELL: require('node:child_process').execFileSync('which', ['bash'], { encoding: 'utf8' }).trim(), YHWH_NODE: process.execPath, YHWH_NO_SHELL_RC: '1', HISTFILE: '/dev/null' };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    app = await electron.launch({ executablePath: require('../../../lib/electron.cjs')(), args: [path.resolve(__dirname, `../../yhwh-${variant}`), '--disable-gpu', '--cwd', directory], env });
    const page = await app.firstWindow(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => window.YHWH?.active());
    const run = id => page.evaluate(id => window.YHWH.run(id), id);
    await page.locator('#location').focus(); await page.keyboard.press('Control+a'); await page.keyboard.press('Delete');
    assert.equal(await page.locator('#location').inputValue(), '');
    assert.equal(await page.locator('#dialog').isVisible(), false);
    await page.locator('#location').fill(directory);
    await page.keyboard.press('Control+Shift+b');
    await page.waitForFunction(() => window.YHWH.active().expanded === 'terminal');
    assert.equal(await page.locator('#files').isVisible(), true);
    assert.equal(await page.locator('#terminal-panel').isVisible(), true);
    await page.waitForFunction(() => document.activeElement === window.YHWH.active().terminal.textarea);
    // Readline: type abc, move to the beginning, Ctrl+E, append d. No app toggle.
    await page.keyboard.type("printf 'KEYS_READY\\n'"); await page.keyboard.press('Enter');
    await page.waitForFunction(() => { const buffer = window.YHWH.active().terminal.buffer.active; for (let i = 0; i < buffer.length; i++) if (buffer.getLine(i)?.translateToString().trim() === 'KEYS_READY') return true; return false; });
    await page.keyboard.type("printf 'READLINE:%s\\n' abc");
    await page.keyboard.press('Control+a'); await page.keyboard.press('Control+e');
    await page.keyboard.type('d'); await page.keyboard.press('Enter');
    await page.waitForFunction(() => {
      const buffer = window.YHWH.active().terminal.buffer.active;
      for (let i = 0; i < buffer.length; i++) if (buffer.getLine(i)?.translateToString().trim() === 'READLINE:abcd') return true;
      return false;
    });
    assert.equal(await page.locator('#files').isVisible(), true);
    await page.keyboard.press('Control+Shift+b');
    // Both terminal shortcuts reuse one shell; app-tab commands stay global.
    const originalTerminal = await page.evaluate(() => window.YHWH.active().terminalId);
    await page.keyboard.press('Control+Shift+Backquote');
    await page.locator('#terminal-panel').waitFor({ state: 'hidden' });
    await page.keyboard.press('Control+Shift+Backquote');
    await page.waitForFunction(() => document.activeElement === window.YHWH.active().terminal.textarea);
    assert.equal(await page.evaluate(() => window.YHWH.active().terminals.length), 1);
    assert.equal(await page.evaluate(() => window.YHWH.active().terminalId), originalTerminal);
    assert.equal(await page.locator('#terminal-tabs').count(), 0);
    assert.equal(await page.evaluate(() => window.YHWH.tabs.length), 1);
    const first = await page.evaluate(() => window.YHWH.active().id);
    await page.keyboard.press('Control+t'); await page.waitForFunction(() => window.YHWH.tabs.length === 2);
    const second = await page.evaluate(() => window.YHWH.active().id);
    await page.keyboard.press('Control+t'); await page.waitForFunction(() => window.YHWH.tabs.length === 3);
    const third = await page.evaluate(() => window.YHWH.active().id);
    await page.keyboard.press('Control+1'); await page.waitForFunction(id => window.YHWH.active().id === id, first);
    await run('focus-terminal'); await page.waitForFunction(() => document.activeElement === window.YHWH.active().terminal.textarea);
    await page.keyboard.press('Control+Tab'); await page.waitForFunction(id => window.YHWH.active().id === id, second);
    await page.keyboard.press('Control+Shift+Tab'); await page.waitForFunction(id => window.YHWH.active().id === id, first);
    await page.keyboard.press('Control+9'); await page.waitForFunction(id => window.YHWH.active().id === id, third);
    await page.keyboard.press('Control+Shift+PageUp');
    await page.waitForFunction(id => window.YHWH.tabs[1].id === id, third);
    await page.keyboard.press('Control+Tab'); await page.waitForFunction(id => window.YHWH.active().id === id, second);
    await page.keyboard.press('Control+Shift+Tab'); await page.waitForFunction(id => window.YHWH.active().id === id, third);
    await page.keyboard.press('Control+w'); await page.waitForFunction(() => window.YHWH.tabs.length === 2);
    await page.keyboard.press('Control+Shift+t'); await page.waitForFunction(() => window.YHWH.tabs.length === 3);
    const current = await page.evaluate(() => window.YHWH.active().id);
    await page.locator(`#tabs [data-tab="${first}"]`).click({ button: 'middle' });
    await page.waitForFunction(() => window.YHWH.tabs.length === 2);
    assert.equal(await page.evaluate(() => window.YHWH.active().id), current);

    await page.keyboard.press('Control+Alt+Shift+k');
    await page.locator('[data-capture]').waitFor();
    await page.keyboard.press('Control+b');
    await page.waitForFunction(() => document.querySelector('.key-results')?.textContent.includes('Toggle terminal'));
    await page.locator('[data-advanced]').click(); await page.locator('[data-query]').fill('ctrl');
    assert.ok(await page.locator('.key-row').count() > 20);
    await page.locator('[data-query]').fill('grep ctrl | grep -v alt'); await page.locator('[data-shell]').click();
    await page.waitForFunction(() => document.querySelector('[data-output]')?.textContent.includes('ctrl/t'));
    assert.doesNotMatch(await page.locator('[data-output]').textContent(), /ctrl\/alt/);
    await page.locator('[data-query]').fill('cd alt/ctrl'); await page.locator('[data-shell]').click();
    await page.waitForFunction(() => document.querySelector('[data-namespace]').textContent === '/ctrl/alt');
    assert.match(await page.locator('[data-output]').textContent(), /ctrl\/alt\/shift\/k/);
    await page.locator('[data-close]').click();
    await page.keyboard.press('Control+Alt+u');
    await page.waitForFunction(() => document.querySelector('#dialog[open] h2')?.textContent === 'Key command · ctrl/alt/u'
      && document.querySelector('.key-output')?.textContent.trim() === 'ctrl/alt/u');
    assert.match(await fs.readFile(outputFile, 'utf8'), /^cwd\t/m);
    await page.locator('[data-close]').click();

    // External module changes are live after a reload, preserving an unsaved buffer.
    const filename = path.join(directory, 'draft.md'); await fs.writeFile(filename, 'original');
    await page.evaluate(filename => window.YHWH.openFile(filename), filename);
    await page.evaluate(() => window.YHWH.getEditor().dispatch({ changes: { from: 0, insert: 'unsaved ' } }));
    const modulePath = path.join(config, 'etc/keys/ctrl/alt/j.js');
    await fs.mkdir(path.dirname(modulePath), { recursive: true });
    await fs.writeFile(modulePath, "export default api => api.notice('External module loaded');\n");
    await run('reload-keys'); await page.keyboard.press('Control+Alt+j');
    await page.waitForFunction(() => document.querySelector('#toast').textContent === 'External module loaded');
    assert.equal(await page.evaluate(() => window.YHWH.getEditor().state.doc.toString()), 'unsaved original');
    const artifacts = require('../../../lib/paths.cjs').output(variant, 'screenshots'); await fs.mkdir(artifacts, { recursive: true });
    await run('hotkeys'); await page.locator('[data-advanced]').click(); await page.locator('[data-query]').fill('ctrl');
    await page.screenshot({ path: path.join(artifacts, 'keys-advanced.png') });
    await page.locator('[data-close]').click();

    const background = await page.evaluate(() => window.YHWH.tabs.find(tab => tab !== window.YHWH.active()).id);
    await page.locator(`#tabs [data-close-tab="${background}"]`).click();
    await page.waitForFunction(() => window.YHWH.tabs.length === 1);
    await page.keyboard.press('Control+w');
    await page.locator('#dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(await page.evaluate(() => window.YHWH.getEditor().state.doc.toString()), 'unsaved original');
    await page.keyboard.press('Control+w');
    await page.locator('#dialog').getByRole('button', { name: 'Discard', exact: true }).click();
    await page.locator('.welcome:visible').waitFor();
    assert.equal(await page.locator('#tabs [data-tab]').count(), 1);
    assert.equal(await page.locator(`#tabs [data-tab="${current}"]`).count(), 0);
    assert.equal(await fs.readFile(filename, 'utf8'), 'original');
    const home = await page.evaluate(() => window.YHWH.active().id);

    await page.keyboard.press('Control+Shift+t');
    await page.waitForFunction(() => window.YHWH.getEditor()?.state.doc.toString() === 'original');
    await page.locator(`#tabs [data-close-tab="${home}"]`).click();
    await page.waitForFunction(() => window.YHWH.tabs.length === 1);
    const reopened = await page.evaluate(() => window.YHWH.active().id);
    await page.locator(`#tabs [data-close-tab="${reopened}"]`).click();
    await page.locator('.welcome:visible').waitFor();
    assert.equal(await page.locator(`#tabs [data-tab="${reopened}"]`).count(), 0);
    assert.deepEqual(errors, []);
    console.log('✓ terminal Ctrl+E and vertical expansion; tab shortcuts and last-tab welcome screen; capture, filters, pipelines, namespaces, executable/module reloads');
  } finally { if (app) await app.close(); await fs.rm(temp, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
