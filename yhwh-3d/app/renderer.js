import "./style.css";
import "@xterm/xterm/css/xterm.css";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { EditorView, basicSetup } from "codemirror";
import { EditorState, Compartment } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { languages } from "@codemirror/language-data";
import { marked } from "marked";
import DOMPurify from "dompurify";
import {
  createIcons,
  FolderTree,
  Orbit,
  Terminal as TerminalIcon,
  SquarePlus,
  Flame,
  Settings2,
  FilePlus2,
  FolderPlus,
  Expand,
  ArrowUp,
  Ellipsis,
  Search,
  EyeOff,
  Eye,
  RefreshCw,
  Pencil,
  Plus,
  House,
  List,
  Scan,
  Pause,
  Play,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Save,
  X,
  Maximize2,
  ScanEye,
  MousePointer2,
  ArrowUpRight,
  Copy,
  FolderOpen,
  Trash2,
  CornerLeftUp,
  Drama,
  Sparkles,
  Command,
  CircleHelp,
  Folder,
  File,
  ChevronRight as ChevronIcon,
  ArrowLeft,
  Check,
  ExternalLink,
} from "lucide";
import { Space } from "./space.js";
import helloWorld from "../plugins/hello-world.js";

const iconSet = {
  FolderTree,
  Orbit,
  Terminal: TerminalIcon,
  SquarePlus,
  Flame,
  Settings2,
  FilePlus2,
  FolderPlus,
  Expand,
  ArrowUp,
  Ellipsis,
  Search,
  EyeOff,
  Eye,
  RefreshCw,
  Pencil,
  Plus,
  House,
  List,
  Scan,
  Pause,
  Play,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Save,
  X,
  Maximize2,
  ScanEye,
  MousePointer2,
  ArrowUpRight,
  Copy,
  FolderOpen,
  Trash2,
  CornerLeftUp,
  Drama,
  Sparkles,
  Command,
  CircleHelp,
  Folder,
  File,
  ChevronIcon,
  ArrowLeft,
  Check,
  ExternalLink,
};
const $ = (selector) => document.querySelector(selector);
const icons = () =>
  createIcons({ icons: iconSet, attrs: { "stroke-width": 1.5 } });
const call = (method, input) => window.yhwh.call(method, input);
const basename = (p) => p.split("/").filter(Boolean).at(-1) || "/";
const parent = (p) => p.substring(0, p.lastIndexOf("/")) || "/";
const join = (p, n) => p.replace(/\/$/, "") + "/" + n;
const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const size = (n) =>
  n < 1024
    ? n + " B"
    : n < 1048576
      ? (n / 1024).toFixed(1) + " KB"
      : (n / 1048576).toFixed(1) + " MB";
const tabs = [];
let active,
  bootstrap,
  space,
  showHidden = false,
  page = 0,
  filter = "",
  toastTimer,
  configPluginCleanup,
  loadedPlugin,
  pendingDialog;
