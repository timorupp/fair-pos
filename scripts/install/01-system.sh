#!/usr/bin/env bash
# Installs Node.js 20 (NodeSource) and PostgreSQL 16 (PGDG) plus the build
# tools needed for native/tse-cli. Idempotent — safe to re-run.
#
# See docs/Installationsanleitung.md Abschnitt 1–3 for the manual version of
# these same steps.
set -euo pipefail

echo "==> Build-Tools (build-essential, g++)"
sudo apt-get update -qq
sudo apt-get install -y -qq curl ca-certificates gnupg build-essential g++

echo "==> PostgreSQL 16 (PGDG-APT-Repo)"
if ! command -v psql >/dev/null 2>&1 || ! psql --version | grep -q ' 16\.'; then
  sudo install -d /usr/share/postgresql-common/pgdg
  if [ ! -f /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc ]; then
    curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
      https://www.postgresql.org/media/keys/ACCC4CF8.asc
  fi
  if [ ! -f /etc/apt/sources.list.d/pgdg.list ]; then
    echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
      | sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
  fi
  sudo apt-get update -qq
  sudo apt-get install -y -qq postgresql-16
else
  echo "    postgresql-16 bereits installiert, übersprungen"
fi

echo "==> Node.js 20 (NodeSource)"
if ! command -v node >/dev/null 2>&1 || [ "$(node --version | cut -c2-3)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y -qq nodejs
else
  echo "    Node.js $(node --version) bereits installiert, übersprungen"
fi

echo "==> Fertig. node: $(node --version), psql: $(psql --version)"
