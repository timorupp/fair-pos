#!/usr/bin/env bash
# Test-only stand-in for `sudo` (the real one needs an actual sudoers rule
# for the `fairpos` service user — not present in dev/CI, see
# docs/Installationsanleitung.md, "Systemzeit manuell setzen").
# Point config.sudoPath (env SUDO_PATH) at this script instead.
#
#   SUDO_STUB_FAIL      - optional; when set, exits 1 with a fake error on stderr.
#   SUDO_STUB_LOG_FILE  - optional; if set, appends this invocation's full
#                         argument list as one line, so a test can assert
#                         what command it was called with.
if [ -n "${SUDO_STUB_LOG_FILE:-}" ]; then
  printf '%s\n' "$*" >> "$SUDO_STUB_LOG_FILE"
fi

if [ -n "${SUDO_STUB_FAIL:-}" ]; then
  echo "sudo: a password is required" >&2
  exit 1
fi

exit 0
