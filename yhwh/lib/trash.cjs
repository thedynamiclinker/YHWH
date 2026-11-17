const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);

// Electron's trash integration is unavailable on some Linux desktops. Use
// the desktop's trash utilities as fallbacks; never substitute permanent rm.
async function trash(filename, nativeTrash) {
  let failure;
  if (nativeTrash) { try { await nativeTrash(filename); return; } catch (error) { failure = error; } }
  if (process.platform === 'linux') {
    for (const [command, args] of [['gio', ['trash', '--', filename]], ['trash-put', ['--', filename]]]) {
      try { await exec(command, args); return; } catch (error) { if (!failure || error.code !== 'ENOENT') failure = error; }
    }
  }
  throw new Error(`Could not move to Trash: ${failure?.message || 'No desktop trash service is available.'}`);
}
module.exports = { trash };
