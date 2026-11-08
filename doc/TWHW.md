# TWHW

Run `./twhw` from this repository, or `make twhw`. The first launch uses the
YHWH interface and opens a prepared review in the current directory. The original
company-rehearsal app is still available with `make run`.

The **Amount of YHWH-ness** slider has three stops:

| Level | Interface |
| --- | --- |
| 100% · YHWH | Electron, the original purple and gold palette, Phoenician lettering, Genesis footnotes, and Yahweh as the review assistant. |
| 50% · nietzsche | Electron with a restrained editor palette, a plain review assistant, “God is dead.”, and Nietzsche Family Circus. |
| 0% · dawkins | Real Python ncurses, with the navigation on the left, the review in the center, the status and assistant on the right, and controls along the bottom. |

Both Electron levels keep the same panel positions. Dawkins uses the same
arrangement in terminals at least 100 columns wide; smaller terminals use a
compact layout. The minimum usable size is 45 columns by 10 rows.

```sh
./twhw --theme yhwh
./twhw --theme nietzsche
./twhw --theme dawkins
./twhw --root /path/to/review/workspace
make twhw THEME=nietzsche REVIEW_ROOT=/path/to/review
```

The last selected level and workspace are remembered. To return from dawkins
to Electron, press `t` and move the three-stop slider with Left/Right, then
Enter. `]` directly opens nietzsche. Selecting 0% in Electron opens xterm and
closes the desktop window after saving. `TWHW_TERMINAL` can name another
terminal executable that accepts xterm's `-e` and window options. You can
always launch dawkins directly inside an existing terminal.

## The review

The six views follow the shared `./review start` interface:

1. **Start** gives one next step and the reason for the current round.
2. **Diff** shows one colored, wrapping hunk, or the full paired diff. The left
   list jumps to any hunk. Read / next marks the current hunk read; navigation
   alone does not. Edit patch opens the selected repository's unified diff.
3. **Messages** edits the round title, Teams message, MR title and descriptions,
   and validation. Drafts save as you type. Save field or Ctrl-S finalizes a field.
4. **Notes** holds anchored comments, requested changes, and unfinished drafts.
5. **Roadmap** shows the prepared sequence and each round's status.
6. **Context** opens the actual task, conversation, interface guide, validation,
   provenance, accepted handoff, and Obsidian board from the selected workspace.

Enter moves Start → hunks → messages → acceptance preview. Only the explicit
confirmation accepts the paired round. Unfinished drafts and requested changes
block acceptance until they are finished, discarded, or resolved. The preview
shows the final copy and validation, the number of hunks read, and affected
repositories. Acceptance prepares every commit before moving local `master`
refs, without changing the original checkouts or their indexes. Nothing is
pushed or posted. An interrupted acceptance resumes from its existing journal.

Common keys: `1`–`6` or Tab change views; Left/Right navigate hunks; `d` toggles
the full diff; `f` chooses a hunk; `c`/`n` open notes/requested changes; `e` edits
messages; `E` edits a patch; `r` resolves; `a` previews acceptance; `y` confirms
inside that preview; `q` saves and pauses; `?` opens help. In dawkins, `s` opens
the review assistant, and `S` chooses its engine. Its text editor uses Ctrl-S to submit and Esc to retain
a draft. Scroll with arrows, j/k, Page Up/Down, or Space.

The assistant uses the existing Codex/Ollama implementation. Codex is the
default engine, with xhigh reasoning and full access, and needs `codex login`.
Electron's assistant settings also offer Ollama and scripted offline guidance.
Nietzsche and dawkins use plain language rather than the Yahweh persona.
Conversations are kept separately by level and workspace.

## Shared state and implementation

`src/review.py` owns the review operations and Git transaction. The original
YHWH review panel, TWHW's Electron renderer, and `src/review_tui.py` call that
engine. The CLI reads and writes the same `.review/state.json`,
patch overrides, content-addressed hunk markers, editor draft keys, and screen
positions. Pause one interface before opening another; the workspace lock
prevents simultaneous mutation. Electron rejects stale decisions if the CLI
changed the round. Refresh retains local unfinished text for comparison.

Prepared workspaces can use `The Review/The Accepted Rounds.md` and
`The Review/The Board.md`. Older prepared workspaces still use `MASTER.md` and
`Kanbun.md`; the engine selects the workspace's existing convention.

TWHW preferences and assistant history live in
`${XDG_CONFIG_HOME:-~/.config}/TWHW/twhw.json`; workspace selection is in the
neighboring `review.json`. Set `TWHW_DATA_DIR` for an isolated profile. Review
decisions always remain in the selected workspace. `YHWH_PYTHON`,
`YHWH_ELECTRON`, and `YHWH_CODEX` retain their existing meanings.

The Circus widget fetches the pairing chosen by
[Nietzsche Family Circus](https://nietzschefamilycircus.com/), whose server
independently selects a Family Circus cartoon and Nietzsche quote. Next fetches
another pairing; Share copies the original `perm.php?c=…&q=…` permalink.
`src/circus.cjs` reads the returned HTML and image in the main process. The
renderer receives only text and an image data URL; the site's scripts and ads
are not embedded. It requires internet access and shows a retryable error if
the site cannot be reached or changes its markup.

Run `npm test` for the Git, draft, assistant, and real pseudoterminal tests.
Run `npm run test:ui` for the original app and both TWHW Electron levels.
Screenshots are written to `artifacts/twhw-*.png`.
