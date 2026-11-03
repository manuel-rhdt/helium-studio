#!/usr/bin/env python3
"""Local preview without Node or the Netlify CLI.

Runs netlify/functions/render.mjs inside the AWS Lambda Node 22 image (the same runtime
Netlify Functions use) and serves public/ on http://localhost:8888, forwarding
POST /api/render to the function.

Usage: scripts/dev.py [port]
"""
import json
import subprocess
import sys
import time
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8888
LAMBDA_PORT = 9010
INVOKE_URL = f"http://localhost:{LAMBDA_PORT}/2015-03-31/functions/function/invocations"


def start_lambda():
    return subprocess.Popen(
        [
            "docker", "run", "--rm", "-p", f"{LAMBDA_PORT}:8080",
            "-v", f"{ROOT / 'netlify/functions/render.mjs'}:/var/task/render.mjs:ro",
            "-v", f"{ROOT / 'helium-bin'}:/var/task/helium-bin:ro",
            "public.ecr.aws/lambda/nodejs:22", "render.handler",
        ]
    )


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / "public"), **kwargs)

    def do_POST(self):
        if self.path != "/api/render":
            self.send_error(404)
            return
        body = self.rfile.read(int(self.headers.get("content-length", 0)))
        event = {"httpMethod": "POST", "body": body.decode("utf-8"), "isBase64Encoded": False}
        req = urllib.request.Request(INVOKE_URL, data=json.dumps(event).encode(), method="POST")
        with urllib.request.urlopen(req, timeout=60) as res:
            result = json.loads(res.read())
        if "statusCode" not in result:  # the function itself threw
            result = {"statusCode": 500, "headers": {}, "body": json.dumps({"error": str(result)})}
        payload = result["body"].encode()
        self.send_response(result["statusCode"])
        for key, value in result.get("headers", {}).items():
            self.send_header(key, value)
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


if __name__ == "__main__":
    if not (ROOT / "helium-bin/bin/helium").exists():
        sys.exit("helium-bin/ is missing; run scripts/build-helium.sh first")
    proc = start_lambda()
    time.sleep(2)
    try:
        print(f"Helium Studio on http://localhost:{PORT}")
        ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        proc.terminate()
