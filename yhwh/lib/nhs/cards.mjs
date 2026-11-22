export const CARD = 'nhs.card/v1';
const DECK = 'nhs.deck/v1';
const PALEO = /[\u{10900}-\u{10915}]/u;
const HEBREW = 'אבגדהוזחטיכלמנסעפצקרשת';
const FINAL_FORMS = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };

export function toPaleo(text) {
  return text.replace(/[\u0591-\u05f4]/g, char => {
    const index = HEBREW.indexOf(FINAL_FORMS[char] ?? char);
    if (index >= 0) return String.fromCodePoint(0x10900 + index);
    if (/\p{Mark}/u.test(char)) return '';
    return char === '־' ? ' ' : char === '׃' ? ':' : char;
  });
}

export const isPaleo = text => PALEO.test(text);
export const gradeLabel = grade => grade === 0 ? 'Kindergarten' : 'Grade ' + grade;

const normalize = text => toPaleo(text.normalize('NFKC')).toLowerCase()
  .replace(/[’‘]/g, "'").trim().replace(/^[¡¿"]+|[.!?"]+$/g, '').trim().replace(/\s+/g, ' ');
export const matches = (card, guess) => [card.answer, ...card.aliases].some(answer => normalize(answer) === normalize(guess));

function scalar(text) {
  if (text.startsWith('"')) return JSON.parse(text);
  if (text.startsWith("'") && text.endsWith("'")) return text.slice(1, -1).replaceAll("''", "'");
  return text;
}

function aliases(value = '') {
  if (value.startsWith('[')) {
    if (!value.endsWith(']')) throw new Error('aliases must be an inline list');
    return value.slice(1, -1).match(/"[^"\\]*(?:\\.[^"\\]*)*"|'(?:[^']|'')*'|[^,'"]+/g)
      ?.map(item => scalar(item.trim())).filter(Boolean) ?? [];
  }
  return value.split(';').map(item => item.trim()).filter(Boolean);
}

function card(fields, body = '', shapes = {}) {
  const { track, id, kind = 'fact', shape = '' } = fields;
  if (!id || !['east', 'west'].includes(track)) throw new Error('each card needs an id and an east or west track');
  const sequence = Number(fields.order ?? 1);
  const grade = fields.grade === 'rtk' ? Math.ceil(sequence / 100) : Number(fields.grade === 'k' ? 0 : fields.grade);
  if (!Number.isSafeInteger(grade) || grade < 0 || !Number.isSafeInteger(sequence) || sequence < 1)
    throw new Error('each card needs a nonnegative grade and positive integer order');
  const glyph = (fields.glyph ?? '').trim();
  const answer = (fields.answer ?? '').trim();
  const image = fields.image || (Object.hasOwn(shapes, shape) ? shapes[shape] : '');
  if (!answer || (!glyph && !image)) throw new Error('each card needs an answer and a glyph or illustration');
  if (image && !/^data:image\/(?:svg\+xml|png|jpeg|webp);base64,[A-Za-z\d+/=]+$/.test(image))
    throw new Error('illustrations must be embedded SVG, PNG, JPEG or WebP data URLs');
  const prompt = fields.prompt || ({
    letter: 'Name this letter.',
    primitive: 'What image does this component stand for?',
    radical: 'What is the conventional name of this radical?',
    grammar: 'What does this form express in context?',
    word: 'What does this word mean?',
  })[kind] || 'What is its English keyword?';
  return {
    schema: CARD, id, track, grade, kind,
    order: fields.grade === 'rtk' ? (sequence - 1) % 100 + 1 : sequence,
    glyph: toPaleo(glyph), image,
    prompt: toPaleo(prompt), answer: toPaleo(answer), aliases: aliases(fields.aliases).map(toPaleo),
    hint: toPaleo(fields.hint || ''), mnemonic: toPaleo(fields.mnemonic || ''), body: toPaleo(body.trim()),
    source: fields.source || '', edition: fields.edition || '',
    ...(fields.grade === 'rtk' || fields.rtk ? { rtk: Number(fields.rtk || sequence) } : {}),
  };
}

const rowCells = line => line.trim().slice(1, -1).split(/(?<!\\)\|/).map(value => value.replaceAll('\\|', '|').trim());
function deck(fields, body, shapes) {
  let headers;
  const cards = [];
  for (const line of body.split('\n')) {
    if (!line.trim().startsWith('|') || !line.trim().endsWith('|')) continue;
    const cells = rowCells(line);
    if (!headers) {
      headers = cells.map(cell => cell.toLowerCase());
      if (!['order', 'glyph', 'answer'].every(key => headers.includes(key))) throw new Error('a deck table needs Order, Glyph and Answer columns');
      continue;
    }
    if (cells.every(cell => /^:?-+:?$/.test(cell))) continue;
    if (cells.length !== headers.length) throw new Error('deck row does not match its table header');
    const row = Object.fromEntries(headers.map((key, index) => [key, cells[index]]));
    cards.push(card({ ...fields, ...row, id: row.id || fields.id + '.' + row.order }, row.notes, shapes));
  }
  if (!cards.length || !fields.id) throw new Error('a deck needs an id and at least one card');
  return cards;
}

export function parseMarkdown(text, filename = 'stdin', shapes = {}) {
  const markdown = text.replace(/\r\n/g, '\n');
  const frontmatter = /^\uFEFF?---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(markdown);
  if (!frontmatter) return [];
  try {
    const lines = frontmatter[1].split('\n');
    const schema = lines.find(line => /^schema:\s*["']?nhs\./.test(line));
    if (!schema) return [];
    const fields = Object.fromEntries(lines.filter(line => /^\w+:/.test(line)).map(line => {
      const colon = line.indexOf(':');
      return [line.slice(0, colon), scalar(line.slice(colon + 1).trim())];
    }));
    const body = markdown.slice(frontmatter[0].length);
    if (fields.schema === CARD) return [card(fields, body, shapes)];
    if (fields.schema === DECK) return deck(fields, body, shapes);
    throw new Error('unknown schema ' + fields.schema);
  } catch (error) {
    throw new Error(`${filename}: ${error.message}`, { cause: error });
  }
}

export function selectCards(cards, { track = 'all', grade, learn = Infinity, limit = Infinity, shuffle = false } = {}) {
  const selection = [...new Map(cards.map(card => [card.id, card])).values()]
    .filter(card => (track === 'all' || card.track === track) && (grade === undefined || card.grade === grade))
    .sort((a, b) => a.grade - b.grade || a.order - b.order || a.id.localeCompare(b.id))
    .slice(0, learn);
  if (shuffle) for (let index = selection.length - 1; index > 0; index--) {
    const random = Math.floor(Math.random() * (index + 1));
    [selection[index], selection[random]] = [selection[random], selection[index]];
  }
  return selection.slice(0, limit);
}
