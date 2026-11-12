/* YHWH — MIT license. Built from src/ with npm run build. */
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => YHWH
});
module.exports = __toCommonJS(main_exports);
var import_obsidian3 = require("obsidian");

// src/core.ts
var COPY = {
  welcome: "Where are you? Ah. Here. Bring the files. I'll bring the unreasonable confidence.",
  empty: "Let there be a file. Preferably one with something in it.",
  obituary: "God is dead. His files still need organizing.",
  hello: "Hello, world. Still here. Still making things.",
  directory: "LET THERE BE A DIRECTORY",
  about: "I'm with The Nameless. They wrote my favorite book about me: Genesis. Also, I'd rather you didn't keep saying my name. The letters will do.",
  offerings: "Running a universe costs money. Apparently so does running a small software company.",
  burnt: "A burnt offering, with considerably less smoke. Payments aren't connected yet.",
  piece: "Bring a piece of something you made. I'll look at the filename. The upload altar isn't connected yet.",
  upgrades: "YHWH Sync, YHWH Stuff, and YHWH 3D! Also coming soon: YHWH Dating! He's giving this land to your seed! Pre-order now Abe! What do you mean that's not your name? Well it is now."
};
var DEFAULTS = {
  energy: 100,
  accent: "#b7a1ef",
  title: "",
  bg: "",
  followActive: true,
  autoOpen: true,
  folder: "",
  copy: { ...COPY }
};
function settings(data) {
  return {
    ...DEFAULTS,
    ...data,
    energy: energy(data?.energy ?? 100),
    copy: Object.fromEntries(Object.entries(COPY).map(([k, v]) => [k, typeof data?.copy?.[k] === "string" ? data.copy[k] : v]))
  };
}
function energy(value) {
  return value < 25 ? 0 : value < 75 ? 50 : 100;
}
function mode(value) {
  return value === 0 ? "dawkins" : value === 50 ? "nietzsche" : "yhwh";
}
function parent(path) {
  return path.split("/").slice(0, -1).join("/");
}
function resolvePath(cwd, input = "") {
  const parts = input.startsWith("/") ? [] : cwd.split("/").filter(Boolean);
  if (input.includes("\\") || /[\x00-\x1f]/.test(input)) throw new Error("Use a vault path with forward slashes.");
  for (const part of input.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) throw new Error("Already at the vault root.");
      parts.pop();
    } else parts.push(part);
  }
  return parts.join("/");
}
function ancestors(path) {
  const out = [""];
  for (const part of path.split("/").filter(Boolean)) out.push([out.at(-1), part].filter(Boolean).join("/"));
  return out;
}
function within(path, scope) {
  return !scope || path === scope || path.startsWith(scope + "/");
}
function words(line) {
  const out = [];
  let word = "", quote = "", escaped = false, started = false;
  for (const ch of line.trim()) {
    if (escaped) {
      word += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\" && quote !== "'") {
      escaped = true;
      started = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = "";
      else word += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
    } else if (/\s/.test(ch)) {
      if (started) out.push(word);
      word = "";
      started = false;
    } else {
      word += ch;
      started = true;
    }
  }
  if (quote || escaped) throw new Error("Unclosed quote or trailing escape.");
  if (started) out.push(word);
  return out;
}
function config(text, directory, current) {
  const values = {}, errors = [];
  let applies = false, hasScope = false;
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim() || line.trimStart().startsWith("#")) return;
    try {
      if (!/^\s/.test(line)) {
        applies = false;
        hasScope = false;
        const scope = words(comment(line));
        if (scope.length !== 1 || /[$`;|&<>]/.test(scope[0])) throw new Error("Expected one literal vault path. Quote paths with spaces.");
        applies = within(current, resolvePath(directory, scope[0]));
        hasScope = true;
        return;
      }
      if (!hasScope) throw new Error("Put a vault path before its assignments.");
      const match = comment(line).trim().match(/^([a-zA-Z_]+)=(.*)$/);
      if (!match) throw new Error("Expected an indented key=value assignment.");
      const [, key, raw] = match;
      if (/[$`]/.test(raw)) throw new Error("Shell expansion is unavailable in an Obsidian plugin.");
      const parsed = words(raw);
      if (parsed.length > 1) throw new Error("Quote values containing spaces.");
      const value = parsed[0] ?? "";
      const put = (k, v) => {
        if (applies) Object.assign(values, { [k]: v });
      };
      if (key === "energy") {
        if (!["0", "50", "100"].includes(value)) throw new Error("energy must be 0, 50 or 100.");
        put("energy", Number(value));
      } else if (key === "mode") {
        if (!["yhwh", "nietzsche", "dawkins"].includes(value)) throw new Error("Unknown mode.");
        put("energy", value === "yhwh" ? 100 : value === "nietzsche" ? 50 : 0);
      } else if (key === "accent") {
        if (!/^#[\da-f]{6}$/i.test(value)) throw new Error("accent must be a six-digit hex color.");
        put("accent", value);
      } else if (key === "title") put("title", value);
      else if (key === "bg") put("bg", value ? resolvePath(directory, value) : "");
      else if (key === "follow_active") {
        if (!["true", "false"].includes(value)) throw new Error("follow_active must be true or false.");
        put("followActive", value === "true");
      } else throw new Error(`Unsupported setting: ${key}`);
    } catch (e) {
      errors.push(`Line ${i + 1}: ${e.message}`);
    }
  });
  return { values, errors };
}
function comment(line) {
  let quote = "", escaped = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "#" && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}
var TEXT_EXTENSIONS = new Set("txt json jsonc js mjs cjs ts tsx jsx css html htm xml svg yaml yml toml ini conf cfg csv tsv sh bash zsh fish py rb rs go c h cpp hpp java sql tex bib log diff patch makefile r lua pl php svelte vue".split(" "));
function isText(name, bytes) {
  if (bytes.byteLength > 2e6) return false;
  const data = new Uint8Array(bytes);
  if (data.some((n) => n === 0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    return false;
  }
  if (TEXT_EXTENSIONS.has(name.split(".").at(-1).toLowerCase())) return true;
  return !data.some((n) => n < 32 && ![9, 10, 12, 13].includes(n));
}
function circusPair(html) {
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  const image = html.match(/class="comic"[^>]*>\s*<img[^>]+src="(\/img\/\d+\.(?:gif|png|jpg))"/i)?.[1];
  const quote = html.match(/class="quote"[^>]*>([\s\S]*?)<\/div>/i)?.[1];
  const link = html.match(/href="(\/perm\.php\?c=\d+(?:&amp;|&)q=\d+)"/i)?.[1];
  if (!image || !quote || !link) throw new Error("The Circus changed its page format. Open the original site.");
  const decode = (text) => text.replace(/<[^>]*>/g, "").replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, (entity) => {
    const named = { "&amp;": "&", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">" };
    if (named[entity]) return named[entity];
    const n = entity.startsWith("&#x") ? parseInt(entity.slice(3), 16) : parseInt(entity.slice(2), 10);
    return n > 0 && n <= 1114111 ? String.fromCodePoint(n) : entity;
  }).trim();
  return { image: "https://nietzschefamilycircus.com" + image, quote: decode(quote), permalink: "https://nietzschefamilycircus.com" + decode(link) };
}

