import { EditorView, keymap, lineNumbers, highlightActiveLine, dropCursor, rectangularSelection } from '@codemirror/view';
import { EditorState, EditorSelection, Compartment, Prec } from '@codemirror/state';
import { minimalSetup } from 'codemirror';
import { HighlightStyle, syntaxHighlighting, syntaxTree, bracketMatching, indentUnit, foldGutter, foldKeymap } from '@codemirror/language';
import { languages, description } from '../../../lib/editor-language.mjs';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { indentWithTab, insertTab } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { liveMarkdown, wikiLinks, wikiPattern } from './live-markdown.js';
import { highlightTree, tags } from '@lezer/highlight';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import './editor.css';

const escapeAttribute = value => value.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
marked.use({ renderer: {
  checkbox({ checked }) {
    return `<span class="reading-task" role="checkbox" aria-disabled="true" aria-checked="${checked}">${checked ? '☑' : '☐'}</span> `;
  },
}, extensions: [{
  name: 'wikilink', level: 'inline', start: text => text.indexOf('[['),
  tokenizer(text) { const match = wikiPattern.exec(text); if (match) { const [href, label] = match[1].split('|'); return { type: 'wikilink', raw: match[0], href, label: label || href }; } },
  renderer(token) { return `<a class="internal-link" href="${escapeAttribute(token.href)}">${escapeAttribute(token.label)}</a>`; },
}] });
export function renderMarkdown(text, filename, context) {
  if (context === 'document') text = text.slice(markdownProperties(text).length);
  const template = document.createElement('template');
  const forbidden = ['style', 'input', 'form'], attributes = ['style'];
  if (context === 'chat') {
    forbidden.push('button', 'img', 'picture', 'video', 'audio', 'source', 'svg', 'math');
    attributes.push('id', 'name', 'class', 'autofocus', 'tabindex', 'contenteditable', 'download', 'ping', 'target');
  }
  template.innerHTML = DOMPurify.sanitize(marked.parse(text), { FORBID_TAGS: forbidden, FORBID_ATTR: attributes, ALLOW_DATA_ATTR: context !== 'chat' });
  if (context === 'chat') return template.innerHTML;
  const ids = new Set();
  for (const heading of template.content.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    const base = heading.textContent.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s+/g, '-');
    let id = base, index = 1;
    while (ids.has(id)) id = base + '-' + index++;
    if (id) { heading.id = id; ids.add(id); }
  }
  for (const video of template.content.querySelectorAll('video')) video.tabIndex = 0;
  if (filename) {
    const normalized = filename.replace(/\\/g, '/');
    const base = window.yhwh?.fileURL?.(normalized) || `file://${normalized.startsWith('/') ? '' : '/'}${encodeURI(normalized).replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
    for (const image of template.content.querySelectorAll('img[src]')) {
      const source = image.getAttribute('src');
      if (!/^[a-z][\w+.-]*:/i.test(source)) image.src = new URL(source, base).href;
    }
  }
  return template.innerHTML;
}

function markdownProperties(text) {
  const block = /^---[ \t]*\r?\n((?:[\s\S]*?\n)?)---[ \t]*(?:\r?\n|$)/.exec(text.slice(0, 8192));
  return block && /^[\w-]+[ \t]*:/m.test(block[1]) ? block[0] : '';
}

export function applyDocumentStyle(element, text) {
  const properties = markdownProperties(text);
  const classes = /^cssclasses[ \t]*:([^\n]*(?:\n[ \t]*-[ \t]+[^\n]*)*)/m.exec(properties)?.[1] || '';
  const settings = new Set(classes.match(/[\w-]+/g));
  element.classList.toggle('font-serif', settings.has('font-serif'));
  element.classList.toggle('font-mono', settings.has('font-mono') || settings.has('monospace'));
  element.classList.toggle('large-text', settings.has('large-text'));
}

const language = new Compartment(), presentation = new Compartment();
const markdownHeadings = HighlightStyle.define([1, 2, 3, 4, 5, 6].map(level => ({
  tag: tags['heading' + level], class: 'cm-header-' + level,
})), { scope: markdownLanguage });
const syntax = HighlightStyle.define([
  { tag: [tags.comment, tags.meta, tags.documentMeta, tags.quote], class: 'syntax-comment' },
  { tag: [tags.punctuation, tags.separator, tags.bracket], class: 'syntax-punctuation' },
  { tag: [tags.keyword, tags.modifier, tags.operatorKeyword], class: 'syntax-keyword' },
  { tag: [tags.operator, tags.escape], class: 'syntax-operator' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom, tags.color, tags.unit, tags.changed], class: 'syntax-value' },
  { tag: [tags.string, tags.character, tags.regexp, tags.attributeValue, tags.propertyName, tags.inserted], class: 'syntax-string' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.labelName, tags.namespace], class: 'syntax-function' },
  { tag: [tags.special(tags.variableName), tags.macroName], class: 'syntax-operator' },
  { tag: [tags.typeName, tags.className, tags.attributeName, tags.annotation], class: 'syntax-type' },
  { tag: [tags.tagName, tags.deleted, tags.invalid], class: 'syntax-tag' },
  { tag: [tags.link, tags.url], class: 'syntax-link' },
  { tag: tags.monospace, class: 'md-inline-code' },
  { tag: tags.strong, class: 'syntax-bold' },
  { tag: tags.emphasis, class: 'syntax-italic' },
  { tag: tags.strikethrough, class: 'syntax-strike' },
]);

const editorTheme = EditorView.theme({
  '&': { height: '100%', color: 'var(--write-ink)', background: 'transparent', fontSize: 'var(--document-font-size)' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--document-font)', lineHeight: 'var(--document-leading)' },
  '.cm-content': { padding: 'var(--document-top) 0 84px', maxWidth: 'var(--document-width)', margin: '0 auto', minHeight: '100%', caretColor: 'var(--write-blue)' },
  '.cm-line': { padding: '0 var(--document-gutter)' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 6px 0 10px' },
  '.cm-gutters': { background: 'var(--write-toolbar)', color: 'var(--write-muted)', border: 'none', fontSize: '.8em' },
  '.cm-activeLineGutter, .cm-activeLine': { background: 'var(--write-active)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--write-blue)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { background: 'var(--write-selection) !important' },
  '.cm-selectionMatch, .cm-searchMatch': { backgroundColor: 'var(--write-match)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--write-selected-match)' },
  '.cm-matchingBracket': { backgroundColor: 'var(--write-match)', outline: '1px solid var(--write-muted)' },
  '.cm-panels, .cm-tooltip': { background: 'var(--write-toolbar)', color: 'var(--write-ink)', borderColor: 'var(--write-line)' },
  '.cm-search input, .cm-search button': { background: 'var(--write-paper)', color: 'var(--write-ink)', border: '1px solid var(--write-line)', borderRadius: '4px' },
}, { dark: true });

function toggleMarkdownEmphasis(view, marker, nodeName) {
  const { state } = view, tree = syntaxTree(state), removed = new Set();
  const edit = state.changeByRange(range => {
    const { from, to } = range;
    for (let node = tree.resolveInner(from, 1); node; node = node.parent) {
      if (node.name !== nodeName || node.to < to) continue;
      const [open, close] = node.getChildren('EmphasisMark');
      if (!open || !close) continue;
      const whole = from === node.from && to === node.to;
      let contents = from === open.to && to === close.from;
      const nested = node.getChild(nodeName === 'Emphasis' ? 'StrongEmphasis' : 'Emphasis');
      if (nested?.from === open.to && nested.to === close.from) {
        const [innerOpen, innerClose] = nested.getChildren('EmphasisMark');
        contents ||= from === innerOpen?.to && to === innerClose?.from;
      }
      const inside = range.empty && from >= open.to && to <= close.from;
      if (!whole && !contents && !inside) continue;
      if (removed.has(node.from)) return { range };
      removed.add(node.from);
      const changes = state.changes([{ from: open.from, to: open.to }, { from: close.from, to: close.to }]);
      return { changes, range: range.map(changes) };
    }
    const left = from - marker.length, right = to + marker.length;
    if (range.empty && left >= 0 && state.sliceDoc(left, right) === marker + marker) {
      return { changes: { from: left, to: right }, range: EditorSelection.cursor(left) };
    }
    const span = EditorSelection.range(range.anchor + marker.length, range.head + marker.length);
    return {
      changes: { from, to, insert: marker + state.sliceDoc(from, to) + marker },
      range: span,
    };
  });
  view.dispatch({ ...edit, scrollIntoView: true, userEvent: 'input' });
  return true;
}

function insertMarkdownLink(view) {
  const { state } = view;
  view.dispatch({ ...state.changeByRange(({ from, to }) => {
    const label = state.sliceDoc(from, to);
    const insert = '[' + label + ']()';
    return { changes: { from, to, insert }, range: EditorSelection.cursor(label ? from + insert.length - 1 : from + 1) };
  }), scrollIntoView: true, userEvent: 'input' });
  return true;
}

function toggleMarkdownQuote(view) {
  const { state } = view, lines = new Set();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.empty ? range.to : range.to - 1).number;
    for (let line = first; line <= last; line++) lines.add(line);
  }
  const quote = /^([ \t]{0,3})> ?/;
  const selected = [...lines].sort((a, b) => a - b).map(number => state.doc.line(number));
  const unwrap = selected.every(line => quote.test(line.text));
  const changes = selected.map(({ from, text }) => {
    const existing = quote.exec(text);
    return unwrap ? { from: from + existing[1].length, to: from + existing[0].length } : { from, insert: '> ' };
  });
  view.dispatch({ changes, scrollIntoView: true, userEvent: 'input' });
  return true;
}

const markdownKeys = Prec.high(keymap.of([
  { key: 'Mod-b', run: view => toggleMarkdownEmphasis(view, '**', 'StrongEmphasis') },
  { key: 'Mod-i', run: view => toggleMarkdownEmphasis(view, '*', 'Emphasis') },
  { key: 'Mod-k', run: insertMarkdownLink },
  { key: 'Mod-Shift-c', run: view => {
    // Keep fences on their own lines even when a selection starts mid-line.
    const { state } = view;
    view.dispatch({ ...state.changeByRange(({ from, to }) => {
      const before = (state.doc.lineAt(from).from === from ? '' : '\n') + '```\n';
      const after = '\n```' + (state.doc.lineAt(to).to === to ? '' : '\n');
      return { changes: { from, to, insert: before + state.sliceDoc(from, to) + after }, range: EditorSelection.range(from + before.length, to + before.length) };
    }), scrollIntoView: true, userEvent: 'input' });
    return true;
  } },
  { key: 'Mod-Shift-q', run: toggleMarkdownQuote },
]));

