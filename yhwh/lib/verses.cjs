const fs = require('node:fs/promises');
const path = require('node:path');

function createVerseStore({ filename = require('./paths.cjs').etc('verses/we-the-nameless.json'), stateDirectory } = {}) {
  let loading, writing = Promise.resolve();
  const editsFile = stateDirectory && path.join(stateDirectory, 'verse-commentary.json');
  async function load() {
    return loading ||= (async () => {
      const data = JSON.parse(await fs.readFile(filename, 'utf8'));
      if (data.schemaVersion !== 1) throw new Error('Unsupported verse library format.');
      const byId = new Map(data.verses.map(verse => [verse.id, verse]));
      const books = new Map();
      const canonical = data.verses.filter(verse => !verse.variant && verse.chapter);
      for (const verse of canonical) {
        if (!books.has(verse.book)) books.set(verse.book, new Map());
        const chapters = books.get(verse.book);
        if (!chapters.has(verse.chapter)) chapters.set(verse.chapter, []);
        chapters.get(verse.chapter).push(verse);
      }
      let edits = {};
      if (editsFile) {
        try { edits = JSON.parse(await fs.readFile(editsFile, 'utf8')).commentaries; }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (!edits || typeof edits !== 'object' || Array.isArray(edits)) throw new Error('Invalid saved verse commentary.');
      }
      return { data, byId, books, canonical, edits };
    })();
  }
  function present(state, verse) {
    const override = state.edits[verse.id];
    return { ...verse, commentary: override?.text ?? verse.commentary, commentaryEdited: !!override };
  }
  async function chapter(book, number) {
    const state = await load();
    const name = [...state.books.keys()].find(name => name.toLowerCase() === String(book).toLowerCase());
    const verses = state.books.get(name)?.get(String(number));
    if (!verses) throw new Error(`Chapter not found: ${book} ${number}`);
    return verses.map(verse => ({ id: verse.id, verse: verse.verse, reference: verse.reference }));
  }
  async function get(reference) {
    const state = await load();
    if (typeof reference === 'string' && state.byId.has(reference)) return [present(state, state.byId.get(reference))];
    if (typeof reference === 'string') {
      const match = /^(?:(.+?)\s+)?(\d+):(\d+(?:[a-z]|[-–]\d+)?)$/i.exec(reference.trim());
      if (!match) throw new Error('Use a reference such as Genesis 18:1.');
      reference = { book: match[1] || 'Genesis', chapter: match[2], verse: match[3] };
    }
    if (!reference || typeof reference !== 'object') throw new Error('Choose a verse.');
    const book = [...state.books.keys()].find(name => name.toLowerCase() === String(reference.book || 'Genesis').toLowerCase());
    const verses = state.books.get(book)?.get(String(reference.chapter)) || [];
    const label = String(reference.verse), exact = verses.filter(verse => verse.verse === label);
    // Combined and split manuscript verses still answer ordinary references:
    // 2:7 finds 2:6–7; 49:24 finds both 24a and 24b.
    const requested = require('./verse-import.cjs').verseNumbers(label);
    const matches = exact.length ? exact : verses.filter(verse => verse.numbers.some(number => requested.includes(number)));
    if (!matches.length) throw new Error(`Verse not found: ${book || reference.book || 'Genesis'} ${reference.chapter}:${label}`);
    return matches.map(verse => present(state, verse));
  }
  async function saveCommentary(id, text) {
    const operation = writing.then(async () => {
      const state = await load();
      if (!state.byId.has(id)) throw new Error('Unknown verse.');
      if (text !== null && (typeof text !== 'string' || text.length > 200000)) throw new Error('Commentary must be text under 200,000 characters.');
      if (!editsFile) throw new Error('No commentary storage directory configured.');
      const edits = { ...state.edits };
      if (text === null) delete edits[id]; else edits[id] = { text, updatedAt: new Date().toISOString() };
      await fs.mkdir(stateDirectory, { recursive: true });
      await fs.writeFile(editsFile + '.tmp', JSON.stringify({ schemaVersion: 1, commentaries: edits }, null, 2) + '\n', { mode: 0o600 });
      await fs.rename(editsFile + '.tmp', editsFile);
      state.edits = edits;
      return present(state, state.byId.get(id));
    });
    writing = operation.catch(() => {});
    return operation;
  }
  return {
    async catalog() { const state = await load(); return [...state.books].map(([book, chapters]) => ({ book, chapters: [...chapters.keys()].sort((a, b) => +a - +b) })); },
    chapter, get, saveCommentary,
    async random() { const state = await load(); return present(state, state.canonical[Math.floor(Math.random() * state.canonical.length)]); },
  };
}
module.exports = { createVerseStore };
