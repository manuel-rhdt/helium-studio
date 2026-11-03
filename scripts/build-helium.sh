#!/usr/bin/env bash
# Builds the helium binary for the Netlify Functions runtime (AWS Lambda, Amazon Linux 2023,
# glibc 2.34) and collects everything it needs at runtime into ./helium-bin:
#
#   helium-bin/bin/helium   the binary
#   helium-bin/lib/         shared libraries missing from the Lambda image (fontconfig, freetype, ...)
#   helium-bin/fonts/       fonts made available to fontconfig (math fonts, DejaVu, and the sidebar's
#                           text fonts from build-fonts.sh)
#
# The build reuses the host's Rust toolchain (~/.rustup) and crate cache (~/.cargo), so
# nothing big has to be downloaded inside the container. Official rustup toolchains run on
# old glibc versions, so they work fine inside Amazon Linux.
#
# Usage: scripts/build-helium.sh [path-to-helium-checkout]   (defaults to ../helium)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$(realpath "${1:-$ROOT/../helium}")"
OUT="$ROOT/helium-bin"
CACHE="$ROOT/.build-cache"
RUSTUP_DIR="${RUSTUP_HOME:-$HOME/.rustup}"
CARGO_DIR="${CARGO_HOME:-$HOME/.cargo}"

if [[ ! -f "$SRC/Cargo.toml" ]]; then
  echo "helium source not found at $SRC" >&2
  exit 1
fi
if [[ ! -x "$CARGO_DIR/bin/cargo" ]]; then
  echo "no Rust toolchain found in $CARGO_DIR (install one with rustup first)" >&2
  exit 1
fi

mkdir -p "$CACHE"
rm -rf "$OUT"
mkdir -p "$OUT"

# --network host: Docker's bridge network uses a bigger MTU than some hosts (e.g. WSL with a VPN),
# which makes larger downloads hang.
docker run --rm --network host \
  -v "$SRC":/src:ro \
  -v "$CACHE":/cache \
  -v "$OUT":/out \
  -v "$RUSTUP_DIR":/rustup \
  -v "$CARGO_DIR":/cargo \
  -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
  amazonlinux:2023 bash -euo pipefail -c '
    echo "==> installing build dependencies"
    dnf install -y -q gcc gcc-c++ make git tar unzip findutils binutils util-linux \
      fontconfig-devel freetype-devel dejavu-sans-fonts dejavu-serif-fonts dejavu-sans-mono-fonts

    # everything below runs as the host user so ~/.cargo and the outputs stay owned by them
    as_user() {
      setpriv --reuid="$HOST_UID" --regid="$HOST_GID" --clear-groups \
        env HOME=/cache RUSTUP_HOME=/rustup CARGO_HOME=/cargo CARGO_TARGET_DIR=/cache/target \
        PATH=/cargo/bin:/usr/bin:/bin "$@"
    }

    echo "==> building helium"
    # build from a copy so the host checkout (and its target dir) stays untouched
    rm -rf /cache/src && mkdir /cache/src
    tar -C /src --exclude=./target --exclude=./.git -cf - . | tar -C /cache/src -xf -
    chown -R "$HOST_UID:$HOST_GID" /cache /out
    cd /cache/src
    as_user cargo build --release --offline || as_user cargo build --release

    echo "==> collecting binary, libraries and fonts"
    as_user mkdir -p /out/bin /out/lib /out/fonts
    as_user cp /cache/target/release/helium /out/bin/helium
    as_user strip /out/bin/helium

    # bundle every shared library except glibc itself, which the Lambda image provides
    ldd /out/bin/helium | awk "/=> \\//{print \$3}" | while read -r lib; do
      case "$(basename "$lib")" in
        libc.so*|libm.so*|libdl.so*|libpthread.so*|librt.so*|ld-linux*) ;;
        *) as_user cp -L "$lib" /out/lib/ ;;
      esac
    done

    # DejaVu for serif/sans/mono comes from the distro; STIX Two and Latin Modern are fetched below
    for f in /usr/share/fonts/dejavu-*/DejaVu{Sans,Serif,SansMono}{,-Bold,-Oblique,-Italic,-BoldOblique,-BoldItalic}.ttf; do
      if [[ -f $f ]]; then as_user cp "$f" /out/fonts/; fi
    done
  '

# fetch URL FILE: retries network errors (flaky connections can corrupt TLS streams), but not HTTP errors
fetch() {
  local attempt
  for attempt in 1 2 3 4 5 6; do
    local status=0
    curl -sSfL --max-time 120 -o "$2.part" "$1" || status=$?
    if [[ $status -eq 0 ]]; then mv "$2.part" "$2"; return 0; fi
    if [[ $status -eq 22 ]]; then echo "download failed: $1" >&2; return 1; fi
    echo "retrying $1 (curl exit $status)" >&2
    sleep 2
  done
  return 1
}

echo "==> fetching fonts"
mkdir -p "$CACHE/fonts"
STIX=https://raw.githubusercontent.com/stipub/stixfonts/v2.13b171/fonts/static_otf
for f in STIXTwoMath-Regular STIXTwoText-Regular STIXTwoText-Bold STIXTwoText-Italic STIXTwoText-BoldItalic; do
  [[ -f "$CACHE/fonts/$f.otf" ]] || fetch "$STIX/$f.otf" "$CACHE/fonts/$f.otf"
  cp "$CACHE/fonts/$f.otf" "$OUT/fonts/"
done
LM_ZIP="$CACHE/fonts/latinmodern-math.zip"
[[ -f "$LM_ZIP" ]] || fetch https://www.gust.org.pl/projects/e-foundry/lm-math/download/latinmodern-math-1959.zip "$LM_ZIP"
unzip -o -q -j "$LM_ZIP" "*/otf/latinmodern-math.otf" -d "$OUT/fonts"

# the other text fonts offered in the style sidebar, subsetted (see scripts/fonts.py)
"$ROOT/scripts/build-fonts.sh" "$OUT/fonts"

du -sh "$OUT"/*
echo "helium bundle written to $OUT"