const markdownSupport = markdown({ base: markdownLanguage, codeLanguages: languages, extensions: wikiLinks });
export async function loadEditorLanguage(name) {
  if (name === 'markdown') return markdownSupport;
  return description(name)?.load();
}

export function highlightMarkdownBlocks(container) {
  let budget = 250000;
  for (const block of container.querySelectorAll('pre > code[class]')) {
    const name = [...block.classList].find(value => value.startsWith('language-'))?.slice(9);
    if (!name) continue;
    const text = block.textContent;
    if (text.length > 50000 || text.length > budget) continue;
    budget -= text.length;
    loadEditorLanguage(name).then(support => {
      if (!support || !block.isConnected) return;
      const output = document.createDocumentFragment();
      let position = 0;
      highlightTree(support.language.parser.parse(text), syntax, (from, to, classes) => {
        if (position < from) output.append(text.slice(position, from));
        const token = document.createElement('span');
        token.className = classes;
        token.textContent = text.slice(from, to);
        output.append(token);
        position = to;
      });
      if (position < text.length) output.append(text.slice(position));
      block.replaceChildren(output);
    }).catch(() => {}); // The rendered code stays readable if a language fails to load.
  }
}

function languageExtensions(name, support) {
  const indentation = indentUnit.of(['markdown', 'makefile'].includes(name) ? '\t' : '    ');
  return [support || [], indentation, name === 'markdown' ? [syntaxHighlighting(markdownHeadings), markdownKeys] : []];
}

