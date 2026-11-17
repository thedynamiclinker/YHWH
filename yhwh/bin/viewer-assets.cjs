const fs = require('node:fs/promises');
const path = require('node:path');
module.exports = async function viewerAssets(directory) {
  const source = path.dirname(require.resolve('pdfjs-dist/package.json'));
  await fs.mkdir(directory, { recursive: true });
  await fs.copyFile(path.join(source, 'build/pdf.worker.min.mjs'), path.join(directory, 'pdf.worker.min.mjs'));
  for (const name of ['cmaps', 'standard_fonts', 'wasm']) await fs.cp(path.join(source, name), path.join(directory, 'pdf', name), { recursive: true });
};
