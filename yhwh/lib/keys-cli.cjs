const { resolveConfig } = require('../src/yhwh-default/app/config.cjs');
const keys = require('./keys.cjs');
async function main(args) {
  const [command = 'list', value, target] = args;
  if (['--help', '-h', 'help'].includes(command)) {
    process.stdout.write('yhwh keys — ordinary files, effective keyboard bindings, one per line\nUsage: yhwh keys [list|paths] [DIRECTORY]\n       yhwh keys cd MODIFIERS [DIRECTORY]\nColumns: combo, kind, command, focus, source (tab separated).\nUse grep, sort, awk, editors, chmod and symlinks. Empty files disable inherited bindings.\n'); return 0;
  }
  const config = await resolveConfig(command === 'cd' ? target || process.cwd() : value || process.cwd());
  const loaded = await keys.load(config);
  if (command === 'paths') process.stdout.write(loaded.directories.join('\n') + '\n');
  else if (command === 'list') process.stdout.write(keys.listing(loaded.bindings));
  else if (command === 'cd') process.stdout.write(keys.listing(keys.namespace(loaded.bindings, `cd ${value || ''}`).bindings));
  else throw new Error('Use yhwh keys --help.');
  for (const warning of [...config.warnings, ...loaded.warnings]) process.stderr.write(warning + '\n');
  return 0;
}
module.exports = { main };
