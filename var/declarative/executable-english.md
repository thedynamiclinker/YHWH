# Executable English

- The Unix `yhwh` entry point dispatches built-ins and executable `yhwh-NAME` programs on PATH. If neither defines a command, ask Lord in text mode to interpret it, explain the likely intent, and suggest syntax.
- `cvnt` and `yhwh cvnt` open an interactive root login shell using system sudo and its authorization policy. Type `exit` to return to the invoking shell.
- Prompt commands accept literal arguments, existing files, `-f FILE`, and stdin. Keep interactive dialogue and status separate from the result on stdout.
- `gen` drafts with text-mode Lord, saves `draft.md` in a fresh `yhwh-gen-*` directory under the system temp directory, and opens refinement if a terminal is available. A refined result goes to stdout and the session is saved beside the draft. `--no-refine` prints the rough draft.
- `ex` and `nm` offer a quick round of clarifications. `names` probes more deeply. Questions center on one word or phrase and offer two to five choices plus a way to write an answer. The reader can skip, stop, or ask for more questions. `--test` and `ask` let the reader quiz YHWH about the supplied prompt. The JSON result preserves the original, interaction, and updated prompt.
- `code` and `shell` turn prompts into readable Sudocode. `sh` favors familiar shell forms and `nsh` favors short recursive commands and pipelines. Preserve the source meaning.
- `add` merges supplied text into a unified prompt, including piped input and file arguments. `add --task` accepts an existing workflow result. Names of recorded workflow tasks also work with the older syntax.
- `do` invokes Lord with workspace write access in the current Git checkout. It reads applicable repository instructions and durable rules in `doc/law/*.md`. It records new enduring rules from verified changes in that directory and leaves the worktree for review.
- `ld` writes one Bash script with a quoted `lordhavemercy -f` heredoc. Link before execution, preserving source text and order. `lm` loads that heredoc, raw English, or Sudocode into Lord. Execution uses the invoking user and Lord’s workspace permissions.
- Genesis and Exodus expose the illustrated LD / LM pitch in About YHWH. The shared desktop, Three, Android, and iOS Inbox plays the Getting Root arc as local letters. Shaddai presents image paths, and the Obsidian plugin presents the bundled letters and images on demand. Unix execution requires a shell host with Lord installed.

[Command guide](../../doc/ld-lm.md) · [Getting Root source material](../../yhwh-getting-root-story-arc-and-ld-lm/YHWH%20-%20Getting%20Root.md)
