const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { installDesktop, uninstallDesktop } = require('../bin/desktop.cjs');

test('desktop installs coexist, launch the correct package and cwd, and preserve modified files', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'yhwh-desktop-install-'));
  const original = { ...process.env };
  try {
    const data = path.join(temp, 'data with spaces $ and %'), workspace = path.join(temp, 'Abe `room`');
    await fs.mkdir(workspace);
    process.env.XDG_DATA_HOME = data;
    process.env.YHWH_ELECTRON = path.join(temp, 'electron-fixture');
    const capture = path.join(temp, 'launched.json');
    for (const mode of ['develop', 'install']) {
      const prefix = path.join(temp, mode), id = mode === 'develop' ? 'yhwh-development' : 'yhwh';
      const cli = path.join(prefix, 'lib/node_modules/yhwh-system/bin/default/cli.cjs');
      await fs.mkdir(path.dirname(cli), { recursive: true });
      await fs.writeFile(cli, `exports.main = async args => require('node:fs').writeFileSync(process.env.CAPTURE, JSON.stringify({ args, cwd: process.cwd(), flavor: process.env.YHWH_DESKTOP_FLAVOR, runtime: process.env.YHWH_ELECTRON, tab: process.env.YHWH_TAB }));`);
      await installDesktop(mode, prefix, workspace);
      await installDesktop(mode, prefix, workspace); // Updating an unmodified installation is idempotent.
      const desktop = path.join(data, 'applications', `${id}.desktop`);
      const entry = await fs.readFile(desktop, 'utf8');
      assert.match(entry, /Terminal=false/);
      assert.ok(entry.includes('and %%/yhwh/'));
      assert.ok(entry.includes(`Icon=${data}/icons/hicolor/scalable/apps/${id}.svg`));
      const validated = spawnSync('desktop-file-validate', [desktop], { encoding: 'utf8' });
      if (!validated.error) assert.equal(validated.status, 0, validated.stderr + validated.stdout);
      const launcher = path.join(data, 'yhwh', `${id}.cjs`);
      const launched = spawnSync(process.execPath, [launcher], { env: { ...process.env, CAPTURE: capture, YHWH_TAB: 'stale-tab' }, encoding: 'utf8' });
      assert.equal(launched.status, 0, launched.stderr);
      assert.deepEqual(JSON.parse(await fs.readFile(capture, 'utf8')), { args: ['--cwd', workspace], cwd: workspace, flavor: mode === 'develop' ? 'development' : 'installed', runtime: process.env.YHWH_ELECTRON });
      const opened = path.join(workspace, 'a note.md');
      assert.equal(spawnSync(process.execPath, [launcher, opened], { env: { ...process.env, CAPTURE: capture } }).status, 0);
      assert.deepEqual(JSON.parse(await fs.readFile(capture, 'utf8')).args, ['open', opened]);
      await fs.unlink(capture);
      const menuLaunch = spawnSync('gio', ['launch', desktop], { env: { ...process.env, CAPTURE: capture }, encoding: 'utf8' });
      if (!menuLaunch.error) {
        assert.equal(menuLaunch.status, 0, menuLaunch.stderr);
        for (let i = 0; i < 100 && !await fs.stat(capture).catch(() => null); i++) await new Promise(resolve => setTimeout(resolve, 20));
        assert.equal(JSON.parse(await fs.readFile(capture, 'utf8')).cwd, workspace);
      }
    }
    const development = path.join(data, 'applications/yhwh-development.desktop');
    await fs.appendFile(development, '# Abe customized this\n');
    await assert.rejects(installDesktop('develop', path.join(temp, 'develop'), workspace), /preserved/);
    await uninstallDesktop();
    assert.match(await fs.readFile(development, 'utf8'), /Abe customized this/);
    await assert.rejects(fs.access(path.join(data, 'applications/yhwh.desktop')), { code: 'ENOENT' });
  } finally {
    process.env = original;
    await fs.rm(temp, { recursive: true, force: true });
  }
});
