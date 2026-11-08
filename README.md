# 𐤉𐤄𐤅𐤄

An Electron rehearsal room for getting useful work through a company, one small change at a time. The layout takes cues from Obsidian: a narrow tool ribbon, company sidebar, central workspace, and a persistent conversation with Yahweh.

The new paired-review app is **THWH**: run `make` or `make thwh` to build and launch it.
Its three-stop **Amount of YHWH-ness** slider selects YHWH (100%, Electron),
nietzsche (50%, minimal Electron with Nietzsche Family Circus), or dawkins
(0%, monochrome DOS/TTY-style Electron). See [the THWH guide](doc/THWH.md) for controls and shared state.

## Run it

`make` defaults to `make thwh`. Use `make yhwh` to build and launch the original
company rehearsal app, and `make help` to list the available operations.
Each combined target builds before running, including with parallel Make.
`make build-thwh` and `make build-yhwh` prepare the shared, locked npm dependencies
when the package files change; both apps run directly from source without a
frontend compilation step. `make run-thwh` and `make run-yhwh` launch without
building. Use `make run-isolated` to explore a fresh YHWH demo with its own
data folder; the command prints the folder and how to resume it. `make guide`
prints this walkthrough. The Makefile also exposes core tests, desktop and
headless UI tests, packaging, the Nix shell, and optional Ollama commands.

The visible **Help** menu in both desktop apps has **About Us** and **About YHWH**,
which open in your browser. All three THWH desktop levels share this menu.

Requires Node.js 22.12 or newer, Git, and Python 3 for interactive code review. The default AI engine uses your installed, signed-in Codex CLI (`codex login`). On a normal desktop:

```sh
cd ~/obsidian/YHWH
make
# Or build and launch the company rehearsal:
make yhwh
# Monospaced, monochrome DOS/TTY presentation in either app:
make thwh THEME=dawkins
make yhwh THEME=dawkins
```

Dawkins keeps the desktop controls and saved work in a plain black, monospaced interface with square controls and no decorative widgets. THWH’s slider switches levels in the same window. In the company app, choose **Settings → Interface → dawkins** to switch in place. That selection is saved; `npm start` resumes it, while `make yhwh` uses its explicit `THEME` value (default `yhwh`). Character tips stay available on demand, but Dawkins hides the Overview tip card and suppresses the startup popup. The ncurses review remains available through `./review --root PATH start`.

The first launch opens directly to a hands-on walkthrough in **Overview**, with a fictional company and a real example Git repository containing four draft commits. Choose **Start offline walkthrough** to work through the first sample proposal without an account or model. The button selects **Offline rehearsal** in Settings; other conversation, company reviews, and handoff revisions use the selected engine (initially Codex).

Character tips from _We The Nameless_ live below the sample apps in Overview and in **Did you know?** in the sidebar. Their popup is off by default for fresh profiles. You can enable it in Settings. **Don’t show this again** in any tips popup saves the preference across restarts; closing it normally or pressing Escape leaves that preference alone. Tips remain available in the app either way. Existing profiles retain their saved startup preference.

On NixOS, `npm start` automatically obtains the native `electron` from your configured `<nixpkgs>`, because npm’s generic Linux binary does not resolve NixOS libraries. You can also use:

```sh
nix-shell shell.nix
npm start
```

Set `YHWH_ELECTRON` to use a particular native Electron executable. The npm runtime is pinned to Electron 45.2.3; the NixOS runtime follows your nixpkgs. The application was exercised here with native Electron 43.8.3.

## Review prepared commits

Choose **Code review** in the sidebar. The initial workspace is the current directory; **Choose workspace** opens any directory containing a prepared `.review/plan.json`. The chosen location is saved independently of the selected demo company. Opening it only reads the session. Your existing accepted rounds, comments, edited patches, and current hunk are retained.

1. Choose **Start / resume review**. **Pause review** stops the desktop session while preserving your place.
2. Read **One hunk**. Use **Previous** and **Read · next** to move through the participating repositories. Reading a hunk does not approve it. **Full diff** shows the entire paired patch.
3. Add a **Comment** or **Request changes**, attached either to the displayed hunk or the whole round. Requests hold the round and block acceptance.
4. You or your agent can revise **Message & MR** and **Edit patch**. Use the save buttons; pending patch and copy edits also save when you leave the page, change sections, perform a review action, or close the app. Patch drafts are checked against the accepted branches at acceptance. Saving a draft does not establish that it applies or passes tests.
5. Choose **Resolve & resume** after addressing requested changes. Inspect the result, then **Accept paired round**. The confirmation lists the repositories whose local `master` branches will change.
6. The existing engine prepares every commit before moving either ref. It records accepted final messages in `The Review/The Accepted Rounds.md`, moves review cards in `The Review/The Board.md`, and opens the next round. Older workspaces retain their `MASTER.md` / `Kanbun.md` convention. **Handoff & board** displays those actual files. **Copy handoff** copies the accepted text; **Export handoff** saves the selected review's `MASTER.md` and `Kanbun.md` into a new subfolder.

