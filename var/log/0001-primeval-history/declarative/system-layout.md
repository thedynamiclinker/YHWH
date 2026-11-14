# Application and human workspace

The vault root is the human workspace. `yhwh/` contains everything needed to
build, run, test and install the application, apart from documented system and
npm dependencies. The root Makefile delegates to it; plain `make` builds and
opens the default app without installing.

The three interfaces live under `yhwh/src/yhwh-default`, `yhwh/src/yhwh-three`
and `yhwh/src/yhwh-obsidian`. Shared libraries and models have one home in
`yhwh/lib`; internal programs live in `yhwh/bin`. Editable defaults, interface
copy, templates and dimensions live in `yhwh/etc`. Temporary build outputs are
under `yhwh/var/tmp/yhwh`. The preserved company/review rehearsal UI lives in
`yhwh/src/company` with its reusable models in `yhwh/lib/company`.

`make develop` creates editable links in `~/world`; `make install` distributes
a standalone npm package into `~/world/mnt/sinai`. Each prefix has its own
`var/lib/yhwh/world` package record. Source links and runtime/installation state
are local to each human. They are never installed into the shared vault root.
See [the application guide](../../yhwh/README.md) for configuration, dependency,
installation, ownership and guarded-uninstall details.

`root/` holds the Root Enterprise documents. `bin2/imperative/` holds imperative
English development programs and preserved drafts. The imperative/declarative
history and Git workflow are defined in [doc/README.md](../README.md).
