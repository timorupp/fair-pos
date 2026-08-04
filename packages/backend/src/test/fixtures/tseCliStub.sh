#!/usr/bin/env bash
# Test-only stand-in for native/tse-cli/vendor/bin/tseCli (which is gitignored
# and needs real TSE hardware to do anything useful). Unit tests point
# TSE_CLI_PATH at this script instead, and control its output via env vars:
#   TSE_STUB_STDOUT    - exact string to print on stdout (default: a generic success envelope)
#   TSE_STUB_EXIT_CODE - process exit code to return (default: 0)
#
# Uses an if/printf instead of `${VAR:-default}` because the default JSON
# value contains unbalanced-looking braces that bash's parameter-expansion
# syntax cannot parse correctly inline.
if [ -n "${TSE_STUB_STDOUT:-}" ]; then
  printf '%s' "$TSE_STUB_STDOUT"
else
  printf '%s' '{"ok":true,"result":{}}'
fi
exit "${TSE_STUB_EXIT_CODE:-0}"