The desktop and `./review start` use **one Python implementation**, the same `.review/state.json`, edits, lock, and acceptance journal. From this vault:

```sh
./review --root /path/to/review status
./review --root /path/to/review start
./review --root /path/to/review comment "Please simplify this step."
./review --root /path/to/review resolve
```

Your coding agent can read `.review/state.json`, inspect `./review show --diff`, and revise with the same CLI. The desktop refreshes shared changes every four seconds while its editors are idle; **Refresh** also reloads immediately. A stale decision or save is rejected so a concurrent CLI edit cannot silently be overwritten. Local editor text remains visible; refresh and compare it with the shared version before saving again. Pause a terminal's interactive review with `q` before using desktop actions, because the terminal holds the workspace lock for its entire session.

Yahweh's conversation receives the current review, displayed hunk, and recorded comments while this page is open. Codex supports free-form discussion and can carry out requested work in that review workspace. Ollama supports discussion, and offline mode explains the workflow using scripted responses. Existing company rehearsal conversations remain saved with their company.

Keys outside editors: Enter/`y` next, `p` previous, `d` full diff, `c`/`n` focus the comment editor, `e` message/MR, Shift+`E` patch, `a` acceptance confirmation, `q` pause. Use the explicit **Comment** or **Request changes** button to submit feedback.

The shared engine uses POSIX file locking and requires Python 3 on Linux/macOS. Set `YHWH_PYTHON` for a specific interpreter and `YHWH_REVIEW_ROOT` to override the initial review workspace. Acceptance updates the selected workspace's real local `master` refs; the original POC's separate rehearsal approvals still operate on isolated copies.

## Try a complete company rehearsal

1. In **Overview**, choose **Start offline walkthrough**. This selects The Example Company, its first proposal, and the scripted offline engine. The left sidebar opens pages and sample apps; the middle panel holds your work; Yahweh’s conversation stays on the right.
2. Read **The proposal**, then open **The patch**. In `requirements.txt`, exact `requests` and `rich` pins become package names without pinned versions. Leave **Include** checked for this sample task.
3. Return to **The proposal**. In **Verification evidence**, enter: “Reviewed requirements.txt: exact requests and rich version pins are removed. Runtime comparisons are still pending.” This records an inspection, not a claim that the dependencies were tested.
4. Choose **Rehearse company**. Read Alex, Morgan, and Casey’s scripted reactions in **The company**. In **Review feedback**, enter: “Keep this to the dependency pins; runtime comparisons are still pending.” Click **Add feedback**, then **Revise the handoff**.
5. Open **Electronic Mail** in the sidebar or use **Open sample email**. Check its subject, evidence, and review clarification. Edit it if needed; edits save locally. Review **Group Chat** and **Code Place** as well. These are local draft surfaces; there is no configured sample email account or inbox.
6. Use **Review all drafts & approve** to return to **The handoff** (or select that tab in the Rehearsal room). Read all three drafts, then click **Approve round** at the bottom and confirm. This applies the patch and creates a commit only in the isolated sample repository.
7. Open **Approved handoff** to see the three saved, immutable messages and approval commit. Open **Kanbun board** to find the round in **Approved**. This is a completed sample handoff; runtime comparisons remain pending and nothing has been sent externally. Keep real account connections for later.

The in-app guide follows you into the sample review and draft pages. Overview derives its saved-step indicators from the proposal’s evidence, feedback, revisions, and approval, so returning after a restart does not erase your work. Once approved, **View completed handoff** reopens the saved result. You can also review the remaining example proposals using **Enter the rehearsal**.

The three deliberately generic destinations are **Group Chat** (“Let’s go, department”), **Electronic Mail** (“As per my last electronic mail”), and **Code Place** (“We put the code in the code place”). They are local review surfaces. The app does not connect to or post into a real messaging, email, or repository service.

**Set aside** preserves a proposal without approving it. Set-aside proposals can reopen. Approved rounds retain their exact final packet.

## Use your own company and work

Choose **New company**, enter its goal and context, then edit **People & context**. Give each participant a name, role, and concrete concern. All companies have independent proposals, conversations, tasks, and repositories.

Create communication-only proposals with **New proposal**, or choose **Import Git**:

