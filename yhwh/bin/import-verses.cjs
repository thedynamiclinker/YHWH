#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { collect } = require('../lib/verse-import.cjs');
(async () => {
  const source = path.resolve(process.argv[2] || path.join(os.homedir(), 'obsidian/We The Nameless'));
  const destination = path.resolve(process.argv[3] || require('../lib/paths.cjs').etc('verses/we-the-nameless.json'));
  const data = await collect(source);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination + '.tmp', JSON.stringify(data, null, 2) + '\n');
  await fs.rename(destination + '.tmp', destination);
  console.log(`Imported ${data.verses.length} verses from ${data.sources.length} files into ${destination}`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
