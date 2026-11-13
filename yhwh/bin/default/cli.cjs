#!/usr/bin/env node
const fs = require('node:fs/promises');
const constants = require('node:fs').constants;
const path = require('node:path');
const sharedCLI = require('../../lib/cli.cjs');
const root = path.join(__dirname, '../../src/yhwh-default');
const builtin = ['open', 'create', 'read', 'append', 'prepend', 'list', 'search', 'move', 'rename', 'config', 'commands', 'completion', 'help'];
const help = `YHWH — files, a shell, and somewhere to think.

Usage: yhwh-default [path] [--theme yhwh|nietzsche|dawkins]
       yhwh-default <command> [arguments]

  open [path]                    Open a file or directory in the desktop app
  create <path> [--content text]  Create a file (no implied extension)
  read <path>                    Write file contents to stdout
  append <path> <text>            Append text (or pipe stdin)
  prepend <path> <text>           Prepend text (or pipe stdin)
  list [directory] [--all]        List a directory
  search <text> [directory]       Search UTF-8 files recursively; skip hidden dirs
  move <source> <destination>     Rename/move without overwriting another file
  rename <source> <name>          Rename within its directory
  config [path]                  Print resolved hierarchical config as JSON
  commands                       List builtins and adjacent yhwh-* executables
  completion bash|zsh             Print a shell completion script
  help                           Show this help

Obsidian-style path=..., file=..., content=... arguments are accepted.
No vault is required. Paths are relative to the caller's current directory.
From an app terminal, 'yhwh open file' opens in that terminal's app tab.
The yhwh multiplexer discovers interface and external subcommands on PATH.
The built-in command set is intentionally smaller than Obsidian's CLI.
`;
async function stdin() { const chunks = []; for await (const chunk of process.stdin) chunks.push(chunk); return Buffer.concat(chunks).toString('utf8'); }
function option(args, name) { const i = args.indexOf(`--${name}`); const named = args.find(item => item.startsWith(`${name}=`)); return i >= 0 ? args[i + 1] : named?.slice(name.length + 1); }
function positional(args) { return args.filter((item, index) => !item.startsWith('--') && !/^(?:path|file|content)=/.test(item) && !(index > 0 && ['--content', '--theme', '--cwd', '--tab'].includes(args[index - 1]))); }
function required(value, message) { if (!value) throw new Error(message); return path.resolve(value); }
async function externalCommands(bin) { return [...sharedCLI.commands([bin]).keys()]; }
async function execute(executable, args, env = process.env) {
  process.exitCode = await sharedCLI.execute(executable,args,{env});
}
async function start(args) {
  if (!require('node:fs').existsSync(require('../../lib/paths.cjs').output('default', 'ui/renderer.js'))) throw new Error(`Build the app first: make -C ${root} build`);
  const env = { ...process.env, YHWH_NODE: process.execPath }; delete env.ELECTRON_RUN_AS_NODE;
  const flags = [...args];
  if (process.env.YHWH_TAB && !flags.includes('--tab')) flags.push('--tab', process.env.YHWH_TAB);
  // Chromium can reorder switches on a second-instance launch. Keep each
  // value attached to its switch instead of relying on adjacent argv items.
  const attached = [];
  for (let i = 0; i < flags.length; i++) {
    if (['--open', '--cwd', '--tab', '--theme'].includes(flags[i])) attached.push(`${flags[i]}=${flags[++i]}`);
    else attached.push(flags[i]);
  }
  await execute(require('../../lib/electron.cjs')(), [root, ...attached], env);
}
async function main(argv = process.argv.slice(2), bin = process.env.YHWH_BIN || path.join(root, 'bin')) {
  const [command, ...args] = argv;
  if (command && !command.startsWith('-') && !command.includes('/') && !command.includes('\\')) {
    const candidate = path.join(bin, `yhwh-${command}`);
    try { await fs.access(candidate, constants.X_OK); if ((await fs.stat(candidate)).isFile()) { execute(candidate, args); return; } } catch {}
  }
  if (['--help', '-h', 'help'].includes(command)) { process.stdout.write(help); return; }
  if (command === '--version') { console.log(require('../package.json').version); return; }
  if (command === 'commands' || command === '--commands') { console.log([...new Set([...builtin, ...await externalCommands(bin)])].sort().join('\n')); return; }
  if (command === 'completion') {
    const shell = args[0] || 'bash'; if (!['bash', 'zsh'].includes(shell)) throw new Error('Use completion bash or completion zsh.');
    process.stdout.write(await fs.readFile(require('../../lib/paths.cjs').etc('completions', `yhwh.${shell}`), 'utf8')); return;
  }
  const files = require('../../lib/files.cjs');
  const values = positional(args), filename = option(args, 'path') || option(args, 'file') || values[0];
  const textOption = option(args, 'content');
  if (command === 'config') { console.log(JSON.stringify(await require('../../src/yhwh-default/app/config.cjs').resolveConfig(path.resolve(filename || '.')), null, 2)); return; }
  if (command === 'read') { process.stdout.write(await fs.readFile(required(filename, 'read needs a path.'))); return; }
  if (command === 'create') {
    const target = required(filename, 'create needs a path.');
    const content = textOption ?? (!process.stdin.isTTY ? await stdin() : '');
    await fs.writeFile(target, content, { flag: args.includes('--overwrite') ? 'w' : 'wx' });
    if (args.includes('--open')) await start(['--open', target]);
    return;
  }
  if (command === 'append' || command === 'prepend') {
    const target = required(filename, `${command} needs a path.`);
    const text = textOption ?? (values.length > 1 ? values.slice(1).join(' ') : !process.stdin.isTTY ? await stdin() : '');
    if (command === 'append') await fs.appendFile(target, text);
    else { const original = await fs.readFile(target, 'utf8'); await fs.writeFile(target, text + original); }
    return;
  }
  if (command === 'list') {
    for (const item of await files.list(path.resolve(filename || '.'), args.includes('--all'))) console.log(`${item.directory ? 'd' : '-'} ${item.name}`);
    return;
  }
  if (command === 'move' || command === 'rename') {
    const source = required(filename, `${command} needs a source and destination.`), destination = values[1];
    if (!destination) throw new Error(`${command} needs a destination.`);
    if (command === 'rename' && /[/\\]/.test(destination)) throw new Error('rename takes a name. Use move for a different directory.');
    await files.move(source, command === 'rename' ? path.join(path.dirname(source), destination) : path.resolve(destination)); return;
  }
  if (command === 'search') {
    const needle = values[0]; if (!needle) throw new Error('search needs text.');
    const directory = path.resolve(values[1] || '.'); let count = 0;
    async function search(current) {
      for (const item of await files.list(current)) {
        if (item.symlink) continue;
        if (item.directory) { if (!['node_modules', 'build'].includes(item.name)) await search(item.path); }
        else if (item.size <= 2 * 1024 * 1024) {
          const buffer = await fs.readFile(item.path); if (buffer.includes(0)) continue;
          buffer.toString('utf8').split(/\r?\n/).forEach((line, index) => { if (line.toLowerCase().includes(needle.toLowerCase())) { console.log(`${item.path}:${index + 1}:${line}`); count++; } });
        }
      }
    }
    await search(directory); process.exitCode = count ? 0 : 1; return;
  }
  if (command === 'open') { await start(['--open', path.resolve(filename || '.'), ...args.filter((item, i) => item === '--theme' || args[i - 1] === '--theme')]); return; }
  const desktopArgs = [...argv];
  if (command && !command.startsWith('-')) {
    try { await fs.stat(command); } catch { throw new Error(`Unknown command or path: ${command}. Run yhwh help.`); }
    desktopArgs.splice(0, 1, '--open', path.resolve(command));
  }
  if (!desktopArgs.includes('--open') && !desktopArgs.includes('--cwd')) desktopArgs.push('--cwd', process.cwd());
  await start(desktopArgs);
}
module.exports = { main, externalCommands };
if (require.main === module) main().catch(error => { console.error(`yhwh: ${error.message}`); process.exitCode = 1; });
