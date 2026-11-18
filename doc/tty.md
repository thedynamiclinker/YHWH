# Shaddai

`make tty`, `yhwh tty [PATH]` and `yhwh open tty [PATH]` open the same Python
workspace in your terminal. Press F1 for help and F10 to quit.

Clients share ordinary directories, YHWH prefix files and executable
[key bindings](keys.md). Keep those formats usable from a shell and from
other languages. From a Shaddai shell, `yhwh open PATH` sends the path back
to the current tab through `YHWH_TTY_SOCKET`.

For Python setup and Shaddai settings, see the [client guide](../yhwh/src/shaddai/README.md).
Earlier TTY recovery buffers and word edits are in `state-tty/session.json`
under your YHWH config directory, or in `$YHWH_TTY_DATA_DIR/session.json`.
