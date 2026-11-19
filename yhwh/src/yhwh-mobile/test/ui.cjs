const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { output } = require('../../../lib/paths.cjs');
const ui = output('mobile/ui'), artifacts = output('mobile/screenshots');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.css': 'text/css', '.json': 'application/json', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
async function main() {
  await fs.mkdir(artifacts, { recursive: true });
  const metadata = JSON.parse(await fs.readFile(output('mobile/metafile.json'), 'utf8'));
  for (const name of ['src/yhwh-default/src/renderer.js', 'src/yhwh-default/src/editor.js', 'lib/verse-library.cjs', 'lib/file-type.cjs']) assert.ok(metadata.inputs[name], name);
  const server = http.createServer(async (request, response) => {
    try {
      const filename = path.resolve(ui, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname === '/' ? '/index.html' : new URL(request.url, 'http://localhost').pathname));
      if (!filename.startsWith(ui + path.sep)) { response.writeHead(403).end(); return; }
      const data = await fs.readFile(filename); response.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream' }); response.end(data);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let executablePath = process.env.YHWH_CHROMIUM;
  if (!executablePath) {
    try { await fs.access(chromium.executablePath()); }
    catch { for (const name of ['google-chrome', 'chromium', 'chromium-browser']) { try { executablePath = execFileSync('which', [name], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); break; } catch {} } }
  }
  let browser;
  try {
    browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    for (const device of [
      { name: 'android-phone', width: 412, height: 915 },
      { name: 'iphone', width: 390, height: 844 },
      { name: 'ipad', width: 1024, height: 1366 },
    ]) {
      const context = await browser.newContext({ viewport: { width: device.width, height: device.height }, isMobile: true, hasTouch: true });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const url = `http://127.0.0.1:${server.address().port}`;
      await page.goto(url);
      await page.waitForFunction(() => window.YHWH?.commands.has('mobile-tabs'));
      assert.equal(await page.locator('#mobile-nav').isVisible(), true);
      assert.equal(await page.locator('#navigation-area').isVisible(), false);
      await page.screenshot({ path: path.join(artifacts, `${device.name}-welcome.png`) });
      // Drive the real system file input, then open with a touch tap.
      await page.locator('#mobile-nav [data-command="mobile-create"]').tap();
      const chooser = page.waitForEvent('filechooser');
      await page.locator('#mobile-dialog button', { hasText: 'Import files' }).tap();
      await (await chooser).setFiles([{ name: 'notes.md', mimeType: 'text/markdown', buffer: Buffer.from('# A mobile note\n\nShared **Markdown**.\n\n[[other|Another note]]\n') }]);
      await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('Imported 1'));
      await page.locator('#mobile-nav [data-command="toggle-files"]').tap();
      await page.evaluate(() => window.yhwh.call('file:create', '/YHWH/Empty folder', true));
      await page.locator('#file-list [data-path="/YHWH/Empty folder"]').tap();
      await page.waitForFunction(() => window.YHWH.active().cwd === '/YHWH/Empty folder');
      const parentRow = page.locator('#file-list > .file-row').first();
      assert.equal(await parentRow.locator('.file-name').textContent(), '..');
      assert.equal(await page.locator('#files [data-command="parent"]').count(), 0);
      await parentRow.tap();
      await page.waitForFunction(() => window.YHWH.active().cwd === '/YHWH');
      await page.locator('#file-list [data-path="/YHWH/notes.md"]').tap();
      await page.waitForFunction(() => window.YHWH.active()?.file?.name === 'notes.md');
      assert.equal(await page.locator('#navigation-area').isVisible(), false);
      await page.evaluate(() => {
        const app = window.YHWH, editor = app.getEditor();
        editor.dispatch({ changes: { from: editor.state.doc.length, insert: '\nSaved from a phone.\n' } });
      });
      await page.locator('#mobile-editor-toolbar [data-command="save"]').tap();
      await page.waitForFunction(() => !window.YHWH.active().dirty);
      assert.match(await page.evaluate(async () => (await window.yhwh.call('file:read', '/YHWH/notes.md')).content), /Saved from a phone/);
      await page.locator('#mobile-editor-toolbar [data-command="choose-view-mode"]').tap();
      await page.locator('#dialog [data-mode="reading"]').tap();
      await page.locator('.reading-view:visible').waitFor();
      await page.screenshot({ path: path.join(artifacts, `${device.name}-editor.png`) });
      await page.locator('#mobile-editor-toolbar [data-command="choose-view-mode"]').tap();
      await page.locator('#dialog [data-mode="live"]').tap();
      await page.locator('.cm-content:visible').waitFor();
      // New features registered in the shared command palette remain reachable.
      await page.locator('#mobile-nav [data-command="mobile-tabs"]').tap();
      await page.locator('#mobile-dialog button', { hasText: '+ New tab' }).tap();
      await page.waitForFunction(() => window.YHWH.tabs.length === 2);
      assert.equal(await page.locator('#mobile-tab-count').textContent(), '2');
      await page.locator('#mobile-nav [data-command="mobile-tabs"]').tap();
      await page.locator('#mobile-dialog .mobile-tab-row button', { hasText: 'notes.md' }).tap();
      await page.getByRole('button', { name: 'Inbox', exact: true }).tap();
      await page.locator('#mobile-nav').getByRole('button', { name: 'Back', exact: true }).tap();
      assert.equal(await page.locator('#document').isVisible(), true);
      assert.equal(await page.evaluate(() => window.YHWH.active().file.path), '/YHWH/notes.md');
      await page.evaluate(() => window.YHWH.run('settings'));
      await page.locator('#settings-form input[name=font_size]').fill('21');
      await page.locator('#settings-form button[type=submit]').tap();
      await page.waitForFunction(() => !document.querySelector('#dialog').open);
      assert.equal(await page.evaluate(() => window.YHWH.active().config.values.font_size), '21');
      await page.evaluate(() => window.YHWH.showVerse());
      await page.waitForSelector('.verse-selection .verse-heading');
      assert.match(await page.locator('.verse-selection .verse-heading').textContent(), /Genesis/);
      await page.screenshot({ path: path.join(artifacts, `${device.name}-verses.png`) });
      await page.evaluate(() => document.querySelector('#dialog').close());
      // A changed file must not be overwritten, then reload must recover the
      // persisted note and settings from the actual IndexedDB filesystem.
      await page.evaluate(async () => {
        const app = window.YHWH, file = app.active().file;
        await window.yhwh.call('file:save', file.path, 'External edit', null, true);
        try { await window.yhwh.call('file:save', file.path, 'Stale edit', file.modified); throw new Error('Conflict was not detected'); }
        catch (error) { if (!/changed/.test(error.message)) throw error; }
        await window.yhwh.call('file:save', file.path, file.content, null, true);
      });
      await page.reload(); await page.waitForFunction(() => window.YHWH?.commands.has('mobile-tabs'));
      assert.equal(await page.evaluate(() => window.YHWH.active().config.values.font_size), '21');
      await page.evaluate(() => window.YHWH.openFile('/YHWH/notes.md'));
      assert.match(await page.evaluate(() => window.YHWH.getEditor().state.doc.toString()), /Saved from a phone/);
      // Recovery keeps the original on-disk content intact.
      await page.evaluate(() => {
        window.YHWH.active().config.values.autosave = 'false';
        const editor = window.YHWH.getEditor(); editor.dispatch({ changes: { from: editor.state.doc.length, insert: 'Unsaved recovery draft' } });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('yhwh:mobile:drafts') || '[]').length === 1);
      await page.reload(); await page.waitForSelector('#mobile-dialog[open]');
      await page.locator('#mobile-dialog button', { hasText: 'Recover /YHWH/notes.md' }).tap();
      await page.waitForFunction(() => window.YHWH?.active().editor?.state.doc.toString().includes('Unsaved recovery draft'));
      assert.equal(await page.evaluate(() => window.YHWH.active().dirty), true);
      assert.doesNotMatch(await page.evaluate(async () => (await window.yhwh.call('file:read', '/YHWH/notes.md')).content), /Unsaved recovery draft/);
      // Save the recovered test buffer before the night-mail reload check.
      await page.evaluate(() => window.YHWH.run('save'));
      await require('../../../test/night-inbox.cjs')(page, path.join(artifacts, `${device.name}-night-name.png`));
      await require('../../../test/startup-inbox.cjs')(page, Object.fromEntries(['night', 'keyboard', 'settings', 'yahoo'].map(name => [name, path.join(artifacts, `${device.name}-startup-${name}.png`)])));
      await require('../../../test/midnight-inbox.cjs')(page, path.join(artifacts, `${device.name}-seedis.png`));
      const improvements = require('../../../test/interface-improvements-2.cjs');
      const deviceArtifacts = path.join(artifacts, device.name); await fs.mkdir(deviceArtifacts, { recursive: true });
      await page.evaluate(async () => { await window.yhwh.call('file:create', '/YHWH/table.csv'); await window.yhwh.call('file:save', '/YHWH/table.csv', 'Name,Value\nAbe,42\n', null); });
      const activeDocument = await page.evaluate(() => window.YHWH.active().file?.path);
      const attachmentDownload = page.waitForEvent('download');
      await page.evaluate(() => window.YHWH.openFile('/YHWH/table.csv'));
      const downloaded = await attachmentDownload; assert.equal(downloaded.suggestedFilename(), 'table.csv');
      assert.equal(await page.evaluate(() => window.YHWH.active().file?.path), activeDocument);
      const pdfChooser = page.waitForEvent('filechooser');
      await page.evaluate(() => window.YHWH.run('mobile-import'));
      await (await pdfChooser).setFiles([{ name: 'scroll.pdf', mimeType: 'application/pdf', buffer: require('../../../test/viewer-fixtures.cjs')()['scroll.pdf'] }]);
      await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('Imported 1'));
      const openingPDF = page.evaluate(() => window.YHWH.openFile('/YHWH/scroll.pdf'));
      await page.locator('[name="remember-pdf"]').check(); await page.locator('[data-pdf="preview"]').click(); await openingPDF;
      assert.equal(await page.evaluate(() => window.YHWH.active().config.values.pdf_open), 'preview');
      await improvements.pdf({ page, artifacts: deviceArtifacts });
      try { await improvements.moves({ page, directory: '/YHWH', artifacts: deviceArtifacts, touch: true }); }
      catch (error) {
        console.error('Move UI state:', await page.evaluate(async () => {
          const files = [];
          async function walk(directory) {
            for (const file of await window.yhwh.call('directory:list', window.YHWH.active().id, directory)) { files.push(file.path); if (file.directory) await walk(file.path); }
          }
          await walk('/YHWH');
          return { files, toast: document.querySelector('#toast').textContent, tabs: window.YHWH.tabs.map(tab => ({ cwd: tab.cwd, file: tab.file?.path })) };
        }));
        await page.screenshot({ path: path.join(deviceArtifacts, 'failure.png') }); throw error;
      }
      await require('../../../test/initial-ui.cjs')(page, deviceArtifacts);
      await page.evaluate(() => window.YHWH.run('chat'));
      const help = page.locator('#mobile-dialog');
      await help.getByRole('textbox', { name: 'Message YHWH' }).fill('Where am I?');
      await help.getByRole('button', { name: 'Ask' }).click();
      await help.getByRole('log').getByText(/You’re in \/YHWH, Abe/).waitFor();
      await help.getByRole('button', { name: 'Close', exact: true }).click();
      await require('../../../test/levels-ui.cjs')(page, path.join(deviceArtifacts, 'zanmen.png'));
      await page.reload(); await page.waitForFunction(() => window.YHWH?.commands.has('mobile-tabs'));
      assert.equal(await page.locator('body').getAttribute('data-level'), 'elite');
      await page.evaluate(() => window.YHWH.run('chat'));
      await help.getByRole('log').getByText(/^Josh\. My whole universe/).waitFor();
      await help.getByRole('button', { name: 'Close', exact: true }).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
      assert.deepEqual(errors, []);
      await context.close(); console.log(`Passed ${device.name}: import, editor, tabs, settings, verses, persistence, recovery, touch file moves, PDF and all five YHWH levels.`);
    }
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
