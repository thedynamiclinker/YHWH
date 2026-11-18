# Shaddai

Open a directory or text file in a terminal workspace with a file browser,
editor, and shell. Press F1 for help or Ctrl+P for commands.

```sh
make tty OPEN=/path/to/notes
make tty-check
```

Run those targets from the YHWH root. Shaddai uses Python 3.11 or newer.
`make tty-deps` creates its local `.venv`. You can also launch this client's
`bin/shaddai` directly or set `SHADDAI_PYTHON` to an existing Python with
`prompt_toolkit`, `pyte` and `Pygments`.

`pip install .` installs `shaddai` and `shaddai-fonts` in the active Python
environment. `make install PREFIX="$HOME/.local"` copies them into `bin/`,
the Python code into `lib/shaddai/`, and the C console diagnostic into
`libexec/`. Make supports `DESTDIR` for staging. Put a `python3` with
`prompt_toolkit`, `pyte`, and `Pygments` on `PATH`, or point `SHADDAI_PYTHON`
at one, such as the `.venv/bin/python` created by `make deps`.

Font changes on a Linux virtual console use `setfont` from kbd. Shaddai reads
YHWH profiles and keys from its shared prefixes. Shaddai-specific settings
live in `~/.config/shaddai/etc/config.toml` by default. Use **Configuration
paths** in Settings to see which paths the workspace reads.
