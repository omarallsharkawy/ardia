#!/usr/bin/env python3
"""Hands links from other apps to the running Ardia.

The launcher runs this first with its arguments. When they are only links and a running Ardia answers on its control
socket, Ardia opens them as links from other apps (Settings › General › Open links from other apps in Little Ardia)
and this exits 0. Anything else exits 1 and the launcher starts Chrome as usual, which opens plain tabs.
"""
import json
import os
import socket
import stat
import sys
from pathlib import Path
from urllib.parse import urlsplit

SOCKET_FILE = "ArdiaControl.sock"
SCHEMES = ("http", "https", "file")
MAX_LINKS = 20
TIMEOUT = 3.0


def links(args):
    if not args or len(args) > MAX_LINKS:
        return None
    for arg in args:
        if urlsplit(arg).scheme.lower() not in SCHEMES:
            return None
    return list(args)


def data_root():
    root = os.environ.get("ARDIA_DATA_DIR")
    if root:
        return Path(root).expanduser()
    config = os.environ.get("ARDIA_CONFIG_HOME") or os.environ.get("XDG_CONFIG_HOME") or str(Path.home() / ".config")
    return Path(config) / "ardia"


def hand_over(urls, path):
    info = os.lstat(path)
    if not stat.S_ISSOCK(info.st_mode) or info.st_uid != os.getuid():
        return False
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
        sock.settimeout(TIMEOUT)
        sock.connect(str(path))
        sock.sendall(json.dumps({"id": 1, "method": "openLinks", "params": {"urls": urls}}).encode() + b"\n")
        reply = b""
        while not reply.endswith(b"\n"):
            chunk = sock.recv(65536)
            if not chunk:
                return False
            reply += chunk
            if len(reply) > 1024 * 1024:
                return False
    for line in reply.splitlines():
        message = json.loads(line)
        if isinstance(message, dict) and message.get("id") == 1:
            return message.get("result") == {"ok": True}
    return False


def main(args):
    urls = links(args)
    if urls is None:
        return 1
    try:
        return 0 if hand_over(urls, data_root() / SOCKET_FILE) else 1
    except (OSError, ValueError):
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
