const assert = require('node:assert/strict');
const path = require('node:path');

exports.pdf = async function ({ page, artifacts }) {
  const scroller = page.locator('.viewer-pdf .pdf-pages');
  const zoom = page.getByLabel('PDF zoom');
  await page.waitForFunction(() => document.querySelector('.pdf-page canvas')?.height > 0);
  assert.equal(await page.locator('.pdf-page').count(), 8);
  assert.ok(await scroller.evaluate(el => el.scrollHeight > el.clientHeight));

  const titlebar = page.locator('.titlebar');
  const titlebarHeight = await titlebar.evaluate(el => el.getBoundingClientRect().height * devicePixelRatio);
  const ctrlWheel = async delta => {
    await page.keyboard.down('Control');
    try { await page.mouse.wheel(0, delta); }
    finally { await page.keyboard.up('Control'); }
  };
  await titlebar.hover();
  await ctrlWheel(-120);
  await page.waitForFunction(height => document.querySelector('.titlebar').getBoundingClientRect().height * devicePixelRatio > height * 1.05, titlebarHeight);
  assert.equal(await zoom.inputValue(), '1');
  await titlebar.hover();
  await ctrlWheel(120);
  await page.waitForFunction(height => Math.abs(document.querySelector('.titlebar').getBoundingClientRect().height * devicePixelRatio - height) < 1, titlebarHeight);

  await scroller.evaluate(el => { el.scrollTop = 60; });
  const firstPage = page.locator('.pdf-page[data-page="1"] .pdf-page-image');
  const beforeWheel = await firstPage.boundingBox();
  const viewport = await scroller.boundingBox();
  const pointerY = viewport.y + 100;
  await page.mouse.move(viewport.x + viewport.width / 2, pointerY);
  await ctrlWheel(-120);
  await page.waitForFunction(() => document.querySelector('[aria-label="PDF zoom"]').value === '1.1');
  const afterWheel = await firstPage.boundingBox();
  assert.ok(afterWheel.width > beforeWheel.width * 1.05, 'Ctrl+wheel enlarged the PDF');
  const anchoredY = afterWheel.y + (pointerY - beforeWheel.y) * (afterWheel.height / beforeWheel.height);
  assert.ok(Math.abs(pointerY - anchoredY) < 3, 'The PDF stayed anchored under the pointer');
  assert.equal(await titlebar.evaluate(el => el.getBoundingClientRect().height * devicePixelRatio), titlebarHeight);
  await ctrlWheel(120);
  await page.waitForFunction(() => document.querySelector('[aria-label="PDF zoom"]').value === '1');

  await scroller.hover(); await page.mouse.wheel(0, 1700);
  await page.waitForFunction(() => Number(document.querySelector('[aria-label="PDF page"]').value) > 1);
  assert.equal(await zoom.inputValue(), '1');
  const current = await page.locator('[aria-label="PDF page"]').inputValue();
  await page.waitForFunction(number => document.querySelector(`.pdf-page[data-page="${number}"] canvas`), current);
  await page.locator('[aria-label="PDF page"]').fill('8'); await page.locator('[aria-label="PDF page"]').press('Enter');
  await page.waitForFunction(() => document.querySelector('.pdf-page[data-page="8"] pre')?.textContent.includes('page 8'));
  assert.equal(await page.locator('[aria-label="Next PDF page"]').isDisabled(), true);
  assert.ok(await page.locator('.pdf-page canvas').count() < 8, 'Distant canvases are released');
  const before = await page.locator('.pdf-page[data-page="8"]').evaluate(el => el.getBoundingClientRect().width);
  await page.locator('[aria-label="PDF zoom"]').selectOption('2');
  await page.waitForFunction(width => document.querySelector('.pdf-page[data-page="8"]').getBoundingClientRect().width > width * 1.9, before);
  await page.locator('[aria-label="Previous PDF page"]').click();
  await page.waitForFunction(() => document.querySelector('[aria-label="PDF page"]').value === '7');
  await page.locator('[aria-label="PDF zoom"]').selectOption('1');
  await page.waitForFunction(() => document.querySelector('.pdf-page[data-page="7"] canvas'));
  await page.screenshot({ path: path.join(artifacts, 'scrolling-pdf.png') });
};

