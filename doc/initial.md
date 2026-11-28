# The Initial

The Initial is YHWH’s tile shell on Android, iOS, and desktop. On a phone, tap
the command button or the floating dot. On desktop, the regular terminal opens
first. Use **Terminal ▾ → Initial** in the terminal header to switch, or open
**Initial** from the command palette. The desktop shell keeps running while the
tile surface is visible.

The launcher shows four locations in order:

| Section | Unix equivalent | Contents |
| --- | --- | --- |
| Atomics | `/bin` | Small commands for files and text |
| Builtins | `/usr/bin` | Commands registered by YHWH |
| Letters | `~/.bashrc` | Short names and optional gestures. YHWH stores these in `~/.initialrc`. |
| Logos | `~/bin` | Reusable scripts saved as ordinary UTF-8 files |

Tap a tile to try it. The upper pane shows `/dev/stdout`, file listings, or
an app menu. **Open in workspace** opens a result as a regular tab or dialog.
The shell options menu can open app actions in the workspace by default.
Switch between icons and a list beside the command search. Type to find
commands, or press Enter to run a typed command with arguments.

Drag a tile from the launcher into the upper pane to start a script. The first
tile goes in the top-left square of a 5×5 grid. Subsequent tiles can go in
any open square. Adjacent commands on a row pass output from left to right
through a pipe. Rows run from top to bottom as separate commands. Blank squares
and rows are ignored. Drag existing tiles to move or swap them. Use **＋**
and select a square to place commands without dragging. Select an occupied square
and choose **Edit tile** to change its arguments or flags. Choose **Remove** or
drag a tile back to the launcher to remove it. Changes rerun the script preview
in `/dev/stdout` above the grid. Directory changes in a preview apply within the
script. Use **Run** to write files or invoke app actions. **Save Logos** names
the script in `~/bin` and puts it in the launcher. Grid files contain ordinary
commands and a comment with the tile positions. If text edits change the
commands, the file opens in the text composer.

**Let there be Logos** opens the tutorial with the exact text of
[LOGOS.md](../yhwh/src/yhwh-default/src/LOGOS.md) and loads its two pipelines onto the grid.
Fresh setups get Γ, Ꞁ, L, ᒧ and the bundled `demos` Logos. The ᒧ tile can also
be called by the name ⅃ used in the example. The first row sorts a directory
listing. The second writes “Logos Demos.” Existing `~/.initialrc` files keep
their Letters. Saving a Logos creates a real file and refuses stale edits.

Draw directly from the floating dot at mid-screen. The trace stays over the
workspace. The Initial asks you to confirm a matching Letter before running it.
To train a gesture, open a Letter’s details, choose **Edit**, and use **Train
gesture** under its advanced options. The Guide includes dot position and
opacity settings.

This is an in-app namespace. It does not replace Bash startup files, execute
native programs or load arbitrary JavaScript. Resolution starts with a Letter or one of its search names, then checks
`~/bin`, Atomics and Builtins. `/bin/pwd`, `/usr/bin/save` and `~/bin/name`
are also usable. On mobile, `~` is `/`, the root of the app’s storage. On
desktop it is the user’s home folder.

The generated rc format is readable, editable text, for example:

```sh
alias '愛' 'ls | view'
names '愛' 'ai' 'love' 'amor'
```

The UI regenerates this small rc file when saving a Letter. comments and
formatting are not preserved. Gesture templates are optional `gesture NAME
'[[x,y],…]'` lines. Reload by reopening the shelf after editing. Malformed rc
files produce an error, and can be repaired with the ordinary editor; failed
parsing never silently replaces them with defaults.

## Text composer

Open **Text composer** from the shell options, then use **+ Command**, **Argument**, **| Pipe** and
**Then** to build a command. **More tools** holds **$()** and **> Save output**.
Run the draft directly or use **#! Save Word** to save it in `~/bin`.
Path pickers, glyph pickers, command pickers and suggested new names make the basic workflow
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

