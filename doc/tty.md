# el shaddai

- `make tty` builds and opens the ranger-like terminal interface, named
  `el shaddai`. The default editable definition of `shaddai` is exactly
  `Nobody knows. Maybe mountains or ttys.` Personal edits persist outside the
  workspace; shipped copy lives in `yhwh/etc/tty/words.json`.
- Keep terminal file operations, hierarchical rc, shell host, read-only chat and
  verse storage connected to the existing shared services. Do not silently relax
  their save-conflict, permissions, symlink or backend-error behavior.
- Preserve each tab's buffer and shell across navigation and hiding panes.
  Dirty documents require a save/discard decision before replacement or closure.
  Shell Ctrl+C/D belong to the shell; Ctrl+Q quits the interface. Paste is atomic
  text and must never trigger application shortcuts.
- Keep all terminal actions discoverable through the command palette. Rich DOM
  plugins and spatial effects may remain specific to the desktop; document such
  differences in the terminal guide.
