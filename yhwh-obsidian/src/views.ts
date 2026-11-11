import { App, ItemView, MarkdownRenderer, Menu, Modal, TextFileView, TFile, TFolder, WorkspaceLeaf } from 'obsidian';
import type YHWH from './main';
import { mode, parent, resolvePath, words } from './core';
import { ATLAS } from './atlas';

export const NAV = 'yhwh-navigator', CONSOLE = 'yhwh-console', TEXT = 'yhwh-text';
export function button(el: HTMLElement, text: string, title: string, click: () => unknown): HTMLButtonElement {
  const b = el.createEl('button', { text, attr: { title, 'aria-label': title } });
  b.addEventListener('click', () => click());
  return b;
}
export function prompt(app: App, title: string, label: string, value = ''): Promise<string | null> {
  return new Promise(resolve => {
    const modal = new Modal(app);
    let result: string | null = null;
    modal.titleEl.setText(title);
    const form = modal.contentEl.createEl('form');
    const field = form.createEl('label', { text: label });
    const input = field.createEl('input', { type: 'text', value, cls: 'yhwh-prompt', attr: { 'aria-label': label } });
    form.createEl('button', { text: 'Save', type: 'submit', cls: 'mod-cta' });
    button(form, 'Cancel', 'Cancel', () => modal.close()).type = 'button';
    form.addEventListener('submit', event => { event.preventDefault(); result = input.value; modal.close(); });
    modal.onClose = () => resolve(result);
    modal.open(); input.focus(); input.select();
  });
}

