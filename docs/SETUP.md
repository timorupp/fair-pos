# FairPOS — Setup & Architektur

Dieses Dokument beschreibt Projektstruktur, Entwicklungsumgebung und Deployment.
**Bitte aktualisieren, wenn sich Abhängigkeiten, Skripte oder Architekturentscheidungen ändern.**

---

## Inhaltsverzeichnis

1. [Überblick](#überblick)
2. [Voraussetzungen](#voraussetzungen)
3. [Repository-Struktur](#repository-struktur)
4. [Lokale Entwicklungsumgebung](#lokale-entwicklungsumgebung)
5. [Datenbankmigrationen](#datenbankmigrationen)
6. [Production-Deployment](#production-deployment)
7. [Umgebungsvariablen](#umgebungsvariablen)
8. [TypeScript-Konfiguration](#typescript-konfiguration)
9. [Architekturentscheidungen](#architekturentscheidungen)

---

## Überblick

FairPOS ist ein KassenSichV-konformes Kassensystem für Vereine. Es besteht aus drei
Docker-Containern, die zusammen eine vollständige Kassenlösung bilden:

```
┌──────────────────────────────────────────────────────────────┐
│  Browser (PWA / SPA)                                         │
│  SvelteKit-App, ausgeliefert als statische Dateien           │
└────────────────────────┬─────────────────────────────────────┘
                         │ HTTP
┌────────────────────────▼─────────────────────────────────────┐
│  backend (Node.js · Fastify)                                 │
│  • REST-API unter /api                                       │
│  • Statische SPA-Dateien unter /                             │
│  • Print Worker (PostgreSQL LISTEN/NOTIFY → ESC/POS TCP)     │
└───────────┬──────────────────────────┬───────────────────────┘
            │ pg (node-postgres)       │ HTTP
┌───────────▼──────────┐  ┌───────────▼───────────────────────┐
│  postgres (PG 16)    │  │  fiskaltrust Middleware            │
│  Primärdaten         │  │  TSE-Bridge (Swissbit USB → REST)  │
│  Print-Queue         │  │  Port 1500                         │
└──────────────────────┘  └───────────────────────────────────┘
```

---

## Voraussetzungen

| Tool       | Mindestversion | Zweck                              |
|------------|----------------|------------------------------------|
| Node.js    | 20.x           | Backend + Frontend Build           |
| npm        | 10.x           | Paketmanager (Workspaces)          |
| Docker     | 24.x           | PostgreSQL + fiskaltrust           |
| Docker Compose | V2 (Plugin) | `docker compose` (ohne Bindestrich) |

Für die Produktion wird kein lokales Node.js benötigt — nur Docker.

---

## Repository-Struktur

```
club-pos/
├── package.json                  # Root-Workspace, gemeinsame Skripte
├── tsconfig.base.json            # Gemeinsame TS-Optionen für alle Pakete
├── docker-compose.yml            # Produktions-Stack (3 Container)
├── docker-compose.dev.yml        # Dev-Overrides (nur PG + fiskaltrust)
├── .env.example                  # Vorlage für Umgebungsvariablen
├── fiskaltrust/
│   └── config/                   # fiskaltrust-Konfiguration (Volume-Mount)
│
├── packages/
│   ├── shared/                   # @fairpos/shared — geteilte TypeScript-Typen
│   │   └── src/types.ts          # Alle Domain-Typen (OrderItemStatus, Invoice …)
│   │
│   ├── backend/                  # @fairpos/backend — Fastify API + Print Worker
│   │   ├── Dockerfile            # 3-Stage-Build (frontend → backend → prod)
│   │   └── src/
│   │       ├── index.ts          # Einstiegspunkt: Migrate → Server → Print Worker
│   │       ├── app.ts            # Fastify-Factory, Plugins, Routing
│   │       ├── config.ts         # Umgebungsvariablen (Pflichtfelder geprüft)
│   │       ├── routes/
│   │       │   └── health.ts     # GET /api/health
│   │       ├── workers/
│   │       │   └── print-worker.ts  # LISTEN/NOTIFY → ESC/POS über TCP
│   │       └── db/
│   │           ├── client.ts     # pg.Pool, query(), withTransaction()
│   │           ├── migrate.ts    # Migrations-Runner (schema_migrations-Tabelle)
│   │           └── migrations/
│   │               └── 0001_initial.sql  # Vollständiges Datenbankschema
│   │
│   └── frontend/                 # @fairpos/frontend — SvelteKit SPA
│       ├── svelte.config.js      # adapter-static, fallback: index.html
│       ├── vite.config.ts        # Dev-Proxy /api → localhost:3000
│       └── src/
│           ├── app.html          # HTML-Rahmen (lang="de")
│           ├── app.d.ts          # SvelteKit App-Typen
│           └── routes/
│               ├── +layout.svelte
│               └── +page.svelte  # Startseite (Platzhalter)
│
├── Anforderungen.md              # Fachliche Anforderungen
├── Datenmodell.dbml              # Datenmodell (dbdiagram.io)
├── Dictionary.md                 # Deutsch ↔ Englisch Übersetzungsreferenz
└── SETUP.md                      # Dieses Dokument
```

---

## Lokale Entwicklungsumgebung

### 1. Repository einrichten

```bash
cp .env.example .env
# .env anpassen: Passwörter setzen, DATABASE_URL auf localhost zeigen lassen
```

Für die lokale Entwicklung muss `DATABASE_URL` den Postgres-Container auf
`localhost` ansprechen (nicht `postgres`):

```env
DATABASE_URL=postgresql://fairpos:changeme@localhost:5432/fairpos
TSE_MIDDLEWARE_URL=http://localhost:1500
```

### 2. Infrastruktur starten

Nur PostgreSQL und fiskaltrust laufen in Docker; das Backend läuft lokal.

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

### 3. Abhängigkeiten installieren

```bash
npm install
```

Das Root-`npm install` installiert alle Workspaces (`packages/shared`,
`packages/backend`, `packages/frontend`) gleichzeitig.

### 4. Datenbank migrieren

```bash
npm run db:migrate
```

Führt alle noch nicht angewendeten `.sql`-Dateien aus `packages/backend/src/db/migrations/`
aus und protokolliert sie in der Tabelle `schema_migrations`.

### 5. Entwicklungsserver starten

```bash
npm run dev
```

Startet Backend und Frontend gleichzeitig via `concurrently`:

| Prozess  | Port | Beschreibung                          |
|----------|------|---------------------------------------|
| backend  | 3000 | Fastify API, tsx watch (Hot-Reload)   |
| frontend | 5173 | Vite Dev-Server mit /api-Proxy        |

Im Browser: `http://localhost:5173` (Vite-Dev-Server mit Hot-Reload)

---

## Datenbankmigrationen

### Prinzip

- Alle Migrationen liegen als nummerierte `.sql`-Dateien in  
  `packages/backend/src/db/migrations/` (z.B. `0001_initial.sql`).
- Beim Start von `runMigrations()` wird geprüft, welche Dateien noch nicht in
  `schema_migrations` eingetragen sind. Nur diese werden ausgeführt.
- Jede Migration läuft in einer eigenen Transaktion — bei einem Fehler wird
  alles zurückgerollt; die Datei erscheint nicht in `schema_migrations`.
- Bestehende Migrationen dürfen **nicht** nachträglich geändert werden.
  Korrekturen immer als neue Migrationsdatei.

### Neue Migration hinzufügen

```bash
# Dateinamen alphabetisch nach letzter Datei wählen
packages/backend/src/db/migrations/0002_add_column_xyz.sql
```

```sql
-- Beschreibung was und warum
ALTER TABLE some_table ADD COLUMN new_col TEXT;
```

```bash
npm run db:migrate
```

### Ausführungszeitpunkte

| Kontext        | Auslöser                         |
|----------------|----------------------------------|
| Entwicklung    | `npm run db:migrate` (manuell)   |
| Production     | Automatisch beim Serverstart     |

Im Production-Bild ruft `index.ts` beim Hochfahren `runMigrations()` auf,
bevor der HTTP-Server lauscht.

---

## Production-Deployment

### Build & Start

```bash
# Einmalig oder nach Änderungen
cp .env.example .env   # Produktionswerte eintragen

docker compose build
docker compose up -d
```

Die Anwendung ist dann unter `http://<server-ip>:3000` erreichbar.

### Docker-Image (3-Stage-Build)

Das `packages/backend/Dockerfile` baut in drei Stufen:

| Stage              | Basis            | Ergebnis                          |
|--------------------|------------------|-----------------------------------|
| `frontend-builder` | node:20-alpine   | SvelteKit-Build (`/build`)        |
| `backend-builder`  | node:20-alpine   | TypeScript-Kompilat (`/dist`)     |
| Production         | node:20-alpine   | Nur Runtime-Artefakte, kein `src` |

Im finalen Image enthält `/app/dist` das Backend-Kompilat und `/app/public`
die kompilierten Frontend-Dateien (von Fastify als Static Files ausgeliefert).

### fiskaltrust TSE-Anbindung

```
TODO: Exakten Image-Namen und Konfiguration vor dem ersten Produktivbetrieb prüfen.
```

- Das fiskaltrust-Middleware-Image (`fiskaltrust/middleware:latest`) muss das
  Swissbit-USB-Gerät als Device-Passthrough erhalten.
- In `docker-compose.yml` ist `/dev/bus/usb` gemappt — ggf. auf den
  tatsächlichen USB-Pfad des Hostsystems anpassen.
- Die Middleware-Konfiguration liegt im Volume-Mount `./fiskaltrust/config`.
- `TSE_MIDDLEWARE_URL` zeigt auf den Container (`http://fiskaltrust:1500`).

---

## Umgebungsvariablen

Alle Variablen werden aus `.env` geladen (Docker env_file). Pflichtfelder,
die beim Backend-Start fehlen, führen zu einem sofortigen Fehler.

| Variable             | Pflicht | Standardwert              | Beschreibung                         |
|----------------------|---------|---------------------------|--------------------------------------|
| `POSTGRES_USER`      | ja      | —                         | DB-Benutzer (für Docker)             |
| `POSTGRES_PASSWORD`  | ja      | —                         | DB-Passwort (für Docker)             |
| `POSTGRES_DB`        | ja      | —                         | DB-Name (für Docker)                 |
| `DATABASE_URL`       | ja      | —                         | PostgreSQL-Connection-String         |
| `SESSION_SECRET`     | ja      | —                         | Signierungsschlüssel für Cookies     |
| `PORT`               | nein    | `3000`                    | HTTP-Port des Backends               |
| `NODE_ENV`           | nein    | `development`             | `development` oder `production`      |
| `TSE_MIDDLEWARE_URL` | nein    | `http://localhost:1500`   | URL der fiskaltrust Middleware       |

`SESSION_SECRET` sollte mindestens 32 zufällige Zeichen enthalten.
Generieren z.B. mit: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

---

## TypeScript-Konfiguration

Alle Pakete erben von `tsconfig.base.json` im Root:

| Option                        | Wert        | Bedeutung                                    |
|-------------------------------|-------------|----------------------------------------------|
| `target`                      | ES2022      | Moderne JS-Features, kein Downcompiling       |
| `module`                      | NodeNext    | Native ESM mit `.js`-Imports                 |
| `moduleResolution`            | NodeNext    | Passend zu `module: NodeNext`                |
| `strict`                      | true        | Alle strict-Checks aktiv                     |
| `exactOptionalPropertyTypes`  | true        | `undefined` ≠ optional                       |
| `noUncheckedIndexedAccess`    | true        | Array/Object-Zugriff gibt `T | undefined`    |

Das Frontend (`packages/frontend`) überschreibt `moduleResolution: bundler`
(Vite/SvelteKit benötigt dies) und setzt `noEmit: true`.

---

## Architekturentscheidungen

### Monorepo mit npm Workspaces

Drei Pakete in einem Repository: `shared`, `backend`, `frontend`. Das
`shared`-Paket wird von Backend und Frontend als lokale Abhängigkeit eingebunden
(`"@fairpos/shared": "*"`) — kein separates npm-Publish notwendig.

### SPA statt SSR

SvelteKit mit `adapter-static` erzeugt eine reine Client-Side-App (SPA).
Das Backend serviert `index.html` als Fallback für alle Nicht-API-Routen.
Vorteil: einfacheres Deployment, kein Node.js-Rendering-Prozess für das Frontend.

### Kein ORM

Direktes SQL via `node-postgres` (`pg`). Der benutzerdefinierte Migrations-Runner
in `migrate.ts` liest `.sql`-Dateien aus dem `migrations/`-Ordner und
protokolliert erledigte Migrationen in `schema_migrations`.

### Print Worker im Backend-Prozess

Der Print Worker ist kein separater Service, sondern läuft im gleichen
Node.js-Prozess wie die REST-API. Er hält eine dauerhafte `pg.Client`-Verbindung
mit `LISTEN print_job_new`. PostgreSQL sendet bei jedem `INSERT` in `print_job`
eine Benachrichtigung via Trigger + `pg_notify`. Der Worker schickt ESC/POS-Daten
direkt über eine TCP-Verbindung an den Drucker.

### Keine WebSockets — SSE für Echtzeit

Für Echtzeit-Updates (z.B. Tischstatus-Aktualisierungen im Browser) werden
Server-Sent Events (SSE) eingesetzt. SSE ist unidirektional (Server → Client),
einfacher als WebSockets und ausreichend für diesen Anwendungsfall.

### fiskaltrust als Docker-Image

Die TSE-Anbindung erfolgt über die fiskaltrust Middleware, die als
Docker-Container läuft und die Swissbit USB-TSE über ein Device-Passthrough
anspricht. Das Backend kommuniziert über REST mit der Middleware. Kein Java
oder proprietäres SDK im Backend-Code notwendig.
