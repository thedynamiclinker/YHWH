"""Exercise the CLI through a real ncurses pseudoterminal and disposable Git refs."""
import fcntl
import json
import os
from pathlib import Path
import pty
import select
import signal
import struct
import subprocess
import termios
import time
import unittest

import test_review


class TerminalTests(unittest.TestCase):
    def setUp(self):
        test_review.ReviewTests.setUp(self)
        (self.root / ".review").mkdir()
        (self.root / ".review/plan.json").write_text(json.dumps(self.plan))
        self.engine = Path(__file__).resolve().parents[3] / "lib/company/review.py"

    def terminal(self, rows=48, columns=160, overrides=None):
        master, slave = pty.openpty()
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", rows, columns, 0, 0))
        env = {**os.environ, "TERM": "xterm-256color", **(overrides or {})}
        process = subprocess.Popen(["python3", str(self.engine), "--root", str(self.root), "start"],
                                   stdin=slave, stdout=slave, stderr=slave, env=env, close_fds=True)
        os.close(slave)
        self.addCleanup(os.close, master)
        def stop():
            if process.poll() is None:
                process.kill()
            process.wait()
        self.addCleanup(stop)
        return process, master

    def until(self, master, expected):
        output = b""
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            if select.select([master], [], [], .1)[0]:
                try:
                    output += os.read(master, 65536)
                except OSError:
                    break
                if expected.encode() in output:
                    return output
        self.fail(f"Missing {expected!r} in terminal output: {output[-2000:]!r}")

    def test_ncurses_navigation_color_note_draft_and_resume(self):
        process, master = self.terminal()
        output = self.until(master, "nothing posted")
        self.assertIn(b"YOUR NEXT SMALL STEP", output)
        self.assertIn(b"REVIEW ASSISTANT", output)
        self.assertIn(b"Amount of YHWH-ness", output)
        os.write(master, b"\n")
        diff = self.until(master, "Hunk 1/2")
        if b"candidate" not in diff:
            diff += self.until(master, "candidate")
        self.assertIn(b"candidate", diff)
        self.assertIn(b"32m", diff)  # real ncurses addition color
        os.write(master, b"\nc")
        self.until(master, "Ctrl-S save")
        os.write(master, b"A concrete terminal observation.")
        # Wait for a persisted keystroke before saving the field.
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            state = json.loads((self.root / ".review/state.json").read_text())
            if state["rounds"]["R01"].get("drafts", {}).get("comment") == "A concrete terminal observation.":
                break
            time.sleep(.01)
        self.assertEqual(state["rounds"]["R01"]["drafts"]["comment"], "A concrete terminal observation.")
        os.write(master, b"\x13")
        self.until(master, "Comment saved")
        os.write(master, b"q")
        process.wait(timeout=10)
        self.assertEqual(process.returncode, 0)
        saved = json.loads((self.root / ".review/state.json").read_text())
        entry = saved["rounds"]["R01"]
        self.assertFalse(saved["active"])
        self.assertEqual(entry["hunk"], 1)
        self.assertEqual(entry["screen"]["page"], 3)
        self.assertEqual(len(entry["seen"]), 1)
        self.assertEqual(entry["comments"][0]["text"], "A concrete terminal observation.")
        self.assertTrue(entry["comments"][0]["anchor"].startswith("es-hf:"))
        process, master = self.terminal()
        self.until(master, "A concrete terminal observation.")
        os.write(master, b"q")
        process.wait(timeout=10)

    def test_small_terminal_can_resize_and_pause(self):
        process, master = self.terminal(9, 40)
        self.until(master, "Make the terminal at least")
        fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack("HHHH", 48, 160, 0, 0))
        process.send_signal(signal.SIGWINCH)
        self.until(master, "YOUR NEXT SMALL STEP")
        os.write(master, b"q")
        process.wait(timeout=10)
        self.assertEqual(process.returncode, 0)

    def test_help_opens_both_about_links_and_preserves_shortcuts(self):
        browser = self.root / "browser"
        capture = self.root / "opened-links"
        browser.write_text('#!/usr/bin/env python3\nimport os, sys\nwith open(os.environ["HELP_LINK_CAPTURE"], "a") as output:\n    output.write(sys.argv[1] + "\\n")\n')
        browser.chmod(0o755)
        def opened(count):
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline:
                if capture.exists() and len(capture.read_text().splitlines()) == count:
                    return
                time.sleep(.01)
            self.fail(f"Browser did not open {count} links")
        process, master = self.terminal(overrides={"BROWSER": str(browser), "HELP_LINK_CAPTURE": str(capture)})
        self.until(master, "nothing posted")
        os.write(master, b"?")
        self.until(master, "About YHWH")
        os.write(master, b"j\n")
        opened(1)
        os.write(master, b"?")
        self.until(master, "About YHWH")
        os.write(master, b"jj\n")
        opened(2)
        self.assertEqual(capture.read_text().splitlines(), [
            "https://www.amazon.com/stores/The-Nameless/author/B0HP8PGPW7",
            "https://www.amazon.com/clp/B0HNR3B4MB?lv=shuf&channelId=500",
        ])
        os.write(master, b"?\n")
        self.until(master, "The proposed commits and messages are already prepared.")
        os.write(master, b"\x1b")
        self.until(master, "NEXT SMALL STEP")
        os.write(master, b"q")
        process.wait(timeout=10)
        self.assertEqual(process.returncode, 0)

    def test_ncurses_acceptance_requires_its_preview_confirmation(self):
        process, master = self.terminal()
        self.until(master, "nothing posted")
        os.write(master, b"a")
        self.until(master, "Accept R01 locally?")
        state = json.loads((self.root / ".review/state.json").read_text())
        self.assertNotEqual(state["rounds"]["R01"]["status"], "accepted")
        os.write(master, b"y")
        self.until(master, "Every round is accepted locally")
        os.write(master, b"q")
        process.wait(timeout=10)
        self.assertEqual(process.returncode, 0)
        state = json.loads((self.root / ".review/state.json").read_text())
        self.assertEqual(state["rounds"]["R01"]["status"], "accepted")
        self.assertIn("One small useful change.", (self.root / "MASTER.md").read_text())


if __name__ == "__main__":
    unittest.main()
