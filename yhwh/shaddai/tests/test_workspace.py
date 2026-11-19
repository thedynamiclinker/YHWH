import errno
import os
from pathlib import Path
import pty
import select
import signal
import sys
from tempfile import TemporaryDirectory
import termios
from time import monotonic
import unittest

import pyte

from shaddai.terminal import TerminalScreen, TerminalStream


LAUNCHER = Path(__file__).resolve().parents[1] / "bin" / "shaddai"
F6 = b"\x1b[17~"
F10 = b"\x1b[21~"
TERMINAL = b"\x02"


class WorkspaceTTY:
    def __init__(self, root, terminal_type="xterm-256color", *, env=None, launch=LAUNCHER, args=None):
        self.output = bytearray()
        self.pid, self.fd = pty.fork()
        if self.pid == 0:
            termios.tcsetwinsize(0, (30, 110))
            os.chdir(root)
            os.execve(launch, [launch, *(args if args is not None else [root])], {
                **os.environ,
                "ENV": "/dev/null",
                "EDITOR": "",
                "PROMPT_TOOLKIT_NO_CPR": "1",
                "SHELL": "/bin/sh",
                "SHADDAI_PYTHON": sys.executable,
                "SHADDAI_SYSTEM_PREFIX": str(root),
                "TERM": terminal_type,
                "XDG_CONFIG_HOME": str(root),
                "YHWH_SYSTEM_CONFIG": str(root / "system"),
                "YHWH_CONFIG_HOME": str(root / "yhwh"),
                **(env or {}),
            })
        self.resize(30, 110)

    def resize(self, rows, columns):
        self.screen = pyte.Screen(columns, rows)
        self.stream = pyte.ByteStream(self.screen)
        termios.tcsetwinsize(self.fd, (rows, columns))

    def send(self, keys):
        os.write(self.fd, keys)

    def wait_for(self, predicate):
        deadline = monotonic() + 4
        while True:
            lines = [line.strip() for line in self.screen.display]
            if predicate(lines):
                return
            remaining = deadline - monotonic()
            if remaining <= 0 or not select.select([self.fd], [], [], remaining)[0]:
                break
            try:
                output = os.read(self.fd, 65536)
            except OSError as error:
                if error.errno != errno.EIO:
                    raise
                break
            if not output:
                break
            self.output.extend(output)
            self.stream.feed(output)
        raise AssertionError("\n".join(lines) + "\n" + bytes(self.output[-400:]).decode(errors="replace"))

    def shows(self, text):
        self.wait_for(lambda lines: any(text in line for line in lines))

    def exact_line(self, text):
        self.wait_for(lambda lines: any(line.rsplit("│", 1)[-1].strip() == text for line in lines))

    def quit(self):
        self.send(F10)
        self.wait_for(lambda lines: not any("Shaddai" in line for line in lines))
        self.wait_exit()

    def wait_exit(self):
        deadline = monotonic() + 4
        while monotonic() < deadline:
            pid, status = os.waitpid(self.pid, os.WNOHANG)
            if pid:
                self.pid = None
                if status:
                    raise AssertionError(f"Shaddai exited with wait status {status}")
                return
            select.select([], [], [], 0.02)
        raise AssertionError("Shaddai did not exit")

    def close(self):
        if self.pid:
            os.kill(self.pid, signal.SIGKILL)
            os.waitpid(self.pid, 0)
        os.close(self.fd)


