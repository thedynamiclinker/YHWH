// Runs the actual installed Obsidian app with a disposable profile and vault.
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

(async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'yhwh-obsidian-ui-'));
  const root = path.resolve(__dirname, '..'), vault = path.join(temp, 'Test vault'), profile = path.join(temp, 'profile');
  const screenshots = path.resolve(root, '../../var/tmp/yhwh/obsidian/screenshots');
  let app;
  const errors = [];
  try {
    await fs.mkdir(path.join(vault, '.obsidian/plugins/yhwh'), { recursive: true });
    await fs.mkdir(path.join(vault, 'Notes'), { recursive: true });
    await fs.mkdir(path.join(vault, 'Images'), { recursive: true });
    await fs.mkdir(path.join(vault, '.yhwh'), { recursive: true });
    await fs.mkdir(profile, { recursive: true });
    await fs.mkdir(screenshots, { recursive: true });
    for (const file of ['main.js', 'styles.css', 'manifest.json']) await fs.copyFile(path.join(process.env.YHWH_PLUGIN_ASSETS || (['main.js','styles.css'].includes(file) ? path.resolve(root, '../../var/tmp/yhwh/obsidian') : root), file), path.join(vault, '.obsidian/plugins/yhwh', file));
    await fs.writeFile(path.join(vault, 'Welcome.md'), '# A room for making things\n\nObsidian keeps the editor. YHWH brings the files.\n\n[[Notes/Creation]]\n');
    await fs.writeFile(path.join(vault, 'Notes/Creation.md'), '# Let there be a file\n\nA normal note, with normal backlinks.\n');
    await fs.writeFile(path.join(vault, 'Notes/example.json'), '{"hello":"world","count":3}');
    await fs.writeFile(path.join(vault, 'Notes/boop'), '#!/bin/sh\necho hello\n');
    await fs.writeFile(path.join(vault, 'Notes/binary.bin'), Buffer.from([0, 12, 255, 0]));
    await fs.writeFile(path.join(vault, '.yhwh/rc'), '/Notes\n    accent="#d1b884"\n    title="The workshop"\n');
    await fs.writeFile(path.join(vault, '.obsidian/app.json'), JSON.stringify({ safeMode: false }));
    await fs.writeFile(path.join(vault, '.obsidian/community-plugins.json'), '["yhwh"]');
    await fs.writeFile(path.join(profile, 'obsidian.json'), JSON.stringify({ vaults: { '0123456789abcdef': { path: vault, ts: Date.now(), open: true } } }));
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const installed = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['obsidian'], { encoding: 'utf8' });
    const executable = process.env.OBSIDIAN_EXECUTABLE || installed.stdout?.trim().split('\n')[0];
    if (!executable) throw new Error('Set OBSIDIAN_EXECUTABLE to the installed Obsidian launcher.');
    app = await electron.launch({ executablePath: executable,
      args: [`--user-data-dir=${profile}`, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], env, timeout: 45000 });
    const page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') console.error('Browser:', message.text()); });
    await page.getByText('Trust author and enable plugins', { exact: true }).click();
    await page.waitForFunction(() => window.app?.plugins?.plugins?.yhwh, undefined, { timeout: 30000 });
    for (const window of app.windows()) if (window !== page && window.url() === 'about:blank') await window.close();
    await page.locator('[data-type="yhwh-navigator"] .yhwh-heading').waitFor();
    console.log('✓ Plugin loads in real Obsidian with a separate profile and vault');
    const evaluate = fn => page.evaluate(fn);
    await evaluate(() => app.commands.executeCommandById('yhwh:emails'));
    const emailModal = page.locator('.modal:visible');
    await emailModal.getByRole('button', { name: 'Q--- ohelet', exact: true }).waitFor();
    assert.equal(await emailModal.getByRole('listitem').count(), 28);
    await emailModal.getByRole('button', { name: 'Q--- ohelet', exact: true }).click();
    await emailModal.getByText('oh hell', { exact: false }).waitFor();
    assert.equal(await emailModal.getByRole('link').getAttribute('href'), 'https://youtu.be/tH2w6Oxx0kQ');
    await emailModal.getByRole('button', { name: 'Back to YHWH emails' }).click();
    await emailModal.getByRole('button', { name: 'For got to send the song', exact: true }).click();
    assert.equal(await emailModal.locator('a').filter({ hasText: '丫' }).getAttribute('href'), 'https://youtu.be/RKsBl_HMKTY?is=urHug_dAXqHPU98G');
    await emailModal.getByRole('button', { name: 'Back to YHWH emails' }).click();
    await emailModal.getByRole('button', { name: '2:22 Mo, start it at 2:22', exact: true }).click();
    assert.equal(await emailModal.getByRole('link').getAttribute('href'), 'https://youtu.be/NieC8KA0EvI?si=3_JMt1cNt0PCWy8G&t=142');
    await page.keyboard.press('Escape');
    await evaluate(async () => {
      const p = app.plugins.plugins.yhwh;
      const file = app.vault.getAbstractFileByPath('Welcome.md');
      await app.workspace.getLeaf('tab').openFile(file);
      await p.go('');
    });
    await page.screenshot({ path: path.join(screenshots, '01-navigator.png') });
    await evaluate(async () => {
      await app.vault.createFolder('Drag source'); await app.vault.createFolder('Drag destination');
      await app.vault.create('Drag source/Dragged.md', 'Keep these contents');
      await app.plugins.plugins.yhwh.go('');
    });
    const dragRow = name => page.locator('[data-type="yhwh-navigator"] .yhwh-file-row').filter({ has: page.getByRole('button', { name: `Open ${name}`, exact: true }) });
    await dragRow('Drag source').dragTo(dragRow('Drag destination'));
    await page.waitForFunction(() => !!app.vault.getAbstractFileByPath('Drag destination/Drag source/Dragged.md'));
    await evaluate(async () => { await app.plugins.plugins.yhwh.go('Drag destination/Drag source'); });
    await dragRow('Dragged.md').dragTo(page.locator('[data-type="yhwh-navigator"] .yhwh-breadcrumbs').getByRole('button', { name: 'Vault root', exact: true }));
    await page.waitForFunction(() => !!app.vault.getAbstractFileByPath('Dragged.md'));
    assert.equal(await evaluate(() => app.vault.read(app.vault.getAbstractFileByPath('Dragged.md'))), 'Keep these contents');
    await evaluate(async () => {
      await app.vault.delete(app.vault.getAbstractFileByPath('Drag destination'), true);
      await app.vault.delete(app.vault.getAbstractFileByPath('Dragged.md'));
      await app.plugins.plugins.yhwh.go('');
    });
    console.log('✓ Navigator drags folders with descendants and moves files to vault-root breadcrumbs');
    await evaluate(async () => { await app.plugins.plugins.yhwh.toggleFilesFocus(); });
    assert.equal(await evaluate(() => app.workspace.getLeavesOfType('yhwh-navigator').length), 2);
    await evaluate(async () => { await app.plugins.plugins.yhwh.toggleFilesFocus(); });
    assert.equal(await evaluate(() => app.workspace.getLeavesOfType('yhwh-navigator').length), 1);
    assert.equal(await evaluate(() => app.workspace.getLeavesOfType('markdown').some(leaf => leaf.view.file?.path === 'Welcome.md')), true);
    await evaluate(async () => { await app.plugins.plugins.yhwh.go('Notes'); });
    assert.equal(await evaluate(() => app.plugins.plugins.yhwh.current.title), 'The workshop');
    assert.equal(await evaluate(() => app.plugins.plugins.yhwh.current.accent), '#d1b884');
    const explorer = page.locator('[data-type="yhwh-navigator"]');
    const rows = explorer.locator('.yhwh-file-row');
    assert.equal(await rows.count(), 5);
    const parentRow = rows.first().getByRole('button');
    assert.match(await parentRow.textContent(), /\.\.$/);
    assert.equal(await explorer.locator('.yhwh-tools button[aria-label*="Parent folder"]').count(), 0);
    await parentRow.click();
    await page.waitForFunction(() => app.plugins.plugins.yhwh.folder === '');
    await explorer.getByRole('button', { name: 'Open Notes', exact: true }).click();
    await page.waitForFunction(() => app.plugins.plugins.yhwh.folder === 'Notes');
    await parentRow.press('Enter');
    await page.waitForFunction(() => app.plugins.plugins.yhwh.folder === '');
    await explorer.getByRole('button', { name: 'Open Notes', exact: true }).click();
    await page.waitForFunction(() => app.plugins.plugins.yhwh.folder === 'Notes');
    await explorer.getByRole('button', { name: 'Open Creation.md', exact: true }).focus();
    await page.keyboard.press('Alt+ArrowUp');
    await page.waitForFunction(() => app.plugins.plugins.yhwh.folder === '');
    await explorer.getByRole('button', { name: 'Open Notes', exact: true }).click();
    await page.waitForFunction(() => app.plugins.plugins.yhwh.folder === 'Notes');
    await evaluate(async () => { await app.plugins.plugins.yhwh.show('yhwh-console'); });
    const command = page.getByRole('textbox', { name: 'Vault command', exact: true });
    const run = async line => { await command.fill(line); await command.press('Enter'); await command.waitFor({ state: 'visible' }); await page.waitForFunction(() => !document.querySelector('input[aria-label="Vault command"]').disabled); };
    await run('cd /');
    assert.equal(await evaluate(() => app.plugins.plugins.yhwh.folder), '');
    await run('cd Notes');
    assert.equal(await evaluate(() => app.plugins.plugins.yhwh.folder), 'Notes');
    await run('mkdir "A new folder"');
    await run('new "A new folder/new.json"');
    await page.locator('[data-type="yhwh-text"] textarea').waitFor();
    await page.locator('[data-type="yhwh-text"] textarea').fill('{"answer":42}');
    await page.getByRole('button', { name: 'Save file', exact: true }).click();
    await page.waitForFunction(() => app.vault.cachedRead(app.vault.getAbstractFileByPath('Notes/A new folder/new.json')).then(text => text === '{"answer":42}'));
    await page.getByRole('button', { name: 'Format JSON', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[aria-label="File contents"]').value.includes('\n  "answer": 42\n'));
    assert.equal(await command.isVisible(), true);
    console.log('✓ Console navigation, folder/file creation, source editing, saving and JSON formatting');
    // Obsidian's own TextFileView supplies external file-change handling.
    await evaluate(async () => { await app.vault.modify(app.vault.getAbstractFileByPath('Notes/A new folder/new.json'), '{"external":true}'); });
    await page.waitForFunction(() => document.querySelector('[aria-label="File contents"]').value === '{"external":true}');
    await page.screenshot({ path: path.join(screenshots, '02-console-and-editor.png') });
    await evaluate(async () => {
      const p = app.plugins.plugins.yhwh;
      await p.go('Notes');
      await p.open(app.vault.getAbstractFileByPath('Notes/boop'), true);
    });
    assert.match(await page.locator('[data-type="yhwh-text"] textarea').last().inputValue(), /#!\/bin\/sh/);
    const blocked = await evaluate(async () => {
      try { await app.plugins.plugins.yhwh.open(app.vault.getAbstractFileByPath('Notes/binary.bin'), true); return false; }
      catch (error) { return /binary/.test(error.message); }
    });
    assert.equal(blocked, true);
    await evaluate(async () => { await app.plugins.plugins.yhwh.toggle('yhwh-console'); });
    await evaluate(async () => { await app.plugins.plugins.yhwh.go('Notes'); await app.plugins.plugins.yhwh.show('yhwh-atlas'); });
    await page.locator('.yhwh-space canvas').waitFor();
    assert.equal(await page.locator('.yhwh-space-labels button').count(), 5);
    assert.equal(await page.locator('.yhwh-space canvas').evaluate(canvas => !!canvas.getContext('webgl')), true);
    await page.screenshot({ path: path.join(screenshots, '03-3d-directory.png') });
    await page.getByRole('button', { name: 'Toggle slow orbit', exact: true }).click();
    await page.getByRole('button', { name: 'Toggle slow orbit', exact: true }).click();
    await page.locator('.yhwh-space-labels button').filter({ hasText: 'A new folder' }).click();
    await page.waitForFunction(() => app.plugins.plugins.yhwh.folder === 'Notes/A new folder');
    console.log('✓ Extensionless scripts, binary guard, external text updates and interactive WebGL directory');
    await evaluate(() => app.plugins.plugins.yhwh.editCopy('welcome'));
    await page.locator('.yhwh-copy-editor').fill('Where are you? Right here, apparently.');
    await page.getByRole('button', { name: 'Save wording', exact: true }).click();
    await page.waitForFunction(() => app.plugins.plugins.yhwh.settings.copy.welcome.includes('apparently'));
    await evaluate(async () => { const p = app.plugins.plugins.yhwh; p.settings.energy = 0; await p.save(); await p.go(''); });
    assert.equal(await page.locator('[data-type="yhwh-navigator"] .yhwh-copy').count(), 0);
    await evaluate(async () => { const p = app.plugins.plugins.yhwh; p.settings.energy = 50; await p.save(); await p.go(''); });
    assert.match(await page.locator('[data-type="yhwh-navigator"] .yhwh-footer').innerText(), /God is dead/);
    await page.screenshot({ path: path.join(screenshots, '04-nietzsche.png') });
    if (process.env.YHWH_TEST_NETWORK) {
      await explorer.getByRole('button', { name: 'Load a random pairing from nietzschefamilycircus.com', exact: true }).click();
      await page.locator('.yhwh-circus-image').waitFor({ timeout: 30000 });
      assert.equal(await page.locator('.yhwh-circus-image').evaluate(image => image.complete && image.naturalWidth > 0), true);
      await page.screenshot({ path: path.join(screenshots, '05-circus.png') });
      console.log('✓ Optional live Nietzsche Family Circus pairing and image');
    }
    await evaluate(() => app.plugins.plugins.yhwh.offerings());
    assert.match(await page.locator('.modal-content').innerText(), /Nothing is uploaded/);
    await page.keyboard.press('Escape');
    await evaluate(async () => app.plugins.plugins.yhwh.selectLevel(80));
    await explorer.getByText('Dave. I’m in the box.', { exact: true }).waitFor();
    await evaluate(async () => app.plugins.plugins.yhwh.selectLevel(120));
    await explorer.getByText('Mo. The b*sh is burning.', { exact: true }).waitFor();
    await explorer.getByRole('button', { name: 'Upgrade to Zanmen Elite!' }).click();
    await page.getByRole('button', { name: 'Steal Upgrade', exact: true }).click();
    await explorer.getByText(/YHWH level Zan/).waitFor();
    await evaluate(async () => {
      await app.plugins.disablePlugin('yhwh');
      await app.plugins.enablePlugin('yhwh');
    });
    await page.waitForFunction(() => app.plugins.plugins.yhwh?.settings.copy.welcome.includes('apparently'));
    assert.equal(await evaluate(() => app.plugins.plugins.yhwh.level().id), 'elite');
    await explorer.getByRole('button', { name: 'Manage preview upgrades' }).click();
    await page.getByRole('button', { name: 'Unsteal Upgrade' }).click();
    await explorer.getByText('Mo. The b*sh is burning.', { exact: true }).waitFor();
    await explorer.getByRole('button', { name: 'Upgrade to Zanmen Elite!' }).waitFor();
    assert.equal(await evaluate(() => app.plugins.plugins.yhwh.level().id), 'exodus');
    console.log('✓ Editable wording, free levels, reversible previews, offerings and persistence across reload');
    assert.deepEqual(errors.filter(error => !/ResizeObserver loop/.test(error)), []);
    console.log(`Screenshots: ${screenshots}`);
  } catch (error) {
    if (app) {
      for (const [i, page] of app.windows().entries()) {
        console.error('Window', i, page.url(), (await page.locator('body').innerText()).slice(0, 4000));
        if (page.url().startsWith('app://')) console.error(await page.evaluate(() => app.workspace.getLeavesOfType('yhwh-navigator').map(l => ({ deferred: l.isDeferred, html: l.containerEl.outerHTML.slice(0, 3000), type: l.view.constructor.name }))));
        await page.screenshot({ path: path.join(screenshots, `failure-${i}.png`) }).catch(() => {});
      }
      console.error('Page errors:', errors);
    }
    throw error;
  } finally {
    if (app) await app.close();
    if (process.env.YHWH_KEEP_TEST_VAULT) console.log(`Test vault retained: ${temp}`);
    else await fs.rm(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