const commands = new Map();
const current = () => tabs.find((t) => t.id === active);
const notify = (message) => {
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 5500);
};
const fail = (error) => {
  console.error(error);
  notify(error.message || String(error));
};
const app = {
  addCommand(command) {
    commands.set(command.id, command);
    renderPlugins();
    return () => {
      commands.delete(command.id);
      renderPlugins();
    };
  },
  notify,
  get copy() {
    return bootstrap.copy;
  },
  navigate: (path) => navigate(path),
  open: (entry) => openEntry(entry),
  get directory() {
    return current()?.directory.path;
  },
  get panels() {
    return {
      files: $(".files-panel"),
      focus: $(".focus"),
      inspector: $(".inspector"),
      terminal: $("#terminal-panel"),
    };
  },
  on: (name, fn) => {
    window.addEventListener(name, fn);
    return () => window.removeEventListener(name, fn);
  },
};
window.yhwhApp = app;
function renderPlugins() {
  if (!bootstrap) return;
  $("#plugin-commands").innerHTML = [...commands.values()]
    .filter((c) => c.plugin !== false)
    .map(
      (c) =>
        `<button data-command="${escape(c.id)}" class="quiet-link"><i data-lucide="${escape(c.icon || "sparkles")}"></i>${escape(c.name)}</button>`,
    )
    .join("");
  icons();
}
function visibleItems() {
  return (current()?.directory.items || []).filter(
    (item) =>
      (showHidden || !item.name.startsWith(".")) &&
      item.name.toLowerCase().includes(filter.toLowerCase()),
  );
}
function renderTabs() {
  $("#tabs").innerHTML = tabs
    .map(
      (t) =>
        `<button class="focus-tab ${t.id === active ? "active" : ""}" data-tab="${t.id}" role="tab" aria-selected="${t.id === active}"><i data-lucide="${t.file ? "file" : "orbit"}"></i><span>${escape(t.file ? basename(t.file.path) : basename(t.directory.path))}${t.dirty ? " •" : ""}</span><span class="tab-close" data-close-tab="${t.id}" aria-label="Close tab">×</span></button>`,
    )
    .join("");
  icons();
}
function renderFiles() {
  const t = current(),
    items = visibleItems();
  $("#file-list").innerHTML =
    `<button class="file-row parent-row" data-path="${escape(t.directory.parent)}" data-directory="true" role="option"><i data-lucide="corner-left-up"></i><span>..</span><small>parent directory</small></button>` +
    items
      .map(
        (entry) =>
          `<button class="file-row ${entry.path === t.selected?.path ? "selected" : ""}" data-path="${escape(entry.path)}" data-directory="${entry.directory}" role="option" aria-selected="${entry.path === t.selected?.path}"><i data-lucide="${entry.directory ? "folder" : "file"}"></i><span>${escape(entry.name)}</span>${entry.link ? "<small>↗</small>" : ""}</button>`,
      )
      .join("");
  $("#expanded-list").innerHTML =
    `<div class="file-table-head"><span>Name</span><span>Size</span><span>Modified</span></div><button class="file-table-row parent-row" data-path="${escape(t.directory.parent)}" data-directory="true"><span><i data-lucide="corner-left-up"></i>..</span><span>Parent directory</span><span></span></button>` +
    items
      .map(
        (entry) =>
          `<button class="file-table-row ${entry.path === t.selected?.path ? "selected" : ""}" data-path="${escape(entry.path)}" data-directory="${entry.directory}"><span><i data-lucide="${entry.directory ? "folder" : "file"}"></i>${escape(entry.name)}</span><span>${entry.directory ? "—" : size(entry.size)}</span><span>${entry.modified ? new Date(entry.modified).toLocaleDateString() : ""}</span></button>`,
      )
      .join("");
  $("#expanded-title").textContent = t.directory.path;
  $("#item-count").textContent = `${items.length} items`;
  $("#dir-count").textContent = t.directory.items.filter(
    (e) => e.directory,
  ).length;
  $("#file-count").textContent = t.directory.items.filter(
    (e) => !e.directory,
  ).length;
  $("#directory-name").textContent = basename(t.directory.path);
  $("#directory-path").textContent = t.directory.path;
  $("#location").value = t.directory.path;
  $("#terminal-path").textContent = t.directory.path;
  $("#space-subtitle").textContent =
    `${items.length} objects · ${t.directory.path.replace(bootstrap.home, "~")}`;
  const components = t.directory.path.split("/").filter(Boolean);
  $("#crumbs").innerHTML =
    `<button data-navigate="/">/</button>` +
    components
      .map(
        (c, i) =>
          `<span>/</span><button data-navigate="/${escape(components.slice(0, i + 1).join("/"))}">${escape(c)}</button>`,
      )
      .join("");
  page = Math.max(0, Math.min(page, Math.ceil(items.length / 24) - 1));
  space?.show(items.slice(page * 24, page * 24 + 24));
  space?.select(t.selected);
  $("#page-count").textContent =
    `${items.length ? page * 24 + 1 : 0}–${Math.min((page + 1) * 24, items.length)} / ${items.length}`;
  icons();
}
function selectEntry(entry) {
  const t = current();
  t.selected = entry;
  space?.select(entry);
  document
    .querySelectorAll("[data-path]")
    .forEach((el) =>
      el.classList.toggle("selected", el.dataset.path === entry.path),
    );
  $("#selection").innerHTML =
    `<div class="selection-symbol ${entry.directory ? "gold" : ""}"><i data-lucide="${entry.directory ? "folder" : "file"}"></i></div><div class="eyebrow">${entry.directory ? "DIRECTORY" : entry.link ? "SYMLINK" : "FILE"}</div><h3>${escape(entry.name)}</h3><p>${escape(entry.path)}</p><div class="selection-detail"><span>${entry.directory ? "Directory" : size(entry.size)}</span><span>${entry.modified ? new Date(entry.modified).toLocaleDateString() : ""}</span></div>`;
  $("#selected-actions").hidden = false;
  icons();
}
async function applyConfig(config) {
  const t = current();
  t.config = config;
  const v = config.values;
  document.body.dataset.theme = v.theme;
  document.documentElement.style.setProperty(
    "--accent",
    /^#[\da-f]{3,8}$/i.test(v.accent) ? v.accent : "#d8bd85",
  );
  document.documentElement.style.setProperty(
    "--editor-size",
    `${Math.max(10, Math.min(32, Number(v.font_size) || 15))}px`,
  );
  document.title = v.title || "YHWH 3D";
  showHidden = v.show_hidden === "true" || v.show_hidden === "1";
  if (t.appliedFiles !== v.file_manager) {
    $(".shell").classList.toggle(
      "hide-files",
      v.file_manager === "false" || v.file_manager === "0",
    );
    t.appliedFiles = v.file_manager;
  }
  if (t.appliedTerminal !== v.terminal) {
    $("#terminal-panel").hidden = v.terminal !== "true" && v.terminal !== "1";
    t.appliedTerminal = v.terminal;
  }
  $("#terminal-panel").style.height =
    `${Math.max(150, Math.min(650, +v.terminal_height || 260))}px`;
  $("#energy").value = { dawkins: 0, nietzsche: 50, yhwh: 100 }[v.theme] ?? 100;
  $("#user-theme").textContent =
    (config.stylesheet || "") + "\n" + (config.theme_css || "");
  $("#space-canvas").style.backgroundImage = config.background
    ? `url("${config.background}")`
    : "";
  space?.configure(v);
  const voice =
    v.theme === "nietzsche"
      ? bootstrap.copy.nietzsche
      : v.theme === "dawkins"
        ? bootstrap.copy.dawkins
        : bootstrap.copy.welcome;
  $("#welcome").textContent = voice;
  $("#welcome-tip").textContent = bootstrap.copy.tip;
  $("#status").textContent = config.warnings
    ? "Config: " + config.warnings
    : "No vault required. " +
      (config.files.length
        ? `${config.files.length} config files applied.`
        : "Your filesystem is open.");
  if (config.warnings) notify(config.warnings);
  if (config.plugin !== loadedPlugin) {
    configPluginCleanup?.();
    configPluginCleanup = undefined;
    loadedPlugin = config.plugin;
    if (config.plugin) {
      const url = URL.createObjectURL(
        new Blob([config.plugin], { type: "text/javascript" }),
      );
      try {
        const plugin = await import(url);
        configPluginCleanup = await plugin.default(app);
      } catch (error) {
        notify("Plugin: " + error.message);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  }
  window.dispatchEvent(new CustomEvent("yhwh:config", { detail: config }));
}
async function newTab(target = current()?.directory.path || bootstrap.target) {
  const id = crypto.randomUUID();
  const term = new Terminal({
    fontFamily: '"DejaVu Sans Mono", monospace',
    fontSize: 13,
    cursorBlink: true,
    scrollback: 5000,
    theme: {
      background: "#0a1018",
      foreground: "#d6dce8",
      cursor: "#d8bd85",
      selectionBackground: "#3a4056",
      black: "#101820",
      red: "#d87b7b",
      green: "#a5c9aa",
      yellow: "#e3c38b",
      blue: "#8bade0",
      magenta: "#b3a1da",
      cyan: "#83bdcc",
      white: "#e0ded8",
    },
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  const terminalHost = document.createElement("div");
  terminalHost.className = "terminal-instance";
  terminalHost.dataset.id = id;
  $("#terminals").append(terminalHost);
  term.open(terminalHost);
  const t = { id, term, fit, terminalHost, view: "space", dirty: false };
  tabs.push(t);
  active = id;
  term.onData((data) => call("terminal-input", { id, data }).catch(fail));
  const result = await call("tab-open", { id, path: target });
  Object.assign(t, result);
  await activate(id);
  if (target !== result.directory.path)
    await openEntry({ path: target, directory: false });
}
async function activate(id) {
  active = id;
  const t = current();
  for (const item of tabs) item.terminalHost.hidden = item.id !== id;
  page = 0;
  filter = "";
  $("#filter").value = "";
  renderTabs();
  renderFiles();
  setView(t.view || "space");
  if (t.selected) selectEntry(t.selected);
  else {
    $("#selection").innerHTML =
      '<div class="selection-symbol"><i data-lucide="mouse-pointer-2"></i></div><h3>Select something</h3><p>A small world is still a world.</p>';
    $("#selected-actions").hidden = true;
  }
  if (t.file) renderDocument();
  await applyConfig(t.config);
  renderFiles();
  fitTerminal();
  icons();
}
async function closeTab(id) {
  const t = tabs.find((t) => t.id === id);
  if (
    t.dirty &&
    !(await ask(
      "Unsaved changes",
      `Discard edits to ${basename(t.file.path)}?`,
      "Discard edits",
    ))
  )
    return;
  await call("tab-close", { id });
  t.editor?.destroy();
  t.term.dispose();
  t.terminalHost.remove();
  tabs.splice(tabs.indexOf(t), 1);
  if (!tabs.length) await newTab(bootstrap.home);
  else await activate(tabs.at(-1).id);
}
async function navigate(destination, fromTerminal = false) {
  const t = current();
  const id = t.id;
  if (destination === "~") destination = bootstrap.home;
  else if (destination.startsWith("~/"))
    destination = bootstrap.home + destination.slice(1);
  else if (!destination.startsWith("/"))
    destination = join(t.directory.path, destination);
  const result = await call("navigate", {
    id,
    path: destination,
    fromTerminal,
  });
  Object.assign(t, result);
  t.selected = null;
  if (active !== id) return;
  page = 0;
  setView("space");
  renderTabs();
  await applyConfig(result.config);
  renderFiles();
  $("#selected-actions").hidden = true;
  $("#selection").innerHTML =
    '<div class="selection-symbol"><i data-lucide="mouse-pointer-2"></i></div><h3>Select something</h3><p>A small world is still a world.</p>';
  icons();
  window.dispatchEvent(
    new CustomEvent("yhwh:navigate", { detail: { path: t.directory.path } }),
  );
}
async function refresh() {
  const t = current();
  t.directory = await call("list", { path: t.directory.path });
  renderFiles();
}
function setView(view) {
  const t = current();
  t.view = view;
  $("#spatial-view").hidden = view !== "space";
  $("#document-view").hidden = view !== "document";
  $("#expanded-files").hidden = view !== "files";
  $("#space-button").classList.toggle("active", view === "space");
  $(".shell").classList.remove("terminal-focus");
  requestAnimationFrame(() => {
    space?.resize();
    t.editor?.requestMeasure();
  });
}
function toggleFiles() {
  $(".shell").classList.toggle("hide-files");
  requestAnimationFrame(() => space?.resize());
}
function toggleTerminal() {
  const panel = $("#terminal-panel");
  panel.hidden = !panel.hidden;
  $(".shell").classList.remove("terminal-focus");
  if (!panel.hidden) {
    fitTerminal();
    current().term.focus();
  } else {
    space?.resize();
    current().editor?.requestMeasure();
  }
}
function fitTerminal() {
  if (!current() || $("#terminal-panel").hidden) return;
  requestAnimationFrame(() => {
    try {
      current().fit.fit();
      call("terminal-resize", {
        id: active,
        cols: current().term.cols,
        rows: current().term.rows,
      }).catch(fail);
    } catch {}
  });
}
new ResizeObserver(fitTerminal).observe($("#terminals"));
async function languageExtension(name) {
  const language = languages.find(
    (l) =>
      l.name.toLowerCase() === name.toLowerCase() ||
      l.alias.some((a) => a.toLowerCase() === name.toLowerCase()),
  );
  return language ? await language.load() : [];
}
async function openEntry(entry) {
  if (entry.directory) return navigate(entry.path);
  const t = current();
  if (t.file?.path === entry.path) {
    setView("document");
    return;
  }
  if (
    t.dirty &&
    !(await ask(
      "Unsaved changes",
      `Discard edits to ${basename(t.file.path)} and open ${basename(entry.path)}?`,
      "Discard edits",
    ))
  )
    return;
  const file = await call("read", { path: entry.path });
  let language = file.language || "Plain text";
  try {
    for (const [pattern, mode] of Object.entries(
      JSON.parse(file.config.values.filetypes || "{}"),
    ))
      if (new RegExp(pattern).test(file.path)) language = mode;
  } catch (error) {
    notify("filetypes: " + error.message);
  }
  file.language = language;
  t.editor?.destroy();
  t.file = file;
  t.dirty = false;
  t.pretty = false;
  t.prettyHTML = "";
  t.language = new Compartment();
  if (file.text !== undefined) {
    t.editor = new EditorView({
      state: EditorState.create({
        doc: file.text,
        extensions: [
          basicSetup,
          oneDark,
          t.language.of(await languageExtension(language)),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              t.dirty = t.editor.state.doc.toString() !== t.file.text;
              renderTabs();
              renderSaveState();
            }
          }),
        ],
      }),
    });
  } else t.editor = null;
  setView("document");
  renderDocument();
  renderTabs();
  await applyConfig(file.config);
  renderSaveState();
  t.editor?.focus();
}
function renderSaveState() {
  $("#save-state").textContent = current().dirty
    ? "Unsaved changes"
    : current().file
      ? "Saved"
      : "";
}
function renderDocument() {
  const t = current(),
    f = t.file;
  if (!f) return;
  $("#filename").textContent = basename(f.path);
  $("#document-path").textContent = f.path;
  $("#document-kind").textContent = f.mime;
  $("#language").value = f.language;
  $("#editor").replaceChildren(...(t.editor ? [t.editor.dom] : []));
  $("#editor").hidden = !t.editor || t.pretty;
  $("#pretty-view").hidden = !t.pretty;
  if (t.pretty) $("#pretty-view").innerHTML = t.prettyHTML || "";
  $("#media-view").hidden = !!t.editor;
  $("#pretty-button").hidden = !t.editor;
  $("#media-view").innerHTML = f.image
    ? `<img alt="${escape(basename(f.path))}" src="${f.image}">`
    : f.binary
      ? `<div class="binary-file"><i data-lucide="file"></i><h2>${escape(basename(f.path))}</h2><p>${escape(f.mime)} · ${size(f.size)}</p><p>This format opens in your system application.</p><button data-action="open-external" class="primary">Open externally <i data-lucide="external-link"></i></button></div>`
      : "";
  $("#pretty-button").classList.toggle("active", !!t.pretty);
  renderSaveState();
  icons();
}
async function save() {
  const t = current();
  if (!t.editor) return;
  const text = t.editor.state.doc.toString();
  const result = await call("save", {
    path: t.file.path,
    text,
    version: t.file.version,
  });
  Object.assign(t.file, { text, version: result.version });
  t.dirty = false;
  renderTabs();
  renderSaveState();
  if (t.file.path === bootstrap.copyFile) {
    bootstrap.copy = await call("voice");
    await applyConfig(t.config);
  }
  notify("Saved.");
}
async function pretty() {
  const t = current();
  if (!t.editor) return;
  t.pretty = !t.pretty;
  if (t.pretty) {
    const text = t.editor.state.doc.toString(),
      mode = t.file.language;
    let content;
    if (mode === "Markdown")
      content = DOMPurify.sanitize(marked.parse(text), {
        ALLOW_DATA_ATTR: false,
      });
    else if (mode === "JSON") {
      const formatted = JSON.stringify(JSON.parse(text), null, 2);
      content = `<pre>${escape(formatted)}</pre><button data-action="format-json" class="primary">Apply formatting to editor</button>`;
    } else if (mode === "HTML")
      content = DOMPurify.sanitize(text, { ALLOW_DATA_ATTR: false });
    else content = `<pre>${escape(text)}</pre>`;
    t.prettyHTML = content;
    $("#pretty-view").innerHTML = content;
  }
  renderDocument();
}
async function renameEntry(entry = current().selected, newName) {
  if (!entry) return;
  if (!newName)
    newName = await inputDialog(
      "Rename",
      entry.name || basename(entry.path),
      "New name",
    );
  if (!newName) return;
  if (/[/\\]/.test(newName) || [".", ".."].includes(newName))
    throw new Error("Use a filename without path separators.");
  const old = entry.path,
    destination = join(parent(old), newName);
  if (old === destination) return;
  await call("rename", { path: old, destination });
  for (const t of tabs) if (t.file?.path === old) t.file.path = destination;
  entry.path = destination;
  entry.name = newName;
  await refresh();
  if (current().file) renderDocument();
  renderTabs();
}
function dialog(content) {
  if ($("#dialog").open) closeDialog();
  $("#dialog-content").innerHTML = content;
  icons();
  $("#dialog").showModal();
}
function closeDialog(value = null) {
  const finish = pendingDialog;
  pendingDialog = null;
  if ($("#dialog").open) $("#dialog").close();
  finish?.(value);
}
function ask(title, text, button = "Continue") {
  return new Promise((resolve) => {
    dialog(
      `<form method="dialog"><div class="eyebrow">YHWH 3D</div><h2>${escape(title)}</h2><p>${escape(text)}</p><div class="dialog-buttons"><button value="cancel">Cancel</button><button value="ok" class="primary">${escape(button)}</button></div></form>`,
    );
    pendingDialog = (result) => resolve(result === "ok");
    $("#dialog form").addEventListener("submit", (event) => {
      event.preventDefault();
      closeDialog(event.submitter?.value);
    });
  });
}
function inputDialog(title, value = "", label = "Name") {
  return new Promise((resolve) => {
    dialog(
      `<form method="dialog"><div class="eyebrow">FILESYSTEM</div><h2>${escape(title)}</h2><label>${escape(label)}<input name="value" value="${escape(value)}" autocomplete="off" required></label><div class="dialog-buttons"><button value="cancel" formnovalidate>Cancel</button><button value="ok" class="primary">Save</button></div></form>`,
    );
    const input = $("#dialog input");
    pendingDialog = (result) => resolve(result === "ok" ? input.value : null);
    $("#dialog form").addEventListener("submit", (event) => {
      event.preventDefault();
      closeDialog(event.submitter?.value);
    });
    input.focus();
    input.select();
  });
}
$("#dialog").addEventListener("cancel", (event) => {
  event.preventDefault();
  closeDialog();
});
const closeButton =
  '<button data-action="close-dialog" class="dialog-close" title="Close"><i data-lucide="x"></i></button>';
function help() {
  dialog(
    `${closeButton}<div class="eyebrow">FIELD GUIDE / YHWH 3D</div><h2>Go up. Go anywhere.</h2><p>Double-click a directory in Space or Files to enter it. Open a file to edit. Your shell follows the directory; a shell <code>cd</code> brings Files with it. Every focus tab has its own shell, directory and document.</p><div class="shortcuts"><span>Files sidebar</span><kbd>Ctrl E</kbd><span>Focus file manager</span><kbd>Ctrl D</kbd><span>Terminal</span><kbd>Ctrl B / Alt Shift T</kbd><span>Parent directory</span><kbd>Alt ↑ / Backspace</kbd><span>Command palette</span><kbd>Ctrl P / Ctrl Shift P</kbd><span>New / close focus tab</span><kbd>Ctrl T / Ctrl W</kbd><span>Previous / next tab</span><kbd>Ctrl Shift Tab / Ctrl Tab</kbd><span>Save / pretty mode</span><kbd>Ctrl S / Ctrl Shift V</kbd><span>New file / rename</span><kbd>Ctrl N / F2</kbd><span>Hidden files</span><kbd>Ctrl H</kbd></div><p>Drag empty space to orbit. Scroll to zoom. File labels and the sidebar offer keyboard access to every object.</p><h3>About YHWH</h3><p>${escape(bootstrap.copy.about)}</p><div class="dialog-buttons"><button data-url="https://thedynamiclinker.com">About Us ↗</button><button data-url="https://www.amazon.com/dp/B0HNQ23QKT">About YHWH · Genesis ↗</button><button data-action="edit-voice">Edit YHWH text</button></div>`,
  );
}
function settings() {
  const t = current(),
    v = t.config.values;
  dialog(
    `${closeButton}<div class="eyebrow">SETTINGS / LOCAL GRAVITY</div><h2>Make yourself at home.</h2><p>These controls apply to this focus tab. Persistent choices belong in your hierarchical <code>rc</code> and <code>rc.3d</code> files.</p><form id="settings-form"><label>Personality<select name="theme">${["yhwh", "nietzsche", "dawkins"].map((m) => `<option ${m === v.theme ? "selected" : ""}>${m}</option>`).join("")}</select></label><label>Bloom<input name="bloom" type="range" min="0" max="2" step="0.1" value="${escape(v.bloom)}"></label><label>Motion<select name="motion"><option value="1" ${v.motion !== "0" ? "selected" : ""}>On</option><option value="0" ${v.motion === "0" ? "selected" : ""}>Still</option></select></label><label>Editor font size<input name="font_size" type="number" min="10" max="32" value="${escape(v.font_size)}"></label><label>File type rules (JSON: filename regex → language)<textarea name="filetypes">${escape(v.filetypes)}</textarea></label><button class="primary">Apply</button></form><h3>Configuration in effect</h3><p>${t.config.files.length ? t.config.files.map((p) => `<button class="config-link" data-open="${escape(p)}">${escape(p)}</button>`).join("") : "No configuration files. Defaults are active."}</p><button data-action="open-3d-config">Open rc.3d</button>${v.settings_html ? DOMPurify.sanitize(v.settings_html) : ""}<p class="muted">Themes can use Obsidian CSS variables. Native Obsidian plugins need their own API and are not loaded here.</p>`,
  );
  for (const label of document.querySelectorAll("#settings-form label")) {
    const name = label.querySelector("[name]")?.name;
    label.hidden = !(v.settings_fields || "")
      .split(",")
      .map((s) => s.trim())
      .includes(name);
  }
  $("#settings-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const entries = Object.fromEntries(new FormData(event.currentTarget));
    try {
      JSON.parse(entries.filetypes);
      applyConfig({ ...t.config, values: { ...v, ...entries } }).catch(fail);
      closeDialog();
    } catch (error) {
      fail(error);
    }
  });
}
function offerings() {
  dialog(
    `${closeButton}<div class="eyebrow">OFFERINGS</div><h2>A little fuel for creation.</h2><p>${escape(bootstrap.copy.burnt)}</p><button data-action="burnt" class="offering-card"><i data-lucide="flame"></i><span><strong>Burnt Offering</strong><small>Set up a donation link</small></span><i data-lucide="arrow-up-right"></i></button><button data-action="piece" class="offering-card"><i data-lucide="file-plus-2"></i><span><strong>Piece Offering</strong><small>Choose a file to stage locally</small></span><i data-lucide="arrow-up-right"></i></button><p>${escape(bootstrap.copy.piece)}</p><button data-action="edit-voice">Edit this voice</button>`,
  );
}
function burnt() {
  dialog(
    `${closeButton}<div class="eyebrow">BURNT OFFERING / DEVELOPER SETUP</div><h2>Connect the altar.</h2><ol><li>Create a Stripe account using the button below.</li><li>In Stripe, create a product for donations and a Payment Link. Choose customer-entered amounts if available.</li><li>Use test mode first. Complete Stripe’s identity and business details, then connect the bank account that should receive payouts.</li><li>Copy the live Payment Link into the app’s offering action when ready. Keep secret API keys out of the renderer and repository.</li><li>For an upload website, add a server endpoint, size limits and storage, then connect Piece Offering. No upload is sent by this prototype.</li></ol><div class="dialog-buttons"><button data-url="https://dashboard.stripe.com/register">Create Stripe account ↗</button><button data-url="https://docs.stripe.com/payment-links">Payment Links guide ↗</button><button data-url="https://thedynamiclinker.com">Our website ↗</button></div><p>Payments and uploads are currently stubs. No payment is taken here.</p>`,
  );
}
function commandPalette() {
  dialog(
    `${closeButton}<div class="eyebrow">COMMANDS</div><h2>What shall we do?</h2><input id="command-filter" placeholder="Search commands or type a path…" aria-label="Search commands"><div id="command-results"></div>`,
  );
  const show = () => {
    const q = $("#command-filter").value.toLowerCase();
    $("#command-results").innerHTML = [...commands.values()]
      .filter((c) => c.name.toLowerCase().includes(q))
      .map(
        (c) =>
          `<button class="command-result" data-command="${escape(c.id)}">${escape(c.name)}<i data-lucide="arrow-up-right"></i></button>`,
      )
      .join("");
    icons();
  };
  $("#command-filter").addEventListener("input", show);
  $("#command-filter").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      const q = event.target.value;
      if (q.startsWith("/") || q.startsWith("~")) {
        closeDialog();
        navigate(q).catch(fail);
      } else $("#command-results button")?.click();
    }
  });
  show();
  $("#command-filter").focus();
}
const actions = {
  files: toggleFiles,
  terminal: toggleTerminal,
  space: () => setView("space"),
  expand: () =>
    setView(
      current().view === "files"
        ? current().file
          ? "document"
          : "space"
        : "files",
    ),
  up: () => navigate(current().directory.parent),
  home: () => navigate(bootstrap.home),
  "new-tab": () => newTab(),
  refresh,
  "choose-directory": async () => {
    const path = await call("choose", { directory: true });
    if (path) await navigate(path);
  },
  "create-file": async () => {
    const name = await inputDialog(
      "New file",
      "",
      "Filename, with any extension or none",
    );
    if (name) {
      const path = await call("create", {
        path: current().directory.path,
        name,
      });
      await refresh();
      await openEntry({ path });
    }
  },
  "create-folder": async () => {
    const name = await inputDialog("New folder");
    if (name) {
      await call("create", {
        path: current().directory.path,
        name,
        folder: true,
      });
      await refresh();
    }
  },
  "reset-camera": () => space?.reset(),
  motion: () => {
    const c = current().config;
    c.values.motion = c.values.motion === "0" ? "1" : "0";
    space?.configure(c.values);
  },
  "prev-page": () => {
    page--;
    renderFiles();
  },
  "next-page": () => {
    page++;
    renderFiles();
  },
  save,
  pretty,
  "format-json": () => {
    const t = current();
    const text =
      JSON.stringify(JSON.parse(t.editor.state.doc.toString()), null, 2) + "\n";
    t.editor.dispatch({
      changes: { from: 0, to: t.editor.state.doc.length, insert: text },
    });
    t.pretty = false;
    renderDocument();
  },
  "close-document": async () => {
    if (
      current().dirty &&
      !(await ask(
        "Unsaved changes",
        "Discard this document’s edits?",
        "Discard edits",
      ))
    )
      return;
    current().editor?.destroy();
    current().editor = null;
    current().file = null;
    current().dirty = false;
    setView("space");
    renderTabs();
    renderSaveState();
  },
  "open-selected": () => current().selected && openEntry(current().selected),
  rename: () => renameEntry(),
  "copy-path": () =>
    current().selected &&
    navigator.clipboard
      .writeText(current().selected.path)
      .then(() => notify("Path copied.")),
  reveal: () =>
    current().selected && call("reveal", { path: current().selected.path }),
  trash: async () => {
    const e = current().selected;
    if (
      e &&
      (await ask(
        "Move to trash",
        `Move ${e.name} to the system trash?`,
        "Move to trash",
      ))
    ) {
      await call("trash", { path: e.path });
      current().selected = null;
      await refresh();
      $("#selected-actions").hidden = true;
    }
  },
  "open-external": () => call("open-external", { path: current().file.path }),
  "terminal-expand": () => {
    $(".shell").classList.toggle("terminal-focus");
    fitTerminal();
  },
  "edit-voice": async () => {
    closeDialog();
    await openEntry({ path: bootstrap.copyFile });
    notify("Edit voice.json and save. This changes the implementation.");
  },
  "open-3d-config": async () => {
    const path = join(bootstrap.home, "config/yhwh/rc.3d");
    closeDialog();
    await openEntry({ path });
  },
  settings,
  help,
  offerings,
  burnt,
  commands: commandPalette,
  "close-dialog": closeDialog,
  piece: async () => {
    const receipt = await call("offering");
    if (receipt) {
      dialog(
        `${closeButton}<div class="eyebrow">PIECE OFFERING</div><h2>Staged locally.</h2><p>${escape(receipt.name)} · ${size(receipt.size)}</p><p>${escape(receipt.status)}</p><p>Send it yourself when ready:</p><button data-url="mailto:yhwh@thedynamiclinker.com">Email YHWH ↗</button><button data-url="https://thedynamiclinker.com">Open website ↗</button>`,
      );
    }
  },
  circus: async () => {
    dialog(
      `${closeButton}<div class="eyebrow">NIETZSCHE FAMILY CIRCUS</div><h2>Loading an improbable pairing…</h2><button data-url="https://nietzschefamilycircus.com">Open the original site ↗</button>`,
    );
    try {
      const pair = await call("circus");
      dialog(
        `${closeButton}<div class="eyebrow">NIETZSCHE FAMILY CIRCUS</div><img class="circus" src="${pair.image}" alt="Family Circus cartoon"><blockquote>${escape(pair.quote)}</blockquote><div class="dialog-buttons"><button data-action="circus">Another universe</button><button data-url="${escape(pair.permalink)}">Original pairing ↗</button></div>`,
      );
    } catch (error) {
      notify(error.message);
    }
  },
  upgrades: () =>
    dialog(
      `${closeButton}<div class="eyebrow">COMING SOON / MOSTLY</div><h2>More from the mountain.</h2><p>${escape(bootstrap.copy.advertisement)}</p><p>You are already in YHWH 3D. Sync, Stuff and Dating are not implemented. No pre-orders are taken.</p><button data-action="edit-voice">Edit this advertisement</button>`,
    ),
};
for (const [id, name] of Object.entries({
  space: "Open spatial explorer",
  files: "Toggle Files sidebar",
  expand: "Focus file manager",
  terminal: "Toggle terminal",
  "new-tab": "New focus tab",
  "choose-directory": "Choose a directory",
  "create-file": "New file",
  "create-folder": "New folder",
  save: "Save document",
  pretty: "Toggle pretty view",
  refresh: "Refresh directory",
  settings: "Settings",
  help: "Help and About",
  offerings: "Offerings",
  "edit-voice": "Edit YHWH text in source",
  up: "Go to parent directory",
}))
  commands.set(id, { id, name, run: actions[id], plugin: false });

