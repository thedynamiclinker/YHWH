"""Text documents and a lazy directory tree, independent of the interface."""
from __future__ import annotations

from dataclasses import dataclass, field
import codecs
import hashlib
import os
from pathlib import Path
import shutil
import stat
import subprocess
from tempfile import TemporaryDirectory

from .config import atomic_write


class Conflict(OSError):
    pass


class BinaryFile(OSError):
    pass


def fingerprint(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_regular(path, size):
    # Opening a selected FIFO must not hang before the regular-file check.
    with open(path, "rb", opener=lambda name, flags: os.open(name, flags | os.O_NONBLOCK)) as stream:
        if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
            raise OSError("Only regular text files can be opened")
        raw = stream.read(size)
    if b"\0" in raw:
        raise BinaryFile("This looks like a binary file; the editor opens UTF-8 text")
    return raw


def move_path(source, target):
    # -T keeps a concurrently created directory from becoming an implicit destination.
    result = subprocess.run(["mv", "-nT", "--", source, target], capture_output=True, text=True)
    if result.returncode:
        raise OSError(result.stderr.strip() or f"Could not move {source.name}")
    if os.path.lexists(source):
        raise FileExistsError(f"Already exists: {target.name}")


def copy_path(source, target):
    # Publish only complete copies. The staging path is on the destination filesystem.
    with TemporaryDirectory(prefix=".shaddai-copy-", dir=target.parent) as temporary:
        copy = Path(temporary) / target.name
        if source.is_dir() and not source.is_symlink():
            shutil.copytree(source, copy, symlinks=True)
        else:
            shutil.copy2(source, copy, follow_symlinks=False)
        move_path(copy, target)


@dataclass
class Document:
    path: Path | None = None
    text: str = ""
    saved: str = ""
    digest: str | None = None
    newline: str = "\n"
    bom: bool = False
    mode: int = 0o644
    target: Path | None = None

    @classmethod
    def load(cls, path: Path, limit: int = 8 * 1024 * 1024):
        path = path.absolute()
        raw = read_regular(path, limit + 1)
        if len(raw) > limit:
            raise OSError(f"File is larger than the editor's {limit:,} byte limit")
        text = raw.decode("utf-8-sig")
        newline = "\r\n" if "\r\n" in text and text.count("\r\n") == text.count("\n") else "\n"
        text = text.replace("\r\n", "\n") if newline == "\r\n" else text
        return cls(path, text, text, fingerprint(raw), newline, raw.startswith(b"\xef\xbb\xbf"),
                   stat.S_IMODE(path.stat().st_mode), path.resolve())

    @staticmethod
    def sample(path, limit=16384):
        raw = read_regular(path, limit + 1)
        return codecs.getincrementaldecoder("utf-8-sig")().decode(raw[:limit], final=len(raw) <= limit)

    @property
    def dirty(self):
        return self.text != self.saved

    @property
    def name(self):
        return self.path.name if self.path else "Untitled"

    def save(self, destination: Path | None = None):
        path = (destination or self.path)
        if path is None:
            raise OSError("Choose a filename first")
        path = path.expanduser().absolute()
        same = self.path is not None and path == self.path
        if same and self.target is not None and path.resolve() != self.target:
            raise Conflict("The file's symlink target changed; reload or Save as")
        exists = path.exists()
        if not exists and path.is_symlink():
            raise Conflict("The file's symlink target is missing; choose another name")
        if exists:
            if not same or self.digest is None:
                raise Conflict("That destination already exists; choose another name")
            if not stat.S_ISREG(path.stat().st_mode):
                raise OSError("Only regular text files can be saved")
            if not path.stat().st_mode & 0o222 or not os.access(path, os.W_OK):
                raise PermissionError(f"File is read-only: {path}")
            if fingerprint(path.read_bytes()) != self.digest:
                raise Conflict("Changed on disk. Your edits are intact; use Save as or reload")
        elif same and self.digest is not None:
            raise Conflict("Deleted on disk. Your edits are intact; use Save as")
        raw = self.text.replace("\n", self.newline).encode("utf-8")
        if self.bom:
            raw = b"\xef\xbb\xbf" + raw
        # Preserve symlinks by replacing their resolved target, never the link.
        target = path.resolve()
        mode = stat.S_IMODE(path.stat().st_mode) if exists else self.mode
        atomic_write(target, raw, mode, replace=exists)
        self.path, self.target = path, target
        self.saved, self.digest = self.text, fingerprint(raw)


@dataclass
class FileTree:
    root: Path
    hidden: bool = False
    ignore: list[str] = field(default_factory=list)
    expanded: set[Path] = field(default_factory=set)
    rows: list[tuple[Path | None, int, bool]] = field(default_factory=list)
    selected: int = 0
    errors: list[str] = field(default_factory=list)
    query: str = ""
    world: object = None

    @property
    def current(self):
        return self.rows[self.selected] if self.rows else None

    def entries(self, directory):
        entries = self.world.entries(directory) if self.world else directory.iterdir()
        return sorted(
            ((directory / p.name, p.is_dir()) for p in entries
             if (self.hidden or not p.name.startswith(".")) and p.name not in self.ignore),
            key=lambda entry: (not entry[1], entry[0].name.casefold(), entry[0].name),
        )

    def physical(self, path):
        return self.world.physical(path) if self.world else path

    def refresh(self):
        selected = self.current
        self.rows = [(None, 0, True)]  # The parent row is navigation, with no selectable file path.
        self.errors = []

        def visit(directory, depth):
            try:
                children = self.entries(directory)
            except OSError as error:
                self.errors.append(str(error))
                return
            for path, is_dir in children:
                if not self.query or fuzzy(self.query, path.name):
                    self.rows.append((path, depth, is_dir))
                # A directory symlink is navigable, but never recursively expanded.
                if is_dir and path in self.expanded and not self.physical(path).is_symlink() and depth < 64:
                    visit(path, depth + 1)

        visit(self.root, 0)
        if selected is None:
            self.selected = 1  # Prefer the first actual entry in a newly opened directory.
        else:
            self.selected = next((i for i, row in enumerate(self.rows) if row[0] == selected[0]), self.selected)
        self.selected = max(0, min(self.selected, len(self.rows) - 1))

    def reveal(self, path):
        if path.is_relative_to(self.root):
            self.expanded.update(p for p in path.parents if p.is_relative_to(self.root))
            self.refresh()
            self.selected = next((i for i, row in enumerate(self.rows) if row[0] == path), self.selected)

    def paths(self, query: str, limit: int = 20000):
        """Bounded filename search; don't walk symlinks or ignored trees."""
        results = []
        visited = 0
        pending = [self.root]
        while pending and visited < limit:
            directory = pending.pop()
            visited += 1
            try:
                entries = self.entries(directory)
            except OSError:
                continue
            folders = []
            for path, is_dir in entries:
                visited += 1
                if is_dir and not self.physical(path).is_symlink():
                    folders.append(path)
                elif not is_dir and fuzzy(query, str(path.relative_to(self.root))):
                    results.append(path)
                if visited >= limit:
                    return results
            pending.extend(reversed(folders))
        return results


def fuzzy(query: str, candidate: str):
    remaining = iter(candidate.casefold())
    return all(any(c == letter for c in remaining) for letter in query.casefold())
