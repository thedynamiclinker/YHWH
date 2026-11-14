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

`imperative/` holds the exact executable English instructions accepted with
`yhwh add`. Archives keep their executed contents and executable mode, with
descriptive `YYYYMMDD-HHMMSSZ-name-taskid-attempt` basenames in UTC. Do not edit
an executed instruction; use a new task for new instructions.

`declarative/` holds Markdown descriptions of verified, enduring system behavior.
`yhwh commit` generates or updates these descriptions from the accepted changes,
then commits the implementation, imperative archive and related descriptions.
One-time maintenance may need no declarative document. Describe what is now true
in the present tense; update existing descriptions rather than contradict them.

`log/0001-primeval-history/` contains everything formerly in `doc/`, unchanged.
It is a historical snapshot, and many descriptions are no longer current.
Its original paths and instructions are preserved as history. New workflow
records belong in the active `var/imperative/` and `var/declarative/` directories.

Drafts still belong in `tmp/`, and approved executable scripts in `run/`.
`yhwh run` records execution; a human inspects the results before `yhwh add`
accepts them. Direct script execution does not perform workflow bookkeeping.
Task metadata, answers and execution snapshots remain in the worktree's
Git-private `yhwh` directory.

The recovered [installation prompt](../PROMPT-on-make-install-and-make-develop.md)
and [workflow prompt](../PROMPT-on-the-yhwh-workflow.md) are available for review.
Moving top-level TODO files into this history and generating better basenames
from their prompt contents are planned work; this change only relocates the
existing storage paths.
