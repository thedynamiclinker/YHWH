import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import paths from '../../lib/paths.cjs';
const root = join(paths.root, 'src/yhwh-obsidian'), out = paths.output('obsidian');
await mkdir(out, { recursive: true });
await build({ absWorkingDir: root, entryPoints: ['src/main.ts'], outfile: join(out, 'main.js'), bundle: true, format: 'cjs', target: 'es2020', external: ['obsidian', 'node:child_process'], loader: { '.md': 'text' } });
const font = await readFile(paths.etc('assets/Phoenician.ttf'));
const css = await readFile(paths.etc('obsidian/styles.css'), 'utf8');
const schoolCSS = await readFile(join(paths.root, 'lib/nhs/view.css'), 'utf8');
const license = await readFile(paths.etc('assets/OFL.txt'), 'utf8');
const han = await readFile(paths.etc('default/fonts/yhwh-han.woff2'));
const hanLicense = await readFile(paths.etc('default/fonts/OFL-yhwh-han.txt'), 'utf8');
const mono = await readFile(paths.etc('default/fonts/mono-for-yhwh.woff2'));
const monoLicense = await readFile(paths.etc('default/fonts/OFL-mono-for-yhwh.txt'), 'utf8');
await writeFile(join(out, 'styles.css'), `/* ${license.replaceAll('*/','* /')} */\n@font-face{font-family:YHWH-Phoenician;src:url(data:font/ttf;base64,${font.toString('base64')}) format('truetype');font-display:swap}
/* ${hanLicense.replaceAll('*/','* /')} */\n@font-face{font-family:"YHWH Han";src:url(data:font/woff2;base64,${han.toString('base64')}) format('woff2');font-display:swap}
/* ${monoLicense.replaceAll('*/','* /')} */\n@font-face{font-family:"Mono for YHWH";src:url(data:font/woff2;base64,${mono.toString('base64')}) format('woff2');font-display:swap}\n${css}\n${schoolCSS}`);
console.log('Built Obsidian plugin:', out);
