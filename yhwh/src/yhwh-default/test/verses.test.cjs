const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { parseFile, toText } = require('../../../lib/verse-import.cjs');
const { createVerseStore } = require('../../../lib/verses.cjs');

test('verse import balances nested TeX, preserves exact raw fields and skips commented-out verses', () => {
  const raw = String.raw`% \Verse{99}{fake}{fake}{fake}
\Chapter{18}
\Verse{1}{\hJ{אב \textbf{גד}}}{\eJ{First \emph{nested} text.}}{
Paragraph one.\footnote{A note with \{escaped braces\}.}

Paragraph two. 100\% intact.
% \Verse{2}{not real}{not real}{not real}
}
\Verse{2}{\hJ{הו}}{\eJ{Another verse.}}{}`;
  const verses = parseFile(raw, '01-genesis/18.tex');
  assert.equal(verses.length, 2);
  assert.equal(verses[0].original, 'אב גד');
  assert.equal(verses[0].english, 'First nested text.');
  assert.match(verses[0].commentary, /A note with \{escaped braces\}\./);
  assert.match(verses[0].commentary, /\n\nParagraph two\. 100% intact\./);
  assert.match(verses[0].tex.commentary, /% \\Verse\{2\}/);
  assert.equal(verses[1].commentary, '');
  assert.equal(verses[0].source.line, 3);
});

test('display transcription keeps prose paragraphs, explicit verse lines and footnotes', () => {
  assert.equal(toText(String.raw`\eJ{And this
continues.}\nl \eP{A new line.}

A paragraph.\footnote{Still here.}`), 'And this continues.\nA new line.\n\nA paragraph. [Still here.]');
});

test('chapter context crosses source files, and commentary IDs survive preceding insertions', () => {
  const context = {};
  parseFile(String.raw`\Chapter{2}\Verse{24}{א}{one}{}`, '01-genesis/02.tex', context);
  const source = String.raw`\Verse{25}{ב}{two}{}\Chapter{3}\Verse{1}{ג}{three}{}`;
  const verses = parseFile(source, '01-genesis/03.tex', context);
  assert.deepEqual(verses.map(v => v.reference), ['Genesis 2:25', 'Genesis 3:1']);
  const original = parseFile(String.raw`\Chapter{18}\Verse{2}{א}{two}{}`, '01-genesis/18.tex');
  const inserted = parseFile(String.raw`\Chapter{18}\Verse{1}{א}{one}{}\Verse{2}{א}{two}{}`, '01-genesis/18.tex');
  assert.equal(original[0].id, inserted[1].id);
});

test('bundled library covers every manuscript file, all Genesis chapters, combined/split verses and distinct volumes', async () => {
  const data = JSON.parse(await fs.readFile(require('../../../lib/paths.cjs').etc('verses/we-the-nameless.json'), 'utf8'));
  assert.equal(data.sources.length, 340);
  assert.equal(data.verses.length, data.sources.reduce((total, source) => total + source.verses, 0));
  assert.equal(new Set(data.verses.map(v => v.id)).size, data.verses.length);
  for (const source of data.sources) assert.match(source.sha256, /^[0-9a-f]{64}$/);
  const store = createVerseStore();
  assert.equal((await store.catalog()).find(item => item.book === 'Genesis').chapters.length, 50);
  assert.equal((await store.get('Genesis 2:25'))[0].source.file, '01-genesis/03.tex');
  assert.equal((await store.get('Genesis 2:7'))[0].verse, '6-7');
  assert.deepEqual((await store.get('Genesis 49:24')).map(v => v.verse), ['24a', '24b']);
  assert.equal((await store.get('Genesis 28:16–17')).length, 2);
  assert.equal((await store.get('Genesis 14:1'))[0].source.file, '01-genesis/14.tex');
  assert.notEqual((await store.get('1 Samuel 1:1'))[0].id, (await store.get('2 Samuel 1:1'))[0].id);
  assert.equal((await store.get('Genesis 50:26'))[0].verse, '26');
  assert.equal(data.verses.filter(v => v.source.file === '01-genesis/14-raw.tex').length, 24);
  await assert.rejects(store.get('Genesis 51:1'), /not found/);
});

test('commentary saves atomically, persists per verse, accepts empty text, restores originals and keeps the import untouched', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yhwh-verses-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'library.json');
  const verses = parseFile(String.raw`\Chapter{18}\Verse{1}{אב}{English}{Original.}\Verse{2}{גד}{More}{}`, '01-genesis/18.tex');
  const original = JSON.stringify({ schemaVersion: 1, verses }); await fs.writeFile(filename, original);
  const store = createVerseStore({ filename, stateDirectory: directory });
  const commentary = 'Ah! There you are.\n\nHey Abe, can I stay with you for a bit?\n<script>plain text</script>';
  await Promise.all([store.saveCommentary(verses[0].id, commentary), store.saveCommentary(verses[1].id, '')]);
  const reopened = createVerseStore({ filename, stateDirectory: directory });
  assert.equal((await reopened.get(verses[0].id))[0].commentary, commentary);
  assert.equal((await reopened.get(verses[1].id))[0].commentaryEdited, true);
  await assert.rejects(store.saveCommentary('unknown', 'oops'), /Unknown/);
  await store.saveCommentary(verses[1].id, 'New commentary.');
  assert.equal((await store.saveCommentary(verses[0].id, null)).commentary, 'Original.');
  assert.equal((await store.get(verses[1].id))[0].commentary, 'New commentary.');
  assert.equal(await fs.readFile(filename, 'utf8'), original);
});


test('Genesis random selection stays within the available book', async () => {
  const store = createVerseStore();
  const verses = await Promise.all(Array.from({ length: 100 }, () => store.random('Genesis')));
  assert.ok(verses.every(verse => verse.book === 'Genesis' && !verse.variant));
  await assert.rejects(store.random('Unavailable'), /No verses/);
});

test('Genesis display retains mixed source spans and historical bidi encoding', async () => {
  const display = require('../../../etc/verses/genesis-display.json');
  const store = createVerseStore();
  const j = (await store.get('Genesis 18:1'))[0];
  assert.match(display[j.id].original, /source-j hebrew/);
  assert.match(display[j.id].english, /source-j english/);
  assert.match(display[j.id].original, /dir="rtl"/);
  assert.ok(Object.values(display).some(verse => /<bdo[^>]*dir="rtl"/.test(verse.original)));
  assert.ok(Object.values(display).some(verse => /source-j/.test(verse.original) && /source-p/.test(verse.original)));
});
