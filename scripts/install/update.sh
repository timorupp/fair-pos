#!/usr/bin/env bash
# Runs the full update sequence from docs/Installationsanleitung.md Abschnitt
# 12: pull, rebuild, migrate, restart, then smoke-test. Idempotent — safe to
# re-run even if nothing changed (git pull is a no-op, db:migrate skips
# already-applied migrations).
#
# Run as root (sudo ./update.sh) from ANY account — the script determines the
# actual service user (the account that owns the checkout and runs the
# backend, see Abschnitt 4) by reading it back out of the installed systemd
# unit, and runs git/npm/build/migrate as that user via `sudo -u`, so files
# in the checkout don't end up root-owned. Only the final `systemctl
# restart` genuinely needs root.
#
# Usage: sudo ./scripts/install/update.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "error: als root ausführen (sudo ./update.sh)" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
UNIT_FILE="/etc/systemd/system/fairpos.service"

if [ -f "$UNIT_FILE" ]; then
  SERVICE_USER="$(grep -E '^User=' "$UNIT_FILE" | head -1 | cut -d= -f2-)"
else
  SERVICE_USER="fairpos"
fi

if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  echo "error: Service-User '$SERVICE_USER' existiert nicht (aus $UNIT_FILE gelesen, falls vorhanden)" >&2
  exit 1
fi

run_as_service_user() {
  sudo -u "$SERVICE_USER" -H bash -lc "cd '$REPO_ROOT' && $1"
}

echo "==> git pull (als $SERVICE_USER)"
run_as_service_user "git pull"

echo "==> npm ci (als $SERVICE_USER)"
# --prefer-offline: vertraut dem lokalen npm-Cache, statt bei jedem der
# gut 500 Pakete erst eine Registry-Anfrage abzuwarten — auf einer
# latenzreichen Veranstaltungs-Internetverbindung (z. B. mobiler Hotspot)
# macht das den Unterschied zwischen Sekunden und mehreren Minuten pro
# Update, wenn sich package-lock.json ohnehin nicht geändert hat.
run_as_service_user "npm ci --prefer-offline"

echo "==> Build (als $SERVICE_USER)"
run_as_service_user "npm run build"

echo "==> Frontend-SPA nach packages/backend/public/ kopieren (als $SERVICE_USER)"
run_as_service_user "rm -rf packages/backend/public && mkdir -p packages/backend/public && cp -r packages/frontend/build/. packages/backend/public/"

echo "==> Datenbank migrieren (als $SERVICE_USER)"
run_as_service_user "npm run db:migrate"

echo "==> Service neu starten"
systemctl restart fairpos

echo "==> Smoke-Test"
"$SCRIPT_DIR/smoke-test.sh"
