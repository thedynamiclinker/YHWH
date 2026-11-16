// Shared by the desktop, Three and mobile inboxes. Times use the device's clock.
const letterInterval = 5 * 60 * 1000;
const nameSource = {
  url: 'https://en.wiktionary.org/wiki/%E6%9B%B0',
  label: '曰 · Wiktionary',
  note: 'YHWH’s late-night wordplay about his name and the launcher icon. The linked entry supplies the character, meanings and readings.',
};
const nightLetters = [
  { id: 'name-icon', title: 'Abe. the icon.', textKey: 'letterNameIcon', source: nameSource },
  { id: 'name-get-it', title: 'Re: Abe. the icon.', textKey: 'letterNameGetIt', source: nameSource },
  { id: 'name-look', title: 'LOOK AT IT!', textKey: 'letterNameLook', source: nameSource },
  { id: 'name-yue', title: '曰', textKey: 'letterNameYue', source: nameSource },
];
function canReceiveLetter(presence, id, { now = Date.now(), inbox = true, theme = 'yhwh' } = {}) {
  return inbox && theme !== 'dawkins' && (theme !== 'nietzsche' || id === 'inspect')
    && !presence.letters.some(letter => letter.id === id)
    && (presence.lastLetter == null || now - presence.lastLetter >= letterInterval);
}
function nextNightLetter(presence, options = {}) {
  const hour = new Date(options.now ?? Date.now()).getHours();
  if (hour >= 6 && hour < 22) return;
  const next = nightLetters.find(letter => !presence.letters.some(received => received.id === letter.id));
  if (next && canReceiveLetter(presence, next.id, options)) return next;
}
module.exports = { letterInterval, nightLetters, canReceiveLetter, nextNightLetter };
