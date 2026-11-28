"""Exercise nsh and its prose loader at a controlling terminal."""

from contextlib import contextmanager
import errno
import os
from pathlib import Path
import pty
import select
import signal
import tempfile
import time


@contextmanager
def terminal(directory, env, command="nsh", *args):
    pid, fd = pty.fork()
    if pid == 0:
        os.chdir(directory)
        os.execvpe(command, [command, *args], env)

    buffer = b""

    def expect(marker):
        nonlocal buffer
        deadline = time.monotonic() + 5
        while marker not in buffer:
            remaining = deadline - time.monotonic()
            if remaining <= 0 or not select.select([fd], [], [], remaining)[0]:
                raise AssertionError(f"Expected {marker!r}. Received {buffer!r}")
            buffer += os.read(fd, 4096)
        buffer = buffer.split(marker, 1)[1]

    def send(keys):
        os.write(fd, keys)

    try:
        yield expect, send
        deadline = time.monotonic() + 5
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0 or not select.select([fd], [], [], remaining)[0]:
                raise AssertionError("Ctrl+D did not exit")
            try:
                if not os.read(fd, 4096):
                    break
            except OSError as error:
                if error.errno == errno.EIO:  # Linux PTYs signal EOF this way.
                    break
                raise
    except BaseException:
        try:
            os.killpg(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        raise
    finally:
        os.close(fd)
        _, status = os.waitpid(pid, 0)
    assert os.waitstatus_to_exitcode(status) == 0


with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    plain_prompt = os.fsencode(directory) + b" @ "
    colored_directory = b"\x1b[36m" + os.fsencode(directory) + b"\x1b[0m "
    prompt = colored_directory + b"\x1b[1;32m@\x1b[0m "
    question_prompt = colored_directory + b"\x1b[1;33m@\x1b[0m "
    error_prompt = colored_directory + b"\x1b[1;31m@\x1b[0m "
    continuation = b"\x1b[1;35m>\x1b[0m "
    (root / "complete-target.txt").write_text("completed\n")
    law = root / "law"
    law.write_text(
        "#!/bin/sh\n"
        "cat >/dev/null\n"
        "case \"$3\" in\n"
        "    'fail @ example') printf '@fail\\nCould not finish.\\n' ;;\n"
        "    *) printf '@ask\\nWhat did you mean?\\n' ;;\n"
        "esac\n"
    )
    law.chmod(0o755)
    default_runner = root / "lordhavemercy"
    default_runner.write_text(
        "#!/bin/sh\n"
        "test -r \"$NSH_PROGRAM\" && test \"$#\" -eq 1 && test \"$1\" = -- || exit 1\n"
        "printf 'Ran prose.\\n'\n"
    )
    default_runner.chmod(0o755)
    env = os.environ | {
        "PATH": f"{directory}:{os.environ['PATH']}",
        "HOME": str(root / "home"),
        "LD_RUNNER": "",
        "NSH_HOME": str(root / "prefix"),
        "NSH_STYLE": "",
        "NO_COLOR": "",
        "TERM": "xterm",
        "INPUTRC": "/dev/null",
    }

    for invocation in (("@",), ("LD", "@")):
        with terminal(directory, env, *invocation) as (expect, send):
            expect(b"Ran prose.\r\n")

    with terminal(directory, env) as (expect, send):
        expect(prompt)
        send(b"rintf '[%s]\\n' edited\x01p\r")
        expect(b"\r[edited]\r\n")
        expect(prompt)
        send(b"\x1b[A\r")
        expect(b"\r[edited]\r\n")
        expect(prompt)
        send(b"cat complete-t\t\r")
        expect(b"\rcompleted\r\n")
        expect(prompt)
        send(b"echo discarded")
        expect(b"echo discarded")
        send(b"\x03")
        expect(error_prompt)
        send(b"bash -c 'echo running; exec sleep 20'\r")
        expect(b"\rrunning\r\n")
        send(b"\x03")
        expect(error_prompt)
        send(b"unknown-word\r")
        expect(b"\x1b[1;33mWhat did you mean?\x1b[0m\r\n")
        expect(question_prompt)
        send(b"\x03")
        expect(error_prompt)
        send(b"fail @ example\r")
        expect(b"\x1b[1;31mCould not finish.\x1b[0m\r\n")
        expect(error_prompt)
        send(b"printf '[%s]\\n' \"$?\"\r")
        expect(b"\r[127]\r\n")
        expect(prompt)
        send(b":paste\r")
        expect(continuation)
        send(b"printf '%s\\n' block\r")
        expect(continuation)
        send(b"\r")
        expect(b"\rblock\r\n")
        expect(prompt)
        send(b" echo private\r")
        expect(b"\rprivate\r\n")
        expect(prompt)
        send(b"\x04")

    with terminal(directory, env, "nhs") as (expect, send):
        expect(b"\x1b[1;32m>>>\x1b[0m ")
        send(b":paste\r")
        expect(b"\x1b[1;35m...\x1b[0m ")
        send(b"\r")
        expect(b"\x1b[1;32m>>>\x1b[0m ")
        send(b"\x04")

    for overrides in ({"NO_COLOR": "1"}, {"TERM": "dumb"}):
        with terminal(directory, env | overrides) as (expect, send):
            expect(plain_prompt)
            send(b"unknown-word\r")
            expect(b"What did you mean?\r\n")
            expect(plain_prompt)
            send(b"\x03")
            expect(plain_prompt)
            send(b"exit 0\r")

    history = (root / "prefix" / "history").read_text()
    assert "discarded" not in history
    assert "private" not in history

    with terminal(directory, env) as (expect, send):
        expect(prompt)
        send(b"\x12edited")
        expect(b"reverse-i-search")
        send(b"\x06\r")
        expect(b"\r[edited]\r\n")
        expect(prompt)
        send(b"\x04")
