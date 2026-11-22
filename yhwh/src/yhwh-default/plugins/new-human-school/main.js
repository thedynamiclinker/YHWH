import { parseMarkdown } from '../../../../lib/nhs/cards.mjs';
import { mountNHS } from '../../../../lib/nhs/view.mjs';

const ID = 'new-human-school';

async function folderCards(api, tab, folder, current, shapes) {
  const cards = [];
  async function visit(directory) {
    for (const entry of await api.files.list(tab, directory)) {
      if (!current()) return;
      if (entry.parent || entry.symlink || entry.broken || entry.name.startsWith('.')) continue;
      if (entry.directory) await visit(entry.path);
      else if (/\.md$/i.test(entry.name)) {
        const file = await api.files.read(entry.path);
        if (file.kind === 'text') cards.push(...parseMarkdown(file.content, entry.path, shapes));
      }
    }
  }
  await visit(folder);
  return cards;
}

export default function installNHS(api) {
  api.addFocusView({ id: ID, title: 'New Human School', mount(container, { folder, tab, close }) {
    let mounted, generation = 0;
    async function load() {
      const request = ++generation;
      mounted?.destroy();
      container.textContent = 'Loading curriculum…';
      try {
        const current = () => generation === request;
        const { builtinCards, builtinShapes } = await import('../../../../lib/nhs/builtin.mjs');
        const reload = () => folderCards(api, tab, folder, current, builtinShapes);
        const cards = folder ? await reload() : builtinCards();
        if (!current()) return;
        mounted = mountNHS(container, { cards, close, source: folder || 'Bundled curriculum', reload: folder ? reload : undefined });
      } catch (error) {
        if (generation !== request) return;
        container.textContent = error.message;
        for (const [label, action] of [['Retry', load], ['Back to workspace', close]]) {
          const control = container.ownerDocument.createElement('button');
          control.type = 'button';
          control.textContent = label;
          control.onclick = action;
          container.append(control);
        }
      }
    }
    load();
    return () => { generation++; mounted?.destroy(); };
  } });
  api.addCommand({ id: ID, name: 'New Human School', run: () => api.showFocusView(ID) });
  api.addCommand({
    id: 'new-human-school-folder',
    name: 'New Human School · Practice this folder',
    run: () => api.showFocusView(ID, { folder: api.getFocus().cwd }),
  });
}
