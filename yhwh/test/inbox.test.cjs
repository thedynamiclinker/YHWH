const { test } = require('node:test');
const assert = require('node:assert/strict');
const { primarySender, alternateSenders, letters, emailLetters, midnightLetter, nextMidnightLetter, nextMidnight, startNight, nextStartupLetter, nextEmailLetter, senderFor } = require('../lib/inbox.cjs');
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
  const authored = [...letters, ...emailLetters];
  assert.equal(new Set(authored.map(letter => letter.id)).size, authored.length);
  for (const letter of authored) assert.ok(words[letter.textKey]?.length, letter.textKey);
  assert.match(words.letterNightMilk, /milky abe/);
  assert.match(words.letterNightForever, /forenbevf/);
  assert.match(words.letterNightKeyboard, /jst yue n me{30,}/);
  assert.match(words.letterBlockedYahoo, /nous, 二.*YAHWOOO!/s);
});

test('the emails arrive separately in source order and respect presence controls', () => {
  let state = { letters: [{ id: 'house', read: true, at: at(12) }], lastLetter: at(12) };
  assert.equal(emailLetters.length, 30);
  assert.deepEqual(emailLetters.slice(-2).map(letter => letter.id), ['genesis-book-of-roots', 'genesis-ld-lm']);
  for (const [index, expected] of emailLetters.entries()) {
    const now = at(12) + (index + 1) * letterInterval;
    assert.equal(nextEmailLetter(state, { now: now - 1 }), undefined);
    for (const options of [{ inbox: false }, { theme: 'dawkins' }, { theme: 'nietzsche' }]) {
      assert.equal(nextEmailLetter(state, { now, ...options }), undefined);
    }
    assert.equal(nextEmailLetter({ ...state, blockedYhwh: true }, { now }), undefined);
    assert.equal(nextEmailLetter(state, { now }), expected);
    state.letters.push({ id: expected.id, read: false, at: now });
    state.lastLetter = now;
    state = JSON.parse(JSON.stringify(state));
  }
  assert.equal(nextEmailLetter(state, { now: at(16) }), undefined);
  assert.equal(state.letters[0].read, true);
});

test('seedis is eligible only in the local midnight minute, once, respecting mail controls and spacing', () => {
  const state = { letters: [] };
  for (const now of [at(23, 59), at(0, 1), at(1), at(12)]) assert.equal(nextMidnightLetter(state, { now }), undefined);
  assert.equal(nextMidnightLetter(state, { now: at(0) }), midnightLetter);
  assert.equal(nextMidnightLetter(state, { now: at(0) + 59999 }), midnightLetter);
  for (const options of [{ inbox: false }, { theme: 'dawkins' }, { theme: 'nietzsche' }]) {
    assert.equal(nextMidnightLetter(state, { now: at(0), ...options }), undefined);
  }
  assert.equal(nextMidnightLetter({ ...state, blockedYhwh: true }, { now: at(0) }), undefined);
  assert.equal(nextMidnightLetter({ ...state, lastLetter: at(23, 59, 14) }, { now: at(0) }), undefined);
  const persisted = JSON.parse(JSON.stringify({ letters: [{ id: 'seedis', at: at(0), read: true }] }));
  assert.equal(nextMidnightLetter(persisted, { now: at(0, 0, 16) }), undefined);
  assert.equal(midnightLetter.sender, primarySender);
  assert.equal(midnightLetter.to, 'ʾbe');
  assert.deepEqual(midnightLetter.cc, ['𐤀be', 'אbe', 'Abe', 'abe']);
  assert.deepEqual(midnightLetter.bcc, ['ew']);
});

