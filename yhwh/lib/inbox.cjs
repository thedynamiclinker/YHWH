// Local literary mail, shared by the desktop, Three and mobile renderers.
const { sender: primarySender, messages: emailLetters } = require('../etc/default/yhwh-emails.json');
const { songOfTheSea, messages: modeLetters } = require('../etc/default/mode-mail.json');
const alternateSenders = ['jewvacation@gmail.com', 'yhwvacation@gmail.com', 'admin@yahoo.com'];
const { canReceiveLetter } = require('./presence.cjs');
const minute = 60000;
const midnightLetter = {
  id: 'seedis', title: 'seedis', textKey: 'letterSeedis', sender: primarySender,
  to: 'ʾbe', cc: ['𐤀be', 'אbe', 'Abe', 'abe'], bcc: ['ew'], format: 'markdown',
  attachment: 'biblical-polygyny.png',
  note: 'Original fictional correspondence from YHWH. Delivered locally; no email is sent.',
};
const letters = [
  midnightLetter,
  // Minutes after 21:00: a finite, sleepless night, crossing midnight.
  ...[
    ['night-intro', 17, 'a thought. call me', 'letterNightIntro', 'Genesis 12:2'],
    ['night-team', 68, 'team. very good people', 'letterNightTeam', 'Genesis 17:5'],
    ['night-deck', 131, 'Re: seed / confidential', 'letterNightDeck', 'Genesis 15:5'],
    ['night-moat', 183, 'abe are you awake', 'letterNightMoat', 'Genesis 15:18'],
    ['night-stars', 229, 'THE STARTS', 'letterNightStars', 'Genesis 15:5'],
    ['night-milk', 267, 'milky way. THAT way', 'letterNightMilk', 'Genesis 18:8'],
    ['night-names', 309, 'אבר / rebrand attached', 'letterNightNames', 'Genesis 17:5'],
    ['night-board', 348, 'board meeting happening NOW', 'letterNightBoard', 'Genesis 18:21'],
    ['night-pivot', 387, 'new idea new idea NEW IDEA', 'letterNightPivot', 'Genesis 13:16'],
    ['night-runway', 421, 'quick bridge round before the sun', 'letterNightRunway', 'Genesis 17:8'],
    ['night-forever', 466, 'forenbevf', 'letterNightForever', 'Genesis 17:7'],
    ['night-keyboard', 493, 'jst yue n me', 'letterNightKeyboard', 'Genesis 17:7'],
    ['night-dawn', 552, 'disregard previous cosmology', 'letterNightDawn', 'Genesis 18:4'],
  ].map(([id, afterMinutes, title, textKey, verse]) => ({ id, afterMinutes, title, textKey, verse, note: 'Original fictional correspondence after the YHWH-and-Abraham apocryphon in We The Nameless. The verse supplies the promise; the startup supplies its own problems.' })),
  ...[
    ['blocked-vacation', 5, 'out of office (still here)', 'letterBlockedVacation'],
    ['blocked-typo', 18, 'typo in the name of the lord', 'letterBlockedTypo'],
    ['blocked-yahoo', 37, 'ABE. acquisition closed', 'letterBlockedYahoo'],
  ].map(([id, afterBlockMinutes, title, textKey], index) => ({ id, afterBlockMinutes, title, textKey, sender: alternateSenders[index], verse: 'Genesis 17:5', note: 'Fictional local mail. New names, grand promises, and an entirely imaginary Yahoo acquisition.' })),
];

function nextMidnightLetter(state, options = {}) {
  const now = options.now ?? Date.now(), local = new Date(now);
  if (local.getHours() !== 0 || local.getMinutes() !== 0 || state.blockedYhwh) return;
  if (canReceiveLetter(state, midnightLetter.id, { ...options, now })) return midnightLetter;
}

function nextMidnight(now = Date.now()) {
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(0, 0, 0, 0);
  return next.getTime();
}

function startNight(state, now) {
  if (Number.isFinite(state.nightStartedAt)) return false;
  const start = new Date(now);
  if (start.getHours() < 7) start.setDate(start.getDate() - 1);
  start.setHours(21, 0, 0, 0);
  state.nightStartedAt = start.getTime();
  return true;
}

function nextStartupLetter(state, options = {}) {
  const now = options.now ?? Date.now(), hour = new Date(now).getHours();
  const ready = letter => canReceiveLetter(state, letter.id, { ...options, now });
  // The address changes work during the day too, but require an actual block.
  const reply = letters.find(letter => letter.afterBlockMinutes !== undefined && state.blockedYhwh
    && Number.isFinite(state.blockedAt) && now >= state.blockedAt + letter.afterBlockMinutes * minute && ready(letter));
  if (reply) return reply;
  if (!Number.isFinite(state.nightStartedAt) || (hour >= 7 && hour < 21)) return;
  return letters.find(letter => letter.afterMinutes !== undefined
    && now >= state.nightStartedAt + letter.afterMinutes * minute && ready(letter));
}

function nextEmailLetter(state, options) {
  if (state.blockedYhwh) return;
  return emailLetters.find(letter => canReceiveLetter(state, letter.id, options));
}

function nextModeLetter(state, options) {
  if (state.blockedYhwh) return;
  return modeLetters.find(letter => letter.level === options.level && canReceiveLetter(state, letter.id, options));
}

function attachmentsFor(letter) {
  return letter.attachments || (letter.attachment ? [{ name: letter.attachment, alt: letter.attachmentAlt }] : []);
}

function senderFor(state, letter) {
  if (letter.sender) return letter.sender;
  if (!state.blockedYhwh) return primarySender;
  // Ordinary work mail is blocked. His two night-time tangents migrate.
  if (letter.afterMinutes !== undefined || letter.id.startsWith('name-')) {
    const index = letters.findIndex(item => item.id === letter.id);
    return alternateSenders[(Math.max(0, index)) % alternateSenders.length];
  }
}

module.exports = { primarySender, alternateSenders, letters, emailLetters, modeLetters, songOfTheSea, midnightLetter, nextMidnightLetter, nextMidnight, startNight, nextStartupLetter, nextEmailLetter, nextModeLetter, attachmentsFor, senderFor };