export class Navigator extends ItemView {
  private unsubscribe?: () => void;
  private filter = '';
  private index = 0;
  private visible: Array<TFile | TFolder> = [];
  constructor(leaf: WorkspaceLeaf, private plugin: YHWH) { super(leaf); }
  getViewType() { return NAV; }
  getDisplayText() { return 'YHWH · files'; }
  getIcon() { return 'folder-open'; }
  async onOpen() {
    this.unsubscribe = this.plugin.watch(() => this.render());
    this.registerDomEvent(this.contentEl, 'keydown', event => {
      if ((event.altKey && event.key === 'ArrowUp') || (event.key === 'ArrowLeft' && (event.target as HTMLElement).tagName !== 'INPUT')) {
        event.preventDefault(); this.plugin.run(() => this.plugin.go(parent(this.plugin.folder))); return;
      }
      if ((event.target as HTMLElement).tagName === 'INPUT') return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); this.index = Math.max(0, Math.min(this.visible.length - 1, this.index + (event.key === 'ArrowDown' ? 1 : -1)));
        this.focusRow();
      } else if (event.key === 'Enter' || event.key === 'ArrowRight') {
        event.preventDefault(); const entry = this.visible[this.index]; if (entry) this.openEntry(entry, event.ctrlKey || event.metaKey);
      } else if (event.key === 'F2') {
        event.preventDefault(); const entry = this.visible[this.index]; if (entry) this.plugin.run(() => this.plugin.rename(entry));
      }
    });
    this.render();
  }
  openEntry(entry: TFile | TFolder, newTab = false) {
    this.plugin.run(() => entry instanceof TFolder ? this.plugin.go(entry.path) : this.plugin.open(entry, newTab));
  }
  render() {
    const p = this.plugin, el = this.contentEl;
    const hadFocus = el.contains(el.ownerDocument.activeElement);
    el.empty(); p.heading(el, 'Files');
    const tools = el.createDiv('yhwh-tools');
    button(tools, '↑', 'Parent folder · Alt+↑', () => p.run(() => p.go(parent(p.folder)))).disabled = !p.folder;
    button(tools, '+ file', 'New file', () => p.run(() => p.newFile()));
    button(tools, '+ folder', 'New folder', () => p.run(() => p.newFolder()));
    button(tools, '⛶', 'Toggle file manager in the workspace · Ctrl+D', () => p.run(() => p.toggleFilesFocus()));
    button(tools, '>_', 'Toggle navigation console · Ctrl+B', () => p.run(() => p.toggle(CONSOLE)));
    button(tools, '3D', 'Open 3D directory', () => p.run(() => p.show(ATLAS)));
    const crumbs = el.createDiv('yhwh-breadcrumbs');
    button(crumbs, '/', 'Vault root', () => p.run(() => p.go('')));
    let path = '';
    for (const part of p.folder.split('/').filter(Boolean)) {
      path = [path, part].filter(Boolean).join('/'); const target = path;
      button(crumbs, part, `Go to /${target}`, () => p.run(() => p.go(target)));
    }
    const filter = el.createEl('input', { type: 'search', value: this.filter, cls: 'yhwh-filter', attr: { placeholder: 'Filter this folder…', 'aria-label': 'Filter this folder' } });
    const list = el.createDiv({ cls: 'yhwh-files', attr: { role: 'list', 'aria-label': 'Files and folders', tabindex: '0' } });
    const fill = () => {
      list.empty(); this.visible = p.entries().filter(file => file.name.toLocaleLowerCase().includes(this.filter.toLocaleLowerCase()));
      this.index = Math.max(0, Math.min(this.index, this.visible.length - 1));
      for (const [index, file] of this.visible.entries()) {
        const row = list.createDiv({ cls: 'yhwh-file-row', attr: { role: 'listitem' } });
        const b = button(row, `${file instanceof TFolder ? '▸' : '·'}  ${file.name}`, `Open ${file.name}`, () => { this.index = index; this.openEntry(file); });
        b.dataset.index = String(index); b.classList.toggle('is-selected', index === this.index);
        if (file instanceof TFile) row.createSpan({ text: file.extension || 'text', cls: 'yhwh-extension' });
        row.addEventListener('contextmenu', event => {
          event.preventDefault();
          const menu = new Menu();
          if (file instanceof TFile) menu.addItem(item => item.setTitle('Open in new tab').setIcon('file-plus').onClick(() => this.openEntry(file, true)));
          menu.addItem(item => item.setTitle('Rename or move').setIcon('pencil').onClick(() => p.run(() => p.rename(file))));
          menu.showAtMouseEvent(event);
        });
      }
      if (!this.visible.length) list.createEl('p', { text: this.filter ? 'No matching entries.' : 'This folder is empty.', cls: 'yhwh-muted' });
    };
    filter.addEventListener('input', () => { this.filter = filter.value; this.index = 0; fill(); });
    filter.addEventListener('keydown', event => { if (event.key === 'ArrowDown' || event.key === 'Enter') { event.preventDefault(); this.focusRow(); } });
    fill();
    const footer = el.createDiv('yhwh-footer');
    if (p.current.energy === 50) {
      p.copyBlock(footer, 'obituary');
      if (p.circus) {
        footer.createEl('img', { cls: 'yhwh-circus-image', attr: { src: p.circus.image, alt: 'Family Circus cartoon paired with a Nietzsche quote' } });
        footer.createEl('p', { text: p.circus.quote, cls: 'yhwh-circus-quote' });
        p.external(footer, 'Share this pairing ↗', p.circus.permalink);
      }
      if (p.circusError) footer.createEl('p', { text: p.circusError, cls: 'yhwh-errors' });
      button(footer, p.circusBusy ? 'Loading…' : 'Next cartoon ↻', 'Load a random pairing from nietzschefamilycircus.com', () => p.run(() => p.nextCircus())).disabled = p.circusBusy;
      p.external(footer, 'Nietzsche Family Circus ↗', 'https://nietzschefamilycircus.com/');
    } else p.copyBlock(footer, this.visible.length ? 'welcome' : 'empty');
    button(footer, 'Offerings', 'Open offerings', () => p.offerings());
    if (hadFocus) this.focusRow();
  }
  focusRow() {
    this.contentEl.querySelectorAll<HTMLButtonElement>('[data-index]').forEach(b => {
      b.classList.toggle('is-selected', Number(b.dataset.index) === this.index);
      if (Number(b.dataset.index) === this.index) b.focus();
    });
  }
  async onClose() { this.unsubscribe?.(); }
}

