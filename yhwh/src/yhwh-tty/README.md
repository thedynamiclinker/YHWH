# el shaddai

**shaddai**: Nobody knows. Maybe mountains or ttys.

`make tty` at the workspace or application root builds and opens the terminal
interface. `OPEN=PATH` opens a particular file or directory; `WORKSPACE=PATH`
sets the working directory. After building, use `yhwh tty`, `yhwh open tty`,
`yhwh-tty`, or `el-shaddai`. With no controlling terminal the launcher tries
the installed desktop terminal launcher. It needs Node and the same npm
dependencies as YHWH; it does not need Electron or a graphical display.

The parent directory, current directory, and preview form ranger-style columns.
On narrow terminals the parent column folds away. Each app tab owns a directory,
document buffer and persistent PTY shell. The shell stays alive when hidden.
Colors, mouse navigation, scrollback, alternate-screen programs, terminal resize
and bracketed paste are supported. Shift+Tab moves between panes; Escape returns
to files. Ctrl+P exposes all commands and F1 lists shortcuts.

| Action | Keys |
| --- | --- |
| Move / enter / parent | h j k l, arrows, Enter, Backspace |
| Filter / hidden files | /, . |
| Select / copy / cut / paste files | Space, y, x, p |
| New file / directory / rename / Trash | a, A, F2, D |
| Open / save / new document | Ctrl+O, Ctrl+S, Ctrl+N |
| Find / undo / redo | Ctrl+F, Ctrl+Z, Ctrl+Y |
| Cycle Markdown hybrid / reading / source | Ctrl+R |
| Toggle shell / files | Ctrl+B, Ctrl+Shift+E (terminal permitting) |
| New / close / switch tabs | Ctrl+T, Ctrl+W, Alt+Left/Right |
| Clear visible shell / enter location | Ctrl+L |
| Shell scrollback | Shift+PageUp/Down or mouse wheel |
| Quit | Ctrl+Q, F10, q in files |

The editor supports Unicode, multiline paste, cursor movement, undo/redo, search,
explicit saves and save-as. It uses the desktop's actual file service: changed-on-
disk detection, permissions, symlinks, binary detection and move protection are
shared. Replacing a dirty document, closing its tab and quitting ask about edits.
Save-as refuses an existing destination; overwriting a changed file is a separate
confirmed command. Ctrl+C and Ctrl+D go to the shell when it has focus. `yhwh open
PATH` from an embedded shell routes back to its originating tab.

Settings resolve the same hierarchical rc files as the desktop, and save to a
directory scope or everywhere. Terminal fonts remain under the terminal's control.
The definition can be changed through Settings or **Edit shaddai definition** in
the command palette. The editable seed text lives in `yhwh/etc/tty/words.json`;
personal changes persist in `session.json` under `YHWH_TTY_DATA_DIR`, defaulting
to the user config directory's `state-tty`. Browsing creates no vault metadata.

The palette also includes the read-only Codex conversation (local history and
failed drafts retained), verse/chapter browsing and editable commentary, local
inbox letters, optional walk, God/Man worlds, books, character copy, offerings,
and the begin/review/run/add/commit workflow. Workflows temporarily use the full
terminal and return to the interface afterward. Chat does not fabricate a reply
when its backend fails. Payments open only a configured checkout after selection.

`:cd PATH`, `:open PATH`, `:mkdir PATH`, `:set key=value`, and `:! COMMAND` are
available from `:` in files. Browser DOM plugins, image rendering, spatial effects,
and CodeMirror's rich editing widgets remain desktop features. Images/PDFs/binary
files can open in the desktop's default application. Markdown reading mode is a
plain terminal rendering; hybrid mode keeps editable source with heading colors.

`make tty-check` exercises models, file safety, paste, terminal emulation and a
real PTY UI session. State is isolated in the tests; no real Codex work runs.

## Prefix key files

The terminal reads the shared system/user/ancestor prefix hierarchy and applies
user/project key files, executable symlinks and non-executable `.js` modules on
refresh. Modules receive `run`, `notice`, `active` and `refresh`; `run` exposes
commands supported by this interface. Browser DOM APIs and desktop-only commands
are unavailable. The palette includes an effective binding list; `yhwh keys list`
provides the same lines to external tools. Ctrl+E reaches the focused shell.
Ctrl+Shift+E toggles files and vertical shell expansion retains the columns.
Ctrl+1–8 and Ctrl+9 select tabs. Reopen and move use the desktop combinations
when the outer terminal transmits distinct Ctrl+Shift key sequences. Some
terminals cannot distinguish those combinations, including Ctrl+Tab; palette
commands remain available. The desktop capture/search dialog belongs to the
GUI; terminal pipelines use the normal shell and `yhwh keys`.
