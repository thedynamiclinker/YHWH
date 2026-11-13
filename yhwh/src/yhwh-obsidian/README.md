# 𐤉𐤄𐤅𐤄 · YHWH

A normal Obsidian plugin with a compact folder navigator, a synchronized
vault command line, an optional WebGL directory, and an adjustable amount
of deity. No background server, runtime packages, remote scripts or model
account required. Works with the native editor, workspace, themes and plugins.

## Install

From the parent YHWH checkout:

`make obsidian` shows CLI help. `make obsidian-build` builds from source,
`make obsidian-check` type-checks and tests, and
`make obsidian-install VAULT="/path/to/vault"` uses the installer below.

```sh
yhwh/bin/yhwh-obsidian                         # open Obsidian; use --help for commands
yhwh/bin/yhwh-obsidian install /path/to/vault
yhwh/bin/yhwh-obsidian install /path/to/vault --enable
```

Enable **YHWH** in **Settings → Community plugins**, or reload Obsidian after
using `--enable`. Enable community plugins first if restricted mode is on.
Installation copies `main.js`, `manifest.json`, `styles.css` and the license
to `.obsidian/plugins/yhwh`. Your existing `data.json` and other plugins survive
upgrades. Close Obsidian before using `--enable`, so its in-memory plugin list
doesn't overwrite the change. `--config-dir .custom-config` supports a custom
vault configuration folder; `--plugin-dir DIR` targets a plugin directory directly.
The CLI rebuilds when development dependencies are installed, and otherwise
uses the included build. Run `npm ci && npm run build` after source edits.

For a standalone copy of this repository, run `npm ci && npm run build`, then
`node yhwh/bin/obsidian/cli.mjs install /path/to/vault`,
or simply copy the three plugin files to your vault's plugin directory.

## Use

- **Flame ribbon icon** opens the navigator in the left sidebar. It opens on
  startup by default; change that in the plugin settings.
- **Ctrl+E** toggles the navigator. **Ctrl+D** toggles a larger file manager in a
  normal workspace tab, preserving existing editor tabs. **Ctrl+B** toggles
  the command line in a horizontal split below the active workspace pane.
  Obsidian allows dragging, resizing and docking these views normally.
- **Alt+↑**, **←** and the parent button go up a folder, stopping at the vault
  root. **↑/↓** selects entries; **Enter/→** opens them; **F2** renames.
  Right-click an entry to rename/move it or open it in a new tab.
- Create files with any extension, or create folders. Markdown and supported
  media open in Obsidian. Other recognized UTF-8 text files up to 2 MB open
  in a small autosaving text editor with a language selector, syntax preview
  and JSON formatting. Files without extensions and shebang scripts work too.
  Unknown binary formats remain for their usual applications.
- The active file's folder, navigator, console and directory stay in sync by
  default. Turn off **Follow active file** to keep browsing independently.
- **3D** opens a WebGL constellation of the current folder. Drag to orbit,
  scroll/pinch-wheel to zoom, and click filename buttons to navigate. A
  complete keyboard-accessible file list is available below the scene. Space
  shows at most 100 entries; filter to explore large folders. The scene uses
  no animation until **Orbit** is clicked and releases GPU resources on close.
  A file-list fallback works without WebGL.

These default shortcuts overlap with some Obsidian commands. Reassign either
binding in **Settings → Hotkeys**. On mobile, use the ribbon, command palette
and buttons. Mobile APIs are supported; mobile-device behavior has not been
verified. The plugin uses public Obsidian APIs and browser APIs only.

### Command line

This is a vault command line, **not a shell or terminal emulator**. It doesn't
launch processes. Type `help` for the full list. Examples:

```text
pwd
cd "/Writing a book"
ls
new "draft.json"
open "draft.json"
mkdir "Another chapter"
mv "draft.json" "Another chapter/draft.json"
find draft
cat "Another chapter/draft.json"
mode nietzsche
three
hello
```

Quotes group paths with spaces. Tab completes a path, and ↑/↓ recall command
history for the lifetime of the pane. There is no `rm`: use Obsidian's native
file explorer and trash behavior when deleting files. Rename/move operations
use Obsidian's file manager to preserve its link-update behavior.

External links can navigate with the registered URI:
`obsidian://yhwh?vault=My%20Vault&folder=Notes&view=three`.
`view=console` opens the command line, and `file=Notes%2Fexample.md` opens a file.

### Personality

The **Amount of YHWH-ness** slider has three stops:

| Mode | Behavior |
| --- | --- |
| Dawkins · 0% | Plain text wordmark, square controls, no character commentary. |
| Nietzsche · 50% | Muted wordmark, the obituary, and Nietzsche Family Circus on request. |
| YHWH · 100% | Paleo-Hebrew wordmark, purple accent, familiar irreverent commentary. |

