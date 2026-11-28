const fs = require('node:fs/promises');
const path = require('node:path');
const esbuild = require('esbuild');
const { root, output } = require('../../lib/paths.cjs');
async function build() {
  const directory = output('mobile/ui');
  await fs.mkdir(directory, { recursive: true });
  const keys = await require('../../lib/keys.cjs').scan(path.join(root, 'etc/keys'));
  const menu = path.join(root, 'etc/folder-menu');
  const names = (await fs.readdir(menu, { withFileTypes: true })).filter(entry => entry.isFile() && entry.name.endsWith('.txt') && !entry.name.startsWith('.')).map(entry => entry.name);
  const actions = await Promise.all(names.map(async name => [name, await fs.readFile(path.join(menu, name), 'utf8')]));
  const result = await esbuild.build({ absWorkingDir: root, define: {
    YHWH_BUILTIN_KEYS: JSON.stringify(keys.map(({ filename, source, ...binding }) => binding)),
    YHWH_BUILTIN_FOLDER_ACTIONS: JSON.stringify(Object.fromEntries(actions)),
  }, entryPoints: { mobile: 'src/yhwh-mobile/src/entry.js' }, bundle: true, splitting: true,
    format: 'esm', outdir: directory, sourcemap: true, target: ['chrome110', 'safari16'], metafile: true, loader: { '.md': 'text', '.png': 'file', '.jpg': 'file', '.ttf': 'file' } });
  await require('../viewer-assets.cjs')(directory);
  let html = await fs.readFile(path.join(root, 'etc/default/index.html'), 'utf8');
  html = html.replace('width=device-width, initial-scale=1', 'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content')
    .replaceAll('../assets/', './assets/').replaceAll('../../var/tmp/yhwh/default/ui/renderer', './mobile');
  await fs.writeFile(path.join(directory, 'index.html'), html);
  for (const name of ['style.css', 'verse-source.css']) await fs.copyFile(path.join(root, 'etc/default', name), path.join(directory, name));
  await fs.cp(path.join(root, 'etc/default/fonts'), path.join(directory, 'fonts'), { recursive: true });
  await fs.cp(path.join(root, 'etc/assets'), path.join(directory, 'assets'), { recursive: true });
  // style.css expects the same relative assets path as the desktop template.
  const css = await fs.readFile(path.join(directory, 'style.css'), 'utf8');
  await fs.writeFile(path.join(directory, 'style.css'), css.replaceAll('../assets/', './assets/'));
  await fs.copyFile(path.join(root, 'etc/verses/we-the-nameless.json'), path.join(directory, 'verses.json'));
  await fs.copyFile(path.join(root, 'src/yhwh-default/plugins/hello-world/main.js'), path.join(directory, 'hello-world.js'));
  // Capacitor copies the entire web directory. Drop old split chunks and
  // fingerprinted assets after their replacements are in place.
  const outputs = new Set(Object.keys(result.metafile.outputs).map(filename => path.basename(filename)));
  const stale = (await fs.readdir(directory, { withFileTypes: true }))
    .filter(entry => entry.isFile() && /-[A-Z0-9]{8}\.(?:(?:js|css)(?:\.map)?|png|jpg|ttf)$/.test(entry.name) && !outputs.has(entry.name));
  await Promise.all(stale.map(entry => fs.rm(path.join(directory, entry.name), { force: true })));
  await fs.writeFile(output('mobile/metafile.json'), JSON.stringify(result.metafile, null, 2) + '\n');
  console.log('Built Android/iOS shared UI: ' + directory);
}
build().catch(error => { console.error(error); process.exitCode = 1; });
