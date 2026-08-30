#!/usr/bin/env bash
# Creates the PostgreSQL role and database used by FairPOS, reading the
# credentials from .env at the repo root. Idempotent — safe to re-run (skips
# creation if the role/database already exist).
#
# Run this AFTER filling in .env (see docs/Installationsanleitung.md
# Abschnitt 4) and AFTER 01-system.sh.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "error: $ENV_FILE fehlt — erst 'cp .env.example .env' und Werte eintragen." >&2
  exit 1
fi

# Only the three POSTGRES_* keys are needed here; export just those instead of
# sourcing the whole file (which may contain values with characters bash
# would otherwise try to interpret).
POSTGRES_USER="$(grep -E '^POSTGRES_USER=' "$ENV_FILE" | tail -1 | cut -d= -f2-)"
POSTGRES_PASSWORD="$(grep -E '^POSTGRES_PASSWORD=' "$ENV_FILE" | tail -1 | cut -d= -f2-)"
POSTGRES_DB="$(grep -E '^POSTGRES_DB=' "$ENV_FILE" | tail -1 | cut -d= -f2-)"

if [ -z "$POSTGRES_USER" ] || [ -z "$POSTGRES_PASSWORD" ] || [ -z "$POSTGRES_DB" ]; then
  echo "error: POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB müssen in $ENV_FILE gesetzt sein." >&2
  exit 1
fi

echo "==> Rolle '$POSTGRES_USER' anlegen (falls nicht vorhanden)"
ROLE_EXISTS="$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$POSTGRES_USER'")"
if [ "$ROLE_EXISTS" != "1" ]; then
  sudo -u postgres psql -c "CREATE ROLE \"$POSTGRES_USER\" WITH LOGIN PASSWORD '$POSTGRES_PASSWORD';"
else
  echo "    Rolle existiert bereits, übersprungen"
fi

echo "==> Datenbank '$POSTGRES_DB' anlegen (falls nicht vorhanden)"
DB_EXISTS="$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$POSTGRES_DB'")"
if [ "$DB_EXISTS" != "1" ]; then
  sudo -u postgres psql -c "CREATE DATABASE \"$POSTGRES_DB\" OWNER \"$POSTGRES_USER\";"
else
  echo "    Datenbank existiert bereits, übersprungen"
fi

echo "==> Fertig."
