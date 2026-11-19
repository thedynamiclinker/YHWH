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
LETTERS = {
    "house": ("A small housing question", "letterHouse"),
    "bread": ("You saved something", "letterBread"),
    "offering": ("About the rent", "letterOffering"),
    "inspect": ("I came down to look", "letterInspect"),
    "seed": ("An update from the land department", "letterSeed"),
    "covenant": ("Long-term support", "letterCovenant"),
}
WALK = {
    "house": "Open a file", "bread": "Save a file", "seed": "Visit another world",
    "inspect": "Open the terminal", "covenant": "Open another tab", "navigate": "Explore a directory",
}
WEB = re.compile(r"\[([^\]\n]+)\]\((https?://[^\s)]+)\)|(https?://[^\s<>]+)")


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
    def levels(self):
        return self.config.library.json("default/levels.json")

    def level_options(self, state=None):
        if state is None:
            state = self.state("edition")
        unlocked = state.get("unlocked", 100)
        paid = [level["energy"] for level in self.levels["levels"] if "offer" in level]
        return [level for level in self.levels["levels"] if level["energy"] <= (unlocked if unlocked in paid else 100)]

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
        return choices[0] if values.get("theme") == "dawkins" or amount == 0 else (
            choices[1] if values.get("theme") == "nietzsche" or amount < 100 else choices[2])

    def select_level(self, level, *, unlock=False):
        def select(state):
            energy = level["energy"]
            edition = next((item for item in self.levels["levels"] if item["energy"] > state.get("unlocked", 100)), None)
            if unlock:
                if edition != level:
                    raise ValueError("Reopen the upgrade preview to see the current offer.")
                state["unlocked"] = energy
            elif energy > state.get("unlocked", 100):
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
                if "offer" in previous:
                    state["selected"] = previous["energy"]
                else:
                    state.pop("selected")
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
        if not self.config["agent"]["mail"] or not self.config.library.etc or not self.config.yhwh.active:
            return
        values = self.config.yhwh.values
        energy = self.current_level().get("energy", self.energy(values))
        if energy == 0:
            return
        if energy < 100 and key != "inspect":
            return

        def deliver(state):
            if state.get("blocked") or time() - state.get("last", 0) < self.config["agent"]["mail_interval"]:
                return False
            letters = state.setdefault("letters", {})
            if key in letters:
                return False
            now = time()
            letters[key] = {"read": False, "at": now}
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

        title, word = LETTERS[key]
        body = self.address(self.words[word])
        message = self.state("inbox")["letters"][key]
        self.update("inbox", mark_read)
        date = datetime.fromtimestamp(message["at"]).astimezone().isoformat(timespec="minutes")
        return title, f"From: {SENDER}\nTo: {self.address('Abe')}\nDate: {date}\n\n{body}"

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
        instruction = (
            "You are a concise, practical assistant." if energy == 0 else
            "You are YHWH, the fictional character from We The Nameless. Address the user as Abe. "
            "Stay precise and restrained while helping with Unix work."
        )
        level = self.current_level()
        if level.get("names"):
            names = "; ".join(level["names"])
            instruction = ("You are YHWH, the fictional character from We The Nameless. "
                           f"Address the user using these names: {names}. Keep Unix instructions precise.")
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
