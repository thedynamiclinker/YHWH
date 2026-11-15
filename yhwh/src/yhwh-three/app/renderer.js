// This module decorates the shared desktop. It owns no files, commands, tabs,
// editors, terminal sessions, selection, focus, or application state.
export function install(api) {
  document.body.classList.add('three-interface');
  const removeCSS = api.injectCSS(`
    .three-interface { --three-edge: #b7a1ef55; }
    .three-interface .workspace { perspective: 1100px; }
    .three-interface .workspace-leaf { position:relative; border-radius: 9px 3px 12px 2px; }
    .three-interface .pane-header, .three-interface .document-toolbar {
      background-image:linear-gradient(100deg, #b7a1ef0b, transparent 65%);
      border-top:1px solid var(--three-edge);
      border-radius:9px 3px 0 0;
    }
    .three-interface .titlebar { border-bottom-color:var(--three-edge); }
    .three-interface .paleo { text-shadow:2px 2px 0 #b7a1ef35, -1px -1px 0 #9ccbb025; }
    .three-interface .welcome { border-radius: 62% 38% 51% 49% / 8% 13% 87% 92%; }
    .three-interface #dialog { border-radius:16px 5px 18px 6px; border-color:var(--three-edge); }
    .three-interface .file-row.selected { border-radius: 9px 3px 11px 3px; }
    #three-surface { position:fixed; inset:0; width:100%; height:100%; pointer-events:none; z-index:90; }
    .three-interface .three-toggle { accent-color:var(--purple); }
    @media(prefers-reduced-motion:reduce) { #three-surface { display:none; } }
  `);
  const canvas = document.createElement('canvas');
  canvas.id = 'three-surface'; canvas.setAttribute('aria-hidden', 'true'); canvas.inert = true;
  document.body.append(canvas);
  // Canvas2D works on machines where WebGL only has a slow software fallback.
  const ctx = canvas.getContext('2d', { alpha:true, desynchronized:true });
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let enabled = true, strength = 1, disposed = false, frame = 0, timer = 0, scale = 1, lastImpulse = -Infinity;
  let impulses = [], animations = new Set();
  const stats = { frames:0, paintMs:0, maxPaintMs:0, bursts:0, running:false, backend:ctx ? 'canvas2d' : 'css' };
  const abort = new AbortController();
  const on = (target, event, fn, options = {}) => target.addEventListener(event, fn, { ...options, signal:abort.signal });
  const allowed = () => enabled && !reduced.matches && !document.hidden && !disposed;
  function size() {
    // Bounded pixel budget, independent of retina/4K devicePixelRatio.
    scale = Math.min(1, Math.sqrt(900000 / Math.max(1, innerWidth * innerHeight)));
    canvas.width = Math.ceil(innerWidth * scale); canvas.height = Math.ceil(innerHeight * scale);
    ctx?.setTransform(scale, 0, 0, scale, 0, 0);
  }
  function stop() {
    clearTimeout(timer); cancelAnimationFrame(frame); timer = frame = 0;
    impulses = []; stats.running = false;
    ctx?.clearRect(0, 0, innerWidth, innerHeight);
    for (const animation of animations) animation.cancel();
    animations.clear();
  }
  function schedule() {
    if (!allowed() || !ctx || timer || frame || !impulses.length) return;
    stats.running = true;
    // No idle animation loop. At most 24 paints/sec during a short gesture.
    timer = setTimeout(() => { timer = 0; frame = requestAnimationFrame(paint); }, 1000 / 24);
  }
  function paint(now) {
    frame = 0;
    if (!allowed()) { stop(); return; }
    const start = performance.now();
    ctx.clearRect(0,0,innerWidth,innerHeight);
    impulses = impulses.filter(impulse => now - impulse.at < impulse.duration);
    for (const impulse of impulses) {
      const t = Math.max(0, (now - impulse.at) / impulse.duration), fade = Math.sin(Math.PI * t) * (1 - t);
      ctx.save();
      if (impulse.type === 'melt') drawMelt(impulse, t, fade);
      else drawMembrane(impulse, t, fade);
      ctx.restore();
    }
    stats.frames++; const elapsed = performance.now() - start;
    stats.paintMs += elapsed; stats.maxPaintMs = Math.max(stats.maxPaintMs, elapsed);
    if (impulses.length) schedule(); else stats.running = false;
  }
  function drawMembrane({ rect:r, force }, t, fade) {
    const bend = Math.sin(t * Math.PI * 4) * (1-t) * 18 * force;
    // Outlines cross pane boundaries and stretch past conventional window clips.
    for (let layer = 0; layer < 3; layer++) {
      const offset = (layer + 1) * 3 * strength;
      ctx.strokeStyle = layer % 2 ? '#9ccbb0' : '#b7a1ef';
      ctx.globalAlpha = fade * (0.48 - layer * .1);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(r.x-offset, r.y);
      ctx.bezierCurveTo(r.x+r.width*.3, r.y-bend-offset, r.x+r.width*.7, r.y+bend, r.right+offset, r.y);
      ctx.bezierCurveTo(r.right+bend, r.y+r.height*.3, r.right-bend, r.y+r.height*.7, r.right, r.bottom+offset);
      ctx.bezierCurveTo(r.x+r.width*.7, r.bottom+bend+offset, r.x+r.width*.3, r.bottom-bend, r.x-offset, r.bottom);
      ctx.bezierCurveTo(r.x-bend-offset, r.y+r.height*.7, r.x+bend, r.y+r.height*.3, r.x-offset, r.y);
      ctx.stroke();
    }
  }
  function drawMelt({ rect:r, glyphs, font, color }, t, fade) {
    ctx.font = font; ctx.textBaseline = 'top'; ctx.globalAlpha = fade * .95;
    for (let i=0; i<glyphs.length; i++) {
      const glyph = glyphs[i], drop = (15 + Math.sin(i*2.1)*10) * Math.sin(t*Math.PI/2) * 3.5 * strength;
      ctx.fillStyle = i % 2 ? '#b7a1ef' : color;
      ctx.save(); ctx.translate(r.x+glyph.x+Math.sin(i+t*7)*t*3, r.y+drop);
      ctx.transform(1,0,Math.sin(t*5+i)*.08,1+t*.6,0,0);
      ctx.fillText(glyph.text,0,0); ctx.restore();
      ctx.strokeStyle = color; ctx.globalAlpha = fade*.2;
      ctx.beginPath(); ctx.moveTo(r.x+glyph.x+3, r.bottom-4);
      ctx.quadraticCurveTo(r.x+glyph.x+Math.sin(i+t*4)*8, r.bottom+drop*.6, r.x+glyph.x+3, r.bottom+drop+5);
      ctx.stroke(); ctx.globalAlpha = fade*.95;
    }
  }
  function pulse(element, type = 'membrane') {
    if (!allowed() || !element || !element.isConnected) return;
    const now = performance.now();
    if (now - lastImpulse < 140) return;
    lastImpulse = now;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const impulse = { type, rect, at:now, duration:type === 'melt' ? 950 : 700, force:strength };
    if (type === 'melt' && ctx) {
      const style = getComputedStyle(element);
      impulse.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`; impulse.color = style.color;
      ctx.font = impulse.font;
      const copy = element.cloneNode(true); copy.querySelectorAll('button').forEach(button => button.remove());
      let x=0; impulse.glyphs = [...copy.textContent.trim()].slice(0,64).map(text => { const glyph = { text,x }; x+=ctx.measureText(text).width; return glyph; });
    }
    impulses.push(impulse); impulses = impulses.slice(-3); stats.bursts++;
    schedule();
  }
  function wobble(element) {
    if (!allowed() || !element || element.contains(document.activeElement) && document.activeElement.matches('input, textarea, [contenteditable=true]')) return;
    const amount = Math.min(strength, 1.4);
    const animation = element.animate([
      { transform:'perspective(1000px) translate3d(0,0,0) skew(0deg)' },
      { transform:`perspective(1000px) translate3d(${amount*4}px,${-amount*2}px,0) skew(${amount*.65}deg) rotateX(${amount*.5}deg)`, offset:.25 },
      { transform:`translate3d(${-amount*2}px,${amount}px,0) skew(${-amount*.3}deg)`, offset:.6 },
      { transform:'none' },
    ], { duration:560, easing:'ease-out' });
    animations.add(animation);
    animation.onfinish = () => { animations.delete(animation); animation.cancel(); };
  }
  function configure() {
    const values = api.active()?.config.values || {};
    enabled = values.spatial_effects !== 'false' && !['0','false'].includes(values.motion);
    strength = Math.max(.25, Math.min(1.5, Number(values.spatial_strength) || 1));
    if (!allowed()) stop();
  }
  size(); configure();
  on(window, 'resize', () => { stop(); size(); });
  on(document, 'visibilitychange', () => { if (document.hidden) stop(); });
  on(reduced, 'change', () => { if (reduced.matches) stop(); });
  // Typing, text selection, editors and terminal cells never enter the effects pipeline.
  on(document, 'keydown', event => {
    if (event.target.closest('input, textarea, [contenteditable=true], .cm-editor, .xterm')) stop();
  }, { capture:true });
  on(document, 'pointerover', event => {
    const title = event.target.closest('.brand .paleo, .welcome h1, .welcome > .paleo');
    if (title && !title.contains(event.relatedTarget)) pulse(title,'melt');
  }, { passive:true });
  on(document, 'pointerdown', event => {
    if (event.button !== 0 || event.target.closest('input, textarea, [contenteditable=true], .cm-editor, .xterm, button, a')) return;
    const header = event.target.closest('.pane-header, .document-toolbar, .plugin-panel > header, .dialog-header');
    if (header) { const panel = header.closest('.workspace-leaf, dialog'); pulse(panel); wobble(panel); }
  }, { passive:true });
  on(document, 'click', event => {
    const control = event.target.closest('[data-command], #tabs [data-tab], .file-row');
    if (control && !control.closest('dialog')) pulse(control.closest('.workspace-leaf') || control);
  }, { passive:true });
  const off = [api.on('config', configure), api.on('focus', configure), api.on('navigate', () => pulse(document.querySelector('#files'))), api.on('open', () => pulse(document.querySelector('#document')))];
  const removeCommand = api.addCommand({ id:'three-melt', name:'Three · let the interface melt', run:() => {
    const title = document.querySelector('.welcome h1') || document.querySelector('.brand .paleo');
    pulse(title, 'melt'); wobble(document.querySelector('#document'));
  }});
  const removeToggle = api.addCommand({ id:'three-effects', name:'Three · toggle visual effects', run:async () => {
    const next = !enabled;
    await window.yhwh.call('settings:save', { spatial_effects: String(next), motion:next ? '1' : '0' });
    await api.refresh();
    api.notice(enabled ? 'Impossible surfaces on.' : 'Visual motion paused. All tools still work.');
  }});
  return {
    stats,
    get enabled() { return enabled && !reduced.matches; },
    pulse,
    dispose() { disposed=true; stop(); abort.abort(); off.forEach(fn=>fn()); removeCommand(); removeToggle(); removeCSS(); canvas.remove(); document.body.classList.remove('three-interface'); },
  };
}
