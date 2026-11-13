const { root, output } = require('../../lib/paths.cjs');
require('esbuild').build({ absWorkingDir: root, entryPoints: ['src/yhwh-three/app/renderer.js'], bundle: true,
  outfile: output('three/renderer.js'), format: 'esm', sourcemap: true, target: 'chrome130', loader: { '.woff2': 'file', '.ttf': 'file' },
}).catch(() => process.exitCode = 1);
