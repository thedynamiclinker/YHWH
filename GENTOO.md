# GENTOO

This checkout keeps the existing Unix/prefix layout. Human work remains in the
vault; application entry points, defaults, shared code and interfaces remain in
`yhwh/bin`, `yhwh/etc`, `yhwh/lib` and `yhwh/src`. The root `tmp/` and `run/` are
shared workflow instructions, not disposable build directories.

## Git and local files

The original history had 76 commits and approximately 154.5 MiB of Git data.
The replacement history has exactly ten commits, one for each of Genesis 1–10.
After pruning, the packed objects occupy approximately **80.4 MiB**, down from
**152.7 MiB** (about 47% smaller). Allocated `.git` storage dropped from about
**161 MiB to 81 MiB**. Most remaining binary data is referenced book imagery,
which stays versioned rather than breaking those pages.

Changes applied throughout the retained history:

- Removed the excluded external company's snapshots, prepared review data,
  repository inputs, migration inventory and verification script, and associated
  prompts and imperative archives. Historical credentials and shell-history
  exports are excluded as well.
- Preserved the generic company rehearsal and paired review capabilities. Their
  initial workspace is the caller's current directory, with the existing explicit
  workspace and saved-selection overrides. The reset command is now
  `yhwh/bin/company/reset-review.py`; Make requires `REVIEW_ROOT` explicitly.
  Tests use arbitrary `alpha` and `beta` repositories.
- Untracked installed Obsidian plugins, plugin data, graph state and workspace
  state. Existing local copies remain usable. `.obsidian/community-plugins.json`
  records which plugins to install on another machine. Shared vault settings,
  snippets and theme files remain versioned.
- Untracked `include/spread-sheet-music.mp4`, copied manuscript illustrations under
  `yhwh/src/company/reference/we-the-nameless/`, and their typesetting caches.
  These files remain on disk. A Git-only clone omits these reference copies;
  Obsidian Sync can carry the media, and the original book owns publication
  assets. The literary source text and the vault's referenced book illustrations
  remain tracked. No blanket image, PDF, `include/` or `var/` exclusion was added.
- Added ignores for dependencies, build/dist output, application `yhwh/var/`,
  Python and TypeScript caches, native/JVM compiler output, coverage, package
  archives, typesetting products,
  local review state, credentials, editor debris and OS metadata. Source, npm
  lockfiles and human task directories remain eligible for Git. Stale Python
  bytecode was also deleted from the working tree.
- Kept the absolute local `AGENTS.md` symlink and the one-off root `TODO` launcher
  outside Git. The launcher's identifying removal request was generalized so the
  excluded project name is absent from the working tree.
- Updated the application and source guides to reflect the retained capabilities
  and removed inputs. Obsidian file/index exclusions hide dependencies and output;
  they do not configure Obsidian Sync.

Large local references are intentionally outside Git. A future `git add -f` can
bypass ignores; inspect staged binary additions before committing.

## Ten chapters

These are edited development chapters, based on successive historical snapshots.
Intermediate commits and merge topology are folded into their chapter. The
chapter titles are a literary correspondence, not a claim that the software
implements each biblical event.

| Chapter | Commit title | Development retained at this boundary |
| --- | --- | --- |
| 1 | In the beginning | The initial application and literary source text |
| 2 | A garden to tend | The company rehearsal, themed review interfaces and practice workflow |
| 3 | Outside the garden | The shift toward executable English and Sudocode |
| 4 | The first descendants | The Unix vocabulary, prefix organization and growing interfaces |
| 5 | The book of generations | The new-world workflow and its task lineage |
| 6 | Build an ark | The preserved application immediately before the later flood |
| 7 | The Flood | The actual historical deletion of the old world and application trees |
| 8 | Dry ground | Restored interfaces and cleanup after the flood |
| 9 | Covenant and vineyard | Post-flood conventions, cleanup and naming |
| 10 | The table of nations | The current dictionary/prefix distribution and this repository cleanup |

