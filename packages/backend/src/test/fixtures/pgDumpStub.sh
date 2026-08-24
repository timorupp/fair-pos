#!/usr/bin/env bash
# Test-only stand-in for the real `pg_dump` binary (not guaranteed to be
# installed in every dev/CI environment — see docs/Installationsanleitung.md).
# Point config.pgDumpPath (env PG_DUMP_PATH) at this script instead.
#
#   PG_DUMP_STUB_FAIL      - optional; when set, exits 1 with a fake error on stderr.
#   PG_DUMP_STUB_LOG_FILE  - optional; if set, appends this invocation's full
#                            argument list (and PGPASSWORD) as one line, so a
#                            test can assert what args/env it was called with.
if [ -n "${PG_DUMP_STUB_LOG_FILE:-}" ]; then
  printf '%s PGPASSWORD=%s\n' "$*" "${PGPASSWORD:-}" >> "$PG_DUMP_STUB_LOG_FILE"
fi

if [ -n "${PG_DUMP_STUB_FAIL:-}" ]; then
  echo "pg_dump: error: connection to server failed" >&2
  exit 1
fi

printf -- '-- fake pg_dump output\nCREATE TABLE example (id int);\n'
exit 0
