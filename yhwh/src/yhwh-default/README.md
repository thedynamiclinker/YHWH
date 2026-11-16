# YHWH

Toward a pro-human AI apocalypse. An Electron desktop editor with an ordinary filesystem, an Obsidian-shaped interface, and an opinionated deity in the margins.

Build, install and launch commands are defined in [the application guide](../../README.md).

## Working in the app

Each **app tab** owns one current directory, one persistent shell, and zero or one open document. There are no separate terminal tabs or editor tabs inside it. Moving around the filesystem leaves the document open. New app tabs inherit the directory and start a fresh shell.

| Operation | Default shortcuts |
| --- | --- |
| Show/hide files | Ctrl+E |
| Expand/restore files in the focus area | Ctrl+D |
| Show/hide terminal | Ctrl+B, Ctrl+backtick, Alt+Shift+T |
| Expand/restore terminal | Ctrl+Shift+B |
| Show/hide files and terminal together | Ctrl+Shift+D |
| Focus editor / files / terminal | Ctrl+1 / Ctrl+2 / Ctrl+3 |
| New / close app tab | Ctrl+T / Ctrl+W |
| Next / previous tab | Ctrl+Tab / Ctrl+Shift+Tab; Ctrl+PageDown / PageUp |
| Parent directory | Alt+Up; Left or Backspace in the file list |
| Back / forward | Alt+Left / Alt+Right |
| Type a directory path | Ctrl+L |
| New file / open file | Ctrl+N / Ctrl+O |
| Choose a directory | Ctrl+Shift+O |
| Save / Save as | Ctrl+S / Ctrl+Shift+S |
| Cycle hybrid / reading / source; format JSON/HTML | Ctrl+R (also Ctrl+Shift+E) |
| Commands | Ctrl+P, Ctrl+Shift+P |
| Settings / help | Ctrl+, / F1 |

On macOS the primary Ctrl shortcuts also accept Command. Every app command is also available in the command palette; common operations have buttons and native menu entries. Hold Alt to expose the native menu on Linux/Windows. Escape restores an expanded pane.

The file manager supports double-click/Enter to open, arrow keys, type-to-select, filtering, Ctrl/Shift selection, Ctrl+A, copy/cut/paste, new directories, F2 rename, and desktop Trash. Its `..` row and up button always work. Expanded mode shows sizes and modification dates. Drag the divider to resize it. Ctrl+H toggles hidden files while the file manager has focus; the text editor retains its own search/replace shortcuts.

The terminal is an xterm.js terminal connected to a real node-pty shell. It starts even when hidden. A Bash/zsh/fish/PowerShell prompt hook reports the shell's directory; Linux also reads the shell process's actual cwd. The app preserves normal Bash/zsh startup files. File-manager navigation sends a quoted `cd` at the prompt. If a command is running, the most recent navigation waits for the next prompt. Shells without a supported hook have Linux cwd reporting but cannot accept queued file-manager navigation until a prompt hook is supplied. SSH sessions navigate their remote filesystem separately.

`yhwh open file` from an app shell targets that same tab through `YHWH_TAB`. In an unrelated shell it opens an app tab. Hiding a shell keeps its process running; closing its app tab terminates it.

## Documents

Text uses CodeMirror with syntax highlighting, undo, search, selection, and standard editing keys. Markdown defaults to **Hybrid**: blocks render until selected for editing. Ctrl+R cycles Hybrid → Reading → Source → Hybrid while retaining unsaved edits. Clicking a rendered link opens it without moving the editor selection. Markdown links, local images, and `[[relative/note|label]]` links are supported; a wikilink can omit `.md`. JSON's pretty action validates and indents JSON; HTML uses Prettier. Formatting changes the buffer and is undoable. Save writes it to disk.

Click the big filename heading to rename the real file, including its extension. It refuses an existing destination. Saves preserve symbolic links and Unix permissions and reject a file whose modification time changed since opening. Reload or explicitly choose Overwrite from the file menu after reviewing a conflict. Unsaved changes prompt before replacing a document, closing a tab, or quitting. Saving is explicit, with Ctrl+S; there is no background autosave.

