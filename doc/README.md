# Instructions, descriptions and Git

The workflow is `COVENANT/kanban → tmp → run → doc/imperative → doc/declarative → Git`.
Brief todo cards in `COVENANT.md` may link to Markdown items in `kanban/`.
Names may be basenames, full listed relative names, titles or stable task IDs.
Ambiguity is an error; interactive lists resolve it without guessing. Bash and
zsh completion offer eligible names for the current phase.

1. `yhwh begin [TODO]` inspects the repository through an agent and writes a
   descriptive Markdown draft in `tmp/`. It keeps the original intent, proposed
   implementation, concrete unresolved questions, blockers and assumptions
   together. It never executes or approves a draft.
2. `yhwh review [DRAFT]` rechecks which questions still need human decisions, collects answers, saving each immediately, then asks the
   agent to finalize the instructions. `--answers FILE` accepts a JSON object
   keyed by question ID for automation. Missing answers or remaining blockers
   leave the draft in place. A successful review creates executable `run/NAME`
   with `lordhavemercy -f --verbose << "EOF"` and removes the superseded draft.
   Drafts have a visible `yhwh-review-data` JSON section for structured questions;
   preserve task metadata when editing them.
3. `yhwh run [TASK ...]` offers Space/Enter selection, including all tasks, or
   accepts explicit names and `--all`. It executes sequentially, respecting
   comma-separated `# yhwh-depends: task-name, other-task` headers. Failures stop
   the batch, retain the task and never retry automatically. `--retry NAME`
   explicitly retries failed/interrupted/unaccepted work after inspection.
   Success records an exact immutable script snapshot, exit status, output and
   before/after Git trees. It does not accept, document or commit changes.
4. After inspecting the results, `yhwh add [TASK]` accepts a successful execution.
   It archives the exact executed bytes and executable mode in `doc/imperative/`,
   removes the unchanged script from `run/` only after archival, and stages the
   related changes. A later edit to the run script is preserved. Acceptance does
   not generate declarative documentation or commit.
5. `yhwh commit [TASK]` inspects the accepted diff and actual files through an
   agent, updates `doc/declarative/` if an enduring property resulted, then stages
   and commits the coherent task. It may explicitly record that maintenance needs
   no declarative document. One fresh summary line precedes a blank line and the
   **actual original imperative heredoc body**, wrapped with `fold -s -w 72`.
   The Bash wrapper and delimiters do not appear in the message. The archive is
   the authoritative exact instruction. Git connects implementation, instruction
   and the verified description of the resulting system.

Direct `run/NAME` execution is ordinary Bash. It does not move files, record a
managed execution, accept results, generate documentation or stage/commit work.
To associate a direct run explicitly, first save an execution snapshot elsewhere
and capture `TREE=$(yhwh run --baseline)`, execute that saved script, then use
`yhwh run --record-direct NAME --baseline "$TREE" --executed-script SNAPSHOT --exit-code CODE`.
This is a human attestation that the exact snapshot produced those results;
unrecorded direct runs are never inferred. A fresh managed execution is another
option. Keep the snapshot outside the Git worktree so it is not implementation.

No-argument begin/review/run/add use keyboard-friendly terminal selection.
Commit infers a sole pending accepted task; otherwise it offers selection.
`--list` provides names without generation or execution. Explicit names support
scripts and automation. Task metadata, answers, execution snapshots and unfinished
phases live in the worktree's Git-private `yhwh` directory, outside Obsidian Sync.
Shared task IDs in drafts, scripts and archive names maintain associations.
Interrupted archive/document/commit phases resume without executing tasks again.
Overlapping tasks, modified accepted files and pre-existing dirty files touched
by a task are reported for separation. Unrelated staged/unstaged work is preserved
and reported, so a clean status is the normal result only when no unrelated work
was present. Git must already have an initial commit.

Generation uses read-only `lordhavemercy --profile chat --no-agents --quiet` by
default. `YHWH_AGENT=/executable` overrides it with a program reading one JSON
request on stdin and returning one JSON response on stdout; stderr is progress.
Protocols and prompts live in `yhwh/etc/workflow/`. Failure never advances the
phase. Run scripts intentionally use the user's ordinary `lordhavemercy` command.

Imperative archives use descriptive `YYYYMMDD-HHMMSSZ-name-taskid-attempt`
filenames, in UTC. Existing historical names retain their original timestamps
and exact script contents. Never rewrite an executed instruction; create a new
task for new instructions. Collisions fail safely rather than overwrite history.

Declarative documents use descriptive `.md` names, headings, direct present-tense
statements and Obsidian links where useful. Describe what is now true, for example:
“The spatial interface lives in `yhwh/src/yhwh-three` and opens with
`yhwh open three`.” Update existing descriptions instead of accumulating
contradictions. Distinguish verified behavior from aspirational requirements in
older feature specifications. Do not manufacture documentation for one-time
maintenance. Agent development prompts and historical drafts belong in
`bin2/imperative`; internal application programs belong in `yhwh/bin`.
