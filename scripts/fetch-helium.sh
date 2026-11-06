#!/usr/bin/env bash
# Downloads the prebuilt helium binary into ./helium-bin, which the render function ships with.
#
# The release is a single static (musl) executable with its fonts built in, so nothing else is
# needed to run it on Netlify: no libraries, no fonts, no container.
#
# To update helium, set VERSION and SHA256 (the digest GitHub shows for the release asset).
set -euo pipefail

VERSION="v0.1"
SHA256="25e1f52b2059f2b936626afa13f2cf2d82a3265cb73c0d3da3615406b3aaaae1"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/helium-bin"
NAME="helium-$VERSION-x86_64-unknown-linux-musl"
URL="https://github.com/manuel-rhdt/helium/releases/download/$VERSION/$NAME.tar.gz"

if [[ -x "$OUT/helium" && "$(cat "$OUT/.version" 2>/dev/null)" == "$VERSION $SHA256" ]]; then
  echo "helium $VERSION is already in $OUT"
  exit 0
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
archive="$work/$NAME.tar.gz"
checksum() { sha256sum "$archive" 2>/dev/null | cut -d' ' -f1; }

# Some connections drop large downloads, so an interrupted transfer is resumed (-C -) rather than restarted.
for _ in $(seq 1 40); do
  [[ "$(checksum)" == "$SHA256" ]] && break
  if curl -fsSL --max-time 120 -C - -o "$archive" "$URL" 2>/dev/null && [[ "$(checksum)" != "$SHA256" ]]; then
    echo "checksum mismatch, downloading again" >&2
    rm -f "$archive"
  fi
done
if [[ "$(checksum)" != "$SHA256" ]]; then
  echo "could not download $URL with the expected checksum" >&2
  exit 1
fi

tar xzf "$archive" -C "$work"
rm -rf "$OUT"
mkdir -p "$OUT"
install -m 755 "$work/$NAME/helium" "$OUT/helium"
cp "$work"/"$NAME"/LICENSE* "$OUT/"
echo "$VERSION $SHA256" > "$OUT/.version"
echo "helium $VERSION installed in $OUT ($(du -h "$OUT/helium" | cut -f1))"
