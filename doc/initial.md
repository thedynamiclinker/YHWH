# The Initial

The Initial is YHWH’s phone shell: a place to name, discover and combine the
things the app can already do. The Android and iOS apps retain the shared
editor, Markdown, tabs, settings, themes, inbox and character. A live file
manager adds list/tile layouts, selection, copy/cut/paste, rename, Trash, folder
navigation and creation. Existing import/share and conflict handling still apply.

Tap the small command-shelf button, or tap the configurable floating dot.
Holding the dot opens a sketch pad. Gestures are optional, user-trained,
continuous strokes, with a visible match to tap before execution. Similar or
unknown marks do not run an arbitrary command. Position and opacity are editable
under Initial → Guide → Gesture dot settings.

## Names and files

- **Initials** are aliases in `~/.initialrc`. Choose a Latin, Greek, Hebrew or
  Paleo tile. Paleo uses the bundled Phoenician Unicode font. Any other Unicode
  name may be entered too. Transliteration starts from the chosen letter;
  search names are editable and Reset restores the default. `愛` can have
  `ai`, `love` and `amor` as names for the same action.
- **Words** are ordinary UTF-8 files in `~/bin`. The basename is the command.
  The builder proposes an unused filename, so a keyboard is optional. Editing
  an existing Word retains its version and refuses concurrent overwrites.
- **Atomics**, presented as `/bin`, are the small in-app file/data commands.
- **Builtins**, presented as `/usr/bin`, are the app’s registered action IDs,
  discovered from the same command registry as the palette.

This is an in-app namespace. It does not replace Bash startup files, execute
native programs or load arbitrary JavaScript. Resolution is Initial/search name,
then `~/bin`, Atomics and Builtins. `/bin/pwd`, `/usr/bin/save` and `~/bin/name`
are also usable. On mobile, `~` is the ordinary app-owned `/YHWH` workspace;
on desktop it is the user’s home folder.

The generated rc format is readable, editable text, for example:

```sh
alias '愛' 'ls | view'
names '愛' 'ai' 'love' 'amor'
```

The UI regenerates this small rc file when saving an Initial; comments and
formatting are not preserved. Gesture templates are optional `gesture NAME
'[[x,y],…]'` lines. Reload by reopening the shelf after editing. Malformed rc
files produce an error, and can be repaired with the ordinary editor; failed
parsing never silently replaces them with defaults.

## Composition

Use **+**, **Argument**, **| Pipe**, **Then**, **$()**, **> Output** and
**#! Save Word** to build scripts without typing punctuation. Path pickers,
glyph pickers, command pickers and suggested new names make the basic workflow
usable without a keyboard or drawing. Typing, IME input and custom longer names
remain available.

```sh
mkdir journal
echo 'Where are you, Abe?' > journal/today.md
ls journal | view
```

Newlines and `;` sequence commands. `|` passes typed file records or text.
`>` and `>>` save or append output; `<` reads text input. Quoting protects spaces
and punctuation. `$()` substitutes command output as one argument; it never
reparses that output as executable syntax. `$HOME`, `$PWD`, `$PATH`, `$1`…`$9`
and `$@` are supported. `$@` is a single text argument in this initial dialect.
There is no globbing, control flow, job control or process shell.

Implemented Atomics: `pwd`, `ls`, `cd`, `mkdir`, `touch`, `cat`, `echo`, `cp`,
`mv`, `trash`, `grep`, `sort`, `head`, `wc`, `view`, `fm`, `open`, `chroot`,
`help` and `man`. `?`, `help COMMAND` and `COMMAND --help` describe commands.
`grep` performs literal case-insensitive matching. `cat` reads saved UTF-8
files; `open` uses the text editor, optional PDF preview or system attachment opener. File operations retain
exclusive creation, version checks and recoverable Trash.

`ls | view` makes a fixed graphical output tab. Its membership stays fixed
when files change; opening a listed item uses its current file. `fm .` makes
a live folder tab, refreshed on mutations, navigation, save, focus and resume.
The live and fixed views have distinct labels. Commands stop on the first error;
preceding changes are retained, as with a sequence of ordinary file operations.
Recursive aliases/Words and excessively long runs fail within bounded limits.

## Folder roots and AI setup

`chroot FOLDER` makes that directory appear as `/` for the current tab.
`chroot --leave`, the live view’s **Leave /** button, or the mobile menu’s
**Leave folder root** action restores the workspace. Navigation cannot climb
out of this view. This is a navigation convention, not OS confinement or new
permissions. Mobile Man/God choices create ordinary `Worlds/Man` and
`Worlds/God` folders; desktop mount overlays are not copied to phones.

**Connect YHWH** replaces the desktop-only Codex setup dead end with an
account guide, browser sign-in, a copyable device-login command and official
mobile/remote workflow instructions. It does not collect credentials, pretend
to finish OAuth, connect in-app chat, or sync files. The official guides are
[authentication](https://learn.chatgpt.com/docs/auth) and
[mobile Codex](https://developers.openai.com/blog/mastering-codex-remote-for-engineering).

## Invariants

The runtime is shared in `yhwh/lib/initial.mjs`; the shared renderer installs
the UI for desktop, Three, Android and iOS. Device I/O crosses existing bridge
operations. Never evaluate a Word with JavaScript `eval`, a native process,
or Bash merely because its notation resembles shell. Names belong to the user;
gestures, transliterations and keyboard input are alternate ways to find the
same action. The touch shelf is not installed in the TTY or Obsidian plugin;
those hosts retain their existing interfaces and can edit the same ordinary
text files. They do not yet execute this in-app dialect.

Native releases still need a rebuild and installation. Browser touch tests
cover phone/tablet layouts, alias/gesture training, no-keyboard Word composition,
versioned persistence, live/fixed views, folder roots and the connection guide.
Native keyboard/safe-area/OS lifecycle behavior still needs device verification;
iOS compilation requires macOS/Xcode.

Validation for this implementation: 88 shared/core tests; `make mobile-check`
including Android-phone, iPhone and iPad browser workflows; the full default
and Three Electron UI suites; and focused Initial smoke tests in both desktop
interfaces. The Android debug APK compiled successfully, its ZIP integrity was
checked, and all bundled web assets matched the shared build. The iOS project’s
copied web assets also matched. No adb device was connected; native iOS build
and physical-device tests were not performed on this Linux host.
