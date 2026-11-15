function verseNumbers(label) {
  const range = /^(\d+)\s*[-–]\s*(\d+)$/.exec(label);
  if (range && +range[2] >= +range[1] && +range[2] - +range[1] < 200) return Array.from({ length: +range[2] - +range[1] + 1 }, (_, i) => +range[1] + i);
  const single = /^(\d+)[a-z]?$/.exec(label);
  return single ? [+single[1]] : [];
}
module.exports = { verseNumbers };
