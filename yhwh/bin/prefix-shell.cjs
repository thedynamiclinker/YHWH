// Print shell source commands; each profile runs once in the interactive shell.
const { configLocations, quote } = require('../src/yhwh-default/app/config.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
(async () => {
  const lines = [];
  for (const { directory: prefix } of await configLocations(process.cwd())) {
    if (!await fs.stat(prefix).then(stat => stat.isDirectory(), () => false)) continue;
    lines.push(`export YHWH_PREFIX=${quote(prefix)}`);
    const profile = path.join(prefix, 'etc/profile');
    lines.push(`[[ ! -f ${quote(profile)} ]] || . ${quote(profile)}`);
    if (process.argv.includes('--zsh')) {
      lines.push('[[ ! -f "$YHWH_PREFIX/${yhwh_zshrc_file:-etc/zshrc}" ]] || . "$YHWH_PREFIX/${yhwh_zshrc_file:-etc/zshrc}"');
    } else {
      lines.push('[[ ! -f "$YHWH_PREFIX/${yhwh_bashrc_file:-etc/bashrc}" ]] || . "$YHWH_PREFIX/${yhwh_bashrc_file:-etc/bashrc}"');
      lines.push('for __yhwh_completion in "$YHWH_PREFIX/${yhwh_completions_directory:-lib/bash/completions}"/*; do [[ ! -f "$__yhwh_completion" ]] || . "$__yhwh_completion"; done');
    }
  }
  process.stdout.write(lines.join('\n') + '\n');
})().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
