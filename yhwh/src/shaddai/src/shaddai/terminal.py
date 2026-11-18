"""A shell owns a PTY and a terminal screen, even when its pane is hidden."""

import asyncio
import errno
from functools import lru_cache
from itertools import groupby
import os
import pty
import signal
from tempfile import TemporaryDirectory
from pathlib import Path
import termios

import pyte
from pyte import modes
from prompt_toolkit.data_structures import Point
from prompt_toolkit.keys import Keys
from prompt_toolkit.layout.controls import UIContent, UIControl
from prompt_toolkit.mouse_events import MouseEventType


class TerminalScreen:
    """Route escape sequences to the normal or alternate screen."""

    def __init__(self, columns, rows, history, reply):
        self.normal = pyte.HistoryScreen(columns, rows, history=history)
        self.alternate = pyte.Screen(columns, rows)
        self.screen = self.normal
        self.normal.write_process_input = self.alternate.write_process_input = reply

    def __getattr__(self, event):
        # pyte binds stream events once, so look up the active screen at dispatch.
        if event not in pyte.Stream.events:
            raise AttributeError(event)
        return lambda *args, **kwargs: getattr(self.screen, event)(*args, **kwargs)

    def set_mode(self, *modes, private=False):
        if private and any(mode in modes for mode in (47, 1047, 1049)):
            if self.screen is self.normal:
                self.alternate.reset()
                self.screen = self.alternate
        self.screen.set_mode(*modes, private=private)

    def reset_mode(self, *modes, private=False):
        if private and any(mode in modes for mode in (47, 1047, 1049)):
            self.screen = self.normal
        self.screen.reset_mode(*modes, private=private)

    def reset(self):
        self.screen = self.normal
        self.normal.reset()
        self.alternate.reset()

    def report_device_status(self, mode, *, private=False):
        if not private:
            self.screen.report_device_status(mode)
        elif mode == 6:
            # tmux uses DEC's private cursor-position request during startup.
            screen = self.screen
            row = screen.cursor.y + 1
            if modes.DECOM in screen.mode and screen.margins:
                row -= screen.margins.top
            column = min(screen.cursor.x + 1, screen.columns)
            screen.write_process_input(f"\x1b[?{row};{column}R")


class TerminalStream(pyte.ByteStream):
    # pyte drops the '>' intermediate byte and treats secondary DA as primary.
    # A second primary response can reach the shell after tmux finishes probing.
    secondary_attributes = (b"\x1b[>c", b"\x1b[>0c")
    incomplete = (b"\x1b[>0", b"\x1b[>", b"\x1b[", b"\x1b")

    def __init__(self, screen):
        super().__init__(screen)
        self.tail = b""

    def feed(self, data):
        data = self.tail + data
        self.tail = next((prefix for prefix in self.incomplete if data.endswith(prefix)), b"")
        if self.tail:
            data = data[:-len(self.tail)]
        for request in self.secondary_attributes:
            data = data.replace(request, b"")
        super().feed(data)


