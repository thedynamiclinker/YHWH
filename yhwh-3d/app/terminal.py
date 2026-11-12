"""One real Unix PTY per focus tab. JSON is only the transport to Electron."""
import base64
import fcntl
import json
import os
import pty
import select
import signal
import struct
import sys
import termios

cwd, rcfile = sys.argv[1:3]
pid, master = pty.fork()
if pid == 0:
    os.chdir(cwd)
    os.environ['TERM'] = 'xterm-256color'
    os.execvp('bash', ['bash', '--rcfile', rcfile, '-i'])

def send(value):
    print(json.dumps(value), flush=True)

def stop(*_):
    try:
        os.killpg(pid, signal.SIGHUP)
    except ProcessLookupError:
        pass
    sys.exit(0)

signal.signal(signal.SIGTERM, stop)
pending = b''
try:
    while True:
        ready, _, _ = select.select([master, sys.stdin.buffer], [], [])
        if master in ready:
            try:
                data = os.read(master, 65536)
            except OSError:
                break
            if not data:
                break
            send({'type': 'data', 'data': base64.b64encode(data).decode()})
        if sys.stdin.buffer in ready:
            chunk = os.read(sys.stdin.fileno(), 65536)
            if not chunk:
                break
            pending += chunk
            while b'\n' in pending:
                line, pending = pending.split(b'\n', 1)
                msg = json.loads(line)
                if msg['type'] == 'input':
                    os.write(master, msg['data'].encode())
                elif msg['type'] == 'navigate':
                    # Only send our binding to the interactive shell, never a
                    # foreground editor. A queued request is also read at prompt.
                    if os.tcgetpgrp(master) == pid:
                        os.write(master, b'\x1b[99~')
                elif msg['type'] == 'resize':
                    fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack('HHHH', msg['rows'], msg['cols'], 0, 0))
finally:
    stop()
