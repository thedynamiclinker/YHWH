# COVENANT and prompt review

COVENANT is the project's Obsidian Kanban board. It holds simple tasks in simple language. Each task has a draft prompt that humans can read and change before YHWH does the work.

## Tasks and drafts

Tasks appear on [[COVENANT]] as soon as they are requested. Their names say what the work is. These are examples of the naming style, not a fixed task list:

- Payment: Book
- Payment: Upgrades
- Payment: Burnt Offering
- Payment: Piece Offering
- Codebase: Top level Makefile
- Codebase: Top level AGENTS.md
- Needs Prompt: Cvnt (YHWH's Dating App)

Each task gets an attempt at a useful prompt in the top-level `אמר/` directory. A card links to its draft so a human can find the instructions directly from the board. Tasks with drafts awaiting review belong in **Review prompts**. A task that is too unclear to implement can have a prompt for clarifying the work and drafting the next prompt.

Drafts use the same shell form as the imperative prompts in `yamr/`:

```bash
#!/usr/bin/env bash

lordhavemercy -f --verbose << "EOF"
The task in simple language, with enough context and clear completion checks.
EOF
```

Draft filenames end in `.md` so Obsidian can open them from the board. The file contents remain valid Bash with a shebang and a quoted heredoc; an approved draft can run directly as an executable file regardless of its extension. The quoted heredoc preserves the prompt text literally. A draft names the relevant existing behavior, the intended result, and any choices the humans need to settle. Missing details remain visible for review.

## Human review and work

[[TODO]] gives the humans one job: review the drafts in `אמר/` and make any changes they need so YHWH can do them.

Draft creation does not authorize execution. Approval comes from the humans. After approval, they can move a prompt to a destination they choose later or directly tell YHWH to do it. No approved-prompt directory is assumed in advance.

An approved task belongs in **Ready**, work underway belongs in **Doing**, and completed work belongs in **Done**. If a prompt moves, its card follows the new location. A completed drafting task does not imply that the feature described by its resulting prompt has been built.

## Imperative prompts and declarative descriptions

`yamr/` preserves imperative prompts. `yhy/` describes the enduring intended behavior in declarative language. A workflow description states the recurring relationships and rules; the particular tasks that introduced it become examples.

Archived imperative prompts have names in the form `YYYYMMDD-HHMMSS-name`. The timestamp comes from the file's last modified time in local time. Archiving or adding a missing prefix preserves the prompt's contents, executable mode, and last modified time. An existing timestamp prefix stays as it is. Links to renamed files follow the archive names.