// src/views.ts
var import_obsidian2 = require("obsidian");

// src/atlas.ts
var import_obsidian = require("obsidian");
var ATLAS = "yhwh-atlas";
var Atlas = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.disposeScene = () => {
    };
    this.yaw = 0.3;
    this.pitch = -0.15;
    this.zoom = 1;
    this.filter = "";
  }
  getViewType() {
    return ATLAS;
  }
  getDisplayText() {
    return "YHWH \xB7 3D directory";
  }
  getIcon() {
    return "orbit";
  }
  async onOpen() {
    this.unsubscribe = this.plugin.watch(() => this.render());
    this.render();
  }
  render() {
    this.disposeScene();
    const p = this.plugin, el = this.contentEl;
    el.empty();
    p.heading(el, "3D directory");
    el.addClass("yhwh-atlas");
    const toolbar = el.createDiv("yhwh-tools");
    button(toolbar, "\u2191 Parent", "Go to parent folder", () => p.run(() => p.go(parent(p.folder)))).disabled = !p.folder;
    toolbar.createEl("code", { text: "/" + p.folder });
    const reset = button(toolbar, "Reset view", "Reset camera", () => {
    });
    const orbit = button(toolbar, "Orbit", "Toggle slow orbit", () => {
    });
    const filter = toolbar.createEl("input", { type: "search", value: this.filter, attr: { "aria-label": "Filter 3D directory", placeholder: "Filter files\u2026" } });
    filter.addEventListener("change", () => {
      this.filter = filter.value;
      this.render();
    });
    const entries = p.entries().filter((file) => file.name.toLowerCase().includes(this.filter.toLowerCase()));
    const stage = el.createDiv("yhwh-space");
    const canvas = stage.createEl("canvas", { attr: { "aria-label": "Interactive 3D directory. Drag to orbit, scroll to zoom. Use the file buttons to navigate." } });
    const labels = stage.createDiv("yhwh-space-labels");
    const caption = stage.createDiv("yhwh-space-caption");
    const heading = caption.createEl("small", { text: p.current.energy ? p.settings.copy.directory : "DIRECTORY" });
    if (p.current.energy) button(caption, "Edit", "Edit directory text", () => p.editCopy("directory", () => heading.setText(p.settings.copy.directory)));
    caption.createEl("h2", { text: p.folder.split("/").at(-1) || this.app.vault.getName() });
    caption.createEl("p", { text: `${entries.length} entries \xB7 drag to orbit \xB7 scroll to zoom` });
    const shown = entries.slice(0, 100);
    if (entries.length > shown.length) el.createEl("p", { text: `Showing the first ${shown.length} entries in space. Filter to narrow the view; the full list is below.`, cls: "yhwh-muted" });
    const accessible = el.createEl("details", { cls: "yhwh-space-list" });
    accessible.createEl("summary", { text: `All ${entries.length} entries \xB7 keyboard navigation` });
    for (const file of entries) button(accessible, `${file instanceof import_obsidian.TFolder ? "\u25B8 " : ""}${file.name}`, `Open ${file.name}`, () => this.openEntry(file));
    if (!entries.length) stage.createEl("p", { text: "This directory is empty. Create a file from the navigator.", cls: "yhwh-space-empty" });
    const gl = canvas.getContext("webgl", { alpha: true, antialias: true, powerPreference: "low-power" });
    if (!gl) {
      stage.createEl("p", { text: "WebGL is unavailable. Use the file list below.", cls: "yhwh-space-empty" });
      accessible.open = true;
      reset.disabled = orbit.disabled = true;
      return;
    }
    const vertex = gl.createShader(gl.VERTEX_SHADER), fragment = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(vertex, `attribute vec2 position; attribute vec3 color; attribute float size;
      varying vec3 tint; void main(){gl_Position=vec4(position,0.,1.);gl_PointSize=size;tint=color;}`);
    gl.shaderSource(fragment, `precision mediump float; varying vec3 tint; uniform bool dots;
      void main(){float a=0.2;if(dots){float d=length(gl_PointCoord-vec2(0.5));if(d>0.5)discard;a=1.-smoothstep(0.12,0.5,d);}gl_FragColor=vec4(tint,a);}`);
    gl.compileShader(vertex);
    gl.compileShader(fragment);
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      accessible.open = true;
      stage.createEl("p", { text: "The graphics driver could not start the scene. Use the file list below." });
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      return;
    }
    const buffer = gl.createBuffer();
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    for (const [attribute, count, offset] of [["position", 2, 0], ["color", 3, 8], ["size", 1, 20]]) {
      const location = gl.getAttribLocation(program, attribute);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, count, gl.FLOAT, false, 24, offset);
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const dots = gl.getUniformLocation(program, "dots");
    const points = [{ x: 0, y: 0, z: 0, folder: true }];
    shown.forEach((entry, i) => {
      const phi = i * Math.PI * (3 - Math.sqrt(5));
      const y = shown.length === 1 ? 0 : 1 - (i + 0.5) / shown.length * 2;
      const radius = 1.4;
      points.push({
        x: Math.cos(phi) * Math.sqrt(1 - y * y) * radius,
        y: y * radius,
        z: Math.sin(phi) * Math.sqrt(1 - y * y) * radius,
        folder: entry instanceof import_obsidian.TFolder,
        entry
      });
    });
    const nodes = shown.map((entry) => button(labels, entry.name, `Open ${entry.name}`, () => this.openEntry(entry)));
    const accent = p.current.accent.match(/[\da-f]{2}/gi)?.map((v) => parseInt(v, 16) / 255) ?? [0.7, 0.6, 0.94];
    let frame = 0, disposed = false, spinning = false, last = 0;
    const view = el.ownerDocument.defaultView;
    const project = (point) => {
      const a = Math.cos(this.yaw), b = Math.sin(this.yaw), c = Math.cos(this.pitch), d = Math.sin(this.pitch);
      const x = point.x * a - point.z * b, z = point.x * b + point.z * a;
      const y = point.y * c - z * d, depth = point.y * d + z * c;
      const scale = this.zoom / (4.8 + depth);
      return { x: x * scale * 2, y: y * scale * 2, scale, depth };
    };
    const draw = () => {
      if (disposed || gl.isContextLost()) return;
      const width = stage.clientWidth, height = stage.clientHeight;
      if (!width || !height) return;
      const ratio = Math.min(view.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const aspect = width / height;
      const vertices = [], lines = [];
      const projected = points.map(project);
      const root = projected[0];
      points.forEach((point, i) => {
        const pos = projected[i];
        const color = i === 0 ? [1, 0.85, 0.5] : point.folder ? accent : [0.58, 0.79, 0.83];
        vertices.push(pos.x / aspect, pos.y, ...color, (i === 0 ? 48 : point.folder ? 24 : 15) * pos.scale * 4 * ratio);
        if (i) {
          lines.push(root.x / aspect, root.y, ...accent, 1, pos.x / aspect, pos.y, ...accent, 1);
          const node = nodes[i - 1];
          node.style.left = `${(pos.x / aspect + 1) * width / 2}px`;
          node.style.top = `${(1 - pos.y) * height / 2 + 12}px`;
          node.style.opacity = String(Math.max(0.45, 0.9 - pos.depth * 0.2));
          node.style.zIndex = String(Math.round(10 - pos.depth));
        }
      });
      for (let i = 1; i <= 130; i++) {
        const x = Math.sin(i * 127.1) * 43758.5453, y = Math.sin(i * 311.7) * 19341.12;
        vertices.push((x - Math.floor(x)) * 2 - 1, (y - Math.floor(y)) * 2 - 1, 0.35, 0.38, 0.5, 2 * ratio);
      }
      gl.uniform1i(dots, 0);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.LINES, 0, lines.length / 6);
      gl.uniform1i(dots, 1);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.POINTS, 0, vertices.length / 6);
    };
    const animate = (now) => {
      if (disposed || !spinning) return;
      if (!el.ownerDocument.hidden) {
        this.yaw += Math.min((now - last) / 1e3, 0.05) * 0.15;
        draw();
      }
      last = now;
      frame = view.requestAnimationFrame(animate);
    };
    let drag = null;
    canvas.addEventListener("pointerdown", (event) => {
      drag = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!drag) return;
      this.yaw += (event.clientX - drag.x) / 180;
      this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch + (event.clientY - drag.y) / 180));
      drag = { x: event.clientX, y: event.clientY };
      draw();
    });
    canvas.addEventListener("pointerup", () => {
      drag = null;
    });
    canvas.addEventListener("pointercancel", () => {
      drag = null;
    });
    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      this.zoom = Math.max(0.5, Math.min(2.5, this.zoom * Math.exp(-event.deltaY / 900)));
      draw();
    }, { passive: false });
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      spinning = false;
      view.cancelAnimationFrame(frame);
      accessible.open = true;
    });
    canvas.addEventListener("webglcontextrestored", () => this.render());
    reset.addEventListener("click", () => {
      this.yaw = 0.3;
      this.pitch = -0.15;
      this.zoom = 1;
      draw();
    });
    orbit.addEventListener("click", () => {
      spinning = !spinning;
      orbit.setText(spinning ? "Stop orbit" : "Orbit");
      orbit.setAttribute("aria-pressed", String(spinning));
      if (spinning) {
        last = view.performance.now();
        frame = view.requestAnimationFrame(animate);
      } else view.cancelAnimationFrame(frame);
    });
    const observer = new ResizeObserver(draw);
    observer.observe(stage);
    draw();
    this.disposeScene = () => {
      disposed = true;
      view.cancelAnimationFrame(frame);
      observer.disconnect();
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }
  openEntry(entry) {
    this.plugin.run(() => entry instanceof import_obsidian.TFolder ? this.plugin.go(entry.path) : this.plugin.open(entry, true));
  }
  async onClose() {
    this.unsubscribe?.();
    this.disposeScene();
  }
};

