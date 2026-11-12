# YHWH 3D

An Electron desktop app for moving through the filesystem, editing text and using a shell. Directories are worlds in a live Three.js scene. Files are blue crystals. The compact browser, spatial scene and terminal share one directory per focus tab. There is no vault boundary and no directory is modified merely by visiting it.

Start with `make help`. `make` installs dependencies if necessary, bundles the app, installs the launcher and opens it by running `yhwh-3d`. All source and build output belong to this directory. The only repository file installed outside it is `../bin/yhwh-3d`; the original `root/src`, `yhwh`, and other agents' commands are untouched.

```bash
make                         # build + install + open
make OPEN="$HOME/Documents"  # start somewhere else
make install                 # install ../bin/yhwh-3d, without opening
../bin/yhwh-3d /etc           # navigate freely; no vault needed
../bin/yhwh-3d ./README.md    # open a file
make check                   # core tests + real Electron/WebGL UI test
```

Put the parent repository's `bin` in PATH to run `yhwh-3d` from anywhere. The default app's git-style command discovery can then dispatch `yhwh 3d` to this command. This app does not install or replace `yhwh` or its completion files. `yhwh-3d --help` describes the launcher.

From the parent project directory, use `make 3d`, `make 3d-build`,
`make 3d-install`, or `make 3d-check`. Plain `make` there opens the default
app in `yhwh/`; the commands above run from this directory.

Requires Node 22.12+, npm, Python 3, Bash, the `file` command, and a desktop display. On NixOS the launcher uses native nixpkgs Electron, as the original app does. Set `YHWH_ELECTRON` to use an existing runtime. Set `YHWH_3D_DATA_DIR` for an isolated profile; otherwise state goes in `$XDG_STATE_HOME/yhwh-3d` or `~/.local/state/yhwh-3d`. This version's real terminal uses a Unix PTY (Linux/macOS); a Windows ConPTY backend is not implemented.

## Navigation and editing

- Double-click a directory or file, in either the scene or the sidebar, to open it. Enter works on focused file labels; the sidebar also supports arrows, Enter and Left to go up. Alt+Up goes up anywhere. Type a path in the directory field to jump. Relative paths and `~` work.
- Drag empty space to orbit; scroll to zoom. The scene shows 24 objects per page; arrows at the lower right page through all filtered entries. The sidebar lists the entire directory. Hidden files and filtering apply to both views.
- Ctrl+E toggles Files, Ctrl+D gives the file manager the whole focus area, Ctrl+B or Alt+Shift+T toggles the terminal. Expanding Files preserves the open document. The terminal's maximize button gives the shell the focus area.
- Ctrl+T opens a focus tab with an independent shell and directory. Ctrl+W closes it. Ctrl+Tab and Ctrl+Shift+Tab switch tabs. One document and its unsaved editor state belong to each tab. You can navigate without discarding it, then click the tab to return to the document.
- Ctrl+N creates a file of any name; the toolbar can also create folders. F2 renames the selection. Editing the document's large filename heading renames the actual file. The inspector can reveal, copy the path or move an item to the system trash.
- Ctrl+S saves. An external change to the file is checked before saving; a stale save is rejected. Existing permissions, symlinks and hard links are preserved. Switching files, closing a dirty document or closing a tab asks before discarding its edits.
- File type comes from `file` MIME detection, extension and shebang. Extensionless plain text stays plain text; it is not presumed to be Markdown. The status bar's language menu can override highlighting. The bundled CodeMirror languages include shell, Python, C, Rust, LaTeX and many more.
- Ctrl+Shift+V toggles Pretty. Markdown renders with sanitized HTML; JSON shows formatted output and offers an explicit Apply Formatting button; HTML has a sanitized reading view. Other text shows a readable source preview. Raster images render inline; binary files and text larger than 8 MiB open through the system application. There is no built-in PDF or video viewer yet.
- Ctrl+P / Ctrl+Shift+P opens commands. Typing an absolute path there also jumps to a directory. Ctrl+H toggles hidden files outside a text field.

A real interactive Bash process is always running for each tab, including while its terminal is hidden. It reads your `.bashrc`, keeps command history and runs terminal programs normally. Shell `cd` updates the browser at the next prompt. Browser navigation runs a readline binding while Bash is idle; it preserves a half-typed command. While a foreground program runs, the requested directory is queued until Bash next reaches a prompt. The app never types a `cd` command into an editor or other foreground program. Terminal transcripts and command buffers stay in the tab; closing it closes its shell.

## One configuration language, two files

Each configuration layer is read in this order:

1. `/etc/yhwh/rc`, then `/etc/yhwh/rc.3d`.
2. `$XDG_CONFIG_HOME/yhwh/rc`, then `rc.3d` (default `~/.config/yhwh`). `YHWH_CONFIG_HOME` can replace that directory. `YHWH_SYSTEM_CONFIG` can replace `/etc/yhwh`.
3. `~/config/yhwh/rc`, then `rc.3d`, if present. This extra location honors the exact location in the 3D request. `make install` creates only a sample `rc.3d` here, without replacing an existing file or writing a shared `rc`.
4. Ancestor `.yhwh` directories, from `/` to the current directory, each with `rc` followed immediately by `rc.3d`.

Missing config files are normal. Nothing is created in visited directories. For a document, configuration also considers exact file headers and the containing directory's ancestors. Directory matching uses component boundaries: `/foo` does not match `/foobar`. Matching sections run in written order within each file. A more general section written later is therefore allowed to change an earlier choice.

```bash
# ~/.config/yhwh/rc
/
    theme=nietzsche
    font_size=16
    filetypes='{"(^|/)boop$":"Markdown","\\.myjs$":"JavaScript"}'

$HOME/Documents
    title='Documents, apparently'
```

```bash
# ~/config/yhwh/rc.3d
/
    # These are actual Bash decisions, with variables inherited from rc.
    if [[ $theme != dawkins ]]; then
        bloom=1.1
    fi
    motion=1
    particles=1800
```

An unindented non-comment line is a pathname. It must name an existing directory or regular file. `~`, `$VAR`, `${VAR}`, quoted paths and spaces are supported; header variables come from the app's environment. Headers are never evaluated as shell: command substitution and backticks there are rejected. Put executable Bash under a path header, indented. Every line of a shell block needs that extra indentation, including heredoc terminators. The common section indent is removed before Bash reads it.

All matching blocks from all files run in **one Bash process**. Variables, functions, arrays, `if`, loops and command substitution carry across `rc` and `rc.3d`; the app does not merge maps or decide which file's value wins. The last executed Bash assignment is the value. Defaults are initialized before any config; ordinary environment variables are available to Bash. Shell output is separate from returned UI values. An error is visible in the status bar; the app remains navigable using defaults. Configuration is re-evaluated on navigation or file opening; Refresh only relists the directory, so arbitrary config commands are not rerun by every filesystem notification.

For global config files, shell relative paths start from the config directory. For `.yhwh/rc`, they start from the directory containing `.yhwh`, so a header `.` applies there and a relative `bg=supersecret/pics/boop.png` refers to that directory. Asset paths remember the config file that changed them. Use absolute `$HOME/...` paths when sharing settings between unrelated scopes.

These files execute Bash as the current user, with the user's ordinary permissions. They are startup scripts, not an inert theme format. They can run the commands you put in them. Nonmatching blocks do not execute. The current implementation limits each evaluation to ten seconds.

Supported values:

| Variable          | Meaning                                                                |
| ----------------- | ---------------------------------------------------------------------- |
| `theme`           | `yhwh`, `nietzsche`, `dawkins`                                         |
| `title`           | Window title                                                           |
| `font_size`       | Editor font size, 10–32                                                |
| `bg`              | Local raster image background                                          |
| `stylesheet`      | Shared theme CSS file                                                  |
| `theme_css`       | Additional 3D theme CSS file                                           |
| `show_hidden`     | `true` / `false`                                                       |
| `file_manager`    | `true` / `false`                                                       |
| `terminal_height` | Terminal height in pixels                                              |
| `filetypes`       | JSON object mapping filename/path regexes to CodeMirror language names |
| `settings_html`   | Sanitized extra settings markup                                        |
| `settings_fields` | Comma-separated settings fields to show                                |
| `bloom`           | Glow strength, 0–2                                                     |
| `motion`          | `1` / `0`; reduced-motion preference also pauses motion                |
| `particles`       | Star count, 0–6000                                                     |
| `accent`          | CSS hex color                                                          |
| `plugin`          | Path to a renderer ES module (see below)                               |

Shared configs may contain arbitrary additional variables and Bash code. Unrecognized values still exist for later Bash decisions. There is no translation of Obsidian's internal plugin APIs. Obsidian-style CSS variables such as `--background-primary`, `--background-secondary`, `--text-normal`, `--text-muted` and `--interactive-accent` are available; a full third-party Obsidian theme may need selectors adapted for this app.

Settings changes in the menu apply to the focus tab. For durable changes, edit the config; the menu lists the files in effect and offers an Open rc.3d action. This keeps generated UI changes from silently rewriting shared shell logic.