document.addEventListener("click", (event) => {
  const command = event.target.closest("[data-command]");
  if (command) {
    closeDialog();
    Promise.resolve(commands.get(command.dataset.command)?.run()).catch(fail);
    return;
  }
  const url = event.target.closest("[data-url]");
  if (url) {
    call("external", { url: url.dataset.url }).catch(fail);
    return;
  }
  const link = event.target.closest("#pretty-view a");
  if (link) {
    event.preventDefault();
    if (/^https?:|^mailto:/.test(link.getAttribute("href")))
      call("external", { url: link.href }).catch(fail);
    else
      openEntry({
        path: join(
          parent(current().file.path),
          decodeURIComponent(link.getAttribute("href")),
        ),
      }).catch(fail);
    return;
  }
  const action = event.target.closest("[data-action]");
  if (action) {
    Promise.resolve()
      .then(() => actions[action.dataset.action]?.())
      .catch(fail);
    return;
  }
  const closed = event.target.closest("[data-close-tab]");
  if (closed) {
    closeTab(closed.dataset.closeTab).catch(fail);
    return;
  }
  const tab = event.target.closest("[data-tab]");
  if (tab) {
    if (current()?.id === tab.dataset.tab && current().file)
      current().view = "document";
    activate(tab.dataset.tab).catch(fail);
    return;
  }
  const crumb = event.target.closest("[data-navigate]");
  if (crumb) {
    navigate(crumb.dataset.navigate).catch(fail);
    return;
  }
  const config = event.target.closest("[data-open]");
  if (config) {
    closeDialog();
    openEntry({ path: config.dataset.open }).catch(fail);
    return;
  }
  const row = event.target.closest("[data-path]");
  if (row && !row.classList.contains("node-label")) {
    const entry = current().directory.items.find(
      (e) => e.path === row.dataset.path,
    ) || { path: row.dataset.path, name: "..", directory: true };
    selectEntry(entry);
    if (entry.name === "..") navigate(entry.path).catch(fail);
  }
  const mode = event.target.closest("[data-mode]");
  if (mode) setMode(mode.dataset.mode);
});
document.addEventListener("dblclick", (event) => {
  const row = event.target.closest(".file-row,.file-table-row");
  if (row)
    openEntry({
      path: row.dataset.path,
      directory: row.dataset.directory === "true",
    }).catch(fail);
});
$("#file-list").addEventListener("keydown", (event) => {
  const items = [...$("#file-list").querySelectorAll("button")],
    index = items.indexOf(document.activeElement);
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    items[
      Math.max(
        0,
        Math.min(
          items.length - 1,
          index + (event.key === "ArrowDown" ? 1 : -1),
        ),
      )
    ]?.focus();
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    navigate(current().directory.parent).catch(fail);
  }
  if (event.key === "ArrowRight" || event.key === "Enter") {
    const row = document.activeElement;
    if (row?.dataset.path) {
      event.preventDefault();
      openEntry({
        path: row.dataset.path,
        directory: row.dataset.directory === "true",
      }).catch(fail);
    }
  }
});
$("#location").addEventListener("keydown", (event) => {
  if (event.key === "Enter") navigate(event.target.value).catch(fail);
});
$("#filter").addEventListener("input", (event) => {
  filter = event.target.value;
  page = 0;
  renderFiles();
});
$("#hidden-toggle").addEventListener("click", () => {
  showHidden = !showHidden;
  renderFiles();
  $("#hidden-toggle").classList.toggle("active", showHidden);
});
$("#filename").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    event.target.blur();
  }
  if (event.key === "Escape") {
    event.target.textContent = basename(current().file.path);
    event.target.blur();
  }
});
$("#filename").addEventListener("blur", () => {
  const file = current()?.file;
  if (file) {
    const value = $("#filename").textContent.trim();
    renameEntry({ path: file.path, name: basename(file.path) }, value).catch(
      (error) => {
        fail(error);
        $("#filename").textContent = basename(file.path);
      },
    );
  }
});
$("#language").innerHTML = [
  "Plain text",
  ...new Set(languages.map((l) => l.name)),
]
  .sort()
  .map((name) => `<option>${escape(name)}</option>`)
  .join("");
