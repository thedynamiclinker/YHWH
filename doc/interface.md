# Interface

- Start with readable files and an editor, no vault or required narrative. Interface/editor/terminal default to 16/18/15px and remain configurable.
- The quiet grey “Need Some Help?” button presents only God and Man. Other worlds and jokes stay discoverable through commands and exploration; do not restore the native menu duplicate.
- Settings use categories, switches, sliders, and bounded numbers; rc remains the advanced escape hatch. Preserve directory scope and handwritten rc.
- Single click selects and unfolds folders without changing the directory or shell. Double click/Enter enters them. Arrow keys unfold/collapse; modifier clicks select.
- Ctrl+L clears/focuses a visible terminal from every surface; only a hidden terminal permits location focus.
- Use clear tool labels and restrained Unix-style marks, not decorative platform symbols. Keep the first screen quiet.
- Preserve the interface theme while coloring Markdown H2 text blue (#6d9eeb) and H3 text pale yellow (#ffe599), matching `.obsidian/snippets/ld.css`, in preview and source modes.

- Desktop windows start maximized (with normal desktop window controls). Autosave starts enabled, remains configurable, and preserves explicit Save/Save as.
- Markdown opens in source; only a button/shortcut toggles the separate preview. Preserve cursor, selection, undo and document text across toggles; never restore live block replacement.
- Background saves serialize per buffer, preserve the original newline, and pause on concurrent edits or errors. Never force an autosave over a changed or removed file.
- Terminal tabs own independent PTYs. Ctrl+Shift+backtick creates one; focused Ctrl+PageUp/Down or Ctrl+Tab switches shells. Shell exit removes its tab; reopening after the last exit creates a usable shell. Shell CLI opens route to the owning app tab.
- File viewers are read-only, preserve original files, and show honest format/codec/size limits with external-open fallback. Never execute document scripts, spreadsheet macros, or formula text.
- Trash actions await context-menu closure before opening confirmation, retain recoverability, and never fall back to permanent deletion. Provide full and relative path-copy actions.
