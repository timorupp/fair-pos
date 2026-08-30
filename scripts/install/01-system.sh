#!/usr/bin/env bash
# Installs Node.js 20 (NodeSource) and PostgreSQL (distro default package)
# plus the build tools needed for native/tse-cli. Idempotent — safe to re-run.
#
# See docs/Installationsanleitung.md Abschnitt 1–3 for the manual version of
# these same steps.
set -euo pipefail

echo "==> Build-Tools (build-essential, g++)"
sudo apt-get update -qq
sudo apt-get install -y -qq curl ca-certificates gnupg build-essential g++

echo "==> PostgreSQL (Ubuntu-Standardpaket)"
if ! command -v psql >/dev/null 2>&1; then
  sudo apt-get install -y -qq postgresql
else
  echo "    postgresql bereits installiert ($(psql --version)), übersprungen"
fi

echo "==> Node.js 20 (NodeSource)"
if ! command -v node >/dev/null 2>&1 || [ "$(node --version | cut -c2-3)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y -qq nodejs
else
  echo "    Node.js $(node --version) bereits installiert, übersprungen"
fi

echo "==> Fertig. node: $(node --version), psql: $(psql --version)"