$("#language").value = "Plain text";
$("#language").addEventListener("change", async (event) => {
  const t = current();
  if (!t.editor) return;
  t.file.language = event.target.value;
  t.editor.dispatch({
    effects: t.language.reconfigure(await languageExtension(t.file.language)),
  });
  $("#document-kind").textContent = t.file.language + " (override)";
});
function setMode(mode) {
  const t = current();
  t.config.values.theme = mode;
  applyConfig(t.config).catch(fail);
}
$("#energy").addEventListener("input", (event) =>
  setMode({ 0: "dawkins", 50: "nietzsche", 100: "yhwh" }[event.target.value]),
);
document.addEventListener(
  "keydown",
  (event) => {
    if ($("#dialog").open) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog();
      }
      return;
    }
    const mod = event.ctrlKey || event.metaKey,
      typing = event.target.closest(
        "input,textarea,[contenteditable=true],.cm-editor,.xterm",
      );
    let action;
    if (mod) {
      const key = event.key.toLowerCase();
      if (key === "s") action = "save";
      else if (key === "e") action = "files";
      else if (key === "b") action = "terminal";
      else if (key === "d") action = "expand";
      else if (key === "t") action = "new-tab";
      else if (key === "p") action = "commands";
      else if (key === "n") action = "create-file";
      else if (key === "h" && !typing) {
        event.preventDefault();
        event.stopPropagation();
        $("#hidden-toggle").click();
        return;
      } else if (key === "w") {
        event.preventDefault();
        closeTab(active).catch(fail);
        return;
      } else if (key === "tab") {
        event.preventDefault();
        const i = tabs.findIndex((t) => t.id === active);
        activate(
          tabs[(i + (event.shiftKey ? -1 : 1) + tabs.length) % tabs.length].id,
        ).catch(fail);
        return;
      } else if (event.shiftKey && key === "v") action = "pretty";
    }
    if (event.altKey && event.key === "ArrowUp") action = "up";
    if (event.altKey && event.shiftKey && event.key.toLowerCase() === "t")
      action = "terminal";
    if (!typing && event.key === "Backspace") action = "up";
    if (!typing && event.key === "F2") action = "rename";
    if (action) {
      event.preventDefault();
      event.stopPropagation();
      Promise.resolve()
        .then(() => actions[action]())
        .catch(fail);
    }
  },
  true,
);
window.addEventListener("beforeunload", (event) => {
  if (tabs.some((t) => t.dirty)) {
    event.preventDefault();
    event.returnValue = "There are unsaved files.";
  }
});
window.yhwh.onTerminal((event) => {
  const t = tabs.find((t) => t.id === event.id);
  if (!t) return;
  if (event.type === "data")
    t.term.write(Uint8Array.from(atob(event.data), (c) => c.charCodeAt(0)));
  if (event.type === "error") t.term.write("\r\n" + event.data);
  if (event.type === "exit") t.term.write("\r\n[Shell exited]\r\n");
  if (event.type === "cwd" && event.data !== t.directory?.path) {
    if (event.id === active) navigate(event.data, true).catch(fail);
    else
      call("navigate", { id: t.id, path: event.data, fromTerminal: true })
        .then((result) => Object.assign(t, result))
        .catch(fail);
  }
});
window.yhwh.onDirectory(({ id }) => {
  if (id === active) refresh().catch(fail);
});
let userInteracted = false,
  graphicsRetry = false;
