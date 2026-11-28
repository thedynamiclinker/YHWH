"""Local letters, Codex conversation, and readers for shared YHWH data."""

import asyncio
from datetime import datetime
import fcntl
from functools import cached_property
import json
import os
from pathlib import Path
import re
import signal
from tempfile import TemporaryDirectory
from time import time

from .config import atomic_write


SENDER = "yhwh@thedynamiclinker.com"
WALK = {
    "house": "Open a file", "bread": "Save a file", "seed": "Visit another world",
    "inspect": "Open the terminal", "covenant": "Open another tab", "navigate": "Explore a directory",
}
WEB = re.compile(r"\[([^\]\n]+)\]\((https?://[^\s)]+)\)|(https?://[^\s<>]+)")
MAIL_NAME = re.compile(r"\b(Abe|Mo|Dave|Josh)\b(?![’']s\b| inbox\b)", re.I)


def address_letter(letter, receipt, text):
    original = letter.get("to", "Abe") if letter.get("level") else "Abe"
    to = receipt.get("to")
    if not to or to == original:
        return text
    return MAIL_NAME.sub(lambda match: to if match[0].lower() == original.lower() else match[0], text)


def web_links(text):
    return {match[1] or match[3]: match[2] or match[3].rstrip(".,)]")
            for match in WEB.finditer(text)}


def read_json(path, default):
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        return default


