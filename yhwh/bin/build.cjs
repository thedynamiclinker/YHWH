#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
// Keep desktop assets in the npm distribution as well as the checkout's usr/.
const desktopAssets = path.resolve(__dirname, '../../usr/share');
if (fs.existsSync(desktopAssets)) fs.cpSync(desktopAssets, path.resolve(__dirname, '../etc/desktop'), { recursive: true });
for (const name of process.argv.length > 2 ? process.argv.slice(2) : ['default', 'three', 'obsidian', 'mobile']) {
  if (!['default','three','obsidian','mobile'].includes(name)) throw new Error(`Unknown interface: ${name}`);
  const result = spawnSync(process.execPath, [path.join(__dirname, name, name === 'obsidian' ? 'build.mjs' : 'build.cjs')], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
