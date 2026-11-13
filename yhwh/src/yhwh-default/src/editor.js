import { EditorView, WidgetType, Decoration } from '@codemirror/view';
import { EditorState, StateField, Compartment } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { LanguageDescription } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { markdown } from '@codemirror/lang-markdown';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const escapeAttribute = value => value.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
marked.use({ extensions: [{
  name: 'wikilink', level: 'inline', start: text => text.indexOf('[['),
  tokenizer(text) { const match = /^\[\[([^\]\n]+)\]\]/.exec(text); if (match) { const [href, label] = match[1].split('|'); return { type: 'wikilink', raw: match[0], href, label: label || href }; } },
  renderer(token) { return `<a class="internal-link" href="${escapeAttribute(token.href)}">${escapeAttribute(token.label)}</a>`; },
}] });
export function renderMarkdown(text, filename) {
  const template = document.createElement('template');
  template.innerHTML = DOMPurify.sanitize(marked.parse(text), { FORBID_TAGS: ['style', 'input', 'form'], FORBID_ATTR: ['style'] });
  if (filename) {
    const normalized = filename.replace(/\\/g, '/');
    const base = `file://${normalized.startsWith('/') ? '' : '/'}${encodeURI(normalized).replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
    for (const image of template.content.querySelectorAll('img[src]')) {
      const source = image.getAttribute('src');
      if (!/^[a-z][\w+.-]*:/i.test(source)) image.src = new URL(source, base).href;
    }
  }
  return template.innerHTML;
}
const language = new Compartment(), live = new Compartment();

class MarkdownBlock extends WidgetType {
  constructor(text, from) { super(); this.text = text; this.from = from; }
  eq(other) { return this.text === other.text && this.from === other.from; }
  toDOM(view) {
    const element = document.createElement('div');
    element.className = 'markdown-rendered live-block';
    element.innerHTML = renderMarkdown(this.text, view.dom.closest('.document-content')?.dataset.filename);
    element.addEventListener('mousedown', event => {
      if (event.target.closest('a')) return;
      event.preventDefault();
      view.dispatch({ selection: { anchor: Math.min(this.from, view.state.doc.length) }, scrollIntoView: true });
      view.focus();
    });
    return element;
  }
  ignoreEvent() { return false; }
}

function preview(state) {
  const text = state.doc.toString(), decorations = [];
  let offset = 0;
  for (const token of marked.lexer(text)) {
    const from = offset;
    offset += token.raw.length;
    const to = offset - (token.raw.match(/\n*$/)?.[0].length || 0);
    if (to <= from || token.type === 'space') continue;
    const editing = state.selection.ranges.some(range => range.from <= to && range.to >= from);
    if (!editing) decorations.push(Decoration.replace({ widget: new MarkdownBlock(token.raw, from), block: true }).range(from, to));
  }
  return Decoration.set(decorations, true);
}
const livePreview = StateField.define({
  create: preview,
  update(value, transaction) { return transaction.docChanged || transaction.selection ? preview(transaction.state) : value; },
  provide: field => EditorView.decorations.from(field),
});

const editorTheme = EditorView.theme({
  '&': { height: '100%', color: 'var(--text)', background: 'transparent', fontSize: 'var(--editor-size)' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--editor-font)', lineHeight: '1.75' },
  '.cm-content': { padding: '22px 0 100px', maxWidth: 'var(--line-width)', margin: '0 auto', minHeight: '100%' },
  '.cm-line': { padding: '0 28px' },
  '.cm-gutters': { background: 'transparent', color: 'var(--faint)', border: 'none', fontSize: '11px' },
  '.cm-activeLineGutter, .cm-activeLine': { background: 'var(--active-line)' },
  '.cm-cursor': { borderLeftColor: 'var(--purple)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { background: '#6c56875c !important' },
  '.cm-panels': { background: 'var(--panel)', color: 'var(--text)' },
  '.cm-tooltip': { background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--line)' },
}, { dark: true });

export async function createEditor(parent, file, changed, cursor) {
  const view = new EditorView({
    parent,
    state: EditorState.create({ doc: file.content.replace(/\r\n/g, '\n'), extensions: [
      basicSetup, editorTheme, EditorView.lineWrapping,
      language.of([]), live.of([]),
      EditorView.updateListener.of(update => {
        if (update.docChanged) changed(view.state.doc.toString());
        if (update.selectionSet || update.docChanged) { const pos = view.state.selection.main.head; const line = view.state.doc.lineAt(pos); cursor(line.number, pos - line.from + 1); }
      }),
    ] }),
  });
  await setLanguage(view, file.language, file.mode !== 'source');
  return view;
}

export async function setLanguage(view, name, pretty) {
  const description = LanguageDescription.matchLanguageName(languages, name, true);
  const support = name === 'markdown' ? markdown({ codeLanguages: languages }) : description ? await description.load() : [];
  if (!view.dom.isConnected) return;
  view.dispatch({ effects: [language.reconfigure(support), live.reconfigure(name === 'markdown' && pretty ? [livePreview] : [])] });
}

export async function formatText(text, name) {
  const prettier = await import('prettier/standalone');
  if (name === 'json') {
    JSON.parse(text); // Validate, but don't round large numbers or drop duplicate keys.
    const [babel, estree] = await Promise.all([import('prettier/plugins/babel'), import('prettier/plugins/estree')]);
    return prettier.format(text, { parser: 'json-stringify', plugins: [babel.default || babel, estree.default || estree] });
  }
  if (name === 'html') {
    const html = await import('prettier/plugins/html');
    return prettier.format(text, { parser: 'html', plugins: [html.default || html] });
  }
  throw new Error('Pretty formatting is available for JSON and HTML. Markdown has Live Preview.');
}

export function languageNames() { return ['plain', ...new Set(['markdown', 'shell', ...languages.map(item => item.name.toLowerCase())])].sort(); }
