const esbuild = require('esbuild');
esbuild.build({
  entryPoints: ['src/renderer.js'], bundle: true, splitting: true,
  format: 'esm', outdir: 'build/ui', sourcemap: true, target: 'chrome130',
}).catch(() => process.exitCode = 1);
