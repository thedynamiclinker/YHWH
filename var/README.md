# Instructions, descriptions and history

This directory holds shared workflow records:

```text
var/
    log/
        0001-primeval-history/
            README.md
            imperative/
            declarative/
    imperative/
    declarative/
    README.md
```

`imperative/` preserves original executable English prompts and the exact
instructions accepted with `yhwh add`. Older prompts use dated descriptive
names. Managed archives preserve executed contents and executable mode and use
`YYYYMMDD-HHMMSSZ-name-taskid-attempt` basenames in UTC. Do not edit an executed
instruction. Use a new task for new instructions.

`declarative/` holds Markdown descriptions of enduring desired app behavior
and authored content. Its [index](declarative/README.md) is read through the
root `AGENTS.md` during app work.
`yhwh commit` generates or updates these descriptions from the accepted changes,
then commits the implementation, imperative archive and related descriptions.
One-time maintenance may need no declarative document. Describe what is now true
in the present tense; update existing descriptions rather than contradict them.

`log/0001-primeval-history/` contains everything formerly in `doc/`, unchanged.
It is a historical snapshot, and many descriptions are no longer current.
Its original paths and instructions are preserved as history. New workflow
records belong in the active `var/imperative/` and `var/declarative/` directories.

`yhwh begin` creates `tmp/` when it writes a non-executable Markdown draft.
`yhwh review` creates `run/` when it writes an approved executable script.
Both directories are optional workspace state. Their absence is equivalent to
an empty draft or script list. `make` and agent prompts work without them.
If a draft or approved script is deleted before execution, `yhwh begin` can
generate a fresh draft for the original kanban item.

`yhwh run` records execution, then a human inspects the results before
`yhwh add` accepts them. Direct script execution has no workflow bookkeeping.
Task metadata, answers and execution snapshots live in the worktree's
Git-private `yhwh` directory.

The New World Shell iteration script keeps a timestamped row per invocation
in [log/new-world-shell-runs](log/new-world-shell-runs), keyed by the Git
content ID of its prompt. If that prompt is submitted directly again, read the
ledger, ask multiple-choice questions grounded in the current app, and record
the invocation before implementing another pass. The script asks first when
run from a terminal and includes the answers in the request.

The shell design notes and the Heisig catalogue live in the project archives. [The shell and the sign of the dollar](log/yhwh-sign-of-the-dollar/) · [New Human School](log/new-human-school/)
