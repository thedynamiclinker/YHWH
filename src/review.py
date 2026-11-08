#!/usr/bin/env python3
"""Review paired local commits, then record accepted rounds on master."""

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import tempfile

# A CLI symlink keeps its directory as the default review workspace.
ROOT = Path(os.path.abspath(__file__)).parent

DOCUMENTS = (
    "The Review/Start Here.md", "The Review/The Task.md", "The Review/The Context.md",
    "The Review/The Original Prompt.md", "The Review/The Interface.md",
    ".review/VALIDATION.md", ".review/PROVENANCE.md",
    "The Review/The Accepted Rounds.md", "The Review/The Board.md",
    "The Review/The Terminal Task.md",
)


def document_path(kind):
    """Use the workspace's existing review document convention."""
    modern, legacy = {"board": ("The Review/The Board.md", "Kanbun.md"),
                      "master": ("The Review/The Accepted Rounds.md", "MASTER.md")}[kind]
    return ROOT / (modern if (ROOT / "The Review").is_dir() else legacy)


def hunk_id(chunk):
    return hashlib.sha256((chunk["repo"] + chunk["text"]).encode()).hexdigest()


def git(repo, *args, data=None, env=None):
    result = subprocess.run(["git", "-C", str(ROOT / repo), *args], input=data,
                            text=True, capture_output=True, env=env)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    return result.stdout


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n")
    temporary.replace(path)


