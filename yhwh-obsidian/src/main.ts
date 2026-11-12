import { FileView, Modal, Notice, Plugin, PluginSettingTab, requestUrl, Setting, TFile, TFolder, WorkspaceLeaf } from 'obsidian';
import { ancestors, circusPair, config, COPY, CopyKey, isText, mode, parent, resolvePath, Settings, settings } from './core';
import { Navigator, ConsoleView, TextView, NAV, CONSOLE, TEXT, button, prompt } from './views';
import { Atlas, ATLAS } from './atlas';

export default class YHWH extends Plugin {
  settings!: Settings;
  current!: Settings;
  folder = '';
  circus?: { image: string; quote: string; permalink: string };
  circusBusy = false;
  circusError = '';
  configErrors: string[] = [];
  listeners = new Set<() => void>();
  private navigation = 0;
  private saving: Promise<void> = Promise.resolve();
  private status!: HTMLElement;
  private editor?: WorkspaceLeaf;
  private closed = false;

  async onload() {
    this.closed = false;
    this.settings = settings(await this.loadData());
    this.current = { ...this.settings };
    this.folder = this.app.vault.getAbstractFileByPath(this.settings.folder) instanceof TFolder ? this.settings.folder : '';
    this.registerView(NAV, leaf => new Navigator(leaf, this));
    this.registerView(CONSOLE, leaf => new ConsoleView(leaf, this));
    this.registerView(TEXT, leaf => new TextView(leaf, this));
    this.registerView(ATLAS, leaf => new Atlas(leaf, this));
    this.addRibbonIcon('flame', 'YHWH: open navigator', () => this.run(() => this.show(NAV)));
    this.status = this.addStatusBarItem();
    this.status.addClass('yhwh-status');
    this.registerDomEvent(this.status, 'click', () => this.help());
    const commands: Array<[string, string, () => unknown, string?]> = [
      ['open-navigator', 'Open navigator', () => this.show(NAV)],
      ['toggle-navigator', 'Toggle navigator', () => this.toggle(NAV), 'e'],
      ['focus-files', 'Toggle file manager in the workspace', () => this.toggleFilesFocus(), 'd'],
      ['toggle-console', 'Toggle navigation console', () => this.toggle(CONSOLE), 'b'],
      ['open-atlas', 'Open 3D directory', () => this.show(ATLAS)],
      ['up', 'Go to parent folder', () => this.go(parent(this.folder))],
      ['new-file', 'New file in current folder', () => this.newFile()],
      ['new-folder', 'New folder in current folder', () => this.newFolder()],
      ['reload-config', 'Reload folder configuration', () => this.go(this.folder)],
      ['hello-world', 'Hello world', () => new Notice(this.current.energy ? this.settings.copy.hello : 'Hello, world.')],
      ['offerings', 'Offerings', () => this.offerings()],
      ['help', 'Help and about', () => this.help()],
    ];
    for (const [id, name, callback, key] of commands) this.addCommand({ id, name,
      ...(key ? { hotkeys: [{ modifiers: ['Ctrl'], key }] } : {}),
      callback: () => this.run(callback),
    });
    this.addSettingTab(new YHWHSettings(this));
    this.registerEvent(this.app.workspace.on('file-open', file => {
      const view = this.app.workspace.getActiveViewOfType(FileView);
      if (view) this.editor = view.leaf;
      if (file && this.current.followActive) this.run(() => this.go(file.parent?.path ?? ''));
    }));
    const filesChanged = () => {
      if (this.folder && !(this.app.vault.getAbstractFileByPath(this.folder) instanceof TFolder)) this.run(() => this.go(''));
      else this.changed();
    };
    this.registerEvent(this.app.vault.on('create', filesChanged));
    this.registerEvent(this.app.vault.on('delete', filesChanged));
    this.registerEvent(this.app.vault.on('rename', filesChanged));
    this.registerObsidianProtocolHandler('yhwh', params => this.run(async () => {
      if (params.folder !== undefined) await this.go(resolvePath('', params.folder));
      if (params.file) {
        const file = this.app.vault.getAbstractFileByPath(resolvePath('', params.file));
        if (!(file instanceof TFile)) throw new Error('File not found.');
        await this.open(file);
      } else await this.show(params.view === '3d' ? ATLAS : params.view === 'console' ? CONSOLE : NAV);
    }));
    this.app.workspace.onLayoutReady(() => this.run(async () => {
      await this.go(this.folder);
      if (this.settings.autoOpen && !this.app.workspace.getLeavesOfType(NAV).length) await this.show(NAV);
    }));
  }

