const fs = require('node:fs/promises');
const path = require('node:path');

function createVerseStore({ filename = require('./paths.cjs').etc('verses/we-the-nameless.json'), stateDirectory } = {}) {
  const editsFile = stateDirectory && path.join(stateDirectory, 'verse-commentary.json');
  return require('./verse-library.cjs').createVerseLibrary({
    loadData: async () => JSON.parse(await fs.readFile(filename, 'utf8')),
    loadEdits: async () => {
      if (!editsFile) return {};
      try { return JSON.parse(await fs.readFile(editsFile, 'utf8')).commentaries; }
      catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
    },
    persistEdits: async edits => {
      if (!editsFile) throw new Error('No commentary storage directory configured.');
      await fs.mkdir(stateDirectory, { recursive: true });
      await fs.writeFile(editsFile + '.tmp', JSON.stringify({ schemaVersion: 1, commentaries: edits }, null, 2) + '\n', { mode: 0o600 });
      await fs.rename(editsFile + '.tmp', editsFile);
    },
  });
}
module.exports = { createVerseStore };