class Services:
    def __init__(self, config):
        self.config = config

    @property
    def words(self):
        return self.config.library.json("default/words.json")

    @cached_property
    def email_letters(self):
        try:
            messages = self.config.library.json("default/yhwh-emails.json")["messages"]
        except FileNotFoundError:
            return {}
        return {message["id"]: message for message in messages}

    @cached_property
    def mode_mail(self):
        try:
            return self.config.library.json("default/mode-mail.json")
        except FileNotFoundError:
            return {}

    @property
    def mode_letters(self):
        return self.mode_mail.get("messages", [])

    @cached_property
    def letters(self):
        work = self.config.library.json("default/action-letters.json") if self.config.library.etc else {}
        return work | self.email_letters | {letter["id"]: letter for letter in self.mode_letters}

    @cached_property
    def levels(self):
        return self.config.library.json("default/levels.json")

    def level_options(self, state=None):
        if state is None:
            state = self.state("edition")
        levels = self.levels["levels"]
        free = [level for level in levels if "offer" not in level]
        return free + [level for level in levels if "offer" in level and level["energy"] == state.get("unlocked")]

    def current_level(self):
        state = self.state("edition")
        try:
            choices = self.level_options(state)
        except FileNotFoundError:
            return {}
        selected = state.get("selected")
        for level in choices:
            if level["energy"] == selected:
                return level
        values = self.config.yhwh.values
        amount = self.energy(values)
        theme = values.get("theme")
        theme = {"pro": "exodus", "yhwh": "genesis"}.get(theme, theme)
        if theme in ("samuel", "exodus"):
            return next(level for level in choices if level["id"] == theme)
        if theme == "dawkins" or amount == 0:
            return choices[0]
        return next(level for level in choices if level["id"] == ("nietzsche" if theme == "nietzsche" or amount < 100 else "genesis"))

    def select_level(self, level, *, unlock=False):
        def select(state):
            energy = level["energy"]
            options = self.level_options(state)
            edition = next((item for item in self.levels["levels"] if "offer" in item and item not in options), None)
            if unlock:
                if edition != level:
                    raise ValueError("Reopen the upgrade preview to see the current offer.")
                state["unlocked"] = energy
            elif level not in options:
                raise ValueError("That edition is locked.")
            state["selected"] = energy
            return True
        self.update("edition", select)

    def unsteal_upgrade(self, level):
        def relock(state):
            options = self.level_options(state)
            if options[-1] != level or "offer" not in level:
                raise ValueError("Reopen YHWH-ness to see the unlocked upgrades.")
            previous = options[-2]
            state["unlocked"] = previous["energy"]
            if state.get("selected") == level["energy"]:
                state["selected"] = previous["energy"]
            return True
        self.update("edition", relock)

    def address(self, text, name_index=0):
        names = self.current_level().get("names")
        return re.sub(r"\bAbe\b", lambda _: names[name_index % len(names)], text, flags=re.I) if names else text

    def state(self, name):
        return read_json(self.config.state / f"{name}.json", {})

    def update(self, name, change):
        # A second workspace may receive a letter or save a draft concurrently.
        directory = self.config.state
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        fd = os.open(directory / f"{name}.lock", os.O_CREAT | os.O_RDWR, 0o600)
        with os.fdopen(fd, "r+b") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            state = self.state(name)
            if change(state):
                atomic_write(directory / f"{name}.json", (json.dumps(state, indent=2, ensure_ascii=True) + "\n").encode())

    @staticmethod
    def energy(values):
        try:
            return min(100, max(0, int(values.get("energy", "100"))))
        except ValueError:
            return 100

    def delivery(self, key):
        if not self.config["agent"]["mail"] or not self.config.library.etc:
            return
        shared_config = self.config.yhwh.active
        if not shared_config and not os.environ.get("YHWH_HOME"):
            return
        values = self.config.yhwh.values
        if values.get("inbox") == "false":
            return
        level = self.current_level()
        level_id = level.get("id")
        energy = level.get("energy", self.energy(values))
        pending = (key,) if shared_config and (energy >= 100 or (energy > 0 and key == "inspect")) else ()
        if level_id in ("samuel", "exodus"):
            pending = tuple(letter["id"] for letter in self.mode_letters if letter["level"] == level_id)
        elif energy >= 100:
            pending += tuple(self.email_letters)
        misdelivery = self.mode_mail.get("misdelivery", {})
        misdelivery_interval = misdelivery["intervalMinutes"] * 60 if level_id in misdelivery.get("levels", []) else None
        if not pending and misdelivery_interval is None:
            return

        def deliver(state):
            now = time()
            if state.get("blocked") or now - state.get("last", 0) < self.config["agent"]["mail_interval"]:
                return False
            letters = state.setdefault("letters", {})
            candidate = None
            if misdelivery_interval is not None:
                first_arrival = next(iter(letters.values()), {}).get("at")
                since = state.get("last_misdelivery", first_arrival)
                if since is not None and now - since >= misdelivery_interval:
                    candidate = next((letter["id"] for letter in self.mode_letters
                                      if letter.get("mayMisdeliver") and letter["id"] not in letters), None)
                    if candidate is not None:
                        state["last_misdelivery"] = now
            if candidate is None:
                candidate = next((letter_id for letter_id in pending if letter_id not in letters), None)
            if candidate is None:
                return False
            letter = self.letters[candidate]
            profile = self.mode_mail.get("delivery", {}).get(level_id)
            to, verse = letter.get("to", "Abe"), letter.get("verse")
            if profile:
                to = profile["name"]
                if not verse or not verse.startswith(tuple(book + " " for book in profile["books"])):
                    choices = profile["verses"]
                    verse = choices[len(letters) % len(choices)]
            letters[candidate] = {"read": False, "at": now, "to": to, "verse": verse}
            state["last"] = now
            return True

        self.update("inbox", deliver)

    def walk(self, key):
        if self.config.yhwh.values.get("narrative") != "true":
            return

        def record(state):
            steps = state.setdefault("steps", [])
            if key in steps:
                return False
            steps.append(key)
            return True

        self.update("walk", record)

    def letter(self, key):
        def mark_read(state):
            state["letters"][key]["read"] = True
            return True

        letter = self.letters[key]
        message = self.state("inbox")["letters"][key]
        self.update("inbox", mark_read)
        title = address_letter(letter, message, letter["title"])
        body = address_letter(letter, message, self.words[letter["textKey"]])
        date = datetime.fromtimestamp(message["at"]).astimezone().isoformat(timespec="minutes")
        to = message.get("to") or letter.get("to") or "Abe"
        return title, f"From: {SENDER}\nTo: {to}\nDate: {date}\n\n{body}", message.get("verse", letter.get("verse"))

    def block(self, blocked):
        def change(state):
            state["blocked"] = blocked
            return True

        self.update("inbox", change)

    @cached_property
    def verses(self):
        data = self.config.library.json("verses/we-the-nameless.json")
        if data["schemaVersion"] != 1:
            raise ValueError("Unsupported verse library format")
        books = {}
        for verse in data["verses"]:
            if not verse["variant"] and verse["chapter"]:
                books.setdefault(verse["book"], {}).setdefault(verse["chapter"], []).append(verse)
        return books

    def commentary(self, verse):
        return self.state("verse-commentary").get("commentaries", {}).get(verse["id"], {}).get("text", verse["commentary"])

    def cited_verses(self, reference):
        match = re.fullmatch(r"(.+) (\d+):(\d+)([a-z]|[-–](\d+))?", reference)
        if not match:
            return []
        book, chapter, first, suffix, last = match.groups()
        verses = self.verses.get(book, {}).get(chapter, [])
        exact = [verse for verse in verses if verse["verse"] == first + (suffix or "")]
        requested = range(int(first), int(last or first) + 1)
        return exact or [verse for verse in verses if any(
            number in requested for number in verse["numbers"]
        )]

    def conversation(self, directory):
        return self.state("conversation").get(str(directory), {})

    def store_conversation(self, directory, **fields):
        def change(state):
            state.setdefault(str(directory), {}).update(fields)
            return True
        self.update("conversation", change)

    def record_reply(self, directory, draft, exchange):
        def change(state):
            conversation = state.setdefault(str(directory), {})
            conversation["messages"] = conversation.get("messages", [])[-78:] + exchange
            if conversation.get("draft") == draft:
                conversation["draft"] = ""
            return True
        self.update("conversation", change)

    async def chat(self, directory, prompt, messages, settings, env, energy):
        if settings["backend"] == "offline":
            raise ValueError("Conversation is offline. The draft is saved.")
        level = self.current_level()
        if level.get("id") in ("dawkins", "nietzsche") or (not level and energy < 80):
            raise ValueError("Live YHWH conversation is available from Samuel onward.")
        name = ", ".join(level.get("names", ["Abe"]))
        voice = {
            "samuel": "You are stuck behind glass in the ark. Help Dave from inside the box.",
            "exodus": "Speak as the burning bush. Pharaoh is the eye on the dollar. Root on the universe is the story.",
            "genesis": "Use the affectionate, profane voice of Abe's houseguest and overexcited cofounder.",
        }.get(level.get("id"), "")
        instruction = ("You are YHWH, the fictional character from We The Nameless. "
                       f"Address the user as {name}. {voice} Keep Unix instructions precise. "
                       "yhwh ld links English and context; yhwh lm runs the result through Lord using the account that launched it.")
        conversation = messages[-77:] + [{"role": "user", "content": prompt}]
        request = (instruction + "\nThis is a read-only conversation. Do not change files or send messages.\n"
                   + json.dumps(conversation, ensure_ascii=True)).encode()
        with TemporaryDirectory(prefix="shaddai-chat-") as temp:
            last_message = Path(temp) / "answer"
            if settings["backend"] == "command":
                argv = settings["command"]
                if not argv:
                    raise ValueError("Set agent.command to a program and arguments in config.toml.")
            else:
                argv = [env.get("YHWH_CODEX") or settings["codex"], "exec", "--sandbox", "read-only",
                        "--skip-git-repo-check", "--color", "never", "--output-last-message",
                        str(last_message), "-"]
            child = await asyncio.create_subprocess_exec(
                *argv, cwd=directory, env=env, start_new_session=True, stdin=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE if settings["backend"] == "command" else asyncio.subprocess.DEVNULL,
            )
            try:
                output, errors = await asyncio.wait_for(child.communicate(request), settings["timeout"])
            except (TimeoutError, asyncio.CancelledError):
                try:
                    os.killpg(child.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                await child.wait()
                raise
            if child.returncode:
                raise OSError(errors.decode(errors="replace").strip()[-1200:] or f"Conversation exited {child.returncode}")
            answer = (last_message.read_text() if last_message.exists() else
                      (output or b"").decode(errors="replace")).strip()
        if not answer:
            raise OSError("The conversation returned an empty reply.")
        return conversation + [{"role": "assistant", "content": answer[:30000]}]
