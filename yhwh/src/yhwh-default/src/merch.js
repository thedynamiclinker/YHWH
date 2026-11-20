import stores from '../../../etc/default/merch.json';

const progressKey = 'yhwh:merch-setup:v1';
const publicHostname = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?\.?$/i;
const connect = {
  id: 'connect',
  title: 'Connect the public storefront',
  body: 'Paste the public HTTPS shop address. Use Test in browser to check what shoppers see before saving.',
};

function publicStoreUrl(value) {
  if (typeof value !== 'string' || !/^https:\/\/[^\s\\]+$/i.test(value.trim())) return '';
  try {
    const url = new URL(value.trim());
    if (!publicHostname.test(url.hostname) || url.username || url.password || url.search || url.hash ||
      /^(?:admin\.(?:shopify|fourthwall)\.com|my-shop\.fourthwall\.com)\.?$/i.test(url.hostname) ||
      /^\/admin(?:\/|$)/i.test(url.pathname)) return '';
    return url.href;
  } catch { return ''; }
}

export function createMerch({ modal, escape, call, settings, saveSettings }) {
  const entries = Object.entries(stores);
  const urlFor = store => publicStoreUrl(settings()[store.setting]);
  const labelFor = store => urlFor(store) ? `${store.label} storefront (opens in browser)` : `${store.label} setup guide`;
  let progress;
  try { progress = JSON.parse(localStorage.getItem(progressKey)); } catch {}
  progress ||= {};
  function saveProgress(id, state) {
    const next = { ...progress, [id]: state };
    localStorage.setItem(progressKey, JSON.stringify(next));
    progress = next;
  }

  function guide(id) {
    const store = stores[id], steps = [...store.steps, connect];
    const previous = progress[id];
    let index = Math.max(0, steps.findIndex(step => step.id === previous?.step));
    let completed = new Set(Array.isArray(previous?.completed) ? previous.completed : []);
    let draft = settings()[store.setting] || '';
    const dialog = modal(`${store.label} setup`, `<div class="merch-guide"></div>`);
    const host = dialog.querySelector('.merch-guide');
    const render = () => {
      const step = steps[index], final = step === connect;
      const count = steps.filter(item => completed.has(item.id)).length;
      host.innerHTML = `${index === 0 ? `<p class="merch-intro">${escape(store.intro)}</p>` : ''}
        <p class="merch-progress"><small>Step ${index + 1} of ${steps.length} · <span data-merch-count aria-live="polite">${count} complete</span></small></p>
        <div class="setup-step">
          <h3 tabindex="-1">${escape(step.title)}</h3>
          <p>${escape(final && store.launch ? `${store.launch} ${step.body}` : step.body)}</p>
          ${final ? `<form data-merch-form novalidate>
            <label class="field"><span>Public storefront URL</span><input name="storefront" type="url" inputmode="url" autocomplete="off" spellcheck="false" aria-describedby="merch-status" value="${escape(draft)}"></label>
            <div class="merch-actions"><button type="button" data-merch-test>Test in browser ↗</button><button type="submit" class="primary">Save URL</button><button type="button" data-merch-clear ${settings()[store.setting] ? '' : 'disabled'}>Clear saved URL</button></div>
          </form>` : `<div class="merch-actions">${step.links.map(([label, url]) => `<button type="button" data-url="${escape(url)}">${escape(label)} ↗</button>`).join('')}</div>`}
          <label class="merch-check"><input type="checkbox" ${completed.has(step.id) ? 'checked' : ''}> Mark step complete</label>
          <small id="merch-status" data-merch-status role="status"></small>
        </div>
        <div class="dialog-actions merch-actions">
          <button type="button" data-merch-step="${index - 1}" ${index === 0 ? 'disabled' : ''}>Back</button>
          ${final ? '<button type="button" data-merch-done>Done</button>' : `<button type="button" data-merch-step="${steps.length - 1}">Storefront URL</button><button type="button" class="primary" data-merch-step="${index + 1}">Next</button>`}
        </div>`;
      const status = host.querySelector('[data-merch-status]');
      const report = (message, error = false) => { status.textContent = message; status.classList.toggle('warning', error); };
      const heading = host.querySelector('h3');
      const check = host.querySelector('.merch-check input');
      check.onchange = () => {
        const next = new Set(completed);
        if (check.checked) next.add(step.id);
        else next.delete(step.id);
        try {
          saveProgress(id, { step: step.id, completed: [...next] });
          completed = next;
          host.querySelector('[data-merch-count]').textContent = `${steps.filter(item => completed.has(item.id)).length} complete`;
        } catch (error) { check.checked = completed.has(step.id); report(error.message, true); }
      };
      for (const button of host.querySelectorAll('[data-merch-step]')) button.onclick = () => {
        const next = Number(button.dataset.merchStep);
        try { saveProgress(id, { step: steps[next].id, completed: [...completed] }); }
        catch (error) { report(error.message, true); return; }
        index = next;
        render();
      };
      if (final) {
        const form = host.querySelector('form'), input = form.elements.storefront;
        const clear = form.querySelector('[data-merch-clear]');
        input.oninput = () => { draft = input.value; input.removeAttribute('aria-invalid'); report(''); };
        const validated = () => {
          const url = publicStoreUrl(draft);
          if (url) return url;
          input.setAttribute('aria-invalid', 'true');
          report('Enter a public HTTPS storefront URL without sign-in details, query parameters, or a fragment.', true);
          input.focus();
        };
        form.querySelector('[data-merch-test]').onclick = async () => {
          const url = validated();
          if (url) try { await call('external', url); } catch (error) { report(error.message, true); }
        };
        const save = async url => {
          const controls = host.querySelectorAll('input:not(:disabled), button:not(:disabled)');
          controls.forEach(control => { control.disabled = true; });
          try {
            if (url !== (settings()[store.setting] || '')) await saveSettings(store.setting, url);
            draft = input.value = settings()[store.setting] || '';
            input.removeAttribute('aria-invalid');
            if (draft !== url) report('Saved the default URL. This workspace has a configuration override.', true);
            else report(url ? `URL saved. “${store.word}” now opens it in your browser.` : 'Storefront URL cleared.');
          } catch (error) { report(error.message, true); }
          finally {
            controls.forEach(control => { control.disabled = false; });
            clear.disabled = !settings()[store.setting];
          }
        };
        form.onsubmit = event => { event.preventDefault(); const url = validated(); if (url) void save(url); };
        clear.onclick = () => { void save(''); };
        host.querySelector('[data-merch-done]').onclick = () => dialog.close();
      }
      host.closest('.dialog-body').scrollTop = 0;
      heading.focus({ preventScroll: true });
    };
    render();
  }

  return {
    links: () => `<p class="merch-links">${entries.map(([id, store]) => `<button type="button" data-merch-store="${id}" title="${escape(labelFor(store))}" aria-label="${escape(store.word + ' · ' + labelFor(store))}">${store.word}</button>`).join(' ')}!</p>`,
    configured: () => entries.some(([, store]) => urlFor(store)),
    async open(id) {
      if (!Object.hasOwn(stores, id)) return;
      const url = urlFor(stores[id]);
      if (url) await call('external', url);
      else guide(id);
    },
    setup: () => modal('Merch store setup', `<div class="menu-list">${entries.map(([id, store]) => `<button type="button" data-merch-guide="${id}">${escape(store.label)} <span>Setup guide${urlFor(store) ? ' · Edit URL' : ''}</span></button>`).join('')}</div>`, dialog => {
      for (const button of dialog.querySelectorAll('[data-merch-guide]')) button.onclick = () => guide(button.dataset.merchGuide);
    }),
  };
}