## Plugins and editable voice

`plugins/hello-world.js` is a real loaded plugin and adds the Hello, world command. The same command is available in the palette and inspector. A configured `plugin` file exports a default function:

```js
export default function (app) {
  const dispose = app.addCommand({
    id: "my-command",
    name: "A small miracle",
    icon: "sparkles",
    run: () => app.notify(`You are in ${app.directory}`),
  });
  return dispose;
}
```

The function can return cleanup, receives `copy`, `notify`, `navigate(path)`, `open({path,directory})`, `panels` (actual DOM elements), and `on('yhwh:navigate', callback)` / `on('yhwh:config', callback)`. CSS and DOM manipulation can restyle or relocate panels. User modules run in the renderer and should be self-contained or bundled; relative module imports from a blob URL are not supported. Plugins are trusted local code and can use the same limited filesystem/terminal bridge as the app. They do not get Node integration.

Every piece of YHWH prose is in `app/voice.json`. Pencil buttons open that source file in the editor; saving edits the actual implementation and refreshes the voice. The brief personality is based on the original Paleo-Hebrew assets and selected Genesis 17–18 / Exodus 3 passages in the neighboring We The Nameless project. UI labels still say what they do.

The Nietzsche Family Circus loads a pairing from the original site on request, preserving its permalink. It needs network access and may be unavailable offline. The app itself, all shaders, editor languages, fonts and icons are bundled and work offline.

Offerings contains the requested Stripe setup tutorial and a local Piece Offering staging receipt. No payments or uploads occur. The optional email button opens a draft in your mail application; it does not send anything. Future products are visibly marked as unimplemented. About links to the supplied website and Genesis book.

## How the 3D works

Electron hosts a sandboxed, context-isolated renderer. Filesystem operations, configuration evaluation and PTY processes live in the main process. The scene gets ordinary directory data and has no direct filesystem access. CodeMirror and xterm retain readable, accessible text instead of rendering text editing as a texture on a spinning polygon.

Three.js uses WebGL 2 with a perspective camera, OrbitControls, procedural materials, directory meshes, a particle field, and the official EffectComposer → RenderPass → UnrealBloomPass → OutputPass pipeline. Labels are real buttons projected from object positions. This keeps screen-reader and keyboard navigation available alongside the GPU scene. A failed GPU context leaves Files, editing and shell usable. Reduced motion freezes animated materials and geometry; orbit and zoom remain user-controlled. WASM would not improve this rendering pipeline; no compiled engine or large game assets are necessary.

References and licenses:

- [Three.js Unreal Bloom example](https://threejs.org/examples/webgl_postprocessing_unreal_bloom.html) and [source](https://github.com/mrdoob/three.js/blob/dev/examples/webgl_postprocessing_unreal_bloom.html): MIT. This app uses the pipeline, not the example's third-party spaceship model.
- [Three.js OrbitControls](https://threejs.org/docs/#OrbitControls): MIT.
- [Electron context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation).
- CodeMirror, xterm.js, Marked, DOMPurify and Lucide are bundled from their locked npm dependencies, retaining their upstream licenses. The copied Paleo-Hebrew font is accompanied by `assets/OFL.txt`.

`make test` exercises path validation, real Bash sequencing and heredocs, external-edit detection, symlink preservation, and a real bidirectionally synchronized PTY. `make test-ui` drives Electron through a rendered WebGL scene, real shell `cd`, editing/saving/renaming, JSON/Markdown pretty modes, tabs, settings, plugins and extensionless file creation. It saves screenshots under `build/screenshots`. UI tests use Chromium's SwiftShader for reproducibility; `YHWH_3D_TEST_GPU=native make test-ui` attempts the system GPU directly and requires a working driver. Headless Linux can run the same test under Xvfb. The normal launcher tries the system GPU and permits Chromium's SwiftShader fallback for its bundled shaders. If initialization fails before any user input, the launcher retries once with explicit software 3D and remembers that choice in the profile's `graphics.json`. A failure during an active session leaves Files usable and preserves edits. The status bar identifies software rendering. `YHWH_3D_GPU=software` explicitly selects software 3D. Electron's renderer sandbox remains enabled.

Chromium documents the software fallback flags in [Using Chromium with SwiftShader](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md). This fallback executes compiled shader code in Chromium’s GPU process with lower security guarantees than hardware rendering. The app only loads bundled shaders, blocks remote page navigation and has no general web browser surface. Set `YHWH_3D_GPU=hardware` to disallow the software fallback and use the Files interface if WebGL is unavailable.
