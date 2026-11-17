# Interface

- Start with readable files and an editor, no vault or required narrative. Interface/editor/terminal default to 16/18/15px and remain configurable.
- The quiet grey “Need Some Help?” button presents only God and Man. Other worlds and jokes stay discoverable through commands and exploration; do not restore the native menu duplicate.
- Settings use categories, switches, sliders, and bounded numbers; rc remains the advanced escape hatch. Preserve directory scope and handwritten rc.
- Single click selects and unfolds folders without changing the directory or shell. Double click/Enter enters them. Arrow keys unfold/collapse; modifier clicks select.
- Ctrl+L clears/focuses a visible terminal from every surface; only a hidden terminal permits location focus.
- Use clear tool labels and restrained Unix-style marks, not decorative platform symbols. Keep the first screen quiet.
- Preserve the interface theme while coloring Markdown H2 text blue (#6d9eeb) and H3 text pale yellow (#ffe599), matching `.obsidian/snippets/ld.css`, in preview and source modes.

- Desktop windows start as normal windows; do not force fullscreen or maximization. Autosave starts enabled, remains configurable, and preserves explicit Save/Save as.
- Markdown opens in source; only a button/shortcut toggles the separate preview. Preserve cursor, selection, undo and document text across toggles; never restore live block replacement.
- Background saves serialize per buffer, preserve the original newline, and flush when leaving the app or before replacing/closing documents without prompting on normal autosave. Pause on concurrent edits or errors. Never force an autosave over a changed or removed file.
- Each app tab owns at most one PTY. Ctrl+Shift+backtick toggles the terminal like Ctrl+backtick; Ctrl+Tab and Ctrl+PageUp/Down switch app tabs from any pane. Shell exit disposes the terminal and hides its panel immediately; reopening creates a usable shell. Shell CLI opens route to the owning app tab.
- MIME file associations belong to the system: delegate non-text attachments, including images, media, spreadsheets and CSV/TSV, to the user’s preferred application. External opens preserve the current buffer and report launch failures. Keep only the optional read-only scrolling PDF preview; offer Ask / Preview here / System app and remember a choice for all PDFs. PDF Ctrl+click/double-click opens externally. Never execute document scripts, macros or formula text in previews.
- Trash actions await context-menu closure before opening confirmation, retain recoverability, and never fall back to permanent deletion. Provide full and relative path-copy actions.
