const esbuild = require('esbuild');
const { root, output } = require('../../lib/paths.cjs');
Promise.all([esbuild.build({ absWorkingDir: root, entryPoints: ['src/yhwh-default/src/renderer.js'], bundle: true, splitting: true,
  format: 'esm', outdir: output('default/ui'), sourcemap: true, target: 'chrome130', loader: { '.ttf': 'file', '.png': 'file' },
}), esbuild.build({ absWorkingDir: root, entryPoints: ['src/yhwh-default/app/preload.cjs'], bundle: true,
  platform: 'node', format: 'cjs', external: ['electron'], outfile: output('default/ui/preload.cjs'), target: 'node22',
}), require('../viewer-assets.cjs')(output('default/ui'))]).catch(() => process.exitCode = 1);
