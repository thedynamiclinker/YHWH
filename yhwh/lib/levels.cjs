const { levels, stripe } = require('../etc/default/levels.json');

function levelAt(energy) {
  return levels.find(level => level.id === 'nietzsche' ? energy < 100 : energy <= level.energy) || levels.at(-1);
}

function freeEnergy({ theme, energy }) {
  if (theme === 'dawkins') return 0;
  const amount = Number(energy ?? 100);
  if (theme === 'nietzsche' && !(amount > 0 && amount < 100)) return 50;
  return Number.isFinite(amount) ? Math.max(0, Math.min(100, amount)) : 100;
}

function unlockedLevels(energy) {
  return levels.filter(level => level.energy <= energy);
}

function editionState(value) {
  const paid = levels.filter(level => level.offer);
  const unlocked = paid.find(level => level.energy === value?.unlocked)?.energy ?? 100;
  const position = value?.selected;
  const selected = Number.isInteger(position) && position > 100 && position <= unlocked ? position : undefined;
  return { unlocked, selected };
}

function nextUpgrade(unlocked) {
  return levels.find(level => level.energy > unlocked);
}

function addressCopy(text, level, nameIndex = 0) {
  const names = level.names;
  return names ? text?.replace(/\bAbe\b/gi, () => names[nameIndex % names.length]) : text;
}

module.exports = { stripe, levelAt, freeEnergy, unlockedLevels, editionState, nextUpgrade, addressCopy };
