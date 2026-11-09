#!/usr/bin/env bash
# Downloads the prebuilt helium binary into ./helium-bin, which the render function ships with.
#
# The release is a single static (musl) executable with its fonts built in, so nothing else is
# needed to run it on Netlify: no libraries, no fonts, no container.
#
# The newest release is installed by default; set HELIUM_VERSION
# (`HELIUM_VERSION=v0.1.2 scripts/fetch-helium.sh`) to pin one.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/helium-bin"

# The tag of the newest release. `releases/latest` redirects to it, so the tag is in the Location
# header and no GitHub API call (rate limited without a token) is needed.
latest_version() {
  local location
  location="$(curl -fsSI -o /dev/null -w '%{redirect_url}' \
    "https://github.com/manuel-rhdt/helium/releases/latest")" || {
    echo "could not resolve the latest helium release" >&2
    return 1
  }
  if [[ ! "$location" =~ /tag/(v[^/]+)$ ]]; then
    echo "unexpected redirect \"$location\" for the latest helium release" >&2
    return 1
  fi
  echo "${BASH_REMATCH[1]}"
}

VERSION="${HELIUM_VERSION:-$(latest_version)}"
NAME="helium-$VERSION-x86_64-unknown-linux-musl"
URL="https://github.com/manuel-rhdt/helium/releases/download/$VERSION/$NAME.tar.gz"

# The checksum published with the release. It catches a corrupt or truncated download (and a
# resumed transfer that ended badly).
if ! SHA256="$(curl -fsSL --max-time 60 "$URL.sha256" | cut -d' ' -f1)"; then
  echo "could not download the checksum of $URL (is $VERSION a published release?)" >&2
  exit 1
fi
if [[ ! "$SHA256" =~ ^[0-9a-f]{64}$ ]]; then
  echo "the checksum of $URL is malformed: \"$SHA256\"" >&2
  exit 1
fi

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
