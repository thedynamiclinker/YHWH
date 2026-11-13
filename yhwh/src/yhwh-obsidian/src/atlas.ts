import space from '../../../etc/obsidian/space.json';
import { text as interfaceText } from '../../../lib/text.cjs';
import interfaceCopy from '../../../etc/obsidian/text-atlas.json';
const ui = interfaceText(interfaceCopy);
import { ItemView, TFile, TFolder, WorkspaceLeaf } from 'obsidian';
import type YHWH from './main';
import { parent } from './core';
import { button } from './views';

export const ATLAS = 'yhwh-atlas';
type Point = { x: number; y: number; z: number; folder: boolean; entry?: TFile | TFolder };

/** A directory is a constellation. Files remain ordinary vault files. */
export class Atlas extends ItemView {
  private unsubscribe?: () => void;
  private disposeScene: () => void = () => {};
  private yaw = space.yaw;
  private pitch = space.pitch;
  private zoom = space.zoom;
  private filter = '';
  constructor(leaf: WorkspaceLeaf, private plugin: YHWH) { super(leaf); }
  getViewType() { return ATLAS; }
  getDisplayText() { return ui("yhwh-spatial-directory"); }
  getIcon() { return 'orbit'; }
  async onOpen() {
    this.unsubscribe = this.plugin.watch(() => this.render());
    this.render();
  }
  render() {
    this.disposeScene();
    const p = this.plugin, el = this.contentEl;
    el.empty(); p.heading(el, ui("3d-directory")); el.addClass('yhwh-atlas');
    const toolbar = el.createDiv('yhwh-tools');
    button(toolbar, ui("-parent"), ui("go-to-parent-folder"), () => p.run(() => p.go(parent(p.folder)))).disabled = !p.folder;
    toolbar.createEl('code', { text: '/' + p.folder });
    const reset = button(toolbar, ui("reset-view"), ui("reset-camera"), () => {});
    const orbit = button(toolbar, ui("orbit"), ui("toggle-slow-orbit"), () => {});
    const filter = toolbar.createEl('input', { type: 'search', value: this.filter, attr: { 'aria-label': ui("filter-3d-directory"), placeholder: ui("filter-files-") } });
    filter.addEventListener('change', () => { this.filter = filter.value; this.render(); });
    const entries = p.entries().filter(file => file.name.toLowerCase().includes(this.filter.toLowerCase()));
    const stage = el.createDiv('yhwh-space');
    const canvas = stage.createEl('canvas', { attr: { 'aria-label': ui("interactive-3d-directory-drag-to-orbit-scroll-to") } });
    const labels = stage.createDiv('yhwh-space-labels');
    const caption = stage.createDiv('yhwh-space-caption');
    const heading = caption.createEl('small', { text: p.current.energy ? p.settings.copy.directory : ui("directory") });
    if (p.current.energy) button(caption, ui("edit"), ui("edit-directory-text"), () => p.editCopy('directory', () => heading.setText(p.settings.copy.directory)));
    caption.createEl('h2', { text: p.folder.split('/').at(-1) || this.app.vault.getName() });
    caption.createEl('p', { text: ui("entries-drag-to-orbit-scroll-to-zoom", entries.length) });
    const shown = entries.slice(0, space.maxVisibleEntries);
    if (entries.length > shown.length) el.createEl('p', { text: ui("showing-the-first-entries-in-space-filter-to-nar", shown.length), cls: 'yhwh-muted' });
    const accessible = el.createEl('details', { cls: 'yhwh-space-list' });
    accessible.createEl('summary', { text: ui("all-entries-keyboard-navigation", entries.length) });
    for (const file of entries) button(accessible, `${file instanceof TFolder ? '▸ ' : ''}${file.name}`, ui("open", file.name), () => this.openEntry(file));
    if (!entries.length) stage.createEl('p', { text: ui("this-directory-is-empty-create-a-file-from-the-n"), cls: 'yhwh-space-empty' });
    const gl = canvas.getContext('webgl', { alpha: true, antialias: true, powerPreference: 'low-power' });
    if (!gl) {
      stage.createEl('p', { text: ui("webgl-is-unavailable-use-the-file-list-below-"), cls: 'yhwh-space-empty' });
      accessible.open = true; reset.disabled = orbit.disabled = true; return;
    }
    const vertex = gl.createShader(gl.VERTEX_SHADER)!, fragment = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(vertex, "attribute vec2 position; attribute vec3 color; attribute float size;\n      varying vec3 tint; void main(){gl_Position=vec4(position,0.,1.);gl_PointSize=size;tint=color;}");
    gl.shaderSource(fragment, "precision mediump float; varying vec3 tint; uniform bool dots;\n      void main(){float a=0.2;if(dots){float d=length(gl_PointCoord-vec2(0.5));if(d>0.5)discard;a=1.-smoothstep(0.12,0.5,d);}gl_FragColor=vec4(tint,a);}");
    gl.compileShader(vertex); gl.compileShader(fragment);
    const program = gl.createProgram()!;
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      accessible.open = true; stage.createEl('p', { text: ui("the-graphics-driver-could-not-start-the-scene-us") });
      gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment); return;
    }
    const buffer = gl.createBuffer()!;
    gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    for (const [attribute, count, offset] of [['position', 2, 0], ['color', 3, 8], ['size', 1, 20]] as const) {
      const location = gl.getAttribLocation(program, attribute);
      gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, count, gl.FLOAT, false, 24, offset);
    }
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const dots = gl.getUniformLocation(program, 'dots');
    const points: Point[] = [{ x: 0, y: 0, z: 0, folder: true }];
    shown.forEach((entry, i) => {
      const phi = i * Math.PI * (3 - Math.sqrt(5));
      const y = shown.length === 1 ? 0 : 1 - (i + 0.5) / shown.length * 2;
      const radius = space.radius;
      points.push({ x: Math.cos(phi) * Math.sqrt(1 - y * y) * radius, y: y * radius,
        z: Math.sin(phi) * Math.sqrt(1 - y * y) * radius, folder: entry instanceof TFolder, entry });
    });
    const nodes = shown.map(entry => button(labels, entry.name, ui("open", entry.name), () => this.openEntry(entry)));
    const accent = p.current.accent.match(/[\da-f]{2}/gi)?.map(v => parseInt(v, 16) / 255) ?? [0.7, 0.6, 0.94];
    let frame = 0, disposed = false, spinning = false, last = 0;
    const view = el.ownerDocument.defaultView!;
    const project = (point: Point) => {
      const a = Math.cos(this.yaw), b = Math.sin(this.yaw), c = Math.cos(this.pitch), d = Math.sin(this.pitch);
      const x = point.x * a - point.z * b, z = point.x * b + point.z * a;
      const y = point.y * c - z * d, depth = point.y * d + z * c;
      const scale = this.zoom / (space.depth + depth);
      return { x: x * scale * 2, y: y * scale * 2, scale, depth };
    };
    const draw = () => {
      if (disposed || gl.isContextLost()) return;
      const width = stage.clientWidth, height = stage.clientHeight;
      if (!width || !height) return;
      const ratio = Math.min(view.devicePixelRatio || 1, space.pixelRatioLimit);
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      const aspect = width / height;
      const vertices: number[] = [], lines: number[] = [];
      const projected = points.map(project);
      const root = projected[0];
      points.forEach((point, i) => {
        const pos = projected[i];
        const color = i === 0 ? [1, 0.85, 0.5] : point.folder ? accent : [0.58, 0.79, 0.83];
        vertices.push(pos.x / aspect, pos.y, ...color, (i === 0 ? space.sizes.root : point.folder ? space.sizes.folder : space.sizes.file) * pos.scale * space.sizes.multiplier * ratio);
        if (i) {
          lines.push(root.x / aspect, root.y, ...accent, 1, pos.x / aspect, pos.y, ...accent, 1);
          const node = nodes[i - 1];
          node.style.left = `${(pos.x / aspect + 1) * width / 2}px`;
          node.style.top = `${(1 - pos.y) * height / 2 + space.labelOffset}px`;
          node.style.opacity = String(Math.max(0.45, 0.9 - pos.depth * 0.2));
          node.style.zIndex = String(Math.round(10 - pos.depth));
        }
      });
      // Deterministic stars: no network, scene graph dependency or idle animation.
      for (let i = 1; i <= space.stars; i++) {
        const x = Math.sin(i * 127.1) * 43758.5453, y = Math.sin(i * 311.7) * 19341.12;
        vertices.push((x - Math.floor(x)) * 2 - 1, (y - Math.floor(y)) * 2 - 1, 0.35, 0.38, 0.5, 2 * ratio);
      }
      gl.uniform1i(dots, 0); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.DYNAMIC_DRAW); gl.drawArrays(gl.LINES, 0, lines.length / 6);
      gl.uniform1i(dots, 1); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW); gl.drawArrays(gl.POINTS, 0, vertices.length / 6);
    };
    const animate = (now: number) => {
      if (disposed || !spinning) return;
      if (!el.ownerDocument.hidden) { this.yaw += Math.min((now - last) / 1000, 0.05) * space.orbitSpeed; draw(); }
      last = now; frame = view.requestAnimationFrame(animate);
    };
    let drag: { x: number; y: number } | null = null;
    canvas.addEventListener('pointerdown', event => { drag = { x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); });
    canvas.addEventListener('pointermove', event => {
      if (!drag) return;
      this.yaw += (event.clientX - drag.x) / space.dragSensitivity;
      this.pitch = Math.max(-space.maxPitch, Math.min(space.maxPitch, this.pitch + (event.clientY - drag.y) / space.dragSensitivity));
      drag = { x: event.clientX, y: event.clientY }; draw();
    });
    canvas.addEventListener('pointerup', () => { drag = null; });
    canvas.addEventListener('pointercancel', () => { drag = null; });
    canvas.addEventListener('wheel', event => { event.preventDefault(); this.zoom = Math.max(space.minZoom, Math.min(space.maxZoom, this.zoom * Math.exp(-event.deltaY / space.wheelSensitivity))); draw(); }, { passive: false });
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); spinning = false; view.cancelAnimationFrame(frame); accessible.open = true; });
    canvas.addEventListener('webglcontextrestored', () => this.render());
    reset.addEventListener('click', () => { this.yaw = space.yaw; this.pitch = space.pitch; this.zoom = space.zoom; draw(); });
    orbit.addEventListener('click', () => {
      spinning = !spinning; orbit.setText(spinning ? ui("stop-orbit") : ui("orbit")); orbit.setAttribute('aria-pressed', String(spinning));
      if (spinning) { last = view.performance.now(); frame = view.requestAnimationFrame(animate); } else view.cancelAnimationFrame(frame);
    });
    const observer = new ResizeObserver(draw); observer.observe(stage);
    draw();
    this.disposeScene = () => {
      disposed = true; view.cancelAnimationFrame(frame); observer.disconnect();
      gl.deleteBuffer(buffer); gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment);
      gl.getExtension(ui("webgl-lose-context"))?.loseContext();
    };
  }
  openEntry(entry: TFile | TFolder) {
    this.plugin.run(() => entry instanceof TFolder ? this.plugin.go(entry.path) : this.plugin.open(entry, true));
  }
  async onClose() { this.unsubscribe?.(); this.disposeScene(); }
}
