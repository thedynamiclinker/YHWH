const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');

const systemDirs = ['/run/wrappers/bin', '/run/current-system/sw/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];

async function executable(name, directories = (process.env.PATH || '').split(path.delimiter)) {
  for (const directory of directories) {
    if (!directory) continue;
    const file = path.resolve(directory, name);
    try {
      await fs.access(file, constants.X_OK);
      if ((await fs.stat(file)).isFile()) return file;
    } catch {}
  }
  throw new Error(`Install ${name} and make it available on PATH.`);
}

module.exports = { executable, systemDirs };
