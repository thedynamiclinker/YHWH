const esbuild = require("esbuild");
const path = require("node:path");
esbuild
  .build({
    entryPoints: [path.join(__dirname, "../app/renderer.js")],
    bundle: true,
    outfile: path.join(__dirname, "../build/renderer.js"),
    format: "esm",
    sourcemap: true,
    target: "chrome130",
    loader: { ".woff2": "file", ".ttf": "file" },
  })
  .catch(() => process.exit(1));