- Supply a base reference such as `main`, and a draft reference such as `mainer` or `HEAD`.
- Choose a local repository root. The base must be an ancestor of the draft.
- The app imports up to 100 non-merge commits, in order, with one review round per commit. Only committed content is imported.
- Repeat the import for another repository. Each imported range has its own ordered rounds and independent rehearsal copy.
- The source repository’s branches, working tree, index, hooks, and uncommitted files are preserved.

The app clones committed work into its own data folder. In each rehearsal repository, `mistress` contains the complete prepared draft, and `master` starts at the supplied base. Approving a round applies its included patch to `master` and creates a real commit. Source commit IDs remain on the proposals. Repository rounds require their preceding imported round to be approved first.

Hunk exclusions and manual edits are checked with `git apply --check --index` before committing. A rejected or malformed patch does not advance the branch. If a partial approval makes a later patch incompatible, edit that later patch against the approved state; the error is shown without approving the round. Binary changes are included or excluded as whole files.

Git imports in the company rehearsal create separate rounds per repository. The **Code review** page supports paired acceptance through an existing prepared review plan. Neither workflow splits a large existing commit into new rounds, executes tests on imported code, resolves conflicts automatically, or pushes branches. Record real test results in the evidence field. A rehearsal commit is evidence of applying a patch, not evidence of its correctness.

## Yahweh’s voice and the three engines

The persona was derived from the user’s `We The Nameless/01-genesis/*.tex`, especially chapters 3, 4, 6, 8, 11, and 18. A complete local snapshot now lives in `gen/context/we-the-nameless/01-genesis/`. The app bundles selected character evidence and chapter references, so it does not depend on that directory being present after installation. It does not modify or build the book.

The key distinction is between YHWH and the commentator. This character is embodied, curious, proud, emotionally reactive, able to regret a decision, and open to negotiation. He asks where people are, comes down to inspect events, notices a fallen face, and bargains with Abraham. The commentator’s recurring lines are not treated as YHWH’s own speech. His private dialogue can be theatrical; workplace drafts remain brief and constructive.

`src/persona.cjs` contains the character prompt, original-source references, startup facts, and offline dialogue. The facts describe the literary portrayal, with explicitly humorous workplace interpretations. This is a source-grounded adaptation; an LLM’s personality cannot be guaranteed identical to a literary character in every exchange.

**Codex** is the default, matching the locally installed `lordhavemercy -f` command:

```sh
codex exec --dangerously-bypass-approvals-and-sandbox \
  -c 'model_reasoning_effort="xhigh"' ...
```

The app invokes `codex` directly with an argument array and sends conversation context through stdin. It uses the CLI's configured model, provider, credentials, and sign-in; the Ollama model name is not passed to Codex. Run `codex login` before the first model request. Set `YHWH_CODEX=/absolute/path/to/codex` when the executable is not on the desktop app's PATH.

Codex runs with full filesystem and network permissions and no approval prompts. Chat can use its tools for work you request. Its working directory is the selected code-review workspace, the selected proposal's isolated rehearsal repository, or the app's workspace directory for a company without a repository. These directories establish context; full-access Codex can also reach files outside them. Context goes to the provider configured in Codex, so the app does not promise local-only inference in this mode.

Company reviews and handoff revisions use JSON schemas for their final responses. Only the final answer is displayed; CLI progress is kept separate. Requests allow up to 30 minutes for xhigh reasoning. A missing CLI, authentication failure, or invalid response reports an error and preserves the previous saved conversation and rehearsal state. Any filesystem changes made by Codex tools remain on disk even if the request later fails.

Existing version-1 workspaces switch to Codex once when opened, retaining their Ollama model name, startup-card preference, companies, and saved work. Later choices of **Ollama** or **Offline rehearsal** persist across restarts.

**Offline rehearsal** is a clearly labeled deterministic demonstration. It uses the company’s concerns, supplied evidence, and feedback to produce review reactions and revise draft text. Chat has scripted responses for scope, evidence, approval, and a few character-specific topics. It is not a general language model and does not infer new facts about the company.

For optional local inference, use **Local model · Ollama** in Settings:

```sh
ollama serve
# In another terminal, choose a model your machine can run:
ollama pull qwen3:8b
```

Enter the installed model’s name in settings. The main process calls Ollama at `http://127.0.0.1:11434/api/chat`. Chat receives the persona, company context, selected proposal, and recent conversation. Company reviews and draft revisions request structured JSON. The renderer never receives a network or shell capability. A model failure leaves the previous round intact and offers a useful error.

Ollama writes conversation, imagined review reactions, and draft text; it has no tool execution path. The app’s explicit controls perform actual actions in this mode. Choose a local Ollama model if you want inference to remain on the machine.

## Saved work and exports

