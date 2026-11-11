# Application source and review engine

Application source is tracked at `root/src/`, with one build definition at `root/Makefile`. Run `make -C root` from the vault. Dependencies and generated output remain in the source tree's ignored `node_modules/` and `build/` directories.

The Electron interface, terminal interface, and CLI share one review engine. The selected review workspace owns its plan, decisions, drafts, and accepted changes.

`app/review.py` owns hunk splitting, comments, edited patches, branch guards, temporary indexes, and the acceptance journal. The CLI symlink keeps its directory as the default workspace; `--root` selects another workspace. The desktop starts in the current directory and remembers an explicitly chosen workspace.

`app/review.cjs` invokes Python with an argument array and JSON on stdin/stdout. The renderer uses dedicated IPC methods. Packages unpack the Python files for the external interpreter. Python, Git, and POSIX locking are runtime requirements.

Hunk navigation records reading progress. Acceptance applies to an entire paired round: every patch is checked against a temporary index before any branch advances. The acceptance journal allows interrupted operations to recover. Requested changes block acceptance until resolved.

Both interfaces use the workspace's lock and revision hashes. A stale save is rejected, preserving local unfinished text for comparison. Pause one interface before using another.

Run `make test` for core behavior against disposable repositories and `make test-ui` for the Electron workflows. These checks use isolated review workspaces.
