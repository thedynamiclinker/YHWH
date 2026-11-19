"""The newline-delimited YHWH_TTY_SOCKET path-open protocol."""

import asyncio
import json
from pathlib import Path
import socket
import sys
from tempfile import TemporaryDirectory


LIMIT = 65536


def send_path(address, path, tab):
    request = json.dumps({"path": str(path), "tab": tab}).encode() + b"\n"
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as stream:
        stream.settimeout(5)
        stream.connect(address)
        stream.sendall(request)
        with stream.makefile("rb") as response:
            data = response.readline(LIMIT)
    if not data:
        raise OSError("Workspace closed the open request.")
    result = json.loads(data)
    if error := result.get("error"):
        raise OSError(error)


async def serve_paths(run, open_path):
    async def request(reader, writer):
        try:
            data = await asyncio.wait_for(reader.readline(), 5)
            message = json.loads(data)
            if not isinstance(message, dict) or not isinstance(message.get("path"), str):
                raise ValueError("Expected a path in the open request.")
            path = Path(message["path"])
            if not path.is_absolute():
                raise ValueError("The open request needs an absolute path.")
            open_path(path, message.get("tab"))
            result = {}
        except (ValueError, OSError, TimeoutError) as error:
            result = {"error": str(error) or "The open request timed out."}
        try:
            writer.write(json.dumps(result).encode() + b"\n")
            await asyncio.wait_for(writer.drain(), 5)
        except (ConnectionError, TimeoutError):
            pass
        finally:
            writer.close()

    with TemporaryDirectory(prefix="shaddai-") as directory:
        address = str(Path(directory) / "open.sock")
        try:
            server = await asyncio.start_unix_server(request, address, limit=LIMIT - 1)
        except OSError as error:
            print(f"shaddai: shell navigation unavailable ({error})", file=sys.stderr)
            await run("")
            return
        async with server:
            await run(address)