// src/views.ts
var NAV = "yhwh-navigator";
var CONSOLE = "yhwh-console";
var TEXT = "yhwh-text";
function button(el, text, title, click) {
  const b = el.createEl("button", { text, attr: { title, "aria-label": title } });
  b.addEventListener("click", () => click());
  return b;
}
function prompt(app, title, label, value = "") {
  return new Promise((resolve) => {
    const modal = new import_obsidian2.Modal(app);
    let result = null;
    modal.titleEl.setText(title);
    const form = modal.contentEl.createEl("form");
    const field = form.createEl("label", { text: label });
    const input = field.createEl("input", { type: "text", value, cls: "yhwh-prompt", attr: { "aria-label": label } });
    form.createEl("button", { text: "Save", type: "submit", cls: "mod-cta" });
    button(form, "Cancel", "Cancel", () => modal.close()).type = "button";
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      result = input.value;
      modal.close();
    });
    modal.onClose = () => resolve(result);
    modal.open();
    input.focus();
    input.select();
  });
}
var Navigator = class extends import_obsidian2.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.filter = "";
    this.index = 0;
    this.visible = [];
  }
  getViewType() {
    return NAV;
  }
  getDisplayText() {
    return "YHWH \xB7 files";
  }
  getIcon() {
    return "folder-open";
  }
  async onOpen() {
    this.unsubscribe = this.plugin.watch(() => this.render());
    this.registerDomEvent(this.contentEl, "keydown", (event) => {
      if (event.altKey && event.key === "ArrowUp" || event.key === "ArrowLeft" && event.target.tagName !== "INPUT") {
        event.preventDefault();
        this.plugin.run(() => this.plugin.go(parent(this.plugin.folder)));
        return;
      }
      if (event.target.tagName === "INPUT") return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        this.index = Math.max(0, Math.min(this.visible.length - 1, this.index + (event.key === "ArrowDown" ? 1 : -1)));
        this.focusRow();
      } else if (event.key === "Enter" || event.key === "ArrowRight") {
        event.preventDefault();
        const entry = this.visible[this.index];
        if (entry) this.openEntry(entry, event.ctrlKey || event.metaKey);
      } else if (event.key === "F2") {
        event.preventDefault();
        const entry = this.visible[this.index];
        if (entry) this.plugin.run(() => this.plugin.rename(entry));
      }
    });
    this.render();
  }
  openEntry(entry, newTab = false) {
    this.plugin.run(() => entry instanceof import_obsidian2.TFolder ? this.plugin.go(entry.path) : this.plugin.open(entry, newTab));
  }
  render() {
    const p = this.plugin, el = this.contentEl;
    const hadFocus = el.contains(el.ownerDocument.activeElement);
    el.empty();
    p.heading(el, "Files");
    const tools = el.createDiv("yhwh-tools");
    button(tools, "\u2191", "Parent folder \xB7 Alt+\u2191", () => p.run(() => p.go(parent(p.folder)))).disabled = !p.folder;
    button(tools, "+ file", "New file", () => p.run(() => p.newFile()));
    button(tools, "+ folder", "New folder", () => p.run(() => p.newFolder()));
    button(tools, "\u26F6", "Toggle file manager in the workspace \xB7 Ctrl+D", () => p.run(() => p.toggleFilesFocus()));
    button(tools, ">_", "Toggle navigation console \xB7 Ctrl+B", () => p.run(() => p.toggle(CONSOLE)));
    button(tools, "3D", "Open 3D directory", () => p.run(() => p.show(ATLAS)));
    const crumbs = el.createDiv("yhwh-breadcrumbs");
    button(crumbs, "/", "Vault root", () => p.run(() => p.go("")));
    let path = "";
    for (const part of p.folder.split("/").filter(Boolean)) {
      path = [path, part].filter(Boolean).join("/");
      const target = path;
      button(crumbs, part, `Go to /${target}`, () => p.run(() => p.go(target)));
    }
    const filter = el.createEl("input", { type: "search", value: this.filter, cls: "yhwh-filter", attr: { placeholder: "Filter this folder\u2026", "aria-label": "Filter this folder" } });
    const list = el.createDiv({ cls: "yhwh-files", attr: { role: "list", "aria-label": "Files and folders", tabindex: "0" } });
    const fill = () => {
      list.empty();
      this.visible = p.entries().filter((file) => file.name.toLocaleLowerCase().includes(this.filter.toLocaleLowerCase()));
      this.index = Math.max(0, Math.min(this.index, this.visible.length - 1));
      for (const [index, file] of this.visible.entries()) {
        const row = list.createDiv({ cls: "yhwh-file-row", attr: { role: "listitem" } });
        const b = button(row, `${file instanceof import_obsidian2.TFolder ? "\u25B8" : "\xB7"}  ${file.name}`, `Open ${file.name}`, () => {
          this.index = index;
          this.openEntry(file);
        });
        b.dataset.index = String(index);
        b.classList.toggle("is-selected", index === this.index);
        if (file instanceof import_obsidian2.TFile) row.createSpan({ text: file.extension || "text", cls: "yhwh-extension" });
        row.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          const menu = new import_obsidian2.Menu();
          if (file instanceof import_obsidian2.TFile) menu.addItem((item) => item.setTitle("Open in new tab").setIcon("file-plus").onClick(() => this.openEntry(file, true)));
          menu.addItem((item) => item.setTitle("Rename or move").setIcon("pencil").onClick(() => p.run(() => p.rename(file))));
          menu.showAtMouseEvent(event);
        });
      }
      if (!this.visible.length) list.createEl("p", { text: this.filter ? "No matching entries." : "This folder is empty.", cls: "yhwh-muted" });
    };
    filter.addEventListener("input", () => {
      this.filter = filter.value;
      this.index = 0;
      fill();
    });
    filter.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "Enter") {
        event.preventDefault();
        this.focusRow();
      }
    });
    fill();
    const footer = el.createDiv("yhwh-footer");
    if (p.current.energy === 50) {
      p.copyBlock(footer, "obituary");
      if (p.circus) {
        footer.createEl("img", { cls: "yhwh-circus-image", attr: { src: p.circus.image, alt: "Family Circus cartoon paired with a Nietzsche quote" } });
        footer.createEl("p", { text: p.circus.quote, cls: "yhwh-circus-quote" });
        p.external(footer, "Share this pairing \u2197", p.circus.permalink);
      }
      if (p.circusError) footer.createEl("p", { text: p.circusError, cls: "yhwh-errors" });
      button(footer, p.circusBusy ? "Loading\u2026" : "Next cartoon \u21BB", "Load a random pairing from nietzschefamilycircus.com", () => p.run(() => p.nextCircus())).disabled = p.circusBusy;
      p.external(footer, "Nietzsche Family Circus \u2197", "https://nietzschefamilycircus.com/");
    } else p.copyBlock(footer, this.visible.length ? "welcome" : "empty");
    button(footer, "Offerings", "Open offerings", () => p.offerings());
    if (hadFocus) this.focusRow();
  }
  focusRow() {
    this.contentEl.querySelectorAll("[data-index]").forEach((b) => {
      b.classList.toggle("is-selected", Number(b.dataset.index) === this.index);
      if (Number(b.dataset.index) === this.index) b.focus();
    });
  }
  async onClose() {
    this.unsubscribe?.();
  }
};
var HELP = `Vault commands (quote paths containing spaces):
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
Tab completes paths; \u2191/\u2193 recall command history.
This is a vault command line. Shell processes, pipes and scripts are unavailable.`;
var ConsoleView = class extends import_obsidian2.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.history = [];
    this.cursor = 0;
  }
  getViewType() {
    return CONSOLE;
  }
  getDisplayText() {
    return "YHWH \xB7 console";
  }
  getIcon() {
    return "terminal";
  }
  async onOpen() {
    const el = this.contentEl;
    el.empty();
    this.plugin.heading(el, "Navigation console");
    this.output = el.createEl("div", { cls: "yhwh-console-output", attr: { role: "log", "aria-label": "Command output", "aria-live": "polite", tabindex: "0" } });
    this.write("Vault command line \xB7 type help. Navigation stays in sync with the file manager.");
    const form = el.createEl("form", { cls: "yhwh-console-prompt" });
    this.cwd = form.createEl("label");
    this.input = form.createEl("input", { type: "text", attr: { "aria-label": "Vault command", spellcheck: "false", autocomplete: "off" } });
    form.createEl("button", { type: "submit", text: "Run" });
    const update = () => {
      this.plugin.decorate(el);
      this.cwd.setText(`/${this.plugin.folder} >`);
      const slider = el.querySelector(".yhwh-energy input");
      if (slider) slider.value = String(this.plugin.current.energy);
      el.querySelector(".yhwh-energy span")?.setText(`Amount of YHWH-ness \xB7 ${mode(this.plugin.current.energy)}`);
    };
    this.unsubscribe = this.plugin.watch(update);
    update();
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const line = this.input.value.trim();
      if (!line || this.input.disabled) return;
      this.input.value = "";
      this.history.push(line);
      this.cursor = this.history.length;
      this.write(`/${this.plugin.folder} > ${line}`);
      this.input.disabled = true;
      this.execute(line).catch((error) => this.write(error.message, true)).finally(() => {
        this.input.disabled = false;
        this.input.focus();
      });
    });
    this.input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        this.cursor = Math.max(0, Math.min(this.history.length, this.cursor + (event.key === "ArrowUp" ? -1 : 1)));
        this.input.value = this.history[this.cursor] ?? "";
      } else if (event.key === "Tab") {
        event.preventDefault();
        this.complete();
      }
    });
    this.input.focus();
  }
  write(text, error = false) {
    this.output.createEl("pre", { text, cls: error ? "yhwh-errors" : "" });
    while (this.output.children.length > 200) this.output.firstElementChild?.remove();
    this.output.scrollTop = this.output.scrollHeight;
  }
  complete() {
    try {
      const tokens = words(this.input.value);
      if (/\s$/.test(this.input.value)) tokens.push("");
      if (tokens.length < 2) return;
      const value = tokens.at(-1);
      const slash = value.lastIndexOf("/");
      const prefix = slash < 0 ? "" : value.slice(0, slash + 1);
      const directory = resolvePath(this.plugin.folder, prefix);
      const folder = this.app.vault.getAbstractFileByPath(directory || "/");
      if (!(folder instanceof import_obsidian2.TFolder)) return;
      const matches = folder.children.filter((f) => f.name.startsWith(value.slice(slash + 1)));
      if (matches.length === 1) {
        tokens[tokens.length - 1] = prefix + matches[0].name + (matches[0] instanceof import_obsidian2.TFolder ? "/" : "");
        this.input.value = tokens.map((token) => JSON.stringify(token)).join(" ");
      } else if (matches.length) this.write(matches.map((f) => f.name).join("  "));
    } catch {
    }
  }
  async execute(line) {
    const p = this.plugin, [command, ...args] = words(line);
    const at = (i = 0) => resolvePath(p.folder, args[i] ?? "");
    const entry = (i = 0) => {
      if (!args[i]) throw new Error("A path is required.");
      const file = this.app.vault.getAbstractFileByPath(at(i));
      if (!file) throw new Error(`Not found: ${args[i]}`);
      return file;
    };
    const arity = (min, max = min) => {
      if (args.length < min || args.length > max) throw new Error(`Wrong number of arguments for ${command}. Type help.`);
    };
    if (command === "help") {
      arity(0);
      this.write(HELP);
    } else if (command === "clear") {
      arity(0);
      this.output.empty();
    } else if (command === "pwd") {
      arity(0);
      this.write("/" + p.folder);
    } else if (command === "cd") {
      arity(0, 1);
      await p.go(args.length ? at() : "");
    } else if (command === "ls") {
      arity(0, 1);
      const folder = this.app.vault.getAbstractFileByPath(at() || "/");
      if (!(folder instanceof import_obsidian2.TFolder)) throw new Error("Not a folder.");
      this.write(folder.children.map((f) => f.name + (f instanceof import_obsidian2.TFolder ? "/" : "")).sort().join("\n") || "(empty)");
    } else if (command === "open" || command === "edit") {
      arity(1);
      const file = entry();
      if (file instanceof import_obsidian2.TFolder) await p.go(file.path);
      else if (file instanceof import_obsidian2.TFile) await p.open(file, true);
    } else if (command === "new") {
      arity(1);
      const file = await this.app.vault.create(at(), "");
      await p.open(file, true);
      this.write("Created " + file.path);
    } else if (command === "mkdir") {
      arity(1);
      await this.app.vault.createFolder(at());
      this.write("Created " + at());
    } else if (command === "mv") {
      arity(2);
      const destination = at(1);
      await this.app.fileManager.renameFile(entry(), destination);
      this.write("Moved to " + destination);
    } else if (command === "cat") {
      arity(1);
      const file = entry();
      if (!(file instanceof import_obsidian2.TFile) || file.stat.size > 64e3) throw new Error("Choose a text file smaller than 64 KB.");
      const bytes = await this.app.vault.readBinary(file);
      if (new Uint8Array(bytes).includes(0)) throw new Error("This looks like a binary file.");
      this.write(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } else if (command === "find") {
      arity(1);
      const prefix = p.folder ? p.folder + "/" : "";
      const files = this.app.vault.getAllLoadedFiles().filter((f) => f.path.startsWith(prefix) && f.name.toLowerCase().includes(args[0].toLowerCase()));
      this.write(files.slice(0, 200).map((f) => f.path).join("\n") || "No matching paths.");
      if (files.length > 200) this.write(`${files.length} matches; showing the first 200.`);
    } else if (command === "mode") {
      arity(1);
      if (!["yhwh", "nietzsche", "dawkins"].includes(args[0])) throw new Error("Choose yhwh, nietzsche or dawkins.");
      p.settings.energy = args[0] === "yhwh" ? 100 : args[0] === "nietzsche" ? 50 : 0;
      await p.save();
      await p.go(p.folder);
      this.write(`Current mode: ${mode(p.current.energy)}. Folder configuration may override the default.`);
    } else if (command === "3d") {
      arity(0);
      await p.show(ATLAS);
    } else if (command === "hello") {
      arity(0);
      this.write(p.current.energy ? p.settings.copy.hello : "Hello, world.");
    } else throw new Error(`Unknown vault command: ${command}. Type help.`);
  }
  async onClose() {
    this.unsubscribe?.();
  }
};
var TextView = class extends import_obsidian2.TextFileView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.language = "";
    this.showingPreview = false;
  }
  getViewType() {
    return TEXT;
  }
  getDisplayText() {
    return this.file?.name ?? "YHWH \xB7 text";
  }
  getIcon() {
    return "file-code";
  }
  async onOpen() {
    const el = this.contentEl;
    el.empty();
    this.plugin.decorate(el);
    el.addClass("yhwh-text");
    const tools = el.createDiv("yhwh-tools");
    button(tools, "Rename", "Rename this file", () => this.plugin.run(() => this.file ? this.plugin.rename(this.file) : void 0));
    button(tools, "Save", "Save file", () => this.plugin.run(() => this.save()));
    button(tools, "Format JSON", "Format JSON", () => this.plugin.run(async () => {
      const text = JSON.stringify(JSON.parse(this.editor.value), null, 2) + "\n";
      this.editor.value = text;
      this.data = text;
      await this.save();
      if (this.showingPreview) await this.renderPreview();
    }));
    const select = tools.createEl("select", { attr: { "aria-label": "Text language" } });
    for (const language of ["", "text", "markdown", "json", "javascript", "typescript", "python", "bash", "css", "html", "xml", "yaml", "sql", "latex"])
      select.createEl("option", { text: language || "Detect from filename / shebang", value: language });
    select.addEventListener("change", () => {
      this.language = select.value;
      if (this.showingPreview) this.plugin.run(() => this.renderPreview());
    });
    button(tools, "Source / preview", "Toggle syntax preview", () => this.plugin.run(async () => {
      this.showingPreview = !this.showingPreview;
      this.editor.hidden = this.showingPreview;
      this.preview.hidden = !this.showingPreview;
      if (this.showingPreview) await this.renderPreview();
    }));
    this.editor = el.createEl("textarea", { cls: "yhwh-source", attr: { "aria-label": "File contents", spellcheck: "false" } });
    this.preview = el.createDiv("yhwh-text-preview");
    this.preview.hidden = true;
    this.editor.value = this.data ?? "";
    this.editor.addEventListener("input", () => {
      this.data = this.editor.value;
      this.requestSave();
    });
    this.registerDomEvent(this.editor, "keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        this.plugin.run(() => this.save());
      }
    });
  }
  getViewData() {
    return this.editor?.value ?? this.data;
  }
  setViewData(data, _clear) {
    this.data = data;
    if (this.editor && this.editor.value !== data) this.editor.value = data;
    if (this.showingPreview) this.plugin.run(() => this.renderPreview());
  }
  clear() {
    this.setViewData("", true);
  }
  async renderPreview() {
    this.preview.empty();
    const aliases = { js: "javascript", ts: "typescript", py: "python", sh: "bash", tex: "latex", yml: "yaml", md: "markdown" };
    const extension = this.file?.extension ?? "";
    let language = this.language || aliases[extension] || extension;
    if (!language && this.editor.value.startsWith("#!")) language = /python/.test(this.editor.value.split("\n")[0]) ? "python" : "bash";
    if (language === "markdown") await import_obsidian2.MarkdownRenderer.render(this.app, this.editor.value, this.preview, this.file?.path ?? "", this);
    else {
      const runs = this.editor.value.match(/`+/g) ?? [];
      const fence = "`".repeat(Math.max(3, ...runs.map((run) => run.length + 1)));
      await import_obsidian2.MarkdownRenderer.render(this.app, `${fence}${language.replace(/[^\w+-]/g, "")}
${this.editor.value}
${fence}`, this.preview, this.file?.path ?? "", this);
    }
  }
};

