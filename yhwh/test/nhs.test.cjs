const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const shapes = require('../etc/nhs/shapes.json');

test('NHS shares versioned facts and Paleo answer aliases between CLI and GUI', async () => {
  const { parseMarkdown, matches } = await import('../lib/nhs/cards.mjs');
  const markdown = `---
schema: "nhs.card/v1"
id: local.bet
track: west
grade: 0
kind: letter
glyph: "בּ"
answer: bet
aliases: ["beit", "B"]
---

A letter of the alphabet.
`.replaceAll('\n', '\r\n');
  const [card] = parseMarkdown(markdown);
  assert.equal(card.schema, 'nhs.card/v1');
  assert.equal(card.glyph, '𐤁');
  assert.match(card.body, /alphabet/);
  assert.equal(matches(card, ' BEIT ! '), true);
  assert.equal(matches(card, 'waw'), false);
  assert.deepEqual(parseMarkdown('---\ntitle: Ordinary note\n---\n'), []);
});

test('NHS selects a grade and learning range before randomizing', async () => {
  const { parseMarkdown, selectCards } = await import('../lib/nhs/cards.mjs');
  const read = filename => readFile(path.join(__dirname, '../etc/nhs/curriculum', filename), 'utf8');
  const kanji = parseMarkdown(await read('east-rtk.md'));
  const primitives = parseMarkdown(await read('east-primitives.md'), 'east-primitives.md', shapes);
  assert.equal(kanji.length, 3000);
  assert.equal(primitives.length, 441);
  assert.equal(primitives.filter(card => !card.glyph && card.image).length, 54);
  const range = selectCards(kanji, { track: 'east', grade: 2, learn: 8, shuffle: true, limit: 5 });
  assert.equal(range.length, 5);
  assert.equal(new Set(range.map(card => card.id)).size, 5);
  assert.ok(range.every(card => card.rtk >= 101 && card.rtk <= 108));
});
