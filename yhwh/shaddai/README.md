# Shaddai

Open a directory or text file in a terminal workspace with a file browser,
editor, and shell. Press F1 for help or Ctrl+P for commands.

From the repository root, use `make tty-build`, `make tty-check`, or
`make tty OPEN=PATH`. From the Shaddai directory, use:

```sh
make deps
make check
bin/shaddai ~/obsidian/YHWH
```

Shaddai uses Python 3.11 or newer. `make deps` installs the Python package and
its dependencies in `.venv`. `make develop` installs them in the active Python
environment. Both are editable installs that use the code in this checkout.

`pip install .` installs `shaddai`, `shaddai-fonts`, `el-shaddai` and
`yhwh-tty` in the active Python environment. With `yhwh-tty` on `PATH`,
`yhwh tty [PATH]` opens Shaddai through YHWH's external command dispatch.
`make install PREFIX="$HOME/.local"` copies the launchers into `bin/`,
the Python code into `lib/shaddai/`, and the C console diagnostic into
`libexec/`. Make supports `DESTDIR` for staging. Put a `python3` with
`prompt_toolkit`, `pyte`, and `Pygments` on `PATH`, or point `SHADDAI_PYTHON`
at one, such as the `.venv/bin/python` created by `make deps`.

Font changes on a Linux virtual console use `setfont` from kbd. Shaddai reads
YHWH profiles and keys from its shared prefixes. Shaddai-specific settings
live in `~/.config/shaddai/etc/config.toml` by default. Use **Configuration
paths** in Settings to see which paths the workspace reads.

## PyPI releases

`make dist` builds the wheel and source archive in `dist/`. Upload them with
`make push-test` for TestPyPI or `make push-prod` for PyPI. Both use Twine's
credentials for the selected repository.

Run `make pull-test` or `make pull-prod` in a fresh virtual environment to try
the published package. `make pull-test` fetches the wheel from TestPyPI and
installs its dependencies from pip's usual index.
