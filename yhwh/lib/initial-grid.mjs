export const gridWidth = 5;
export const gridSize = gridWidth ** 2;
const header = '# initial-grid ';

export function gridSource(cells) {
  return Array.from({ length: gridWidth }, (_, row) =>
    Array.from({ length: gridWidth }, (_, col) => cells[row * gridWidth + col])
      .filter(Boolean).join(' | ')
  ).filter(Boolean).join('\n');
}

export function serializeGrid(cells) {
  return header + JSON.stringify(cells) + '\n' + gridSource(cells) + '\n';
}

export function readGrid(source) {
  const newline = source.indexOf('\n');
  if (!source.startsWith(header) || newline < 0) return null;
  try {
    const cells = JSON.parse(source.slice(header.length, newline));
    if (!cells || Array.isArray(cells) || typeof cells !== 'object') return null;
    if (Object.entries(cells).some(([index, command]) => !/^(?:[0-9]|1[0-9]|2[0-4])$/.test(index) || typeof command !== 'string' || !command.trim())) return null;
    return gridSource(cells) === source.slice(newline + 1).trim() ? cells : null;
  } catch { return null; }
}
