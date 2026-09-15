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
# --ignore-scripts + gezieltes `npm rebuild esbuild` (D-070, 2026-09-12):
# `testcontainers` (nur für Integrationstests) zieht über dockerode/
# docker-modem das Paket `ssh2` mit, dessen native Crypto-Beschleunigung
# (`cpu-features`) sonst bei jedem `npm ci` per node-gyp aus C-Quellcode
# neu gebaut wird — auf schwächerer Hardware 20-30+ Minuten, obwohl im
# Produktivbetrieb nie benötigt (ssh2 fällt ohne den nativen Build auf
# reines JavaScript zurück). Einzige Ausnahme: `esbuild` (für den
# Frontend-Build nötig) braucht sein install-Skript, wird deshalb gezielt
# nachgeholt.
npm ci --ignore-scripts
npm rebuild esbuild

echo "==> Build (shared -> backend -> frontend)"
npm run build

echo "==> tseCli neu bauen"
# Eigener Schritt, weil er nicht Teil von "npm run build" ist (C++, kein
# npm-Workspace) — sonst bleibt die Binary nach einem `git pull` unbemerkt
# auf dem alten Stand, auch wenn sich tseCli.cpp geändert hat.
packages/backend/native/tse-cli/build.sh

echo "==> Frontend-SPA nach packages/backend/public/ kopieren"
rm -rf packages/backend/public
mkdir -p packages/backend/public
cp -r packages/frontend/build/. packages/backend/public/

echo "==> Fertig. Nächster Schritt: npm run db:migrate"