The flood is a real tree change followed by restoration. Old remote-tracking
refs and reflogs are removed locally and unreachable objects are pruned, so
superseded history does not remain in the pack. No backup branch, tag or bundle
keeps the discarded objects alive here. The owner's other copy is the recovery source. Nothing has been pushed or changed
in that copy. The GitHub remote still has the original history; fetching it can
restore old remote-tracking refs and their objects. Publishing the replacement
history remains a separate, coordinated operation.

## Concurrent work and Obsidian Sync

Every developer needs an independent Git checkout and branch. Git metadata,
build output, installed dependencies and runtime profiles belong to that device.
Notes, todos, prompts, configuration and source are the shared project.

On **each** desktop and phone, before enabling Sync, open **Settings → Sync →
Selective sync → Excluded folders → Manage** and exclude:

- `yhwh/node_modules`
- `yhwh/var`
- `yhwh/src/company/reference/we-the-nameless/01-genesis/build`, if that local
  reference-cache directory is present

Apply equivalent exclusions to any additional `node_modules`, `build`, `dist`
or `texmf-var` directories created later. The existing build targets already put
application output in `yhwh/var/tmp/yhwh`; their paths have not changed. Run
`make deps` separately on each development machine. Phones do not need build
outputs or development dependencies to edit todos.

Git ignores do not control Sync. Sync exclusions are device-specific and cannot
be installed by committing a vault JSON file. Hidden Git internals are excluded
by Obsidian Sync itself. The checked-in `userIgnoreFilters` only hide files from
Obsidian's index and file views. See the official
[selective-sync documentation](https://obsidian.md/help/sync/settings).

In **Vault configuration sync**, keep terminal/plugin settings and workspace
layout local when they contain device paths or window state. Install the listed
plugins independently. Shared CSS and intentional vault preferences can still
sync. Untracking plugin code does not uninstall the existing local plugins.

Sync is not aware of Git branches. Pause Sync during checkout, rebase, reset or
large merges so temporary trees are not broadcast as edits. When working on
different code branches at the same time, exclude `yhwh/` from Sync on the coding
machines and exchange application changes through Git; the vault's notes and
todos can continue syncing. Resume only after the intended shared tree is ready.
Simultaneous edits to the same note still need conflict resolution.

These per-device settings were documented, not silently applied: changing other
machines or user configuration outside this directory was outside this task.

## Validation

Completed checks:

- 81 JavaScript tests and 14 Python tests passed: workflow, default interface,
  spatial interface, Obsidian plugin, company rehearsal and paired-review tests.
  The full test run exposed two reset regressions; retaining the generic reset
  implementation resolved them, and the affected suite passed on rerun.
- The Obsidian TypeScript check passed. `make build` successfully built all three
  interfaces. Dependencies and generated files remained ignored.
- The scripted interactive root rebase produced exactly ten linear chapter
  commits. The final tracked tree matched the prepared cleanup tree exactly
  before this report's final update.
- Every reachable Git object, historical path and commit was scanned for the
  excluded project name without a match. Every chapter was checked for generated
  dependency trees, build caches, installed plugins and repository bundles.
- Ignore-rule checks covered output, dependencies, local state and credentials,
  and confirmed that shared `tmp/` and `run/` tasks, source, lockfiles, snippets
  and authored images remain eligible. No ignored files remain tracked.
- All 54 intentionally untracked local files remain on disk. The local instruction
  symlink and task launcher remain, with the launcher's removal target generalized.
- `git diff --check`, the local launcher's Bash syntax check and `git fsck --full`
  passed. Reflogs, temporary rewrite/test data and old remote-tracking refs were
  removed; unreachable objects were pruned. The tracked worktree is clean.

No Electron UI, prefix installation or uninstallation tests were run. Test
profiles, temporary files and npm caches were confined to this directory and
removed afterward. No push or modification outside this checkout was performed.
