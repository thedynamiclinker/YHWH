import { EditorView, keymap, lineNumbers, highlightActiveLine, dropCursor, rectangularSelection } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { minimalSetup } from 'codemirror';
import { LanguageDescription, HighlightStyle, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { indentWithTab, moveLineUp, moveLineDown } from '@codemirror/commands';
import { foldGutter, foldKeymap } from '@codemirror/language';
import { searchKeymap } from '@codemirror/search';
import { liveMarkdown, wikiLinks, wikiPattern } from './live-markdown.js';
import { tags } from '@lezer/highlight';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const escapeAttribute = value => value.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
marked.use({ extensions: [{
  name: 'wikilink', level: 'inline', start: text => text.indexOf('[['),
  tokenizer(text) { const match = wikiPattern.exec(text); if (match) { const [href, label] = match[1].split('|'); return { type: 'wikilink', raw: match[0], href, label: label || href }; } },
  renderer(token) { return `<a class="internal-link" href="${escapeAttribute(token.href)}">${escapeAttribute(token.label)}</a>`; },
}] });
export function renderMarkdown(text, filename, context) {
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
const language = new Compartment(), presentation = new Compartment();
const markdownHeadings = HighlightStyle.define([
  { tag: tags.heading2, class: 'cm-header-2' },
  { tag: tags.heading3, class: 'cm-header-3' },
], { scope: markdownLanguage });

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

export async function createEditor(parent, file, changed, cursor, follow) {
  const view = new EditorView({
    parent,
    state: EditorState.create({ doc: file.content.replace(/\r\n/g, '\n'), extensions: [
      minimalSetup, editorTheme, EditorView.lineWrapping, EditorState.allowMultipleSelections.of(true),
      rectangularSelection(), dropCursor(), highlightActiveLine(), EditorView.contentAttributes.of({ spellcheck: 'false', autocorrect: 'off', 'aria-label': 'Document editor' }),
      keymap.of([indentWithTab, { key: 'Alt-ArrowUp', run: moveLineUp }, { key: 'Alt-ArrowDown', run: moveLineDown }, ...searchKeymap, ...foldKeymap]),
      language.of([]), presentation.of([]),
      EditorView.updateListener.of(update => {
        if (update.docChanged) changed(view.state.doc.toString());
        if (update.selectionSet || update.docChanged) { const pos = view.state.selection.main.head; const line = view.state.doc.lineAt(pos); cursor(line.number, pos - line.from + 1); }
      }),
    ] }),
  });
  await setLanguage(view, file.language, file.mode, follow);
  return view;
}

export function setEditorMode(view, name, mode, follow) {
  const extension = name === 'markdown' ? mode === 'live' ? liveMarkdown(follow) : [] : [lineNumbers(), foldGutter()];
  view.dispatch({ effects: presentation.reconfigure(extension) });
}

export async function setLanguage(view, name, mode, follow) {
  const description = LanguageDescription.matchLanguageName(languages, name, true);
  const support = name === 'markdown' ? markdown({ base: markdownLanguage, codeLanguages: languages, extensions: wikiLinks }) : description ? await description.load() : [];
  if (!view.dom.isConnected) return;
  const highlighting = name === 'markdown' ? [syntaxHighlighting(defaultHighlightStyle), syntaxHighlighting(markdownHeadings)] : [];
  view.dispatch({ effects: language.reconfigure([support, highlighting]) });
  setEditorMode(view, name, mode, follow);
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

export function languageNames() { return ['plain', ...new Set(['markdown', 'shell', ...languages.map(item => item.name.toLowerCase())])].sort(); }
