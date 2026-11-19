# Keyboard bindings are files

The desktop, Three and Shaddai clients read bindings from ordinary prefix directories.
The default user prefix is `${XDG_CONFIG_HOME:-~/.config}/yhwh`; `YHWH_CONFIG_HOME`
can select another. On first launch the graphical clients copy shipped bindings into their
`etc/keys` directory without replacing custom files. Unmodified copies of the retired terminal-tab defaults are upgraded to the current app-tab/toggle bindings; masks, custom modules, executables and symlinks remain untouched. The installed defaults
also remain the lowest layer, so an empty override disables a default.

The layers, from least to most specific, are:

1. Shipped `yhwh/etc/keys`.
2. `/etc/yhwh/etc/keys` (`YHWH_SYSTEM_CONFIG` selects another system prefix).
3. `~/.config/yhwh/etc/keys`.
4. Each existing ancestor `.yhwh/etc/keys`, starting at `/` and ending at the
   current directory. A deeper directory overrides its ancestors.

No directory is created in a browsed project. A `.yhwh` prefix is optional.
Tab changes and directory navigation select the corresponding configuration.
**Reload keys**, F5, or **Reload configuration and keys** in the command palette
reread external changes without closing the app or discarding editor buffers.
Profile changes are included in that reload. Shells source their prefix startup
files when they start and when their working directory changes; existing shell
environments retain normal shell semantics when leaving a directory.

Shaddai supplies its own terminal defaults and reads the same system, user
and ancestor overrides. Executable bindings receive tab-separated context on
stdin plus `YHWH_KEY`, `YHWH_TAB`, and `YHWH_PREFIX`. Shaddai understands the binding editor's
simple `api.run('command')` files for actions available in the terminal.

## Names and behavior

`ctrl/alt/k.js` and `alt/ctrl/k.js` mean the same combination. Modifier names
are `ctrl`, `alt`, `shift`, and `meta`; their order is irrelevant. The last
component names one key. Examples include `ctrl/b`, `ctrl/shift/tab.js`,
`alt/up.js`, and `f5.js`. Punctuation has filesystem-safe names such as
`comma`, `backtick`, `slash`, `backslash`, `period`, `plus`, and `space`.

An executable file is a program, regardless of its suffix. Executable symlinks
work too. A script includes a shebang and executable permission, for example:

```sh
mkdir -p ~/.config/yhwh/etc/keys/ctrl/alt
cat > ~/.config/yhwh/etc/keys/ctrl/alt/u <<'SH'
#!/bin/sh
printf 'Current directory: %s\n' "$PWD"
cat
SH
chmod +x ~/.config/yhwh/etc/keys/ctrl/alt/u
```

The app executes it in the tab's physical working directory. Stdin is a
tab-separated list of context lines: `cwd`, `file`, and repeated `selected`
paths. `YHWH_KEY`, `YHWH_TAB`, and `YHWH_PREFIX` (the binding’s owning prefix) are
environment variables.
The resolved profile environment is inherited. Stdout, stderr, and a nonzero
exit status appear in a plain-text dialog. Programs receive EOF on stdin;
interactive programs belong in the terminal. Executable rows have a `--help`
button that delegates usage text to the program. Captured jobs have a 30-second
time limit and a 1 MiB combined output limit.

A non-executable `.js` file is an ES module running in the isolated interface:

```js
// command: toggle-terminal
export default api => api.run('toggle-terminal');
```

The optional `// command:` line labels the action. `// when: files`,
`// when: terminal`, or `// when: editor` limits it to the file list, terminal, or editor; omission
means any focus. The API includes the existing plugin API (`run`, `notice`,
`refresh`, command/event registration and interface helpers), plus `active`,
`newTab`, and `openFile`. Desktop key modules also receive `keyContext`, the
focus at dispatch (`files`, `terminal`, `editor`, or an empty string). Modules are loaded through a blob URL; relative
imports beside the source file are not resolved. There is no Node integration
in the renderer. Native work belongs in an executable or the existing explicit
bridge operations.

A non-executable empty file disables an inherited combination and lets the
focused control handle it. A non-executable `.sh` or `.py` is identified as
unsupported by the JavaScript host; making it executable with a shebang gives
it an interpreter. The suffix never outranks executable permission.

Within one layer, executables outrank importables, and extensionless files
outrank suffixed importables. Thus a new `ctrl/b` program replaces the copied
`ctrl/b.js` default. Remaining ties resolve in sorted filename order, with the
later file winning and a warning in the dialog. Removing a
user file reveals the inherited binding. Empty files mask it. The GUI refuses
to replace hand-written modules, executables, or symlinks; **Open source** is
the editing route for those files.