exports.moves = async function ({ page, directory, artifacts, touch = false }) {
  const root = directory.replace(/\/$/, '') + '/drag-test', source = root + '/source', destination = root + '/destination';
  const movedNote = directory.replace(/\/$/, '') + '/source/child/nested.txt';
  await page.evaluate(async ({ root, source, destination }) => {
    for (const filename of [root, source, destination, source + '/child']) await window.yhwh.call('file:create', filename, true);
    for (const [filename, text] of [[source + '/note.md', 'Original\n'], [source + '/two.txt', 'Second'], [source + '/child/nested.txt', 'Nested'], [destination + '/two.txt', 'Do not overwrite']]) {
      await window.yhwh.call('file:create', filename); await window.yhwh.call('file:save', filename, text, null);
    }
    await window.YHWH.openFile(source + '/note.md');
    window.YHWH.active().config.values.autosave = 'false';
    const editor = window.YHWH.active().editor;
    editor.dispatch({ changes: { from: editor.state.doc.length, insert: 'Unsaved edit' }, selection: { anchor: 3 } });
    await window.YHWH.navigate(root); window.YHWH.active().config.values.autosave = 'false';
    if (!window.YHWH.active().showFiles) await window.YHWH.run('toggle-files');
  }, { root, source, destination });
  const row = filename => page.locator('#file-list [data-path]').filter({ has: page.locator('.file-name', { hasText: new RegExp('^' + filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }) });
  // Expand the source to make nested rows available without entering it.
  if (touch) await row('source').locator('[data-expand-folder]').tap();
  else await row('source').click();
  await row('note.md').waitFor();
  let cdp;
  if (touch) cdp = await page.context().newCDPSession(page);
  async function drag(from, to) {
    if (!touch) return from.dragTo(to);
    const a = await from.boundingBox(), b = await to.boundingBox();
    const point = box => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(a)] });
    await page.waitForFunction(() => document.querySelector('#file-list.dragging-files'));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(b)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  const exists = filename => page.evaluate(async filename => { try { await window.yhwh.call('path:stat', filename); return true; } catch { return false; } }, filename);
  await drag(row('note.md'), row('destination'));
  await page.waitForFunction(filename => window.YHWH.active().file.path === filename, destination + '/note.md');
  await page.waitForFunction(() => document.querySelector('#file-list [data-path$="/source/two.txt"]'));
  assert.equal(await exists(source + '/note.md'), false);
  assert.equal(await page.evaluate(() => window.YHWH.active().editor.state.doc.toString()), 'Original\nUnsaved edit');
  assert.equal(await page.evaluate(() => window.YHWH.active().editor.state.selection.main.head), 3);
  await page.evaluate(() => window.YHWH.run('save'));
  assert.equal(await page.evaluate(async filename => (await window.yhwh.call('file:read', filename)).content, destination + '/note.md'), 'Original\nUnsaved edit');
  await drag(row('two.txt').first(), row('destination'));
  await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('already exists'));
  assert.equal(await exists(source + '/two.txt'), true);
  assert.equal(await page.evaluate(async filename => (await window.yhwh.call('file:read', filename)).content, destination + '/two.txt'), 'Do not overwrite');
  // A folder dropped onto its descendant is rejected without moving anything.
  await drag(row('source'), row('child'));
  assert.equal(await exists(source + '/child/nested.txt'), true);
  await drag(row('source'), row('destination'));
  await page.waitForFunction(async filename => { try { await window.yhwh.call('path:stat', filename); return true; } catch { return false; } }, destination + '/source/child/nested.txt');
  await row('source').waitFor({ state: 'detached' });
  // Follow a folder move from another tab whose cwd and dirty buffer are inside
  // it. Selecting both that folder and its child must move the folder once.
  const originalId = await page.evaluate(() => window.YHWH.active().id);
  const secondId = await page.evaluate(async filename => {
    await window.YHWH.newTab(); await window.YHWH.openFile(filename);
    const tab = window.YHWH.active(); tab.config.values.autosave = 'false';
    tab.editor.dispatch({ changes: { from: tab.editor.state.doc.length, insert: ' draft' } });
    return tab.id;
  }, destination + '/source/child/nested.txt');
  await page.evaluate(id => document.querySelector(`#tabs [data-tab="${id}"]`).click(), originalId);
  if (touch) await row('destination').locator('[data-expand-folder]').tap();
  else await row('destination').click();
  await row('source').waitFor();
  await page.evaluate(source => { window.YHWH.active().selected = new Set([source, source + '/child']); }, destination + '/source');
  await drag(row('source'), page.locator('#file-list [data-parent="true"]'));
  await page.waitForFunction(({ id, filename }) => {
    const tab = window.YHWH.tabs.find(tab => tab.id === id);
    return tab.file.path === filename && tab.cwd === filename.slice(0, filename.lastIndexOf('/'));
  }, { id: secondId, filename: movedNote });
  await page.evaluate(id => document.querySelector(`#tabs [data-tab="${id}"]`).click(), secondId);
  assert.equal(await page.evaluate(() => window.YHWH.active().editor.state.doc.toString()), 'Nested draft');
  await page.evaluate(() => window.YHWH.run('save'));
  assert.equal(await page.evaluate(async filename => (await window.yhwh.call('file:read', filename)).content, movedNote), 'Nested draft');
  await page.evaluate(() => window.YHWH.run('close-tab'));
  await page.evaluate(id => document.querySelector(`#tabs [data-tab="${id}"]`).click(), originalId);
  await drag(row('note.md'), page.locator('#file-list'));
  await page.waitForFunction(filename => window.YHWH.active().file.path === filename, root + '/note.md');
  assert.equal(await exists(destination + '/note.md'), false);
  await page.screenshot({ path: path.join(artifacts, 'file-drag.png') });
  await cdp?.detach();
  await page.evaluate(directory => window.YHWH.navigate(directory), directory);
};
