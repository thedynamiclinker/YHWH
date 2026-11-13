import { text as interfaceText } from '../../../lib/text.cjs';
import interfaceCopy from '../../../etc/three/text-renderer.json';
const ui = interfaceText(interfaceCopy);
import "../../../etc/three/style.css";
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
    ? n + ui("b")
    : n < 1048576
      ? (n / 1024).toFixed(1) + ui("kb")
      : (n / 1048576).toFixed(1) + ui("mb");
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
        ui("template", escape(c.id), escape(c.icon || "sparkles"), escape(c.name)),
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
        ui("-", t.id === active ? "active" : "", t.id, t.id === active, t.file ? "file" : "orbit", escape(t.file ? basename(t.file.path) : basename(t.directory.path)), t.dirty ? " •" : "", t.id),
    )
    .join("");
  icons();
}
function renderFiles() {
  const t = current(),
    items = visibleItems();
  $("#file-list").innerHTML =
    ui("-parent-directory", escape(t.directory.parent)) +
    items
      .map(
        (entry) =>
          ui("template-2", entry.path === t.selected?.path ? "selected" : "", escape(entry.path), entry.directory, entry.path === t.selected?.path, entry.directory ? "folder" : "file", escape(entry.name), entry.link ? "<small>↗</small>" : ""),
      )
      .join("");
  $("#expanded-list").innerHTML =
    ui("name-size-modified-parent-directory", escape(t.directory.parent)) +
    items
      .map(
        (entry) =>
          ui("template-3", entry.path === t.selected?.path ? "selected" : "", escape(entry.path), entry.directory, entry.directory ? "folder" : "file", escape(entry.name), entry.directory ? "—" : size(entry.size), entry.modified ? new Date(entry.modified).toLocaleDateString() : ""),
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
    ui("--2") +
    components
      .map(
        (c, i) =>
          ui("--3", escape(components.slice(0, i + 1).join("/")), escape(c)),
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
    ui("template-4", entry.directory ? "gold" : "", entry.directory ? "folder" : "file", entry.directory ? "DIRECTORY" : entry.link ? "SYMLINK" : "FILE", escape(entry.name), escape(entry.path), entry.directory ? "Directory" : size(entry.size), entry.modified ? new Date(entry.modified).toLocaleDateString() : "");
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
  document.title = v.title || ui("yhwh-three");
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
    ? ui("config-") + config.warnings
    : ui("no-vault-required-") +
      (config.files.length
        ? ui("config-files-applied-", config.files.length)
        : ui("your-filesystem-is-open-"));
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
        notify(ui("plugin-") + error.message);
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
    fontFamily: ui("-dejavu-sans-mono-monospace"),
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
      ui("select-something-a-small-world-is-still-a-world-");
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
      ui("unsaved-changes"),
      ui("discard-edits-to-", basename(t.file.path)),
      ui("discard-edits"),
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
    ui("select-something-a-small-world-is-still-a-world-");
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
      ui("unsaved-changes"),
      ui("discard-edits-to-and-open-", basename(t.file.path), basename(entry.path)),
      ui("discard-edits"),
    ))
  )
    return;
  const file = await call("read", { path: entry.path });
  let language = file.language || ui("plain-text");
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
    ? ui("unsaved-changes")
    : current().file
      ? ui("saved")
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
    ? ui("template-5", escape(basename(f.path)), f.image)
    : f.binary
      ? ui("-this-format-opens-in-your-system-application-op", escape(basename(f.path)), escape(f.mime), size(f.size))
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
  notify(ui("saved-"));
}
async function pretty() {
  const t = current();
  if (!t.editor) return;
  t.pretty = !t.pretty;
  if (t.pretty) {
    const text = t.editor.state.doc.toString(),
      mode = t.file.language;
    let content;
    if (mode === ui("markdown"))
      content = DOMPurify.sanitize(marked.parse(text), {
        ALLOW_DATA_ATTR: false,
      });
    else if (mode === ui("json")) {
      const formatted = JSON.stringify(JSON.parse(text), null, 2);
      content = ui("apply-formatting-to-editor", escape(formatted));
    } else if (mode === ui("html"))
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
      ui("rename"),
      entry.name || basename(entry.path),
      ui("new-name"),
    );
  if (!newName) return;
  if (/[/\\]/.test(newName) || [".", ".."].includes(newName))
    throw new Error(ui("use-a-filename-without-path-separators-"));
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
function ask(title, text, button = ui("continue")) {
  return new Promise((resolve) => {
    dialog(
      ui("yhwh-three-cancel", escape(title), escape(text), escape(button)),
    );
    pendingDialog = (result) => resolve(result === "ok");
    $(ui("-dialog-form")).addEventListener("submit", (event) => {
      event.preventDefault();
      closeDialog(event.submitter?.value);
    });
  });
}
function inputDialog(title, value = "", label = ui("name")) {
  return new Promise((resolve) => {
    dialog(
      ui("filesystem-cancel-save", escape(title), escape(label), escape(value)),
    );
    const input = $(ui("-dialog-input"));
    pendingDialog = (result) => resolve(result === "ok" ? input.value : null);
    $(ui("-dialog-form")).addEventListener("submit", (event) => {
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
  ui("template-6");
function help() {
  dialog(
    ui("field-guide-yhwh-three-go-up-go-anywhere-double-", closeButton, escape(bootstrap.copy.about)),
  );
}
function settings() {
  const t = current(),
    v = t.config.values;
  dialog(
    ui("settings-local-gravity-make-yourself-at-home-the", closeButton, ["yhwh", "nietzsche", "dawkins"].map((m) => `<option ${m === v.theme ? "selected" : ""}>${m}</option>`).join(""), escape(v.bloom), v.motion !== "0" ? "selected" : "", v.motion === "0" ? "selected" : "", escape(v.font_size), escape(v.filetypes), t.config.files.length ? t.config.files.map((p) => `<button class="config-link" data-open="${escape(p)}">${escape(p)}</button>`).join("") : "No configuration files. Defaults are active.", v.settings_html ? DOMPurify.sanitize(v.settings_html) : ""),
  );
  for (const label of document.querySelectorAll(ui("-settings-form-label"))) {
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
    ui("offerings-a-little-fuel-for-creation-burnt-offer", closeButton, escape(bootstrap.copy.burnt), escape(bootstrap.copy.piece)),
  );
}
function burnt() {
  dialog(
    ui("burnt-offering-developer-setup-connect-the-altar", closeButton),
  );
}
function commandPalette() {
  dialog(
    ui("commands-what-shall-we-do-", closeButton),
  );
  const show = () => {
    const q = $("#command-filter").value.toLowerCase();
    $("#command-results").innerHTML = [...commands.values()]
      .filter((c) => c.name.toLowerCase().includes(q))
      .map(
        (c) =>
          ui("template-7", escape(c.id), escape(c.name)),
      )
      .join("");
    icons();
  };
  $("#command-filter").addEventListener("input", show);
  $("#command-filter").addEventListener("keydown", (event) => {
    if (event.key === ui("enter")) {
      const q = event.target.value;
      if (q.startsWith("/") || q.startsWith("~")) {
        closeDialog();
        navigate(q).catch(fail);
      } else $(ui("-command-results-button"))?.click();
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
      ui("new-file"),
      "",
      ui("filename-with-any-extension-or-none"),
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
    const name = await inputDialog(ui("new-folder"));
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
        ui("unsaved-changes"),
        ui("discard-this-document-s-edits-"),
        ui("discard-edits"),
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
      .then(() => notify(ui("path-copied-"))),
  reveal: () =>
    current().selected && call("reveal", { path: current().selected.path }),
  trash: async () => {
    const e = current().selected;
    if (
      e &&
      (await ask(
        ui("move-to-trash"),
        ui("move-to-the-system-trash-", e.name),
        ui("move-to-trash"),
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
    notify(ui("edit-voice-json-and-save-this-changes-the-implem"));
  },
  "open-three-config": async () => {
    const path = join(bootstrap.home, "config/yhwh/rc.three");
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
        ui("piece-offering-staged-locally-send-it-yourself-w", closeButton, escape(receipt.name), size(receipt.size), escape(receipt.status)),
      );
    }
  },
  circus: async () => {
    dialog(
      ui("nietzsche-family-circus-loading-an-improbable-pa", closeButton),
    );
    try {
      const pair = await call("circus");
      dialog(
        ui("nietzsche-family-circus-another-universe-origina", closeButton, pair.image, escape(pair.quote), escape(pair.permalink)),
      );
    } catch (error) {
      notify(error.message);
    }
  },
  upgrades: () =>
    dialog(
      ui("coming-soon-mostly-more-from-the-mountain-you-ar", closeButton, escape(bootstrap.copy.advertisement)),
    ),
};
for (const [id, name] of Object.entries({
  space: ui("open-spatial-explorer"),
  files: ui("toggle-files-sidebar"),
  expand: ui("focus-file-manager"),
  terminal: ui("toggle-terminal"),
  "new-tab": ui("new-focus-tab"),
  "choose-directory": ui("choose-a-directory"),
  "create-file": ui("new-file"),
  "create-folder": ui("new-folder"),
  save: ui("save-document"),
  pretty: ui("toggle-pretty-view"),
  refresh: ui("refresh-directory"),
  settings: ui("settings"),
  help: ui("help-and-about"),
  offerings: ui("offerings"),
  "edit-voice": ui("edit-yhwh-text-in-source"),
  up: ui("go-to-parent-directory"),
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
  const link = event.target.closest(ui("-pretty-view-a"));
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
  if (event.key === ui("arrowdown") || event.key === ui("arrowup")) {
    event.preventDefault();
    items[
      Math.max(
        0,
        Math.min(
          items.length - 1,
          index + (event.key === ui("arrowdown") ? 1 : -1),
        ),
      )
    ]?.focus();
  }
  if (event.key === ui("arrowleft")) {
    event.preventDefault();
    navigate(current().directory.parent).catch(fail);
  }
  if (event.key === ui("arrowright") || event.key === ui("enter")) {
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
  if (event.key === ui("enter")) navigate(event.target.value).catch(fail);
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
  if (event.key === ui("enter")) {
    event.preventDefault();
    event.target.blur();
  }
  if (event.key === ui("escape")) {
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
  ui("plain-text"),
  ...new Set(languages.map((l) => l.name)),
]
  .sort()
  .map((name) => `<option>${escape(name)}</option>`)
  .join("");
$("#language").value = ui("plain-text");
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
      if (event.key === ui("escape")) {
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
    if (event.altKey && event.key === ui("arrowup")) action = "up";
    if (event.altKey && event.shiftKey && event.key.toLowerCase() === "t")
      action = "terminal";
    if (!typing && event.key === ui("backspace")) action = "up";
    if (!typing && event.key === ui("f2")) action = "rename";
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
    event.returnValue = ui("there-are-unsaved-files-");
  }
});
window.yhwh.onTerminal((event) => {
  const t = tabs.find((t) => t.id === event.id);
  if (!t) return;
  if (event.type === "data")
    t.term.write(Uint8Array.from(atob(event.data), (c) => c.charCodeAt(0)));
  if (event.type === "error") t.term.write("\r\n" + event.data);
  if (event.type === "exit") t.term.write(ui("-shell-exited-"));
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
        $("#gpu-status").textContent = ui("restarting-with-software-3d");
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
        if (text.includes(ui("context-lost"))) graphicsFallback();
      },
    });
  } catch (error) {
    $("#gpu-status").textContent = ui("files-mode");
    $("#space-canvas").innerHTML =
      ui("the-gpu-could-not-start-files-editor-and-termina");
    console.warn(error);
    graphicsFallback();
  }
  helloWorld(app);
  await newTab(bootstrap.target);
  icons();
})().catch(fail);
