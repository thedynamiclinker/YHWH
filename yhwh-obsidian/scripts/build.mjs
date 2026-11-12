import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
await build({
  absWorkingDir: root, entryPoints: ['src/main.ts'], outfile: 'main.js',
  bundle: true, format: 'cjs', target: 'es2020', external: ['obsidian'],
  banner: { js: '/* YHWH — MIT license. Built from src/ with npm run build. */' },
});
// Community releases only download three files. Embed the font in the stylesheet.
const font = await readFile(new URL('../assets/Phoenician.ttf', import.meta.url));
const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
const fontLicense = await readFile(new URL('../assets/OFL.txt', import.meta.url), 'utf8');
await writeFile(new URL('../styles.css', import.meta.url),
  `/* ${fontLicense.replaceAll('*/', '* /')} */\n@font-face{font-family:YHWH-Phoenician;src:url(data:font/ttf;base64,${font.toString('base64')}) format('truetype');font-display:swap}\n${css}`);
await mkdir(new URL('../build/', import.meta.url), { recursive: true });
console.log('Built main.js and styles.css');
