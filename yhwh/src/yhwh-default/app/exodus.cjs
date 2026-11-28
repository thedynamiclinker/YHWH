const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { songOfTheSea } = require('../../../lib/inbox.cjs');

async function elevated() {
  if (process.geteuid) return process.geteuid() === 0;
  if (process.platform !== 'win32' || !process.env.SystemRoot) return false;
  const powershell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const command = '[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)';
  const result = await promisify(execFile)(powershell, ['-NoProfile', '-NonInteractive', '-Command', command],
    { windowsHide: true, timeout: 3000 }).catch(() => null);
  return result?.stdout.trim() === 'True';
}

async function firstRoot(directory, openExternal, isElevated = elevated) {
  if (!await isElevated()) return false;
  const stamp = path.join(directory, 'exodus-first-root');
  try { await fs.writeFile(stamp, new Date().toISOString() + '\n', { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code === 'EEXIST') return false; throw error; }
  try { await openExternal(songOfTheSea); }
  catch (error) { await fs.unlink(stamp); throw error; }
  return true;
}

module.exports = { firstRoot };