function presentationExtensions(name, mode, follow) {
  if (name === 'markdown') return mode === 'live' ? liveMarkdown(follow) : [];
  return [lineNumbers(), name === 'plain' ? [] : foldGutter()];
}

export async function createEditor(parent, file, changed, cursor, follow) {
  const support = await loadEditorLanguage(file.language);
  const view = new EditorView({
    parent,
    state: EditorState.create({ doc: file.content.replace(/\r\n/g, '\n'), extensions: [
      minimalSetup, editorTheme, syntaxHighlighting(syntax), EditorView.lineWrapping,
      EditorState.allowMultipleSelections.of(true), EditorState.tabSize.of(4),
      rectangularSelection(), dropCursor(), highlightActiveLine(), bracketMatching(), highlightSelectionMatches(),
      EditorView.contentAttributes.of({ spellcheck: 'false', autocorrect: 'off', 'aria-label': 'Document editor' }),
      keymap.of([{ ...indentWithTab, run: target => target.state.selection.ranges.every(range => range.empty)
        && target.state.facet(indentUnit) === '\t' ? insertTab(target) : indentWithTab.run(target) }, ...searchKeymap, ...foldKeymap]),
      language.of(languageExtensions(file.language, support)), presentation.of(presentationExtensions(file.language, file.mode, follow)),
      EditorView.updateListener.of(update => {
        if (update.docChanged) changed(view.state.doc.toString());
        if (update.selectionSet || update.docChanged) { const pos = view.state.selection.main.head; const line = view.state.doc.lineAt(pos); cursor(line.number, pos - line.from + 1); }
      }),
    ] }),
  });
  return view;
}

export function setEditorMode(view, name, mode, follow) {
  view.dispatch({ effects: presentation.reconfigure(presentationExtensions(name, mode, follow)) });
}

export function setLanguage(view, name, mode, follow, support) {
  view.dispatch({ effects: [
    language.reconfigure(languageExtensions(name, support)),
    presentation.reconfigure(presentationExtensions(name, mode, follow)),
  ] });
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
  throw new Error('Pretty formatting is available for JSON and HTML. Markdown has a separate preview.');
}
