#!/usr/bin/env bash
# Installs and enables the fairpos systemd service. Idempotent — re-running
# overwrites the unit file with the current repo path and reloads systemd.
#
# Usage: sudo ./04-systemd.sh [service-user]
# service-user defaults to whichever non-root user invoked sudo ($SUDO_USER),
# falling back to the current user if run without sudo.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "error: als root ausführen (sudo ./04-systemd.sh)" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SERVICE_USER="${1:-${SUDO_USER:-$USER}}"
UNIT_FILE="/etc/systemd/system/fairpos.service"

echo "==> Schreibe $UNIT_FILE (User=$SERVICE_USER, WorkingDirectory=$REPO_ROOT/packages/backend)"
cat > "$UNIT_FILE" <<EOF
[Unit]
Description=FairPOS Backend
After=network.target postgresql.service

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$REPO_ROOT/packages/backend
EnvironmentFile=$REPO_ROOT/.env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

echo "==> systemd neu laden, Service aktivieren + starten"
systemctl daemon-reload
systemctl enable --now fairpos

echo "==> Fertig. Status: systemctl status fairpos"
