#!/usr/bin/env bash
# Builds the FairPOS TSE CLI tool (tseCli) against the vendored Swissbit SDK.
#
# Prerequisite: the SDK files listed in vendor/PLACE_SDK_FILES_HERE.txt must
# already be in place (they are gitignored — not part of this repo).
#
# Usage: ./build.sh
# Output: vendor/bin/tseCli (gitignored build artifact)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENDOR_DIR="$SCRIPT_DIR/vendor"
INCLUDE_DIR="$VENDOR_DIR/include"
LIB_DIR="$VENDOR_DIR/lib"
BIN_DIR="$VENDOR_DIR/bin"
SRC_FILE="$SCRIPT_DIR/src/tseCli.cpp"
OUT_FILE="$BIN_DIR/tseCli"

if [ ! -f "$INCLUDE_DIR/WormDLL/WormDLL.h" ] || [ ! -f "$LIB_DIR/libWormAPI.so" ]; then
  echo "error: Swissbit SDK files not found under $VENDOR_DIR" >&2
  echo "       see $VENDOR_DIR/PLACE_SDK_FILES_HERE.txt for what to copy there." >&2
  exit 1
fi

mkdir -p "$BIN_DIR"

g++ -std=c++11 -O2 -Wall -Wextra \
  -I"$INCLUDE_DIR" \
  -L"$LIB_DIR" \
  -Wl,-rpath,'$ORIGIN' \
  -o "$OUT_FILE" \
  "$SRC_FILE" \
  -lWormAPI

# The binary looks for libWormAPI.so next to itself at runtime (via the rpath
# set above), so copy it alongside — avoids having to configure
# LD_LIBRARY_PATH system-wide just to run this one tool.
cp "$LIB_DIR/libWormAPI.so" "$BIN_DIR/"

echo "Built $OUT_FILE"
