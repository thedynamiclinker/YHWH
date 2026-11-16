// Paths and keyboard events share this small, platform-independent vocabulary.
const modifiers = ['ctrl', 'alt', 'shift', 'meta'];
const aliases = { control: 'ctrl', command: 'meta', cmd: 'meta', option: 'alt', esc: 'escape', ' ': 'space', '`': 'backtick', ',': 'comma', '+': 'plus', '/': 'slash', '\\': 'backslash', '.': 'period', arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right', del: 'delete' };
function canonical(value, directory = false) {
  const parts = String(value).toLowerCase().replace(/\.(js|sh|py)$/, '').split('/').filter(Boolean).map(part => aliases[part] || part);
  const mods = modifiers.filter(mod => parts.includes(mod));
  const keys = parts.filter(part => !modifiers.includes(part));
  if (new Set(parts).size !== parts.length || keys.length > (directory ? 0 : 1) || (!directory && keys.length !== 1) || parts.some(part => !/^[a-z0-9][a-z0-9_-]*$/.test(part))) throw new Error('Use modifier directories followed by one key, such as ctrl/alt/k.js.');
  return [...mods, ...keys].join('/');
}
function fromEvent(event) {
  let key = event.key.toLowerCase();
  if (['control', 'alt', 'shift', 'meta', 'altgraph', 'dead', 'unidentified'].includes(key)) return '';
  // Shift changes the printed glyph on digit and punctuation keys.
  if (/^Digit[0-9]$/.test(event.code)) key = event.code.slice(-1);
  if (event.code === 'Backquote') key = 'backtick';
  if (event.code === 'Comma') key = 'comma';
  try { return canonical([...modifiers.filter(mod => event[`${mod === 'ctrl' ? 'ctrl' : mod}Key`]), aliases[key] || key].join('/')); } catch { return ''; }
}
const line = binding => [binding.combo, binding.kind, binding.command || '', binding.when || 'any', binding.filename || ''].map(value => String(value).replace(/[\t\r\n]/g, ' ')).join('\t');
const listing = bindings => bindings.map(line).join('\n') + (bindings.length ? '\n' : '');
function match(bindings, event, context = '') {
  const combo = typeof event === 'string' ? event : fromEvent(event);
  return bindings.find(binding => binding.combo === combo && (!binding.when || binding.when === context));
}
function filter(bindings, query) {
  query = query.trim();
  if (!query) return bindings;
  let expression;
  if (query.startsWith('/') && query.endsWith('/')) expression = new RegExp(query.slice(1, -1), 'i');
  else if (query.includes('*') || query.includes('?')) expression = new RegExp(query.split('').map(char => char === '*' ? '.*' : char === '?' ? '.' : char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(''), 'i');
  else expression = new RegExp(query, 'i');
  return bindings.filter(binding => expression.test(line(binding)));
}
module.exports = { modifiers, canonical, fromEvent, listing, filter, match };