Company state lives under Electron’s user-data directory in `workspace/workspace.json`; app-owned repositories live alongside it. On Linux the default is generally `~/.config/𐤉𐤄𐤅𐤄/workspace`. **Settings → Open data folder** shows the actual location.

JSON is replaced atomically. A small approval journal coordinates Git commits and JSON saves: an interrupted approval is either retained with its saved final packet or rolled back to its preceding rehearsal commit on restart. Only one app instance can open a given user-data directory.

**Export handoff** creates a new timestamped company subfolder containing:

- `MASTER.md`: only approved final messages and change descriptions, with rehearsal commit IDs.
- `Kanbun.md`: an Obsidian-compatible board of rounds and independent tasks.
- `company.json`: a full company snapshot, including context, conversations, and review history.
- One `.patch` file per approved code proposal.

The export does not contain repository history or Git objects. Keep the app’s data directory to resume the full rehearsal. Snapshot import is not implemented in this POC. Back up that directory if the work matters.

The board’s round cards follow actual review decisions. Independent tasks can be dragged or moved with a select control, so other preparation can continue while a proposal waits for review. The POC prepares draft work up front; Codex runs in response to chat or review requests rather than autonomous background jobs.

Shortcuts: **Ctrl/Cmd+K** searches proposals, **Ctrl/Cmd+S** saves the current editor, **Ctrl/Cmd+Shift+E** exports, and **Enter** sends a chat message (**Shift+Enter** inserts a newline). Proposal and draft editors autosave after a short typing pause, on leaving a field, before review actions, and before the window closes. Company settings use their explicit save button. The settings, search dialog, forms, and review controls are keyboard accessible.

## Verify and package

```sh
npm test
npm run test:ui
npm run package
```

The core tests use real temporary Git repositories. They cover preparation, feedback, final exports, ordered approvals, hunk selection, failed patches, untouched source repositories, arbitrary companies, independent tasks, persistence failures, crash recovery, Codex default migration, CLI arguments and working directories, structured responses, process failures, and the Ollama HTTP boundary. Automated Codex tests use a disposable executable and do not require a sign-in or paid inference. The Ollama boundary test serves controlled responses on local port 11434; stop Ollama before running that test suite.

The UI tests launch actual Electron with isolated temporary data. They exercise default Codex chat through the disposable executable, engine selection, the original company workflow, and the shared CLI/desktop hunk review, including comments, change requests, stale edits, patch revisions, failed paired approval, agent feedback, pause/restart, final handoff, compact layout, and completion. All review decisions use disposable repositories. Screenshots go to `artifacts/`. UI tests require a desktop display; on a headless Linux runner use Xvfb. The test disables GPU acceleration to make rendering predictable.

Packaging creates a host-platform application under `dist/`. It needs no development server or frontend build step. On NixOS use the native launcher or run a packaged `resources/app.asar` with native Electron; the packaged upstream Linux binary needs a conventional Linux library environment. `YHWH_DATA_DIR=/some/isolated/directory npm start` starts a separate data profile for experiments.

## Code map

- `src/workspace.cjs`: companies, proposals, rehearsals, decisions, persistence, model calls, and exports.
- `src/repository.cjs`: preparation/import, hunk selection, and isolated Git commits.
- `src/persona.cjs`: the source-grounded character and startup facts.
- `src/codex.cjs`: Codex CLI invocation, structured output, and process errors.
- `src/main.cjs` / `src/preload.cjs`: Electron window and narrow IPC boundary.
- `src/renderer.js` / `src/style.css`: the local interface.
- `src/review.py`: the shared interactive CLI and JSON review engine.
- `src/review.cjs` / `src/review-ui.js`: the desktop process boundary and review presentation.

## Vault layout and provenance

`gen/` contains the creation prompts and source context; `src/` is the application; `test/` and `scripts/` verify and operate it; `assets/` contains the original design assets; `doc/` contains product and engineering explanations. Generated packages go to `dist/` and test screenshots to `artifacts/`. The vault's existing `The Book of Life.md`, `doc/` notes, Git repository, and `.obsidian/` settings are preserved.

See [gen/README.md](gen/README.md) for literary sources and [doc/Migration.md](doc/Migration.md) for the source layout and shared review engine.

The application has no production npm dependencies. Electron, Playwright, and the packager are development dependencies; versions are locked. The Phoenician font is Noto Sans Phoenician, distributed under the bundled `assets/OFL.txt` license. The icon is an original SVG.

Implementation references: [Codex CLI reference](https://learn.chatgpt.com/docs/developer-commands?surface=cli), [Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference), [Electron context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation), [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security), and [Ollama’s chat API](https://github.com/ollama/ollama/blob/main/docs/api.md).
