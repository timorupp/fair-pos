#!/usr/bin/env bash
# Test-only stand-in for native/tse-cli/vendor/bin/tseCli (which is gitignored
# and needs real TSE hardware to do anything useful). Unit tests point
# TSE_CLI_PATH at this script instead, and control its output via env vars:
#   TSE_STUB_STDOUT           - exact string to print on stdout (default: a generic success envelope)
#   TSE_STUB_EXIT_CODE        - process exit code to return (default: 0)
#   TSE_STUB_LOG_FILE         - optional; if set, appends this invocation's full
#                               argument list as one line, so a test can assert
#                               how many times the CLI was called and with what args.
#   TSE_STUB_FAIL_EXCEPT_ABORT - optional; when set, ignores TSE_STUB_STDOUT/EXIT_CODE
#                               and instead: succeeds for `start` and for any
#                               `finish` whose processData (base64-decoded)
#                               starts with `AVBelegabbruch` (the cleanup
#                               call's payload — see tse/processData.ts
#                               buildAvBelegabbruchProcessData; the processType
#                               for that call is Kassenbeleg-V1, same as a
#                               normal finish, so it can't be used to tell
#                               them apart), fails for every other `finish`.
#                               Lets tests exercise "start succeeds, finish
#                               fails, the AVBelegabbruch cleanup call succeeds".
#   TSE_STUB_FAIL_ALL_FINISH  - optional; when set, ignores TSE_STUB_STDOUT/EXIT_CODE
#                               and instead: succeeds for `start`, fails for
#                               EVERY `finish` call regardless of processType.
#                               Lets tests exercise "the AVBelegabbruch cleanup
#                               call also fails".
if [ -n "${TSE_STUB_LOG_FILE:-}" ]; then
  printf '%s\n' "$*" >> "$TSE_STUB_LOG_FILE"
fi

if [ -n "${TSE_STUB_FAIL_EXCEPT_ABORT:-}" ]; then
  command="$2"
  process_data_b64="$6"
  process_data=$(printf '%s' "$process_data_b64" | base64 -d 2>/dev/null)
  case "$process_data" in
    AVBelegabbruch*) is_abort=1 ;;
    *) is_abort=0 ;;
  esac
  if [ "$command" = "finish" ] && [ "$is_abort" -ne 1 ]; then
    printf '%s' '{"ok":false,"error":{"code":1,"message":"boom"}}'
    exit 1
  fi
  printf '%s' '{"ok":true,"result":{"transactionNumber":1,"signatureCounter":1,"logTime":1735689600,"signature":"aa","serialNumber":"bb"}}'
  exit 0
fi

if [ -n "${TSE_STUB_FAIL_ALL_FINISH:-}" ]; then
  command="$2"
  if [ "$command" = "finish" ]; then
    printf '%s' '{"ok":false,"error":{"code":1,"message":"boom"}}'
    exit 1
  fi
  printf '%s' '{"ok":true,"result":{"transactionNumber":1,"signatureCounter":1,"logTime":1735689600,"signature":"aa","serialNumber":"bb"}}'
  exit 0
fi

# Uses an if/printf instead of `${VAR:-default}` because the default JSON
# value contains unbalanced-looking braces that bash's parameter-expansion
# syntax cannot parse correctly inline.
if [ -n "${TSE_STUB_STDOUT:-}" ]; then
  printf '%s' "$TSE_STUB_STDOUT"
else
  printf '%s' '{"ok":true,"result":{}}'
fi
exit "${TSE_STUB_EXIT_CODE:-0}"