No cartoons or other external content are loaded automatically. **Next cartoon**
fetches a random cartoon/quote pairing from `nietzschefamilycircus.com` using
Obsidian's HTTP API. It downloads just the pairing and image, with no site
scripts, advertisements or analytics. The source/permalink also opens in your
browser on request. All other plugin behavior is local. This is a personality setting, not
an AI assistant. The hello-world command demonstrates ordinary plugin
commands; Obsidian itself supplies the plugin system.

Every character message has an **Edit** button and a corresponding entry in
plugin settings. Edits are saved to plugin `data.json`, persist across updates,
and can be reset to defaults. They don't rewrite installed JavaScript.

**Help and about** links to The Dynamic Linker and *Genesis* by The Nameless.
**Offerings** contains the requested Stripe setup guide and a local file picker.
Payments and uploads are explicitly unconnected. Selecting a piece reveals
only its filename; sharing happens through your email app. **Coming soon**
holds the supplied advertisement text; Sync, Stuff and Dating aren't implemented.

## Folder configuration

Plugin settings provide defaults. Optional `.yhwh/rc` and `.yhwh/rc.obsidian`
files apply from the vault root down through each ancestor of the current
folder; `rc.obsidian` follows `rc` at each level. Later matching assignments
win. No config files are created automatically.

```text
# Vault root .yhwh/rc
/
    mode=yhwh
    accent="#b7a1ef"

"/Writing a book"
    title="Let there be words"
    bg="/Images/nebula.png"
    follow_active=false
```

Unindented lines contain one vault path, quoted when it contains spaces.
Indented lines contain literal `key=value` assignments. Blank lines and
comments are allowed. Supported keys: `mode` (`yhwh`, `nietzsche`, `dawkins`),
`energy` (`0`, `50`, `100`), `accent` (six-digit hex), `title`, `bg` (a vault
image), and `follow_active` (`true`, `false`). Relative paths start at the
directory containing `.yhwh`, not inside `.yhwh` itself. `/` always means the
vault root. Parent traversal is allowed inside the vault and rejected beyond it.

There is no shell execution, environment expansion, `/etc/yhwh` or home-directory
configuration. Unsupported assignments appear in Help and settings rather than
being silently evaluated. Change folders or run **YHWH: Reload folder
configuration** after editing. A folder setting overrides the global slider
until that folder's configuration is changed.

## Build, test and publish

Requires Node.js 22+ and npm for development. Installed plugins need neither.

```sh
npm ci
npm run check
npm test
npm run build
```

`npm run test:ui` launches an installed Obsidian application with a disposable
vault and profile; it never changes your existing vaults. Set
`OBSIDIAN_EXECUTABLE=/path/to/obsidian` if it isn't on `PATH`.
Screenshots are written to `yhwh/var/tmp/yhwh/obsidian/screenshots`. Add `YHWH_TEST_NETWORK=1` to
also exercise the optional live Circus request. The automated suite separately
tests publication against a local Git repository and a fixture for the GitHub
API; no real release is published by tests.

`main.js` bundles the implementation, with only `obsidian` external.
`styles.css` embeds the OFL-licensed Phoenician font, so releases need no
additional asset loader. `src/core.ts` owns path, command and configuration
rules. `main.ts` owns plugin state and Obsidian operations; the view files own
presentation. All navigation interfaces call the same `go` and `open` methods.

From the parent checkout:

```sh
yhwh/bin/yhwh-obsidian check
yhwh/bin/yhwh-obsidian package /tmp/yhwh-release
yhwh/bin/yhwh-obsidian export /tmp/yhwh-source
yhwh/bin/yhwh-obsidian publish --repo YOURNAME/yhwh --dry-run
yhwh/bin/yhwh-obsidian publish --repo YOURNAME/yhwh --submit
yhwh/bin/yhwh-obsidian submit --repo YOURNAME/yhwh --no-open
```

Create an empty **public** GitHub repository dedicated to the plugin first.
Authenticate `gh`, and configure your Git author name/email. `publish` builds,
type-checks and tests, clones that repository to a temporary directory, copies
the standalone plugin source to its root, commits and pushes its default
branch, then creates a release whose tag exactly matches `manifest.json`.
The parent YHWH vault and other app implementations are never published.
Existing version tags are rejected; update `manifest.json`, `package.json`
(including its lockfile) and `versions.json` for a subsequent release.

`submit` checks that the public default-branch manifest and the three release
assets match the local plugin, then opens the [official community directory](https://community.obsidian.md).
Sign into Obsidian, link GitHub, and add the repository. Obsidian's current
[submission instructions](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin)
require that account step and review; no direct registry push API is assumed.
`--dry-run` never authenticates, publishes, opens a browser or writes files.

## Scope

This plugin keeps Obsidian's vault boundary and `.obsidian` configuration,
and uses its workspace, existing themes and plugin system. It adds no separate
Electron app, shell, operating-system file manager, donation backend or nested
plugin framework. It doesn't modify the source apps in `yhwh/src/company`, `yhwh` or
`yhwh-three`. These constraints keep it an ordinary installable plugin.

Code: MIT. Phoenician font: SIL OFL 1.1, see `assets/OFL.txt`.