class WorkspaceTests(unittest.TestCase):
    def start(self, terminal_type="xterm-256color", *, editor=""):
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        root = Path(directory.name)
        (root / "Notes").mkdir()
        (root / "Notes/alpha.md").write_text("# Alpha\nAn Obsidian-style note\n")
        (root / "readme.txt").write_text("Plain text document\n")
        tty = WorkspaceTTY(root, terminal_type, env={'EDITOR': editor})
        self.addCleanup(tty.close)
        return root, tty

    def test_vim_respects_editor_and_leaves_workspace_shortcuts_available(self):
        root, tty = self.start(editor="/usr/bin/nvim -f")
        tty.shows("Shell 1")
        tty.send(b"j\r")
        tty.shows("Vim insert")
        tty.send(b"\x1b")
        tty.shows("Vim navigation")
        tty.send(b"0cwVim \x1b")
        tty.shows("Vim text document")
        tty.send(b":w\r")
        tty.shows("Saved readme.txt")
        self.assertEqual((root / "readme.txt").read_text(), "Vim text document\n")

    def test_nano_write_out_and_emacs_control_motion(self):
        root, tty = self.start(editor="nano")
        tty.shows("Shell 1")
        tty.send(b"j\r")
        tty.shows("Ctrl+O Write Out")
        tty.send(b"Nano: \x0f")
        tty.shows("Saved readme.txt")
        self.assertEqual((root / "readme.txt").read_text(), "Nano: Plain text document\n")

        root, tty = self.start(editor="env emacsclient -t")
        tty.shows("Shell 1")
        tty.send(b"j\r")
        tty.shows("Emacs")
        tty.send(b"\x05\x02!")
        tty.shows("Plain text documen!t")
        tty.send(b"\x18\x13")
        tty.shows("Saved readme.txt")
        self.assertEqual((root / "readme.txt").read_text(), "Plain text documen!t\n")

    def test_hidden_shell_keeps_state_and_maximizing_resizes_the_pty(self):
        _, tty = self.start()
        tty.shows("Shell 1")

        tty.send(TERMINAL)
        tty.wait_for(lambda lines: not any("Shell 1" in line for line in lines))
        tty.send(b"\x1b[96;5u")
        tty.shows("New shell")
        tty.send(b"export SHADDAI_TEST=kept; stty size\r")
        tty.exact_line("9 80")

        tty.send(TERMINAL)
        tty.wait_for(lambda lines: not any("Shell 1" in line for line in lines))
        tty.send(TERMINAL)
        tty.shows("New shell")
        tty.send(b'printf "state-%s\\n" "$SHADDAI_TEST"\r')
        tty.exact_line("state-kept")

        tty.send(F6)
        tty.wait_for(lambda lines: "Terminal" in lines[1])
        tty.send(b"stty size\r")
        tty.exact_line("27 80")

        tty.send(b"\x1bT")
        tty.shows("Shell 2")
        tty.send(b'printf "state-%s\\n" "${SHADDAI_TEST:-empty}"\r')
        tty.exact_line("state-empty")

        tty.send(b"\x1b[")
        tty.exact_line("state-kept")
        tty.send(b'printf "\\033[?1049h\\033[H\\033[2Jalt-%s\\n" "screen"\r')
        tty.exact_line("alt-screen")
        tty.send(b'printf "\\033[?1049l"\r')
        tty.exact_line("state-kept")

        tty.send(b'printf "started-%s\\n" "sleep"; sleep 60\r')
        tty.exact_line("started-sleep")
        tty.send(b"\x03")
        tty.send(b'printf "received-%s\\n" "interrupt"\r')
        tty.exact_line("received-interrupt")
        tty.quit()

    def test_files_zoom_preview_and_document_tabs_on_a_linux_terminal(self):
        root, tty = self.start("linux")
        tty.shows("Shell 1")

        tty.send(b"\x04")
        tty.shows("Places")
        tty.shows("alpha.md")
        tty.wait_for(lambda lines: not any("Shell 1" in line for line in lines))

        tty.send(b"j")
        tty.shows("Plain text document")
        tty.send(b"\r")
        tty.shows("Ln 1, Col 1")
        tty.send(b"Edited: ")
        tty.shows("Edited: Plain text document")

        tty.send(b"\x0f")
        tty.shows("Quick open")
        tty.send(b"alpha\r")
        tty.shows("An Obsidian-style note")
        self.assertTrue(any("readme.txt" in line and "alpha.md" in line for line in tty.screen.display))

        tty.send(b"\x1b[")
        tty.shows("Edited: Plain text document")
        tty.send(b"\x13")
        tty.shows("Saved readme.txt")
        self.assertEqual((root / "readme.txt").read_text(), "Edited: Plain text document\n")

        tty.resize(12, 45)
        tty.shows("Edited: Plain text document")
        tty.send(TERMINAL)
        tty.shows("Shell 1")
        tty.send(b"stty size\r")
        tty.exact_line("9 45")
        tty.quit()

    def test_file_operations_keep_an_open_document_attached_to_its_new_path(self):
        root, tty = self.start()
        tty.shows("readme.txt")
        tty.send(b"j\r")
        tty.shows("Plain text document")
        tty.send(b"Edited: \x1bf")
        tty.shows("/ Filter")
        tty.send(b"r")
        tty.shows("Rename")
        tty.send(b"\x15moved.txt\r")
        tty.shows("moved.txt")
        self.assertFalse((root / "readme.txt").exists())
        tty.send(b"\x13")
        tty.shows("Saved moved.txt")
        self.assertEqual((root / "moved.txt").read_text(), "Edited: Plain text document\n")

        tty.send(b"y")
        tty.shows("Copied moved.txt")
        tty.send(b"k\rp")
        tty.wait_for(lambda lines: (root / "Notes/moved.txt").exists())
        self.assertEqual((root / "Notes/moved.txt").read_text(), "Edited: Plain text document\n")
        tty.send(b"p")
        tty.shows("Already exists: moved.txt")
        tty.quit()

    def test_parent_is_the_first_file_row_in_empty_and_filtered_directories(self):
        root, tty = self.start()
        (root / "Notes/Empty folder").mkdir()

        def first_row_is_parent(lines):
            return any(line.startswith("Files") and lines[index + 1].partition("│")[0].strip() == ".."
                       for index, line in enumerate(lines[:-1]))

        tty.wait_for(first_row_is_parent)
        tty.send(b"\x04")
        tty.wait_for(lambda lines: any(line.startswith("Places") and line.split("│", 2)[1].strip() == ".."
                                      for line in lines if "│" in line))
        self.assertFalse(any(line.partition("│")[0].strip() == "Parent" for line in tty.screen.display))
        tty.send(b"\x04")
        tty.wait_for(first_row_is_parent)
        tty.send(b"\r")
        tty.shows("Empty folder/")
        tty.send(b"\r")
        tty.wait_for(lambda lines: first_row_is_parent(lines) and
                     any(line.partition("│")[0].strip() == "Empty folder" for line in lines))
        tty.send(b"\r")
        tty.shows("alpha.md")
        tty.send(b"/impossible-match\r")
        tty.shows("No matches")
        tty.wait_for(first_row_is_parent)
        tty.send(b"grD\r")
        tty.shows("readme.txt")
        self.assertTrue((root / "Notes/Empty folder").is_dir())
        tty.quit()


class TerminalScreenTests(unittest.TestCase):
    def test_private_cursor_position_query_used_by_tmux(self):
        replies = []
        terminal = TerminalScreen(80, 24, 100, replies.append)
        pyte.ByteStream(terminal).feed(b"\x1b[8;12H\x1b[?6n")
        self.assertEqual(replies, ["\x1b[?8;12R"])

    def test_secondary_attributes_do_not_repeat_the_primary_reply(self):
        replies = []
        stream = TerminalStream(TerminalScreen(80, 24, 100, replies.append))
        stream.feed(b"\x1b[c\x1b[>")
        stream.feed(b"c")
        self.assertEqual(replies, ["\x1b[?6c"])


if __name__ == "__main__":
    unittest.main()
