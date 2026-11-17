# File moves and PDF scrolling

- PDF previews scroll continuously through every page. Page navigation and zoom remain available above the scroller; scrolling keeps the page indicator current. Render nearby pages and release distant canvases rather than rasterizing an entire document at once.
- File-manager rows support moving files, folders and selections by dragging onto a folder, `..`, an expanded folder's empty area, or the current directory's background. Dragging a selected folder and its descendants moves the folder once.
- Dropping into the same directory is a no-op. Reject self/descendant moves and existing destinations; never silently replace or merge destination data.
- Moves, renames and cut/paste preserve open editor buffers, selections and undo history. Remap open descendant paths, directory tabs, folder expansion and navigation history. Pause autosave during moves and retain conflict detection against external edits.
- Desktop and Three share native drag behavior. Android and iOS share a hold-to-drag touch adapter; swiping before the hold scrolls normally. Keep the Move to folder action available for choosing destinations without dragging.
- Obsidian uses its native PDF viewer and vault file manager for moves. Its navigator supports desktop drag targets; hosts without touch drag retain Rename or move. The TTY retains keyboard moves and opens PDFs through the graphical host.