// src/main.ts
var YHWH = class extends import_obsidian3.Plugin {
  constructor() {
    super(...arguments);
    this.folder = "";
    this.circusBusy = false;
    this.circusError = "";
    this.configErrors = [];
    this.listeners = /* @__PURE__ */ new Set();
    this.navigation = 0;
    this.saving = Promise.resolve();
    this.closed = false;
  }
  async onload() {
    this.closed = false;
    this.settings = settings(await this.loadData());
    this.current = { ...this.settings };
    this.folder = this.app.vault.getAbstractFileByPath(this.settings.folder) instanceof import_obsidian3.TFolder ? this.settings.folder : "";
    this.registerView(NAV, (leaf) => new Navigator(leaf, this));
    this.registerView(CONSOLE, (leaf) => new ConsoleView(leaf, this));
    this.registerView(TEXT, (leaf) => new TextView(leaf, this));
    this.registerView(ATLAS, (leaf) => new Atlas(leaf, this));
    this.addRibbonIcon("flame", "YHWH: open navigator", () => this.run(() => this.show(NAV)));
    this.status = this.addStatusBarItem();
    this.status.addClass("yhwh-status");
    this.registerDomEvent(this.status, "click", () => this.help());
    const commands = [
      ["open-navigator", "Open navigator", () => this.show(NAV)],
      ["toggle-navigator", "Toggle navigator", () => this.toggle(NAV), "e"],
      ["focus-files", "Toggle file manager in the workspace", () => this.toggleFilesFocus(), "d"],
      ["toggle-console", "Toggle navigation console", () => this.toggle(CONSOLE), "b"],
      ["open-atlas", "Open 3D directory", () => this.show(ATLAS)],
      ["up", "Go to parent folder", () => this.go(parent(this.folder))],
      ["new-file", "New file in current folder", () => this.newFile()],
      ["new-folder", "New folder in current folder", () => this.newFolder()],
      ["reload-config", "Reload folder configuration", () => this.go(this.folder)],
      ["hello-world", "Hello world", () => new import_obsidian3.Notice(this.current.energy ? this.settings.copy.hello : "Hello, world.")],
      ["offerings", "Offerings", () => this.offerings()],
      ["help", "Help and about", () => this.help()]
    ];
    for (const [id, name, callback, key] of commands) this.addCommand({
      id,
      name,
      ...key ? { hotkeys: [{ modifiers: ["Ctrl"], key }] } : {},
      callback: () => this.run(callback)
    });
    this.addSettingTab(new YHWHSettings(this));
    this.registerEvent(this.app.workspace.on("file-open", (file) => {
      const view = this.app.workspace.getActiveViewOfType(import_obsidian3.FileView);
      if (view) this.editor = view.leaf;
      if (file && this.current.followActive) this.run(() => this.go(file.parent?.path ?? ""));
    }));
    const filesChanged = () => {
      if (this.folder && !(this.app.vault.getAbstractFileByPath(this.folder) instanceof import_obsidian3.TFolder)) this.run(() => this.go(""));
      else this.changed();
    };
    this.registerEvent(this.app.vault.on("create", filesChanged));
    this.registerEvent(this.app.vault.on("delete", filesChanged));
    this.registerEvent(this.app.vault.on("rename", filesChanged));
    this.registerObsidianProtocolHandler("yhwh", (params) => this.run(async () => {
      if (params.folder !== void 0) await this.go(resolvePath("", params.folder));
      if (params.file) {
        const file = this.app.vault.getAbstractFileByPath(resolvePath("", params.file));
        if (!(file instanceof import_obsidian3.TFile)) throw new Error("File not found.");
        await this.open(file);
      } else await this.show(params.view === "3d" ? ATLAS : params.view === "console" ? CONSOLE : NAV);
    }));
    this.app.workspace.onLayoutReady(() => this.run(async () => {
      await this.go(this.folder);
      if (this.settings.autoOpen && !this.app.workspace.getLeavesOfType(NAV).length) await this.show(NAV);
    }));
  }
  run(action) {
    Promise.resolve().then(action).catch((error) => {
      console.error("YHWH:", error);
      new import_obsidian3.Notice(error.message);
    });
  }
  watch(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
  changed() {
    this.status?.setText(`${this.current.energy ? "\u{10909}\u{10904}\u{10905}\u{10904}" : "YHWH"} \xB7 /${this.folder} \xB7 ${mode(this.current.energy)}`);
    this.listeners.forEach((callback) => callback());
  }
  async save() {
    const snapshot = JSON.parse(JSON.stringify(this.settings));
    this.saving = this.saving.catch(() => {
    }).then(() => this.saveData(snapshot));
    await this.saving;
  }
  async go(path) {
    path = resolvePath("", path);
    const folder = this.app.vault.getAbstractFileByPath(path || "/");
    if (!(folder instanceof import_obsidian3.TFolder)) throw new Error(`Folder not found: /${path}`);
    const serial = ++this.navigation;
    const current = { ...this.settings };
    const errors = [];
    for (const directory of ancestors(path)) {
      for (const filename of ["rc", "rc.obsidian"]) {
        const file = [directory, ".yhwh", filename].filter(Boolean).join("/");
        try {
          if (!await this.app.vault.adapter.exists(file)) continue;
          const result = config(await this.app.vault.adapter.read(file), directory, path);
          Object.assign(current, result.values);
          errors.push(...result.errors.map((error) => `${file}: ${error}`));
        } catch (error) {
          errors.push(`${file}: ${error.message}`);
        }
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
  entries() {
    const folder = this.app.vault.getAbstractFileByPath(this.folder || "/");
    if (!(folder instanceof import_obsidian3.TFolder)) return [];
    return folder.children.filter((file) => file instanceof import_obsidian3.TFile || file instanceof import_obsidian3.TFolder).sort((a, b) => Number(b instanceof import_obsidian3.TFolder) - Number(a instanceof import_obsidian3.TFolder) || a.name.localeCompare(b.name, void 0, { numeric: true }));
  }
  async show(type, center = false) {
    let leaf = center ? void 0 : this.app.workspace.getLeavesOfType(type)[0];
    if (!leaf) {
      leaf = type === CONSOLE ? this.app.workspace.getLeaf("split", "horizontal") : type === NAV && !center ? this.app.workspace.getLeftLeaf(false) ?? this.app.workspace.getLeaf("tab") : this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
    return leaf;
  }
  async toggle(type) {
    const leaves = this.app.workspace.getLeavesOfType(type);
    if (leaves.length) leaves.forEach((leaf) => leaf.detach());
    else await this.show(type);
  }
  async toggleFilesFocus() {
    const center = this.app.workspace.getLeavesOfType(NAV).filter((leaf) => leaf.getRoot() === this.app.workspace.rootSplit);
    if (center.length) {
      center.forEach((leaf) => leaf.detach());
      await this.show(NAV);
    } else await this.show(NAV, true);
  }
  async open(file, newTab = false) {
    const native = new Set("md canvas base pdf png jpg jpeg gif webp avif bmp svg mp3 wav ogg m4a flac mp4 webm mov".split(" "));
    if (!native.has(file.extension.toLowerCase()) && (file.stat.size > 2e6 || !isText(file.name, await this.app.vault.readBinary(file))))
      throw new Error("This file is binary, unsupported, or larger than 2 MB. Open it with its usual app.");
    const workspace = this.app.workspace;
    const editors = [];
    workspace.iterateRootLeaves((leaf2) => {
      if (leaf2.view instanceof import_obsidian3.FileView || leaf2.view.getViewType() === "empty") editors.push(leaf2);
    });
    const editor = editors.includes(this.editor) ? this.editor : editors[0];
    if (editor) workspace.setActiveLeaf(editor, { focus: false });
    const leaf = workspace.getLeaf(newTab ? "tab" : false);
    if (native.has(file.extension.toLowerCase())) await leaf.openFile(file);
    else {
      await leaf.setViewState({ type: TEXT, state: { file: file.path }, active: true });
    }
    this.editor = leaf;
    await workspace.revealLeaf(leaf);
  }
  async newFile() {
    const name = await prompt(this.app, "New file", "Filename, including extension", "Untitled.md");
    if (name === null) return;
    const path = resolvePath(this.folder, name);
    if (!name.trim() || !path) throw new Error("Enter a filename.");
    const file = await this.app.vault.create(path, "");
    await this.open(file, true);
  }
  async newFolder() {
    const name = await prompt(this.app, "New folder", "Folder name");
    if (name === null) return;
    if (!name.trim()) throw new Error("Enter a folder name.");
    await this.app.vault.createFolder(resolvePath(this.folder, name));
  }
  async rename(file) {
    const name = await prompt(this.app, "Rename or move", "Path relative to the current parent folder", file.name);
    if (name === null) return;
    if (!name.trim()) throw new Error("Enter a name.");
    await this.app.fileManager.renameFile(file, resolvePath(file.parent?.path ?? "", name));
  }
  decorate(el) {
    el.addClass("yhwh");
    el.dataset.mode = mode(this.current.energy);
    el.style.setProperty("--yhwh-accent", this.current.accent);
    el.style.removeProperty("--yhwh-background");
    if (this.current.bg) {
      const file = this.app.vault.getAbstractFileByPath(this.current.bg);
      if (file instanceof import_obsidian3.TFile && /^(png|jpg|jpeg|webp|avif|gif)$/.test(file.extension))
        el.style.setProperty("--yhwh-background", `url("${this.app.vault.getResourcePath(file).replace(/["\\\n\r]/g, encodeURIComponent)}")`);
    }
  }
  heading(el, title) {
    this.decorate(el);
    const head = el.createDiv("yhwh-heading");
    head.createEl("bdi", { text: this.current.energy ? "\u{10909}\u{10904}\u{10905}\u{10904}" : "YHWH", cls: "yhwh-wordmark", attr: { dir: "ltr" } });
    head.createEl("span", { text: this.current.title || title, cls: "yhwh-title" });
    button(head, "?", "Help and about", () => this.help());
    const label = el.createEl("label", { cls: "yhwh-energy" });
    label.createSpan({ text: `Amount of YHWH-ness \xB7 ${mode(this.current.energy)}` });
    const slider = label.createEl("input", { type: "range", attr: { min: "0", max: "100", step: "50", "aria-label": "Amount of YHWH-ness" } });
    slider.value = String(this.current.energy);
    slider.addEventListener("change", () => this.run(async () => {
      this.settings.energy = Number(slider.value);
      await this.save();
      await this.go(this.folder);
    }));
    if (this.configErrors.length) button(el, `${this.configErrors.length} configuration issue(s)`, "Show configuration errors", () => this.help());
  }
  copyBlock(el, key) {
    if (this.current.energy === 0) return;
    const block = el.createDiv("yhwh-copy");
    const text = block.createEl("p", { text: this.settings.copy[key] });
    button(block, "Edit", `Edit ${key} text`, () => this.editCopy(key, () => text.setText(this.settings.copy[key])));
  }
  editCopy(key, updated) {
    const modal = new import_obsidian3.Modal(this.app);
    modal.titleEl.setText(`Edit YHWH: ${key}`);
    const text = modal.contentEl.createEl("textarea", { cls: "yhwh-copy-editor" });
    text.value = this.settings.copy[key];
    button(modal.contentEl, "Save", "Save wording", () => this.run(async () => {
      this.settings.copy[key] = text.value;
      await this.save();
      this.changed();
      updated?.();
      modal.close();
    }));
    button(modal.contentEl, "Restore default", "Restore default wording", () => {
      text.value = COPY[key];
    });
    modal.open();
    text.focus();
  }
  external(el, text, href) {
    el.createEl("a", { text, href, cls: "yhwh-link", attr: { target: "_blank", rel: "noopener noreferrer" } });
  }
  async nextCircus() {
    if (this.circusBusy) return;
    this.circusBusy = true;
    this.circusError = "";
    this.changed();
    try {
      const page = await (0, import_obsidian3.requestUrl)({ url: `https://nietzschefamilycircus.com/?yhwh=${Date.now()}`, throw: false });
      if (page.status !== 200) throw new Error(`Circus unavailable (${page.status}).`);
      const pair = circusPair(page.text);
      const image = await (0, import_obsidian3.requestUrl)({ url: pair.image, throw: false });
      if (image.status !== 200 || image.arrayBuffer.byteLength > 3e6) throw new Error("The cartoon could not be loaded.");
      if (this.closed) return;
      const mime = pair.image.endsWith(".gif") ? "image/gif" : pair.image.endsWith(".png") ? "image/png" : "image/jpeg";
      if (this.circus) URL.revokeObjectURL(this.circus.image);
      this.circus = { ...pair, image: URL.createObjectURL(new Blob([image.arrayBuffer], { type: mime })) };
    } catch (error) {
      this.circusError = error.message;
    } finally {
      this.circusBusy = false;
      if (!this.closed) this.changed();
    }
  }
  help() {
    const modal = new import_obsidian3.Modal(this.app);
    modal.titleEl.setText("YHWH \xB7 help and about");
    const el = modal.contentEl;
    this.decorate(el);
    el.createEl("p", { text: "Navigate with the left pane; use Alt+\u2191 to go up and Enter to open a selected entry. Ctrl+E toggles the navigator, Ctrl+D opens it in a workspace tab, and Ctrl+B toggles the navigation console. Reassign conflicts in Settings \u2192 Hotkeys." });
    el.createEl("p", { text: "The console understands help, pwd, ls, cd, open, new, mkdir, mv, cat, find, mode, 3d, hello and clear. It is a vault command line. Run help there for syntax. Native Obsidian tabs, Markdown, themes, backlinks and plugins continue to work." });
    this.copyBlock(el, "about");
    this.external(el, "About Us \u2197", "https://thedynamiclinker.com");
    this.external(el, "About YHWH \xB7 Genesis by The Nameless \u2197", "https://www.amazon.com/dp/B0HNQ23QKT");
    button(el, "Offerings", "Open offerings", () => {
      modal.close();
      this.offerings();
    });
    const future = el.createEl("details");
    future.createEl("summary", { text: "Coming soon" });
    this.copyBlock(future, "upgrades");
    future.createEl("p", { text: "Sync, Stuff and Dating are concepts, with no payment or preorder. The local 3D directory is available now." });
    button(future, "Open 3D directory", "Open local 3D directory", () => {
      modal.close();
      this.run(() => this.show(ATLAS));
    });
    if (this.configErrors.length) el.createEl("pre", { text: this.configErrors.join("\n"), cls: "yhwh-errors" });
    modal.open();
  }
  offerings() {
    const modal = new import_obsidian3.Modal(this.app);
    modal.titleEl.setText("Offerings");
    const el = modal.contentEl;
    this.decorate(el);
    this.copyBlock(el, "offerings");
    el.createEl("h3", { text: "Burnt Offering" });
    this.copyBlock(el, "burnt");
    el.createEl("p", { text: "Developer setup: create a Stripe account, complete business verification, and connect the bank account that will receive payouts. Create a one-time Payment Link, test it in test mode, then add the live link to this plugin. No card or bank details belong in plugin settings." });
    this.external(el, "Create a Stripe account \u2197", "https://dashboard.stripe.com/register");
    this.external(el, "Payment Links setup \u2197", "https://docs.stripe.com/payment-links");
    el.createEl("h3", { text: "Piece Offering" });
    this.copyBlock(el, "piece");
    const picker = el.createEl("input", { type: "file", attr: { "aria-label": "Choose a piece offering" } });
    const receipt = el.createEl("p", { text: "Choose a file to preview its name. Nothing is uploaded." });
    picker.addEventListener("change", () => {
      receipt.setText(picker.files?.[0] ? `Selected: ${picker.files[0].name}. No upload has occurred. To share it, attach it yourself in an email.` : "No file selected.");
    });
    this.external(el, "Email yhwh@thedynamiclinker.com \u2197", "mailto:yhwh@thedynamiclinker.com");
    this.external(el, "The Dynamic Linker \u2197", "https://thedynamiclinker.com");
    modal.open();
  }
  onunload() {
    this.closed = true;
    this.navigation++;
    this.listeners.clear();
    if (this.circus) URL.revokeObjectURL(this.circus.image);
  }
};
var YHWHSettings = class extends import_obsidian3.PluginSettingTab {
  constructor(plugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl: el, plugin: p } = this;
    el.empty();
    el.createEl("h2", { text: "YHWH" });
    const update = () => p.run(async () => {
      await p.save();
      await p.go(p.folder);
    });
    new import_obsidian3.Setting(el).setName("Amount of YHWH-ness").setDesc("Dawkins: plain. Nietzsche: existential. YHWH: full deity.").addDropdown((d) => d.addOptions({ "0": "Dawkins \xB7 0%", "50": "Nietzsche \xB7 50%", "100": "YHWH \xB7 100%" }).setValue(String(p.settings.energy)).onChange((v) => {
      p.settings.energy = Number(v);
      update();
    }));
    new import_obsidian3.Setting(el).setName("Follow active file").setDesc("Keep the navigator, console and 3D directory in the active file\u2019s folder.").addToggle((t) => t.setValue(p.settings.followActive).onChange((v) => {
      p.settings.followActive = v;
      update();
    }));
    new import_obsidian3.Setting(el).setName("Open navigator at startup").addToggle((t) => t.setValue(p.settings.autoOpen).onChange((v) => {
      p.settings.autoOpen = v;
      update();
    }));
    new import_obsidian3.Setting(el).setName("Accent color").addColorPicker((c) => c.setValue(p.settings.accent).onChange((v) => {
      p.settings.accent = v;
      update();
    }));
    el.createEl("h3", { text: "Words" });
    el.createEl("p", { text: "Edit the character\u2019s words here or beside each message. Wording is stored in plugin settings and survives upgrades." });
    for (const key of Object.keys(COPY)) new import_obsidian3.Setting(el).setName(key).addButton((b) => b.setButtonText("Edit").onClick(() => p.editCopy(key)));
    el.createEl("h3", { text: "Folder configuration" });
    el.createEl("p", { text: "Settings above are defaults. Optional .yhwh/rc and .yhwh/rc.obsidian files override them from the vault root down to the current folder. Paths are vault-relative; shell commands and environment expansion are unavailable. Run \u201CReload folder configuration\u201D after an external edit." });
    el.createEl("pre", { text: '/\n    mode=yhwh\n    accent="#b7a1ef"\n\n"/Writing a book"\n    title="Let there be words"\n    follow_active=false' });
    if (p.configErrors.length) el.createEl("pre", { text: p.configErrors.join("\n"), cls: "yhwh-errors" });
  }
};
