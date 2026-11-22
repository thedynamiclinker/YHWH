import { ItemView, type ViewStateResult, type WorkspaceLeaf } from 'obsidian';
import { builtinCards, builtinShapes } from '../../../lib/nhs/builtin.mjs';
import { parseMarkdown, type Card } from '../../../lib/nhs/cards.mjs';
import { mountNHS } from '../../../lib/nhs/view.mjs';

export const NHS = 'yhwh-new-human-school';

export class NHSView extends ItemView {
  private folder: string | null = null;
  private revision = 0;

  constructor(leaf: WorkspaceLeaf) { super(leaf); }
  getViewType() { return NHS; }
  getDisplayText() { return 'New Human School'; }
  getIcon() { return 'book-open'; }
  getState() { return { folder: this.folder }; }

  async setState(state: { folder?: string | null }, result: ViewStateResult) {
    await super.setState(state, result);
    this.folder = typeof state.folder === 'string' ? state.folder : null;
    await this.loadDeck();
  }

  async onOpen() { await this.loadDeck(); }
  async onClose() { this.revision++; this.contentEl.empty(); }

  private async loadDeck() {
    const revision = ++this.revision, folder = this.folder, container = this.contentEl;
    const close = () => this.leaf.detach();
    container.setText('Loading curriculum…');
    const reload = async () => {
      const files = this.app.vault.getMarkdownFiles().filter(file => !folder || file.path.startsWith(folder + '/'));
      const cards: Card[] = [];
      for (const file of files) {
        if (revision !== this.revision) break;
        cards.push(...parseMarkdown(await this.app.vault.cachedRead(file), file.path, builtinShapes));
      }
      return cards;
    };
    try {
      const cards = folder === null ? builtinCards() : await reload();
      if (revision === this.revision) mountNHS(container, {
        cards, close, reload: folder === null ? undefined : reload, source: folder === null ? 'Bundled curriculum' : folder || 'Vault root',
      });
    } catch (error) {
      if (revision !== this.revision) return;
      container.setText((error as Error).message);
      container.createEl('button', { text: 'Retry' }).onclick = () => { void this.loadDeck(); };
      container.createEl('button', { text: 'Close' }).onclick = close;
    }
  }
}
