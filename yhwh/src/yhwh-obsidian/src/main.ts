import { text as interfaceText } from '../../../lib/text.cjs';
import interfaceCopy from '../../../etc/obsidian/text-main.json';
const ui = interfaceText(interfaceCopy);
import { Component, FileSystemAdapter, FileView, MarkdownRenderer, Modal, Notice, Platform, Plugin, PluginSettingTab, requestUrl, Setting, TFile, TFolder, WorkspaceLeaf } from 'obsidian';
import { ancestors, config, COPY, CopyKey, isText, parent, resolvePath, Settings, settings } from './core';
import email from '../../../etc/default/yhwh-emails.json';
import letterCopy from '../../../etc/default/words.json';
import { ORIGIN as circusOrigin, parsePair, type CircusPair } from '../../../lib/circus.cjs';
import { addressCopy, createLevelAsides, levelAt, nextUpgrade, stripe, unlockedLevels, unstealUpgrade, type EditionState } from '../../../lib/levels.cjs';
import { Navigator, ConsoleView, TextView, NAV, CONSOLE, TEXT, button, prompt } from './views';
import { Atlas, ATLAS } from './atlas';
import { NHS, NHSView } from './nhs';
import { createSeed, hostOnly, marker, seeds, universeName } from '../../../lib/universe-seeds.cjs';

