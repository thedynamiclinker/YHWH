# YHWH Three

YHWH Three is the app described in [[mk-yhwh]], with an impressive 3D interface for navigating the whole filesystem. Its appearance belongs in a science-fiction movie or a video game. The core app's behavior, personality, file manager, terminal, editing, configuration, and other requirements carry over.

## Visual technology and app layout

The app uses WebGL, WebAssembly, or the most suitable comparable technology for its 3D presentation. Electron is preferred when it works with the chosen rendering technology. The choice serves visual capability rather than assuming the original author has expertise in 3D development.

The visual foundation draws on impressive, already-working WebGL or comparable examples available online, adapted to deliver the app described in [[mk-yhwh]]. The result is gorgeous and visually ambitious while retaining that app's filesystem navigation model.

The interface lives in `yhwh/src/yhwh-three`. Shared capabilities live in `yhwh/lib`; defaults and interface text live in `yhwh/etc`. See [the application guide](../../yhwh/README.md) for build, launch and installation.

## Configuration interoperability

YHWH Three understands the hierarchical configuration described in [[mk-yhwh#Hierarchical configuration|the core app's configuration description]]. It may support extra options for the 3D interface.

The 3D prompt names the common file `~/config/yhwh/rc` and its additional file `~/config/yhwh/rc.three`. The common file is applied first, followed by `rc.three`.

The original prompts differ on the location: [[mk-yhwh]] specifies `~/.config/yhwh/`, with a leading dot in `.config`, while the 3D prompt specifies `~/config/yhwh/`. The common location remains a detail to reconcile; both spellings are preserved here explicitly.

The two files behave as sequential shell-capable configuration files with pathname sections. The app does not invent a separate policy for deciding which individual values override others. Shell assignments and control flow express that behavior, including a condition that retains an `rc` value when it has some particular value.

Unindented, non-comment content names a file or directory rather than containing shell code. Those pathnames are checked for file or directory existence. Indented content supports Bash syntax, including arbitrary control flow. The pathname structure is special syntax; the indented parts are shell.

## Build and command

`make three` builds and opens the spatial app without installing. Both installation modes expose `yhwh-three`; `yhwh open three` selects the same interface. Shared installation conventions are in [the application guide](../../yhwh/README.md).

The core app's command convention in [[mk-yhwh#Commands, installation, and completion|the command description]] makes this app available as `yhwh open three` when the project commands are on `PATH`.