Filename, desktop MIME detection, and shebang determine highlighting. Extensionless files are not assumed to be Markdown. The bottom-right language menu can override the result just for the open file, for a filename, or for an extension, globally or under the current directory.

Images have a basic preview. PDFs, binary/non-UTF-8 files, and files over 16 MiB are offered to the desktop's default application; they are never silently decoded and overwritten as text. Rich PDF editing, arbitrary HTML execution, remote image fetching, backlinks/indexing, and a complete Obsidian CLI/API are not implemented.

## Hierarchical configuration

All of these are optional:

1. `/etc/yhwh/rc`
2. `${XDG_CONFIG_HOME:-~/.config}/yhwh/rc`
3. `.yhwh/rc` in ancestors, from the filesystem root down to the current directory (and a matching file-specific section)

Browsing never creates a `.yhwh`, `.obsidian`, or other metadata directory. Chromium's application state lives under the user config directory's `state/`, or `YHWH_DATA_DIR`. Override the config directories with `YHWH_CONFIG_HOME` or `YHWH_SYSTEM_CONFIG`.

An unindented line is a path. Its indented lines are ordinary Bash statements. Comments and empty lines work. A scope applies to itself and descendants, using complete path components. Within one file, general scopes run before specific scopes; equally specific scopes run in source order. Later files override earlier files. A child local config wins over an ancestor.

```sh
# ~/.config/yhwh/rc
/
    theme='yhwh'
    energy=100
    font_size=16
    show_hidden=false
    stylesheet='themes/my-theme.css'
    plugins='["plugins/my-plugin"]'

$HOME/Desktop
    title='Desktop — what are we making?'
    bg="$IMAGES/wallpapers/bg.png"
    font_size=18

$PRIVATE/nothing-to-see-here
    bg="$(find "$STUFF/screenshots" -name '*.png' | shuf -n 1)"
```

A local `.../secret/.yhwh/rc` can use relative scopes and paths:

```sh
.
    font_size=17

supersecret/pics
    bg='supersecret/pics/boop.png'
```

For local configs, relative scopes, relative assets, and shell commands use the **directory containing `.yhwh`** as their base. For system/user configs, they use the config directory. Environment expansion comes from the app's launching environment. Commands run with the user's normal permissions, not elevated permissions. No config is executed through sudo.

Bash is the evaluator, rather than an imitation shell language. `set -a` exports assignments to subsequent matching sections/files; command substitutions and commands work. `yhwh_name` can be used instead of `name`; a mangled name wins over the plain name in one layer. Launch-environment `yhwh_*` values override config files. Internal evaluator variables are prefixed `__yhwh_`. Shell errors become visible configuration warnings. Shell evaluation has a five-second/one-MiB limit. Treat rc files as shell startup code: on Unix they must belong to you or root and must not be group/world-writable. Root never executes an ordinary user's rc.

Evaluation is cached until a scope, rc file, or referenced stylesheet/background changes. Commands are startup/configuration hooks, not a command that runs on every keystroke. Settings → Reload configuration forces another evaluation. Backgrounds are local images. Theme CSS is read locally and can use the common Obsidian variables/classes (`--background-primary`, `--background-secondary`, `--text-normal`, `--text-muted`, `--text-accent`, `.theme-dark`, `.workspace`, `.workspace-leaf`). Existing Obsidian themes can be used as a starting point; selectors for Obsidian-specific widgets do not all apply.

Settings saves ordinary sections to user `rc`, preserving handwritten sections and comments. Choose Everywhere or the current directory. More-specific rules still win. Edit the rc to remove old rules. Additional settings include:

```sh
/
    editor_font="'DejaVu Sans Mono', monospace"
    sidebar_width=280
    terminal_height=260
    live_preview=true
    file_manager=true
    terminal=false
    line_width='820px'
    file_types='[{"extension":"note","language":"markdown"},{"filename":"^boop$","language":"python"}]'
    settings_fields='theme,energy,font_size,editor_font,show_hidden,stylesheet,plugins,layout'
    layout='{"files":"left","terminal":"bottom"}'
```