class Shell:
    def __init__(self, number, command, directory, history, *, environment=None, interactive=()):
        self.number, self.command, self.directory, self.history = number, command, directory, history
        self.environment = environment if environment is not None else os.environ
        self.argv = [command, "-i"]
        self.startup = None
        if interactive and os.path.basename(command) == "bash":
            self.startup = TemporaryDirectory(prefix="shaddai-shell-")
            rcfile = Path(self.startup.name) / "bashrc"
            rcfile.write_text('[[ ! -r "$HOME/.bashrc" ]] || . "$HOME/.bashrc"\n' + "\n".join(interactive) + "\n")
            self.argv[1:1] = ["--rcfile", str(rcfile)]
        self.loop = self.invalidate = self.terminal = self.stream = None
        self.fd = self.pid = None
        self.size = None
        self.exited = False
        self.pending = bytearray()
        self.error = ""
        self.scroll_offset = 0

    @property
    def screen(self):
        return self.terminal.screen if self.terminal else None

    def fit(self, columns, rows, invalidate):
        if columns < 2 or rows < 1 or self.exited:
            return
        size = rows, columns
        if self.fd is None:
            self.start(size, invalidate)
        elif self.size != size:
            for screen in (self.terminal.normal, self.terminal.alternate):
                self.resize_screen(screen, columns, rows)
            try:
                termios.tcsetwinsize(self.fd, size)
            except OSError as error:
                if error.errno not in (errno.EIO, errno.ENOTTY):
                    raise
            self.size = size
            invalidate()

    def resize_screen(self, screen, columns, rows):
        if rows < screen.lines:
            # Trim blank space below the cursor before moving visible rows into scrollback.
            drop = max(0, screen.cursor.y - rows + 1)
            if screen is self.terminal.normal:
                screen.history.top.extend(screen.buffer[y] for y in range(drop))
            for y in range(rows):
                screen.buffer[y] = screen.buffer[y + drop]
            for y in range(rows, screen.lines):
                screen.buffer.pop(y, None)
            screen.cursor.y -= drop
            screen.lines = rows
            screen.set_margins()
        if columns < screen.columns:
            screen.cursor.x = min(screen.cursor.x, columns - 1)
        screen.resize(lines=rows, columns=columns)

    def start(self, size, invalidate):
        self.size = size
        self.loop, self.invalidate = asyncio.get_running_loop(), invalidate
        rows, columns = size
        self.terminal = TerminalScreen(columns, rows, self.history, self.write)
        self.stream = TerminalStream(self.terminal)
        try:
            pid, fd = pty.fork()
        except OSError as error:
            self.error, self.exited = str(error), True
            invalidate()
            return
        if pid == 0:
            try:
                termios.tcsetwinsize(0, size)
                os.chdir(self.directory)
                environment = {**self.environment, "TERM": "xterm-256color", "YHWH_INTERFACE": "tty"}
                environment.pop("LINES", None)
                environment.pop("COLUMNS", None)
                os.execvpe(self.command, self.argv, environment)
            except OSError as error:
                os.write(2, f"{error}\r\n".encode(errors="replace"))
            finally:
                os._exit(127)
        self.pid, self.fd = pid, fd
        os.set_blocking(fd, False)
        self.loop.add_reader(fd, self.read)
        invalidate()

    def read(self):
        try:
            data = os.read(self.fd, 65536)
        except BlockingIOError:
            return
        except OSError:
            data = b""
        if data:
            lines = len(self.terminal.normal.history.top)
            self.stream.feed(data)
            if self.scroll_offset:
                updated = len(self.terminal.normal.history.top)
                self.scroll_offset = min(updated, self.scroll_offset + max(0, updated - lines))
        else:
            self.disconnect()
        self.invalidate()

    def disconnect(self):
        if self.fd is not None:
            if not self.loop.is_closed():
                self.loop.remove_reader(self.fd)
                self.loop.remove_writer(self.fd)
            os.close(self.fd)
            self.fd = None
        self.pending.clear()
        self.exited = True
        self.reap()

    def reap(self):
        if self.pid is not None:
            if os.waitpid(self.pid, os.WNOHANG)[0]:
                self.pid = None
            elif not self.loop.is_closed():
                self.loop.call_later(0.1, self.reap)

    def close(self):
        if self.pid is not None:
            try:
                os.killpg(self.pid, signal.SIGHUP)
            except ProcessLookupError:
                pass
        self.disconnect()
        if self.startup:
            self.startup.cleanup()

    def write(self, data):
        if self.fd is not None:
            self.pending.extend(data.encode())
            self.flush()

    def flush(self):
        try:
            del self.pending[:os.write(self.fd, self.pending)]
        except BlockingIOError:
            self.loop.add_writer(self.fd, self.flush)
        except OSError:
            # The reader handles EOF after draining the remaining output.
            self.pending.clear()
        if not self.pending:
            self.loop.remove_writer(self.fd)

    def send_keys(self, sequence):
        if self.fd is None:
            return
        screen = self.screen
        self.scroll_offset = 0
        for key in sequence:
            data = key.data
            if key.key == Keys.BracketedPaste:
                if 2004 << 5 in screen.mode:
                    data = "\x1b[200~" + data + "\x1b[201~"
            elif 1 << 5 in screen.mode and data in ("\x1b[A", "\x1b[B", "\x1b[C", "\x1b[D", "\x1b[H", "\x1b[F"):
                data = "\x1bO" + data[-1]
            self.write(data)

    def scroll(self, up):
        if self.screen is not None and self.screen is self.terminal.normal:
            page = max(1, self.screen.lines // 2)
            self.scroll_offset = min(len(self.screen.history.top),
                                     max(0, self.scroll_offset + (page if up else -page)))


@lru_cache(maxsize=1024)
def cell_style(fg, bg, bold, italic, underline, strike, reverse, blink):
    colors = {"brown": "yellow", "white": "gray", "brightbrown": "brightyellow", "brightwhite": "white"}
    style = []
    for channel, color in (("fg", fg), ("bg", bg)):
        if color != "default":
            name = colors.get(color, color)
            rgb = len(name) == 6 and all(c in "0123456789abcdef" for c in name)
            style.append(f"{channel}:#{name}" if rgb else f"{channel}:ansi{name}")
    style.extend(attribute for attribute, flag in zip(
        ("bold", "italic", "underline", "strike", "reverse", "blink"),
        (bold, italic, underline, strike, reverse, blink),
    ) if flag)
    return " ".join(style)


class TerminalControl(UIControl):
    def __init__(self, shell, focus, focused):
        self.shell, self.focus, self.focused = shell, focus, focused
        self.size = None

    def is_focusable(self):
        return True

    def create_content(self, width, height):
        self.size = width, height
        shell = self.shell()
        screen = shell.screen if shell else None
        if screen is None:
            message = shell.error if shell and shell.error else "Starting shell…"
            return UIContent(lambda _: [("class:muted", f" {message}")], line_count=1, show_cursor=False)

        offset = shell.scroll_offset if screen is shell.terminal.normal else 0

        def line(y):
            y -= offset
            row = screen.history.top[y] if y < 0 else screen.buffer[y]
            cells = (row[x] for x in range(min(width, screen.columns)))
            return [(style, "".join(cell.data for cell in group))
                    for style, group in groupby(cells, lambda cell: cell_style(*cell[1:]))]

        cursor = screen.cursor
        x = min(cursor.x, screen.columns - 1)
        column = sum(len(screen.buffer[cursor.y][i].data) for i in range(x))
        return UIContent(line, line_count=min(screen.lines, height),
                         cursor_position=Point(column, min(cursor.y, max(0, height - 1))),
                         show_cursor=self.focused() and not (cursor.hidden or shell.exited or offset))

    def mouse_handler(self, event):
        if event.event_type == MouseEventType.MOUSE_UP:
            self.focus()
        elif event.event_type in (MouseEventType.SCROLL_UP, MouseEventType.SCROLL_DOWN):
            if shell := self.shell():
                shell.scroll(event.event_type == MouseEventType.SCROLL_UP)
        else:
            return NotImplemented
