"""Start the workspace from the checkout or the installed command."""

import argparse
import os
from pathlib import Path
import sys

from . import __version__
from .config import Config
from .navigation import send_path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="shaddai", description="A terminal workspace for text files.")
    parser.add_argument("path", nargs="?", type=Path,
                        help="directory or text file to open")
    parser.add_argument("--open", "--cwd", dest="target", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--tab", help=argparse.SUPPRESS)
    parser.add_argument("--prefix", type=Path, help="directory for configuration and state")
    parser.add_argument("--doctor", action="store_true", help="check startup without opening the workspace")
    parser.add_argument("--version", action="version", version=f"Shaddai {__version__}")
    args = parser.parse_args(argv)

    try:
        path = (args.target or args.path or Path.cwd()).expanduser().absolute()
        directory = path.is_dir()
        if not directory and not path.is_file():
            parser.error(f"expected a directory or regular file: {path}")
        root = path if directory else path.parent
        address = os.environ.get("YHWH_TTY_SOCKET")
        if address and not args.doctor and args.prefix is None:
            send_path(address, path, args.tab or os.environ.get("YHWH_TAB"))
            return 0

        from .workspace import Workspace

        workspace = Workspace(root, Config(root, args.prefix), file=None if directory else path)
    except ModuleNotFoundError as error:
        if error.name not in ("prompt_toolkit", "pyte", "pygments"):
            raise
        parser.exit(1, f"shaddai: {error.name} is missing from {sys.executable}. "
                       "Use make tty-deps or set SHADDAI_PYTHON to a Python with Shaddai's dependencies.\n")
    except (OSError, ValueError, RuntimeError) as error:
        parser.exit(1, f"shaddai: {error}\n")

    if args.doctor:
        print(f"Shaddai {__version__}: workspace ready ({root})")
        return 0
    if not (sys.stdin.isatty() and sys.stdout.isatty()):
        parser.exit(1, "shaddai: an interactive terminal is required. Use --doctor to check startup.\n")
    workspace.run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
