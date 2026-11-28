# LD / LM

LD links English instructions and supporting files. LM loads the result into
Lord as an executable request. The name plays on William F. Albright’s reading
**ʾL Ḏ ʿLM**, “El, (god) of eternity,” in a Proto-Sinaitic inscription.

## Link and run

```sh
yhwh ld request.md context.md > plan
cat plan
yhwh lm plan
```

`ld` is local and deterministic. It emits a Bash script containing one quoted
heredoc, so the linked text reaches Lord literally. The script can also run
directly after `chmod +x plan`. `lm` accepts ordinary English or Sudocode the
same way it accepts a linked file. Both execution paths give Lord its
workspace-write permission under the account running the command. A universe’s
`/` is its directory root. OS administrator privileges come from the host.

## Make the prompt

```sh
yhwh gen --no-refine fix terminal focus in gui > draft.md
yhwh names draft.md > review.json
yhwh ask draft.md
yhwh add draft.md constraints.md < context.md > request.md
yhwh nsh request.md > request.sudo
```

- `gen` uses text-mode Lord and prints a draft or the result of terminal refinement. It saves the original draft under `${TMPDIR:-/tmp}/yhwh-gen-*/draft.md` on Unix, plus `refinement.json` when refined.
- `ex` and `nm` ask fewer questions than `names`. Use a numbered option or **Other**, `/skip` to leave a question open, and `/done` to finish. Enter `c` when YHWH reports that he's done to ask for another pass. The JSON fields are `original`, `interaction`, and `updated`.
- `ask` is the same as `ex --test`. You supply the questions. The transcript records the answers and keeps the source prompt intact.
- `code` and `shell` use the default Sudocode dialect. `sh` favors familiar shell vocabulary. `nsh` favors terse pipelines and invented commands. Run Sudocode with `yhwh lm`.
- `add` merges files and stdin. Use `-` to place stdin at a specific position, `-f FILE` to require a file, or `--` before literal words. The existing workflow’s `add --task NAME` accepts a completed task. Drafting, clarification, merging, and Sudocode translation use text-mode Lord.
- `yhwh do request.md` sends the request to Lord in the enclosing Git checkout, together with its existing `doc/law/*.md` rules. Inspect the changes and any added law with `git diff` and `git status`.

Put the application’s `bin` directory and Lord’s `lord` and `lordhavemercy` on
`PATH`. Lord owns provider selection and authentication. On Android and iOS,
the pitch, letters, and images are bundled. The executable workflow runs on a
Unix host. On desktop and Three, run the commands from the terminal.
