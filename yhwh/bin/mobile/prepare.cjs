// Called by Gradle and Xcode as well as the documented Make workflow. Native
// Run/Archive must never silently package a stale copy of the shared core.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { root } = require('../../lib/paths.cjs');
const platform = process.argv[2];
if (!['android', 'ios'].includes(platform)) throw new Error('Use prepare.cjs android|ios');
for (const args of [
  [path.join(root, 'bin/build.cjs'), 'mobile'],
  [path.join(path.dirname(require.resolve('@capacitor/cli/package.json')), 'bin/capacitor'), 'copy', platform],
]) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
