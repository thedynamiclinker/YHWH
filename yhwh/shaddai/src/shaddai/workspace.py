"""The file browser, document tabs, and shell tabs share one workspace."""

from dataclasses import dataclass, field
from functools import lru_cache, partial
import asyncio
import os
from pathlib import Path
from random import choice
import re
import shlex
import shutil
import subprocess
import sys
from urllib.parse import unquote, urlencode, urlsplit
from uuid import uuid4

from prompt_toolkit.application import Application, get_app, run_in_terminal, set_app
from prompt_toolkit.clipboard import ClipboardData
from prompt_toolkit.enums import EditingMode
from prompt_toolkit.completion import FuzzyCompleter, WordCompleter
from prompt_toolkit.data_structures import Point
from prompt_toolkit.filters import Condition
from prompt_toolkit.input.ansi_escape_sequences import ANSI_SEQUENCES
from prompt_toolkit.key_binding import DynamicKeyBindings, KeyBindings
from prompt_toolkit.key_binding.vi_state import InputMode
from prompt_toolkit.keys import Keys
from prompt_toolkit.layout import (
    ConditionalContainer, Dimension, DynamicContainer, Float, FloatContainer,
    HSplit, Layout, VSplit, Window,
)
from prompt_toolkit.layout.controls import FormattedTextControl
from prompt_toolkit.layout.menus import CompletionsMenu
from prompt_toolkit.lexers import DynamicLexer, Lexer, PygmentsLexer, SimpleLexer
from prompt_toolkit.search import start_search
from prompt_toolkit.styles import DynamicStyle, Style
from prompt_toolkit.widgets import SearchToolbar, TextArea
from pygments.lexers import get_lexer_for_filename
from pygments.util import ClassNotFound

from .browser import Browser, clickable, label
from .config import Config, EDITOR_MODES
from .files import BinaryFile, Document, fuzzy
from .fonts import ConsoleFonts
from .navigation import serve_paths
from .terminal import Shell, TerminalControl
from .services import SENDER, WALK, Services, web_links
from .yhwh import Prefixes, World, save_setting


PANES = ("files", "editor", "terminal")
MODIFIED_KEYS = {
    "ctrl/alt/1": ("f13", "49;7"), "ctrl/alt/2": ("f14", "50;7"), "ctrl/alt/3": ("f15", "51;7"),
    "ctrl/shift/e": ("f16", "101;6"), "ctrl/tab": ("f20", "9;5"), "ctrl/shift/tab": ("f21", "9;6"),
}
PANEL_KEYS = {
    "terminal_expand": ("Terminal up", "ctrl/up", "up", False),
    "terminal_collapse": ("Terminal down", "ctrl/down", "down", False),
    "files_expand": ("File manager right", "ctrl/right", "right", False),
    "files_collapse": ("File manager left", "ctrl/left", "left", False),
    "terminal_grow": ("Resize terminal up", "ctrl/alt/shift/up", "up", True),
    "terminal_shrink": ("Resize terminal down", "ctrl/alt/shift/down", "down", True),
    "files_grow": ("Resize file manager right", "ctrl/alt/shift/right", "right", True),
    "files_shrink": ("Resize file manager left", "ctrl/alt/shift/left", "left", True),
}
THEMES = {
    "dark": {
        "": "bg:#1d1d23 #dddbe5",
        "sidebar": "bg:#25252e", "bar": "bg:#2c2b35 #d5d1e1",
        "active": "bg:#423856 #f0e4ff bold", "selected": "bg:#514368 #ffffff bold",
        "heading": "#dac4ff bold", "folder": "#9dbbef", "muted": "#a49eb4",
        "divider": "#534d62", "terminal": "bg:#18181d #dedbe6",
        "attention": "bg:#423036 #ffccae", "line-number": "#777484",
    },
    "light": {
        "": "bg:#fcf9ff #262133",
        "sidebar": "bg:#f0ebf7", "bar": "bg:#e6def0 #433551",
        "active": "bg:#daceed #341e54 bold", "selected": "bg:#d1bde9 #261339 bold",
        "heading": "#5b3882 bold", "folder": "#23548a", "muted": "#675b74",
        "divider": "#a398b0", "terminal": "bg:#f6f2fa #282133",
        "attention": "bg:#f3dcd6 #663624", "line-number": "#796d86",
    },
    "mono": {
        "bar": "reverse", "active": "bold underline", "selected": "reverse bold",
        "heading": "bold", "folder": "bold", "muted": "italic", "attention": "reverse",
    },
}
for rules in THEMES.values():
    rules.update(h2="#6d9eeb bold", h3="#ffe599 bold")
STYLES = {name: Style.from_dict(rules) for name, rules in THEMES.items()}


class MarkdownLexer(Lexer):
    def lex_document(self, document):
        other = PygmentsLexer(type(get_lexer_for_filename("file.md"))).lex_document(document)

        def line(index):
            text = document.lines[index]
            if match := re.match(r"^(#{2,3})\s", text):
                return [(f"class:h{len(match[1])}", text)]
            return other(index)

        return line


@lru_cache(maxsize=64)
def lexer(suffix):
    if suffix in (".md", ".markdown"):
        return MarkdownLexer()
    try:
        return PygmentsLexer(type(get_lexer_for_filename(f"file{suffix}")))
    except ClassNotFound:
        return SimpleLexer()


@dataclass
class Tab:
    document: Document
    editor: TextArea
    view: tuple
    tree_visible: bool
    terminal_visible: bool
    identifier: str = field(default_factory=lambda: uuid4().hex)
    shells: list[Shell] = field(default_factory=list)
    shell_index: int = 0
    pending_save: asyncio.TimerHandle | None = None
    save_paused: bool = False
    autosave: bool = False

    @property
    def dirty(self):
        return self.editor.text != self.document.saved


