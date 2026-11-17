const fs = require('node:fs/promises');
const path = require('node:path');
const esbuild = require('esbuild');
const { root, output } = require('../../lib/paths.cjs');
async function build() {
  const directory = output('mobile/ui');
  await fs.mkdir(directory, { recursive: true });
  const keys = await require('../../lib/keys.cjs').scan(path.join(root, 'etc/keys'));
  const result = await esbuild.build({ absWorkingDir: root, define: { YHWH_BUILTIN_KEYS: JSON.stringify(keys.map(({ filename, source, ...binding }) => binding)) }, entryPoints: { mobile: 'src/yhwh-mobile/src/entry.js' }, bundle: true, splitting: true,
    format: 'esm', outdir: directory, sourcemap: true, target: ['chrome110', 'safari16'], metafile: true, loader: { '.png': 'file' } });
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
  await fs.writeFile(output('mobile/metafile.json'), JSON.stringify(result.metafile, null, 2) + '\n');
  console.log('Built Android/iOS shared UI: ' + directory);
}
build().catch(error => { console.error(error); process.exitCode = 1; });
