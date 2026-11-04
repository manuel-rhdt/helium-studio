#!/usr/bin/env bash
# Collects the text fonts of the style sidebar (see scripts/fonts.py) from Amazon Linux's font
# packages and copies them into a directory (default: ./helium-bin/fonts).
# The result is cached by the content of the two scripts, so it is only rebuilt when they change.
#
# Usage: scripts/build-fonts.sh [output-dir]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/helium-bin/fonts}"
CACHE="$ROOT/.build-cache/fonts"
KEY="$(cat "$ROOT/scripts/fonts.py" "$ROOT/scripts/build-fonts.sh" | sha256sum | cut -c1-12)"
DIR="$CACHE/text-$KEY"

if [[ ! -d "$DIR" ]]; then
  echo "==> collecting fonts"
  mkdir -p "$CACHE"
  rm -rf "$CACHE"/text-*
  mkdir -p "$DIR.tmp"
  # --network host: see build-helium.sh
  docker run --rm --network host \
    -v "$ROOT/scripts/fonts.py":/fonts.py:ro \
    -v "$DIR.tmp":/out \
    -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
    amazonlinux:2023 bash -euo pipefail -c '
      dnf install -y -q --setopt=install_weak_deps=False --setopt=retries=10 findutils fontconfig python3 \
        liberation-serif-fonts liberation-sans-fonts liberation-mono-fonts \
        adobe-source-sans-pro-fonts adobe-source-code-pro-fonts lato-fonts google-noto-serif-fonts \
        texlive-lm texlive-libertinus-fonts texlive-ebgaramond
      python3 /fonts.py /out
      chown -R "$HOST_UID:$HOST_GID" /out
    '
  mv "$DIR.tmp" "$DIR"
fi

mkdir -p "$OUT"
cp "$DIR"/* "$OUT"/
echo "fonts written to $OUT ($(ls "$DIR" | wc -l) files, $(du -sh "$DIR" | cut -f1))"
