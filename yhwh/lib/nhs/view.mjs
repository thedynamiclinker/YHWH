import { gradeLabel, isPaleo, matches, selectCards } from './cards.mjs';

export function mountNHS(container, { cards = [], close, reload, onResult, source = 'Bundled curriculum' } = {}) {
  const doc = container.ownerDocument;
  function node(tag, text = '', className = '') {
    const element = doc.createElement(tag);
    element.textContent = text;
    element.className = className;
    return element;
  }
  function button(text, action, className = '') {
    const control = node('button', text, className);
    control.type = 'button';
    control.addEventListener('click', action);
    return control;
  }
  function control(name, element) {
    const label = node('label', name);
    label.append(element);
    return label;
  }
  function choices(select, options) {
    select.replaceChildren(...options.map(([value, label]) => {
      const option = node('option', label);
      option.value = value;
      return option;
    }));
  }
  function glyph(card) {
    if (card.image) {
      const image = node('img', '', 'nhs-shape');
      image.src = card.image;
      image.alt = 'Illustrated component';
      return image;
    }
    const text = node('bdi', card.glyph, 'nhs-glyph');
    text.dir = isPaleo(card.glyph) ? 'rtl' : 'ltr';
    return text;
  }

  const view = node('section', '', 'nhs-view');
  view.setAttribute('aria-label', 'New Human School');
  const heading = node('header', '', 'nhs-heading');
  const title = node('div');
  title.append(node('h1', 'New Human School'), node('p', 'Super Advanced Kindergarten'));
  heading.append(title);
  if (close) heading.append(button('Back to workspace', close));
  const settings = node('div', '', 'nhs-controls');
  const track = node('select'), grade = node('select'), learn = node('input'), limit = node('input');
  choices(track, [['all', 'East & West'], ['east', 'East'], ['west', 'West']]);
  learn.type = limit.type = 'number';
  learn.min = limit.min = '1';
  learn.value = '20';
  limit.value = '10';
  settings.append(control('Track', track), control('Grade', grade), control('First N facts', learn),
    control('Questions', limit), button('Start practice', () => start()));
  const footer = node('footer', source);
  const status = node('div', '', 'nhs-session');
  status.setAttribute('aria-label', 'Practice session');
  view.append(heading, settings, status, footer);
  if (reload) {
    const message = node('span');
    message.setAttribute('role', 'status');
    const reloadButton = button('Reload cards', async () => {
      reloadButton.disabled = true;
      message.textContent = 'Reloading…';
      try {
        const next = await reload();
        if (view.isConnected) setCards(next);
        message.textContent = '';
      } catch (error) {
        message.textContent = error.message;
      } finally {
        reloadButton.disabled = false;
      }
    });
    footer.append(reloadButton, message);
  }
  container.replaceChildren(view);

  let round = [], missed = [], current = 0;
  function setGrades() {
    const previous = grade.value;
    const grades = [...new Set(cards.filter(card => track.value === 'all' || card.track === track.value).map(card => card.grade))].sort((a, b) => a - b);
    choices(grade, grades.map(value => [String(value), gradeLabel(value)]));
    if (grades.includes(Number(previous))) grade.value = previous || '0';
  }
  function start(retry) {
    if (!learn.reportValidity() || !limit.reportValidity()) return;
    round = retry || selectCards(cards, {
      track: track.value, grade: Number(grade.value), learn: learn.valueAsNumber || undefined,
      limit: limit.valueAsNumber || undefined, shuffle: true,
    });
    missed = [];
    current = 0;
    render();
  }
  function render(focus = false) {
    status.replaceChildren();
    if (!round.length) { status.append(node('p', 'No cards in this selection.')); return; }
    const card = round[current];
    if (!card) {
      status.append(node('h2', 'Session complete'), node('p', `${round.length - missed.length} of ${round.length} correct`));
      if (missed.length) {
        const review = node('ul', '', 'nhs-review');
        for (const missedCard of missed) {
          const row = node('li');
          row.append(glyph(missedCard), node('span', missedCard.answer));
          review.append(row);
        }
        const again = button('Practice missed cards', () => start(missed));
        status.append(review, again);
        if (focus) again.focus();
      } else {
        const again = button('Practice again', () => start());
        status.append(again);
        if (focus) again.focus();
      }
      return;
    }

    const progress = node('p', `${current + 1} / ${round.length}`, 'nhs-progress');
    const prompt = node('h2', card.prompt);
    prompt.dir = 'auto';
    const form = node('form', '', 'nhs-actions');
    const guess = node('input');
    guess.setAttribute('aria-label', 'Your answer');
    guess.dir = 'auto';
    guess.placeholder = 'Your answer';
    guess.autocomplete = 'off';
    guess.spellcheck = false;
    guess.required = true;
    const check = node('button', 'Check', 'nhs-primary');
    check.type = 'submit';
    form.append(guess, check, button('Reveal', () => reveal()));
    const feedback = node('div', '', 'nhs-feedback');
    feedback.setAttribute('aria-live', 'polite');
    if (card.hint) {
      const hint = node('details');
      hint.append(node('summary', 'Hint'), node('p', card.hint));
      status.append(progress, glyph(card), prompt, hint, form, feedback);
    } else status.append(progress, glyph(card), prompt, form, feedback);
    if (focus && !matchMedia('(pointer: coarse)').matches) guess.focus();

    function reveal(known) {
      if (form.hidden) return;
      form.hidden = true;
      const answer = node('bdi', card.answer);
      answer.dir = isPaleo(card.answer) ? 'rtl' : 'ltr';
      const verdict = node('p', known === undefined ? 'Answer · ' : known ? 'Correct · ' : 'Answer · ', 'nhs-verdict');
      verdict.append(answer);
      feedback.append(verdict);
      if (card.rtk) feedback.append(node('p', 'RTK frame ' + card.rtk));
      for (const detail of new Set([card.mnemonic, card.body])) if (detail) {
        const paragraph = node('p', detail);
        paragraph.dir = 'auto';
        feedback.append(paragraph);
      }
      function advance(correct) {
        if (!correct) missed.push(card);
        onResult?.({ correct }, card);
        current++;
        render(true);
      }
      const actions = node('div', '', 'nhs-actions');
      if (known === undefined) actions.append(button('Try again later', () => advance(false)), button('I knew it', () => advance(true), 'nhs-primary'));
      else actions.append(button('Next', () => advance(known), 'nhs-primary'));
      feedback.append(actions);
      actions.querySelector('button').focus();
    }
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (guess.value.trim()) reveal(matches(card, guess.value));
    });
  }

  track.onchange = () => { setGrades(); start(); };
  grade.onchange = () => start();
  function setCards(next) { cards = next; setGrades(); start(); }
  setCards(cards);
  return { setCards, destroy() { view.remove(); } };
}
