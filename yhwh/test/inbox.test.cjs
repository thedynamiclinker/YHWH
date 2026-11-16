const { test } = require('node:test');
const assert = require('node:assert/strict');
const { primarySender, alternateSenders, letters, startNight, nextStartupLetter, senderFor } = require('../lib/inbox.cjs');
const { canReceiveLetter, letterInterval } = require('../lib/presence.cjs');
const words = require('../etc/default/words.json');
const at = (hour, minute = 0, day = 15) => new Date(2026, 10, day, hour, minute).getTime();
const night = letters.filter(letter => letter.afterMinutes !== undefined);
const replies = letters.filter(letter => letter.afterBlockMinutes !== undefined);

test('the local overnight arc crosses midnight in order without duplicate mail after a restart', () => {
  let state = { letters: [] };
  assert.equal(startNight(state, at(20)), true);
  assert.equal(state.nightStartedAt, at(21));
  assert.equal(nextStartupLetter(state, { now: at(21) }), undefined);
  for (const expected of night) {
    const now = state.nightStartedAt + expected.afterMinutes * 60000;
    assert.equal(nextStartupLetter(state, { now }).id, expected.id);
    state.letters.push({ id: expected.id, sender: senderFor(state, expected), read: true, at: now });
    state.lastLetter = now;
    state = JSON.parse(JSON.stringify(state));
    assert.equal(nextStartupLetter(state, { now: now + letterInterval - 1 }), undefined);
    assert.equal(startNight(state, at(23, 0, 16)), false);
  }
  assert.equal(nextStartupLetter(state, { now: at(23, 0, 16) }), undefined);
  assert.ok(state.letters.every(letter => letter.read && letter.sender === primarySender));
});

test('early morning belongs to the previous evening and late arrivals never bypass the shared spacing', () => {
  const state = { letters: [] };
  startNight(state, at(3));
  assert.equal(state.nightStartedAt, at(21, 0, 14));
  assert.equal(nextStartupLetter(state, { now: at(3) }).id, night[0].id);
  state.lastLetter = at(3);
  assert.equal(nextStartupLetter(state, { now: at(3, 4) }), undefined);
  assert.equal(nextStartupLetter(state, { now: at(12) }), undefined);
});

test('muting and subdued modes suppress both ordinary night mail and block replies', () => {
  const state = { letters: [], nightStartedAt: at(21, 0, 14), blockedYhwh: true, blockedAt: at(22, 0, 14) };
  for (const options of [{ inbox: false }, { theme: 'dawkins' }, { theme: 'nietzsche' }]) {
    assert.equal(nextStartupLetter(state, { now: at(3), ...options }), undefined);
  }
  assert.equal(state.letters.length, 0);
});

test('blocking the exact address stops work mail and starts the three alternate-address replies', () => {
  let state = { letters: [{ id: 'house', read: true, at: at(11) }], blockedYhwh: true, blockedAt: at(12) };
  startNight(state, at(12));
  assert.equal(senderFor(state, { id: 'bread' }), undefined);
  assert.equal(canReceiveLetter(state, 'bread', { now: at(13) }), true);
  assert.equal(nextStartupLetter(state, { now: at(12, 4) }), undefined);
  for (const [index, expected] of replies.entries()) {
    const now = state.blockedAt + expected.afterBlockMinutes * 60000;
    assert.equal(nextStartupLetter(state, { now }).id, expected.id);
    assert.equal(senderFor(state, expected), alternateSenders[index]);
    state.letters.push({ id: expected.id, sender: senderFor(state, expected), at: now, read: false });
    state.lastLetter = now;
    state = JSON.parse(JSON.stringify(state));
  }
  assert.equal(nextStartupLetter(state, { now: at(14) }), undefined);
  assert.equal(state.letters[0].read, true);
  assert.ok(night.every(letter => alternateSenders.includes(senderFor(state, letter))));
  state.blockedYhwh = false;
  assert.equal(senderFor(state, { id: 'bread' }), primarySender);
  assert.equal(nextStartupLetter(state, { now: at(14) }), undefined);
});

test('all authored mail has editable text; the breakdown and Yahoo acquisition retain the requested words', () => {
  assert.equal(new Set(letters.map(letter => letter.id)).size, letters.length);
  for (const letter of letters) assert.ok(words[letter.textKey]?.length, letter.textKey);
  assert.match(words.letterNightMilk, /milky abe/);
  assert.match(words.letterNightForever, /forenbevf/);
  assert.match(words.letterNightKeyboard, /jst yue n me{30,}/);
  assert.match(words.letterBlockedYahoo, /nous, 二.*YAHWOOO!/s);
});
