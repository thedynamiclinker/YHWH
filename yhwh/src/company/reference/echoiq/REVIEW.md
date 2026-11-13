# Local PR rehearsal

Run from this directory:

```bash
./review start                     # begin or resume the current round
./review status                    # see the whole sequence
./review show --diff               # inspect the current paired patch
./review comment "Review comment"  # leave a persistent round comment
./review reject "Requested change" # hold this round for revision
./review edit                      # edit the Teams message and MR copy
./review edit-patch es-as           # edit a candidate patch with $EDITOR
./review resolve                   # mark requested changes addressed
./review accept                    # accept the current paired round locally
```

The interactive prompt shows one diff hunk at a time. `y` or Enter advances,
`p` goes back, `c` comments on the displayed file, `n` requests a change,
`e` edits the message/MR text, `E` edits a repository's patch, `d` shows the
whole diff, `a` accepts the paired round, and `q` pauses. Reading a hunk does
not accept a commit. Decisions, comments and copy edits survive restarts.

Run this CLI in a terminal, or review the same round in chat. In chat, tell
the assistant to accept, request changes, leave a comment or revise the draft;
the assistant can apply the decision with the same commands. There is no
connection to Teams or GitLab and no external message is sent.

## Branches and files

- `mainer` is the original source branch in each repository and stays intact.
- `mistress` contains the full prepared sequence. Its isolated checkouts are
  under `.review/worktrees/`; the original checkouts stay on `mainer`.
- `master` in each model repo starts at its recorded `main`. The existing
  `es/master` starts at its recorded original head. Acceptance adds one commit
  per participating repository; most rounds are paired, with HF-only fixes
  and fixtures and one `es` dispatch round.
- `.review/plan.json` records immutable source/base IDs, draft commit IDs,
  draft Teams/MR text and validation notes. `./review show` uses that plan.
- `.review/state.json` records decisions, comments and final copy overrides.
- `MASTER.md` receives only accepted rounds and their finished messages.
- `Kanbun.md` tracks prepared, reviewing, changes-requested and locally
  accepted rounds. “Done” means accepted in this rehearsal, not merged at work.

Nothing is pushed, and no branch of a remote repository is changed. Neither
the original checkout nor its index is used for acceptance. The CLI prepares
both commits with a temporary Git index before updating either `master` ref.
If interrupted between updates, `./review sync` finishes the recorded local
transaction. Unexpected external movement of a branch stops recovery for
inspection. Keep `master` out of other worktrees while using this tool.

Patch edits are checked against the current accepted branch using Git's
three-way application. A conflict stops the round before refs move. If an
earlier edit affects a later patch, revise that later patch when it comes up.
Code edits need their own validation; recorded checks describe the prepared
drafts and do not automatically validate arbitrary review edits.

The CLI uses Python's standard library and POSIX file locking. It runs locally
on this Linux workspace. `prepare_reviews.py` created the draft branches and
refuses to replace an existing completed plan; ordinary review never reruns it.

## Why this order

The first round only removes exact dependency pins and Python constraints.
The next rounds fix installation friction and concrete compatibility issues.
The original runner gets an installed name before a separate streaming runner
is introduced. Comparison tools arrive one at a time: streams, parallelism,
row limits, then printed precision. Runtime choices follow, then first-use
installation, wheel checks and the optional Python switch. Documentation and
larger HF data samples finish the sequence.

Each message explains a visible benefit in one or two sentences. Each MR
describes its actual scope. Runtime and dependency comparisons still need
evidence; removing pins by itself does not establish equivalent predictions.
The local shell history informed the installation-friction discussion; its
contents and credentials are not included in the drafts or model commits.

Long CLI instructions from `mainer` are preserved in each repo's `CLI.md` so
the README additions stay brief. Superseded Git-URL dependency instructions
and one stale AS test assertion are corrected. Model source at the end of the
sequence is identical to `mainer`; see `.review/VALIDATION.md` for the audit.

## Kanbun©®™

Use the Obsidian board directly for ordinary tasks, or:

```bash
./review task-add Todo "Run the full runtime comparison matrix"
./review task-move "In Progress" "Run the full runtime comparison matrix"
./review task-move Done "Run the full runtime comparison matrix"
```

Review cards have `[RNN]` IDs and move with review decisions. Other cards are
preserved by `./review sync`. The assistant can work on independent board
tasks between decisions; the review process itself does not block preparation
or testing in the separate draft worktrees. A waiting chat turn does not run
background work by itself.
