#!/usr/bin/env bash
# Post-install sanity check — catches a broken deployment before the first
# real Kassiervorgang does. Exits non-zero (with a summary of what failed) if
# any REQUIRED check fails; TSE checks are informational only, since running
# without a configured/reachable TSE is an explicitly supported mode (see
# docs/TSE-Integration.md -> "TSE-Ausfall").
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"
PORT="$(grep -E '^PORT=' "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2-)"
PORT="${PORT:-3000}"
FAILED=0

check() {
  local description="$1"; shift
  if "$@" >/dev/null 2>&1; then
    echo "  [OK]   $description"
  else
    echo "  [FEHLT] $description"
    FAILED=1
  fi
}

echo "==> systemd-Service"
check "fairpos.service ist aktiv" systemctl is-active --quiet fairpos

echo "==> Backend erreichbar"
check "GET /api/health antwortet mit 200" curl -fsS "http://localhost:${PORT}/api/health"

echo "==> Datenbank"
check "PostgreSQL nimmt Verbindungen an (pg_isready)" pg_isready -q -h localhost

echo "==> TSE (informativ — kein Fehler, wenn nicht konfiguriert)"
DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2-)"
TSE_MOUNT_POINT="$(psql "$DATABASE_URL" -tAc "SELECT value FROM system_setting WHERE key = 'tse_mount_point'" 2>/dev/null | tr -d '[:space:]')"
if [ -z "$TSE_MOUNT_POINT" ]; then
  echo "  [INFO] Kein TSE-Mountpunkt in den Systemeinstellungen — normal, falls noch nicht per Admin-UI konfiguriert (siehe docs/Installationsanleitung.md Abschnitt 8.3)."
elif [ ! -d "$TSE_MOUNT_POINT" ]; then
  echo "  [WARNUNG] Konfigurierter TSE-Mountpunkt ($TSE_MOUNT_POINT) existiert nicht — TSE-Signierung wird bis zur Korrektur übersprungen."
else
  echo "  [OK]   Konfigurierter TSE-Mountpunkt ($TSE_MOUNT_POINT) existiert (sagt nichts darüber aus, ob dort tatsächlich eine TSE liegt — siehe Admin-UI-Statusanzeige)."
fi

echo
if [ "$FAILED" -eq 0 ]; then
  echo "Alle Pflicht-Checks bestanden."
else
  echo "Mindestens ein Pflicht-Check ist fehlgeschlagen — siehe oben." >&2
fi
exit "$FAILED"
