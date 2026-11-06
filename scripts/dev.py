#!/usr/bin/env python3
"""Local preview without Node or the Netlify CLI.

Serves public/ on http://localhost:8888 and answers POST /api/render by running the helium binary
(scripts/fetch-helium.sh) the way netlify/functions/render.mjs does. The function itself is covered
by the tests (npm test); `netlify dev` runs the real thing if you have the Netlify CLI.

Usage: scripts/dev.py [port]
"""
import base64
import json
import re
import subprocess
import sys
import tempfile
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BINARY = ROOT / "helium-bin" / "helium"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8888
TIMEOUT_S = 8
MAX_INPUT_BYTES = 1024 * 1024
MAX_PDF_BYTES = 4 * 1024 * 1024


def run_helium(html):
    """Returns (pdf bytes or None, log text, error message or None)."""
    with tempfile.TemporaryDirectory() as directory:
        source, target = Path(directory, "main.html"), Path(directory, "output.pdf")
        source.write_text(html, encoding="utf-8")
        try:
            done = subprocess.run(
                [BINARY, source, target], capture_output=True, text=True, timeout=TIMEOUT_S, env={"RUST_LOG": "warn", "HELIUM_NO_SYSTEM_FONTS": "1"}
            )
        except subprocess.TimeoutExpired:
            return None, "", f"helium timed out after {TIMEOUT_S}s"
        log = done.stdout + done.stderr
        if done.returncode != 0:
            how = f"crashed (signal {-done.returncode})" if done.returncode < 0 else f"exited with code {done.returncode}"
            return None, log, f"helium {how}"
        return target.read_bytes(), log, None


_baseline = None


def without_baseline(log):
    """helium's built-in stylesheet logs the same warnings for every document; only show the others."""
    global _baseline
    message = lambda line: re.sub(r"^\[\S+\s+", "", line)
    if _baseline is None:
        _baseline = {message(line) for line in run_helium("<!DOCTYPE html><html><body></body></html>")[1].splitlines()}
    return "\n".join(line for line in log.splitlines() if line and message(line) not in _baseline)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / "public"), **kwargs)

    def reply(self, status, body):
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self):
        if self.path != "/api/render":
            self.send_error(404)
            return
        try:
            html = json.loads(self.rfile.read(int(self.headers.get("content-length", 0)))).get("html")
        except ValueError:
            return self.reply(400, {"error": 'Body must be JSON: { "html": "..." }'})
        if not isinstance(html, str) or not html.strip():
            return self.reply(400, {"error": "No HTML given"})
        if len(html.encode()) > MAX_INPUT_BYTES:
            return self.reply(413, {"error": "Document is larger than 1 MB"})

        started = time.time()
        pdf, log, error = run_helium(html)
        ms, log = round((time.time() - started) * 1000), without_baseline(log)
        if error:
            return self.reply(422, {"error": error, "log": log, "ms": ms})
        if len(pdf) > MAX_PDF_BYTES:
            return self.reply(413, {"error": f"The rendered PDF is {len(pdf) / 1048576:.1f} MB, over the limit.", "log": log, "ms": ms})
        self.reply(200, {"pdf": base64.b64encode(pdf).decode(), "log": log, "ms": ms})


if __name__ == "__main__":
    if not BINARY.exists():
        sys.exit("helium-bin/helium is missing; run scripts/fetch-helium.sh first")
    print(f"Helium Studio on http://localhost:{PORT}")
    try:
        ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        pass
