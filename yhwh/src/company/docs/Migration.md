# Moving the rehearsal room into its own vault

The Obsidian vault lives at `~/obsidian/YHWH`. Application source is tracked
inside it at `yhwh/src/company/`, with one build definition at `root/Makefile`.
Run `make -C root` from the vault to build and open THWH, or add `yhwh` for
the company rehearsal. Package manifests and the Nix shell stay in `yhwh/src/company/`;
dependencies and generated output stay in its ignored `node_modules/` and `build/`.
The default EchoIQ workspace is resolved independently of the build directory.

The application was briefly moved to an external checkout and `yhwh/src/company` was
recorded as a Git submodule without submodule configuration. It is now ordinary
source in this repository, so a checkout contains the app. The Makefile resolves
paths relative to itself and also works when invoked with `-f` from elsewhere.

The creation prompt names both `TODO` and the Genesis manuscripts. Following `TODO` also reaches the group conversation, company repository inputs, and the `es` example layout. The credential-bearing shell-history export was removed from the repository and its Git history. Their local homes are documented in [the source map](../reference/README.md). The shared literary project was copied, including the full Genesis directory and its ordinary referenced images; it was neither moved out of its book nor built. Company repositories were captured with `git bundle create --all`, preserving all refs and reachable history while leaving their checkouts intact. Each bundle is self-contained and can be cloned independently. KDP-specific image variants mentioned inside conditional book-build expressions remain part of the original book's production system; the manuscripts and their normal image assets are included here as reading context.

## One review engine, two interfaces

The original `EchoIQ/review` implementation now lives in `app/review.py`. The application’s `bin/review` is a relative symlink to that file. The desktop and terminal interfaces share it. The engine resolves the workspace from the CLI's invoked location or an explicit `--root`; Electron always passes the selected workspace explicitly.

`app/review.cjs` invokes Python with an argument array and a JSON stdin/stdout boundary. The renderer receives only dedicated IPC methods for reading, choosing a workspace, and applying supported review actions. It has no shell or filesystem capability. Packages unpack the Python file so the external interpreter can read it. Python, Git, and POSIX locking are runtime requirements for this workflow.

Both interfaces use the same hunk splitting, comment persistence, message/MR overrides, edited patches, branch guards, temporary indexes, acceptance journal, MASTER.md recording, and Kanbun synchronization. The UI adds presentation and selection preferences; it does not create a second review state or reimplement Git acceptance.

Hunk navigation is a reading cursor. Acceptance is a decision about the entire current paired round. All participating patches are applied to temporary indexes before any branch advances. Interruptions after the journal is saved are recovered by the original mechanism. Requested changes block acceptance until explicitly resolved. Idle desktop refresh sees agent/CLI changes, and revision hashes reject stale editor saves or decisions. Pending local editor text survives that rejection so it can be compared after refresh.

The prepared EchoIQ session remains at its existing workspace. Its accepted rounds and current R03 feedback were not migrated into a demo or replayed. The app connects to that session by default; another prepared session can be chosen through the native folder dialog. The POC's company rehearsal feature still uses its own isolated repositories and saved company state.

## Validation

From `root/`, run `make test` for the original company tests, desktop/CLI integration against disposable paired repositories, and the original Python acceptance/recovery tests. Run `make test-ui` on a display for both the original Electron workflow and the hunk review workflow. All automated review decisions occur in temporary repositories, including invalid-patch rejection and real paired acceptance. UI screenshots are written to `src/build/screenshots/`.

`make verify-migration` checks every file in the migration inventory. Original hashes remain recorded; files intentionally changed during integration also record their final hashes. Bundle verification is performed with Git. The migration does not start reviews, accept rounds, publish messages, push branches, or build the book.

Validated on November 6, 2026: all 15 JavaScript and 8 Python core tests passed, both Electron UI suites passed, and the shared review UI suite also passed against the packaged application using native Electron 43.8.3. The inventory verifies 134 files and repository snapshots. Direct comparisons confirmed that the live R03 state, MASTER.md, Kanbun.md, and all three company repositories' refs remained unchanged.

Historical validation of the external relocation on November 8, 2026: the vault’s build targets, 31 JavaScript tests, 12 Python tests, all four Electron UI suites, packaging, and the 134-file migration inventory passed. Launch tests exercise Make from both the application directory and the vault, and confirm that the default EchoIQ location does not depend on the source directory. All 1,889 original application files were present after the move.
