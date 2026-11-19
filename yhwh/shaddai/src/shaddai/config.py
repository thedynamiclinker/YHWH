"""One configuration hierarchy; TOML is data, profiles belong to the shell."""
from __future__ import annotations

import json
import os
import shlex
from pathlib import Path
import tempfile
import tomllib

from .yhwh import Library, Prefixes

DEFAULTS = Path(__file__).parent / "defaults"
EDITOR_MODES = ("auto", "vim", "emacs", "nano")


def editor_from_environment(value):
    try:
        argv = shlex.split(value)
    except ValueError:
        return None
    if argv and Path(argv[0]).name == "env":
        argv = [part for part in argv[1:] if "=" not in part and not part.startswith("-")]
    if not argv:
        return None
    command = Path(argv[0]).name.lower()
    if command in {"vi", "vim", "nvim", "vim.basic", "vim.tiny", "view", "gvim"}:
        return "vim"
    if command.startswith("emacs"):
        return "emacs"
    if command in {"nano", "pico"}:
        return "nano"
    return None


def atomic_write(path: Path, data: bytes, mode: int = 0o600, *, replace=True) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            os.fchmod(stream.fileno(), mode)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        if replace:
            os.replace(temporary, path)
        else:
            os.link(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


class Config:
    def __init__(self, cwd: Path, prefix: Path | None = None):
        self.user = Path(os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config") / "shaddai"
        self.user = self.user.expanduser().absolute()
        self.prefix = Path(prefix or os.environ.get("SHADDAI_PREFIX") or self.user).expanduser().absolute()
        self.system = Path(os.environ.get("SHADDAI_SYSTEM_PREFIX", "/etc/shaddai"))
        self.reload(cwd)

    def reload(self, cwd=None):
        cwd = cwd.absolute() if cwd is not None else self.cwd
        yhwh = Prefixes(cwd)
        library = Library.find(cwd)
        candidates = [self.system, self.user]
        candidates += [p / ".shaddai" for p in reversed([cwd, *cwd.parents])]
        if self.prefix != self.user:
            candidates.append(self.prefix)
        paths = [DEFAULTS / "config.toml", *dict.fromkeys(p.absolute() / "etc/config.toml" for p in candidates)]
        defaults = tomllib.loads(paths[0].read_text(encoding="utf-8"))
        data = {section: values.copy() for section, values in defaults.items()}
        if yhwh.active or (library.mount and cwd.is_relative_to(library.mount.parent)):
            self.shared_settings(data, yhwh.values)
        for path in paths[1:]:
            if not path.is_file():
                continue
            with path.open("rb") as stream:
                layer = tomllib.load(stream)
            for section, values in layer.items():
                if not isinstance(values, dict):
                    raise ValueError(f"{path}: {section} must be a TOML table")
                data.setdefault(section, {}).update(values)
        for section, values in data.items():
            if section not in defaults:
                raise ValueError(f"Unknown configuration table: {section}")
            for key, value in values.items():
                if key not in defaults[section]:
                    raise ValueError(f"Unknown setting: {section}.{key}")
                expected = defaults[section][key]
                if type(value) is not type(expected):
                    raise ValueError(f"{section}.{key} must be {type(expected).__name__}")
                if isinstance(value, list) and not all(isinstance(item, str) for item in value):
                    raise ValueError(f"{section}.{key} must contain strings")
        limits = {("ui", "tree_width"): (12, 120), ("ui", "terminal_height"): (3, 100),
                  ("ui", "agent_width"): (20, 120), ("terminal", "scrollback"): (100, 100000),
                  ("editor", "tab_size"): (1, 16), ("editor", "max_file_bytes"): (1, 100000000),
                  ("files", "search_limit"): (100, 1000000), ("agent", "timeout"): (1, 7200),
                  ("agent", "mail_interval"): (1, 86400)}
        for (section, key), (low, high) in limits.items():
            if not low <= data[section][key] <= high:
                raise ValueError(f"{section}.{key} must be between {low} and {high}")
        if data["editor"]["mode"] not in EDITOR_MODES:
            raise ValueError("editor.mode must be auto, vim, emacs, or nano")
        if data["agent"]["backend"] not in ("codex", "command", "offline"):
            raise ValueError("agent.backend must be codex, command, or offline")
        if data["agent"]["sandbox"] not in ("read-only", "workspace-write"):
            raise ValueError("agent.sandbox must be read-only or workspace-write")
        if data["ui"]["theme"] not in ("dark", "light", "mono"):
            raise ValueError("ui.theme must be dark, light, or mono")
        self.cwd, self.yhwh, self.library, self.paths, self.data = cwd, yhwh, library, paths, data
        return self

    @staticmethod
    def shared_settings(data, values):
        options = {
            "show_hidden": ("files", "hidden", "false"), "file_manager": ("ui", "tree_visible", "true"),
            "terminal": ("ui", "terminal_visible", "false"), "autosave": ("editor", "autosave", "true"),
            "inbox": ("agent", "mail", "true"),
        }
        for key, (section, name, default) in options.items():
            data[section][name] = values.get(key, default) == "true"
        theme = values.get("theme", "yhwh")
        if theme in {"light", "dark", "mono", "yhwh", "dawkins", "nietzsche"}:
            data["ui"]["theme"] = {"yhwh": "dark", "dawkins": "light", "nietzsche": "mono"}.get(theme, theme)
        for key, name, scale, low, high in (("sidebar_width", "tree_width", 9, 12, 120),
                                             ("terminal_height", "terminal_height", 24, 3, 100)):
            try:
                data["ui"][name] = min(high, max(low, round(int(values[key]) / scale)))
            except (KeyError, ValueError):
                pass

    def __getitem__(self, section):
        return self.data[section]

    @property
    def preferred_editor(self):
        mode = self.data["editor"]["mode"]
        return editor_from_environment(os.environ.get("EDITOR", "")) if mode == "auto" else mode

    @property
    def state(self):
        return self.prefix / "var"

    def save(self, section: str, key: str, value):
        """Settings writes only overrides; comments elsewhere remain untouched."""
        path = self.prefix / "etc/config.toml"
        original = path.read_text() if path.exists() else ""
        lines = original.splitlines()
        in_section = False
        replaced = False
        insert_at = None
        encoded = json.dumps(value, ensure_ascii=False)
        for i, line in enumerate(lines):
            stripped = line.strip()
            if stripped.startswith("["):
                if in_section and insert_at is None:
                    insert_at = i
                in_section = stripped == f"[{section}]"
            if in_section and stripped.split("=", 1)[0].strip() == key:
                lines[i] = f"{key} = {encoded}"
                replaced = True
                break
        if not replaced:
            if in_section:
                insert_at = len(lines)
            if insert_at is None:
                lines.extend(["", f"[{section}]"])
                insert_at = len(lines)
            lines.insert(insert_at, f"{key} = {encoded}")
        candidate = "\n".join(lines).strip() + "\n"
        tomllib.loads(candidate)
        atomic_write(path.resolve(), candidate.encode(), path.stat().st_mode & 0o777 if path.exists() else 0o600)
        self.reload()