const HELP = `Vault commands (quote paths containing spaces):
  help                       Show this help
  pwd                        Current folder
  ls [folder]                List a folder
  cd [folder]                Navigate; / is vault root, .. is parent
  open <file>                Open in Obsidian (alias: edit)
  new <filename>             Create an empty file, any extension
  mkdir <folder>             Create a folder
  mv <source> <destination>  Rename or move, preserving Obsidian links
  cat <file>                 Read text, up to 64 KB
  find <name>                Find names below the current folder
  mode yhwh|nietzsche|dawkins  Set default personality
  3d                         Open the interactive directory
  hello                      Hello-world command
  clear                      Clear console output
Tab completes paths; ↑/↓ recall command history.
This is a vault command line. Shell processes, pipes and scripts are unavailable.`;

export class ConsoleView extends ItemView {
  private unsubscribe?: () => void;
  private output!: HTMLElement;
  private input!: HTMLInputElement;
  private cwd!: HTMLElement;
  private history: string[] = [];
  private cursor = 0;
  constructor(leaf: WorkspaceLeaf, private plugin: YHWH) { super(leaf); }
  getViewType() { return CONSOLE; }
  getDisplayText() { return 'YHWH · console'; }
  getIcon() { return 'terminal'; }
  async onOpen() {
    const el = this.contentEl; el.empty(); this.plugin.heading(el, 'Navigation console');
    this.output = el.createEl('div', { cls: 'yhwh-console-output', attr: { role: 'log', 'aria-label': 'Command output', 'aria-live': 'polite', tabindex: '0' } });
    this.write('Vault command line · type help. Navigation stays in sync with the file manager.');
    const form = el.createEl('form', { cls: 'yhwh-console-prompt' });
    this.cwd = form.createEl('label');
    this.input = form.createEl('input', { type: 'text', attr: { 'aria-label': 'Vault command', spellcheck: 'false', autocomplete: 'off' } });
    form.createEl('button', { type: 'submit', text: 'Run' });
    const update = () => {
      this.plugin.decorate(el); this.cwd.setText(`/${this.plugin.folder} >`);
      const slider = el.querySelector<HTMLInputElement>('.yhwh-energy input');
      if (slider) slider.value = String(this.plugin.current.energy);
      el.querySelector('.yhwh-energy span')?.setText(`Amount of YHWH-ness · ${mode(this.plugin.current.energy)}`);
    };
    this.unsubscribe = this.plugin.watch(update); update();
    form.addEventListener('submit', event => {
      event.preventDefault(); const line = this.input.value.trim(); if (!line || this.input.disabled) return;
      this.input.value = ''; this.history.push(line); this.cursor = this.history.length;
      this.write(`/${this.plugin.folder} > ${line}`);
      this.input.disabled = true;
      this.execute(line).catch(error => this.write((error as Error).message, true)).finally(() => { this.input.disabled = false; this.input.focus(); });
    });
    this.input.addEventListener('keydown', event => {
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault(); this.cursor = Math.max(0, Math.min(this.history.length, this.cursor + (event.key === 'ArrowUp' ? -1 : 1)));
        this.input.value = this.history[this.cursor] ?? '';
      } else if (event.key === 'Tab') { event.preventDefault(); this.complete(); }
    });
    this.input.focus();
  }
  write(text: string, error = false) {
    this.output.createEl('pre', { text, cls: error ? 'yhwh-errors' : '' });
    while (this.output.children.length > 200) this.output.firstElementChild?.remove();
    this.output.scrollTop = this.output.scrollHeight;
  }
  complete() {
    try {
      const tokens = words(this.input.value);
      if (/\s$/.test(this.input.value)) tokens.push('');
      if (tokens.length < 2) return;
      const value = tokens.at(-1)!;
      const slash = value.lastIndexOf('/');
      const prefix = slash < 0 ? '' : value.slice(0, slash + 1);
      const directory = resolvePath(this.plugin.folder, prefix);
      const folder = this.app.vault.getAbstractFileByPath(directory || '/');
      if (!(folder instanceof TFolder)) return;
      const matches = folder.children.filter(f => f.name.startsWith(value.slice(slash + 1)));
      if (matches.length === 1) {
        tokens[tokens.length - 1] = prefix + matches[0].name + (matches[0] instanceof TFolder ? '/' : '');
        this.input.value = tokens.map(token => JSON.stringify(token)).join(' ');
      } else if (matches.length) this.write(matches.map(f => f.name).join('  '));
    } catch { /* Incomplete quotes are still being typed. */ }
  }
  async execute(line: string) {
    const p = this.plugin, [command, ...args] = words(line);
    const at = (i = 0) => resolvePath(p.folder, args[i] ?? '');
    const entry = (i = 0) => {
      if (!args[i]) throw new Error('A path is required.');
      const file = this.app.vault.getAbstractFileByPath(at(i));
      if (!file) throw new Error(`Not found: ${args[i]}`);
      return file;
    };
    const arity = (min: number, max = min) => { if (args.length < min || args.length > max) throw new Error(`Wrong number of arguments for ${command}. Type help.`); };
    if (command === 'help') { arity(0); this.write(HELP); }
    else if (command === 'clear') { arity(0); this.output.empty(); }
    else if (command === 'pwd') { arity(0); this.write('/' + p.folder); }
    else if (command === 'cd') { arity(0, 1); await p.go(args.length ? at() : ''); }
    else if (command === 'ls') {
      arity(0, 1); const folder = this.app.vault.getAbstractFileByPath(at() || '/');
      if (!(folder instanceof TFolder)) throw new Error('Not a folder.');
      this.write(folder.children.map(f => f.name + (f instanceof TFolder ? '/' : '')).sort().join('\n') || '(empty)');
    } else if (command === 'open' || command === 'edit') {
      arity(1); const file = entry();
      if (file instanceof TFolder) await p.go(file.path);
      else if (file instanceof TFile) await p.open(file, true);
    } else if (command === 'new') {
      arity(1); const file = await this.app.vault.create(at(), ''); await p.open(file, true); this.write('Created ' + file.path);
    } else if (command === 'mkdir') {
      arity(1); await this.app.vault.createFolder(at()); this.write('Created ' + at());
    } else if (command === 'mv') {
      arity(2); const destination = at(1); await this.app.fileManager.renameFile(entry(), destination); this.write('Moved to ' + destination);
    } else if (command === 'cat') {
      arity(1); const file = entry();
      if (!(file instanceof TFile) || file.stat.size > 64_000) throw new Error('Choose a text file smaller than 64 KB.');
      const bytes = await this.app.vault.readBinary(file);
      if (new Uint8Array(bytes).includes(0)) throw new Error('This looks like a binary file.');
      this.write(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } else if (command === 'find') {
      arity(1); const prefix = p.folder ? p.folder + '/' : '';
      const files = this.app.vault.getAllLoadedFiles().filter(f => f.path.startsWith(prefix) && f.name.toLowerCase().includes(args[0].toLowerCase()));
      this.write(files.slice(0, 200).map(f => f.path).join('\n') || 'No matching paths.');
      if (files.length > 200) this.write(`${files.length} matches; showing the first 200.`);
    } else if (command === 'mode') {
      arity(1); if (!['yhwh', 'nietzsche', 'dawkins'].includes(args[0])) throw new Error('Choose yhwh, nietzsche or dawkins.');
      p.settings.energy = args[0] === 'yhwh' ? 100 : args[0] === 'nietzsche' ? 50 : 0;
      await p.save(); await p.go(p.folder); this.write(`Current mode: ${mode(p.current.energy)}. Folder configuration may override the default.`);
    } else if (command === '3d') { arity(0); await p.show(ATLAS); }
    else if (command === 'hello') { arity(0); this.write(p.current.energy ? p.settings.copy.hello : 'Hello, world.'); }
    else throw new Error(`Unknown vault command: ${command}. Type help.`);
  }
  async onClose() { this.unsubscribe?.(); }
}

