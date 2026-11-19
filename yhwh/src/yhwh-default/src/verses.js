import { marked } from 'marked';
import DOMPurify from 'dompurify';
import display from '../../../etc/verses/genesis-display.json';
import { text } from '../../../lib/text.cjs';
import copy from '../../../etc/default/text-verses.json';
const ui = text(copy);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function createVerseUI({ call, modal, notice }) {
  const updaters = new WeakMap();
  let catalog, theme, randomVerse, circusPair, generation = 0, visible = false;
  let collapsed = localStorage.getItem('yhwh:margin:collapsed') === 'true';
  const library = () => catalog ||= call('verse:catalog').then(books => books.filter(item => item.book === 'Genesis'));
  const unlocked = verses => { if (verses.some(verse => verse.book !== 'Genesis')) throw new Error('Only Genesis is available. The other books are still locked.'); return verses; };
  const get = reference => call('verse:get', reference).then(unlocked);
  const styled = (verse, key) => display[verse.id]?.[key] ? DOMPurify.sanitize(marked.parseInline(display[verse.id][key])) : escape(verse[key]);

  function block(initial, { commentary = false, compact = false } = {}) {
    const element = document.createElement('article');
    element.className = `verse-block${compact ? ' verse-compact' : ''}`;
    function render(verse, expanded = commentary) {
      element.dataset.verseId = verse.id;
      element.innerHTML = `<header class="verse-heading"><button type="button" data-open-verse title="${escape(ui('browse'))}">${escape(verse.reference)}</button></header>
        <div class="verse-columns"><div class="verse-english" lang="en">${styled(verse, 'english')}</div><div class="verse-original" lang="he" dir="rtl">${styled(verse, 'original')}</div></div>
        <details class="verse-commentary" ${expanded ? 'open' : ''}><summary>${escape(ui('commentary'))}${verse.commentaryEdited ? ` <small>· ${escape(ui('edited'))}</small>` : ''}</summary>
          <div class="verse-commentary-body"><p class="verse-commentary-text">${escape(verse.commentary || ui('no-commentary'))}</p><button type="button" data-edit-commentary>${escape(ui(verse.commentary ? 'edit-commentary' : 'add-commentary'))}</button>${verse.commentaryEdited ? `<button type="button" data-reset-commentary>${escape(ui('restore'))}</button>` : ''}</div></details>`;
      element.querySelector('[data-open-verse]').onclick = () => browse(verse.id).catch(error => notice(error.message));
      element.querySelector('[data-edit-commentary]').onclick = () => {
        const body = element.querySelector('.verse-commentary-body');
        body.innerHTML = `<form class="verse-commentary-form"><label>${escape(ui('commentary'))}<textarea rows="6" maxlength="200000" aria-label="${escape(ui('edit-commentary'))}">${escape(verse.commentary)}</textarea></label><div class="verse-edit-actions"><button type="button" data-cancel-commentary>${escape(ui('cancel'))}</button><button class="primary">${escape(ui('save'))}</button></div><p role="alert" hidden></p></form>`;
        body.querySelector('[data-cancel-commentary]').onclick = () => render(verse, true);
        body.querySelector('form').onsubmit = async event => {
          event.preventDefault();
          const form = event.currentTarget, button = form.querySelector('.primary'); button.disabled = true;
          try { changed(await call('verse:commentary', verse.id, form.querySelector('textarea').value)); notice(ui('saved')); }
          catch (error) { const message = form.querySelector('[role=alert]'); message.hidden = false; message.textContent = error.message; button.disabled = false; }
        };
        body.querySelector('textarea').focus();
      };
      const reset = element.querySelector('[data-reset-commentary]');
      if (reset) reset.onclick = async () => {
        reset.disabled = true;
        try { changed(await call('verse:commentary', verse.id, null)); notice(ui('restored')); }
        catch (error) { notice(error.message); reset.disabled = false; }
      };
    }
    updaters.set(element, verse => render(verse, element.querySelector('details').open));
    render(initial);
    return element;
  }
  function changed(verse) {
    if (randomVerse?.id === verse.id) randomVerse = verse;
    for (const element of document.querySelectorAll('.verse-block')) if (element.dataset.verseId === verse.id) updaters.get(element)?.(verse);
  }
  async function createCitation(reference, options) {
    const verses = await get(reference);
    const container = document.createElement('div'); container.className = 'verse-citation';
    for (const verse of verses) container.append(block(verse, options));
    return container;
  }
  async function hydrate(container) {
    for (const slot of container.querySelectorAll('[data-citation]')) {
      try { slot.replaceChildren(await createCitation(slot.dataset.citation, { compact: true })); }
      catch (error) { slot.textContent = error.message; }
    }
  }
  async function browse(reference = 'Genesis 1:1') {
    const dialog = modal(ui('browser'), `<p role="status">${escape(ui('loading'))}</p>`);
    const loading = dialog.querySelector('[role=status]');
    let books, initial;
    try { [books, initial] = await Promise.all([library(), get(reference)]); }
    catch (error) { if (loading.isConnected) loading.textContent = error.message; return; }
    if (!dialog.open || !loading.isConnected) return;
    const body = dialog.querySelector('.dialog-body');
    body.innerHTML = `<div class="verse-browser"><form class="verse-jump"><label for="verse-reference">${escape(ui('jump'))}</label><div><input id="verse-reference" name="reference" placeholder="Genesis 18:1" value="${escape(initial[0].reference)}" required><button class="primary">${escape(ui('go'))}</button></div></form>
      <div class="verse-navigation"><label>${escape(ui('book'))}<select name="book" aria-label="${escape(ui('book'))}">${books.map(item => `<option>${escape(item.book)}</option>`).join('')}</select></label><label>${escape(ui('chapter'))}<select name="chapter" aria-label="${escape(ui('chapter'))}"></select></label><label>${escape(ui('verse'))}<select name="verse" aria-label="${escape(ui('verse'))}"></select></label></div>
      <p class="verse-error" role="alert" hidden></p><div class="verse-selection"></div><footer class="verse-browser-footer"><button type="button" data-previous-verse>${escape(ui('previous'))}</button><small>${escape(ui('attribution'))}</small><button type="button" data-next-verse>${escape(ui('next'))}</button></footer></div>`;
    const browser = body.querySelector('.verse-browser'), book = browser.querySelector('[name=book]'), chapter = browser.querySelector('[name=chapter]'), verse = browser.querySelector('[name=verse]');
    const previous = browser.querySelector('[data-previous-verse]'), next = browser.querySelector('[data-next-verse]');
    let entries = [], request = 0;
    function chapters() { chapter.innerHTML = books.find(item => item.book === book.value).chapters.map(number => `<option>${escape(number)}</option>`).join(''); }
    function error(message) { const node = browser.querySelector('[role=alert]'); node.textContent = message; node.hidden = !message; }
    async function select(reference) {
      const current = ++request;
      try {
        const verses = await get(reference), first = verses[0];
        const options = await call('verse:chapter', first.book, first.chapter);
        if (current !== request || !browser.isConnected) return;
        book.value = first.book; chapters(); chapter.value = first.chapter; entries = options;
        verse.innerHTML = entries.map(item => `<option value="${escape(item.id)}">${escape(item.verse)}</option>`).join(''); verse.value = first.id;
        browser.querySelector('[name=reference]').value = first.reference;
        browser.querySelector('.verse-selection').replaceChildren(...verses.map(item => block(item)));
        const chapterList = books.find(item => item.book === first.book).chapters;
        previous.disabled = entries[0].id === first.id && first.chapter === chapterList[0];
        next.disabled = entries.at(-1).id === first.id && first.chapter === chapterList.at(-1);
        error('');
      } catch (failure) { if (current === request && browser.isConnected) error(failure.message); }
    }
    async function selectChapter() {
      const current = ++request;
      try {
        const options = await call('verse:chapter', book.value, chapter.value);
        if (current === request && browser.isConnected) await select(options[0].id);
      } catch (failure) { if (current === request) error(failure.message); }
    }
    book.onchange = () => { chapters(); selectChapter(); };
    chapter.onchange = selectChapter;
    verse.onchange = () => select(verse.value);
    browser.querySelector('form').onsubmit = event => { event.preventDefault(); select(browser.querySelector('[name=reference]').value); };
    async function step(direction) {
      const index = entries.findIndex(item => item.id === verse.value), target = entries[index + direction];
      if (target) return select(target.id);
      const chapters = books.find(item => item.book === book.value).chapters;
      const number = chapters[chapters.indexOf(chapter.value) + direction];
      if (number) {
        const current = ++request;
        try { const options = await call('verse:chapter', book.value, number); if (current === request && browser.isConnected) await select((direction < 0 ? options.at(-1) : options[0]).id); }
        catch (failure) { if (current === request) error(failure.message); }
      }
    }
    previous.onclick = () => step(-1); next.onclick = () => step(1);
    await select(reference);
  }
  async function margin(refresh = false) {
    const box = document.querySelector('#margin-box');
    if (!box || !theme) return;
    box.hidden = !visible || theme === 'dawkins';
    if (box.hidden) return;
    const current = ++generation, mode = theme;
    const title = mode === 'nietzsche' ? ui('circus') : ui('margin');
    box.innerHTML = `<header class="margin-header"><span>${escape(title)}</span><div>${mode === 'yhwh' ? `<button type="button" data-browse-verses>${escape(ui('browse'))}</button>` : ''}<button type="button" data-another-margin aria-label="${escape(ui(mode === 'yhwh' ? 'another-verse' : 'another-pair'))}">↻</button><button type="button" data-collapse-margin aria-label="${escape(ui('toggle-margin'))}" aria-expanded="${!collapsed}">${collapsed ? '＋' : '−'}</button></div></header><div class="margin-content" aria-live="polite" ${collapsed ? 'hidden' : ''}><p role="status">${escape(ui('loading'))}</p></div>`;
    box.querySelector('[data-browse-verses]')?.addEventListener('click', () => browse(randomVerse?.id).catch(error => notice(error.message)));
    box.querySelector('[data-another-margin]').onclick = () => margin(true);
    const content = box.querySelector('.margin-content');
    box.querySelector('[data-collapse-margin]').onclick = event => {
      collapsed = !collapsed; localStorage.setItem('yhwh:margin:collapsed', String(collapsed));
      content.hidden = collapsed; event.currentTarget.setAttribute('aria-expanded', String(!collapsed)); event.currentTarget.textContent = collapsed ? '＋' : '−';
    };
    try {
      if (mode === 'yhwh') {
        const selected = !refresh && randomVerse ? randomVerse : await call('verse:random', 'Genesis');
        if (current !== generation) return;
        randomVerse = selected; content.replaceChildren(block(selected, { compact: true }));
      } else {
        const selected = !refresh && circusPair ? circusPair : await call('circus');
        if (current !== generation) return;
        circusPair = selected;
        content.innerHTML = `<img class="circus-image" src="${escape(selected.image)}" alt="${escape(ui('cartoon-alt'))}"><p class="circus-quote">${escape(selected.quote)}</p><small><a href="${escape(selected.permalink)}">${escape(ui('original-pair'))} ↗</a></small>`;
      }
    } catch (error) {
      if (current !== generation) return;
      content.replaceChildren(Object.assign(document.createElement('p'), { className: 'muted', textContent: error.message }));
      if (mode === 'nietzsche') {
        content.append(Object.assign(document.createElement('a'), {
          href: 'https://nietzschefamilycircus.com/', textContent: 'Open the original site ↗',
        }));
      }
    }
  }
  return { createCitation, hydrate, browse,
    setVisible(value) { if (visible === value) return; visible = value; generation++; margin().catch(error => notice(error.message)); },
    setTheme(value) { if (theme === value) return; theme = value; generation++; margin().catch(error => notice(error.message)); },
  };
}
