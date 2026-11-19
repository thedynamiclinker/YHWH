# Interface

- Start with readable files and an editor, no vault or required narrative. Interface/editor/terminal default to 16/18/15px and remain configurable.
- The quiet grey “Need Some Help?” button opens the God and Man views of the desktop’s mounted sources. The mobile equivalent opens Files and backups.
- Settings use categories, switches, sliders, and bounded numbers; rc remains the advanced escape hatch. Preserve directory scope and handwritten rc.
- On desktop, single click selects and unfolds a folder. Double click or Enter enters it. On touch, tap a row to open it, tap the triangle to expand in place, and use the row menu for file actions. Keep filters and scroll positions per tab.
- Ctrl+L clears a focused terminal. From another pane it focuses the file location field. Explicit terminal actions focus the terminal when they reveal it.
- A shell launch inherits the caller’s directory. Launchers use **Settings → Files & editor → Default directory**. Desktop defaults to the user’s home. Mobile defaults to its storage root.
- Ctrl+Up/Down steps the terminal between hidden, split and vertically maximized. Ctrl+Right/Left does the same for the file manager. Add Shift+Alt for incremental resizing. **Settings → Keys** edits each shortcut and the resize step, with pixels on desktop and rows or columns in Shaddai.
- Use clear tool labels and restrained Unix-style marks, not decorative platform symbols. Keep the first screen quiet.
- Preserve the interface theme while coloring Markdown H2 text blue (#6d9eeb) and H3 text pale yellow (#ffe599), matching `.obsidian/snippets/ld.css`, in preview and source modes.

- Desktop windows start as normal windows; do not force fullscreen or maximization. Autosave starts enabled, remains configurable, and preserves explicit Save/Save as.
- Markdown opens in Live Preview. Inline syntax becomes visible at the cursor and the document remains a single editable CodeMirror buffer. Ctrl/Alt+E toggles Source and Ctrl/Alt+R toggles Reading. Keep cursor, selection, undo and saved Markdown across all three modes. Click a link to edit it in Live Preview, Ctrl/Cmd+click or use Open link at cursor to follow it, and click directly in Reading.
- Background saves serialize per buffer, preserve the original newline, and flush when leaving the app or before replacing/closing documents without prompting on normal autosave. Pause on concurrent edits or errors. Never force an autosave over a changed or removed file.
- Each app tab owns at most one PTY. Ctrl+Shift+backtick and Ctrl+backtick toggle the terminal. Ctrl+Tab and Ctrl+PageUp/Down switch app tabs. Shell CLI opens route to the owning tab. The terminal header can switch to the Initial and back while the PTY keeps running.
- MIME file associations belong to the system: delegate non-text attachments, including images, media, spreadsheets and CSV/TSV, to the user’s preferred application. External opens preserve the current buffer and report launch failures. Keep only the optional read-only scrolling PDF preview; offer Ask / Preview here / System app and remember a choice for all PDFs. PDF Ctrl+click/double-click opens externally. Never execute document scripts, macros or formula text in previews.
- Trash actions await context-menu closure before opening confirmation, retain recoverability, and never fall back to permanent deletion. Provide full and relative path-copy actions.
