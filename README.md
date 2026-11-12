# YHWH

Run `make` here to build and open the default filesystem app in `yhwh/` through
its existing launcher. Start with `make help` for commands, requirements, and
useful overrides. Dependencies are installed from each app's lockfile as needed.

```sh
make build                 # Build the default app without opening it
make install               # Build; install bin/yhwh and shell completions
make check                 # Default app: core tests and UI checks under Xvfb
make 3d                    # Build, install, and open YHWH 3D
make 3d-check              # 3D core and UI checks; needs a display
make obsidian              # Plugin CLI help, including packaging and publication
make obsidian-build        # Build the plugin from source
make obsidian-check        # Plugin type-check and tests
make obsidian-install VAULT="/path/to/vault"
```

Development needs Make, Node.js >=22.12, npm, and Bash. The desktop apps need a
display and Electron; their launchers obtain native Electron on NixOS, or accept
`YHWH_ELECTRON=/path/to/electron`. The default app may need Python 3 and a C++
toolchain for node-pty; `make -C yhwh nix-shell` supplies its NixOS tools.
`make check` needs Xvfb. The 3D app also needs Python 3 and `file`.
The installed plugin runs inside Obsidian without Node or npm.

`make run` opens the built default app. `make THEME=dawkins` selects a theme;
`make 3d OPEN="$HOME/Documents"` chooses the 3D starting directory.
`make install PREFIX=/somewhere` changes the default app's install prefix.
The 3D installer writes `bin/yhwh-3d` and creates `~/config/yhwh/rc.3d` only if
it is missing. Plugin installation uses its existing CLI, which rebuilds when
development dependencies are present and otherwise uses the bundled assets;
run `make obsidian-build` first after changing plugin source. Enable **YHWH** in
Obsidian's **Settings → Community plugins** after installation.

The top-level Makefile delegates to the app Makefiles and plugin CLI. Their
commands remain available for individual development and less common operations:

| Directory | Purpose | Full command reference |
| --- | --- | --- |
| [yhwh/](yhwh/README.md) | Default filesystem app | `make -C yhwh help` |
| [yhwh-3d/](yhwh-3d/README.md) | Independent 3D app | `make -C yhwh-3d help` |
| [yhwh-obsidian/](yhwh-obsidian/README.md) | Normal Obsidian plugin | `bin/yhwh-obsidian help` |
| [root/src/](root/src/README.md) | Older shared source, THWH and company rehearsal apps | `make -C root help` |
| `bin/` | Project launchers and shell completions | `bin/yhwh help` |
| [yhy/](yhy/README.md) | Intended behavior and workflow descriptions | Describes the target, rather than verified implementation |

After `make install`, add this checkout's `bin/` to `PATH` to use `yhwh`,
`yhwh 3d`, and `yhwh obsidian`. Preview delegated commands with `make -n TARGET`.
