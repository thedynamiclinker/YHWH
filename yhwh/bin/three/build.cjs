const { root, output } = require('../../lib/paths.cjs');
const esbuild = require('esbuild');
// Building Three also builds its shared desktop. The effects bundle contains
// no Three.js, duplicate editor, terminal, icon library, or scene assets.
require('../default/build.cjs');
esbuild.build({ absWorkingDir: root, entryPoints: ['src/yhwh-three/app/renderer.js'], bundle: true,
  outfile: output('three/renderer.js'), format: 'esm', sourcemap: true, target: 'chrome130',
}).catch(() => process.exitCode = 1);