@contextmanager
def locked():
    (ROOT / ".review").mkdir(exist_ok=True)
    with (ROOT / ".review/lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield


def state_path():
    return ROOT / ".review/state.json"


def read_state():
    return json.loads(state_path().read_text()) if state_path().exists() else {"rounds": {}}


def current(plan, state):
    return next((r for r in plan["rounds"]
                 if state["rounds"].get(r["id"], {}).get("status") != "accepted"), None)


def details(round_, state):
    return {**round_, **state["rounds"].get(round_["id"], {}).get("copy", {})}


def patch(round_, repo):
    edited = ROOT / ".review/edits" / round_["id"] / (repo + ".patch")
    if edited.exists():
        return edited.read_text()
    return git(repo, "show", "--no-color", "--no-ext-diff", "--format=", "--binary", round_["commits"][repo])


def hunks(round_):
    """One review step per text hunk, or per file for binary/metadata changes."""
    chunks = []
    for repo in round_["commits"]:
        for file_patch in re.split(r"(?=^diff --git )", patch(round_, repo), flags=re.M):
            if not file_patch:
                continue
            parts = re.split(r"(?=^@@ )", file_patch, flags=re.M)
            for hunk in parts[1:] or [""]:
                text = parts[0] + hunk
                location = next((line for line in text.splitlines() if line.startswith("@@ ")), "")
                chunks.append({"repo": repo, "text": text,
                               "anchor": f"{repo}: {text.splitlines()[0]} {location}"})
    return chunks


def snapshot(plan, state):
    r = current(plan, state)
    entry = state["rounds"].get(r["id"], {}) if r else {}
    chunks = hunks(r) if r else []
    index = max(0, min(entry.get("hunk", 0), max(0, len(chunks) - 1)))
    view = {"root": str(ROOT), "active": state.get("active", False),
            "rounds": [{"id": item["id"], "title": details(item, state)["title"],
                        "status": state["rounds"].get(item["id"], {}).get("status", "prepared")}
                       for item in plan["rounds"]],
            "round": details(r, state) if r else None,
            "status": entry.get("status", "prepared"), "hunk": index,
            "hunks": [{**c, "id": hunk_id(c), "seen": hunk_id(c) in entry.get("seen", [])}
                      for c in chunks], "comments": entry.get("comments", []),
            "screen": entry.get("screen", {}) if r else state.get("screen", {}), "drafts": entry.get("drafts", {}),
            "documents": [name for name in DOCUMENTS if (ROOT / name).is_file()],
            "document": "",
            "patches": {repo: patch(r, repo) for repo in r["commits"]} if r else {},
            "master": document_path("master").read_text() if document_path("master").exists() else "",
            "board": document_path("board").read_text() if document_path("board").exists() else "",
            "paths": {kind: str(document_path(kind).relative_to(ROOT)) for kind in ("board", "master")},
            "pending": bool(state.get("pending"))}
    document = view["screen"].get("document")
    if document in view["documents"]:
        view["document"] = (ROOT / document).read_text()
    view["revision"] = hashlib.sha256(json.dumps(view, sort_keys=True).encode()).hexdigest()
    return view


def save_copy(state, r, copy):
    fields = {"title", "teams", "mr_title", "descriptions", "validation"}
    if not isinstance(copy, dict) or set(copy) != fields:
        raise ValueError("Keep the five existing copy fields.")
    if any(not isinstance(copy[key], str) or not copy[key].strip()
           for key in fields - {"descriptions"}):
        raise ValueError("Copy fields must contain text.")
    if (not isinstance(copy["descriptions"], dict)
            or set(copy["descriptions"]) != set(r["commits"])
            or any(not isinstance(value, str) or not value.strip()
                   for value in copy["descriptions"].values())):
        raise ValueError("Supply an MR description for every repository in this round.")
    state["rounds"].setdefault(r["id"], {})["copy"] = copy
    save(state_path(), state)


def act(plan, state, action, data):
    """The desktop and CLI share decisions, patches, state, and Git acceptance."""
    r = current(plan, state)
    if action == "read":
        return
    if action == "pause":
        state["active"] = False
        save(state_path(), state)
        return
    if not r and action == "position":
        screen = data.get("screen", {})
        if not isinstance(screen, dict) or screen.get("document") not in (None, *DOCUMENTS):
            raise ValueError("Invalid review position.")
        state["screen"] = {"page": max(0, min(int(screen.get("page", 0)), 5)),
                           "offset": max(0, int(screen.get("offset", 0))),
                           "document": screen.get("document"), "record": screen.get("record")}
        save(state_path(), state)
        return
    if not r:
        if action == "start":
            state["active"] = False
            save(state_path(), state)
            return
        raise RuntimeError("Every round is accepted locally. See MASTER.md.")
    # Reject stale UI actions if another reviewer advanced the shared session.
    if data.get("roundId") and data["roundId"] != r["id"]:
        raise RuntimeError("The current round changed. Refresh before deciding.")
    if data.get("revision") and data["revision"] != snapshot(plan, state)["revision"]:
        raise RuntimeError("The review changed in another window or CLI. Refresh before deciding; your editor text is retained.")
    entry = state["rounds"].setdefault(r["id"], {})
    if action == "start":
        state["active"] = True
        if entry.get("status") != "changes_requested":
            entry["status"] = "review"
    elif action in ("next", "previous"):
        chunks = hunks(r)
        maximum = max(0, len(chunks) - 1)
        if action == "next" and chunks:
            identity = hunk_id(chunks[max(0, min(entry.get("hunk", 0), maximum))])
            if identity not in entry.setdefault("seen", []):
                entry["seen"].append(identity)
        entry["hunk"] = max(0, min(entry.get("hunk", 0) + (1 if action == "next" else -1), maximum))
    elif action == "position":
        screen = data.get("screen", {})
        if (not isinstance(screen, dict) or not isinstance(screen.get("page", 0), int)
                or not 0 <= screen.get("page", 0) <= 5
                or not isinstance(screen.get("offset", 0), (int, float))
                or screen.get("document") not in (None, *DOCUMENTS)):
            raise ValueError("Invalid review position.")
        entry["screen"] = {"page": screen.get("page", 0), "offset": max(0, int(screen.get("offset", 0))),
                           "document": screen.get("document"), "full_diff": bool(screen.get("full_diff", False)),
                           "record": screen.get("record") if screen.get("record") in ("master", "board") else None}
        if "hunk" in data:
            entry["hunk"] = max(0, min(int(data["hunk"]), max(0, len(hunks(r)) - 1)))
    elif action == "draft":
        key, text = data.get("key"), data.get("text")
        allowed = {"Round title", "Teams message", "MR title", "Validation and limits", "comment", "requested change"}
        allowed.update(f"{repo} {suffix}" for repo in r["commits"] for suffix in ("patch", "MR description"))
        if key not in allowed or not isinstance(text, str) or len(text) > 5_000_000:
            raise ValueError("Invalid editor draft.")
        entry.setdefault("drafts", {})[key] = text
    elif action == "discard-drafts":
        entry.pop("drafts", None)
    elif action == "save-field":
        fields = {"Round title": "title", "Teams message": "teams", "MR title": "mr_title",
                  "Validation and limits": "validation"}
        key, text = data.get("key"), data.get("text")
        if not isinstance(text, str) or not text.strip():
            raise ValueError("Keep some text in this field. Your draft is saved.")
        copy = details(r, state)
        copy = {k: copy[k] for k in ("title", "teams", "mr_title", "validation", "descriptions")}
        if key in fields:
            copy[fields[key]] = text
        elif key in {f"{repo} MR description" for repo in r["commits"]}:
            repo = key.removesuffix(" MR description")
            copy["descriptions"] = {**copy["descriptions"], repo: text}
        else:
            raise ValueError("Choose an existing message field.")
        save_copy(state, r, copy)
        entry.setdefault("drafts", {}).pop(key, None)
    elif action in ("comment", "reject"):
        text = data.get("text", "").strip()
        if not text:
            raise ValueError("Supply the review comment text.")
        chunks = hunks(r)
        index = max(0, min(entry.get("hunk", 0), max(0, len(chunks) - 1)))
        anchor = chunks[index]["anchor"] if data.get("onHunk", True) and chunks else None
        comment(state, r, text, anchor, reject=action == "reject")
        entry.setdefault("drafts", {}).pop("requested change" if action == "reject" else "comment", None)
        if entry["drafts"].get("comment", "").strip() == text:
            entry["drafts"].pop("comment", None)
        draft_key = data.get("draftKey")
        if draft_key in ("comment", "requested change") and entry["drafts"].get(draft_key, "").strip() == text:
            entry["drafts"].pop(draft_key, None)
        if action == "reject":
            state["active"] = False
    elif action == "resolve":
        entry["status"] = "review"
        state["active"] = True
    elif action == "save-copy":
        save_copy(state, r, data.get("copy"))
    elif action == "save-patch":
        repo, text = data.get("repo"), data.get("patch")
        if repo not in r["commits"] or not isinstance(text, str) or len(text) > 5_000_000:
            raise ValueError("Choose a repository in this round and supply its unified diff.")
        directory = ROOT / ".review/edits" / r["id"]
        directory.mkdir(parents=True, exist_ok=True)
        destination = directory / (repo + ".patch")
        temporary = destination.with_suffix(".patch.tmp")
        temporary.write_text(text)
        temporary.replace(destination)
        entry["hunk"] = 0
        entry.setdefault("drafts", {}).pop(repo + " patch", None)
    elif action == "accept":
        accept(plan, state, r)
        following = current(plan, state)
        if not following:
            state["active"] = False
        elif state.get("active"):
            following_entry = state["rounds"].setdefault(following["id"], {})
            if following_entry.get("status") != "changes_requested":
                following_entry["status"] = "review"
    else:
        raise ValueError(f"Unknown review action: {action}")
    save(state_path(), state)
    if action not in ("position", "draft", "discard-drafts"):
        board(plan, state)


def board(plan, state):
    """Move only review-owned cards; preserve user cards, columns and settings."""
    path = document_path("board")
    text = path.read_text()
    text = re.sub(r"^- \[[ x]\] \[R\d+\].*\n?", "", text, flags=re.M)
    text = re.sub(r"\n{3,}", "\n\n", text)
    cards = {name: [] for name in ("Todo", "In Progress", "Review", "Done")}
    for r in plan["rounds"]:
        status = state["rounds"].get(r["id"], {}).get("status", "prepared")
        column = {"accepted": "Done", "review": "Review",
                  "changes_requested": "In Progress"}.get(status, "Todo")
        box = "x" if status == "accepted" else " "
        label = {"accepted": "accepted locally", "review": "in review",
                 "changes_requested": "changes requested"}.get(status, "draft prepared")
        cards[column].append(f'- [{box}] [{r["id"]}] {details(r, state)["title"]} ({label})')
    for column, lines in cards.items():
        heading = f"## {column}\n"
        if heading not in text:
            raise RuntimeError(f"Kanbun.md is missing {column!r}; restore that column before syncing.")
        text = text.replace(heading, heading + "\n" + "\n".join(lines) + "\n", 1)
    path.write_text(text)


def record(round_, state):
    entry = state["rounds"][round_["id"]]
    copy = details(round_, state)
    path = document_path("master")
    text = path.read_text() if path.exists() else "# Accepted review rounds\n"
    marker = f'<!-- accepted:{round_["id"]} -->'
    if marker in text:
        return
    text = text.replace("No rounds have been accepted yet. Run `./review start` to begin or resume.\n", "")
    section = [f'\n{marker}\n## {round_["id"]}: {copy["title"]}',
               "### TEAMS", copy["teams"], "### GitLab MR"]
    for repo, sha in entry["accepted_commits"].items():
        section.extend([f"#### {repo}", f'**Title:** {copy["mr_title"]}',
                        copy["descriptions"][repo],
                        f'Commit: `{sha}`. Review base: `{entry["before"][repo]}`. '
                        f'Target branch: `{"master" if repo == "es" else "main"}` after preceding rounds merge.'])
    section.extend(["### Validation", copy["validation"], ""])
    path.write_text(text.rstrip() + "\n" + "\n\n".join(section))


def finish_pending(plan, state):
    pending = state.get("pending")
    if not pending:
        return
    r = next(r for r in plan["rounds"] if r["id"] == pending["round"])
    # A journal makes interruption between repositories recoverable without rollback.
    for repo, after in pending["after"].items():
        if "branch refs/heads/master\n" in git(repo, "worktree", "list", "--porcelain"):
            raise RuntimeError(f"{repo}: master is checked out; switch away before recovering acceptance.")
        before = pending["before"][repo]
        head = git(repo, "rev-parse", "master").strip()
        if head not in (before, after):
            raise RuntimeError(f"{repo}: master moved outside review; inspect pending journal before continuing.")
    for repo, after in pending["after"].items():
        before = pending["before"][repo]
        if git(repo, "rev-parse", "master").strip() == before:
            git(repo, "update-ref", "refs/heads/master", after, before)
    entry = state["rounds"].setdefault(r["id"], {})
    entry.update(status="accepted", accepted_commits=pending["after"],
                 before=pending["before"], accepted_at=pending["at"])
    record(r, state)
    del state["pending"]
    save(state_path(), state)
    board(plan, state)


def accept(plan, state, r):
    if state["rounds"].get(r["id"], {}).get("drafts"):
        raise RuntimeError("There is unfinished editor text. Save it or discard drafts before acceptance.")
    if state["rounds"].get(r["id"], {}).get("status") == "changes_requested":
        raise RuntimeError("Changes are requested. Revise the patch/copy, then use 'resolve' before accepting.")
    before, after = {}, {}
    copy = details(r, state)
    # Prepare every commit first, without touching any checkout or its real index.
    for repo, source in r["commits"].items():
        worktrees = git(repo, "worktree", "list", "--porcelain")
        if "branch refs/heads/master\n" in worktrees:
            raise RuntimeError(f"{repo}: master is checked out; switch that checkout away from master first.")
        head = git(repo, "rev-parse", "master").strip()
        expected = plan["repositories"][repo]["base"]
        for prior in plan["rounds"]:
            if prior["id"] == r["id"]:
                break
            expected = state["rounds"].get(prior["id"], {}).get("accepted_commits", {}).get(repo, expected)
        if head != expected:
            raise RuntimeError(f"{repo}: master differs from its recorded accepted head.")
        with tempfile.TemporaryDirectory(prefix="review-index-") as directory:
            env = dict(os.environ, GIT_INDEX_FILE=str(Path(directory) / "index"))
            git(repo, "read-tree", head, env=env)
            git(repo, "apply", "--cached", "--3way", "--whitespace=error", data=patch(r, repo), env=env)
            tree = git(repo, "write-tree", env=env).strip()
        message = git(repo, "show", "-s", "--format=%B", source)
        # Source messages have already been wrapped to 72 columns.
        after[repo] = git(repo, "commit-tree", tree, "-p", head, data=message).strip()
        before[repo] = head
    state["pending"] = {"round": r["id"], "before": before, "after": after,
                        "at": datetime.now(timezone.utc).isoformat()}
    save(state_path(), state)
    finish_pending(plan, state)
    print(f'Accepted {r["id"]}; master, MASTER.md and Kanbun.md updated locally.')


def comment(state, r, text, anchor=None, reject=False):
    entry = state["rounds"].setdefault(r["id"], {})
    entry.setdefault("comments", []).append({"text": text, "anchor": anchor,
                                           "at": datetime.now(timezone.utc).isoformat()})
    if reject:
        entry["status"] = "changes_requested"
    save(state_path(), state)


def edit(state, r, repo=None):
    directory = ROOT / ".review/edits" / r["id"]
    directory.mkdir(parents=True, exist_ok=True)
    if repo:
        if repo not in r["commits"]:
            raise RuntimeError(f"Choose one of: {', '.join(r['commits'])}")
        path = directory / (repo + ".patch")
        if not path.exists():
            path.write_text(patch(r, repo))
    else:
        path = directory / "copy.json"
        copy = details(r, state)
        save(path, {key: copy[key] for key in ("title", "teams", "mr_title", "descriptions", "validation")})
    subprocess.run([*shlex.split(os.environ.get("VISUAL") or os.environ.get("EDITOR") or "vi"), str(path)], check=True)
    if not repo:
        copy = json.loads(path.read_text())
        if set(copy) != {"title", "teams", "mr_title", "descriptions", "validation"}:
            raise RuntimeError("Keep the five existing fields in copy.json.")
        save_copy(state, r, copy)
    print(f"Saved {path.relative_to(ROOT)}. Patch edits are checked again before acceptance.")


def show(r, state, full=False):
    copy = details(r, state)
    print(f'\n{r["id"]}: {copy["title"]}\n\nTEAMS: {copy["teams"]}\n')
    for repo, commit in r["commits"].items():
        print(f"{repo}: {commit[:12]}")
        print(git(repo, "show", "--format=", "--stat", commit).rstrip())
        if full:
            print(patch(r, repo))
    print(f'\nValidation: {copy["validation"]}')
    for note in state["rounds"].get(r["id"], {}).get("comments", []):
        print(f'COMMENT ({note["anchor"] or "round"}): {note["text"]}')


def interactive(plan, state):
    if not sys.stdin.isatty() or not sys.stdout.isatty():
        raise RuntimeError("Open a terminal and run ./review start. Use show --diff for plain output.")
    import curses
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from review_tui import Review
    act(plan, state, "start", {})
    try:
        curses.wrapper(lambda screen: Review(screen, sys.modules[__name__], plan, state).run())
    finally:
        state["active"] = False
        save(state_path(), state)


def main():
    global ROOT
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--root", type=Path, default=ROOT, help="Workspace containing .review/plan.json and repository paths")
    p.add_argument("--json", action="store_true", help="JSON desktop interface; input is a JSON object on stdin")
    p.add_argument("command", nargs="?", default="start", choices=(
        "start", "status", "show", "accept", "comment", "reject", "resolve", "edit", "edit-patch", "sync", "task-add", "task-move",
        "read", "pause", "next", "previous", "save-copy", "save-patch", "position", "draft",
        "discard-drafts", "save-field"))
    p.add_argument("text", nargs="*")
    p.add_argument("--diff", action="store_true", help="show every diff with 'show'")
    args = p.parse_args()
    ROOT = args.root.expanduser().resolve()
    if not (ROOT / ".review/plan.json").is_file():
        raise RuntimeError(f"No prepared review at {ROOT}. Choose a folder containing .review/plan.json.")
    with locked():
        plan = json.loads((ROOT / ".review/plan.json").read_text())
        state = read_state()
        recovering = bool(state.get("pending"))
        if not args.json:
            finish_pending(plan, state)
        r = current(plan, state)
        if args.json:
            from contextlib import redirect_stdout
            data = json.load(sys.stdin)
            if not isinstance(data, dict):
                raise ValueError("Review input must be a JSON object.")
            with redirect_stdout(sys.stderr):
                if recovering and args.command not in ("read", "pause"):
                    if args.command not in ("start", "accept"):
                        raise RuntimeError("An interrupted acceptance needs recovery. Start/resume the review first.")
                    if data.get("revision") and data["revision"] != snapshot(plan, state)["revision"]:
                        raise RuntimeError("The review changed. Refresh before recovering acceptance.")
                    finish_pending(plan, state)
                    # Recover only the already authorized acceptance. Never accept
                    # the following round as a side effect of retrying this one.
                    if args.command == "start":
                        act(plan, state, "start", {})
                else:
                    act(plan, state, args.command, data)
            print(json.dumps(snapshot(plan, state)))
        elif args.command == "status":
            for item in plan["rounds"]:
                status = state["rounds"].get(item["id"], {}).get("status", "prepared")
                print(f'{item["id"]} {status:18} {item["title"]}')
        elif args.command == "sync":
            board(plan, state)
        elif args.command.startswith("task-"):
            if len(args.text) < 2 or args.text[0] not in ("Todo", "In Progress", "Review", "Done"):
                raise RuntimeError('Use task-add/task-move COLUMN "task text"; quote "In Progress".')
            column, task = args.text[0], " ".join(args.text[1:])
            path = document_path("board")
            text = path.read_text()
            if args.command == "task-move":
                pattern = r"^- \[[ x]\] " + re.escape(task) + r"\n?"
                text, count = re.subn(pattern, "", text, flags=re.M)
                if count != 1:
                    raise RuntimeError("Task must match exactly one existing board card.")
            if task.startswith("[R"):
                raise RuntimeError("Review cards move through review decisions; choose a separate task name.")
            box = "x" if column == "Done" else " "
            text = text.replace(f"## {column}\n", f"## {column}\n\n- [{box}] {task}\n", 1)
            path.write_text(text)
        elif args.command == "start":
            interactive(plan, state)
        elif not r:
            print(f"Every round is accepted locally. See {document_path('master').relative_to(ROOT)}.")
        elif args.command == "show":
            show(r, state, full=args.diff)
        elif args.command == "accept":
            if recovering:
                print("Recovered the pending acceptance. Review the next round before accepting it.")
            else:
                act(plan, state, "accept", {})
        elif args.command in ("comment", "reject"):
            if not args.text:
                raise RuntimeError("Supply the comment text as an argument.")
            act(plan, state, args.command, {"text": " ".join(args.text), "onHunk": False})
        elif args.command == "resolve":
            act(plan, state, "resolve", {})
        elif args.command == "edit":
            edit(state, r)
        elif args.command == "edit-patch":
            if len(args.text) != 1:
                raise RuntimeError("Supply one repository name.")
            edit(state, r, args.text[0])
        else:
            act(plan, state, args.command, {})


if __name__ == "__main__":
    try:
        main()
    except (EOFError, KeyboardInterrupt):
        print("\nPaused. Resume with ./review start.")
    except (OSError, RuntimeError, ValueError, KeyError, subprocess.CalledProcessError) as error:
        print(f"review: {error}", file=sys.stderr)
        sys.exit(1)