test('the next midnight follows local calendar days across DST and fractional UTC offsets', () => {
  const { spawnSync } = require('node:child_process');
  for (const [TZ, now, expected] of [
    ['America/Chicago', '2026-03-08T06:30:00Z', '2026-03-09T05:00:00.000Z'],
    ['America/Chicago', '2026-11-01T05:30:00Z', '2026-11-02T06:00:00.000Z'],
    ['Asia/Kathmandu', '2026-11-15T17:00:00Z', '2026-11-15T18:15:00.000Z'],
    ['UTC', '2026-11-15T23:59:59Z', '2026-11-16T00:00:00.000Z'],
  ]) {
    const program = `const { nextMidnight } = require(${JSON.stringify(require.resolve('../lib/inbox.cjs'))}); process.stdout.write(new Date(nextMidnight(Date.parse(${JSON.stringify(now)}))).toISOString());`;
    const result = spawnSync(process.execPath, ['-e', program], { env: { ...process.env, TZ }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, expected, TZ);
  }
  assert.equal(nextMidnight(at(0)), at(0, 0, 16));
});

test('Samuel and Exodus deliver independent, editable series with bundled images and citations', async () => {
  const { modeLetters, nextModeLetter, songOfTheSea, attachmentsFor } = require('../lib/inbox.cjs');
  const { createVerseStore } = require('../lib/verses.cjs');
  const { access } = require('node:fs/promises');
  const { etc } = require('../lib/paths.cjs');
  const verses = createVerseStore();
  const state = { letters: [] };
  let now = at(12);
  assert.equal(nextModeLetter(state, { level: 'genesis', now }), undefined);
  for (const [level, name, count] of [['samuel', 'Dave', 12], ['exodus', 'Mo', 12]]) {
    const series = modeLetters.filter(letter => letter.level === level);
    assert.equal(series.length, count);
    for (const letter of series) {
      const options = { level, now };
      assert.equal(nextModeLetter(state, options), letter);
      assert.equal(nextModeLetter(state, { ...options, inbox: false }), undefined);
      assert.equal(nextModeLetter({ ...state, blockedYhwh: true }, options), undefined);
      assert.equal(letter.to, name);
      assert.match(words[letter.textKey], new RegExp(name));
      if (letter.source) assert.equal(letter.source.url, songOfTheSea);
      for (const attachment of attachmentsFor(letter)) {
        assert.ok(attachment.alt);
        await access(etc('assets', 'mail', attachment.name));
      }
      if (letter.verse) assert.ok((await verses.get(letter.verse)).length, letter.verse);
      state.letters.push({ id: letter.id, at: now });
      state.lastLetter = now;
      assert.equal(nextModeLetter(state, { ...options, now: now + 1 }), undefined);
      now += letterInterval;
    }
    assert.equal(nextModeLetter(state, { level, now }), undefined);
  }
  const finale = modeLetters.filter(letter => letter.level === 'exodus').at(-1);
  assert.equal(finale.id, 'exodus-milk-and-honey');
  assert.match(words[finale.textKey], /\/mnt\/sinai[\s\S]*Linux Mint[\s\S]*MILK AND HONEY SAUCE/);
  assert.equal(modeLetters.filter(letter => letter.attachment).length, 7);
  for (const letter of emailLetters.slice(-2)) {
    assert.equal(letter.to, 'Abe');
    assert.equal(attachmentsFor(letter).length, 2);
    for (const attachment of attachmentsFor(letter)) await access(etc('assets', 'mail', attachment.name));
  }
});

test('only selected Dave letters can go astray, with a shared cooldown across modes and restarts', () => {
  const { modeLetters, nextModeLetter, nextMisdeliveredLetter } = require('../lib/inbox.cjs');
  const ids = ['samuel-return-shipping', 'samuel-cedar-revised', 'samuel-donkey-report'];
  assert.deepEqual(modeLetters.filter(letter => letter.mayMisdeliver).map(letter => letter.id), ids);
  let state = { letters: [], lastLetter: at(12) };
  const next = (level, now, flags = {}) => nextMisdeliveredLetter(state, { level, now, ...flags });
  assert.equal(next('genesis', at(12, 30)), undefined);
  state.letters.push({ id: 'house', at: at(12), read: true });
  assert.equal(next('genesis', at(12, 30) - 1), undefined);
  for (const level of ['dawkins', 'nietzsche', 'samuel']) assert.equal(next(level, at(12, 30)), undefined);
  for (const flags of [{ inbox: false }, { theme: 'dawkins' }, { theme: 'nietzsche' }]) {
    assert.equal(next('genesis', at(12, 30), flags), undefined);
  }
  state.blockedYhwh = true;
  assert.equal(next('genesis', at(12, 30)), undefined);
  state.blockedYhwh = false;
  state.lastLetter = at(12, 26);
  assert.equal(next('genesis', at(12, 30)), undefined);

  for (const [index, level] of ['genesis', 'exodus', 'yue'].entries()) {
    const now = at(12, 31) + index * 30 * 60000;
    const letter = next(level, now);
    assert.equal(letter.id, ids[index]);
    assert.equal(letter.to, 'Dave');
    state.letters.push({ id: letter.id, at: now, read: index === 0 });
    state.lastLetter = state.lastMisdelivery = now;
    state = JSON.parse(JSON.stringify(state));
    assert.equal(next('yue', now + 30 * 60000 - 1), undefined);
  }
  assert.equal(next('genesis', at(15)), undefined);
  const preceding = modeLetters.slice(0, modeLetters.findIndex(letter => letter.id === ids[0]));
  state.letters.push(...preceding.map(letter => ({ id: letter.id, at: at(12) })));
  assert.equal(nextModeLetter(state, { level: 'samuel', now: at(15) }).id, 'samuel-saul-armor');
  assert.equal(state.letters.find(letter => letter.id === ids[0]).read, true);
});

test('the first-root song opens once after privilege detection and retries a failed handoff', async t => {
  const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
  const { firstRoot } = require('../src/yhwh-default/app/exodus.cjs');
  const { songOfTheSea } = require('../lib/inbox.cjs');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'exodus-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const urls = [];
  const open = url => urls.push(url);
  assert.equal(await firstRoot(directory, open, () => false), false);
  assert.deepEqual(urls, []);
  await assert.rejects(firstRoot(directory, () => { throw new Error('browser failed'); }, () => true), /browser failed/);
  const calls = await Promise.all([firstRoot(directory, open, () => true), firstRoot(directory, open, () => true)]);
  assert.equal(calls.filter(Boolean).length, 1);
  assert.deepEqual(urls, [songOfTheSea]);
  assert.equal(new URL(urls[0]).searchParams.get('t'), '142');
  assert.equal(await firstRoot(directory, open, () => true), false);
});
