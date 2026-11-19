"""YHWH's filesystem and shell contracts. No desktop runtime is needed."""

from dataclasses import dataclass
import json
import os
from pathlib import Path
import re
from shlex import quote
import shutil
from stat import S_ISREG
import subprocess
from tempfile import TemporaryFile


def config_home():
    return Path(os.environ.get("YHWH_CONFIG_HOME") or
                Path(os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config") / "yhwh").expanduser().absolute()


def trusted_file(path):
    try:
        info = path.stat()
    except (FileNotFoundError, NotADirectoryError):
        return False
    if not S_ISREG(info.st_mode):
        return False
    if info.st_uid not in (os.getuid(), 0) or info.st_mode & 0o022:
        raise OSError(f"{path}: shell configuration must be owned by you or root and writable only by its owner")
    return True


def sections(text):
    result = []
    for number, line in enumerate(text.splitlines(), 1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if not line[0].isspace():
            result.append((line.strip(), []))
        elif not result:
            raise ValueError(f"line {number}: shell statements need a path above them")
        else:
            result[-1][1].append(re.sub(r"^(?:\t| {1,4})", "", line))
    return result


def shell_output(code, cwd, env):
    # Bash owns expansion. A dedicated descriptor keeps profile output separate.
    with TemporaryFile() as output, TemporaryFile() as errors:
        env = {key: val for key, val in env.items() if key != "BASH_ENV"}
        try:
            result = subprocess.run(
                [os.environ.get("YHWH_BASH") or "bash", "--noprofile", "--norc", "-c",
                 code.replace(">&__OUTPUT__", f">&{output.fileno()}")],
                cwd=cwd, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                stderr=errors, pass_fds=(output.fileno(),), timeout=5,
            )
        except subprocess.TimeoutExpired as error:
            raise ValueError("config shell exceeded 5 seconds") from error
        if result.returncode:
            errors.seek(0)
            raise ValueError(os.fsdecode(errors.read(8000)).strip() or f"shell exited {result.returncode}")
        output.seek(0)
        data = output.read(1024 * 1024 + 1)
        if len(data) > 1024 * 1024:
            raise ValueError("config shell returned over 1 MiB")
        return os.fsdecode(data).split("\0")[:-1]


def assignment_name(key):
    return key.removeprefix("yhwh_")


class Prefixes:
    def __init__(self, path, *, global_only=False):
        self.user = config_home()
        system = Path(os.environ.get("YHWH_SYSTEM_CONFIG") or "/etc/yhwh").absolute()
        self.locations = [(system, system), (self.user, self.user)]
        if not global_only:
            self.locations.extend((parent / ".yhwh", parent) for parent in reversed((path, *path.parents)))
        self.target = path
        self.environment = dict(os.environ)
        self.values = {}
        self.files, self.warnings = [], []
        for prefix, base in self.locations:
            self.read(prefix / "etc/profile", base, profile=True)
            self.read(prefix / "rc", base)
        for key, value in os.environ.items():
            if key.startswith("yhwh_"):
                self.values[assignment_name(key)] = value

    @property
    def active(self):
        return bool(self.files or self.values or any(prefix.is_dir() for prefix, _ in self.locations))

    def interactive(self):
        lines = []
        for prefix, _ in self.locations:
            profile = prefix / "etc/profile"
            bashrc = prefix / self.values.get("bashrc_file", "etc/bashrc")
            completions = prefix / self.values.get("completions_directory", "lib/bash/completions")
            for path in (profile, bashrc, *sorted(completions.glob("*"))):
                try:
                    if trusted_file(path):
                        lines.extend([f"export YHWH_PREFIX={quote(str(prefix))}", f". {quote(str(path))}"])
                except OSError as error:
                    self.warnings.append(str(error))
        return lines

    def keys(self):
        directory = self.values.get("keys_directory", "etc/keys")
        effective = {}
        for prefix, _ in self.locations:
            layer = {}
            for binding in key_files(prefix / directory, prefix):
                previous = layer.get(binding.name)
                if previous is None or binding.priority > previous.priority:
                    layer[binding.name] = binding
            effective.update(layer)
        return effective

    def read(self, filename, base, profile=False):
        try:
            if not trusted_file(filename):
                return
            self.files.append(filename)
            assigned = set()
            env = self.environment
            if profile:
                env = {**env, "YHWH_PREFIX": str(filename.parent.parent)}
                code = ". " + quote(str(filename))
            else:
                entries = sections(filename.read_text())
                expanded = shell_output("\n".join(
                    f'printf "%s\\0" "{scope}" >&__OUTPUT__' for scope, _ in entries), base, env)
                target = self.target
                matches = [(scope, lines) for (_, lines), value in zip(entries, expanded)
                           if target.is_relative_to(scope := Path(os.path.abspath(base / value)))]
                lines = [line for _, block in sorted(matches, key=lambda item: len(str(item[0]))) for line in block]
                if not lines:
                    return
                assigned = {match[1] for line in lines
                            if (match := re.match(r"^\s*(?:export\s+)?([a-zA-Z_]\w*)=", line))}
                code = "\n".join(lines)
            result = dict(entry.split("=", 1) for entry in shell_output(
                "set -ae\n" + code + "\ncommand env -0 >&__OUTPUT__", base, env) if "=" in entry)
            for key in sorted(result, key=lambda key: key.startswith("yhwh_")):
                if key in {"PWD", "OLDPWD", "SHLVL", "_", "YHWH_PREFIX", "SHELLOPTS"} or key.startswith("__yhwh_"):
                    continue
                if result[key] != env.get(key) or key in assigned:
                    self.values[assignment_name(key)] = result[key]
            self.environment = result
        except (OSError, ValueError) as error:
            self.warnings.append(f"{filename}: {error}")


@dataclass(frozen=True)
class KeyFile:
    name: str
    path: Path
    prefix: Path
    priority: int
    kind: str
    command: str = ""
    when: str = ""


def key_files(folder, prefix, relative=Path(), ancestors=frozenset()):
    aliases = {"control": "ctrl", "option": "alt", "esc": "escape", "command": "meta", "cmd": "meta",
               "del": "delete", "`": "backtick", ",": "comma", ".": "period", "+": "plus", "\\": "backslash"}
    modifiers = ("ctrl", "alt", "shift", "meta")
    try:
        physical = folder.resolve(strict=True)
        if physical in ancestors:
            return
        entries = sorted(folder.iterdir())
    except (OSError, RuntimeError):
        return
    for path in entries:
        if path.is_dir():
            if len(relative.parts) < len(modifiers):
                yield from key_files(path, prefix, relative / path.name, ancestors | {physical})
            continue
        ext = path.suffix in (".js", ".sh", ".py")
        parts = [aliases.get(part, part) for part in (*relative.parts, path.stem if ext else path.name)]
        if (len(set(parts)) != len(parts) or any(part not in modifiers for part in parts[:-1])
                or not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", parts[-1])):
            continue
        name = "/".join([*(part for part in modifiers if part in parts[:-1]), parts[-1]])
        try:
            if not trusted_file(path):
                continue
            info = path.stat()
            if info.st_mode & 0o111:
                yield KeyFile(name, path, prefix, 3 if ext else 4, "exec")
            elif info.st_size == 0:
                yield KeyFile(name, path, prefix, 0 if ext else 2, "disabled")
            elif path.suffix == ".js" and info.st_size <= 1024 * 1024:
                # The binding editor's literal api.run form is a command reference.
                # General JavaScript modules belong to their host.
                source = path.read_text().splitlines()
                command = re.fullmatch(r"// command: ([a-z0-9-]+)", source[0]) if source else None
                when = re.fullmatch(r"// when: (files|terminal|editor)", source[1]) if len(source) > 1 else None
                if command and source[2 if when else 1:] == [f"export default api => api.run('{command[1]}');"]:
                    yield KeyFile(name, path, prefix, 0, "command", command[1], when[1] if when else "")
                else:
                    yield KeyFile(name, path, prefix, 0, "module")
        except (OSError, ValueError):
            continue


def save_setting(scope, key, value):
    if not re.fullmatch(r"[a-zA-Z_]\w*", key) or any(c in str(scope) + value for c in "\r\n"):
        raise ValueError("Use the rc editor for multiline settings.")
    filename = config_home() / "rc"
    filename.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    trusted_file(filename)
    literal = re.sub(r'([\\"$`])', r'\\\1', str(scope))
    data = f"\n# Saved from Shaddai settings\n{literal}\n    {key}={quote(value)}\n"
    fd = os.open(filename, os.O_APPEND | os.O_CREAT | os.O_WRONLY | os.O_NONBLOCK, 0o600)
    with os.fdopen(fd, "a") as stream:
        stream.write(data)


@dataclass(frozen=True)
class Library:
    """Installations can point at a plain mnt/ and etc/ tree."""
    mount: Path | None
    etc: Path | None
    command: str | None

    @classmethod
    def find(cls, cwd):
        override = os.environ.get("YHWH_COMMAND")
        on_path = shutil.which("yhwh")
        executable = override
        explicit = os.environ.get("YHWH_HOME")
        if explicit:
            homes = [Path(explicit).expanduser().absolute()]
        else:
            homes = [cwd, *cwd.parents, Path("/usr/local/share/yhwh"), Path("/usr/share/yhwh"),
                     Path.home() / "obsidian/YHWH"]
            if on_path:
                homes.append(Path(on_path).resolve().parent.parent)
        mount = etc = None
        for home in homes:
            if not mount and (home / "mnt/root").is_dir() and (home / "mnt/yhwh").is_dir():
                mount = home / "mnt"
            for base in (home / "yhwh", home):
                if (base / "etc/default/words.json").is_file():
                    etc = etc or base / "etc"
                    if not executable and os.access(base / "bin/yhwh", os.X_OK):
                        executable = str(base / "bin/yhwh")
                    break
            if mount and etc:
                break
        return cls(mount, etc, executable or on_path)

    def data(self, name):
        if self.etc:
            path = self.etc / name
            if path.is_file():
                return path
        raise FileNotFoundError(f"YHWH data file {name} is unavailable. Set YHWH_HOME to its data directory.")

    def json(self, name):
        return json.loads(self.data(name).read_text())

    def books(self, name):
        if not self.mount:
            raise FileNotFoundError("YHWH mnt/ is unavailable. Set YHWH_HOME to the directory containing it.")
        source = self.mount / {"Sinai": "yhwh/mnt/sinai/README.md", "Horeb": "root/mnt/horeb/READWE.md"}[name]
        items = []
        for line in source.read_text().splitlines():
            if match := re.fullmatch(r"\d+\.\s+(?:\[([^\]]+)\]\((https?://[^)]+)\)|(.+))", line.strip()):
                items.append((match[1] or match[3], match[2]))
        return source, items


@dataclass(frozen=True)
class World:
    name: str
    root: Path
    shared: Path

    def directory(self, path):
        if path.is_relative_to(self.shared):
            return self.root / path.relative_to(self.shared)
        return path if path.is_relative_to(self.root) else self.root

    def physical(self, path):
        if path.is_relative_to(self.root):
            overlay = self.shared / path.relative_to(self.root)
            if os.path.lexists(overlay):
                return overlay
        return path

    def entries(self, directory):
        overlay = self.shared / directory.relative_to(self.root)
        entries = {}
        for source in (directory, overlay):
            try:
                for entry in source.iterdir():
                    entries[entry.name] = entry
            except (FileNotFoundError, NotADirectoryError):
                if source == overlay and not entries and not directory.is_dir() and not overlay.is_dir():
                    raise
        return entries.values()