  run(action: () => unknown) {
    Promise.resolve().then(action).catch(error => { console.error('YHWH:', error); new Notice((error as Error).message); });
  }
  watch(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
  changed() {
    this.status?.setText(`${this.current.energy ? '𐤉𐤄𐤅𐤄' : 'YHWH'} · /${this.folder} · ${mode(this.current.energy)}`);
    this.listeners.forEach(callback => callback());
  }
  async save() {
    // Navigation and settings edits can overlap; preserve their write order.
    const snapshot = JSON.parse(JSON.stringify(this.settings));
    this.saving = this.saving.catch(() => {}).then(() => this.saveData(snapshot));
    await this.saving;
  }
  async go(path: string) {
    path = resolvePath('', path);
    const folder = this.app.vault.getAbstractFileByPath(path || '/');
    if (!(folder instanceof TFolder)) throw new Error(`Folder not found: /${path}`);
    const serial = ++this.navigation;
    const current = { ...this.settings };
    const errors: string[] = [];
    for (const directory of ancestors(path)) {
      for (const filename of ['rc', 'rc.obsidian']) {
        const file = [directory, '.yhwh', filename].filter(Boolean).join('/');
        try {
          if (!await this.app.vault.adapter.exists(file)) continue;
          const result = config(await this.app.vault.adapter.read(file), directory, path);
          Object.assign(current, result.values);
          errors.push(...result.errors.map(error => `${file}: ${error}`));
        } catch (error) { errors.push(`${file}: ${(error as Error).message}`); }
      }
    }
    if (serial !== this.navigation || this.closed) return;
    this.folder = path;
    this.current = current;
    this.configErrors = errors;
    this.settings.folder = path;
    this.changed();
    await this.save();
  }
  entries(): Array<TFile | TFolder> {
    const folder = this.app.vault.getAbstractFileByPath(this.folder || '/');
    if (!(folder instanceof TFolder)) return [];
    return folder.children.filter((file): file is TFile | TFolder => file instanceof TFile || file instanceof TFolder).sort((a, b) =>
      Number(b instanceof TFolder) - Number(a instanceof TFolder) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  }
  async show(type: string, center = false) {
    let leaf = center ? undefined : this.app.workspace.getLeavesOfType(type)[0];
    if (!leaf) {
      leaf = type === CONSOLE ? this.app.workspace.getLeaf('split', 'horizontal') :
        type === NAV && !center ? this.app.workspace.getLeftLeaf(false) ?? this.app.workspace.getLeaf('tab') : this.app.workspace.getLeaf('tab');
      await leaf.setViewState({ type, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
    return leaf;
  }
  async toggle(type: string) {
    const leaves = this.app.workspace.getLeavesOfType(type);
    if (leaves.length) leaves.forEach(leaf => leaf.detach());
    else await this.show(type);
  }
  async toggleFilesFocus() {
    const center = this.app.workspace.getLeavesOfType(NAV).filter(leaf => leaf.getRoot() === this.app.workspace.rootSplit);
    if (center.length) {
      center.forEach(leaf => leaf.detach());
      await this.show(NAV);
    } else await this.show(NAV, true);
  }
  async open(file: TFile, newTab = false) {
    // Obsidian owns its supported formats and the editor the user already knows.
    const native = new Set('md canvas base pdf png jpg jpeg gif webp avif bmp svg mp3 wav ogg m4a flac mp4 webm mov'.split(' '));
    if (!native.has(file.extension.toLowerCase()) &&
      (file.stat.size > 2_000_000 || !isText(file.name, await this.app.vault.readBinary(file))))
      throw new Error('This file is binary, unsupported, or larger than 2 MB. Open it with its usual app.');
    const workspace = this.app.workspace;
    // Console commands should open files in the editor's tab group, preserving
    // the console split. Obsidian otherwise targets the currently active group.
    const editors: WorkspaceLeaf[] = [];
    workspace.iterateRootLeaves(leaf => {
      if (leaf.view instanceof FileView || leaf.view.getViewType() === 'empty') editors.push(leaf);
    });
    const editor = editors.includes(this.editor!) ? this.editor : editors[0];
    if (editor) workspace.setActiveLeaf(editor, { focus: false });
    const leaf = workspace.getLeaf(newTab ? 'tab' : false);
    if (native.has(file.extension.toLowerCase())) await leaf.openFile(file);
    else {
      await leaf.setViewState({ type: TEXT, state: { file: file.path }, active: true });
    }
    this.editor = leaf;
    await workspace.revealLeaf(leaf);
  }
  async newFile() {
    const name = await prompt(this.app, 'New file', 'Filename, including extension', 'Untitled.md');
    if (name === null) return;
    const path = resolvePath(this.folder, name);
    if (!name.trim() || !path) throw new Error('Enter a filename.');
    const file = await this.app.vault.create(path, '');
    await this.open(file, true);
  }
  async newFolder() {
    const name = await prompt(this.app, 'New folder', 'Folder name');
    if (name === null) return;
    if (!name.trim()) throw new Error('Enter a folder name.');
    await this.app.vault.createFolder(resolvePath(this.folder, name));
  }
  async rename(file: TFile | TFolder) {
    const name = await prompt(this.app, 'Rename or move', 'Path relative to the current parent folder', file.name);
    if (name === null) return;
    if (!name.trim()) throw new Error('Enter a name.');
    await this.app.fileManager.renameFile(file, resolvePath(file.parent?.path ?? '', name));
  }
  decorate(el: HTMLElement) {
    el.addClass('yhwh');
    el.dataset.mode = mode(this.current.energy);
    el.style.setProperty('--yhwh-accent', this.current.accent);
    el.style.removeProperty('--yhwh-background');
    if (this.current.bg) {
      const file = this.app.vault.getAbstractFileByPath(this.current.bg);
      if (file instanceof TFile && /^(png|jpg|jpeg|webp|avif|gif)$/.test(file.extension))
        el.style.setProperty('--yhwh-background', `url("${this.app.vault.getResourcePath(file).replace(/["\\\n\r]/g, encodeURIComponent)}")`);
    }
  }
  heading(el: HTMLElement, title: string) {
    this.decorate(el);
    const head = el.createDiv('yhwh-heading');
    head.createEl('bdi', { text: this.current.energy ? '𐤉𐤄𐤅𐤄' : 'YHWH', cls: 'yhwh-wordmark', attr: { dir: 'ltr' } });
    head.createEl('span', { text: this.current.title || title, cls: 'yhwh-title' });
    button(head, '?', 'Help and about', () => this.help());
    const label = el.createEl('label', { cls: 'yhwh-energy' });
    label.createSpan({ text: `Amount of YHWH-ness · ${mode(this.current.energy)}` });
    const slider = label.createEl('input', { type: 'range', attr: { min: '0', max: '100', step: '50', 'aria-label': 'Amount of YHWH-ness' } });
    slider.value = String(this.current.energy);
    slider.addEventListener('change', () => this.run(async () => {
      this.settings.energy = Number(slider.value);
      await this.save();
      await this.go(this.folder);
    }));
    if (this.configErrors.length) button(el, `${this.configErrors.length} configuration issue(s)`, 'Show configuration errors', () => this.help());
  }
  copyBlock(el: HTMLElement, key: CopyKey) {
    if (this.current.energy === 0) return;
    const block = el.createDiv('yhwh-copy');
    const text = block.createEl('p', { text: this.settings.copy[key] });
    button(block, 'Edit', `Edit ${key} text`, () => this.editCopy(key, () => text.setText(this.settings.copy[key])));
  }
  editCopy(key: CopyKey, updated?: () => void) {
    const modal = new Modal(this.app);
    modal.titleEl.setText(`Edit YHWH: ${key}`);
    const text = modal.contentEl.createEl('textarea', { cls: 'yhwh-copy-editor' });
    text.value = this.settings.copy[key];
    button(modal.contentEl, 'Save', 'Save wording', () => this.run(async () => {
      this.settings.copy[key] = text.value;
      await this.save(); this.changed(); updated?.(); modal.close();
    }));
    button(modal.contentEl, 'Restore default', 'Restore default wording', () => { text.value = COPY[key]; });
    modal.open(); text.focus();
  }
  external(el: HTMLElement, text: string, href: string) {
    el.createEl('a', { text, href, cls: 'yhwh-link', attr: { target: '_blank', rel: 'noopener noreferrer' } });
  }
  async nextCircus() {
    if (this.circusBusy) return;
    this.circusBusy = true; this.circusError = ''; this.changed();
    try {
      // Fetch only on request. Extract the pairing, never the site's scripts or ads.
      const page = await requestUrl({ url: `https://nietzschefamilycircus.com/?yhwh=${Date.now()}`, throw: false });
      if (page.status !== 200) throw new Error(`Circus unavailable (${page.status}).`);
      const pair = circusPair(page.text);
      const image = await requestUrl({ url: pair.image, throw: false });
      if (image.status !== 200 || image.arrayBuffer.byteLength > 3_000_000) throw new Error('The cartoon could not be loaded.');
      if (this.closed) return;
      const mime = pair.image.endsWith('.gif') ? 'image/gif' : pair.image.endsWith('.png') ? 'image/png' : 'image/jpeg';
      if (this.circus) URL.revokeObjectURL(this.circus.image);
      this.circus = { ...pair, image: URL.createObjectURL(new Blob([image.arrayBuffer], { type: mime })) };
    } catch (error) { this.circusError = (error as Error).message; }
    finally { this.circusBusy = false; if (!this.closed) this.changed(); }
  }
  help() {
    const modal = new Modal(this.app);
    modal.titleEl.setText('YHWH · help and about');
    const el = modal.contentEl; this.decorate(el);
    el.createEl('p', { text: 'Navigate with the left pane; use Alt+↑ to go up and Enter to open a selected entry. Ctrl+E toggles the navigator, Ctrl+D opens it in a workspace tab, and Ctrl+B toggles the navigation console. Reassign conflicts in Settings → Hotkeys.' });
    el.createEl('p', { text: 'The console understands help, pwd, ls, cd, open, new, mkdir, mv, cat, find, mode, 3d, hello and clear. It is a vault command line. Run help there for syntax. Native Obsidian tabs, Markdown, themes, backlinks and plugins continue to work.' });
    this.copyBlock(el, 'about');
    this.external(el, 'About Us ↗', 'https://thedynamiclinker.com');
    this.external(el, 'About YHWH · Genesis by The Nameless ↗', 'https://www.amazon.com/dp/B0HNQ23QKT');
    button(el, 'Offerings', 'Open offerings', () => { modal.close(); this.offerings(); });
    const future = el.createEl('details');
    future.createEl('summary', { text: 'Coming soon' });
    this.copyBlock(future, 'upgrades');
    future.createEl('p', { text: 'Sync, Stuff and Dating are concepts, with no payment or preorder. The local 3D directory is available now.' });
    button(future, 'Open 3D directory', 'Open local 3D directory', () => { modal.close(); this.run(() => this.show(ATLAS)); });
    if (this.configErrors.length) el.createEl('pre', { text: this.configErrors.join('\n'), cls: 'yhwh-errors' });
    modal.open();
  }
  offerings() {
    const modal = new Modal(this.app); modal.titleEl.setText('Offerings');
    const el = modal.contentEl; this.decorate(el); this.copyBlock(el, 'offerings');
    el.createEl('h3', { text: 'Burnt Offering' }); this.copyBlock(el, 'burnt');
    el.createEl('p', { text: 'Developer setup: create a Stripe account, complete business verification, and connect the bank account that will receive payouts. Create a one-time Payment Link, test it in test mode, then add the live link to this plugin. No card or bank details belong in plugin settings.' });
    this.external(el, 'Create a Stripe account ↗', 'https://dashboard.stripe.com/register');
    this.external(el, 'Payment Links setup ↗', 'https://docs.stripe.com/payment-links');
    el.createEl('h3', { text: 'Piece Offering' }); this.copyBlock(el, 'piece');
    const picker = el.createEl('input', { type: 'file', attr: { 'aria-label': 'Choose a piece offering' } });
    const receipt = el.createEl('p', { text: 'Choose a file to preview its name. Nothing is uploaded.' });
    picker.addEventListener('change', () => { receipt.setText(picker.files?.[0] ? `Selected: ${picker.files[0].name}. No upload has occurred. To share it, attach it yourself in an email.` : 'No file selected.'); });
    this.external(el, 'Email yhwh@thedynamiclinker.com ↗', 'mailto:yhwh@thedynamiclinker.com');
    this.external(el, 'The Dynamic Linker ↗', 'https://thedynamiclinker.com');
    modal.open();
  }
  onunload() { this.closed = true; this.navigation++; this.listeners.clear(); if (this.circus) URL.revokeObjectURL(this.circus.image); }
}

class YHWHSettings extends PluginSettingTab {
  constructor(private plugin: YHWH) { super(plugin.app, plugin); }
  display() {
    const { containerEl: el, plugin: p } = this; el.empty();
    el.createEl('h2', { text: 'YHWH' });
    const update = () => p.run(async () => { await p.save(); await p.go(p.folder); });
    new Setting(el).setName('Amount of YHWH-ness').setDesc('Dawkins: plain. Nietzsche: existential. YHWH: full deity.')
      .addDropdown(d => d.addOptions({ '0': 'Dawkins · 0%', '50': 'Nietzsche · 50%', '100': 'YHWH · 100%' })
        .setValue(String(p.settings.energy)).onChange(v => { p.settings.energy = Number(v); update(); }));
    new Setting(el).setName('Follow active file').setDesc('Keep the navigator, console and 3D directory in the active file’s folder.')
      .addToggle(t => t.setValue(p.settings.followActive).onChange(v => { p.settings.followActive = v; update(); }));
    new Setting(el).setName('Open navigator at startup').addToggle(t => t.setValue(p.settings.autoOpen).onChange(v => { p.settings.autoOpen = v; update(); }));
    new Setting(el).setName('Accent color').addColorPicker(c => c.setValue(p.settings.accent).onChange(v => { p.settings.accent = v; update(); }));
    el.createEl('h3', { text: 'Words' });
    el.createEl('p', { text: 'Edit the character’s words here or beside each message. Wording is stored in plugin settings and survives upgrades.' });
    for (const key of Object.keys(COPY) as CopyKey[]) new Setting(el).setName(key).addButton(b => b.setButtonText('Edit').onClick(() => p.editCopy(key)));
    el.createEl('h3', { text: 'Folder configuration' });
    el.createEl('p', { text: 'Settings above are defaults. Optional .yhwh/rc and .yhwh/rc.obsidian files override them from the vault root down to the current folder. Paths are vault-relative; shell commands and environment expansion are unavailable. Run “Reload folder configuration” after an external edit.' });
    el.createEl('pre', { text: '/\n    mode=yhwh\n    accent="#b7a1ef"\n\n"/Writing a book"\n    title="Let there be words"\n    follow_active=false' });
    if (p.configErrors.length) el.createEl('pre', { text: p.configErrors.join('\n'), cls: 'yhwh-errors' });
  }
}
