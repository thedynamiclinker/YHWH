# Interface

- Start with readable files and an editor, no vault or required narrative. Interface/editor/terminal default to 16/18/15px and remain configurable.
- The quiet grey “Need Some Help?” button opens the God and Man views of the desktop’s mounted sources. The mobile equivalent opens Files and backups.
- Settings use categories, switches, sliders, and bounded numbers; rc remains the advanced escape hatch. Preserve directory scope and handwritten rc.
- On desktop, single click selects and unfolds a folder. Double click or Enter enters it. On touch, tap a row to open it, tap the triangle to expand in place, and use the row menu for file actions. Keep filters and scroll positions per tab.
- Ctrl+L clears a focused terminal. From another pane it focuses the file location field. Explicit terminal actions focus the terminal when they reveal it.
- A shell launch inherits the caller’s directory. Launchers use **Settings → Files & editor → Default directory**. Desktop defaults to the user’s home. Mobile defaults to its storage root.
- Ctrl+Up/Down steps the terminal between hidden, split and vertically maximized. Ctrl+Right/Left does the same for the file manager. Add Shift+Alt for incremental resizing. **Settings → Keys** edits each shortcut and the resize step, with pixels on desktop and rows or columns in Shaddai.
- Use clear tool labels and restrained Unix-style marks, not decorative platform symbols. Keep the first screen quiet.
- The document pane uses Everforest and Noto typography. Markdown Live Preview, Source, and Reading share the six colors from `.obsidian/snippets/ld.css` in dark mode. Light mode uses deeper shades of the same hues for contrast. Markdown notes honor `font-serif`, `font-mono` (or `monospace`), and `large-text` in the frontmatter `cssclasses` field. Reading hides properties, preserves paragraph indentation, and centers images. The image classes `w50`, `w75`, and `w100` set their width.

- Desktop windows start as normal windows; do not force fullscreen or maximization. Autosave starts enabled, remains configurable, and preserves explicit Save/Save as.
- Markdown opens in Live Preview. Inline syntax becomes visible at the cursor and the document remains a single editable CodeMirror buffer. Ctrl/Alt+E toggles Source and Ctrl/Alt+R toggles Reading. Keep cursor, selection, undo and saved Markdown across all three modes. Click a link to edit it in Live Preview, Ctrl/Cmd+click or use Open link at cursor to follow it, and click directly in Reading.
- Background saves serialize per buffer, preserve the original newline, and flush when leaving the app or before replacing/closing documents without prompting on normal autosave. Pause on concurrent edits or errors. Never force an autosave over a changed or removed file.
- Each app tab owns at most one PTY. Ctrl+Shift+backtick and Ctrl+backtick toggle the terminal. Ctrl+Tab and Ctrl+PageUp/Down switch app tabs. Shell CLI opens route to the owning tab. The terminal header can switch to the Initial and back while the PTY keeps running.
- MIME file associations belong to the system: delegate non-text attachments, including images, media, spreadsheets and CSV/TSV, to the user’s preferred application. External opens preserve the current buffer and report launch failures. Keep only the optional read-only scrolling PDF preview; offer Ask / Preview here / System app and remember a choice for all PDFs. PDF Ctrl+click/double-click opens externally. Never execute document scripts, macros or formula text in previews.
- Trash actions await context-menu closure before opening confirmation, retain recoverability, and never fall back to permanent deletion. Provide full and relative path-copy actions.

## Directory shortcuts and folder actions

`~` opens home and `/` opens the current filesystem or folder-view root.
`@` starts at the tab’s opening directory. Use **Choose @ folder…** under `@`
or **Set as @** in a folder’s context menu to change it without leaving the
current directory. **Go to @** and `@/subdirectory` in the location field use
the new anchor. Closing the tab discards its anchor.

In a desktop tab’s shell, `@-get` prints the anchor and `@-set [DIRECTORY]`
sets it. Omitting `DIRECTORY` uses the shell’s current directory. The same
commands work as `yhwh @-get` and `yhwh @-set`, or inside the Initial.

Add menu items under `${YHWH_CONFIG_HOME:-${XDG_CONFIG_HOME:-$HOME/.config}/yhwh}/etc/folder-menu`.
A UTF-8 `.txt` file adds an item named after the file and displays its contents.
The bundled **Hello world** is one such file. Desktop also runs executable
files with the clicked folder as both the working directory and the first
argument. For example, save this as `Show folder` and run `chmod +x 'Show folder'`.

```sh
#!/bin/sh
printf '%s\n' "$1"
```

Reopen the menu to pick up changes. Android and iOS read `.txt` actions from
`/.yhwh/etc/folder-menu` under the app storage root.

## Universes