document.addEventListener(
  "pointerdown",
  () => {
    userInteracted = true;
  },
  { capture: true, once: true },
);
document.addEventListener(
  "keydown",
  () => {
    userInteracted = true;
  },
  { capture: true, once: true },
);
function graphicsFallback() {
  if (userInteracted || graphicsRetry || tabs.some((t) => t.dirty)) return;
  graphicsRetry = true;
  call("graphics-fallback")
    .then((retrying) => {
      if (retrying)
        $("#gpu-status").textContent = "RESTARTING WITH SOFTWARE 3D";
    })
    .catch(fail);
}
(async () => {
  bootstrap = await call("bootstrap");
  icons();
  try {
    space = new Space($("#space-canvas"), {
      select: selectEntry,
      open: (entry) => openEntry(entry).catch(fail),
      status: (text) => {
        $("#gpu-status").textContent = text;
        if (text.includes("context lost")) graphicsFallback();
      },
    });
  } catch (error) {
    $("#gpu-status").textContent = "FILES MODE";
    $("#space-canvas").innerHTML =
      '<div class="webgl-fallback">The GPU could not start. Files, editor and terminal are available. Try a different GPU driver or use the Files view.</div>';
    console.warn(error);
    graphicsFallback();
  }
  helloWorld(app);
  await newTab(bootstrap.target);
  icons();
})().catch(fail);
