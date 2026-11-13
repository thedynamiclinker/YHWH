const esbuild = require('esbuild');
const { root, output } = require('../../lib/paths.cjs');
esbuild.build({ absWorkingDir: root, entryPoints: ['src/yhwh-default/src/renderer.js'], bundle: true, splitting: true,
  format: 'esm', outdir: output('default/ui'), sourcemap: true, target: 'chrome130', loader: { '.ttf': 'file' },
}).catch(() => process.exitCode = 1);