`settings_fields` determines which settings the menu presents. Arbitrary additional assignments are available in the resolved config; plugins can define their own conventions. `yhwh config /some/path` prints the effective settings, sources, and warnings.

## Plugins and layout

`plugins/hello-world/main.js` is a working example: a command, a movable panel, editable character text, and cleanup. Find **Hello, world** or **Show hello-world plugin panel** in Commands. It is bundled and loaded by default; its panel starts hidden.

User plugins are directories with a `main.js` ES module, listed in `plugins` in rc. A module exports a function receiving the app API and returns a cleanup function:

```js
export default function (app) {
  const removeCommand = app.addCommand({
    id: 'my-command', name: 'My command',
    run: () => app.notice(`Current directory: ${app.getFocus().cwd}`),
  });
  const panel = app.addPanel({
    id: 'my-panel', title: 'My panel', area: 'right',
    render(element) { element.textContent = 'An ordinary DOM element.'; },
  });
  const removeCSS = app.injectCSS('.my-class { color: var(--text-accent); }');
  const unsubscribe = app.on('open', file => console.log(file.path));
  return () => { unsubscribe(); removeCSS(); removeCommand(); panel.remove(); };
}
```

API: `addCommand`, `addPanel`, `movePanel`, `injectCSS`, `notice`, `editWords`, `getFocus`, `getEditor` (CodeMirror), `openFile`, `navigate`, `on`, and `files.read/save`. Events: `tab`, `focus`, `navigate`, `open`, `change`, `save`. Panels use `left`, `right`, `center`, or `bottom`. Core panel IDs are `files`, `document`, and `terminal`. Drag a panel's header onto another area, or use `movePanel`/the `layout` config. Dragging is for the current session; put a layout in rc to keep it. Plugins can use ordinary DOM/CSS/HTML and the same editor API as the app.

Each module is loaded from a local source blob; bundle dependencies into that module (relative module imports are not resolved against its directory). Reload configuration to reload plugins. Plugins are trusted local code with access to this app's UI and explicit disk operations; install code you are willing to run. The renderer itself has no Node integration. Existing Obsidian JavaScript plugins are not binary/API compatible: port them to this small API. This intentionally avoids recreating vault machinery to fake compatibility.

## Personality, help, and Offerings

The original Paleo-Hebrew font and purple/charcoal presentation remain. The title bar's YHWH-ness slider sets 100 for YHWH, 1–99 for Nietzsche, and 0 for monochrome Dawkins. **In the margins** starts hidden in YHWH mode. Its left-ribbon widget opens a focused reading surface showing a random Genesis verse, Nietzsche Family Circus in Nietzsche mode, and is hidden in Dawkins mode. The refresh button chooses another verse or pairing; the minus/plus button collapses the box and remembers your choice. Circus fetches the original site's current cartoon/quote and credits the pairing. Network failure leaves the editor working.

Character writing is based on sampled passages of the user's *We The Nameless*, especially Genesis 3 and 18 and Exodus 3: embodied curiosity, interruptions, bargaining, grand promises, and occasional regret. Routine controls keep their ordinary names.

Character copy lives in **`yhwh/etc/default/words.json`**. The small pencil beside each passage edits that configuration file directly; the footer text is itself an edit button. These are source edits, not user-local text overrides. A read-only installed copy reports a write error; use a writable development checkout to edit installed default text. The upgrades advertisement is editable and preserves the requested wording. No subscription, dating service, sync service, or pre-order checkout is implied by it.

Edited character text preserves line breaks and blank lines, including on the welcome screen and in dialogs. Text remains plain text; Markdown documents retain their own rendering rules.

## Book verses and citations

Use **In the margins** in the tool ribbon, then **Browse** in the verse box, or **Browse We The Nameless · chapter and verse** in Commands. Choose a book, chapter and verse, type a reference such as `Genesis 18:1`, or use Previous/Next across chapter boundaries. All 50 Genesis chapters are available. Other imported books remain locked for future progression. Combined and split labels retain their manuscript form: `Genesis 2:7` displays the 6–7 block; `Genesis 49:24` displays 24a and 24b. Numbering follows the source book.