/** TextFileView owns loading, external changes and saving; this view owns only the editor. */
export class TextView extends TextFileView {
  private editor!: HTMLTextAreaElement;
  private preview!: HTMLElement;
  private language = '';
  private showingPreview = false;
  constructor(leaf: WorkspaceLeaf, private plugin: YHWH) { super(leaf); }
  getViewType() { return TEXT; }
  getDisplayText() { return this.file?.name ?? 'YHWH · text'; }
  getIcon() { return 'file-code'; }
  async onOpen() {
    const el = this.contentEl; el.empty(); this.plugin.decorate(el); el.addClass('yhwh-text');
    const tools = el.createDiv('yhwh-tools');
    button(tools, 'Rename', 'Rename this file', () => this.plugin.run(() => this.file ? this.plugin.rename(this.file) : undefined));
    button(tools, 'Save', 'Save file', () => this.plugin.run(() => this.save()));
    button(tools, 'Format JSON', 'Format JSON', () => this.plugin.run(async () => {
      const text = JSON.stringify(JSON.parse(this.editor.value), null, 2) + '\n';
      this.editor.value = text; this.data = text; await this.save(); if (this.showingPreview) await this.renderPreview();
    }));
    const select = tools.createEl('select', { attr: { 'aria-label': 'Text language' } });
    for (const language of ['', 'text', 'markdown', 'json', 'javascript', 'typescript', 'python', 'bash', 'css', 'html', 'xml', 'yaml', 'sql', 'latex'])
      select.createEl('option', { text: language || 'Detect from filename / shebang', value: language });
    select.addEventListener('change', () => { this.language = select.value; if (this.showingPreview) this.plugin.run(() => this.renderPreview()); });
    button(tools, 'Source / preview', 'Toggle syntax preview', () => this.plugin.run(async () => {
      this.showingPreview = !this.showingPreview; this.editor.hidden = this.showingPreview; this.preview.hidden = !this.showingPreview;
      if (this.showingPreview) await this.renderPreview();
    }));
    this.editor = el.createEl('textarea', { cls: 'yhwh-source', attr: { 'aria-label': 'File contents', spellcheck: 'false' } });
    this.preview = el.createDiv('yhwh-text-preview'); this.preview.hidden = true;
    this.editor.value = this.data ?? '';
    this.editor.addEventListener('input', () => { this.data = this.editor.value; this.requestSave(); });
    this.registerDomEvent(this.editor, 'keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); this.plugin.run(() => this.save()); }
    });
  }
  getViewData() { return this.editor?.value ?? this.data; }
  setViewData(data: string, _clear: boolean) {
    this.data = data;
    if (this.editor && this.editor.value !== data) this.editor.value = data;
    if (this.showingPreview) this.plugin.run(() => this.renderPreview());
  }
  clear() { this.setViewData('', true); }
  async renderPreview() {
    this.preview.empty();
    const aliases: Record<string, string> = { js: 'javascript', ts: 'typescript', py: 'python', sh: 'bash', tex: 'latex', yml: 'yaml', md: 'markdown' };
    const extension = this.file?.extension ?? '';
    let language = this.language || aliases[extension] || extension;
    if (!language && this.editor.value.startsWith('#!')) language = /python/.test(this.editor.value.split('\n')[0]) ? 'python' : 'bash';
    if (language === 'markdown') await MarkdownRenderer.render(this.app, this.editor.value, this.preview, this.file?.path ?? '', this);
    else {
      const runs = this.editor.value.match(/`+/g) ?? [];
      const fence = '`'.repeat(Math.max(3, ...runs.map(run => run.length + 1)));
      await MarkdownRenderer.render(this.app, `${fence}${language.replace(/[^\w+-]/g, '')}\n${this.editor.value}\n${fence}`, this.preview, this.file?.path ?? '', this);
    }
  }
}
