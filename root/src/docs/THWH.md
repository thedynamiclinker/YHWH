# THWH

From the vault, run `make -C root` to build and open it. From `root/`, use `make`. `make yhwh` opens the company app.
Both run from source. `make help` lists the commands.

Your prepared review opens directly. **Start** and **Changes** have a
**How should these commits look?** box for rough instructions, examples, or
reactions about the whole sequence. **Save instructions** keeps them in the
workspace's `.review/state.json`. **Apply saved requests** uses Codex to revise
the draft history using those instructions and all unhandled review comments.
It reads the task/context files before editing and preserves the original
source branch and accepted commits. Review its result and updated patches.
Ollama and fixed replies cannot apply changes; the app explains this if selected.

The assistant receives the whole sequence and saved instructions on every turn.
Enter sends chat; Shift+Enter adds a line. Unsent chat survives a restart, and a
failed model call preserves the request for retry. Changing the appearance keeps
the conversation. External CLI changes refresh while the editors are idle.

**Practice review** is optional. Two tiny repos, mostly Python, four changes:

- Remove an exact package version from `requirements.txt`.
- Replace a local logging helper with Python's `logging.basicConfig`.
- Find `words.txt` beside `words.py`, rather than in the current directory.
- Replace JavaScript's `||` with `??` so a limit of `0` stays `0`.

These are small versions of real installation and cleanup problems. No company
or medical knowledge is needed. No packages are downloaded. Creating the sample
runs Python from outside the repos and checks the JavaScript default values.
The **Checks** box says exactly what ran and what remains untested.

The instructions sit on the right, in place of the decorative panel. The code
keeps its height. Each step says **Waiting for:** followed by the action it
checks. **Take me there** opens the right page and focuses the right control.
Reading isn't acceptance. Typing isn't saving the final message. The tutorial
checks each action during its own step; earlier edits do not skip later steps.
Save the message before marking the request fixed. It doesn't grade your
understanding or the quality of your explanation.

Practice chat has no model running. It repeats the current instructions and
says so. Outside practice, choose Codex or Ollama to ask questions. A failed
operation shows its error in the review area, where it stays until a later
operation succeeds. It isn't reported as a failed lesson.

Eight steps take you through reading, commenting, requesting a better message,
writing it, marking the request fixed, accepting, and finding the commits.
**Leave practice** returns to your chosen directory with its drafts and position.
Leaving practice dismisses the opening invitation; **Practice review** resumes your saved step. Your place survives a restart. **Start over** resets the sample repos only.
The Python tutorial uses `practice-review-python/` under the app's data directory.
Older greeting samples remain in `practice-review/`; they aren't deleted.

## The controls

| Page | What it does |
| --- | --- |
| Start | Saves instructions for the whole sequence and shows the current change. Read the patch opens Diff. |
| Diff | Shows a hunk or the full diff. Read · next marks the hunk read. Clicking a file only moves there. |
| Messages | Edits the title, message, PR text, and checks. Typing saves a draft; Save or Ctrl+S puts the text in the record. |
| Comments | Saves comments on the current hunk or whole change. Request changes stops acceptance. Request fixed lets review continue. |
| Changes | Lists the sequence and saves or applies instructions and review comments. |
| Files | Reads the task, other review files, accepted changes, and task list. |

**Accept…** opens a window listing the repos and final text. Confirming makes
one local commit on `master` in each repo and saves the record. Git checks that
all patches apply before moving any branch. It does not run your tests.
Unfinished drafts and open change requests stop acceptance. Nothing is pushed,
sent, or posted. An interrupted acceptance resumes from its saved journal.

Keys outside editors:

- `1`–`6`, Tab: change page. Left/Right: change hunk.
- Enter: Start → Diff → Messages → Accept window.
- `d`: full diff. `f`: choose a hunk. `c`: comment. `n`: request changes.
- `e`: messages. `E`: edit patch. `r`: request fixed.
- `a`: Accept window. `y`: confirm inside that window. Escape: close it.
- Ctrl+S: save the current editor. `q`: save and quit. `?`: help.

## The god knob

The **Amount of YHWH-ness** slider has three stops:

| Level | Appearance |
| --- | --- |
| 100% · YHWH | Purple and gold, Genesis footnotes, and your scruffy god reading the code. |
| 50% · nietzsche | Quiet editor colors and Nietzsche Family Circus. |
| 0% · dawkins | Black background, monospaced text, plain controls, no decoration. |

The slider keeps your drafts, chat input, and position. `~/obsidian/YHWH/root/src/bin/thwh` remembers the
selection. `make thwh` passes its `THEME` value, which defaults to `yhwh`.
`make yhwh THEME=dawkins` gives the company app the same plain appearance.
Help → About Us / About YHWH opens the source books in your browser.

```sh
~/obsidian/YHWH/root/src/bin/thwh --theme yhwh
~/obsidian/YHWH/root/src/bin/thwh --theme nietzsche
~/obsidian/YHWH/root/src/bin/thwh --theme dawkins
~/obsidian/YHWH/root/src/bin/thwh --root /path/to/review
make thwh THEME=nietzsche
```

The Circus panel gets a cartoon and quote from
[Nietzsche Family Circus](https://nietzschefamilycircus.com/).
Next gets another pair. Share copies its original link. Practice replaces
that panel with instructions.

## Files and code

`app/review.py` owns the review and Git operations. Both desktop apps and
`app/review_tui.py` call it. The CLI uses the same `.review/state.json`, patch
edits, drafts, and read markers. Old editor keys still say `MR` and `Teams`
inside saved state so existing CLI and desktop drafts remain readable; those
names aren't labels in the interface.

Pause one interface before editing in another. The file lock prevents two
processes from changing the review at once. Stale desktop edits are rejected;
Refresh keeps your unfinished text visible so you can compare it.

Current review records live in `The Review/The Accepted Rounds.md` and
`The Review/The Board.md`. Older directories use `MASTER.md` and `Kanbun.md`.
The engine uses the existing names. It doesn't copy an old record to a new name.

Preferences and chat live in `${XDG_CONFIG_HOME:-~/.config}/THWH/thwh.json`.
`review.json` holds the chosen directory. `tutorial.json` holds practice progress.
Set `THWH_DATA_DIR` for a separate app data directory. `YHWH_PYTHON`,
`YHWH_ELECTRON`, and `YHWH_CODEX` select executables. Old `TWHW` data directories
are still recognized. Codex needs `codex login`; Ollama needs a running server
and an installed model. Fixed replies need neither.

`app/tutorial.cjs` makes and checks the samples. `app/thwh-ui.js` shows them.
See [Yahweh's character notes](voice/Yahweh-character.md) for the voice.

Run `npm test` for the core tests. `npm run test:ui` runs the desktop tests,
including a complete practice review, restart, and all three appearances.
Tests use temporary repos and save screenshots in `build/screenshots/`.