## Inspect, search, edit

**Ctrl+Alt+Shift+K** opens Keyboard bindings. Normal mode records the actual
combination and shows its current action and source. Escape stops recording;
a second Escape can close the dialog. The binding editor can choose an app
command, disable the combination, or reveal its inherited definition.

Advanced mode searches text, wildcards, or regular expressions. `ctrl`,
`ctrl/*/k`, and `/ctrl.*shift/` are examples. Invalid expressions produce a
visible message. Typing a shell command does not execute it; **Run shell** or
submitting the form runs it with the current effective list on stdin:

```sh
grep ctrl | grep -v alt
awk -F '\t' '$2 == "exec"'
```

`cd ctrl/alt` and `cd alt/ctrl` enter the same virtual modifier namespace.
`ls` shows all effective binding files involving those modifiers, including
bindings with additional modifiers. `pwd`, `cd /`, `cd ..`, and `cd ./shift`
support browsing. A bare modifier path is root-relative in this virtual view.
Other commands run in the tab's real working directory with the namespace's
list on stdin. The virtual namespace is a view; it is not a FUSE mount.

The same list is available outside the GUI:

```sh
yhwh keys list | grep ctrl | grep -v alt
yhwh keys paths
yhwh keys cd alt/ctrl /path/to/directory
find ~/.config/yhwh/etc/keys -type f
```

The list has one tab-separated line per effective combination, including
disabled entries: combination, kind, command, focus, source filename. The
files and this reusable conversion are the configuration; no JSON manifest
or database sits between the user and the binding.

## Prefix shell configuration

Every prefix can contain `etc/profile`, a normal Bash source file. It runs
before the legacy scoped `rc` (and `rc.three` in Three). Existing `rc` files
continue to work. Profile variables can configure the relative layout:

```sh
export yhwh_keys_directory=etc/keys
export yhwh_bashrc_file=etc/bashrc
export yhwh_completions_directory=lib/bash/completions
export yhwh_terminal_font_size=16
```

The effective layout variables select those paths beneath each active prefix.
Profiles execute with `YHWH_PREFIX` set to their prefix; legacy relative asset
paths retain their previous base-directory behavior. `etc/profile` and legacy
rc files follow the existing owner/permissions rules for shell configuration.
Bash then sources prefix profiles, the selected bashrc files, and completion
files in hierarchy order, after its normal user startup file. Other shells
retain their existing startup handling; Bash-specific prefix completions
are not sourced into zsh, fish, or PowerShell.

This moves new configuration toward shell files and exported variables while
preserving the current settings interface and explicit file saves. Existing
JSON-based editor settings, themes, plugins, and application state have not all
been migrated.

## Default changes and platform boundaries

Ctrl+Shift+B maximizes the terminal vertically within the main area while
leaving the file manager's visibility unchanged. Ctrl+E reaches the terminal's
readline editing; it is no longer an app shortcut. Ctrl+Shift+E toggles files.

Ctrl+T opens an app tab; Ctrl+W closes it; Ctrl+Shift+T restores closed directory/file
tabs in reverse closing order. Ctrl+Tab / Ctrl+Shift+Tab and Ctrl+PageDown /
Ctrl+PageUp cycle app tabs from every pane, including the terminal.
Ctrl+Shift+backtick toggles the terminal, just like Ctrl+backtick. Each app
tab has one shell; exiting it hides the panel, and reopening starts a fresh
shell. Ctrl+Shift+W remains Quit.
Ctrl+1–8 select app tab positions; Ctrl+9 selects the last tab.
Ctrl+Shift+PageUp / PageDown move the active tab. Middle-click closes a tab;
dragging reorders it. Closing a background tab retains the active tab; closing
the final tab returns to the welcome screen after the normal unsaved-file check.
Reopening starts a new shell, since the closed shell process has exited.
Pane focus uses Ctrl+Alt+1/2/3. Linux Ctrl bindings are literal; a `meta` file
can define a separate Command binding on macOS.

Android and iOS share the new key capture, search, bundled defaults and tab
behavior when their hardware keyboard delivers the combination. The mobile
adapter explicitly reports that custom executables, arbitrary imported JS,
shell pipelines, and editable desktop prefixes require desktop APIs. Closing
the last mobile tab leaves a usable blank tab. Installed apps need a rebuild.
The TTY reads the same prefix overrides, executes programs and imports JS
against its smaller command API; its palette lists the effective bindings.
Some outer terminals cannot distinguish Ctrl+Shift or Ctrl+Tab sequences,
and browser DOM modules require the desktop. Obsidian continues to manage
its host shortcuts through its own hotkey system. The common `yhwh keys`
command makes the prefix list available to terminal tooling.
