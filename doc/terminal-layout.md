# Terminal layout

- A terminal docked to the right or left must have usable width and fill the available height. Moving it to the center or bottom must size it from its current container, rather than retaining a small side-panel box. Desktop and Three share this layout; mobile has no PTY panel.
- Fit xterm only when its active element has usable visible dimensions. A hidden ancestor must not resize the live shell to a tiny fallback grid. Send PTY resize messages only when rows or columns actually change, and refit after docking, revealing, expanding, and window resizing.
- Stop panel drops at the first accepting target. A drop must not bubble into the panel's former container and immediately move it back. Header controls must not initiate panel drags.
- Provide **Dock below** on a side/center terminal and **Dock terminal below document** in the command palette. Expanding the terminal also returns it to the main area, so a misplaced panel always has a visible recovery path.
