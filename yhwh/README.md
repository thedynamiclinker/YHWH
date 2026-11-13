# YHWH application

`make` here or at the vault root builds and opens the default app without
installing. `make build` builds all three interfaces. `make help` lists targets.

```text
bin/                 executable entry points and internal support programs
etc/                 editable defaults, interface copy, templates, styles, geometry
lib/                 shared file operations, Electron runtime, workflow and models
src/yhwh-default/    desktop files, editor and shell
src/yhwh-three/      spatial desktop interface
src/yhwh-obsidian/   Obsidian plugin
src/company/         preserved company and paired-review rehearsal interface
var/tmp/yhwh/        disposable builds, packages and test screenshots
```

One root npm lockfile owns dependencies. Node >=22.12, npm, Make, Bash, Git,
`fold`, Python 3 and `file` are required. Native node-pty builds may need a C++
toolchain. Electron needs a desktop; headless checks need Xvfb. On NixOS the
runtime helpers obtain native Electron and Xvfb through nixpkgs; explicit
`YHWH_ELECTRON` and `YHWH_XVFB` paths override this. The Obsidian interface
requires an installed Obsidian application and an enabled YHWH plugin.

`make check` runs core and isolated workflow tests, plugin type checks and
publication tests against a fake GitHub command, and real headless Electron
workflows. It never invokes the prefix installer or uninstaller. Run
`node test/prefix-check.cjs` separately to exercise both installations and guarded
uninstall in a disposable HOME. Agent tests
use a deterministic local fixture; they never run real development tasks.

## Installation

`make develop` creates editable directory symlinks at
`~/world/lib/node_modules/yhwh-system` and `~/world/etc/yhwh`, plus npm-style
executable symlinks in `~/world/bin`. These point into this checkout. Main-process
configuration is read on launch; renderer copy and plugin defaults need
`make build` after edits. Restart Electron after implementation changes.

`make install` creates a standalone npm tarball with bundled runtime dependencies,
then installs it using npm into `~/world/mnt/sinai`. Its `bin`, `lib/node_modules`,
`etc/yhwh` and `var` belong to that prefix. Electron is a runtime dependency;
Node and the system tools above remain external. No installed executable or
module needs the original checkout. `PREFIX=/disposable/path` overrides either
installation destination for testing. Both modes expose:

```sh
yhwh                       # Unix help and discovered commands
yhwh open default          # also: yhwh open
yhwh open three
yhwh open obsidian          # opens Obsidian's registered URI handler
yhwh-default [PATH]
yhwh-three [PATH]
yhwh-obsidian install VAULT # install plugin; enable it in Obsidian
```

Put the chosen prefix's `bin` on PATH. Source
`PREFIX/etc/yhwh/completions/yhwh.bash` or `yhwh.zsh` after zsh's `compinit`.
`yhwh completion bash|zsh` prints the same setup. External `yhwh-NAME` programs
on PATH extend dispatch and help. Help calls only `--help`, with a one-second
limit; the first nonempty line should be `yhwh-NAME — Short description`.
Broken help has a fallback description. A symlink to the multiplexer itself
is excluded from discovery. Built-in workflow commands take precedence.

An installation only claims its own destinations. Existing unrelated files
or modified installed files cause a conflict, not an overwrite. Repeating an
unchanged installation is supported. Package versions and modes are recorded
only after success in `var/lib/yhwh/world`, sorted deterministically as UTF-8
TSV: `package-name<TAB>version<TAB>develop|install<NEWLINE>` (currently one package).
`var/lib/yhwh/installed.json` records paths, link targets and checksums for safe
ownership checks; it is installation metadata, never a build cache.

`make uninstall` deliberately removes all of `~/world`, including Sinai. It
accepts no prefix override, rejects symlinked prefixes/ancestors, verifies the
resolved path is exactly `$HOME/world`, audits package ownership and refuses
unrelated or modified data. Deletion removes symlinks without following their
targets. Test it only with an isolated HOME; never uninstall a real prefix just
to test the code.

## Configuration and state

`etc/default` and `etc/three` contain JSON defaults and window geometry, interface
copy and HTML/CSS templates; Three's procedural scene settings live in
`etc/three/space.json`. `etc/obsidian` contains bundled plugin defaults. Copy
formatters substitute numbered `{{0}}` slots; preserve those slots when editing
sentences. `etc/rc` and `etc/rc.three` are examples of hierarchical user rc files.

Default/Three shell rc layers still use `/etc/yhwh`, the XDG user configuration
and ancestor `.yhwh/` directories. `YHWH_CONFIG_HOME` and `YHWH_SYSTEM_CONFIG`
override those locations. Runtime state is user-specific: `YHWH_DATA_DIR` or
XDG state for the default app, `YHWH_THREE_DATA_DIR` for Three, and Obsidian's
plugin `data.json` for plugin settings. Installed defaults and mutable state
have separate ownership. No profile is installed into the vault root.

Builds and dependencies are ignored by Git. Obsidian's excluded-file filters
exclude `yhwh/var`, dependencies and Git internals. Each human must also add
`yhwh/var` and `yhwh/node_modules` to **Sync → Excluded folders**: Obsidian Sync's
per-device exclusions are not a versioned application setting. Shared prompts,
source, configuration and documentation remain visible and versioned.

Workflow commands operate on the caller's Git worktree, independently of the
installation location. See [the workflow guide](../doc/README.md) in the vault.
The package's `etc/workflow/*-help.txt` and agent templates document the same
protocol when this directory is copied away from the vault.