class Workspace:
    def __init__(self, root: Path, config: Config, file: Path | None = None):
        self.config = config
        self.services = Services(config)
        self.fonts = ConsoleFonts()
        self.chat_pending = set()
        self.open_socket = ""
        self.browser = Browser(root, config["files"], self)
        self.tree_width = config["ui"]["tree_width"]
        self.terminal_height = config["ui"]["terminal_height"]
        self.tree_visible = config["ui"]["tree_visible"]
        self.terminal_visible = config["ui"]["terminal_visible"]
        self.zoom = None
        self.pane = "editor" if file or not self.tree_visible else "files"
        self.upper_pane = self.pane
        self.columns, self.rows = 80, 24
        self.message = next(iter(config.yhwh.warnings), "")
        self.question = ""
        self.answer_action = None
        self.answer_change = None
        self.return_focus = None
        self.quoted = False
        self.tabs, self.tab_index = [], 0
        self.closed = []
        self.shell_number = 0
        self.search = SearchToolbar()
        self.reader_title = ""
        self.reader_links = {}
        self.reader_actions = {}
        self.reader_return = None
        self.reader_wrap = True
        self.level_aside_positions = {}
        self.reading = False
        self.reader = TextArea(read_only=True, wrap_lines=Condition(lambda: self.reader_wrap),
                               scrollbar=True, lexer=MarkdownLexer())
        self.add_tab(self.load(file) if file else Document())
        if file:
            self.browser.tree.reveal(file)
        self.answer = TextArea(height=1, multiline=False, prompt=lambda: f" {self.question} › ",
                               accept_handler=self.accept_answer, style="class:bar")
        self.answer.buffer.on_text_changed += self.answer_changed
        self.terminal = TerminalControl(lambda: self.shell, lambda: self.focus("terminal"),
                                        lambda: self.layout.current_control is self.terminal)
        self.layout = Layout(self.containers(), focused_element=self.control(self.pane))
        self.commands = self.workspace_commands()
        self.keys = self.workspace_keys()

    @property
    def tab(self):
        return self.tabs[self.tab_index]

    @property
    def shell(self):
        return self.shells[self.shell_index] if self.shells else None

    @property
    def shells(self):
        return self.tab.shells

    @property
    def shell_index(self):
        return self.tab.shell_index

    @shell_index.setter
    def shell_index(self, index):
        self.tab.shell_index = index

    def control(self, pane):
        return {"files": self.browser.control, "editor": self.tab.editor.control,
                "terminal": self.terminal}[pane]

    def containers(self):
        def when(container, predicate):
            return ConditionalContainer(container, filter=Condition(predicate))

        def divider():
            return Window(char="│", width=1, style="class:divider")

        def bar(content, cursor=None):
            return Window(FormattedTextControl(content, get_cursor_position=cursor), height=1, style="class:bar",
                          wrap_lines=False, always_hide_cursor=True)

        def file_columns():
            expanded = self.zoom == "files"
            return Dimension.exact(self.columns if self.columns < 56 else (
                max(30, self.columns * 2 // 5) if expanded and self.columns >= 66
                else self.columns if expanded
                else min(self.tree_width, self.columns - 30)
            ))

        places_visible = lambda: self.zoom == "files" and self.columns >= 96
        preview_visible = lambda: self.zoom == "files" and self.columns >= 66
        files = HSplit([
            bar(self.file_bar),
            VSplit([
                when(Window(FormattedTextControl(self.places), width=18, style="class:sidebar"),
                     places_visible),
                when(divider(), places_visible),
                VSplit([
                    Window(self.browser.control, width=file_columns, style="class:sidebar",
                           always_hide_cursor=True),
                    when(divider(), preview_visible),
                    when(Window(FormattedTextControl(self.browser.preview), wrap_lines=True),
                         preview_visible),
                ]),
            ]),
        ])
        document = HSplit([
            bar(self.document_bar, lambda: self.tab_position(self.document_bar())),
            DynamicContainer(lambda: self.tab.editor),
            self.search,
        ])
        reader = HSplit([bar(self.reader_bar), self.reader])
        editor = DynamicContainer(lambda: reader if self.reading else document)
        terminal = HSplit([
            bar(self.shell_bar, lambda: self.tab_position(self.shell_bar())),
            Window(self.terminal, style="class:terminal", wrap_lines=False),
        ], height=lambda: None if self.zoom == "terminal" or self.rows < 15
            else Dimension.exact(min(self.terminal_height, max(3, self.rows - 6))))
        files_visible = lambda: self.visible("files")
        center_visible = lambda: self.visible("editor") or self.visible("terminal")
        base = HSplit([
            bar(self.workspace_bar),
            VSplit([
                when(files, files_visible),
                when(divider(), lambda: files_visible() and center_visible()),
                when(HSplit([
                    when(editor, lambda: self.visible("editor")),
                    when(terminal, lambda: self.visible("terminal")),
                ]), center_visible),
            ]),
            when(self.answer, lambda: self.answer_action is not None),
            Window(FormattedTextControl(self.status), height=1,
                   style=lambda: "class:attention" if self.message else "class:bar", wrap_lines=False),
        ])
        return FloatContainer(base, [Float(xcursor=True, ycursor=True,
                                           content=CompletionsMenu(max_height=9, scroll_offset=1))])

    def visible(self, pane):
        if self.zoom == "terminal":
            return pane == "terminal" or (pane == "files" and self.tree_visible and self.columns >= 56)
        if self.zoom:
            return pane == self.zoom
        if self.rows < 15 and (self.pane == "terminal" or pane == "terminal"):
            return self.pane == pane
        if pane == "terminal":
            return self.terminal_visible
        if not self.tree_visible:
            return pane == "editor"
        return self.columns >= 56 or pane == self.upper_pane

    def run(self):
        for letter, direction in zip("ABCD", ("up", "down", "right", "left")):
            for code, modifiers in ((7, "c-"), (8, "c-s-")):
                ANSI_SEQUENCES[f"\x1b[1;{code}{letter}"] = (Keys.Escape, Keys(modifiers + direction))
        # Prompt Toolkit represents these extended keys as Meta+Control pairs.
        for code in ("96;5", "96;6", "126;6"):
            ANSI_SEQUENCES[f"\x1b[{code}u"] = (Keys.Escape, Keys.ControlAt)
        for code in (96, 126):
            ANSI_SEQUENCES[f"\x1b[27;5;{code}~"] = (Keys.Escape, Keys.ControlAt)
            ANSI_SEQUENCES[f"\x1b[27;6;{code}~"] = (Keys.Escape, Keys.ControlAt)
        for key, code in MODIFIED_KEYS.values():
            symbol, modifiers = code.split(";")
            ANSI_SEQUENCES[f"\x1b[{code}u"] = Keys(key)
            ANSI_SEQUENCES[f"\x1b[27;{modifiers};{symbol}~"] = Keys(key)
        ANSI_SEQUENCES["\x1b[69;6u"] = Keys.F16
        mouse = Condition(lambda: self.config["ui"]["mouse"] and self.answer_action is None)
        app = Application(layout=self.layout, key_bindings=DynamicKeyBindings(lambda: self.keys), full_screen=True,
                          mouse_support=mouse, min_redraw_interval=1 / 60,
                          style=DynamicStyle(lambda: STYLES[self.config["ui"]["theme"]]),
                          before_render=self.before_render, after_render=self.after_render)
        app.timeoutlen, app.ttimeoutlen = 0.25, 0.08
        if self.fonts.console and self.config["fonts"]["apply_on_start"]:
            self.attempt(self.fonts.apply, self.config["fonts"]["default"], self.config["fonts"])

        async def interface(address):
            self.open_socket = address
            await app.run_async()

        try:
            with set_app(app):
                asyncio.run(serve_paths(interface, self.open_request))
        finally:
            self.flush_edits()
            for tab in self.tabs:
                for shell in tab.shells:
                    shell.close()
            self.fonts.close()

    def sync_editor_keys(self, app):
        document_focused = self.layout.current_control is self.tab.editor.control
        app.editing_mode = EditingMode.VI if document_focused and self.config.preferred_editor == "vim" else EditingMode.EMACS

    def before_render(self, app):
        self.rows, self.columns = app.output.get_size()
        self.terminal.size = None
        self.sync_editor_keys(app)
        if self.layout.current_control is self.tab.editor.control and self.pane != "editor":
            self.pane = self.upper_pane = "editor"
            self.quoted = False

    def after_render(self, app):
        if self.terminal.size and self.visible("terminal"):
            if self.shell is None:
                self.add_shell(self.browser.cwd)
            if self.shell.exited:
                self.close_shell()
                app.invalidate()
                return
            self.shell.fit(*self.terminal.size, app.invalidate)

    def hint(self, action):
        if action is None:
            return ""
        keys = self.config["keys"][action]
        if not keys:
            return ""
        key = keys[0]
        if key.startswith("f") and key[1:].isdigit():
            return key.upper()
        if len(key) == 8 and key.startswith("escape ") and key[-1].isupper():
            return f"Alt+Shift+{key[-1]}"
        parts = key.replace("escape ", "Alt+").replace("c-", "Ctrl+").replace("s-", "Shift+").split("+")
        return "+".join([*parts[:-1], parts[-1].capitalize()])

    def workspace_bar(self):
        parts = [("class:heading", "  Shaddai  ")]
        for name, pane, toggle in (("Files", "files", self.toggle_files),
                                   ("Terminal", "terminal", self.toggle_terminal)):
            if pane == "files" and not self.tree_visible or pane == "terminal" and not self.terminal_visible:
                style = "class:muted"
            else:
                style = "class:active" if self.pane == pane else ""
            parts.append((style, f" {name} ", clickable(toggle)))
        parts.append(("class:active" if self.pane == "editor" else "",
                      " Focus ", clickable(lambda: self.focus("editor"))))
        parts.extend([
            ("", " Commands ", clickable(self.palette)),
            ("", " Inbox ", clickable(self.inbox)),
            ("", " Settings ", clickable(self.settings)),
            ("class:muted", " Need Some Help? ", clickable(self.help_worlds)),
        ])
        if world := self.browser.tree.world:
            parts.append(("class:heading", f" [{world.name}] ", clickable(self.leave_world)))
        return parts

    def reader_bar(self):
        return [
            ("class:heading", f" {label(self.reader_title)} "),
            ("", " Back ", clickable(self.close_reader)),
            ("", " Actions " if self.reader_actions else " Links ", clickable(self.follow_link)),
        ]

    def file_bar(self):
        expanded = self.zoom == "files"
        return [
            ("class:active" if self.pane == "files" else "", " Files ", clickable(lambda: self.focus("files"))),
            ("", " ‹ ", clickable(lambda: self.browser.step_history(-1))),
            ("", " › ", clickable(lambda: self.browser.step_history(1))),
            ("class:heading", " ↙ " if expanded else " ↗ ", clickable(lambda: self.maximize("files"))),
            ("class:heading", " +Nu ", clickable(lambda: self.attempt(self.new_universe))),
            ("", " Cd ", clickable(lambda: self.attempt(self.enter_universe))),
            ("", " Go ", clickable(lambda: self.attempt(self.chroot_universe))),
            ("class:muted", f" {label(self.browser.cwd if expanded else self.browser.cwd.name or '/')} ",
             clickable(self.browser.location)),
        ]

    def places(self):
        places = [("Workspace", self.browser.root), ("Home", Path.home())]
        return [("class:heading", " Places\n\n")] + [
            ("class:active" if directory == self.browser.cwd else "", f" {name}\n",
             clickable(partial(self.browser.navigate, directory))) for name, directory in places
        ]

    def document_bar(self):
        parts = []
        for index, tab in enumerate(self.tabs):
            style = "class:active" if tab is self.tab else "class:muted"
            name = label(tab.document.name)
            parts.append((style, f" {name[:27]}{'…' if len(name) > 27 else ''}{' •' if tab.dirty else ''} ",
                          clickable(partial(self.switch_tab, index))))
        parts.append(("class:heading", " + ", clickable(self.new_tab)))
        parts.append(("class:muted", " × ", clickable(self.close_document)))
        parts.append(("class:heading", " ↙ " if self.zoom == "editor" else " ↗ ",
                      clickable(lambda: self.maximize("editor"))))
        path = self.tab.document.path
        if path:
            parent = path.parent
            if parent.is_relative_to(self.browser.root):
                parent = parent.relative_to(self.browser.root)
            if str(parent) != ".":
                parts.append(("class:muted", f"  {label(parent)}"))
        return parts

    def shell_bar(self):
        parts = [("class:heading", " Terminal ")]
        for index, shell in enumerate(self.shells):
            style = "class:active" if shell is self.shell else ""
            mark = " (exited)" if shell.exited else ""
            parts.append((style, f" Shell {shell.number}{mark} ", clickable(partial(self.switch_shell, index))))
        parts.extend([
            ("class:heading", " + ", clickable(self.new_shell)),
            ("class:muted", " ↗ " if self.zoom != "terminal" else " ↙ ",
             clickable(lambda: self.maximize("terminal"))),
            ("class:muted", " × ", clickable(self.toggle_terminal)),
        ])
        return parts

    @staticmethod
    def tab_position(fragments):
        offset = 0
        for style, text, *_ in fragments:
            offset += len(text)
            if style == "class:active":
                return Point(offset - 1, 0)
        return Point(0, 0)

    def status(self):
        if self.message:
            return " " + label(self.message)
        if self.quoted:
            return " Next key goes directly to the shell"
        if self.reading and self.pane == "editor":
            details = ("Reading   Esc Back   Enter Toggle   Alt+G Actions" if self.reader_actions
                       else "Reading   Esc Back   Alt+G Links")
        elif self.pane == "files":
            details = f"{len(self.browser.tree.rows) - 1} items   / Filter   Enter Open"
        elif self.pane == "terminal":
            details = ("Shell exited   Enter Restart" if self.shell and self.shell.exited
                       else f"{self.hint('new_shell')} New shell   Shift+PgUp Scrollback")
        else:
            cursor = self.tab.editor.document
            mode = self.config.preferred_editor or "emacs"
            label_mode = mode.capitalize()
            if mode == "vim":
                label_mode = "Vim " + get_app().vi_state.input_mode.name.lower()
            if mode == "nano":
                label_mode = "Nano   Ctrl+O Write Out   Ctrl+W Where Is   Ctrl+X Close"
            details = f"Ln {cursor.cursor_position_row + 1}, Col {cursor.cursor_position_col + 1}   {label_mode}"
        return (f" {details}   │   {self.hint('toggle_terminal')} Terminal   │   "
                f"{self.hint('maximize')} Maximize   │   {self.hint('palette')} Commands")

    def focus(self, pane):
        if self.zoom and self.zoom != pane:
            self.zoom = None
        if pane == "files":
            self.tree_visible = True
        elif pane == "terminal":
            self.terminal_visible = True
        if pane != "terminal":
            self.upper_pane = pane
        self.pane = pane
        self.message = ""
        self.quoted = False
        self.layout.focus(self.reader if pane == "editor" and self.reading else self.control(pane))

    def toggle_files(self):
        if self.visible("files"):
            self.tree_visible = False
            if self.pane == "files":
                self.focus("editor")
            if self.zoom == "files":
                self.zoom = None
        else:
            self.focus("files")

    def toggle_terminal(self):
        shown = self.visible("terminal")
        self.zoom = None
        if shown:
            self.terminal_visible = False
            self.focus("editor")
        else:
            self.focus("terminal")

    def clear_terminal(self):
        if self.visible("terminal"):
            self.focus("terminal")
            if self.shell:
                self.shell.write("\x0c")
        else:
            self.browser.location()

    def maximize(self, pane=None):
        pane = pane or self.pane
        self.zoom = None if self.zoom == pane else pane
        self.focus(pane)

    def cycle_maximize(self):
        if self.zoom is None:
            self.maximize("files")
        elif self.zoom == "terminal":
            self.zoom = None
            self.focus("editor")
        else:
            self.maximize(PANES[PANES.index(self.zoom) + 1])

    def focus_next(self):
        panes = [pane for pane in PANES if pane == "editor"
                 or pane == "files" and self.tree_visible or pane == "terminal" and self.terminal_visible]
        self.focus(panes[(panes.index(self.pane) + 1) % len(panes)])

    def direction(self, direction):
        match direction, self.pane:
            case "left", "editor":
                self.focus("files")
            case "right", "files":
                self.focus("editor")
            case "down", pane if pane != "terminal":
                self.focus("terminal")
            case "up", "terminal":
                self.focus(self.upper_pane)

    def resize(self, direction):
        values = self.config.yhwh.values
        def delta(key, fallback):
            try:
                return min(50, max(1, int(values.get(key, fallback))))
            except ValueError:
                return fallback

        if direction in ("left", "right"):
            if self.tree_visible and self.columns >= 56 and self.zoom != "files":
                width = min(self.tree_width, self.columns - 30)
                step = delta("panel_resize_columns", 3)
                self.tree_width = min(self.columns - 30, max(12, width + (step if direction == "right" else -step)))
        elif self.terminal_visible and self.zoom is None:
            limit = max(3, self.rows - 6)
            height = min(self.terminal_height, limit)
            step = delta("panel_resize_rows", 1)
            self.terminal_height = min(limit, max(3, height + (step if direction == "up" else -step)))

    def move_split(self, direction, incremental=False):
        files = direction in ("left", "right")
        pane, attribute = ("files", "tree_visible") if files else ("terminal", "terminal_visible")
        step = 1 if direction in ("up", "right") else -1
        current = 2 if self.zoom == pane else int(getattr(self, attribute))
        if incremental and current == 1 and self.visible(pane):
            self.resize(direction)
            return
        next_size = min(2, max(0, current + step))
        if current == next_size:
            return
        if next_size == 2:
            self.zoom = pane
        elif self.zoom == pane or (not files and step > 0):
            self.zoom = None
        setattr(self, attribute, next_size > 0)
        if next_size == 2 or (next_size == 1 and not self.visible(pane)):
            self.focus(pane)
        elif next_size == 0 and self.pane == pane:
            self.focus(self.upper_pane if not files else "editor")

    def load(self, path):
        return Document.load(path, self.config["editor"]["max_file_bytes"])

    def editor(self, document):
        config = self.config["editor"]
        return TextArea(text=document.text, focus_on_click=True, search_field=self.search,
                        wrap_lines=Condition(lambda: self.config["editor"]["wrap"]),
                        line_numbers=config["line_numbers"],
                        lexer=DynamicLexer(lambda: lexer(document.path.suffix.lower()) if document.path else lexer("")))

    def add_tab(self, document):
        tab = Tab(document, self.editor(document), self.browser.snapshot(clone=True),
                  self.config["ui"]["tree_visible"], self.config["ui"]["terminal_visible"],
                  autosave=self.autosave_for(document))
        tab.editor.buffer.on_text_changed += lambda _: self.schedule_save(tab)
        self.tabs.append(tab)

    def autosave_for(self, document):
        if document.path and document.path.parent != self.config.cwd:
            return Config(document.path.parent, self.config.prefix)["editor"]["autosave"]
        return self.config["editor"]["autosave"]

    def replace_document(self, document):
        tab = self.tab
        tab.document, tab.editor = document, self.editor(document)
        tab.autosave, tab.save_paused = self.autosave_for(document), False
        tab.pending_save = None
        editor = tab.editor
        editor.buffer.on_text_changed += lambda _: self.schedule_save(tab)

    def new_document(self):
        self.reading = False
        if not self.tab.document.path and not self.tab.dirty:
            self.focus("editor")
            return
        self.new_tab()

    def new_tab(self):
        self.add_tab(Document())
        self.switch_tab(len(self.tabs) - 1)
        self.letter("covenant")

    def open(self, path, *, reuse=False):
        path = Path(os.path.abspath(path))
        physical = self.browser.physical(path)
        if physical.is_dir():
            return self.browser.navigate(path)
        if physical.is_file() and physical.suffix.lower() in {
            ".pdf", ".csv", ".tsv", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg",
            ".mp3", ".mp4", ".wav", ".webm", ".ods", ".xlsx", ".docx", ".odt",
        }:
            self.attempt(self.external, physical)
            return True
        for index, tab in enumerate(self.tabs):
            if tab.document.path == physical:
                self.switch_tab(index)
                return True
        try:
            document = self.load(physical)
        except (UnicodeDecodeError, BinaryFile):
            self.attempt(self.external, physical)
            return True
        except (OSError, ValueError) as error:
            self.message = str(error)
            return False
        self.flush_edits()
        if (reuse or not self.tab.document.path) and not self.tab.dirty:
            self.replace_document(document)
            self.tab.view = self.browser.snapshot()
            self.activate_tab(self.tab_index)
        else:
            self.add_tab(document)
            self.switch_tab(len(self.tabs) - 1)
        self.letter("house")
        return True

    def open_request(self, path, identifier):
        directory = path.is_dir()
        if not directory and not path.is_file():
            raise FileNotFoundError(path)
        if self.answer_action is not None:
            raise ValueError("Finish the open workspace prompt and retry.")
        index = next((i for i, tab in enumerate(self.tabs) if tab.identifier == identifier), None)
        if index is None:
            self.new_tab()
        elif index != self.tab_index:
            self.switch_tab(index)
        if directory:
            if not self.browser.navigate(path):
                raise OSError(self.message)
            self.focus("files")
        elif not self.open(path, reuse=True):
            raise OSError(self.message)
        get_app().invalidate()

    def switch_tab(self, index):
        self.flush_edits()
        self.tab.view = self.browser.snapshot()
        self.tab.tree_visible, self.tab.terminal_visible = self.tree_visible, self.terminal_visible
        self.activate_tab(index % len(self.tabs))

    def activate_tab(self, index):
        self.reading = False
        self.tab_index = index
        self.browser.restore(self.tab.view)
        self.browser.refresh()
        self.attempt(self.refresh_config, self.browser.cwd)
        self.tree_visible, self.terminal_visible = self.tab.tree_visible, self.tab.terminal_visible
        if path := self.tab.document.path:
            if world := self.browser.tree.world:
                path = world.directory(path) if path.is_relative_to(world.shared) else path
            self.browser.tree.reveal(path)
        self.focus("editor")

    def close_document(self):
        tab = self.tab

        def close():
            if tab.pending_save:
                tab.pending_save.cancel()
            for shell in tab.shells:
                shell.close()
            if tab.document.path:
                self.closed.append((tab.document.path, self.browser.snapshot(clone=True)))
                del self.closed[:-20]
            self.tabs.remove(tab)
            if not self.tabs:
                self.add_tab(Document())
            self.activate_tab(min(self.tab_index, len(self.tabs) - 1))

        self.flush_edits()
        self.confirm_discard([tab], close)

    def reopen_tab(self):
        if not self.closed:
            self.message = "No closed document tabs"
            return
        path, view = self.closed[-1]
        document = self.load(path)
        self.add_tab(document)
        self.tabs[-1].view = view
        self.switch_tab(len(self.tabs) - 1)
        self.closed.pop()

    def has_open_file(self, path):
        physical = None if path.is_symlink() else path.resolve()
        return any(doc.path and (doc.path.is_relative_to(path)
                                 or physical is not None and doc.target and doc.target.is_relative_to(physical))
                   for doc in (tab.document for tab in self.tabs))

    def file_moved(self, source, destination, physical):
        for doc in (tab.document for tab in self.tabs):
            if doc.path and doc.path.is_relative_to(source):
                doc.path = destination / doc.path.relative_to(source)
            if physical is not None and doc.target and doc.target.is_relative_to(physical):
                doc.target = destination.resolve() / doc.target.relative_to(physical)

    def save(self, as_new=False, after=None):
        tab = self.tab

        def write(path=None):
            tab.document.text = tab.editor.text
            tab.document.save(path)
            tab.save_paused = False
            tab.autosave = self.autosave_for(tab.document)
            self.browser.refresh()
            self.browser.tree.reveal(tab.document.path)
            self.message = f"Saved {tab.document.name}"
            self.letter("bread")
            if after:
                after()

        if as_new or tab.document.path is None:
            def named(name):
                if name.strip():
                    path = Path(os.path.abspath(self.browser.cwd / Path(name).expanduser()))
                    write(self.browser.write_path(path))
            self.ask("Save as", named)
        else:
            self.attempt(write)

    def reload_document(self):
        path = self.tab.document.path
        if path:
            def reload():
                if self.tab.pending_save:
                    self.tab.pending_save.cancel()
                self.replace_document(self.load(path))
                self.reading = False
                self.focus("editor")
            self.confirm_discard([self.tab], reload)

    def schedule_save(self, tab):
        if tab.pending_save:
            tab.pending_save.cancel()
        if tab.document.path and tab.autosave and not tab.save_paused:
            tab.pending_save = asyncio.get_running_loop().call_later(0.7, self.autosave, tab)

    def autosave(self, tab):
        if tab.pending_save:
            tab.pending_save.cancel()
            tab.pending_save = None
        if tab.document.path and tab.autosave and tab.dirty and not tab.save_paused:
            try:
                tab.document.text = tab.editor.text
                tab.document.save()
                self.letter("bread")
            except (OSError, ValueError) as error:
                tab.save_paused = True
                self.message = f"{tab.document.name}: {error}"
            get_app().invalidate()

    def flush_edits(self):
        for tab in self.tabs:
            self.autosave(tab)

    def add_shell(self, directory):
        config = self.config["terminal"]
        command = config["shell"] or os.environ.get("SHELL") or "/bin/bash"
        env = {**self.config.yhwh.environment,
               "YHWH_TAB": self.tab.identifier, "YHWH_INTERFACE": "tty", "YHWH_TTY_SOCKET": self.open_socket}
        if (yhwh := self.config.library.command) and Path(yhwh).name == "yhwh" and Path(yhwh).is_absolute():
            env["PATH"] = os.pathsep.join((str(Path(yhwh).parent), env.get("PATH", os.defpath)))
        self.shell_number += 1
        self.shells.append(Shell(self.shell_number, command, self.browser.physical(directory),
                                 config["scrollback"], environment=env,
                                 interactive=self.config.yhwh.interactive()))
        self.shell_index = len(self.shells) - 1
        self.letter("inspect")

    def new_shell(self):
        self.add_shell(self.browser.cwd)
        self.focus("terminal")

    def switch_shell(self, index):
        self.shell_index = index % len(self.shells)
        self.focus("terminal")

    def close_shell(self):
        if self.shell:
            self.shells.pop(self.shell_index).close()
            self.shell_index = max(0, self.shell_index - 1)
        if not self.shells and self.terminal_visible:
            self.toggle_terminal()

    def step_tab(self, step):
        if self.pane == "terminal" and self.shells:
            self.switch_shell(self.shell_index + step)
        else:
            self.switch_tab(self.tab_index + step)

    def confirm_discard(self, tabs, action):
        count = sum(tab.dirty for tab in tabs)
        if count:
            prompt = "Discard unsaved edits" + (f" in {count} documents" if count > 1 else "") + "? [y/N]"
            self.ask(prompt, lambda answer: action() if answer.strip().lower() in ("y", "yes") else None)
        else:
            action()

    def ask(self, question, action, initial="", *, choices=None, hints=None, on_change=None):
        self.question = question
        self.return_focus = self.layout.current_control
        self.answer_change = None
        completer = WordCompleter(choices, ignore_case=True, sentence=True, meta_dict=hints) if choices else None
        self.answer.buffer.completer = FuzzyCompleter(completer, pattern=r"^.*") if completer else None
        self.answer.buffer.reset()
        self.answer.text = initial
        self.answer.buffer.cursor_position = len(initial)
        self.answer_action, self.answer_change = action, on_change
        self.layout.focus(self.answer)
        self.sync_editor_keys(get_app())
        if choices:
            self.answer.buffer.start_completion(select_first=False)

    def answer_changed(self, buffer):
        if self.answer_change:
            self.answer_change(buffer.text)

    def finish_answer(self):
        self.answer_action = self.answer_change = None
        self.layout.focus(self.return_focus)
        self.sync_editor_keys(get_app())

    def accept_answer(self, buffer):
        action = self.answer_action
        self.finish_answer()
        self.attempt(action, buffer.text)
        return False

    def attempt(self, action, *args):
        try:
            return action(*args)
        except (OSError, ValueError, subprocess.SubprocessError, RuntimeError) as error:
            self.message = str(error)

    def quick_open(self):
        config = self.config["files"]
        paths = self.browser.tree.paths("", config["search_limit"])
        relative = [str(path.relative_to(self.browser.cwd)) for path in paths]
        # Completions may be displayed by a terminal, so escape control characters in filenames.
        names = {label(path): path for path in relative}

        def choose(name):
            if name.strip():
                path = self.browser.cwd / Path(names.get(name, name)).expanduser()
                if not self.browser.physical(path).exists():
                    matches = [real for display, real in names.items() if fuzzy(name, display)]
                    if len(matches) == 1:
                        path = self.browser.cwd / matches[0]
                self.open(path)

        self.ask("Quick open", choose, choices=list(names))

    def palette(self, title="Commands", commands=None):
        commands = self.commands if commands is None else commands
        names = {name.casefold(): action for _, name, action, _ in commands}
        hints = {name: self.hint(key) for key, name, _, _ in commands}

        def execute(name):
            query = name.strip().casefold()
            action = names.get(query)
            if not action and query:
                matches = [run for option, run in names.items() if fuzzy(query, option)]
                if len(matches) == 1:
                    action = matches[0]
            if action:
                action()
            elif name.strip():
                self.message = f"Unknown command: {name}"

        self.ask(title, execute, choices=[name for _, name, _, _ in commands], hints=hints)

    def pick(self, title, choices):
        self.palette(title, [(None, name, action, False) for name, action in choices.items()])

    def show(self, title, text, links=None, *, back=None, wrap=True, actions=None):
        self.reader_title = title
        self.reader_links = links if links is not None else web_links(text)
        self.reader_actions = actions or {}
        self.reader_return = back
        self.reader_wrap = wrap
        self.reader.text = "\n".join(label(line.expandtabs(4)) for line in text.split("\n"))
        self.reader.buffer.cursor_position = 0
        self.reading = True
        self.focus("editor")

    def close_reader(self):
        back = self.reader_return
        self.reader_return = None
        self.reading = False
        self.focus("editor")
        if back:
            back()

    def preview(self):
        if self.reading:
            self.close_reader()
        else:
            text = self.tab.editor.text
            links = self.document_links()
            if self.tab.document.path and self.tab.document.path.suffix.lower() in (".md", ".markdown"):
                text = re.sub(r"\[([^\]\n]+)\]\([^\n)]+\)", r"\1", text)
                text = re.sub(r"\[\[([^|\]\n]+)(?:\|([^\]\n]+))?\]\]", lambda item: item[2] or item[1], text)
            self.show(self.tab.document.name, text, links)

    def document_links(self):
        text = self.tab.editor.text
        path = self.tab.document.path
        links = web_links(text)
        if path:
            for match in re.finditer(r"\[([^\]\n]+)\]\(([^\n)]+)\)|\[\[([^|\]\n]+)(?:\|([^\]\n]+))?\]\]", text):
                name, target = (match[4] or match[3], match[3]) if match[3] else (match[1], match[2])
                uri = urlsplit(target.strip("<>"))
                if uri.scheme == "mailto":
                    links[name] = target
                elif not uri.scheme and not uri.netloc:
                    location = path.parent / unquote(uri.path) if uri.path else path
                    if match[3] and not location.exists() and not location.suffix:
                        location = location.with_suffix(".md")
                    links[name] = location
        return links

    def follow_link(self):
        links = self.reader_links if self.reading else self.document_links()
        actions = {self.reader.document.lines[row]: action for row, action in self.reader_actions.items()} if self.reading else {}
        if not links and not actions:
            self.message = "No web links on this page"
            return
        actions.update({label(name): partial(self.open if isinstance(url, Path) else self.external, url)
                        for name, url in links.items()})
        self.pick("Reading actions" if self.reading and self.reader_actions else "Open link", actions)

    def tty_command(self, argv, *, pause=False, directory=None, finished=None):
        def run():
            try:
                result = subprocess.run(argv, cwd=directory or self.browser.physical(self.browser.cwd),
                                        env=self.config.yhwh.environment)
                if not result.returncode and finished:
                    finished()
                if result.returncode or pause:
                    print(f"\n{Path(argv[0]).name} exited with status {result.returncode}. Press Enter to return.",
                          file=sys.stderr)
                    sys.stdin.readline()
            except (OSError, KeyboardInterrupt) as error:
                self.message = str(error) or "Cancelled"

        run_in_terminal(run)

    def universe_command(self, *args):
        executable = self.config.library.command
        if not executable:
            raise ValueError("Install yhwh on PATH to use universe commands.")
        return [executable, *args]

    def new_universe(self):
        output = subprocess.check_output(self.universe_command("nu", "--list"), text=True)
        choices = {}
        for line in output.splitlines():
            name, title, description = line.split("\t", 2)
            choices[name] = f"{title} · {description}"

        def configure(name):
            if not name or name in (".", "..") or "/" in name or "\\" in name:
                raise ValueError("Enter one new directory name.")
            destination = str(self.browser.write_path(self.browser.cwd / name))

            def create(template):
                if template == "oci":
                    self.ask("OCI image", lambda image: self.tty_command(
                        self.universe_command("nu", destination, "--from", image), finished=self.browser.refresh))
                elif template in choices:
                    self.tty_command(self.universe_command("nu", destination, "--template", template),
                                     finished=self.browser.refresh)
                else:
                    raise ValueError("Choose a listed template.")

            self.ask("Universe template", create, "empty", choices=list(choices), hints=choices)

        self.ask("Nu · New universe directory name", configure)

    def universe_target(self):
        selected = self.browser.selected
        if selected and selected != self.browser.cwd.parent and self.browser.physical(selected).is_dir():
            return selected
        return self.browser.cwd

    def enter_universe(self):
        target = self.universe_target()
        result = subprocess.run(self.universe_command("cd", str(self.browser.physical(target))),
                                text=True, capture_output=True)
        if result.returncode:
            raise ValueError(result.stderr.strip() or "Choose a universe directory.")
        self.browser.navigate(target)

    def chroot_universe(self):
        directory = str(self.browser.physical(self.universe_target()))
        self.ask("Go · Chroot universe · optional outer paths (shell quoting)", lambda answer: self.tty_command(
            self.universe_command("go", directory, "--sudo",
                                  *(arg for path in shlex.split(answer) for arg in ("--mount", path)))))

    def external(self, target):
        if isinstance(target, Path):
            uri = target.as_uri()
        else:
            uri = target
            if urlsplit(uri).scheme not in ("https", "http", "mailto"):
                raise ValueError("Open an HTTP, HTTPS, or mailto link.")
        scheme = urlsplit(uri).scheme
        variable = {"http": "YHWH_BROWSER", "https": "YHWH_BROWSER", "mailto": "YHWH_MAILER",
                    "file": "YHWH_OPENER"}[scheme]
        if configured := self.config.yhwh.environment.get(variable):
            self.tty_command([*shlex.split(configured), uri])
            return
        if scheme in ("https", "http"):
            for name in ("lynx", "links", "elinks", "w3m"):
                if program := shutil.which(name, path=self.config.yhwh.environment.get("PATH")):
                    self.tty_command([program, uri])
                    return
        if (os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY")) and (program := shutil.which("xdg-open")):
            async def launch():
                try:
                    process = await asyncio.create_subprocess_exec(
                        program, uri, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
                    _, errors = await process.communicate()
                    if process.returncode:
                        raise OSError(errors.decode(errors="replace").strip() or f"xdg-open exited {process.returncode}")
                except OSError as error:
                    self.message = str(error)
                get_app().invalidate()
            get_app().create_background_task(launch())
        else:
            self.show("Open externally", uri + f"\n\nSet {variable} to a command that accepts this URI.",
                      links={})

    def refresh_config(self, directory=None):
        previous = self.config.library
        self.config.reload(directory)
        if previous != self.config.library:
            self.services.__dict__.pop("verses", None)
        self.keys = self.workspace_keys()
        self.browser.tree.hidden = self.config["files"]["hidden"]
        self.browser.tree.ignore = self.config["files"]["ignore"]

    def refresh(self):
        self.refresh_config()
        self.browser.refresh()
        if self.config.yhwh.warnings:
            self.message = self.config.yhwh.warnings[0]

    def edit_rc(self):
        path = self.config.yhwh.user / "rc"
        self.show("YHWH configuration",
                  f"{path}\n\nUse an unindented path for each scope. Indent Bash assignments beneath it.\n"
                  "F5 reloads the configuration after editing.")
        if path.is_file():
            self.open(path)

    def shared_setting(self, key, title, default, choices=None, *, validate=None):
        def select(value):
            value = value.strip()
            if not value:
                return
            if choices and value not in choices:
                raise ValueError(f"Choose {' or '.join(choices)}.")
            if key == "energy" and (not value.isdecimal() or not 0 <= int(value) <= 100):
                raise ValueError("Enter a number from 0 to 100.")
            if validate:
                value = validate(value)

            def apply(scope):
                save_setting(scope, key, value)
                self.refresh()
                config = self.config
                if key == "file_manager" and config["ui"]["tree_visible"] != self.tree_visible:
                    self.toggle_files()
                elif key == "terminal" and config["ui"]["terminal_visible"] != self.terminal_visible:
                    self.toggle_terminal()
                elif key == "autosave":
                    for tab in self.tabs:
                        tab.autosave = self.autosave_for(tab.document)
                        self.autosave(tab)
                if not self.message:
                    self.message = f"Saved {key} in {config.yhwh.user / 'rc'}"

            self.pick("Apply settings to", {
                label(self.browser.cwd): partial(apply, self.browser.cwd),
                "Everywhere (/)": partial(apply, Path("/")),
            })

        current = self.config.yhwh.values.get(key, default)
        self.ask(title, select, current, choices=choices)

    def configuration_paths(self):
        shared = "\n".join(f"{prefix}  (etc/profile, rc)" for prefix, _ in self.config.yhwh.locations)
        local = "\n".join(str(path) for path in self.config.paths)
        warnings = "\n".join(self.config.yhwh.warnings)
        self.show("Configuration paths", f"YHWH prefixes\n{shared}\n\nShaddai overlays\n{local}\n\n{warnings}")

    def console_fonts(self):
        if not self.fonts.console:
            self.show("Console fonts", f"Terminal device: {self.fonts.device or 'unavailable'}\n\n"
                      "Set the font in your terminal emulator for /dev/pts devices. "
                      "Run Shaddai from a Linux virtual console such as /dev/tty2 to preview bitmap fonts.")
            return
        candidates = (Path(__file__).resolve().parents[2] / "bin/shaddai-fonts",
                      Path(sys.executable).with_name("shaddai-fonts"))
        helper = next((path for path in candidates if path.is_file()), shutil.which("shaddai-fonts"))
        if not helper:
            raise FileNotFoundError("Install the shaddai-fonts helper with make install.")
        self.fonts.snapshot(self.config["fonts"])
        argv = [str(helper), "--initial", self.config["fonts"]["default"]]
        argv.extend(str(Path(directory).expanduser().absolute()) for directory in self.config["fonts"]["directories"])
        self.tty_command(argv)

    def font_settings(self):
        def choose(name):
            if name:
                self.config.save("fonts", "default", name)
                self.message = f"Preferred console font set to {name}"

        def toggle(setting):
            self.config.save("fonts", setting, not self.config["fonts"][setting])
            self.message = f"{setting} is {'on' if self.config['fonts'][setting] else 'off'}"

        def choose_default():
            fonts = self.fonts.available(self.config["fonts"])
            self.ask("Preferred console font", choose, self.config["fonts"]["default"],
                     choices=sorted({path.name for path in fonts}))

        self.pick("Console fonts", {
            "Browse and preview": self.console_fonts,
            "Preferred console font": choose_default,
            "Toggle applying preferred font on start": partial(toggle, "apply_on_start"),
            "Toggle restoring original font on exit": partial(toggle, "restore_on_exit"),
        })

    def default_directory(self):
        def save(value):
            if value and not (Path.home() / Path(value).expanduser()).is_dir():
                raise ValueError("Choose an existing default directory.")
            save_setting(Path("/"), "default_directory", value)
            self.refresh()
            self.message = "Saved default directory for launcher starts."

        current = Prefixes(Path("/"), global_only=True).values.get("default_directory", "")
        self.ask("Default directory for launcher starts (blank for home)", save, current)

    def panel_key_settings(self):
        def size(value):
            if not value.isdecimal() or not 1 <= int(value) <= 50:
                raise ValueError("Enter a whole number from 1 to 50.")
            return value

        options = {
            "File manager resize step (columns)": partial(self.shared_setting, "panel_resize_columns", "Columns per keypress", "3", validate=size),
            "Terminal resize step (rows)": partial(self.shared_setting, "panel_resize_rows", "Rows per keypress", "1", validate=size),
        }
        for name, (title, default, _, _) in PANEL_KEYS.items():
            options[title] = partial(self.shared_setting, "key_" + name, f"{title} (e.g. Ctrl+Up or off)", default,
                                     validate=partial(self.validate_panel_key, name))
        self.pick("Keys", options)

    def validate_panel_key(self, name, value):
        value = value.lower().replace(" ", "").replace("+", "/") or PANEL_KEYS[name][1]
        if value == "off":
            return value
        *mods, key = value.split("/")
        key = key.removeprefix("arrow") if key in ("arrowup", "arrowdown", "arrowleft", "arrowright") else key
        modifiers = ("ctrl", "alt", "shift")
        if len(set(mods)) != len(mods) or any(mod not in modifiers for mod in mods):
            raise ValueError("Use a terminal key combination such as Ctrl+Up.")
        combo = "/".join([*(mod for mod in modifiers if mod in mods), key])
        stroke = self.prefix_key(combo)
        KeyBindings().add(*stroke)(lambda event: None)  # Validate against supported terminal keys.
        values = self.config.yhwh.values
        if any(other != name and stroke == self.prefix_key(values.get("key_" + other) or default)
               for other, (_, default, _, _) in PANEL_KEYS.items()):
            raise ValueError("That combination is already assigned to a panel shortcut.")
        return combo

    def settings(self):
        def set_theme(theme):
            self.config.save("ui", "theme", theme)
            self.message = f"Theme set to {theme}"

        booleans = ("true", "false")
        self.pick("Settings", {
            "Appearance": lambda: self.pick("Appearance", {
                "Console fonts": self.font_settings,
                "TTY colors": lambda: self.pick("TTY colors", {theme: partial(set_theme, theme) for theme in THEMES}),
                "YHWH mode": partial(self.shared_setting, "theme", "YHWH mode", "yhwh",
                                     ("yhwh", "nietzsche", "dawkins")),
            }),
            "Files and editor": lambda: self.pick("Files and editor", {
                "Default directory": self.default_directory,
                "Show hidden files": partial(self.shared_setting, "show_hidden", "Show hidden files", "false", booleans),
                "Show file manager": partial(self.shared_setting, "file_manager", "Show file manager", "true", booleans),
                "Autosave": partial(self.shared_setting, "autosave", "Autosave", "true", booleans),
                "Editor keys": self.editor_modes,
            }),
            "Keys": self.panel_key_settings,
            "Terminal": lambda: self.shared_setting("terminal", "Show terminal at startup", "false", booleans),
            "Presence": lambda: self.pick("Presence", {
                "Amount of YHWH (0–100)": partial(self.shared_setting, "energy", "Amount of YHWH", "100"),
                "Inbox letters": partial(self.shared_setting, "inbox", "Inbox letters", "true", booleans),
                "Take a walk": partial(self.shared_setting, "narrative", "Take a walk", "false", booleans),
            }),
            "Browse console fonts": self.console_fonts,
            "Configuration paths": self.configuration_paths,
            "Edit YHWH rc": self.edit_rc,
        })

    def editor_modes(self):
        def set_mode(mode):
            self.config.save("editor", "mode", mode)
            get_app().vi_state.reset()
            self.message = f"Editor keys: {mode}"

        self.pick("Editor keys", {mode: partial(set_mode, mode) for mode in EDITOR_MODES})

    def help_worlds(self):
        self.pick("Need Some Help?", {name: partial(self.enter_world, name) for name in ("God", "Man")})

    def enter_world(self, name):
        mount = self.config.library.mount
        if not mount:
            raise FileNotFoundError("YHWH mnt/ is unavailable. Set YHWH_HOME to the directory containing it.")
        if self.browser.change_world(World(name, mount / {"God": "yhwh", "Man": "root"}[name], mount / "we")):
            self.focus("files")
            self.letter("seed")

    def leave_world(self):
        self.browser.change_world(None)
        self.focus("files")

    def books(self, name):
        source, items = self.config.library.books(name)
        unavailable = "Coming soon"
        if self.config.library.etc:
            unavailable = self.services.words.get("booksUnavailable", unavailable)
        options = {label(title): (partial(self.external, url) if url else
                                 partial(self.show, title, unavailable))
                   for title, url in items}
        options["Open library source"] = partial(self.open, source)
        self.pick(f"Books · {name}", options)

    def letter(self, key):
        self.attempt(self.services.delivery, key)
        self.attempt(self.services.walk, key)

    def walk(self):
        seen = self.services.state("walk").get("steps", [])
        rows = [f"[{'x' if key in seen else ' '}] {step}" for key, step in WALK.items()]
        if self.config.yhwh.values.get("narrative") != "true":
            rows.extend(["", "Enable the walk in Settings → Presence."])
        self.show("Take a walk", "\n".join(rows))

    def inbox(self):
        state = self.services.state("inbox")
        letters = state.get("letters", {})
        commands = {"Back to workspace": partial(self.focus, "editor")}
        for key, message in sorted(letters.items(), key=lambda item: item[1]["at"], reverse=True):
            if letter := self.services.letters.get(key):
                marker = "* " if not message["read"] else ""
                commands[marker + letter["title"]] = partial(self.read_letter, key)
        toggle = ("Unblock " if state.get("blocked") else "Block ") + SENDER

        def block():
            self.services.block(not state.get("blocked"))
            self.inbox()

        commands[toggle] = block
        self.pick("Inbox" if letters else "Inbox · no letters yet", commands)

    def read_letter(self, key):
        letter = self.services.letters[key]
        text = self.services.letter(key)
        if not (letter.get("note") or letter.get("verse")):
            self.show(letter["title"], text, back=self.inbox)
            return
        copy = self.config.library.json("default/text-verses.json")
        verses = self.services.cited_verses(letter.get("verse", ""))
        sources_open = True
        open_commentary = set()

        def toggle_sources():
            nonlocal sources_open
            sources_open = not sources_open

        def toggle_commentary(verse_id):
            open_commentary.symmetric_difference_update({verse_id})

        def render(cursor_row=0):
            lines = text.split("\n") + [""]
            actions = {}

            def disclosure(title, expanded, toggle):
                row = len(lines)
                lines.append(f"{'v' if expanded else '>'} {title}")

                def activate():
                    toggle()
                    render(row)

                actions[row] = activate

            disclosure(copy["mail-sources"], sources_open, toggle_sources)
            if sources_open:
                lines.extend(["", letter.get("note", "")])
                for verse in verses:
                    verse_id = verse["id"]
                    expanded = verse_id in open_commentary
                    lines.extend(["", verse["english"], "", verse["original"], ""])
                    citation = copy["commentary-citation"].replace("{{0}}", verse["reference"])
                    disclosure(citation, expanded, partial(toggle_commentary, verse_id))
                    if expanded:
                        lines.extend(["", self.services.commentary(verse) or copy["no-commentary"]])
            self.show(letter["title"], "\n".join(lines), back=self.inbox, actions=actions)
            self.reader.buffer.cursor_position = self.reader.document.translate_row_col_to_index(cursor_row, 0)

        render()

    def fan_mail(self):
        rows = self.config.library.json("default/fan-mail.json")
        self.pick("Fan mail", {
            row["author"]: partial(self.show, row["author"], f'{row["work"]}\n\n{row["quote"]}',
                                   {"Source": row["url"]}, back=self.fan_mail)
            for row in rows
        })

    def piece_offering(self):
        def draft(filename):
            path = self.browser.physical(Path(os.path.abspath(self.browser.cwd / Path(filename).expanduser())))
            if not path.is_file():
                raise FileNotFoundError(path)
            subject = "Piece offering"
            body = f"I'd like to share {path.name} as a piece offering. I'll attach it before sending."
            url = f"mailto:{SENDER}?" + urlencode({"subject": subject, "body": body})
            self.show("Email draft", f"To: {SENDER}\nSubject: {subject}\n\n{body}\n\nFile to attach: {path}",
                      {"Open draft in mail client": url})

        selected = self.browser.selected
        self.ask("File to offer", draft, str(selected) if selected else "")

    def authored(self, title, *keys):
        words = self.services.words
        self.show(title, "\n\n".join(self.services.address(words[key], 2) for key in keys))

    def about(self):
        body = self.services.address(self.services.words["aboutBody"], 2)
        notes = self.services.current_level().get("about", [])
        self.show("About YHWH", "\n\n".join([body, *notes]))

    def levels(self):
        current = self.services.current_level()
        options = self.services.level_options()
        commands = {
            level["label"] + (f" · {level['edition']}" if level.get("edition") else ""):
                partial(self.choose_level, level) for level in options
        }
        target = next((level for level in self.services.levels["levels"] if level not in options), None)
        if target:
            commands[f"{target.get('glyph', target['label'])} · {target['offer']['title']}"] = partial(self.upgrade, target)
        if "offer" in options[-1]:
            commands["Unsteal Upgrade"] = partial(self.unsteal_upgrade, options[-1])
        self.pick(f"YHWH-ness · {current['label']}", commands)

    def choose_level(self, level, *, unlock=False):
        self.services.select_level(level, unlock=unlock)
        self.show_level(level)

    def unsteal_upgrade(self, level):
        self.services.unsteal_upgrade(level)
        self.show_level(self.services.current_level())

    def show_level(self, level):
        title = f"YHWH level {level['label']}"
        lines = [level.get("welcome"), *level.get("lines", [])]
        poems = [level.get("welcomePoem"), level.get("poem")]
        asides = level.get("asides", [])
        if asides:
            position = self.level_aside_positions.get(level["id"])
            if position is None:
                position = choice(range(len(asides)))
            lines.append(asides[position])
            self.level_aside_positions[level["id"]] = (position + 1) % len(asides)
        if level["id"] == "yhwh":
            words = self.services.words
            title = words["welcomeTitle"]
            lines.insert(1, words["welcomeBody"])
        if level.get("names"):
            lines.insert(1, self.services.address("Hey Abe, take a look around."))
        links = {"Nietzsche Family Circus": "https://www.nietzschefamilycircus.com/"} if level["id"] == "nietzsche" else None
        self.show(title, "\n\n".join(filter(None, [*lines, *poems])), links, wrap=not any(poems))

    def upgrade(self, target):
        guide = self.services.levels["stripe"]
        offer = target["offer"]
        self.show(offer["title"], "\n".join([*offer["lines"], "", guide["status"]]))
        self.pick(offer["title"], {
            "Steal Upgrade": partial(self.choose_level, target, unlock=True),
            guide["title"]: lambda: self.show(guide["title"], "\n\n".join(guide["steps"]), guide["links"],
                                              back=partial(self.upgrade, target)),
        })

    def offerings(self):
        self.pick("Offerings", {
            "About offerings": partial(self.authored, "Offerings", "offeringsBody", "pieceBody", "burntBody"),
            "Piece offering · compose email": self.piece_offering,
            "Seed funding": self.seed_funding,
        })

    def seed_funding(self):
        url = self.config.yhwh.values.get("stripe_payment_link", "")
        words = self.services.words
        links = {"Open payment page": url} if url.startswith("https://buy.stripe.com/") else {}
        self.show(words["seedTitle"], "\n\n".join(self.services.address(words[key], 1) for key in ("seedBody", "seedQuote", "seedAttribution")), links)

    def verses(self):
        books = self.services.verses
        def chapter(name):
            self.pick(name, {f"Chapter {number}": partial(self.verse_list, name, number) for number in books[name]})

        def random_verse():
            chapters = choice(list(books.values()))
            self.read_verse(choice(choice(list(chapters.values()))))

        options = {name: partial(chapter, name) for name in books}
        options["Random verse"] = random_verse
        self.pick("We The Nameless", options)

    def verse_list(self, book, number):
        self.pick(f"{book} {number}", {verse["reference"]: partial(self.read_verse, verse)
                                      for verse in self.services.verses[book][number]})

    def read_verse(self, verse):
        self.show(verse["reference"], "\n\n".join((verse["english"], verse["original"], self.services.commentary(verse))),
                  back=partial(self.verse_list, verse["book"], verse["chapter"]))

    def conversation(self):
        directory = self.browser.physical(self.browser.cwd)
        state = self.services.conversation(directory)
        text = "\n\n".join(f'## {item["role"].capitalize()}\n{item["content"]}'
                            for item in state.get("messages", []))
        self.pick("Conversation · Codex", {
            "Read conversation": partial(self.show, "Conversation", text or "No messages yet."),
            "Write to YHWH": lambda: self.ask("Message", partial(self.send_chat, directory), state.get("draft", "")),
        })

    def send_chat(self, directory, draft):
        if not draft.strip():
            return
        if directory in self.chat_pending:
            raise ValueError("A reply is pending for this directory.")
        if len(draft) > 30000:
            raise ValueError("Keep messages under 30,000 characters.")
        self.services.store_conversation(directory, draft=draft)
        state = self.services.conversation(directory)
        settings = self.config["agent"].copy()
        env = self.config.yhwh.environment.copy()
        energy = self.services.current_level().get("energy", self.services.energy(self.config.yhwh.values))
        self.chat_pending.add(directory)
        self.message = "Waiting for Codex. You can keep working."

        async def reply():
            try:
                messages = await self.services.chat(directory, draft, state.get("messages", []), settings, env, energy)
                self.services.record_reply(directory, draft, messages[-2:])
                self.message = "Reply received. Open Conversation to read it."
            except (OSError, ValueError, TimeoutError) as error:
                self.message = (str(error) or "Conversation timed out") + ". Draft kept."
            finally:
                self.chat_pending.discard(directory)
                get_app().invalidate()

        get_app().create_background_task(reply())

    def workflow(self, name):
        if not self.config.library.command:
            raise FileNotFoundError("Install the yhwh command or set YHWH_COMMAND.")
        self.tty_command([self.config.library.command, name], pause=True)

    def command_line(self):
        def run(line):
            command, _, argument = line.strip().partition(" ")
            if command == "cd":
                self.browser.navigate(self.browser.cwd / Path(argument or "~").expanduser())
            elif command == "open" and argument:
                self.open(self.browser.cwd / Path(argument).expanduser())
            elif command == "mkdir" and argument:
                self.browser.write_path(Path(os.path.abspath(self.browser.cwd / argument))).mkdir()
                self.browser.refresh()
            elif command == "nu":
                if argument:
                    self.tty_command(self.universe_command("nu", *shlex.split(argument)), finished=self.browser.refresh)
                else:
                    self.new_universe()
            elif command == "go":
                if argument:
                    self.tty_command(self.universe_command("go", "--sudo", *shlex.split(argument)))
                else:
                    self.chroot_universe()
            elif command == "set" and "=" in argument:
                key, value = argument.split("=", 1)
                save_setting(self.browser.cwd, key.strip(), value.strip())
                self.refresh()
            elif command.startswith("!"):
                self.tty_command([os.environ.get("SHELL") or "/bin/sh", "-c", line.lstrip()[1:]], pause=True)
            elif command:
                raise ValueError("Use :cd, :open, :mkdir, :nu, :go, :set key=value, or :! command. Ctrl+P lists actions.")

        self.ask(":", run)

    def prefix_command(self, binding):
        aliases = {
            "help": lambda: self.palette("Help and shortcuts"),
            "palette": self.palette, "settings": self.settings, "refresh": self.refresh,
            "save": self.save, "save-as": partial(self.save, as_new=True), "view-mode": self.preview,
            "new-tab": self.new_tab, "close-tab": self.close_document, "reopen-tab": self.reopen_tab,
            "open-file": self.quick_open,
            "new-file": self.new_document, "open-directory": self.browser.location,
            "focus-editor": partial(self.focus, "editor"), "focus-files": partial(self.focus, "files"),
            "focus-terminal": partial(self.focus, "terminal"), "toggle-terminal": self.toggle_terminal,
            "expand-files": partial(self.maximize, "files"), "expand-terminal": partial(self.maximize, "terminal"),
            "toggle-files": self.toggle_files, "toggle-hidden": self.browser.toggle_hidden,
            "location": self.clear_terminal, "parent": lambda: self.browser.navigate(self.browser.cwd.parent),
            "back": partial(self.browser.step_history, -1), "forward": partial(self.browser.step_history, 1),
            "previous-tab": lambda: self.switch_tab(self.tab_index - 1),
            "next-tab": lambda: self.switch_tab(self.tab_index + 1),
            "files-rename": self.browser.rename, "files-trash": self.browser.trash,
            "files-copy": partial(self.browser.copy, cut=False), "files-cut": partial(self.browser.copy, cut=True),
            "files-paste": self.browser.paste, "hotkeys": self.list_key_files,
        }
        return aliases.get(binding.command)

    def list_key_files(self):
        keys = self.config.yhwh.keys()
        lines = [f"{binding.name}\t{binding.kind}\t{binding.command}\t{binding.path}"
                 for _, binding in sorted(keys.items())]
        self.show("YHWH keyboard files", "\n".join(lines) or "No prefix key files found.")

    def run_key_file(self, binding):
        selected = self.browser.selected
        context = [("cwd", self.browser.cwd), ("file", self.tab.document.path or "")]
        if selected:
            context.append(("selected", self.browser.physical(selected)))
        data = ("\n".join(f"{key}\t{val}" for key, val in context) + "\n").encode(errors="surrogateescape")
        env = {**self.config.yhwh.environment, "YHWH_KEY": binding.name, "YHWH_PREFIX": str(binding.prefix),
               "YHWH_TAB": self.tab.identifier, "YHWH_INTERFACE": "tty", "YHWH_TTY_SOCKET": self.open_socket,
               **{f"YHWH_{key.upper()}": str(value) for key, value in context}}
        cwd = self.browser.physical(self.browser.cwd)

        async def run():
            child = None
            try:
                child = await asyncio.create_subprocess_exec(binding.path, cwd=cwd, env=env,
                             stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
                out, errors = await asyncio.wait_for(child.communicate(data), 30)
                text = (errors if child.returncode else out).decode(errors="replace").strip()
                if child.returncode:
                    self.message = f"{binding.name} exited {child.returncode}. {text[:500]}"
                elif text:
                    self.show(binding.name, text)
            except (OSError, TimeoutError) as error:
                self.message = str(error) or f"{binding.name} timed out"
            finally:
                if child and child.returncode is None:
                    child.kill()
                    await child.wait()
                get_app().invalidate()

        get_app().create_background_task(run())

    @staticmethod
    def prefix_key(name):
        if name in MODIFIED_KEYS:
            return (MODIFIED_KEYS[name][0],)
        if name in ("ctrl/backtick", "ctrl/shift/backtick"):
            return ("escape", "c-@")
        *modifiers, key = name.split("/")
        if name == "off" or "meta" in modifiers:
            return ()
        if "ctrl" in modifiers and "shift" in modifiers and key in ("left", "right", "up", "down", "pageup", "pagedown"):
            return ("escape", "c-s-" + key) if "alt" in modifiers else ("c-s-" + key,)
        key = {"backtick": "`", "comma": ",", "slash": "/", "plus": "+", "period": ".",
               "backslash": "\\", "space": " "}.get(key, key)
        if "ctrl" in modifiers:
            key = "c-" + key
        if "shift" in modifiers:
            key = key.upper() if len(key) == 1 and key.isalpha() else "s-" + key
        return ("escape", key) if "alt" in modifiers else (key,)

    def workspace_commands(self):
        return [
            ("quick_open", "Quick open file", self.quick_open, False),
            ("new", "New document", self.new_document, False),
            (None, "New app tab", self.new_tab, True),
            (None, "Reopen closed tab", self.reopen_tab, True),
            ("save", "Save document", self.save, False),
            ("save_as", "Save document as", lambda: self.save(as_new=True), False),
            ("close", "Close document tab", self.close_document, False),
            ("find", "Find in document", self.find, False),
            (None, "Editor keys (Vim, Emacs, Nano)", self.editor_modes, False),
            ("undo", "Undo", lambda: self.tab.editor.buffer.undo(), False),
            ("redo", "Redo", lambda: self.tab.editor.buffer.redo(), False),
            ("toggle_tree", "Toggle files", self.toggle_files, True),
            ("toggle_terminal", "Toggle terminal", self.toggle_terminal, True),
            ("maximize", "Maximize or restore focused pane", self.maximize, True),
            ("cycle_maximize", "Cycle maximized panes", self.cycle_maximize, True),
            ("maximize_files", "Maximize or restore files", lambda: self.maximize("files"), False),
            ("focus_files", "Focus files", lambda: self.focus("files"), True),
            ("focus_editor", "Focus document", lambda: self.focus("editor"), True),
            ("focus_terminal", "Focus terminal", lambda: self.focus("terminal"), True),
            ("focus_next", "Focus next pane", self.focus_next, True),
            ("new_shell", "New shell tab", self.new_shell, True),
            ("close_shell", "Close shell tab", self.close_shell, True),
            ("previous_tab", "Previous tab", lambda: self.step_tab(-1), True),
            ("next_tab", "Next tab", lambda: self.step_tab(1), True),
            ("app_next", "Next document tab", lambda: self.switch_tab(self.tab_index + 1), True),
            ("app_previous", "Previous document tab", lambda: self.switch_tab(self.tab_index - 1), True),
            ("clear_terminal", "Clear visible terminal or enter location", self.clear_terminal, True),
            ("location", "Go to path", self.browser.location, False),
            ("reload", "Refresh files and configuration", self.refresh, True),
            ("new_file", "Create file", lambda: self.browser.create(directory=False), False),
            ("new_directory", "Create folder", lambda: self.browser.create(directory=True), False),
            (None, "Nu · Make new universe", self.new_universe, False),
            (None, "Cd · Enter universe", self.enter_universe, False),
            (None, "Go · Chroot universe", self.chroot_universe, False),
            ("rename", "Rename selected file", self.browser.rename, False),
            ("trash", "Move selected file to Trash", self.browser.trash, False),
            ("toggle_hidden", "Toggle hidden files", self.browser.toggle_hidden, False),
            ("settings", "Settings", self.settings, True),
            ("preview", "Toggle source / reading", self.preview, False),
            ("follow_link", "Follow link", self.follow_link, False),
            ("inbox", "Inbox · letters from YHWH", self.inbox, True),
            (None, "Need Some Help? · God / Man", self.help_worlds, True),
            (None, "Leave world", self.leave_world, True),
            (None, "Books · Sinai", partial(self.books, "Sinai"), True),
            (None, "Books · Horeb", partial(self.books, "Horeb"), True),
            (None, "Fan mail", self.fan_mail, True),
            (None, "Offerings", self.offerings, True),
            (None, "YHWH-ness · levels and upgrades", self.levels, True),
            (None, "Take a walk", self.walk, True),
            (None, "Piece offering · compose email", self.piece_offering, True),
            (None, "Seed funding", self.seed_funding, True),
            (None, "Conversation · Codex", self.conversation, True),
            (None, "Browse We The Nameless", self.verses, True),
            (None, "About YHWH", self.about, True),
            (None, "Our team", partial(self.authored, "Our team", "teamBody"), True),
            (None, "Roadmap", partial(self.authored, "Roadmap", "roadmapBody"), True),
            (None, "Edit character copy", lambda: self.open(self.config.library.data("default/words.json")), True),
            (None, "Open current file externally", lambda: self.external(self.tab.document.path or
                     self.browser.physical(self.browser.selected or self.browser.cwd)), True),
            (None, "Edit YHWH rc", self.edit_rc, True),
            (None, "YHWH keyboard files", self.list_key_files, True),
            (None, "Reload document from disk", self.reload_document, False),
            *[(None, f"Workflow · yhwh {name}", partial(self.workflow, name), True)
              for name in ("begin", "review", "run", "add", "commit")],
        ]

    def find(self):
        self.focus("editor")
        start_search(self.tab.editor.control)

    def workspace_keys(self):
        keys = KeyBindings()
        answering = Condition(lambda: self.answer_action is not None)
        terminal = Condition(lambda: self.layout.current_control is self.terminal)
        reading = Condition(lambda: self.reading and self.layout.current_control is self.reader.control)
        editing = Condition(lambda: self.layout.current_control is self.tab.editor.control)
        emacs = editing & Condition(lambda: self.config.preferred_editor == "emacs")
        nano = editing & Condition(lambda: self.config.preferred_editor == "nano")
        vim = editing & Condition(lambda: self.config.preferred_editor == "vim")

        @keys.add("escape", filter=answering, eager=True)
        def cancel(event):
            self.finish_answer()

        @keys.add("escape", filter=~answering & reading)
        @keys.add("q", filter=~answering & reading)
        def close_reader(event):
            self.close_reader()

        @keys.add("enter", filter=~answering & reading & Condition(
            lambda: self.reader.document.cursor_position_row in self.reader_actions))
        def toggle_disclosure(event):
            self.attempt(self.reader_actions[self.reader.document.cursor_position_row])

        @keys.add("escape", filter=~answering & ~terminal & ~reading & ~vim & Condition(lambda: self.zoom is not None))
        def restore(event):
            self.zoom = None

        def scroll(event):
            if self.shell:
                self.shell.scroll(event.key_sequence[-1].key == Keys.ShiftPageUp)

        def send(event):
            self.quoted = False
            if self.shell:
                if self.shell.exited and event.key_sequence[-1].key == Keys.ControlM:
                    self.close_shell()
                    self.new_shell()
                else:
                    self.shell.send_keys(event.key_sequence)

        # Explicit key bindings also beat Prompt Toolkit's built-in editing bindings.
        skip = {Keys.Any, Keys.Vt100MouseEvent, Keys.WindowsMouseEvent, Keys.CPRResponse,
                Keys.Ignore, Keys.ScrollUp, Keys.ScrollDown}
        single_keys = [Keys.Any, *(key for key in Keys if key not in skip)]
        for key in single_keys:
            keys.add(key, filter=terminal)(send)
        keys.add("escape", Keys.Any, filter=terminal)(send)
        keys.add("s-pageup", filter=terminal & ~Condition(lambda: self.quoted))(scroll)
        keys.add("s-pagedown", filter=terminal & ~Condition(lambda: self.quoted))(scroll)
        keys.add(Keys.Any, filter=terminal & Condition(lambda: self.quoted), eager=True)(send)
        for key in single_keys[1:]:
            keys.add(key, filter=terminal & Condition(lambda: self.quoted), eager=True)(send)

        def bind(action, handler, available_in_shell=False):
            active = ~answering & ~Condition(lambda: self.quoted)
            if not available_in_shell:
                active &= ~terminal
            for key in self.config["keys"][action]:
                if key in {"c-b", "c-d", "c-f", "c-n", "c-p", "c-w", "c-y", "c-o", "c-r"}:
                    key_active = active & ~emacs
                else:
                    key_active = active
                if key == "c-r":
                    key_active &= ~vim
                keys.add(*({"c-tab": "f20", "s-c-tab": "f21"}.get(part, part) for part in key.split()),
                         filter=key_active)(handler)

        for action, _, run, in_shell in self.commands:
            if action:
                bind(action, lambda event, run=run: self.attempt(run), in_shell)
        for direction in ("left", "down", "up", "right"):
            bind(f"focus_{direction}", lambda event, direction=direction: self.direction(direction), True)
            bind(f"resize_{direction}", lambda event, direction=direction: self.resize(direction), True)
        bind("help", lambda event: self.palette("Help and shortcuts"), True)
        bind("palette", lambda event: self.palette(), False)
        bind("shell_palette", lambda event: self.palette(), True)
        bind("terminal_quote", lambda event: setattr(self, "quoted", self.pane == "terminal"), True)
        for key, step in (("font_smaller", -1), ("font_larger", 1)):
            bind(key, lambda event, step=step: self.attempt(self.fonts.step, step, self.config["fonts"]), True)
        def quit_app(event):
            self.flush_edits()
            self.confirm_discard(self.tabs, event.app.exit)

        bind("quit", quit_app, True)
        prefix_keys = self.config.yhwh.keys()
        for name, binding in prefix_keys.items():
            if binding.kind == "module":
                continue
            handler = self.prefix_command(binding) if binding.kind == "command" else None
            if binding.kind == "exec":
                handler = partial(self.run_key_file, binding)
            elif binding.kind == "disabled":
                handler = lambda: None
            if handler and (stroke := self.prefix_key(name)):
                active = ~answering & ~Condition(lambda: self.quoted)
                if binding.when:
                    active &= Condition(lambda pane=binding.when: self.pane == pane)
                try:
                    if stroke in {("c-b",), ("c-d",), ("c-f",), ("c-n",), ("c-p",), ("c-w",), ("c-y",), ("c-o",), ("c-r",)}:
                        active &= ~emacs
                    if stroke == ("c-r",):
                        active &= ~vim
                    keys.add(*stroke, filter=active)(lambda event, handler=handler: self.attempt(handler))
                except ValueError:
                    continue  # The outer terminal has no prompt-toolkit key for this chord.
        for name, (_, default, direction, incremental) in PANEL_KEYS.items():
            value = self.config.yhwh.values.get("key_" + name)
            combo = value or default
            if not value and combo in prefix_keys:
                continue
            if stroke := self.prefix_key(combo):
                def move(event, direction=direction, incremental=incremental):
                    self.move_split(direction, incremental)

                try:
                    keys.add(*stroke, filter=~answering & ~Condition(lambda: self.quoted))(move)
                except ValueError:
                    continue
        def cut_line(event):
            buffer = self.tab.editor.buffer
            document = buffer.document
            buffer.cursor_position += document.get_start_of_line_position()
            count = len(document.current_line) + int(document.cursor_position_row < document.line_count - 1)
            if count:
                data = buffer.delete(count=count)
                if event.is_repeat:
                    data = event.app.clipboard.get_data().text + data
                event.app.clipboard.set_data(ClipboardData(data))

        nano_actions = {
            ("c-o",): self.save, ("c-x",): self.close_document, ("c-w",): self.find,
            ("c-g",): lambda: self.show("Nano keys", "Ctrl+O Write Out   Ctrl+W Where Is   Ctrl+X Close\n"
                                      "Ctrl+K Cut line   Ctrl+U Paste   Alt+U Undo   Alt+E Redo"),
            ("escape", "u"): lambda: self.tab.editor.buffer.undo(),
            ("escape", "e"): lambda: self.tab.editor.buffer.redo(),
        }
        for stroke, handler in nano_actions.items():
            keys.add(*stroke, filter=nano)(lambda event, handler=handler: self.attempt(handler))
        keys.add("c-k", filter=nano)(cut_line)

        @keys.add("c-u", filter=nano)
        def paste(event):
            self.tab.editor.buffer.insert_text(event.app.clipboard.get_data().text)

        @keys.add("c-x", "c-s", filter=emacs)
        def emacs_save(event):
            self.attempt(self.save)

        @keys.add(":", filter=vim & Condition(lambda: get_app().vi_state.input_mode == InputMode.NAVIGATION))
        def vim_command(event):
            def execute(command):
                action = {"w": self.save, "q": self.close_document,
                          "wq": lambda: self.save(after=self.close_document)}.get(command.strip())
                if action:
                    self.attempt(action)
                else:
                    self.message = "Vim commands: w, q, wq. Use F1 for all workspace actions."

            self.ask("Vim", execute)

        return keys
