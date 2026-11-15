#!/usr/bin/env node
const path = require('node:path');
const { root, output } = require('../../lib/paths.cjs');
const source = path.join(root, 'src/yhwh-tty'), destination = output('tty');
// Bundle the terminal interface, sharing the desktop's actual services. Relative
// external paths keep the artifact usable in a relocated standalone package.
require('esbuild').build({
  entryPoints: [path.join(source, 'app.cjs')], outfile: path.join(destination, 'app.cjs'),
  bundle: true, platform: 'node', target: 'node22', packages: 'external', sourcemap: true,
  plugins: [{ name: 'shared-services', setup(build) {
    build.onResolve({ filter: /^\./ }, args => {
      const resolved = path.resolve(args.resolveDir, args.path);
      if (resolved.startsWith(source + path.sep)) return;
      return { path: path.relative(destination, resolved), external: true };
    });
  } }],
}).catch(error => { console.error(error.message); process.exitCode = 1; });
