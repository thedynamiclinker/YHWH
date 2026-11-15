const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

// Mask comments without changing offsets: raw fields below remain exact slices
// of the manuscript, including comments, whitespace and nested TeX macros.
function maskComments(text) {
  return text.replace(/\\[\s\S]|%[^\n]*/g, token => token[0] === '%' ? ' '.repeat(token.length) : token);
}
function group(text, start, open = '{', close = '}') {
  let i = start;
  while (/\s/.test(text[i] || '') && i < text.length) i++;
  if (text[i] !== open) throw new Error(`Expected ${open} at offset ${i}`);
  const begin = ++i;
  let depth = 1;
  while (i < text.length) {
    if (text[i] === '\\') { i += 2; continue; }
    if (text[i] === open) depth++;
    if (text[i] === close && --depth === 0) return { text: text.slice(begin, i), start: begin, end: i + 1 };
    i++;
  }
  throw new Error(`Unclosed ${open} at offset ${begin - 1}`);
}

// A display transcription, not a TeX engine. Exact TeX is kept alongside it.
// Formatting wrappers retain their content; layout arguments are discarded.
function toText(raw) {
  const input = maskComments(raw);
  const symbols = { mdash: '—', ndash: '–', ldots: '…', dots: '…', LaTeX: 'LaTeX', TeX: 'TeX',
    sim: '∼', approx: '≈', times: '×', tau: 'τ', Delta: 'Δ', gamma: 'γ', alpha: 'α', beta: 'β',
    Jerusalem: 'Jerusalem', Bethel: 'Bethel', GodInit: 'God', textbackslash: '\\' };
  const discard = { hspace: 1, vspace: 1, kern: 0, color: 1, colorlet: 2, label: 1, index: 1,
    pageref: 1, ref: 1, includegraphics: 1, input: 1, include: 1, setlength: 2,
    renewcommand: 2, newcommand: 2, rule: 2, Needspace: 1, phantom: 1, hphantom: 1, vphantom: 1 };
  function read(text) {
    let output = '';
    for (let i = 0; i < text.length;) {
      const char = text[i];
      if (char === '{') { const part = group(text, i); output += read(part.text); i = part.end; continue; }
      if (char !== '\\') { output += char === '~' ? ' ' : char === '&' ? ' | ' : char === '$' ? '' : char; i++; continue; }
      const match = /^\\([A-Za-z]+\*?|[^A-Za-z])/.exec(text.slice(i));
      if (!match) { i++; continue; }
      const name = match[1].replace(/\*$/, ''); i += match[0].length;
      if (['%', '&', '_', '#', '{', '}', '$'].includes(name)) { output += name; continue; }
      if (name === '\\' || name === 'nl') { output += '\n'; continue; }
      if (name === 'par' || name === 'medskip' || name === 'bigskip') { output += '\n\n'; continue; }
      if (name === 'item') { output += '\n• '; continue; }
      if (symbols[name]) { output += symbols[name]; continue; }
      if (name === ' ' || name === ',' || name === ';' || name === ':' || name === 'quad' || name === 'qquad') { output += ' '; continue; }
      const args = [];
      let next = i;
      while (/\s/.test(text[next] || '') && next < text.length) next++;
      if (text[next] === '[') { const optional = group(text, next, '[', ']'); next = optional.end; }
      const count = name === 'begin' || name === 'end' ? 1 : name in discard ? discard[name]
        : ['href', 'hyperlink', 'textcolor', 'colorbox', 'raisebox', 'scalebox', 'rotatebox', 'Table', 'frac', 'ruby'].includes(name) ? 2
          : name === 'multicolumn' ? 3 : 0;
      if (count) {
        for (let n = 0; n < count; n++) {
          const position = next;
          while (/\s/.test(text[next] || '') && next < text.length) next++;
          if (text[next] !== '{') { next = position; break; }
          const part = group(text, next); args.push(part.text); next = part.end;
        }
        i = next;
        if (name === 'begin' || name === 'end') {
          output += '\n\n';
          // Consume environment layout parameters, never their body.
          if (name === 'begin' && ['tabular', 'tabularx', 'minipage', 'together'].includes(args[0])) {
            while (/\s/.test(text[i] || '') && i < text.length) i++;
            if (text[i] === '[') i = group(text, i, '[', ']').end;
            while (/\s/.test(text[i] || '') && i < text.length) i++;
            if (text[i] === '{') i = group(text, i).end;
          }
        } else if (!(name in discard)) {
          output += name === 'frac' ? args.map(read).join('/') : read(args.at(-1) || '');
        }
        continue;
      }
      if (name === 'footnote') {
        if (text[next] === '{') { const note = group(text, next); output += ` [${read(note.text).trim()}]`; i = note.end; }
        continue;
      }
      // Other control words are style switches or wrappers. The next brace
      // group is read on the next iteration, so no unknown command drops text.
    }
    return output;
  }
  // Source line-wrapping is prose spacing; blank lines and explicit TeX line
  // breaks remain distinct. Protect explicit breaks before collapsing wraps.
  const prepared = input.replace(/\\(?:nl\b|\\)(?:\[[^\]]*\])?/g, '\uE000')
    .replace(/\n[\t ]*\n/g, '\uE001').replace(/[\t\r\n ]+/g, ' ');
  return read(prepared).replace(/\uE000/g, '\n').replace(/\uE001/g, '\n\n')
    .replace(/``/g, '“').replace(/''/g, '”').replace(/---/g, '—').replace(/--/g, '–')
    .replace(/[\t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function verseNumbers(label) {
  const range = /^(\d+)\s*[-–]\s*(\d+)$/.exec(label);
  if (range && +range[2] >= +range[1] && +range[2] - +range[1] < 200) return Array.from({ length: +range[2] - +range[1] + 1 }, (_, i) => +range[1] + i);
  const single = /^(\d+)[a-z]?$/.exec(label);
  return single ? [+single[1]] : [];
}

function parseFile(raw, filename, context = {}) {
  const text = maskComments(raw), records = [];
  const directory = filename.split('/')[0];
  let book = directory.replace(/^\d+-/, '').replace(/\b\w/g, letter => letter.toUpperCase());
  const volume = /^(\d)-/.exec(path.basename(filename));
  if (volume && ['Samuel', 'Kings'].includes(book)) book = `${volume[1]} ${book}`;
  let chapter = context.chapter ?? null, sentences = 0;
  const token = /\\(Chapter|Verse|Sentence|ApocryphonVerse)\b/g;
  for (let match; (match = token.exec(text));) {
    const name = match[1], fields = [];
    let end = token.lastIndex;
    const count = name === 'Chapter' ? 1 : name === 'Sentence' ? 3 : 4;
    try {
      for (let n = 0; n < count; n++) { const part = group(text, end); fields.push(raw.slice(part.start, part.end - 1)); end = part.end; }
    } catch (error) { throw new Error(`${filename}:${raw.slice(0, match.index).split('\n').length}: ${error.message}`); }
    token.lastIndex = end;
    if (name === 'Chapter') { chapter = toText(fields[0]); sentences = 0; continue; }
    if (name === 'Sentence') fields.unshift(String(++sentences));
    const label = toText(fields[0]);
    const slug = book.toLowerCase().replace(/ /g, '-');
    const base = `${slug}:${chapter || path.basename(filename, '.tex')}:${label}`;
    const variant = !/^(?:[12]-)?\d+\.tex$/.test(path.basename(filename));
    const occurrence = records.filter(record => record.chapter === chapter && record.verse === label).length;
    records.push({ id: `${base}@${filename}${occurrence ? `#${occurrence + 1}` : ''}`, book, chapter, verse: label,
      reference: `${book} ${chapter || ''}:${label}`, numbers: verseNumbers(label), variant,
      original: toText(fields[1]), english: toText(fields[2]), commentary: toText(fields[3]),
      tex: { label: fields[0], original: fields[1], english: fields[2], commentary: fields[3] },
      source: { file: filename, line: raw.slice(0, match.index).split('\n').length, macro: name } });
  }
  context.chapter = chapter;
  return records;
}

async function collect(source) {
  const files = [];
  for (const entry of (await fs.readdir(source, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || !/^[01][0-9]-/.test(entry.name)) continue;
    for (const name of (await fs.readdir(path.join(source, entry.name))).sort()) if (name.endsWith('.tex')) files.push(`${entry.name}/${name}`);
  }
  const verses = [], sources = [], contexts = new Map();
  for (const filename of files) {
    const raw = await fs.readFile(path.join(source, filename), 'utf8');
    const canonical = /^(?:[12]-)?\d+\.tex$/.test(path.basename(filename));
    const key = path.dirname(filename) + '/' + (/^([12])-/.exec(path.basename(filename))?.[1] || '');
    if (!contexts.has(key)) contexts.set(key, {});
    const entries = parseFile(raw, filename, canonical ? contexts.get(key) : {}); verses.push(...entries);
    sources.push({ file: filename, sha256: createHash('sha256').update(raw).digest('hex'), verses: entries.length });
  }
  const master = await fs.readFile(path.join(source, 'master.tex'), 'utf8');
  return { schemaVersion: 1, title: 'We The Nameless', sourceGlob: '[01][0-9]-*/*.tex',
    layout: { header: 'reference-between-rules', columns: ['english', 'original'], originalDirection: 'rtl', commentary: 'below' },
    masterSha256: createHash('sha256').update(master).digest('hex'), sources, verses };
}
module.exports = { collect, parseFile, toText, verseNumbers };
