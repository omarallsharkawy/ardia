import importlib.util
import json
import os
import socket
import tempfile
import threading
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "open-links.py"
spec = importlib.util.spec_from_file_location("open_links", SCRIPT)
open_links = importlib.util.module_from_spec(spec)
spec.loader.exec_module(open_links)


class FakeArdia:
    def __init__(self, directory, reply):
        self.path = Path(directory) / open_links.SOCKET_FILE
        self.server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.server.bind(str(self.path))
        self.server.listen(1)
        self.requests = []
        self.reply = reply
        self.thread = threading.Thread(target=self.serve, daemon=True)
        self.thread.start()

    def serve(self):
        connection, _ = self.server.accept()
        with connection:
            line = b""
            while not line.endswith(b"\n"):
                line += connection.recv(65536)
            request = json.loads(line)
            self.requests.append(request)
            connection.sendall(json.dumps({"id": request["id"], **self.reply}).encode() + b"\n")

    def close(self):
        self.server.close()


class OpenLinksTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.old = os.environ.get("ARDIA_DATA_DIR")
        os.environ["ARDIA_DATA_DIR"] = self.dir.name

    def tearDown(self):
        if self.old is None:
            os.environ.pop("ARDIA_DATA_DIR", None)
        else:
            os.environ["ARDIA_DATA_DIR"] = self.old
        self.dir.cleanup()

    def test_only_links_are_handed_over(self):
        self.assertEqual(open_links.links(["https://a.example/", "file:///tmp/a.html"]), ["https://a.example/", "file:///tmp/a.html"])
        for args in ([], ["--new-window", "https://a.example/"], ["/tmp/a.html"], ["about:blank"], ["https://a.example/"] * 21):
            self.assertIsNone(open_links.links(args), args)

    def test_a_running_ardia_takes_the_links(self):
        fake = FakeArdia(self.dir.name, {"result": {"ok": True}})
        try:
            self.assertEqual(open_links.main(["https://a.example/"]), 0)
            fake.thread.join(2)
            self.assertEqual(fake.requests, [{"id": 1, "method": "openLinks", "params": {"urls": ["https://a.example/"]}}])
        finally:
            fake.close()

    def test_a_refusal_falls_back_to_chrome(self):
        fake = FakeArdia(self.dir.name, {"error": {"code": "unknown_method", "message": "There's no method openLinks."}})
        try:
            self.assertEqual(open_links.main(["https://a.example/"]), 1)
        finally:
            fake.close()

    def test_no_running_ardia_falls_back_to_chrome(self):
        self.assertEqual(open_links.main(["https://a.example/"]), 1)
        stale = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        stale.bind(str(Path(self.dir.name) / open_links.SOCKET_FILE))
        stale.close()
        self.assertEqual(open_links.main(["https://a.example/"]), 1)

    def test_flags_never_touch_the_socket(self):
        self.assertEqual(open_links.main(["--version"]), 1)


if __name__ == "__main__":
    unittest.main()
