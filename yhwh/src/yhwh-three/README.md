# YHWH Three

The default desktop with impossible surfaces. Same files, editor, shell, tabs, keyboard shortcuts, settings, plugins, chat, inbox, narrative, and hidden worlds. No separate filesystem UI or editor implementation.

Run `make three` or `yhwh open three [path]`. `make three-build` builds both the shared desktop and its visual layer. The default app remains available through `yhwh open default`.

Hover the name or welcome heading: letters leave liquid trails beyond their normal bounds. Touch a pane header: the surface flexes, and elastic outlines spill across its neighbors. Navigation briefly bends the panel edges. The actual editor and terminal remain real, selectable DOM text. Effects never own focus, hit testing, navigation, or data.

Settings → Appearance → Impossible surfaces controls motion. The command palette also has **Three · toggle visual effects** and **Three · let the interface melt**. OS reduced motion disables animation. Text input immediately cancels visual bursts; hidden windows stop drawing.

## Performance

The old continuously rendered Three.js scene, bloom passes, stars, projected file labels, orbit controls, and software-WebGL restart loop are no longer loaded. A roughly 10 KB effects module uses Canvas2D and short compositor animations. It caps drawing at 24 paints/second during gestures, at most three simultaneous bursts, and 900,000 canvas pixels regardless of display density. There is no idle render loop and no WebGL requirement. Canvas failure leaves the shared UI working, with CSS decoration only.

`window.YHWH.three.stats` exposes frame count, accumulated/max paint time, burst count and running state for inspection. These measure the effects layer, not total application latency.

## Configuration

Both interfaces use the default desktop's hierarchical shell configuration and scope rules; see [its guide](../yhwh-default/README.md). Three reads `rc` then `rc.three` at each configuration location. Shared settings are inherited; later directory scopes retain precedence. Menu changes in Three append to the user `rc.three`; default menu changes still append to `rc`. They never modify directories merely visited.

`spatial_effects=false` or `motion=0` disables effects. `spatial_strength` controls distortion (0.25–1.5, default 1). The earlier bloom/particles options are unnecessary. Existing `rc.three` shell values still load through the shared configuration parser; the former independent Three configuration parser is no longer used by the desktop.

Three keeps its own application state under `state-three` in the YHWH config directory; `YHWH_THREE_DATA_DIR` overrides it. It shares ordinary preferences and source files with default. Shell `yhwh open file` returns to its originating Three tab, while an explicit `yhwh open default` opens default.

## Verification

The Three UI test runs the **entire default interaction suite** against the Three entry point, including shell synchronization, file editing/saving, tree navigation, settings persistence, plugins, literary worlds, chat success/failure/retry and independent tabs. Additional checks cover bounded canvas size, transparent hit testing, reduced motion, and zero paints after bursts settle. Screenshots go to `yhwh/var/tmp/yhwh/three/screenshots`.
