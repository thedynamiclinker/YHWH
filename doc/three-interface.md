# Three is a theme beyond CSS

- Default and Three share the actual desktop, renderer, preload, file operations, config, plugins, editor, shell, chat and commands. New default features must reach Three automatically; never fork application behavior again.
- Three owns only decoration. Keep real text, selection, focus, hit testing and accessibility in the DOM. Never render the editor or terminal into a texture.
- Distortions may cross panel boundaries, but must be brief, optional and inert. Pause for typing, hidden windows and reduced motion. No idle render loop, full-screen blur pipeline, particle world or mandatory WebGL/software-renderer fallback.
- Cap active painting at 24 Hz, three bursts and 900,000 pixels. Check zero idle paints and the complete shared UI suite against both entry points.
- Read shared rc then rc.three per scope; save Three-specific preferences to rc.three. Route shell opens back to their originating interface and tab.
