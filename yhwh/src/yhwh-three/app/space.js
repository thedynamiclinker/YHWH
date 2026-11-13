import sceneConfig from '../../../etc/three/space.json';
import { text as interfaceText } from '../../../lib/text.cjs';
import interfaceCopy from '../../../etc/three/text-space.json';
const ui = interfaceText(interfaceCopy);
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

// Uses the public Three.js Unreal Bloom example's composer pipeline (MIT).
// Everything in the scene is procedural; directory entries supply its data.
export class Space {
  constructor(host, { select, open, status }) {
    this.host = host;
    this.onSelect = select;
    this.onOpen = open;
    this.status = status;
    this.objects = [];
    this.labels = [];
    this.motion = 1;
    this.elapsed = 0;
    this.last = 0;
    this.scene = new THREE.Scene();
    this.scene.background = null;
    this.scene.fog = new THREE.FogExp2("#080c12", sceneConfig.fogDensity);
    this.camera = new THREE.PerspectiveCamera(sceneConfig.camera.fov, 1, sceneConfig.camera.near, sceneConfig.camera.far);
    this.camera.position.set(...sceneConfig.camera.position);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, sceneConfig.pixelRatioLimit));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = sceneConfig.exposure;
    host.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute(
      "aria-label",
      ui("interactive-3d-filesystem-equivalent-file-button"),
    );
    this.renderer.domElement.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      status(ui("3d-context-lost-use-files-or-reload-the-window-"));
    });
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.minDistance = sceneConfig.camera.minDistance;
    this.controls.maxDistance = sceneConfig.camera.maxDistance;
    this.controls.maxPolarAngle = Math.PI * sceneConfig.camera.maxPolarAngle;
    this.controls.target.set(0, 0, 0);
    this.controls.addEventListener("start", () => {
      this.interacted = true;
    });
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), sceneConfig.bloom.strength, sceneConfig.bloom.radius, sceneConfig.bloom.threshold);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.scene.add(new THREE.AmbientLight("#9298be", 2));
    const key = new THREE.PointLight("#ffe5a3", 160, 60);
    key.position.set(0, 7, 2);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight("#819bff", 3);
    fill.position.set(-10, 15, -10);
    this.scene.add(fill);
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.makeCore();
    this.makeStars(sceneConfig.stars);
    const grid = new THREE.PolarGridHelper(
      sceneConfig.grid.radius,
      sceneConfig.grid.sectors,
      sceneConfig.grid.rings,
      sceneConfig.grid.divisions,
      "#303242",
      "#1d2934",
    );
    grid.position.y = sceneConfig.grid.y;
    this.world.add(grid);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(sceneConfig.outerRing.innerRadius, sceneConfig.outerRing.outerRadius, sceneConfig.outerRing.segments),
      new THREE.MeshBasicMaterial({
        color: "#455569",
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.45,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = sceneConfig.outerRing.y;
    this.world.add(ring);
    this.entries = new THREE.Group();
    this.world.add(this.entries);
    this.labelHost = document.createElement("div");
    this.labelHost.className = "space-labels";
    host.append(this.labelHost);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    let down;
    this.renderer.domElement.addEventListener("pointerdown", (event) => {
      down = [event.clientX, event.clientY];
    });
    this.renderer.domElement.addEventListener("pointerup", (event) => {
      if (
        !down ||
        Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 5
      )
        return;
      const hit = this.pick(event);
      if (hit) this.onSelect(hit.entry);
    });
    this.renderer.domElement.addEventListener("dblclick", (event) => {
      const hit = this.pick(event);
      if (hit) this.onOpen(hit.entry);
    });
    this.renderer.domElement.addEventListener("pointermove", (event) => {
      const hit = this.pick(event);
      this.renderer.domElement.style.cursor = hit ? "pointer" : "grab";
      this.hovered = hit;
    });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    this.renderer.setAnimationLoop((time) => this.draw(time));
    const gl = this.renderer.getContext();
    const debug = gl.getExtension(ui("webgl-debug-renderer-info"));
    const device = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : "";
    const software = /swiftshader|llvmpipe|software/i.test(device);
    status(
      ui("webgl-", gl instanceof WebGL2RenderingContext ? "2" : "1", software ? "SOFTWARE" : "LIVE"),
    );
    this.renderer.domElement.title = device;
  }
  makeCore() {
    this.core = new THREE.Group();
    this.world.add(this.core);
    const sphere = new THREE.Mesh(
      new THREE.IcosahedronGeometry(sceneConfig.core.radius, 5),
      new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
          tint: { value: new THREE.Color("#d9b476") },
        },
        vertexShader: "varying vec3 vNormal; varying vec3 vPosition; void main(){vNormal=normalize(normalMatrix*normal);vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
        fragmentShader: "uniform float time;uniform vec3 tint;varying vec3 vNormal;varying vec3 vPosition;void main(){float bands=sin(vPosition.y*15.+sin(vPosition.x*7.+time*.3)*2.+time*.2)*.5+.5;float edge=pow(1.-abs(dot(normalize(vNormal),vec3(0.,0.,1.))),2.);float veins=pow(bands,15.);vec3 col=vec3(.018,.027,.04)+tint*(edge*.45+veins*.16);gl_FragColor=vec4(col,1.);}",
      }),
    );
    this.sphere = sphere;
    this.core.add(sphere);
    const wire = new THREE.Mesh(
      new THREE.IcosahedronGeometry(sceneConfig.core.wireRadius, 2),
      new THREE.MeshBasicMaterial({
        color: "#d6bd83",
        wireframe: true,
        transparent: true,
        opacity: 0.16,
      }),
    );
    this.core.add(wire);
    this.rings = [];
    for (let i = 0; i < sceneConfig.core.ringCount; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(sceneConfig.core.ringRadius + i * sceneConfig.core.ringSpacing, sceneConfig.core.ringTube, 6, 180),
        new THREE.MeshBasicMaterial({
          color: i % 2 ? "#7c91b3" : "#e5c995",
          transparent: true,
          opacity: i % 2 ? 0.28 : 0.65,
        }),
      );
      ring.rotation.set(Math.PI / 2 + (i - 1) * 0.19, 0.1 * i, 0.18 * i);
      this.core.add(ring);
      this.rings.push(ring);
    }
    const ticks = [];
    for (let i = 0; i < 100; i++) {
      const a = (i / 100) * Math.PI * 2;
      const r = i % 5 ? 4.7 : 4.6;
      ticks.push(
        Math.cos(a) * r,
        -0.15,
        Math.sin(a) * r,
        Math.cos(a) * 4.83,
        -0.15,
        Math.sin(a) * 4.83,
      );
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute("position", new THREE.Float32BufferAttribute(ticks, 3));
    this.core.add(
      new THREE.LineSegments(
        tg,
        new THREE.LineBasicMaterial({
          color: "#e8c686",
          transparent: true,
          opacity: 0.45,
        }),
      ),
    );
    // A canvas texture keeps the original Paleo-Hebrew font rather than substituting glyphs.
    document.fonts.load(ui("64px-phoenician")).then(() => {
      const canvas = document.createElement("canvas");
      canvas.width = sceneConfig.logo.width;
      canvas.height = sceneConfig.logo.height;
      const ctx = canvas.getContext("2d");
      ctx.font = ui("78px-phoenician");
      ctx.fillStyle = "#f0d9a9";
      ctx.textAlign = "center";
      ctx.fillText("𐤉𐤄𐤅𐤄", 256, 105);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const logo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          depthTest: false,
        }),
      );
      logo.scale.set(...sceneConfig.logo.scale);
      logo.position.y = 0.4;
      this.core.add(logo);
    });
  }
  makeStars(count) {
    if (this.stars) {
      this.scene.remove(this.stars);
      this.stars.geometry.dispose();
      this.stars.material.dispose();
    }
    const positions = [],
      colors = [];
    for (let i = 0; i < count; i++) {
      const a = i * 2.39996323;
      const r = 30 + ((i * 137) % 900) / 15;
      const y = Math.sin(i * 37.23) * 45;
      positions.push(Math.cos(a) * r, y, Math.sin(a) * r);
      const col = new THREE.Color(i % 3 ? "#6b7e9a" : "#b6a27a");
      colors.push(col.r, col.g, col.b);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    this.stars = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 0.065,
        vertexColors: true,
        transparent: true,
        opacity: 0.65,
        sizeAttenuation: true,
      }),
    );
    this.scene.add(this.stars);
  }
  show(items) {
    for (const object of [...this.entries.children]) {
      this.entries.remove(object);
      object.traverse((child) => {
        child.geometry?.dispose();
        if (child.material) child.material.dispose();
      });
    }
    this.objects = [];
    this.labels = [];
    this.labelHost.replaceChildren();
    this.interacted = false;
    this.camera.position.set(...sceneConfig.directory.camera);
    this.controls.target.set(0, 0, 0);
    items.forEach((entry, i) => {
      const group = new THREE.Group();
      const ring = Math.floor(i / sceneConfig.directory.entriesPerRing),
        angle =
          ((i % sceneConfig.directory.entriesPerRing) / Math.min(sceneConfig.directory.entriesPerRing, items.length - ring * sceneConfig.directory.entriesPerRing)) * Math.PI * 2 +
          ring * 0.26;
      const radius = sceneConfig.directory.radius + ring * sceneConfig.directory.ringSpacing;
      group.position.set(
        Math.cos(angle) * radius,
        Math.sin(i * 2.7) * 0.6,
        Math.sin(angle) * radius,
      );
      const color = entry.directory ? "#d6bc83" : "#879ed4";
      const geometry = entry.directory
        ? new THREE.CylinderGeometry(0.63, 0.63, 0.5, 6)
        : new THREE.OctahedronGeometry(0.45, 0);
      const body = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: entry.directory ? "#3e3a2e" : "#27334d",
          emissive: color,
          emissiveIntensity: 0.2,
          metalness: 0.72,
          roughness: 0.28,
        }),
      );
      body.position.y = 0.25;
      group.add(body);
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 }),
      );
      edge.position.copy(body.position);
      group.add(edge);
      const base = new THREE.Mesh(
        new THREE.RingGeometry(0.78, 0.8, 48),
        new THREE.MeshBasicMaterial({
          color,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.55,
        }),
      );
      base.rotation.x = -Math.PI / 2;
      base.position.y = -0.1;
      group.add(base);
      if (entry.directory) {
        const top = new THREE.Mesh(
          new THREE.TorusGeometry(0.35, 0.016, 5, 32),
          new THREE.MeshBasicMaterial({ color }),
        );
        top.rotation.x = Math.PI / 2;
        top.position.y = 0.62;
        group.add(top);
      }
      const points = [];
      for (let s = 0; s <= 35; s++) {
        const t = s / 35;
        points.push(
          new THREE.Vector3(
            group.position.x * t,
            Math.sin(t * Math.PI) * 1.5 - 0.45,
            group.position.z * t,
          ),
        );
      }
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity: 0.12,
        }),
      );
      this.entries.add(line);
      this.entries.add(group);
      this.objects.push({ group, body, edge, entry, baseY: group.position.y });
      body.userData.entry = entry;
      const label = document.createElement("button");
      label.className = "node-label";
      label.textContent = entry.name;
      label.title = entry.path;
      label.dataset.path = entry.path;
      if (entry.directory) label.classList.add("directory");
      label.addEventListener("click", () => this.onSelect(entry));
      label.addEventListener("dblclick", () => this.onOpen(entry));
      label.addEventListener("keydown", (event) => {
        if (event.key === ui("enter")) this.onOpen(entry);
      });
      this.labelHost.append(label);
      this.labels.push({ label, group });
    });
    this.arrival = 1;
  }
  select(entry) {
    this.selected = entry?.path;
  }
  configure(values) {
    this.motion =
      values.motion === "0" ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 1;
    this.bloom.strength = Number.isFinite(+values.bloom)
      ? Math.max(0, Math.min(2, +values.bloom))
      : 0.8;
    const count = Math.max(0, Math.min(6000, parseInt(values.particles) || 0));
    if (count !== this.starCount) {
      this.makeStars(count);
      this.starCount = count;
    }
    this.bloom.enabled = values.theme !== "dawkins";
  }
  pick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(
      this.objects.map((o) => o.body),
    )[0];
    return hit && this.objects.find((o) => o.body === hit.object);
  }
  resize() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }
  reset() {
    this.camera.position.set(...sceneConfig.camera.position);
    this.controls.target.set(0, 0, 0);
    this.interacted = false;
  }
  draw(time) {
    const dt = Math.min((time - this.last) / 1000, 0.05);
    this.last = time;
    if (document.hidden || this.host.closest("[hidden]")) return;
    this.elapsed += dt * this.motion;
    this.sphere.material.uniforms.time.value = this.elapsed;
    this.sphere.rotation.y = this.elapsed * 0.05;
    this.rings.forEach(
      (ring, i) =>
        (ring.rotation.z = this.elapsed * 0.03 * (i % 2 ? 1 : -1) + i * 0.18),
    );
    this.stars.rotation.y = this.elapsed * 0.003;
    this.arrival = Math.max(0, (this.arrival || 0) - dt * 0.8);
    this.entries.scale.setScalar(
      1 + this.arrival * this.arrival * 0.07 * this.motion,
    );
    for (const object of this.objects) {
      const active =
        object.entry.path === this.selected || object === this.hovered;
      object.group.position.y =
        object.baseY + Math.sin(this.elapsed * 0.7 + object.baseY) * 0.12;
      object.body.material.emissiveIntensity = active ? 1.1 : 0.2;
      object.group.scale.setScalar(active ? 1.25 : 1);
    }
    this.controls.update();
    this.camera.updateMatrixWorld();
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    for (const { label, group } of this.labels) {
      const position = group.getWorldPosition(new THREE.Vector3());
      position.y -= 0.65;
      position.project(this.camera);
      label.style.transform = `translate(-50%, 0) translate(${(position.x * 0.5 + 0.5) * w}px,${(-position.y * 0.5 + 0.5) * h}px)`;
      label.hidden =
        position.z > 1 ||
        position.x < -1.1 ||
        position.x > 1.1 ||
        position.y < -1.1 ||
        position.y > 1.1;
      label.classList.toggle("selected", label.dataset.path === this.selected);
    }
    this.composer.render();
  }
}
