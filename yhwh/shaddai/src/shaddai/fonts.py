"""A setfont session belongs to the numbered Linux virtual console."""

import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory, mkstemp


FONT_NAME = re.compile(r"\.(?:psf|psfu|fnt)(?:\.(?:gz|bz2|xz|zst))?$")


class ConsoleFonts:
    def __init__(self):
        try:
            self.device = os.ttyname(sys.stdin.fileno())
        except (OSError, ValueError):
            self.device = ""
        self.console = bool(re.fullmatch(r"/dev/tty[1-9][0-9]*", self.device)) and sys.stdout.isatty()
        self.backup = None
        self.current = None

    def call(self, *args):
        if not self.console:
            raise OSError("Use the terminal emulator’s settings to change its font.")
        if not (program := shutil.which("setfont")):
            raise OSError("Install kbd to use setfont on this console.")
        result = subprocess.run([program, "-C", self.device, *args],
                                stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=5)
        if result.returncode:
            raise OSError(result.stderr.strip() or f"setfont exited {result.returncode}")

    def snapshot(self, settings):
        if settings["restore_on_exit"] and self.backup is None:
            backup = TemporaryDirectory(prefix="shaddai-font-")
            path = Path(backup.name) / "original.psf"
            try:
                self.call("-O", path)
                if not path.stat().st_size:
                    raise OSError("setfont saved an empty font.")
            except BaseException:
                backup.cleanup()
                raise
            self.backup = backup

    @staticmethod
    def available(settings):
        return sorted({path for directory in settings["directories"] for path in Path(directory).expanduser().glob("*")
                       if FONT_NAME.search(path.name) and path.is_file()})

    def apply(self, name, settings):
        default = Path(name).expanduser()
        if not default.is_file():
            default = next((path for path in self.available(settings) if path.name == name), None)
        if not default:
            raise FileNotFoundError(f"No console font named {name}.")
        self.snapshot(settings)
        try:
            self.call("-m", "none", default.absolute())
        except (OSError, subprocess.SubprocessError):
            self.close()
            self.current = None
            raise
        self.current = name

    def step(self, direction, settings):
        if not self.console:
            raise OSError("Use the terminal emulator’s settings to change its font.")
        available = {path.name for path in self.available(settings)}
        steps = [name for name in settings["steps"] if name in available or Path(name).expanduser().is_file()]
        if not steps:
            raise OSError("No configured size steps were found in the console font directories.")
        current = self.current or settings["default"]
        index = steps.index(current) + direction if current in steps else (0 if direction > 0 else len(steps) - 1)
        self.apply(steps[min(len(steps) - 1, max(0, index))], settings)

    def close(self):
        if self.backup:
            path = Path(self.backup.name) / "original.psf"
            try:
                self.call("-m", "none", path)
            except (OSError, subprocess.SubprocessError) as error:
                # Keep a recovery copy even after the temporary directory is cleaned up.
                fd, recovery = mkstemp(prefix="shaddai-original-", suffix=".psf")
                with os.fdopen(fd, "wb") as stream:
                    stream.write(path.read_bytes())
                print(f"shaddai: could not restore the console font ({error}). Recovery font: {recovery}", file=sys.stderr)
            finally:
                self.backup.cleanup()
                self.backup = None
