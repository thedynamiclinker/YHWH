"""One small review step at a time, using the standard library's ncurses UI."""

from contextlib import redirect_stdout
import curses
import io
import json
from pathlib import Path
import textwrap
import unicodedata
import webbrowser


PAGES = ("Start", "Diff", "Messages", "Comments", "Changes", "Files")
HELP_LINKS = json.loads(Path(__file__).with_name("help-links.json").read_text())


def diff_style(line):
    if line.startswith(("diff --git", "index ", "--- ", "+++ ", "new file", "deleted file", "rename ")):
        return "file"
    if line.startswith("@@"):
        return "hunk"
    if line.startswith("+"):
        return "added"
    if line.startswith("-"):
        return "removed"
    return "normal"


def clean(text):
    # File and comment contents are text, never terminal control sequences.
    return "".join(c if c in "\n\t" or unicodedata.category(c)[0] != "C" else "?" for c in str(text))


def fit(text, width):
    result, cells = [], 0
    for char in clean(text).expandtabs(4):
        size = 0 if unicodedata.combining(char) else 2 if unicodedata.east_asian_width(char) in "WF" else 1
        if cells + size > width:
            break
        result.append(char)
        cells += size
    return "".join(result)




class Review:
    def __init__(self, screen, engine, plan, state):
        self.screen, self.engine, self.plan, self.state = screen, engine, plan, state
        self.documents = engine.DOCUMENTS
        self.page, self.offset = 0, 0
        self.notice = "One hunk is enough for a session. Everything saves as you go."
        self.document = None
        self.full_diff = False
        self.styles = {"normal": 0, "title": curses.A_BOLD, "file": curses.A_BOLD}
        if curses.has_colors():
            curses.start_color()
            background = curses.COLOR_BLACK
            try:
                curses.use_default_colors()
                background = -1
            except curses.error:
                pass
            for index, (name, color) in enumerate((("added", curses.COLOR_GREEN), ("removed", curses.COLOR_RED),
                                                   ("hunk", curses.COLOR_CYAN), ("title", curses.COLOR_CYAN)), 1):
                curses.init_pair(index, color, background)
                self.styles[name] = curses.color_pair(index) | (curses.A_BOLD if name == "title" else 0)
        self.screen.keypad(True)
        curses.set_escdelay(30)
        self.refresh_round()

    def persist(self):
        self.engine.save(self.engine.state_path(), self.state)

    def cursor(self, visible):
        try:
            curses.curs_set(1 if visible else 0)
        except curses.error:
            pass  # Some monochrome terminals cannot change cursor visibility.

    def refresh_round(self):
        self.round = self.engine.current(self.plan, self.state)
        self.chunks = self.engine.hunks(self.round) if self.round else []
        self.entry = self.state["rounds"].setdefault(self.round["id"], {}) if self.round else {}
        self.entry["hunk"] = max(0, min(self.entry.get("hunk", 0), max(0, len(self.chunks) - 1)))
        if self.round:
            if self.entry.get("status") != "changes_requested":
                self.entry["status"] = "review"
            # Preserve the read position from the original line-oriented UI.
            self.entry.setdefault("seen", [self.engine.hunk_id(c) for c in self.chunks[:self.entry["hunk"]]])
            self.engine.board(self.plan, self.state)
            self.persist()
        saved = self.entry.get("screen", {}) if self.round else self.state.get("screen", {})
        self.page = max(0, min(saved.get("page", 0), len(PAGES) - 1))
        self.offset = max(0, saved.get("offset", 0))
        self.document = saved.get("document") if saved.get("document") in self.documents else None
        self.full_diff = bool(saved.get("full_diff", False))

    def position(self):
        target = self.entry if self.round else self.state
        target["screen"] = {"page": self.page, "offset": self.offset,
                            "document": self.document, "full_diff": self.full_diff}
        self.persist()

    def go(self, page):
        self.page, self.offset, self.document = page, 0, None
        self.full_diff = False
        self.position()

    def put(self, y, x, text, style="normal", width=None):
        height, columns = self.screen.getmaxyx()
        if not (0 <= y < height and 0 <= x < columns):
            return
        text = fit(text, max(0, min(width or columns, columns - x - 1)))
        try:
            self.screen.addstr(y, x, text, self.styles.get(style, 0))
        except curses.error:
            # Resize events can arrive between measuring and painting.
            pass

    def layout(self):
        height, width = self.screen.getmaxyx()
        left = max(19, round(width * .147)) if width >= 100 else 0
        right = max(23, round(width * .2)) if width >= 100 else 0
        return height, width, left, right

    def draw(self, title, lines, footer, prose=True, modal=False):
        self.screen.erase()
        height, width, left, right = self.layout()
        if height < 10 or width < 45:
            self.put(0, 0, "Make the terminal at least 45 columns x 10 rows.")
            self.put(2, 0, "Your place is saved. q pauses; resize to continue.")
            self.screen.refresh()
            return 1
        accepted = sum(e.get("status") == "accepted" for e in self.state["rounds"].values())
        self.put(0, 1, f"THWH / dawkins     {accepted}/{len(self.plan['rounds'])} rounds accepted", "title", width=width - 45)
        self.put(0, max(1, width - 39), "Amount of YHWH-ness  0%", "title")
        self.put(1, max(1, width - 39), "[0 dawkins]----50 nietzsche----100 YHWH")
        if left:
            for y in range(3, height - 3):
                self.put(y, left, "│", width=1)
                self.put(y, width - right - 1, "│", width=1)
            self.put(3, 1, "ONE SMALL STEP", "title", width=left-2)
            for i, name in enumerate(PAGES):
                self.put(5 + i * 2, 1, f"{'>' if i == self.page else ' '} {i + 1} {name}",
                         "title" if i == self.page else "normal", width=left-2)
            self.put(18, 1, "THIS ROUND / HUNKS", "title", width=left-2)
            start = max(0, self.entry.get("hunk", 0) - max(0, (height - 26) // 2))
            for y, (i, chunk) in enumerate(list(enumerate(self.chunks))[start:], 20):
                if y >= height - 6:
                    break
                seen = "✓" if self.engine.hunk_id(chunk) in self.entry.get("seen", []) else "·"
                marker = ">" if i == self.entry.get("hunk") else " "
                self.put(y, 1, f"{marker}{seen} {i+1} {chunk['repo']}", width=left-2)
            self.put(height - 5, 1, "q Save & pause", width=left-2)
            self.put(height - 4, 1, "? Help", width=left-2)
            x = width - right + 1
            self.put(3, x, "REVIEW STATUS", "title", width=right-3)
            self.put(5, x, "One hunk is enough.", width=right-3)
            read = sum(self.engine.hunk_id(c) in self.entry.get("seen", []) for c in self.chunks)
            self.put(7, x, f"{read}/{len(self.chunks)} hunks read", width=right-3)
            self.put(8, x, f"{len(self.entry.get('comments', []))} saved notes", width=right-3)
            self.put(10, x, "t  YHWH-ness slider", width=right-3)
            self.put(12, x, "No branches pushed.", width=right-3)
            self.put(13, x, "No messages posted.", width=right-3)
            self.put(17, x, "REVIEW ASSISTANT", "title", width=right-3)
            self.put(19, x, "s Discuss this hunk", width=right-3)
            guide = getattr(self, "assistant_answer", "Inspect the patch. Record one concrete observation. Check the evidence before accepting.")
            for y, line in enumerate(textwrap.wrap(clean(guide), max(12, right-4)), 21):
                if y >= height - 4:
                    break
                self.put(y, x, line, width=right-3)
        else:
            self.put(2, 1, "  ".join(f"{i+1} {name}" for i, name in enumerate(PAGES)))
        origin = left + 2 if left else 1
        content_width = width - left - right - 5
        self.put(3, origin, title, "title", width=content_width)
        rendered = []
        for item in lines:
            text, style = item if isinstance(item, tuple) else (item, "normal")
            rows = textwrap.wrap(clean(text).expandtabs(4), max(12, content_width),
                                 replace_whitespace=False, drop_whitespace=False) if prose else [text]
            for row in rows or [""]:
                rendered.append((row, style))
        available = height - 9
        self.offset = max(0, min(self.offset, max(0, len(rendered) - available)))
        for y, (line, style) in enumerate(rendered[self.offset:self.offset + available], 5):
            self.put(y, origin, line, style, width=content_width)
        self.put(height - 4, origin, self.notice, width=content_width)
        self.put(height - 3, 1, footer, "title")
        self.put(height - 2, 1, "Your progress is saved. Esc returns to the review." if modal else
                 "? help   q save & pause   Tab switch view   1-6 views   ] Electron / 50%")
        self.put(height - 1, 1, f"Lines {self.offset+1}-{min(self.offset+available, len(rendered))}/{len(rendered)}  ·  Local review · nothing posted")
        self.screen.refresh()
        return available

    def choose(self, title, choices):
        index = 0
        self.offset = 0
        while True:
            rows = [(f"{'>' if i == index else ' '} {label}", "title" if i == index else "normal")
                    for i, label in enumerate(choices)]
            size = self.draw(title, rows, "Up/Down choose   Enter open   Esc back", prose=False, modal=True)
            key = self.screen.get_wch()
            if key in ("q", "\x1b"):
                self.offset = 0
                return None
            if key in ("\n", "\r", curses.KEY_ENTER):
                self.offset = 0
                return index
            if key in (curses.KEY_UP, "k"):
                index = max(0, index - 1)
            elif key in (curses.KEY_DOWN, "j"):
                index = min(len(choices) - 1, index + 1)
            elif key == curses.KEY_NPAGE:
                index = min(len(choices) - 1, index + size)
            elif key == curses.KEY_PPAGE:
                index = max(0, index - size)
            self.offset = max(0, min(self.offset, index))
            if index >= self.offset + size:
                self.offset = index - size + 1

    def editor(self, title, draft_key, initial=""):
        """Edit ordinary text; each keystroke saves a recoverable draft."""
        drafts = self.entry.setdefault("drafts", {})
        text = drafts.get(draft_key, initial)
        cursor, top = len(text), 0
        try:
            self.cursor(True)
            while True:
                height, width = self.screen.getmaxyx()
                self.screen.erase()
                self.draw(title, [], "Ctrl-S save   Esc back (draft kept)   Arrows move   Enter new line", modal=True)
                _, _, left, right = self.layout()
                origin = left + 2 if left else 1
                # Display soft wrapping without changing the underlying diff/text.
                row_width = max(1, width - left - right - 5)
                visual, row, col = [""], 0, 0
                cursor_row, cursor_col = 0, 0
                for index, char in enumerate(text):
                    if index == cursor:
                        cursor_row, cursor_col = row, col
                    if char == "\n":
                        visual.append("")
                        row, col = row + 1, 0
                    else:
                        display = clean(char).expandtabs(4)
                        visual[-1] += display
                        col += len(display)
                        if col >= row_width:
                            visual.append("")
                            row, col = row + 1, 0
                if cursor == len(text):
                    cursor_row, cursor_col = row, col
                visible = max(1, height - 9)
                top = max(0, min(top, cursor_row))
                if cursor_row >= top + visible:
                    top = cursor_row - visible + 1
                for i, line in enumerate(visual[top:top + visible], 5):
                    self.put(i, origin, line, width=row_width)
                try:
                    self.screen.move(min(height - 1, 5 + cursor_row - top), min(width - right - 2, origin + cursor_col))
                except curses.error:
                    pass
                self.screen.refresh()
                key = self.screen.get_wch()
                if key in ("\x03", "\x04"):
                    raise KeyboardInterrupt
                if key == "\x1b":
                    return None
                if key == "\x13":
                    return text
                if key in (curses.KEY_LEFT,):
                    cursor = max(0, cursor - 1)
                elif key == curses.KEY_RIGHT:
                    cursor = min(len(text), cursor + 1)
                elif key in (curses.KEY_HOME, "\x01"):
                    cursor = text.rfind("\n", 0, cursor) + 1
                elif key in (curses.KEY_END, "\x05"):
                    end = text.find("\n", cursor)
                    cursor = len(text) if end == -1 else end
                elif key in (curses.KEY_UP, curses.KEY_DOWN):
                    start = text.rfind("\n", 0, cursor) + 1
                    column = cursor - start
                    if key == curses.KEY_UP and start:
                        previous = text.rfind("\n", 0, start - 1) + 1
                        cursor = min(previous + column, start - 1)
                    elif key == curses.KEY_DOWN:
                        end = text.find("\n", cursor)
                        if end != -1:
                            following = text.find("\n", end + 1)
                            cursor = min(end + 1 + column, len(text) if following == -1 else following)
                elif key in (curses.KEY_BACKSPACE, "\x7f", "\b"):
                    if cursor:
                        text, cursor = text[:cursor - 1] + text[cursor:], cursor - 1
                elif key == curses.KEY_DC:
                    text = text[:cursor] + text[cursor + 1:]
                elif key in ("\n", "\r", curses.KEY_ENTER):
                    text, cursor = text[:cursor] + "\n" + text[cursor:], cursor + 1
                elif isinstance(key, str) and (key.isprintable() or key == "\t"):
                    text, cursor = text[:cursor] + key + text[cursor:], cursor + len(key)
                else:
                    continue
                drafts[draft_key] = text
                self.persist()
        finally:
            self.cursor(False)
            self.offset = 0

    def confirm(self, title, lines):
        self.offset = 0
        while True:
            self.draw(title, lines, "y confirm   Esc/n cancel   Up/Down scroll", modal=True)
            key = self.screen.get_wch()
            if key == "y":
                return True
            if key in ("n", "q", "\x1b"):
                return False
            if key == curses.KEY_DOWN:
                self.offset += 1
            elif key == curses.KEY_UP:
                self.offset = max(0, self.offset - 1)

    def copy_lines(self):
        copy = self.engine.details(self.round, self.state)
        lines = [("MESSAGE", "title"), copy["teams"], "", ("PR", "title"), copy["mr_title"]]
        for repo, description in copy["descriptions"].items():
            lines.extend(["", (repo, "title"), description])
        lines.extend(["", ("CHECKS", "title"), copy["validation"], "",
                      "Recorded checks describe the prepared draft. Code edits need their own checks."])
        return lines

    def content(self):
        if self.page == 5:
            if self.document:
                path = self.engine.ROOT / self.document
                text = path.read_text() if path.is_file() else f"Missing: {self.document}"
                return self.document, text.splitlines(), "Esc back to context files   Up/Down scroll"
            return "The context is here when you need it", [
                "Enter opens the task, company context, validation, source history, accepted text, or board.",
                "", "Paths in the review instructions are relative to the selected workspace.",
                "Previously/ holds old Electron and migration prompts; the terminal task is current.",
            ], "Enter choose a context file"
        if self.page == 4:
            lines = ["First: the requested version upgrade. Then: small installation fixes, comparison tools, runtimes, and guides.", ""]
            for r in self.plan["rounds"]:
                status = self.state["rounds"].get(r["id"], {}).get("status", "prepared")
                marker = ">" if self.round and r["id"] == self.round["id"] else " "
                lines.append(f"{marker} {r['id']}  {status.replace('_', ' ')}  {self.engine.details(r, self.state)['title']}")
            return "The story, one useful change at a time", lines, "1 current step   6 context & evidence"
        if not self.round:
            return "Every round is accepted locally", [
                "The messages, PR descriptions, commit IDs, and checks are in:",
                "The Review/The Accepted Rounds.md", "",
                "You can review the record in Files. Sending the messages and opening the PRs are separate steps.",
            ], "6 open record & board   q save & close"
        copy = self.engine.details(self.round, self.state)
        title = f"{self.round['id']}: {copy['title']}"
        if self.page == 0:
            note_count = len(self.entry.get("comments", []))
            lines = [("YOUR NEXT SMALL STEP", "title"),
                     f"Read hunk {self.entry['hunk'] + 1} of {len(self.chunks)}. Press Enter when you're ready.", "",
                     ("WHY THIS CHANGE", "title"), copy["teams"], "",
                     "Here are the proposed patches and messages. Read them. Say what needs fixing.",
                     "Accept makes one local commit in each repo and saves the final text.", "",
                     f"Saved notes: {note_count}. Draft text is kept even if you leave an editor.",
                     "You can stop after one hunk. q saves your place; the same command brings you back."]
            if self.entry.get("status") == "changes_requested":
                lines[:0] = [("CHANGES REQUESTED", "removed"), "Read the notes, revise with e/E, then r marks them addressed.", ""]
            return title, lines, "Enter review next hunk   c leave a note   4 saved notes"
        if self.page == 1:
            if not self.chunks:
                return title, ["This round has no patch hunks."], "Enter review messages"
            chunk = self.chunks[self.entry["hunk"]]
            if self.full_diff:
                text = "\n".join(f"Repository: {repo}\n{self.engine.patch(self.round, repo)}" for repo in self.round["commits"])
            else:
                text = chunk["text"]
            lines = [(line, diff_style(line)) for line in text.splitlines()]
            return f"{self.round['id']}  {chunk['repo']}  Hunk {self.entry['hunk'] + 1}/{len(self.chunks)}", lines, "Enter next   Left/Right hunks   f files   c note   n request change"
        if self.page == 2:
            return title, self.copy_lines(), "Enter review acceptance   e edit message or validation   2 diff"
        lines = []
        for note in self.entry.get("comments", []):
            lines.extend([(note.get("at", ""), "title"), note.get("anchor") or "Whole round", note["text"], ""])
        if not lines:
            lines = ["No notes yet. Press c to leave one on the current hunk."]
        drafts = list(self.entry.get("drafts", {}))
        if drafts:
            lines.extend(["", "Unfinished editor drafts: " + ", ".join(drafts), "Open the same editor to resume its draft."])
        return title + " / Comments", lines, "c add note   n request changes   e edit copy   E edit patch   r resolve"

    def advance(self):
        if self.page == 0:
            self.go(1)
        elif self.page == 1:
            if self.chunks:
                seen = self.entry.setdefault("seen", [])
                identity = self.engine.hunk_id(self.chunks[self.entry["hunk"]])
                if identity not in seen:
                    seen.append(identity)
                if self.entry["hunk"] + 1 < len(self.chunks):
                    self.entry["hunk"] += 1
                    self.offset = 0
                else:
                    self.go(2)
                    self.notice = "Diff reviewed. Read the message and validation; a opens acceptance."
            else:
                self.go(2)
        elif self.page == 2:
            self.accept_round()
        elif self.page == 5 and self.document is None:
            selected = self.choose("Review files", self.documents)
            if selected is not None:
                self.document, self.offset = self.documents[selected], 0

    def note(self, reject=False):
        key = "requested change" if reject else "comment"
        text = self.editor("Request a change" if reject else "Leave a note on this hunk", key)
        if text is not None and text.strip():
            self.engine.act(self.plan, self.state, "reject" if reject else "comment",
                            {"text": text.strip(), "draftKey": key})
            self.go(3)
            self.notice = "Saved. Revise with e/E, then r to resolve." if reject else "Comment saved. Continue whenever you're ready."

    def edit_copy(self):
        copy = self.engine.details(self.round, self.state)
        fields = [("title", None, "Round title"), ("teams", None, "Teams message"),
                  ("mr_title", None, "MR title")]
        fields += [("descriptions", repo, f"{repo} MR description") for repo in self.round["commits"]]
        fields += [("validation", None, "Validation and limits")]
        labels = {"Round title": "Change title", "Teams message": "Message", "MR title": "PR title", "Validation and limits": "Checks"}
        selected = self.choose("What would you like to edit?", [labels.get(f[2], f[2].replace(" MR description", " PR description")) for f in fields])
        if selected is None:
            return
        field, repo, label = fields[selected]
        key = label
        value = copy[field][repo] if repo else copy[field]
        text = self.editor(labels.get(label, label.replace(" MR description", " PR description")), key, value)
        if text is not None:
            self.engine.act(self.plan, self.state, "save-field", {"key": key, "text": text})
            self.go(2)
            self.notice = "Saved the revised text."

    def edit_patch(self):
        repos = list(self.round["commits"])
        selected = self.choose("Which repository's patch?", repos) if len(repos) > 1 else 0
        if selected is None:
            return
        repo = repos[selected]
        key = repo + " patch"
        text = self.editor(f"Edit {repo} unified diff (Git checks that it applies before committing)", key,
                           self.engine.patch(self.round, repo))
        if text is not None:
            self.engine.act(self.plan, self.state, "save-patch", {"repo": repo, "patch": text})
            self.chunks = self.engine.hunks(self.round)
            self.go(1)
            self.notice = "Patch saved. Review it and update validation for any code changes."

    def accept_round(self):
        if self.entry.get("status") == "changes_requested":
            raise RuntimeError("This round has requested changes. Read Comments, revise with e/E, then r to resolve.")
        if self.entry.get("drafts"):
            raise RuntimeError("There is unfinished editor text. Resume it, save it with Ctrl-S, or discard drafts with D.")
        seen = set(self.entry.get("seen", []))
        read = sum(self.engine.hunk_id(chunk) in seen for chunk in self.chunks)
        lines = [f"Accept {self.round['id']} locally?", "",
                 f"Hunks marked read: {read}/{len(self.chunks)}. Comments: {len(self.entry.get('comments', []))}.",
                 "This adds one commit to master in: " + ", ".join(self.round["commits"]),
                 f"It also saves {self.engine.document_path('master').relative_to(self.engine.ROOT)} and updates the board.",
                 "No messages are sent and no branches are pushed.", "", *self.copy_lines()]
        if not self.confirm("Review your decision", lines):
            self.offset = 0
            return
        previous = self.round["id"]
        # Acceptance prints for CLI callers; keep stdout inside the curses surface.
        with redirect_stdout(io.StringIO()):
            self.engine.act(self.plan, self.state, "accept", {})
        self.page, self.offset = 0, 0
        self.refresh_round()
        self.notice = f"{previous} accepted locally. You can pause here, or begin the next small step."

    def open_electron(self, energy=50):
        import os
        import subprocess
        launcher = os.environ.get("THWH_LAUNCHER", str(Path(__file__).resolve().parents[1] / "thwh"))
        self.position()
        subprocess.Popen(["node", launcher, "--theme", "yhwh" if energy == 100 else "nietzsche", "--root", str(self.engine.ROOT)],
                         start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.notice = f"Opening Electron at {energy}% YHWH-ness."

    def theme_scale(self):
        energy = 0
        while True:
            self.draw("Amount of YHWH-ness", ["Left / Right: move the three-stop slider. Enter: use this level.", "",
                      f"{'[0% dawkins]' if energy == 0 else ' 0% dawkins '} ─── {'[50% nietzsche]' if energy == 50 else ' 50% nietzsche '} ─── {'[100% YHWH]' if energy == 100 else ' 100% YHWH '}",
                      "", "0% uses ncurses. 50% and 100% open Electron at your saved review position."],
                      "Left / Right adjust   Enter use   Esc back", modal=True)
            key = self.screen.get_wch()
            if key == curses.KEY_LEFT:
                energy = max(0, energy - 50)
            elif key == curses.KEY_RIGHT:
                energy = min(100, energy + 50)
            elif key in ("\n", "\r", curses.KEY_ENTER):
                if energy:
                    self.open_electron(energy)
                return bool(energy)
            elif key in ("q", "\x1b"):
                return False

    def discuss(self):
        import subprocess
        text = self.editor("Discuss this hunk with the review assistant", "assistant message")
        if not text or not text.strip():
            return
        self.draw("Review assistant is working…", ["Your question includes the current hunk and saved notes."], "Please wait")
        script = Path(__file__).resolve().parents[1] / "scripts/thwh-chat.cjs"
        result = subprocess.run(["node", str(script)], input=json.dumps({"view": self.engine.snapshot(self.plan, self.state), "message": text}),
                                text=True, capture_output=True)
        if result.returncode:
            raise RuntimeError(result.stderr.strip() or "The assistant did not answer.")
        self.assistant_answer = result.stdout.strip()
        self.entry.get("drafts", {}).pop("assistant message", None)
        self.persist()
        self.confirm("Review assistant", self.assistant_answer.splitlines())

    def assistant_settings(self):
        import os
        filename = Path(os.environ.get("THWH_PREFERENCES", str(Path(os.environ.get("XDG_CONFIG_HOME", str(Path.home() / ".config"))) / "THWH/thwh.json")))
        settings = json.loads(filename.read_text()) if filename.exists() else {}
        selected = self.choose("Review assistant engine", ["Codex · xhigh · full access", "Ollama", "Scripted offline guidance"])
        if selected is None:
            return
        settings["mode"] = ("codex", "ollama", "offline")[selected]
        if selected == 1:
            model = self.editor("Ollama model", "assistant model", settings.get("model", "qwen3:8b"))
            if model is None or not model.strip():
                return
            settings["model"] = model.strip()
            self.entry.get("drafts", {}).pop("assistant model", None)
        settings["energy"] = 0
        self.engine.save(filename, settings)
        self.notice = "Assistant settings saved. s discusses the current hunk."

    def help(self):
        selected = self.choose("Help", ["Keyboard shortcuts", *[link["label"] for link in HELP_LINKS]])
        if selected == 0:
            self.shortcuts()
        elif selected is not None:
            link = HELP_LINKS[selected - 1]
            if not webbrowser.open(link["url"], new=2):
                raise RuntimeError(f"Could not open a browser. Visit {link['url']}")
            self.notice = f"Opened {link['label']} in your browser."

    def shortcuts(self):
        lines = [
            "You play the reviewer. The proposed commits and messages are already prepared.",
            "", "Enter: Start -> one hunk at a time -> messages -> Accept window.",
            "Reading a hunk saves your place. Only y in the Accept window adds commits.", "",
            "Up/Down or j/k: scroll. PgUp/PgDn or Space: scroll a page. Home/End: top/bottom.",
            "Left/Right or p/y: previous/next hunk. f: choose a file/hunk. d: whole diff.",
            "Tab/Shift-Tab: switch views. 1-6: Start, Diff, Messages, Comments, Changes, Files.",
            "c: leave a comment on this hunk. n: request changes. r: mark changes addressed.",
            "e: edit a message, title, or validation. E: edit a repository patch.",
            "Editors: arrows/Home/End, Backspace/Delete, Enter for a newline, Ctrl-S saves.",
            "Esc leaves the editor with a saved draft; opening it again resumes the text.",
            "D: explicitly discard unfinished drafts. a: Accept window. q: save and pause.",
            "s: discuss this hunk. S: assistant settings. t: the three-stop YHWH-ness slider.", "",
            "Files contain the original task, company conversation, evidence, board, and record.",
            "The validation describes executed draft checks and their limits. Edits need new checks.",
            "Everything stays local. mainer is the preserved source; master receives accepted rounds.",
            "If a patch conflicts, the error stays on screen; revise it with E before accepting.", "",
            "One hunk is a useful session. There is no timer and no penalty for pausing.",
        ]
        self.offset = 0
        while True:
            self.draw("How to play", lines, "Esc / ? / Enter back   Up/Down scroll", modal=True)
            key = self.screen.get_wch()
            if key in ("\x1b", "?", "q", "\n", "\r"):
                self.offset = 0
                return
            if key in (curses.KEY_DOWN, "j"):
                self.offset += 1
            elif key in (curses.KEY_UP, "k"):
                self.offset = max(0, self.offset - 1)

    def run(self):
        try:
            self.cursor(False)
            # Ctrl-S belongs to the editor, rather than terminal flow control.
            curses.raw()
            while True:
                title, lines, footer = self.content()
                size = self.draw(title, lines, footer)
                key = self.screen.get_wch()
                if key in ("q", "\x03", "\x04"):
                    return
                if key == curses.KEY_RESIZE:
                    continue
                height, width = self.screen.getmaxyx()
                if height < 10 or width < 45:
                    continue
                try:
                    if key == "t":
                        if self.theme_scale():
                            return
                    elif key == "]":
                        self.open_electron()
                        return
                    elif key == "s" and self.round:
                        self.discuss()
                    elif key == "S":
                        self.assistant_settings()
                    elif key == "?":
                        self.help()
                    elif key in ("\t", curses.KEY_BTAB):
                        self.go((self.page + (-1 if key == curses.KEY_BTAB else 1)) % len(PAGES))
                    elif isinstance(key, str) and key in "123456":
                        self.go(int(key) - 1)
                    elif key in (curses.KEY_DOWN, "j"):
                        self.offset += 1
                    elif key in (curses.KEY_UP, "k"):
                        self.offset = max(0, self.offset - 1)
                    elif key in (curses.KEY_NPAGE, " "):
                        self.offset += size
                    elif key == curses.KEY_PPAGE:
                        self.offset = max(0, self.offset - size)
                    elif key == curses.KEY_HOME:
                        self.offset = 0
                    elif key == curses.KEY_END:
                        self.offset = 10**9
                    elif key == "\x1b" and self.document:
                        self.go(5)
                    elif key in ("\n", "\r", curses.KEY_ENTER):
                        if self.round or self.page == 5:
                            self.advance()
                    elif self.round:
                        if key in (curses.KEY_RIGHT, curses.KEY_LEFT, "p", "y"):
                            delta = -1 if key in (curses.KEY_LEFT, "p") else 1
                            self.entry["hunk"] = max(0, min(self.entry["hunk"] + delta, max(0, len(self.chunks) - 1)))
                            self.go(1)
                        elif key == "d":
                            was_full = self.full_diff
                            self.go(1)
                            self.full_diff = not was_full
                        elif key == "f":
                            choice = self.choose("Choose a hunk", [c["anchor"] for c in self.chunks]) if self.chunks else None
                            if choice is not None:
                                self.entry["hunk"] = choice
                                self.go(1)
                        elif key in ("c", "n"):
                            self.note(reject=key == "n")
                        elif key == "e":
                            self.edit_copy()
                        elif key == "E":
                            self.edit_patch()
                        elif key == "D":
                            if self.confirm("Discard unfinished drafts?", list(self.entry.get("drafts", {})) or ["There are no unfinished drafts."]):
                                self.engine.act(self.plan, self.state, "discard-drafts", {})
                                self.notice = "Drafts discarded. Saved comments and edits remain."
                        elif key == "r":
                            if self.confirm("Mark requested changes addressed?", ["Review the revised patch, messages, and validation before accepting."]):
                                self.engine.act(self.plan, self.state, "resolve", {})
                                self.notice = "Changes marked addressed. The round still needs acceptance."
                        elif key == "a":
                            self.accept_round()
                    self.position()
                except (OSError, RuntimeError, ValueError) as error:
                    # A journal remains the authority if acceptance was interrupted.
                    if self.state.get("pending"):
                        raise
                    self.notice = str(error)
                    self.confirm("This step needs attention", [str(error), "", "Your place and edits are saved." ,
                                                               "Use Esc to return to the review."])
                    self.offset = 0
                    self.position()
        finally:
            self.position()
