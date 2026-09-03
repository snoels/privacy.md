#!/usr/bin/env python3
"""Drive an interactive CLI through a pty, so the widgets can be seen rendering.

Not a test -- a harness for looking at the terminal UI during development, and
for capturing the frames that go into the demo.

    python3 test/drive.py "node bin/cli.js init --force" down enter enter ...
"""

import os
import pty
import re
import select
import sys
import time

KEYS = {
    "up": "\x1b[A",
    "down": "\x1b[B",
    "left": "\x1b[D",
    "right": "\x1b[C",
    "enter": "\r",
    "escape": "\x1b",
    "space": " ",
    "backspace": "\x7f",
}

ANSI = re.compile(r"\x1b\[[0-9;?]*[a-zA-Z]")


def key_for(token: str) -> str:
    if token in KEYS:
        return KEYS[token]
    if token.startswith("type:"):
        return token[5:]
    return token


def drive(command: str, tokens: list[str], settle: float = 0.45) -> str:
    pid, fd = pty.fork()
    if pid == 0:
        os.environ["COLUMNS"] = "100"
        os.environ["LINES"] = "50"
        os.execvp("/bin/sh", ["/bin/sh", "-c", command])

    captured: list[bytes] = []

    def pump(duration: float) -> None:
        deadline = time.time() + duration
        while time.time() < deadline:
            ready, _, _ = select.select([fd], [], [], 0.05)
            if not ready:
                continue
            try:
                chunk = os.read(fd, 8192)
            except OSError:
                return
            if not chunk:
                return
            captured.append(chunk)

    pump(settle * 2)
    for token in tokens:
        os.write(fd, key_for(token).encode())
        pump(settle)
    pump(settle * 2)

    try:
        os.close(fd)
    except OSError:
        pass
    try:
        os.waitpid(pid, 0)
    except ChildProcessError:
        pass

    return b"".join(captured).decode("utf-8", "replace")


def final_frame(raw: str) -> str:
    """Keep the last frame only -- the widgets repaint in place."""
    text = ANSI.sub("", raw)
    return "\n".join(line.rstrip() for line in text.splitlines())


if __name__ == "__main__":
    output = drive(sys.argv[1], sys.argv[2:])
    print(final_frame(output))
