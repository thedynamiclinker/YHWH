const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const root = path.resolve(__dirname, '..');
(async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'yhwh-desktop-test-'));
  const directory = path.join(temp, 'files'), nested = path.join(directory, 'nested');
  const config = path.join(temp, 'config'), artifacts = require('../../../lib/paths.cjs').output('default', 'screenshots');
  await fs.mkdir(nested, { recursive: true }); await fs.mkdir(config); await fs.mkdir(artifacts, { recursive: true });
  await fs.writeFile(path.join(directory, 'notes.md'), '# A little room for creation\n\nA **real file**. A shell. A door that opens.\n\n## Things to make\n\n- Something useful\n- Something strange\n\n```javascript\nconsole.log("Let there be files");\n```\n');
  await fs.writeFile(path.join(directory, 'data.json'), '{"hello":"world","count":3,"big":9007199254740993,"same":1,"same":2}');
  await fs.writeFile(path.join(directory, 'page.html'), '<html><body><div>hi</div></body></html>');
  await fs.writeFile(path.join(directory, 'boop'), 'a plain file\n');
  await fs.writeFile(path.join(directory, '.hidden'), 'hidden');
  await fs.writeFile(path.join(config, 'theme.css'), '.statusbar { border-top-color: rgb(90, 70, 120); }');
  await fs.writeFile(path.join(config, 'rc'), "/\n    stylesheet='theme.css'\n", { mode: 0o600 });
  const sourceWords = await fs.readFile(require('../../../lib/paths.cjs').etc('default', 'words.json'), 'utf8');
  const env = { ...process.env, YHWH_DATA_DIR: path.join(temp, 'profile'), YHWH_CONFIG_HOME: config, YHWH_SYSTEM_CONFIG: path.join(temp, 'system'), YHWH_NODE: process.execPath, YHWH_SHELL: '/bin/bash', YHWH_NO_SHELL_RC: '1', HISTFILE: '/dev/null' };
  delete env.ELECTRON_RUN_AS_NODE;
  let app, page;
  const errors = [];
  async function launch() {
    app = await electron.launch({ executablePath: require('../../../lib/electron.cjs')(), args: [root, '--disable-gpu', '--cwd', directory], env, timeout: 60000 });
    page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => window.YHWH?.active());
  }
  const run = name => page.evaluate(name => window.YHWH.run(name), name);
  const open = filename => page.evaluate(filename => window.YHWH.openFile(filename), filename);
  async function quit() {
    const exited = new Promise(resolve => app.process().once('exit', resolve));
    await run('quit').catch(error => { if (!/closed|destroyed/i.test(error.message)) throw error; });
    await exited; app = null;
  }
  try {
    await launch();
    assert.equal(await page.locator('#files').isVisible(), true); assert.equal(await page.locator('#terminal-panel').isVisible(), false);
    assert.equal(await page.locator('.welcome h1').textContent().then(text => text.includes('Where are you?')), true);
    assert.equal(await page.locator('.file-row').filter({ hasText: '.hidden' }).count(), 0);
    assert.equal(await page.locator('#user-theme').textContent().then(text => text.includes('90, 70, 120')), true);
    await page.screenshot({ path: path.join(artifacts, '01-welcome.png') });
    console.log('✓ compact filesystem layout; hidden running shell; user CSS loaded');

    await page.keyboard.press('Control+e'); assert.equal(await page.locator('#files').isVisible(), false);
    await page.keyboard.press('Control+e'); assert.equal(await page.locator('#files').isVisible(), true);
    await page.keyboard.press('Control+d'); await page.waitForFunction(() => document.querySelector('#workspace').dataset.expanded === 'files');
    assert.equal(await page.locator('#document').isVisible(), false);
    await page.screenshot({ path: path.join(artifacts, '02-file-manager.png') });
    await page.keyboard.press('Control+d');
    await open(path.join(directory, 'notes.md'));
    assert.equal(await page.locator('.live-block h2').textContent(), 'Things to make');
    await page.keyboard.press('Control+Shift+e'); assert.equal(await page.locator('.live-block').count(), 0);
    await page.keyboard.press('Control+Shift+e'); await page.locator('.live-block h2').waitFor();
    await page.locator('.cm-content:visible').click(); await page.keyboard.press('Control+End'); await page.keyboard.insertText('\nSaved from the editor.\n');
    await page.keyboard.press('Control+s'); await page.waitForFunction(() => !window.YHWH.active().dirty);
    assert.match(await fs.readFile(path.join(directory, 'notes.md'), 'utf8'), /Saved from the editor/);
    await page.locator('#file-title').fill('renamed.md'); await page.locator('#document-path').click();
    await page.waitForFunction(() => window.YHWH.active().file.name === 'renamed.md');
    assert.match(await fs.readFile(path.join(directory, 'renamed.md'), 'utf8'), /Saved from the editor/);
    await page.keyboard.press('Control+d'); await page.keyboard.press('Control+d'); assert.equal(await page.locator('#file-title').inputValue(), 'renamed.md');
    await page.screenshot({ path: path.join(artifacts, '03-live-preview.png') });
    console.log('✓ Markdown Live Preview/source; edit/save; heading renames the real file; expansion preserves it');

    await page.keyboard.press('Control+b'); await page.locator('#terminal-panel').waitFor({ state: 'visible' });
    await page.evaluate(() => window.YHWH.active().terminal.focus());
    await page.keyboard.type(`cd '${nested}'`); await page.keyboard.press('Enter');
    await page.waitForFunction(directory => window.YHWH.active().cwd === directory, nested);
    await page.keyboard.press('Alt+ArrowUp');
    await page.waitForFunction(directory => window.YHWH.active().cwd === directory, directory);
    await page.evaluate(() => window.YHWH.active().terminal.focus());
    await page.keyboard.type("printf 'SYNC:%s\\n' \"$PWD\""); await page.keyboard.press('Enter');
    await page.waitForFunction(directory => { const t = window.YHWH.active().terminal; for (let i = 0; i < t.buffer.active.length; i++) if (t.buffer.active.getLine(i)?.translateToString().includes(`SYNC:${directory}`)) return true; return false; }, directory);
    await page.keyboard.press('Control+Shift+b'); assert.equal(await page.locator('#document').isVisible(), false);
    await page.keyboard.press('Control+Shift+b');
    await page.keyboard.press('Control+t'); assert.equal(await page.locator('#tabs [role=tab]').count(), 2);
    await page.keyboard.press('Control+Shift+Tab'); assert.equal(await page.locator('#file-title').inputValue(), 'renamed.md');
    const tab = await page.evaluate(() => window.YHWH.active().id);
    const second = exec(process.execPath, [path.join(root, '../../bin/default/cli.cjs'), 'open', path.join(directory, 'boop')], { env: { ...env, YHWH_TAB: tab, YHWH_ELECTRON: require('../../../lib/electron.cjs')() } });
    await page.waitForFunction(() => window.YHWH.active().file?.name === 'boop'); await second;
    assert.equal(await page.locator('#tabs [role=tab]').count(), 2);
    await page.screenshot({ path: path.join(artifacts, '04-shell-and-files.png') });
    console.log('✓ bidirectional real shell/file-manager cwd; independent app tabs; CLI routes to its originating tab');

    await open(path.join(directory, 'data.json')); await run('view-mode'); await run('save');
    assert.match(await fs.readFile(path.join(directory, 'data.json'), 'utf8'), /\n  "hello"/);
    assert.match(await fs.readFile(path.join(directory, 'data.json'), 'utf8'), /9007199254740993/);
    assert.equal((await fs.readFile(path.join(directory, 'data.json'), 'utf8')).match(/"same"/g).length, 2);
    await open(path.join(directory, 'page.html')); await run('view-mode'); await run('save');
    assert.match(await fs.readFile(path.join(directory, 'page.html'), 'utf8'), /\n/);
    await open(path.join(directory, 'boop')); assert.equal(await page.locator('#language-button').textContent(), 'plain');
    await page.locator('#language-button').click(); await page.locator('#dialog select[name=language]').selectOption('markdown'); await page.locator('#dialog select[name=remember]').selectOption('filename'); await page.locator('#dialog .primary').click();
    await page.locator('#dialog').waitFor({ state: 'hidden' }); await open(path.join(directory, 'boop'));
    assert.equal(await page.locator('#language-button').textContent(), 'markdown');
    console.log('✓ JSON/HTML formatting; desktop detection; persistent filename language override');

    await page.keyboard.press('Control+p'); await page.locator('#palette-search').fill('Hello, world'); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('Hello, world.'));
    await run('hello-panel'); assert.equal(await page.locator('[data-panel=hello-world]').isVisible(), true);
    await page.evaluate(() => window.YHWH.movePanel('hello-world', 'center'));
    assert.equal(await page.locator('#center-panels > [data-panel=hello-world]').count(), 1);
    await run('hello-panel');
    await run('modes'); await page.locator('[data-energy="0"]').click();
    await page.waitForFunction(() => document.body.dataset.theme === 'dawkins');
    await run('modes'); await page.locator('[data-energy="50"]').click(); await page.waitForFunction(() => document.body.dataset.theme === 'nietzsche');
    await page.screenshot({ path: path.join(artifacts, '05-nietzsche.png') });
    await run('modes'); await page.locator('[data-energy="100"]').click(); await page.waitForFunction(() => document.body.dataset.theme === 'yhwh');
    await run('about'); await page.locator('[data-edit-word=aboutBody]').click(); await page.locator('#dialog textarea').fill('Test edit, written to source.'); await page.locator('#dialog .primary').click();
    await page.locator('#dialog').waitFor({ state: 'hidden' });
    assert.equal(JSON.parse(await fs.readFile(require('../../../lib/paths.cjs').etc('default', 'words.json'), 'utf8')).aboutBody, 'Test edit, written to source.');
    await fs.writeFile(require('../../../lib/paths.cjs').etc('default', 'words.json'), sourceWords);
    await run('burnt'); assert.equal(await page.locator('[data-url="https://dashboard.stripe.com/register"]').count(), 1);
    await page.screenshot({ path: path.join(artifacts, '06-offerings.png') });
    await page.keyboard.press('Escape'); await run('piece'); assert.match(await page.locator('.dialog-body').textContent(), /No file is uploaded/); await page.keyboard.press('Escape');
    console.log('✓ hello-world plugin command/panel; panel movement; all personality modes; text edits write source; offering stubs');

    await run('settings'); await page.locator('#settings-form input[name=font_size]').fill('18'); await page.locator('#settings-form .primary').click(); await page.locator('#dialog').waitFor({ state: 'hidden' });
    assert.match(await fs.readFile(path.join(config, 'rc'), 'utf8'), /font_size='18'/);
    const win = await app.browserWindow(page); await win.evaluate(win => win.setSize(900, 650));
    await page.screenshot({ path: path.join(artifacts, '07-compact.png') });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    assert.equal((await fs.readdir(directory)).includes('.yhwh'), false);
    await quit();
    await launch(); assert.equal(await page.evaluate(() => window.YHWH.active().config.values.font_size), '18');
    await quit();
    console.log('✓ settings persist across relaunch; compact layout fits; browsing creates no .yhwh; no renderer errors');
    console.log(`Screenshots: ${artifacts}`);
  } catch (error) {
    if (page && !page.isClosed()) { console.error('UI state:', await page.evaluate(() => ({ toast: document.querySelector('#toast')?.textContent, tabs: window.YHWH?.tabs?.map(tab => ({ cwd: tab.cwd, file: tab.file?.name })), body: document.body.innerText.slice(0, 1200) })).catch(() => ({}))); await page.screenshot({ path: path.join(artifacts, 'failure.png') }).catch(() => {}); }
    throw error;
  } finally {
    if (app) { await app.evaluate(({ app }) => app.exit()).catch(() => {}); await app.close().catch(() => {}); }
    await fs.writeFile(require('../../../lib/paths.cjs').etc('default', 'words.json'), sourceWords);
    await fs.rm(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