Bundled display markup and fonts come from the book’s ebook renderer (`bin/import-verse-style.py`), preserving source colors and historical scripts, including green Paleo-Hebrew J. Cards follow `master.tex`'s horizontal `\Verse` layout: reference between rules, English left, original text right, commentary below. Each card has its own Commentary disclosure and an inline editor. Edits save in the app profile's `verse-commentary.json` and survive relaunch and import refreshes. Empty commentary can be added, edited commentary can be cleared, and **Restore book commentary** removes the local edit. Inbox letters and the optional walk use these same cards beneath their literary adaptations.

The bundled `yhwh/etc/verses/we-the-nameless.json` contains 10,196 blocks from 340 matching `.tex` files. Each record includes readable text, the four exact raw TeX fields, book/chapter/label, stable identity, source file/line, and combined/split numeric lookup information. A source manifest records file hashes and counts, including files with no verses. Alternate `14-raw.tex` and apocryphal blocks are retained; ordinary browsing and random selections use the main chapter files. Display text transcribes TeX formatting, lists and footnotes into plain text; raw TeX preserves the manuscript's full formatting and content.

To refresh the import from the vault root:

```sh
node yhwh/bin/import-verses.cjs
# Optional explicit source and output paths:
node yhwh/bin/import-verses.cjs '/path/to/We The Nameless' /path/to/verses.json
```

Normal builds and installed copies use the bundled JSON without access to the book checkout. Layout and control copy live in `yhwh/etc/default/text-verses.json`. Plugins can embed the same component or open its browser:

```js
element.append(await app.createCitation('Genesis 18:1', { commentary: false, compact: true }));
await app.showVerse('Genesis 28:16–17');
```

The command palette’s About Us link opens `thedynamiclinker.com`. About YHWH links to *Genesis* by The Nameless at the supplied Amazon URL. Offerings has two deliberately unfinished integrations:

