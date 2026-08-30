#!/usr/bin/env bash
# Installs dependencies, builds all workspaces, and copies the compiled
# frontend SPA into packages/backend/public/ (where Fastify serves it from —
# see packages/backend/src/app.ts PUBLIC_DIR). Safe to re-run after every
# `git pull` (also used for updates, see docs/Installationsanleitung.md
# Abschnitt 11).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

echo "==> npm ci"
npm ci

echo "==> Build (shared -> backend -> frontend)"
npm run build

echo "==> Frontend-SPA nach packages/backend/public/ kopieren"
rm -rf packages/backend/public
mkdir -p packages/backend/public
cp -r packages/frontend/build/. packages/backend/public/

echo "==> Fertig. Nächster Schritt: npm run db:migrate"
