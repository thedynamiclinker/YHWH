# Obsidian host zoom error during reload

Resolve the Obsidian host error `t.webContents.getZoomFactor is not a function`
reported by the real plugin UI check when the plugin is disabled and re-enabled.
The plugin loads and its navigation, editing, settings, WebGL and persistence
checks succeed. The same host error reproduces with the original committed
plugin assets and both locally available Obsidian versions, so it is not caused
by the source relocation. Keep the strict error assertion until the cause is
understood. Reproduce with `node yhwh/bin/default/headless.cjs
yhwh/src/yhwh-obsidian/test/obsidian-ui.cjs` (one shell command).
