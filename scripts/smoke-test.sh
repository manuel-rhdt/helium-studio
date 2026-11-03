#!/usr/bin/env bash
# Runs netlify/functions/render.mjs with the built helium-bin/ inside the AWS Lambda Node 22 image
# (the runtime Netlify Functions use) and checks that it renders a PDF.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-9012}"
NAME=helium-smoke-test
URL="http://localhost:$PORT/2015-03-31/functions/function/invocations"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

docker run -d --name "$NAME" -p "$PORT:8080" \
  -v "$ROOT/netlify/functions/render.mjs:/var/task/render.mjs:ro" \
  -v "$ROOT/helium-bin:/var/task/helium-bin:ro" \
  public.ecr.aws/lambda/nodejs:22 render.handler >/dev/null

# the first invocation also waits for the runtime interface emulator to come up
event='{"httpMethod":"POST","body":"{\"html\":\"<!DOCTYPE html><h1>Smoke test</h1><p>It works.</p>\"}"}'
response=""
for _ in $(seq 1 30); do
  if response="$(curl -fsS --max-time 30 "$URL" -d "$event" 2>/dev/null)"; then break; fi
  sleep 1
done

status="$(printf '%s' "$response" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("statusCode"))')"
pdf="$(printf '%s' "$response" | python3 -c 'import json,sys,base64; b=json.loads(json.load(sys.stdin)["body"]); print(base64.b64decode(b.get("pdf","")).startswith(b"%PDF-"))')"
if [[ "$status" != 200 || "$pdf" != True ]]; then
  echo "smoke test failed: status=$status pdf=$pdf" >&2
  printf '%s\n' "$response" | head -c 2000 >&2
  exit 1
fi
echo "smoke test passed"
