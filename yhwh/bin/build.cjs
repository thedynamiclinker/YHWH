#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const path = require('node:path');
for (const name of process.argv.length > 2 ? process.argv.slice(2) : ['default', 'three', 'obsidian']) {
  if (!['default','three','obsidian'].includes(name)) throw new Error(`Unknown interface: ${name}`);
  const result = spawnSync(process.execPath, [path.join(__dirname, name, name === 'obsidian' ? 'build.mjs' : 'build.cjs')], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
