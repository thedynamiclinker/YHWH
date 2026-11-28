const { levels, stripe } = require('../etc/default/levels.json');
const [dawkins, nietzsche, samuel, genesis, exodus, zan] = levels;
const freeMaximum = exodus.energy;

function levelAt(energy = genesis.energy) {
  if (energy <= 0) return dawkins;
  if (energy < samuel.energy) return nietzsche;
  return levels.findLast(level => energy >= level.energy) || genesis;
}

function themeEnergy(theme) {
  if (theme === 'yhwh') return genesis.energy;
  if (theme === 'pro') return exodus.energy;
  return levels.find(level => level.id === theme && !level.offer)?.energy;
}

function freeEnergy({ theme, energy }) {
  const amount = Number(energy ?? genesis.energy);
  if (theme === 'dawkins') return 0;
  // Older settings used Nietzsche for the entire range below 100.
  if (theme === 'nietzsche') return amount > 0 && amount < samuel.energy ? amount : nietzsche.energy;
  if (['samuel', 'genesis', 'exodus', 'pro'].includes(theme)) {
    return amount <= freeMaximum && levelAt(amount).id === theme ? amount : themeEnergy(theme);
  }
  if (theme === 'yhwh' && amount >= samuel.energy && amount < genesis.energy) return nietzsche.energy;
  return Number.isFinite(amount) ? Math.max(0, Math.min(freeMaximum, amount)) : genesis.energy;
}

function unlockedLevels(energy) {
  return levels.filter(level => level.energy <= energy);
}

function editionState(value) {
  const unlocked = value?.unlocked === zan.energy ? zan.energy : freeMaximum;
  // Preserve previous Pro and Elite selections during the upgrade migration.
  const selected = value?.selected === exodus.energy || (unlocked === zan.energy && value?.selected === zan.energy)
    ? value.selected : undefined;
  return { unlocked, selected };
}

function nextUpgrade(unlocked) {
  return levels.find(level => level.offer && level.energy > unlocked);
}

function unstealUpgrade(value) {
  const { unlocked, selected } = editionState(value);
  if (unlocked !== zan.energy) return;
  return { unlocked: freeMaximum, selected: selected === zan.energy ? freeMaximum : selected };
}

function createLevelAsides() {
  const positions = new Map();
  return level => {
    const asides = level.asides;
    if (!asides?.length) return;
    const position = positions.get(level.id) ?? Math.floor(Math.random() * asides.length);
    positions.set(level.id, (position + 1) % asides.length);
    return asides[position];
  };
}

function addressCopy(text, level, nameIndex = 0) {
  const names = level.names;
  return names ? text?.replace(/\bAbe\b/gi, () => names[nameIndex % names.length]) : text;
}

module.exports = { stripe, levelAt, themeEnergy, freeEnergy, freeMaximum, unlockedLevels, editionState, nextUpgrade, unstealUpgrade, createLevelAsides, addressCopy };
