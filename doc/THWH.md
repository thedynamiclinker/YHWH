# THWH

Run `make` or `make thwh` to build and launch, or `./thwh` to launch directly.
The first launch uses the
YHWH interface and offers **Start practice review** in Start. The original
company-rehearsal app is available with `make yhwh`. For separate steps, use
`make build-thwh` / `make run-thwh` or `make build-yhwh` / `make run-yhwh`.
Building prepares the shared locked dependencies; the apps run directly from source.

The **Amount of YHWH-ness** slider has three stops:

| Level | Interface |
| --- | --- |
| 100% · YHWH | Electron, the original purple and gold palette, Phoenician lettering, Genesis footnotes, and Yahweh as the review assistant. |
| 50% · nietzsche | Electron with a restrained editor palette, a plain review assistant, “God is dead.”, and Nietzsche Family Circus. |
| 0% · dawkins | Monochrome DOS/TTY-style Electron: monospaced text, black background, square controls, plain assistant, and no decorative widget. |

All three levels keep navigation on the left, the review in the center, and
the assistant on the right. Dawkins uses compact spacing and text controls.

```sh
./thwh --theme yhwh
./thwh --theme nietzsche
./thwh --theme dawkins
./thwh --root /path/to/review/workspace
make thwh THEME=nietzsche REVIEW_ROOT=/path/to/review
```

The last selected level and workspace are remembered by `./thwh`. The slider
switches all three levels in the same desktop window, keeping unfinished
editors, the assistant composer, and your review position. `make thwh` passes
its explicit `THEME` value (default `yhwh`). No terminal emulator is needed.
The original ncurses interface remains available with `./review --root PATH start`.

The company-rehearsal app also supports `make yhwh THEME=dawkins`, or
**Settings → Interface → dawkins**. It shares the terminal presentation in
`src/dawkins.css`; its normal rehearsal and draft controls remain available.

The visible **Help** menu in every desktop level offers **About Us** and
**About YHWH**, opening their pages in your browser.

## The review

New to THWH? Choose **Start practice review** on the opening screen, or
**Practice review** in the sidebar at any time. Eight short lessons teach the
actual controls: open a diff, mark both hunks read, save an anchored note,
request a clearer message, finalize the message, resolve the request, accept
the sample pair, and find the accepted handoff. Each lesson advances when the
action is completed. **Show this step’s controls** takes you to the relevant
view and focuses the control. Buttons and the normal review shortcuts both work.

Practice creates two tiny Git repositories under the THWH profile, using the
same Python review engine and acceptance transaction as a real review. It
needs no prepared workspace, account, model, or downloaded sample project.
The assistant gives scripted lesson guidance during practice, preserving your
normal engine choice. **Leave practice** returns to your selected review with
its existing drafts and position. **Use my review** skips the introduction;
practice remains available in the sidebar and keyboard help. Progress and
completion survive restarts. After finishing, **Practice again** resets only
the sample review.

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
inside that preview; `q` saves and pauses; `?` opens help. The assistant and
its settings stay in the right panel at every level. Ctrl-S finalizes a review
field. Scroll with arrows, j/k, Page Up/Down, or Space.

The assistant uses the existing Codex/Ollama implementation. Codex is the
default engine, with xhigh reasoning and full access, and needs `codex login`.
Electron's assistant settings also offer Ollama and scripted offline guidance.
Nietzsche and dawkins use plain language rather than the Yahweh persona.
Conversations are kept separately by level and workspace.

## Shared state and implementation

`src/review.py` owns the review operations and Git transaction. The original
YHWH review panel, THWH's Electron renderer, and `src/review_tui.py` call that
engine. The CLI reads and writes the same `.review/state.json`,
patch overrides, content-addressed hunk markers, editor draft keys, and screen
positions. Pause one interface before opening another; the workspace lock
prevents simultaneous mutation. Electron rejects stale decisions if the CLI
changed the round. Refresh retains local unfinished text for comparison.

Prepared workspaces can use `The Review/The Accepted Rounds.md` and
`The Review/The Board.md`. Older prepared workspaces still use `MASTER.md` and
`Kanbun.md`; the engine selects the workspace's existing convention.

THWH preferences and assistant history live in
`${XDG_CONFIG_HOME:-~/.config}/THWH/thwh.json`; workspace selection is in the
neighboring `review.json`. Set `THWH_DATA_DIR` for an isolated profile. Review
decisions always remain in the selected workspace. `YHWH_PYTHON`,
`YHWH_ELECTRON`, and `YHWH_CODEX` retain their existing meanings.
On first launch after the spelling correction, an existing default `TWHW`
profile moves to `THWH`, and its `twhw.json` becomes `thwh.json`. An existing
`THWH` profile takes precedence. The old `TWHW_DATA_DIR` override is still
recognized so explicitly selected profiles keep working.

`tutorial.json` saves lesson progress; `practice-review/` contains only the
sample repositories and their review records. Entering practice routes review
operations to that directory without changing `review.json`. The lesson rules
and sample creation live in `src/tutorial.cjs`; presentation stays in the THWH
renderer. The original YHWH company walkthrough uses its existing workflow.

Run `node --test test/tutorial.test.cjs` for practice isolation and review
decisions, and `node scripts/tutorial-ui-test.cjs` for the complete desktop
lesson sequence, resume/replay, keyboard controls, and theme layout. Both use
temporary profiles and repositories. The desktop test is included in
`npm run test:ui` and saves screenshots under `artifacts/`.

The Circus widget fetches the pairing chosen by
[Nietzsche Family Circus](https://nietzschefamilycircus.com/), whose server
independently selects a Family Circus cartoon and Nietzsche quote. Next fetches
another pairing; Share copies the original `perm.php?c=…&q=…` permalink.
`src/circus.cjs` reads the returned HTML and image in the main process. The
renderer receives only text and an image data URL; the site's scripts and ads
are not embedded. It requires internet access and shows a retryable error if
the site cannot be reached or changes its markup.

Run `npm test` for the Git, draft, assistant, and real pseudoterminal tests.
Run `npm run test:ui` for the company app and all three THWH desktop levels.
Screenshots are written to `artifacts/thwh-*.png`.
