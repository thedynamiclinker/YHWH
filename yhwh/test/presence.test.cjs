const { test } = require('node:test');
const assert = require('node:assert/strict');
const { letterInterval, nightLetters, canReceiveLetter, nextNightLetter } = require('../lib/presence.cjs');
const { editionState, nextUpgrade, unstealUpgrade } = require('../lib/levels.cjs');
const at = (hour, minute = 0) => new Date(2026, 10, 15, hour, minute).getTime();

test('name letters use local night boundaries, including after midnight', () => {
  const presence = { letters: [] };
  for (const hour of [6, 12, 21]) assert.equal(nextNightLetter(presence, { now: at(hour) }), undefined);
  for (const hour of [22, 23, 0, 5]) assert.equal(nextNightLetter(presence, { now: at(hour) }).id, 'name-icon');
});

test('name joke advances once per letter with global spacing and survives serialization', () => {
  let presence = { letters: [{ id: 'house', at: at(21, 59), read: true }], lastLetter: at(21, 59) };
  assert.equal(nextNightLetter(presence, { now: at(22) }), undefined);
  let now = at(22, 4);
  for (const expected of nightLetters) {
    assert.equal(nextNightLetter(presence, { now }).id, expected.id);
    presence.letters.push({ id: expected.id, at: now, read: false });
    presence.lastLetter = now;
    presence = JSON.parse(JSON.stringify(presence));
    assert.equal(nextNightLetter(presence, { now: now + letterInterval - 1 }), undefined);
    assert.equal(canReceiveLetter(presence, 'bread', { now }), false);
    now += letterInterval;
  }
  assert.equal(nextNightLetter(presence, { now }), undefined);
  assert.equal(nextNightLetter(presence, { now: at(23, 59) }), undefined);
  assert.equal(presence.letters.length, 5);
});

test('inbox switch and modes suppress night mail without consuming the sequence', () => {
  const presence = { letters: [] }, now = at(23);
  for (const options of [{ inbox: false }, { theme: 'dawkins' }, { theme: 'nietzsche' }]) {
    assert.equal(nextNightLetter(presence, { now, ...options }), undefined);
  }
  assert.equal(nextNightLetter(presence, { now }).id, 'name-icon');
  assert.equal(canReceiveLetter(presence, 'inspect', { now, theme: 'nietzsche' }), true);
  assert.equal(canReceiveLetter(presence, 'house', { now, theme: 'nietzsche' }), false);
  assert.equal(canReceiveLetter({ letters: [], lastLetter: now + 1 }, 'house', { now }), false);
});

test('unstealing a preview relocks one tier and preserves any lower selection', () => {
  for (const [selected, expected] of [[140, 120], [120, 120], [undefined, undefined]]) {
    const pro = unstealUpgrade({ unlocked: 140, selected });
    assert.deepEqual(pro, { unlocked: 120, selected: expected });
    assert.equal(nextUpgrade(pro.unlocked).id, 'elite');

    const free = unstealUpgrade(pro);
    assert.deepEqual(editionState(JSON.parse(JSON.stringify(free))), { unlocked: 100, selected: undefined });
    assert.equal(nextUpgrade(free.unlocked).id, 'pro');
    assert.equal(unstealUpgrade(free), undefined);
  }
});
