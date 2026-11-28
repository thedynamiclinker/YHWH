"""The file sidebar and its expanded folder and preview columns."""

from functools import partial
import copy
import os
from pathlib import Path
import stat
import subprocess
from time import monotonic

from prompt_toolkit.data_structures import Point
from prompt_toolkit.key_binding import KeyBindings
from prompt_toolkit.layout.controls import FormattedTextControl
from prompt_toolkit.mouse_events import MouseEventType

from .files import Document, FileTree, copy_path, move_path


def label(text):
    return "".join(char if char.isprintable() else ascii(char)[1:-1] for char in str(text))


def clickable(action):
    def handle(event):
        if event.event_type == MouseEventType.MOUSE_UP:
            action()
        else:
            return NotImplemented
    return handle


class Browser:
    def __init__(self, root, config, workspace):
        self.root, self.workspace = root, workspace
        self.tree = FileTree(root, config["hidden"], config["ignore"])
        self.tree.refresh()
        self.history = [root]
        self.visit = 0
        self.ordinary_history = None
        self.clipboard = None
        self.last_click = None
        self.preview_cache = None
        self.control = FormattedTextControl(
            self.rows, focusable=True, show_cursor=False, key_bindings=self.keys(),
            get_cursor_position=lambda: Point(0, self.tree.selected),
        )

    @property
    def cwd(self):
        return self.tree.root

    @property
    def selected(self):
        return self.tree.current[0] if self.tree.current else None

    def physical(self, path):
        return self.tree.physical(path)

    def write_path(self, path):
        return self.physical(path.parent) / path.name

    def change_world(self, world):
        saved = self.snapshot()
        if world:
            if self.ordinary_history is None:
                self.ordinary_history = self.history, self.visit, self.cwd
            self.history, self.visit, target = [world.root], 0, world.root
        elif self.ordinary_history:
            self.history, self.visit, target = self.ordinary_history
            self.ordinary_history = None
        else:
            return
        self.tree.world = world
        if not self.navigate(target, record=False, force=True):
            self.restore(saved)
            self.tree.world = saved[-1]
            return False
        return True

    def snapshot(self, *, clone=False):
        return (copy.deepcopy(self.tree) if clone else self.tree,
                self.history.copy() if clone else self.history, self.visit, self.ordinary_history, self.tree.world)

    def restore(self, view):
        self.tree, self.history, self.visit, self.ordinary_history, self.tree.world = view
        self.preview_cache = self.last_click = None

    def refresh(self):
        self.tree.refresh()
        self.preview_cache = None
        self.workspace.message = next(iter(self.tree.errors), "")

    def navigate(self, directory, *, record=True, force=False, from_shell=False):
        directory = Path(os.path.abspath(directory))
        if self.tree.world:
            directory = self.tree.world.directory(directory)
        try:
            if directory == self.cwd and not force:
                return True
            with os.scandir(self.physical(directory)):
                pass
            self.workspace.refresh_config(directory)
        except (OSError, ValueError) as error:
            self.workspace.message = label(error)
            return False

        previous = self.cwd
        self.tree.root = directory
        self.tree.expanded.clear()
        self.tree.rows.clear()
        self.tree.query = ""
        self.last_click = None
        self.refresh()
        if previous.parent == directory:
            self.tree.reveal(previous)
        if record:
            self.history[self.visit + 1:] = [directory]
            self.visit = len(self.history) - 1
            self.workspace.attempt(self.workspace.services.walk, "navigate")
        if not from_shell:
            self.workspace.sync_shell_directory()
        return True

    def step_history(self, step):
        index = self.visit + step
        if 0 <= index < len(self.history) and self.navigate(self.history[index], record=False):
            self.visit = index

    def location(self):
        def go(text):
            if text.strip():
                path = self.workspace.shell_path(text)
                if self.physical(path).is_dir():
                    self.navigate(path)
                else:
                    self.workspace.open(path)
        self.workspace.ask("Go to path", go, str(self.cwd) + os.sep if self.cwd != Path("/") else "/")

    def filter(self):
        def update(query):
            self.tree.query = query.strip()
            self.refresh()
        self.workspace.ask("Filter files", update, self.tree.query, on_change=update)

    def toggle_hidden(self):
        self.tree.hidden = not self.tree.hidden
        self.refresh()

    def open(self):
        if self.tree.current:
            path, _, directory = self.tree.current
            if directory:
                self.navigate(self.cwd.parent if path is None else path)
            else:
                self.workspace.open(path)

    def expand(self):
        if self.tree.current:
            path, _, directory = self.tree.current
            if directory and path is not None and not self.physical(path).is_symlink():
                self.tree.expanded.symmetric_difference_update({path})
                self.refresh()

    def select(self, index):
        self.tree.selected = max(0, min(index, len(self.tree.rows) - 1))

    def click(self, index):
        now = monotonic()
        previous = self.last_click
        self.workspace.focus("files")
        self.select(index)
        if self.tree.current and self.tree.current[2] and self.workspace.config.yhwh.values.get("double_cd") != "true":
            self.last_click = None
            self.open()
            return
        self.last_click = self.selected, now
        if previous and previous[0] == self.selected and now - previous[1] < 0.4:
            self.last_click = None
            self.open()
        elif self.tree.current and self.tree.current[2] and self.selected not in self.tree.expanded:
            self.expand()

    def rows(self):
        fragments = []
        expanded, collapsed = ("-", "+") if os.environ.get("TERM") == "linux" else ("▾", "▸")
        for index, (path, depth, directory) in enumerate(self.tree.rows):
            if index:
                fragments.append(("", "\n"))
            style = "class:selected" if index == self.tree.selected else ""
            name_style = " class:folder" if directory and not style else ""
            if path is None:
                marker, name, detail = " ", "..", ""
            else:
                marker = (expanded if path in self.tree.expanded else collapsed) if directory else " "
                name = label(path.name) + ("@" if self.physical(path).is_symlink() else "")
                detail = "/" if directory else ""
            fragments.append((style + name_style, f" {'  ' * depth}{marker} {name}{detail} ",
                              clickable(partial(self.click, index))))
        if len(self.tree.rows) == 1:
            fragments.append(("class:muted", "\n  No matches" if self.tree.query else "\n  Empty folder"))
        return fragments

    def preview(self):
        path = self.selected
        if path is None:
            return [("class:muted", " Parent directory")]
        if self.preview_cache and self.preview_cache[0] == path:
            return self.preview_cache[1]

        fragments = [("class:heading", f" {label(path.name)}\n")]
        physical = self.physical(path)
        try:
            if physical.is_dir():
                children = self.tree.entries(path)
                fragments.append(("class:muted", f" {len(children)} items\n\n"))
                for child, directory in children[:80]:
                    suffix = "/" if directory else ""
                    fragments.append(("class:folder" if directory else "", f" {label(child.name)}{suffix}\n"))
            else:
                info = physical.stat()
                fragments.append(("class:muted", f" {info.st_size:,} bytes   {stat.filemode(info.st_mode)}\n\n"))
                lines = Document.sample(physical).splitlines()[:80]
                for line in lines:
                    style = "class:heading" if path.suffix.lower() in (".md", ".markdown") and line.startswith("#") else ""
                    fragments.append((style, f" {label(line.expandtabs(4))}\n"))
        except (OSError, ValueError) as error:
            fragments.append(("class:muted", f" {label(error)}"))
        self.preview_cache = path, fragments
        return fragments

    def keys(self):
        keys = KeyBindings()

        def bind(choices, action):
            for key in choices.split():
                keys.add(key)(lambda event: action())

        bind("up k", lambda: self.select(self.tree.selected - 1))
        bind("down j", lambda: self.select(self.tree.selected + 1))
        bind("pageup", lambda: self.select(self.tree.selected - 12))
        bind("pagedown", lambda: self.select(self.tree.selected + 12))
        bind("home g", lambda: self.select(0))
        bind("end G", lambda: self.select(len(self.tree.rows) - 1))
        bind("left h backspace", lambda: self.navigate(self.cwd.parent))
        bind("right l enter", self.open)
        bind(":", self.workspace.command_line)
        bind("space", self.expand)
        bind("/", self.filter)
        bind(".", self.toggle_hidden)
        bind("[", lambda: self.step_history(-1))
        bind("]", lambda: self.step_history(1))
        bind("a", lambda: self.create(directory=False))
        bind("A", lambda: self.create(directory=True))
        bind("r", self.rename)
        bind("y", lambda: self.copy(cut=False))
        bind("x", lambda: self.copy(cut=True))
        bind("p", self.paste)
        bind("D", self.trash)
        return keys

    def destination(self, name, directory):
        if name in ("", ".", "..") or Path(name).name != name:
            raise ValueError("Enter a single filename")
        path = directory / name
        if os.path.lexists(self.physical(path)):
            raise FileExistsError(f"Already exists: {path.name}")
        return path

    def create(self, *, directory):
        def create_at(name):
            path = self.destination(name, self.cwd)
            physical = self.write_path(path)
            if directory:
                physical.mkdir()
            else:
                physical.touch(exist_ok=False)
            self.refresh()
            self.tree.reveal(path)
            if not directory:
                self.workspace.open(path)
        self.workspace.ask("New folder" if directory else "New file", create_at)

    def rename(self):
        if source := self.selected:
            def rename_to(name):
                if name != source.name:
                    target = self.destination(name, source.parent)
                    physical = self.physical(source)
                    self.move(physical, physical.with_name(name), target)
            self.workspace.ask("Rename", rename_to, source.name)

    def copy(self, *, cut):
        if source := self.selected:
            self.clipboard = self.physical(source), cut
            self.workspace.message = f"{'Cut' if cut else 'Copied'} {label(source.name)}"

    def paste(self):
        if self.clipboard is None:
            self.workspace.message = "Copy or cut a file first"
            return
        source, cut = self.clipboard
        try:
            logical = self.destination(source.name, self.cwd)
            target = self.write_path(logical)
            if source.is_dir() and not source.is_symlink() and target.resolve().is_relative_to(source.resolve()):
                raise ValueError("Choose a destination outside the source folder")
            if cut:
                self.move(source, target, logical)
                self.clipboard = None
            else:
                copy_path(source, target)
                self.refresh()
                self.tree.reveal(logical)
        except (OSError, ValueError) as error:
            self.workspace.message = label(error)

    def move(self, source, target, logical):
        physical = None if source.is_symlink() else source.resolve()
        move_path(source, target)
        self.workspace.file_moved(source, target, physical)
        self.refresh()
        self.tree.reveal(logical)

    def trash(self):
        if not (source := self.selected):
            return
        source = self.physical(source)
        if self.workspace.has_open_file(source):
            self.workspace.message = "Close the affected document tabs before moving this item to Trash"
            return

        def remove(answer):
            if answer.strip().lower() not in ("y", "yes"):
                return
            result = subprocess.run(["gio", "trash", "--", source], capture_output=True, text=True, timeout=10)
            if result.returncode:
                raise OSError(result.stderr.strip() or "Could not move item to Trash")
            self.refresh()
            self.workspace.message = f"Moved {label(source.name)} to Trash"

        self.workspace.ask(f"Move {label(source.name)} to Trash? [y/N]", remove)