Implemented Atomics: `pwd`, `cwat`, `un`, `ls`, `cd`, `mkdir`, `touch`, `cat`, `echo`, `cp`,
`mv`, `trash`, `grep`, `sort`, `head`, `wc`, `view`, `fm`, `open`, `chroot`,
`help` and `man`. `?`, `help COMMAND` and `COMMAND --help` describe commands.
`grep` performs literal case-insensitive matching. `cat` reads saved UTF-8
files; `open` uses the text editor, optional PDF preview or system attachment opener. File operations retain
exclusive creation, version checks and recoverable Trash.

`ls | view` makes a fixed graphical output tab. Its membership stays fixed
when files change; opening a listed item uses its current file. `fm .` makes
a live folder tab, refreshed on mutations, navigation, save, focus and resume.
Tap **Select** in either file view to copy, cut, paste, rename or trash files.
Commands stop on the first error. Earlier changes stay in place.
Recursive aliases/Words and excessively long runs fail within bounded limits.

## Shell files

**--prefix** shows `@` and the user prefix. **bin**, **lib**, and **etc**
open the directories at `@`. The prefix panel also opens their user-prefix
counterparts. **etc/profile** opens the user’s sourceable configuration file.
Desktop **PATH** shows the shell’s search path, and search also finds its
aliases, functions and executable names. **Run in shell** sends the entered
command to the current PTY, where pipelines, `.`, `chmod`, and `sudo` work as
usual. Shaddai uses the same startup files and hooks.

The user prefix defaults to `~/.config/yhwh` and honors `YHWH_CONFIG_HOME`
and `XDG_CONFIG_HOME`. Edit its `etc/profile` to configure the shell.

```sh
yhwh_home_rc=yes             # Source ~/.bashrc or ~/.zshrc on startup
yhwh_at_rc=.yhwh/etc/at      # Source this file at @ when it exists
yhwh_bin=bin                 # Relative to @. An absolute path decouples it.
yhwh_lib=lib
yhwh_etc=etc
yhwh_cd() { printf 'cd %s → %s\n' "$2" "$1"; }
```

`cwat --reload` re-sources `etc/profile` and applies the current prefix.
The tab shell prepends the user’s `bin` and the active `@/bin` when present.
Set `yhwh_at_path=no` to opt out of the automatic @ entry. Use
`yhwh_enter NEW OLD` and `yhwh_leave OLD NEW` for prefix-specific shell state.
Bash and Zsh retain shell functions and aliases across directory changes.
Use `yhwh_leave` to undo assignments your @ startup file makes when needed.
The Linux guest uses its own `/etc/yhwh/profile`. Android and iOS can edit
prefix files for use on a Unix host and run their in-app commands locally.

## Folder roots and AI setup

`chroot FOLDER` makes that directory appear as `/` for the current tab.
`chroot --leave`, the live view’s **Leave /** button, or the mobile menu’s
**Leave folder root** action restores the workspace. Navigation cannot climb
out of this view. This is a navigation convention, not OS confinement or new
permissions. Mobile Man/God choices create ordinary `Worlds/Man` and
`Worlds/God` folders; desktop mount overlays are not copied to phones.

On mobile, **Talk to YHWH** provides offline help about the current folder,
notes, files and Logos. **Connect Codex** opens the sign-in and remote workflow
guide. Desktop uses its existing Codex conversation. The official guides are
[authentication](https://learn.chatgpt.com/docs/auth) and
[mobile Codex](https://developers.openai.com/blog/mastering-codex-remote-for-engineering).

## Invariants

Desktop, Three, Android and iOS share the Initial runtime and UI. Device I/O
uses the filesystem bridge. The Initial interpreter runs in-app commands.
**Run in shell** uses the desktop terminal for native programs. Shaddai and the Obsidian
plugin can edit the same scripts as ordinary text.

Android and iOS source changes ship with a new native build. The browser
suite exercises the touch interactions at phone and tablet sizes.
