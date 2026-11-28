# Shaddai

From the repository root, `make tty` opens the Python workspace in your
terminal. Use `make tty OPEN=PATH` to open a directory or file, `make tty-build`
to build the console diagnostic, and `make tty-check` to run the PTY tests.
Press F1 for help and F10 to quit.

The file manager stays on the left and the terminal docks under the editor.
The expanded file manager shows a Ranger-style listing with a file preview and
a Places column when the terminal is wide enough. Use
Ctrl+Up/Down for the terminal and Ctrl+Right/Left for the file manager to step
between hidden, split and maximized. Add Alt+Shift for smaller moves. Set the
key combinations and step in rows or columns under **Settings → Keys**. These
shortcuts depend on the outer terminal sending the modified arrow keys.

The status line shows `.`, `@`, and `/`. The file bar groups shortcuts as
`go . @ /` and `set . @ /`. `un` opens the same universe commands as the
desktop, including folder roots, Bubblewrap guests, and system chroots in a
separate tab. Type `:chroot DIRECTORY` for the same picker on an ordinary
directory. Type `:` in Files for a
command line. Native commands run in the embedded shell, so aliases,
functions and exports remain in that shell. The **--prefix** menu opens the
real `bin`, `lib`, `etc`, `etc/profile`, and `~/.bashrc`, or prints
`PATH`. Use **Settings → Terminal → Focus shell at startup** or
`yhwh_shell_first=true` in `etc/profile` to land directly in the shell.

A normal launch uses your current directory. Use `shaddai --launcher` for
launcher shortcuts. It opens the global **Settings → Files and editor → Default
directory**, which defaults to your home directory and is shared with desktop.

Use **YHWH-ness · levels and upgrades** in the command palette to switch levels,
read the welcome passages, or try the Pro and Elite previews. The terminal
reader links to the original Nietzsche Family Circus. The palette uses the
same level copy and Stripe guide as the desktop.

Shaddai has its own [package and install guide](../yhwh/shaddai/README.md).
The package also provides the `el-shaddai` launcher.
Put its `yhwh-tty` launcher on `PATH` to use `yhwh tty [PATH]` or
`YHWH_INTERFACE=tty yhwh open [PATH]`.

Clients share ordinary directories, YHWH prefix files and executable
[key bindings](keys.md). Keep those formats usable from a shell and from
other languages. From a Shaddai shell, `shaddai PATH` sends the path back
to the current tab through `YHWH_TTY_SOCKET`. With YHWH available, `yhwh open PATH`
uses the same route.

To try another client, put an executable `yhwh-NAME` on `PATH` and run
`YHWH_INTERFACE=NAME yhwh open PATH`. The client receives the arguments and
uses the caller's working directory and standard streams.

Earlier TTY recovery buffers and word edits are in `state-tty/session.json`
under your YHWH config directory, or in `$YHWH_TTY_DATA_DIR/session.json`.
