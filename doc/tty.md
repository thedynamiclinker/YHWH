# Shaddai

From the repository root, `make tty` opens the Python workspace in your
terminal. Use `make tty OPEN=PATH` to open a directory or file, `make tty-build`
to build the console diagnostic, and `make tty-check` to run the PTY tests.
Press F1 for help and F10 to quit.

Shaddai has its own [package and install guide](../yhwh/shaddai/README.md).
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
