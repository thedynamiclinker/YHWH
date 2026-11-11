const fs = require('node:fs/promises');
const path = require('node:path');
(async () => {
  const root = path.resolve(__dirname, '..'), bin = path.resolve(process.argv[2] || path.join(root, '..', 'bin'));
  await fs.mkdir(path.join(bin, 'completions'), { recursive: true });
  if (bin !== path.join(root, 'bin')) {
    const relative = path.relative(bin, path.join(root, 'scripts/cli.cjs')).split(path.sep).join('/');
    const script = `#!/usr/bin/env node\nrequire(require('node:path').resolve(__dirname, ${JSON.stringify(relative)})).main(process.argv.slice(2), __dirname).catch(error => { console.error('yhwh: ' + error.message); process.exitCode = 1; });\n`;
    await fs.writeFile(path.join(bin, 'yhwh'), script, { mode: 0o755 });
    await fs.chmod(path.join(bin, 'yhwh'), 0o755);
    for (const shell of ['bash', 'zsh']) await fs.copyFile(path.join(root, 'bin/completions', `yhwh.${shell}`), path.join(bin, 'completions', `yhwh.${shell}`));
  }
  console.log(`Installed ${bin}/yhwh\nAdd to PATH: export PATH="${bin}:$PATH"\nBash completion: source "${bin}/completions/yhwh.bash"\nZsh completion: source "${bin}/completions/yhwh.zsh"`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