export default class YHWH extends Plugin {
  settings!: Settings;
  current!: Settings;
  folder = '';
  circus?: CircusPair;
  circusBusy = false;
  circusError = '';
  private nextLevelAside = createLevelAsides();
  private welcomeLevel?: string;
  private welcomeAside?: string | null;
  configErrors: string[] = [];
  listeners = new Set<() => void>();
  private navigation = 0;
  private saving: Promise<void> = Promise.resolve();
  private savingUpgrade = false;
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
    this.registerView(NHS, leaf => new NHSView(leaf));
    this.addRibbonIcon('flame', ui("yhwh-open-navigator"), () => this.run(() => this.show(NAV)));
    this.status = this.addStatusBarItem();
    this.status.addClass('yhwh-status');
    this.registerDomEvent(this.status, 'click', () => this.help());
    const commands: Array<[string, string, () => unknown, string?]> = [
      ['open-navigator', ui("open-navigator"), () => this.show(NAV)],
      ['toggle-navigator', ui("toggle-navigator"), () => this.toggle(NAV), 'e'],
      ['focus-files', ui("toggle-file-manager-in-the-workspace"), () => this.toggleFilesFocus(), 'd'],
      ['toggle-console', ui("toggle-navigation-console"), () => this.toggle(CONSOLE), 'b'],
      ['open-atlas', ui("open-3d-directory"), () => this.show(ATLAS)],
      ['new-human-school', 'New Human School', () => this.school(null)],
      ['new-human-school-folder', 'New Human School · Practice this folder', () => this.school(this.folder)],
      ['emails', 'Read YHWH emails', () => this.emails()],
      ['up', ui("go-to-parent-folder"), () => this.go(parent(this.folder))],
      ['new-file', ui("new-file-in-current-folder"), () => this.newFile()],
      ['new-folder', ui("new-folder-in-current-folder"), () => this.newFolder()],
      ['universe-new', 'Nu · Make new universe', () => this.universeDialog()],
      ['universe-enter', 'Cd · Enter universe', () => this.enterUniverse(this.folder)],
      ['universe-go', 'Go · Chroot universe', () => this.chrootUniverse(this.folder)],
      ['reload-config', ui("reload-folder-configuration"), () => this.go(this.folder)],
      ['hello-world', ui("hello-world"), () => new Notice(this.current.energy ? this.settings.copy.hello : ui("hello-world-"))],
      ['offerings', ui("offerings"), () => this.offerings()],
      ['upgrades', 'Upgrade YHWH', () => this.upgrades()],
      ['help', ui("help-and-about"), () => this.help()],
    ];
    for (const [id, name, callback, key] of commands) this.addCommand({ id, name,
      ...(key ? { hotkeys: [{ modifiers: ["Ctrl" as const], key }] } : {}),
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
        if (!(file instanceof TFile)) throw new Error(ui("file-not-found-"));
        await this.open(file);
      } else await this.show(params.view === 'three' ? ATLAS : params.view === 'console' ? CONSOLE : NAV);
    }));
    this.app.workspace.onLayoutReady(() => this.run(async () => {
      await this.go(this.folder);
      if (this.settings.autoOpen && !this.app.workspace.getLeavesOfType(NAV).length) await this.show(NAV);
    }));
  }

  run(action: () => unknown) {
    Promise.resolve().then(action).catch(error => { console.error(ui("yhwh-"), error); new Notice((error as Error).message); });
  }
  watch(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
  changed() {
    const level = this.level();
    this.status?.setText(`${level.energy ? '𐤉𐤄𐤅𐤄' : ui("yhwh")} · /${this.folder} · ${level.label}`);
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
    if (!(folder instanceof TFolder)) throw new Error(ui("folder-not-found-", path));
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
  async school(folder: string | null) {
    const workspace = this.app.workspace;
    const leaf = workspace.getLeavesOfType(NHS)[0] ?? workspace.getLeaf('tab');
    await leaf.setViewState({ type: NHS, state: { folder }, active: true });
    await workspace.revealLeaf(leaf);
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
    const native = new Set(ui("md-canvas-base-pdf-png-jpg-jpeg-gif-webp-avif-bm").split(' '));
    if (!native.has(file.extension.toLowerCase()) &&
      (file.stat.size > 2_000_000 || !isText(file.name, await this.app.vault.readBinary(file))))
      throw new Error(ui("this-file-is-binary-unsupported-or-larger-than-2"));
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
    const name = await prompt(this.app, ui("new-file"), ui("filename-including-extension"), ui("untitled-md"));
    if (name === null) return;
    const path = resolvePath(this.folder, name);
    if (!name.trim() || !path) throw new Error(ui("enter-a-filename-"));
    const file = await this.app.vault.create(path, '');
    await this.open(file, true);
  }
  async newFolder() {
    const name = await prompt(this.app, ui("new-folder"), ui("folder-name"));
    if (name === null) return;
    if (!name.trim()) throw new Error(ui("enter-a-folder-name-"));
    await this.app.vault.createFolder(resolvePath(this.folder, name));
  }
  private get linuxAdapter() {
    const { adapter } = this.app.vault;
    return Platform.isDesktopApp && process.platform === 'linux' && adapter instanceof FileSystemAdapter ? adapter : null;
  }
  private hostCommand(args: string[]) {
    if (!this.linuxAdapter) throw new Error(hostOnly);
    const { execFile } = require('node:child_process') as typeof import('node:child_process');
    return new Promise<void>((resolve, reject) => {
      execFile('yhwh', args, (error, _stdout, stderr) => {
        if (error) reject(new Error(error.code === 'ENOENT' ? 'Install the desktop yhwh command on PATH to use OCI images and Chroot here.' : stderr.trim() || error.message));
        else resolve();
      });
    });
  }
  async makeUniverse(name: string, template = 'empty', image?: string) {
    const { vault } = this.app, directory = resolvePath(this.folder, universeName(name));
    const seed = seeds.find(seed => seed.id === template);
    if (!seed) throw new Error('Choose a listed template.');
    if (seed.image || seed.id === 'oci') {
      const adapter = this.linuxAdapter;
      if (!adapter) throw new Error(hostOnly);
      await this.hostCommand(['nu', adapter.getFullPath(directory), ...(seed.id === 'oci' ? ['--from', image || ''] : ['--template', template])]);
    } else {
      await createSeed(directory, template, {
        mkdir: file => vault.createFolder(file),
        write: (file, content) => vault.adapter.write(file, content),
        remove: file => vault.adapter.rmdir(file, true),
      }, resolvePath);
    }
    return directory;
  }
  async enterUniverse(directory: string) {
    const file = resolvePath(directory, '.@'), adapter = this.app.vault.adapter;
    const info = await adapter.stat(file);
    if (info?.type !== 'file' || info.size > 65536 || !(await adapter.read(file)).startsWith(marker))
      throw new Error('Choose a universe directory created by Nu or un new.');
    await this.go(directory);
  }
  async chrootUniverse(directory: string) {
    const adapter = this.linuxAdapter;
    if (!adapter) throw new Error(hostOnly);
    await this.hostCommand(['open', 'default', '--open', adapter.getFullPath(directory), '--universe=go']);
  }
  universeDialog() {
    const modal = new Modal(this.app), form = modal.contentEl.createEl('form', { cls: 'yhwh-universe-form' });
    modal.setTitle('Nu · Make new universe');
    const name = form.createEl('label', { text: 'Directory name' }).createEl('input', { type: 'text', attr: { required: '' } });
    const template = form.createEl('label', { text: 'Template' }).createEl('select');
    const description = form.createEl('p'), imageLabel = form.createEl('label', { text: 'OCI image' });
    const image = imageLabel.createEl('input', { type: 'text', placeholder: 'alpine:latest' });
    const available = Boolean(this.linuxAdapter);
    for (const seed of seeds) {
      const option = template.createEl('option', { text: seed.label, value: seed.id });
      option.disabled = !available && Boolean(seed.image || seed.id === 'oci');
    }
    const update = () => {
      const seed = seeds.find(seed => seed.id === template.value)!;
      description.setText(seed.description || `Downloads ${seed.image}.`);
      imageLabel.hidden = seed.id !== 'oci'; image.required = seed.id === 'oci';
    };
    template.onchange = update; update();
    if (!available) form.createEl('p', { text: hostOnly });
    const status = form.createEl('p', { attr: { role: 'status' } });
    const submit = form.createEl('button', { text: 'Make new universe', type: 'submit', cls: 'mod-cta' });
    form.onsubmit = async event => {
      event.preventDefault();
      if (submit.disabled) return;
      submit.disabled = true; status.setText('Preparing the universe…');
      try {
        await this.makeUniverse(name.value, template.value, image.value.trim() || undefined);
        modal.close();
        this.changed();
      } catch (error) { status.setText((error as Error).message); }
      finally { submit.disabled = false; }
    };
    modal.open(); name.focus();
  }
  async rename(file: TFile | TFolder) {
    const name = await prompt(this.app, ui("rename-or-move"), ui("path-relative-to-the-current-parent-folder"), file.name);
    if (name === null) return;
    if (!name.trim()) throw new Error(ui("enter-a-name-"));
    await this.app.fileManager.renameFile(file, resolvePath(file.parent?.path ?? '', name));
  }
  decorate(el: HTMLElement) {
    el.addClass('yhwh');
    const level = this.level();
    el.dataset.mode = level.id;
    el.style.setProperty('--yhwh-accent', this.current.accent);
    el.style.removeProperty('--yhwh-background');
    if (this.current.bg) {
      const file = this.app.vault.getAbstractFileByPath(this.current.bg);
      if (file instanceof TFile && /^(png|jpg|jpeg|webp|avif|gif)$/.test(file.extension))
        el.style.setProperty('--yhwh-background', `url("${this.app.vault.getResourcePath(file).replace(/["\\\n\r]/g, encodeURIComponent)}")`);
    }
  }
  level() { return levelAt(this.settings.edition.selected ?? this.current.energy); }
  async selectLevel(value: number) {
    if (value > this.settings.edition.unlocked) return;
    this.settings.edition = { ...this.settings.edition, selected: value > 100 ? value : undefined };
    if (value <= 100) this.settings.energy = value;
    await this.go(this.folder);
  }
  updateLevelControls(el: HTMLElement) {
    const level = this.level(), choices = unlockedLevels(this.settings.edition.unlocked);
    const slider = el.querySelector<HTMLInputElement>('.yhwh-energy input');
    if (slider) {
      slider.max = String(choices.length - 1);
      slider.value = String(choices.findIndex(choice => choice.id === level.id));
      slider.setAttribute('aria-valuetext', level.label);
    }
    el.querySelector('.yhwh-level-name')?.setText(level.glyph || level.label);
    const target = nextUpgrade(this.settings.edition.unlocked);
    const upgrade = el.querySelector<HTMLButtonElement>('.yhwh-upgrade');
    if (upgrade) {
      const shown = target ?? choices.at(-1);
      upgrade.textContent = shown?.glyph || shown?.label || '';
      upgrade.title = target?.offer.title ?? 'Manage preview upgrades';
      upgrade.setAttribute('aria-label', upgrade.title);
    }
  }
  heading(el: HTMLElement, title: string) {
    this.decorate(el);
    const head = el.createDiv('yhwh-heading');
    head.createEl('bdi', { text: this.level().energy ? '𐤉𐤄𐤅𐤄' : ui("yhwh"), cls: 'yhwh-wordmark', attr: { dir: 'ltr' } });
    head.createEl('span', { text: this.current.title || title, cls: 'yhwh-title' });
    button(head, '?', ui("help-and-about"), () => this.help());
    button(head, '', 'Upgrade YHWH', () => this.upgrades()).addClass('yhwh-upgrade');
    const label = el.createEl('label', { cls: 'yhwh-energy' });
    label.createSpan({ text: 'YHWH-ness' });
    const slider = label.createEl('input', { type: 'range', attr: { min: '0', step: '1', 'aria-label': 'YHWH-ness' } });
    label.createSpan({ cls: 'yhwh-level-name' });
    slider.addEventListener('change', () => this.run(() => this.selectLevel(unlockedLevels(this.settings.edition.unlocked)[Number(slider.value)].energy)));
    this.updateLevelControls(el);
    if (this.configErrors.length) button(el, ui("configuration-issue-s-", this.configErrors.length), ui("show-configuration-errors"), () => this.help());
  }
  levelCopy(el: HTMLElement) {
    const level = this.level();
    if (this.welcomeLevel !== level.id) {
      this.welcomeLevel = level.id;
      this.welcomeAside = this.nextLevelAside(level);
    }
    if (level.id !== 'yhwh') el.createEl('strong', { text: `YHWH level ${level.label}${level.edition ? ` · ${level.edition}` : ''}` });
    const lines = [level.welcome, ...(level.lines || []), this.welcomeAside];
    for (const line of lines) if (line) el.createEl('p', { text: line });
    if (level.names) el.createEl('p', { text: addressCopy('Hey Abe, take a look around.', level) });
    for (const text of [level.welcomePoem, level.poem]) {
      if (text) el.createEl('pre', { cls: 'yhwh-level-poem', attr: { dir: 'ltr', tabindex: '0' } }).createEl('code', { text });
    }
  }
  upgrades() {
    const unlocked = this.settings.edition.unlocked;
    const target = nextUpgrade(unlocked);
    const modal = new Modal(this.app);
    modal.titleEl.setText(target?.offer.title ?? 'Manage preview upgrades');
    const el = modal.contentEl; this.decorate(el);
    const changeEdition = (transition: (edition: EditionState) => EditionState | undefined) => this.run(async () => {
      const previous = this.settings.edition;
      if (this.savingUpgrade || previous.unlocked !== unlocked) return;
      const next = transition(previous);
      if (!next) return;
      this.savingUpgrade = true;
      this.settings.edition = next;
      try { await this.save(); }
      catch (error) {
        if (this.settings.edition === next) this.settings.edition = previous;
        throw error;
      } finally { this.savingUpgrade = false; }
      this.changed(); modal.close();
    });
    if (target) {
      for (const text of target.offer.lines) el.createEl('p', { text });
      button(el, 'Steal Upgrade', 'Steal Upgrade', () => changeEdition(() => ({ unlocked: target.energy, selected: target.energy }))).addClass('mod-cta');
    }
    if (unstealUpgrade(this.settings.edition)) {
      button(el, 'Unsteal Upgrade', 'Unsteal Upgrade', () => changeEdition(unstealUpgrade));
    }
    if (target) {
      el.createEl('p', { text: stripe.status });
      const setup = el.createEl('details');
      setup.createEl('summary', { text: stripe.title });
      const steps = setup.createEl('ol');
      for (const text of stripe.steps) steps.createEl('li', { text });
      for (const [label, url] of Object.entries(stripe.links)) this.external(setup.createEl('p'), label, url);
    }
    modal.open();
  }
  copyBlock(el: HTMLElement, key: CopyKey) {
    const level = this.level();
    if (level.id === 'dawkins') return;
    const block = el.createDiv('yhwh-copy');
    const render = () => addressCopy(this.settings.copy[key], this.level(), 2);
    const text = block.createEl('p', { text: render() });
    button(block, ui("edit"), ui("edit-text", key), () => this.editCopy(key, () => text.setText(render())));
  }
  editCopy(key: CopyKey, updated?: () => void) {
    const modal = new Modal(this.app);
    modal.titleEl.setText(ui("edit-yhwh-", key));
    const text = modal.contentEl.createEl('textarea', { cls: 'yhwh-copy-editor' });
    text.value = this.settings.copy[key];
    button(modal.contentEl, ui("save"), ui("save-wording"), () => this.run(async () => {
      this.settings.copy[key] = text.value;
      await this.save(); this.changed(); updated?.(); modal.close();
    }));
    button(modal.contentEl, ui("restore-default"), ui("restore-default-wording"), () => { text.value = COPY[key]; });
    modal.open(); text.focus();
  }
  external(el: HTMLElement, text: string, href: string) {
    el.createEl('a', { text, href, cls: 'yhwh-link', attr: { target: '_blank', rel: ui("noopener-noreferrer") } });
  }
  async nextCircus() {
    if (this.circusBusy || this.level().id !== 'nietzsche') return;
    this.circusBusy = true; this.circusError = ''; this.changed();
    try {
      // Fetch only on request. Extract the pairing, never the site's scripts or ads.
      const page = await requestUrl({ url: circusOrigin + '/', headers: { 'Cache-Control': 'no-cache' }, throw: false });
      if (page.status !== 200) throw new Error(ui("circus-unavailable-", page.status));
      const pair = parsePair(page.text);
      const image = await requestUrl({ url: circusOrigin + pair.image, throw: false });
      if (image.status !== 200 || !image.arrayBuffer.byteLength || image.arrayBuffer.byteLength > 3_000_000) throw new Error(ui("the-cartoon-could-not-be-loaded-"));
      if (this.closed) return;
      const suffix = pair.image.toLowerCase();
      const mime = suffix.endsWith('.gif') ? 'image/gif' : suffix.endsWith('.png') ? 'image/png' : 'image/jpeg';
      if (this.circus) URL.revokeObjectURL(this.circus.image);
      this.circus = { ...pair, image: URL.createObjectURL(new Blob([image.arrayBuffer], { type: mime })) };
    } catch (error) { this.circusError = (error as Error).message; }
    finally { this.circusBusy = false; if (!this.closed) this.changed(); }
  }
  help() {
    const modal = new Modal(this.app);
    modal.titleEl.setText(ui("yhwh-help-and-about"));
    const el = modal.contentEl; this.decorate(el);
    el.createEl('p', { text: ui("navigate-with-the-left-pane-use-alt-to-go-up-and") });
    el.createEl('p', { text: ui("the-console-understands-help-pwd-ls-cd-open-new-") });
    this.copyBlock(el, 'about');
    for (const line of this.level().about || []) el.createEl('p', { text: line });
    this.external(el, ui("about-us-"), 'https://thedynamiclinker.com');
    this.external(el, ui("about-yhwh-genesis-by-the-nameless-"), ui("https-www-amazon-com-dp-b0hnq23qkt"));
    button(el, 'YHWH emails', 'Read YHWH emails', () => { modal.close(); this.emails(); });
    button(el, ui("offerings"), ui("open-offerings"), () => { modal.close(); this.offerings(); });
    const future = el.createEl('details');
    future.createEl('summary', { text: ui("coming-soon") });
    this.copyBlock(future, 'upgrades');
    future.createEl('p', { text: ui("sync-stuff-and-dating-are-concepts-with-no-payme") });
    button(future, ui("open-3d-directory"), ui("open-local-3d-directory"), () => { modal.close(); this.run(() => this.show(ATLAS)); });
    if (this.configErrors.length) el.createEl('pre', { text: this.configErrors.join('\n'), cls: 'yhwh-errors' });
    modal.open();
  }
  emails() {
    const modal = new Modal(this.app);
    const el = modal.contentEl;
    let reading: Component | undefined;
    const clear = () => { reading?.unload(); reading = undefined; el.empty(); };
    const list = (returnTo?: string) => {
      clear();
      modal.setTitle('YHWH emails');
      const subjects = el.createEl('ul');
      for (const message of email.messages) {
        const control = button(subjects.createEl('li'), message.title, message.title, () => this.run(() => read(message)));
        if (message.id === returnTo) control.focus();
      }
    };
    const read = async (message: typeof email.messages[number]) => {
      clear();
      modal.setTitle(message.title);
      button(el, '← YHWH emails', 'Back to YHWH emails', () => list(message.id)).focus();
      el.createEl('p', { text: `From: YHWH <${email.sender}>` });
      reading = new Component();
      reading.load();
      const body = letterCopy[message.textKey as keyof typeof letterCopy];
      await MarkdownRenderer.render(this.app, body.replace(/^(https?:\/\/\S+)$/gm, '<$1>'), el.createDiv('markdown-rendered'), '', reading);
    };
    modal.onClose = clear;
    list();
    modal.open();
  }
  offerings() {
    const modal = new Modal(this.app); modal.titleEl.setText(ui("offerings"));
    const el = modal.contentEl; this.decorate(el); this.copyBlock(el, 'offerings');
    el.createEl('h3', { text: ui("burnt-offering") }); this.copyBlock(el, 'burnt');
    el.createEl('p', { text: ui("developer-setup-create-a-stripe-account-complete") });
    this.external(el, ui("create-a-stripe-account-"), 'https://dashboard.stripe.com/register');
    this.external(el, ui("payment-links-setup-"), 'https://docs.stripe.com/payment-links');
    el.createEl('h3', { text: ui("piece-offering") }); this.copyBlock(el, 'piece');
    const picker = el.createEl('input', { type: 'file', attr: { 'aria-label': ui("choose-a-piece-offering") } });
    const receipt = el.createEl('p', { text: ui("choose-a-file-to-preview-its-name-nothing-is-upl") });
    picker.addEventListener('change', () => { receipt.setText(picker.files?.[0] ? ui("selected-no-upload-has-occurred-to-share-it-atta", picker.files[0].name) : ui("no-file-selected-")); });
    this.external(el, ui("email-yhwh-thedynamiclinker-com-"), 'mailto:yhwh@thedynamiclinker.com');
    this.external(el, ui("the-dynamic-linker-"), 'https://thedynamiclinker.com');
    modal.open();
  }
  onunload() { this.closed = true; this.navigation++; this.listeners.clear(); if (this.circus) URL.revokeObjectURL(this.circus.image); }
}

class YHWHSettings extends PluginSettingTab {
  constructor(private plugin: YHWH) { super(plugin.app, plugin); }
  display() {
    const { containerEl: el, plugin: p } = this; el.empty();
    el.createEl('h2', { text: ui("yhwh") });
    const update = () => p.run(async () => { await p.save(); await p.go(p.folder); });
    new Setting(el).setName('YHWH-ness').setDesc(ui("dawkins-plain-nietzsche-existential-yhwh-full-de"))
      .addDropdown(d => d.addOptions(Object.fromEntries(unlockedLevels(p.settings.edition.unlocked).map(level =>
        [level.energy, level.edition ? `${level.label} · ${level.edition}` : level.label])))
        .setValue(String(p.level().energy)).onChange(v => p.run(() => p.selectLevel(Number(v)))));
    new Setting(el).setName(ui("follow-active-file")).setDesc(ui("keep-the-navigator-console-and-3d-directory-in-t"))
      .addToggle(t => t.setValue(p.settings.followActive).onChange(v => { p.settings.followActive = v; update(); }));
    new Setting(el).setName(ui("open-navigator-at-startup")).addToggle(t => t.setValue(p.settings.autoOpen).onChange(v => { p.settings.autoOpen = v; update(); }));
    new Setting(el).setName(ui("accent-color")).addColorPicker(c => c.setValue(p.settings.accent).onChange(v => { p.settings.accent = v; update(); }));
    el.createEl('h3', { text: ui("words") });
    el.createEl('p', { text: ui("edit-the-character-s-words-here-or-beside-each-m") });
    for (const key of Object.keys(COPY) as CopyKey[]) new Setting(el).setName(key).addButton(b => b.setButtonText(ui("edit")).onClick(() => p.editCopy(key)));
    el.createEl('h3', { text: ui("folder-configuration") });
    el.createEl('p', { text: ui("settings-above-are-defaults-optional-yhwh-rc-and") });
    el.createEl('pre', { text: '/\n    mode=yhwh\n    accent="#b7a1ef"\n\n"/Writing a book"\n    title="Let there be words"\n    follow_active=false' });
    if (p.configErrors.length) el.createEl('pre', { text: p.configErrors.join('\n'), cls: 'yhwh-errors' });
  }
}