- **Burnt Offering:** an in-app setup guide with Stripe signup, account/bank activation, and Payment Link links. It follows [Stripe's Payment Links guide](https://docs.stripe.com/payment-links/create) and [account activation guide](https://docs.stripe.com/get-started/account/activate). After testing and activation, set `stripe_payment_link='https://buy.stripe.com/…'` in rc to expose the external payment button. No secret key is stored in the app. The app does not verify purchases or grant upgrades.
- **Piece Offering:** a native file picker prepares a draft addressed to `yhwh@thedynamiclinker.com` in the user's email app. The user must attach the chosen file and send it. A mailto cannot attach a local file portably. This stub never uploads a file or sends mail. A real upload endpoint can replace this one operation later.

## CLI, installation, and implementation

See [the application guide](../../README.md) for editable and standalone npm installations.

There is one implementation of file operations (`yhwh/lib/files.cjs`) and one config evaluator (`app/config.cjs`) shared by GUI and CLI. Electron's main process owns filesystem/native dialogs/windows; the preload exposes explicit operations. The renderer owns app tabs, CodeMirror buffers, xterm displays, commands, and panel DOM. A small external Node process owns PTYs so node-pty runs with the Node ABI npm built it for instead of Electron's different ABI. No Electron addon rebuild is needed. Shared libraries, support programs, configuration and assets belong to the containing `yhwh/` application.

```sh
make test                 # Config, file operations, CLI, completion, real PTY sync
make test-ui              # Electron UI with isolated temp files/config/state
make test-ui-headless     # Same UI checks on a temporary Xvfb display
make check                # Both
```

The UI checks cover Markdown editing/renaming, pane toggles, app tabs, shell sync, CLI routing, JSON/HTML formatting, detection and overrides, plugins and movement, personality, source-copy editing, offering stubs, persisted settings, and compact layout. Screenshots go to `yhwh/var/tmp/yhwh/default/screenshots/`. Tests restore edited source copy and never send email or collect payments.

## Need Some Help? and the mounted file views

The single grey “Need Some Help?” button in the status bar opens Man and God, with confirmation before opening a new file-view tab rooted at the checkout’s `mnt/root` or `mnt/yhwh`. `mnt/we` overlays both roots at the same relative paths; shared entries take precedence on collisions, and directories merge. Files stay in their source trees, so reopening reads current content. Parent navigation stops at the selected view root. This is an app file view, not an OS chroot; terminals keep the user’s permissions. Return to ordinary files exits the view.

The command palette also exposes fan mail, an email composer for `root@thedynamiclinker.com`, and the Sinai and Horeb book lists. Preparing email opens a draft in the configured desktop mail app; sending remains in that app. The book lists are parsed on each opening from their original Markdown files, including the Genesis link; unlinked titles are marked coming soon.

Edit character copy and new feature labels in `yhwh/etc/default/words.json`, using the existing pencil controls or the command palette’s Edit feature copy command. Layout templates and command labels are in `text-renderer.json`; main-process copy is in `text-main.json`. Fan-mail excerpts, attributions, and source links live in `fan-mail.json` and have an in-app edit button. Both book lists have edit buttons that open their original Markdown sources. Preserve this separation when extending these features.

## Abe, seed, and desktop launchers

YHWH calls the user Abe, including in chat. Name corrections are part of his
fictional forgetful naming bit. The inbox brings occasional seed promises during
real work, respecting its switch, mode limits, and five-minute delivery interval.
These letters stay inside the app. Character text, letters, the buried land
registry, team, roadmap, and donation copy are editable in `words.json`.

The status bar’s **Seed funding** button asks for a donation, without equity or
promised returns, and includes the collected Carlin excerpt. It only opens a
payment page when `stripe_payment_link` is configured; otherwise it says checkout
is not connected. About YHWH → About Us contains Our Team and Roadmap.

From the repo root, `make develop` installs a **YHWH (Development)**
launcher for the live checkout. `make install` installs the standalone package
and a **YHWH** launcher. Both use 曰: light on dark for development,
dark on light for the installed app. Both use the workspace where Make was invoked;
development uses its own app profile. Source `.desktop` templates and scalable
曰 icons live in root `usr/share/`. Installation writes resolved
entries, icons, and launch scripts under `XDG_DATA_HOME` (default
`~/.local/share`) without relying on an interactive shell’s PATH. Modified
launcher files are preserved on update/removal.

Inbox uses a newest-first message list. Click a letter to read it, then return with **← Inbox**. Opening the list leaves unread letters unread. Inbox and conversation occupy the central reading area, alongside file-manager and terminal navigation; **Focus document** returns to the preserved editor buffer.

Between 22:00 and 06:00 on the device’s clock, actual use advances four letters
about 曰: the linked explanation, “Get it?”, “LOOK AT IT!”, and the drunken
“I’M YUE!” return. They share the five-minute delivery limit and inbox/mode
controls, and keep their order across restarts. No letters arrive while the app
is closed or hidden, and no external email is sent. Wording lives in `words.json`;
the shared delivery model is `lib/presence.cjs`.

An additional thirteen-letter startup pitch becomes eligible from 21:17 through
06:12: seed decks, a celestial org chart, Milky Abe, frantic pivots, broken typing,
then the morning after. It shares the existing activity and spacing rules;
unfinished letters continue on later nights. Bodies remain editable in `words.json`.

In **Inbox → ⚙ → Sender controls**, the collapsed sender section lets you block
`yhwh@thedynamiclinker.com`. Existing letters remain. His three follow-ups arrive
from `jewvacation@gmail.com`, `yhwvacation@gmail.com`, and `admin@yahoo.com`, with
an imaginary Yahoo acquisition. Remaining night mail uses the alternate addresses.
The block, sequence and read state survive restarts; **Settings → Presence →
Inbox messages** still silences all senders. `lib/inbox.cjs` supplies this shared
arc and routing for desktop, Three and mobile.
