const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = async function ({ app, page, run, open, directory, artifacts }) {
  const copied = async expected => {
    for (let i = 0; i < 80; i++) {
      if (await app.evaluate(({ clipboard }) => clipboard.readText()) === expected) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), expected);
  };
  const fixtures = require('./viewer-fixtures.cjs')();
  for (const [name, bytes] of Object.entries(fixtures)) await fs.writeFile(path.join(directory, name), bytes);
  await run('new-tab');
  const owner = await page.evaluate(() => window.YHWH.active().id);
  const note = path.join(directory, 'autosave.md'); await fs.writeFile(note, '# Autosave\r\n\r\nOriginal.\r\n'); await open(note);
  assert.equal(await page.evaluate(() => window.YHWH.active().config.values.autosave), 'true');
  const cursor = await page.evaluate(() => {
    const editor = window.YHWH.active().editor;
    editor.dispatch({ selection: { anchor: 5 }, changes: { from: editor.state.doc.length, insert: '\nAuto saved.' } });
    return editor.state.selection.main.head;
  });
  await page.waitForFunction(() => !window.YHWH.active().dirty);
  assert.match(await fs.readFile(note, 'utf8'), /\r\nAuto saved\./);
  await run('view-mode'); await run('view-mode');
  assert.equal(await page.evaluate(() => window.YHWH.active().editor.state.selection.main.head), cursor);
  assert.equal(await page.evaluate(() => window.YHWH.active().file.mode), 'source');
  // Preserve even an external write with the same size and timestamp.
  const stat = await fs.stat(note), original = await fs.readFile(note, 'utf8');
  const external = original.replace('Original', 'External'); await fs.writeFile(note, external); await fs.utimes(note, stat.atime, stat.mtime);
  await page.evaluate(() => { const e = window.YHWH.active().editor; e.dispatch({ changes: { from: e.state.doc.length, insert: ' My edit' } }); });
  await page.waitForFunction(() => !!window.YHWH.active().autosaveError);
  assert.equal(await fs.readFile(note, 'utf8'), external);
  assert.equal(await page.evaluate(() => window.YHWH.active().dirty), true);
  const reloading = run('reload-file'); await page.locator('[data-choice="1"]').click(); await reloading;
  await page.waitForFunction(() => !window.YHWH.active().dirty);
  // Delegate attachments without replacing an editor or asking about its buffer.
  await app.evaluate(({ shell }) => {
    globalThis.realOpenPath = shell.openPath; globalThis.openedFiles = [];
    shell.openPath = async filename => { globalThis.openedFiles.push(filename); return ''; };
  });
  const currentFile = await page.evaluate(() => {
    const tab = window.YHWH.active(); tab.config.values.autosave = 'false';
    tab.editor.dispatch({ changes: { from: tab.editor.state.doc.length, insert: ' Preserve this draft.' } });
    return tab.file.path;
  });
  for (const name of ['preview.xlsx', 'preview.xls', 'preview.ods', 'preview.csv', 'preview.tsv', 'preview.svg', 'preview.webm', 'preview.wav']) {
    await open(path.join(directory, name));
    assert.equal(await app.evaluate(() => globalThis.openedFiles.at(-1)), path.join(directory, name));
    assert.equal(await page.evaluate(() => window.YHWH.active().file.path), currentFile);
    assert.equal(await page.evaluate(() => window.YHWH.active().dirty), true);
  }
  // A failed system opener reports its real error and retains the document.
  await app.evaluate(({ shell }) => { shell.openPath = async () => 'No application is associated with this file'; });
  await assert.rejects(open(path.join(directory, 'preview.xlsx')), /No application is associated/);
  await app.evaluate(({ shell }) => { shell.openPath = async filename => { globalThis.openedFiles.push(filename); return ''; }; });
  await page.evaluate(() => { window.YHWH.active().config.values.autosave = 'true'; });
  // Replacing a recently edited document flushes autosave without prompting.
  const openingPDF = open(path.join(directory, 'preview.pdf'));
  await page.locator('[name="remember-pdf"]').check();
  await page.locator('[data-pdf="preview"]').click(); await openingPDF;
  assert.equal(await page.evaluate(() => window.YHWH.active().config.values.pdf_open), 'preview');
  assert.match(await fs.readFile(note, 'utf8'), /Preserve this draft/);
  await open(path.join(directory, 'preview.pdf'));
  await page.waitForFunction(() => document.querySelector('.viewer-pdf details pre')?.textContent.includes('YHWH PDF preview'));
  await page.screenshot({ path: path.join(artifacts, '13-pdf-viewer.png') });
  await open(path.join(directory, 'scroll.pdf'));
  await require('./interface-improvements-2.cjs').pdf({ page, artifacts });
  await require('./interface-improvements-2.cjs').moves({ page, directory, artifacts });
  await page.evaluate(directory => window.YHWH.navigate(directory), directory);
  const pdfRow = page.locator('#file-list [data-path$="/preview.pdf"]');
  await pdfRow.click(); await page.waitForFunction(() => window.YHWH.active().file.name === 'preview.pdf');
  await pdfRow.dblclick();
  assert.equal(await app.evaluate(() => globalThis.openedFiles.at(-1)), path.join(directory, 'preview.pdf'));
  await pdfRow.click({ modifiers: ['Control'] });
  assert.equal(await app.evaluate(() => globalThis.openedFiles.at(-1)), path.join(directory, 'preview.pdf'));
  await app.evaluate(({ shell }) => { shell.openPath = globalThis.realOpenPath; });
  // Copy paths through the actual right-click menu, including a nested file.
  const nested = path.join(directory, 'nested', 'child.txt');
  await page.evaluate(async filename => { const app = window.YHWH; app.active().selected = new Set([filename]); }, nested);
  await page.locator('#file-list [data-path$="/nested"]').click({ button: 'right' });
  await page.locator('#dialog [data-menu]', { hasText: 'Copy Full Path' }).click();
  await page.waitForFunction(() => !document.querySelector('#dialog').open);
  await copied(path.join(directory, 'nested'));
  await page.locator('#file-list [data-path$="/nested"]').click({ button: 'right' });
  await page.locator('#dialog [data-menu]', { hasText: 'Copy Relative Path' }).click();
  await page.waitForFunction(() => !document.querySelector('#dialog').open);
  await copied('nested');
  const disposable = path.join(directory, 'trash-me.txt'); await fs.writeFile(disposable, 'Recoverable');
  // Isolate desktop trash integration while exercising confirmation and UI refresh.
  await app.evaluate(({ shell }) => {
    globalThis.realTrash = shell.trashItem;
    shell.trashItem = async filename => { await process.getBuiltinModule('fs/promises').rename(filename, filename + '.trashed'); };
  });
  await page.evaluate(() => window.YHWH.refresh());
  await page.locator('#file-list [data-path$="/trash-me.txt"]').click({ button: 'right' });
  await page.locator('#dialog [data-menu]', { hasText: 'Move to Trash' }).click();
  await page.locator('#dialog [data-choice="0"]').waitFor();
  assert.equal(await fs.readFile(disposable, 'utf8'), 'Recoverable');
  await page.locator('#dialog [data-choice="0"]').click();
  await page.locator('#file-list [data-path$="/trash-me.txt"]').waitFor({ state: 'detached' });
  assert.equal(await fs.readFile(disposable + '.trashed', 'utf8'), 'Recoverable');
  await app.evaluate(({ shell }) => { shell.trashItem = globalThis.realTrash; });
  // The alternate shortcut toggles the one shell; app-tab navigation stays global.
  assert.equal(await page.locator('#terminal-tabs').count(), 0);
  const originalShell = await page.evaluate(() => window.YHWH.active().terminalId);
  await page.keyboard.press('Control+Shift+Backquote');
  await page.waitForFunction(() => document.activeElement === window.YHWH.active().terminal.textarea);
  assert.equal(await page.evaluate(() => window.YHWH.active().terminals.length), 1);
  assert.equal(await page.evaluate(() => window.YHWH.active().terminalId), originalShell);
  await page.keyboard.type("printf 'OWNER:%s\\n' \"$YHWH_TAB\""); await page.keyboard.press('Enter');
  await page.waitForFunction(owner => { const t = window.YHWH.active().terminal; for (let i = 0; i < t.buffer.active.length; i++) if (t.buffer.active.getLine(i)?.translateToString().trim() === `OWNER:${owner}`) return true; return false; }, owner);
  await page.keyboard.press('Control+Shift+Backquote');
  await page.locator('#terminal-panel').waitFor({ state: 'hidden' });
  await page.keyboard.press('Control+Shift+Backquote');
  await page.waitForFunction(() => document.activeElement === window.YHWH.active().terminal.textarea);
  assert.equal(await page.evaluate(() => window.YHWH.active().terminalId), originalShell);
  await assert.rejects(page.evaluate(() => window.yhwh.call('terminal:open', window.YHWH.active().id, crypto.randomUUID())), /already has a shell/);
  await page.keyboard.type('alias x=exit'); await page.keyboard.press('Enter'); await page.keyboard.type('x'); await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.YHWH.active().terminals.length === 0 && document.querySelector('#terminal-panel').hidden);
  await run('focus-terminal');
  await page.waitForFunction(() => window.YHWH.active().terminals.length === 1 && document.activeElement === window.YHWH.active().terminal.textarea);
  await page.keyboard.type("printf 'REOPENED\\n'"); await page.keyboard.press('Enter');
  await page.waitForFunction(() => { const t = window.YHWH.active().terminal; for (let i = 0; i < t.buffer.active.length; i++) if (t.buffer.active.getLine(i)?.translateToString().trim() === 'REOPENED') return true; return false; });
  await run('close-tab');
  console.log('✓ autosave/conflicts, stable Markdown cursor, system file apps, PDF preference/gestures, copy paths, trash and single-shell exit/reopen');
};
