import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

export const wikiPattern = /^\[\[([^\]\n]+)\]\]/;
export const wikiLinks = {
  defineNodes: ['WikiLink'],
  parseInline: [{
    name: 'WikiLink', before: 'Link',
    parse(context, next, pos) {
      if (next !== 91 || context.char(pos + 1) !== 91) return -1;
      const match = wikiPattern.exec(context.slice(pos, context.end));
      return match ? context.addElement(context.elt('WikiLink', pos, pos + match[0].length)) : -1;
    },
  }],
};

class Marker extends WidgetType {
  constructor(text, type) { super(); this.text = text; this.type = type; }
  eq(other) { return this.text === other.text && this.type === other.type; }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'live-marker';
    if (this.type === 'QuoteMark') span.classList.add('live-blockquote-marker');
    if (this.type === 'TaskMarker') {
      span.dataset.taskMarker = '';
      span.setAttribute('role', 'checkbox');
      span.setAttribute('aria-label', 'Toggle task');
      span.setAttribute('aria-checked', String(this.text === '☑'));
    }
    span.textContent = this.text;
    return span;
  }
  ignoreEvent() { return false; }
}

const hidden = Decoration.replace({});
const mark = (className, attributes) => Decoration.mark({ class: className, attributes });
const inline = {
  Emphasis: ['live-emphasis', 'EmphasisMark'],
  StrongEmphasis: ['live-strong', 'EmphasisMark'],
  Strikethrough: ['live-strike', 'StrikethroughMark'],
  InlineCode: ['live-code', 'CodeMark'],
};
const decorateLine = (ranges, className, from) =>
  ranges.push(Decoration.line({ class: className }).range(from));
const containsSelection = (state, from, to) =>
  state.selection.ranges.some(range => range.from <= to && range.to >= from);

export function linkAt(state, position) {
  for (let node = syntaxTree(state).resolveInner(position, -1); node; node = node.parent) {
    const link = linkParts(state, node);
    if (link) return link;
  }
  return null;
}

function linkParts(state, node) {
  const { name, from, to } = node;
  if (name === 'WikiLink') {
    const parts = state.sliceDoc(from + 2, to - 2).split('|', 2);
    const href = parts[0].trim();
    return href && { href, wiki: true, start: parts[1] ? from + 3 + parts[0].length : from + 2, end: to - 2 };
  }
  if (!['Link', 'Autolink', 'URL'].includes(name)) return null;
  if (name === 'URL') {
    if (['Link', 'Autolink', 'Image', 'LinkReference'].includes(node.parent?.name)) return null;
    const value = state.sliceDoc(from, to);
    return { href: value.startsWith('www.') ? 'https://' + value : value, start: from, end: to };
  }
  const url = node.getChild('URL');
  if (!url) return null;
  const value = state.sliceDoc(url.from, url.to).replace(/^<(.*)>$/, '$1');
  const href = name === 'Autolink' && value.includes('@') && !value.includes(':') ? 'mailto:' + value : value;
  const end = name === 'Autolink' ? url.to : node.getChildren('LinkMark')[1]?.from;
  return href && end > from + 1 && { href, start: from + 1, end };
}

function decorations(view) {
  const { state } = view, ranges = [];
  const hide = (from, to) => { if (from < to) ranges.push(hidden.range(from, to)); };
  const visited = new Set();
  const tree = syntaxTree(state);
  for (const visible of view.visibleRanges) tree.iterate({
    from: visible.from, to: visible.to,
    enter({ name, from, to, node }) {
      const key = name + ':' + from + ':' + to;
      if (visited.has(key)) return;
      visited.add(key);
      const active = containsSelection(state, from, to);
      if (inline[name]) {
        const [style, delimiter] = inline[name];
        if (!active) for (const token of node.getChildren(delimiter)) hide(token.from, token.to);
        ranges.push(mark(style).range(from, to));
      } else if (/^(ATX|Setext)Heading[1-6]$/.test(name)) {
        const line = state.doc.lineAt(from);
        decorateLine(ranges, 'live-heading live-h' + name.at(-1), line.from);
        if (!active) for (const token of node.getChildren('HeaderMark')) {
          const markerLine = state.doc.lineAt(token.from);
          const spaces = state.sliceDoc(token.to, markerLine.to).match(/^[ \t]*/)[0].length;
          hide(token.from, token.to + spaces);
        }
      } else if (name === 'QuoteMark' || name === 'ListMark' || name === 'TaskMarker') {
        const line = state.doc.lineAt(from);
        if (name === 'QuoteMark') decorateLine(ranges, 'live-quote', line.from);
        if (!containsSelection(state, line.from, line.to)) {
          const value = state.sliceDoc(from, to);
          const glyph = name === 'QuoteMark' ? '▎' : name === 'TaskMarker' ? /x/i.test(value) ? '☑' : '☐' : /\d/.test(value) ? value : '•';
          ranges.push(Decoration.replace({ widget: new Marker(glyph, name) }).range(from, to));
        }
      } else if (name === 'FencedCode') {
        for (let line = state.doc.lineAt(Math.max(from, visible.from)); line.from < Math.min(to, visible.to); line = state.doc.line(line.number + 1)) {
          const edge = line.from <= from ? ' live-fence-start' : line.to >= to ? ' live-fence-end' : '';
          decorateLine(ranges, 'live-fence' + edge, line.from);
          if (line.number === state.doc.lines) break;
        }
      }
      const link = linkParts(state, node);
      if (link) {
        ranges.push(mark('live-link', { 'data-live-link': link.href, 'data-wiki': String(!!link.wiki) }).range(link.start, link.end));
        if (!active) {
          hide(from, link.start);
          hide(link.end, to);
        }
      }
    },
  });
  return Decoration.set(ranges, true);
}

export function liveMarkdown(follow) {
  return [
    ViewPlugin.fromClass(class {
      constructor(view) { this.decorations = decorations(view); }
      update(update) {
        if (update.docChanged || update.selectionSet || update.viewportChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) {
          this.decorations = decorations(update.view);
        }
      }
    }, { decorations: plugin => plugin.decorations }),
    EditorView.domEventHandlers({
      mousedown(event) {
        return event.button === 0 && !!(event.target.closest('[data-task-marker]')
          || (event.metaKey || event.ctrlKey) && event.target.closest('[data-live-link]'));
      },
      click(event, view) {
        const marker = event.target.closest('[data-task-marker]');
        if (marker) {
          const position = view.posAtDOM(marker);
          const tree = syntaxTree(view.state);
          const node = [tree.resolveInner(position, 1), tree.resolveInner(position, -1)].find(node => node.name === 'TaskMarker');
          if (node) {
            const value = view.state.sliceDoc(node.from, node.to);
            view.dispatch({ changes: { from: node.from, to: node.to, insert: /x/i.test(value) ? '[ ]' : '[x]' }, userEvent: 'input' });
            return true;
          }
        }
        const link = event.target.closest('[data-live-link]');
        if (!link || (!event.ctrlKey && !event.metaKey)) return false;
        follow({ href: link.dataset.liveLink, wiki: link.dataset.wiki === 'true', newTab: event.shiftKey });
        return true;
      },
    }),
  ];
}