Use **New universe** in the Files pane to choose a starter. **Enter** opens the
selected universe directory. With no folder selected it uses the current directory.
**Chroot** opens a separate terminal for the guest shell. A universe starts as
an ordinary directory whose `.@` begins with `# un root`, the same marker
used by `un new`. The bundled **Empty** and **Lord workshop** starters work
offline. The workshop includes a TWO example, `un` recipes, and a `zan` manual page.

```sh
yhwh nu --list
yhwh nu workshop --template workshop
cd -- "$(yhwh cd workshop)"
yhwh nu ../alpine --template alpine
yhwh nu ../from-docker-hub --from docker.io/library/alpine:latest
yhwh go ../alpine --mount "$PWD" --mount-rw "$HOME/scratch" --sudo
```

On Linux, OCI imports use **Skopeo** and **umoci**. They download and unpack a
root filesystem for the host architecture without starting the image's
entrypoint. Specify a tag or SHA-256 digest to select an image version. The
Alpine, Nix, Gentoo and Arch choices add lord commands from `$YHWH_LORD_DIR/bin`,
`~/src/lord/bin`, or the directory containing `lord` on PATH. The Debian YHWH
choice includes Node and adds the YHWH CLI and its prefix files. Guest
interpreters and model providers follow the guest's own installation and login
setup. `lord` uses Bash, and `un` uses Python 3.

Go uses **Bubblewrap** and runs `/bin/sh` by default. Use `-- /absolute/command`
to run another guest command. Outer paths appear by basename under `/mnt/host`.
Use `--mount` for read-only access and `--mount-rw` to let the guest change a
host file or directory. Relative paths resolve from the outer working directory.
Mounts belong to the session. Use `--network` to share host networking.
`--sudo` permits a retry after an unprivileged namespace failure. This route
requires system-installed Bubblewrap, util-linux `unshare` and sudo. The guest
root identity maps to the invoking user, and sudo authenticates on the terminal.
Desktop Go offers both options in its dialog. Imported shell settings are
available inside the guest. The host skips imported directory prefixes.

Shaddai offers Nu, Cd and Go in Files and Commands. Its `:nu` and `:go` accept
the CLI arguments. The Obsidian plugin uses its vault for offline starters.
On Linux it delegates OCI imports and the Go dialog to the installed `yhwh`
command. Company and THWH open the shared desktop workflow from **File →
Universes**. Android and iOS create and browse offline starter directories
inside the app workspace. OCI import and Go require the Linux host.

## Editing keys

Use Ctrl on Linux and Windows or Cmd on macOS for editor formatting and search.
**Ctrl+B** and **Ctrl+I** toggle bold or italic in Markdown. **Ctrl+K** inserts a
Markdown link, **Ctrl+Shift+C** inserts a fenced code block, and
**Ctrl+Shift+Q** toggles a blockquote. **Alt+Up/Down** moves the selected lines
and **Alt+Shift+Up/Down** duplicates them. **Tab** and **Shift+Tab** indent and
outdent. **Ctrl+F** searches the active buffer. Click a Markdown task checkbox
in Live Preview to update the source. **Ctrl+B** keeps its terminal shortcut
outside the Markdown editor, and **Ctrl+backtick** opens the terminal from the editor.

## Syntax highlighting

The lower-right picker shows **Auto** and the language it found. Desktop uses
`xdg-mime`, with `file --mime-type` as a fallback. Both desktop and mobile use
known filenames and extensions, executable shebangs, and recognizable HTML,
XML, or JSON for files with generic types. Pick any listed language to override
highlighting in the open buffer. Use **Plain Text** to turn it off.

After choosing a language, open **Why?** to save an explanation locally. Use
the same form to make a language the Auto choice for a filename, extension,
or extension under the file's folder. The explanation is a record for review.
Auto applies explicit rules.

YHWH looks for `etc/editor/languages` under the system, user, and ancestor
`.yhwh` prefixes, in that order. The settings form writes to the user prefix,
normally `~/.config/yhwh` or `$YHWH_CONFIG_HOME`. Rules are UTF-8, one per line,
with tab-separated fields. Blank lines and comments beginning with `#` are
ignored. The last matching rule wins. A fourth field optionally limits a rule
to files under that absolute directory. Old `file_types` settings still work
and are applied before the flat rules.

```text
filename	notes	markdown
extension	logconf	properties files
extension	conf	nginx	/home/abe/sites
mime	text/x-tex	latex
```

Explanations go to `var/lib/editor/language-feedback.tsv` under the same user
prefix. Each row contains the UTC timestamp, path, MIME type, Auto language,
chosen language, and explanation. The rule and feedback files escape literal
backslashes, tabs, CR, and LF as `\\`, `\t`, `\r`, and `\n`.
Android and iOS store the same files in the app's private Library.
