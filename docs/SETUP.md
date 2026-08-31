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

FairPOS ist ein KassenSichV-konformes Kassensystem für Vereine. Es besteht aus
einem nativen Node.js-Backend, PostgreSQL (in Produktion ebenfalls nativ, in
der Entwicklung bequem in Docker) und einer direkt angeschlossenen Swissbit
USB-TSE — keine Container in Produktion, keine dritte Middleware-Komponente:

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
│  • TSE-Anbindung: ruft native/tse-cli als Subprozess auf     │
│    (kein separater Dienst — siehe docs/TSE-Integration.md)   │
└───────────┬──────────────────────────┬───────────────────────┘
            │ pg (node-postgres)       │ Dateisystem (Mount-Punkt)
┌───────────▼──────────┐  ┌───────────▼───────────────────────┐
│  postgres (PG 18)    │  │  Swissbit USB-TSE                  │
│  Primärdaten         │  │  als Dateisystem gemountet,         │
│  Print-Queue         │  │  kein Container                     │
└──────────────────────┘  └───────────────────────────────────┘
```

---

## Voraussetzungen

| Tool       | Mindestversion | Zweck                              |
|------------|----------------|------------------------------------|
| Node.js    | 20.x           | Backend + Frontend, Entwicklung UND Produktion |
| npm        | 10.x           | Paketmanager (Workspaces)          |
| PostgreSQL | 16.x+          | Produktion: natives Ubuntu-Standardpaket, keine Major-Version gepinnt (siehe `docs/Installationsanleitung.md`); Dev/Test aktuell auf 18.x |
| Docker + Docker Compose (V2, Plugin) | 24.x | **Nur Entwicklung** — startet ausschließlich PostgreSQL, siehe `docker-compose.yml` |
| g++ (C++11) | —             | Nur für den TSE-CLI-Build, siehe docs/TSE-Integration.md Abschnitt 10 |

Produktion läuft komplett nativ auf Ubuntu (Node.js-Prozess + PostgreSQL +
`tseCli`), **kein Docker**. Für echte TSE-Hardware-Tests während der
Entwicklung wird zusätzlich ein natives Linux-Hostsystem benötigt (siehe
Abschnitt „TSE-Hardware-Tests" unten) — WSL2 kann USB-Geräte nicht ohne
Weiteres durchreichen.

---

## Repository-Struktur

Illustrativ, nicht erschöpfend — `routes/admin/` allein hat inzwischen über
25 Dateien (eine je Verwaltungsbereich: Artikel, Kassen, Benutzer,
Veranstaltungen, Berichte, Exporte, Einstellungen, TSE, …), nicht einzeln
aufgeführt:

```
club-pos/
├── package.json                  # Root-Workspace, gemeinsame Skripte
├── tsconfig.base.json            # Gemeinsame TS-Optionen für alle Pakete
├── docker-compose.yml            # NUR Entwicklung — startet PostgreSQL (kein Docker in Produktion)
├── .env.example                  # Vorlage für Umgebungsvariablen
│
├── packages/
│   ├── shared/                   # @fairpos/shared — geteilte TypeScript-Typen
│   │   └── src/types.ts          # Alle Domain-Typen (OrderItemStatus, Invoice, User, Event …)
│   │
│   ├── backend/                  # @fairpos/backend — Fastify API + Print Worker
│   │   ├── native/tse-cli/       # Minimaler C++-Wrapper um das Swissbit-SDK
│   │   │   ├── src/tseCli.cpp    # CLI, vom Backend als Subprozess aufgerufen
│   │   │   ├── build.sh          # Kompiliert gegen die vendorten SDK-Dateien
│   │   │   └── vendor/           # gitignored — SDK-Header/-Lib + gebaute Binary,
│   │   │                         # siehe vendor/PLACE_SDK_FILES_HERE.txt
│   │   └── src/
│   │       ├── index.ts          # Einstiegspunkt: Migrate → ensureSystemSerial →
│   │       │                     #   initReceiptCounter → Server → Print Worker →
│   │       │                     #   TSE-Health-Job
│   │       ├── app.ts            # Fastify-Factory, Plugins, Routing
│   │       ├── config.ts         # Umgebungsvariablen (Pflichtfelder geprüft)
│   │       ├── auth/             # Passwort-/PIN-Hashing, Sessions (Task #90)
│   │       ├── backup/           # Datenbank-Backup-Erstellung (pg_dump-Wrapper)
│   │       ├── closing/          # Tagesabschluss (Z-Bon)-Berechnung + PDF/ESC-POS-Rendering
│   │       ├── exports/          # Excel-, DSFinV-K- und Rechnungs-PDF-ZIP-Export
│   │       ├── logo/             # Firmenlogo-Upload/-Verarbeitung für Bons/Z-Bons
│   │       ├── middleware/       # authenticateRegister/authenticateAdmin/
│   │       │                     #   authenticateSystemAdmin (Task #94)
│   │       ├── order/            # Reine Hilfsfunktionen für Bestell-Gruppierung
│   │       ├── print/            # ESC/POS-Rendering, Druckauftrags-Enqueue
│   │       ├── receipt/          # Belegnummer, Rechnungsdaten-Assemblierung, PDF/ESC-POS
│   │       ├── system/           # Aktive Veranstaltung (activeEvent.ts, Task #95),
│   │       │                     #   Systemzeit/-zone, IP-Sperren
│   │       ├── routes/
│   │       │   ├── health.ts     # GET /api/health
│   │       │   ├── auth.ts       # PIN-Login, Systemverwaltung-Stufenauth
│   │       │   ├── register-session.ts  # Bonkasse-/Bedienungskasse-Endpunkte
│   │       │   └── admin/        # ~25 Dateien, je ein Verwaltungsbereich
│   │       │                     #   (articles.ts, registers.ts, users.ts,
│   │       │                     #   events.ts, reports.ts, exports.ts, …)
│   │       ├── tse/              # TSE-Client (queue.ts, client.ts, settings.ts, …)
│   │       │                     # siehe docs/TSE-Integration.md
│   │       ├── workers/
│   │       │   └── print-worker.ts  # LISTEN/NOTIFY → ESC/POS über TCP
│   │       └── db/
│   │           ├── client.ts     # pg.Pool, query(), withTransaction()
│   │           ├── migrate.ts    # Migrations-Runner (schema_migrations-Tabelle)
│   │           └── migrations/
│   │               ├── 0001_initial.sql   # Basisschema
│   │               └── …                  # fortlaufend nummeriert, aktuell bis 0026
│   │
│   └── frontend/                 # @fairpos/frontend — SvelteKit SPA
│       ├── svelte.config.js      # adapter-static, fallback: index.html
│       ├── vite.config.ts        # Dev-Proxy /api → localhost:3000
│       └── src/
│           ├── app.html          # HTML-Rahmen (lang="de")
│           ├── app.d.ts          # SvelteKit App-Typen
│           └── routes/
│               ├── login/        # PIN-Eingabe (einziger Login-Weg, Task #90)
│               ├── register/     # Kassenauswahl + Bonkasse-/Bedienungskasse-UI
│               └── admin/        # Administrationsoberfläche
│                   ├── +layout.svelte  # Seitenleiste (5 Gruppen, Task #98-Umbau),
│                   │                   #   aktive-Veranstaltung-Kontext
│                   └── +page.svelte    # Dashboard
│
└── docs/
    ├── Anforderungen.md               # Fachliche Anforderungen
    ├── Datenmodell.dbml               # Datenmodell (dbdiagram.io)
    ├── Dictionary.md                  # Deutsch ↔ Englisch Übersetzungsreferenz
    ├── SETUP.md                       # Dieses Dokument
    ├── Installationsanleitung.md      # Schritt-für-Schritt-Produktionsinstallation
    ├── TSE-Integration.md             # TSE-Architekturkonzept (CLI-Subprozess, Vendoring, Lifecycle)
    ├── Rechtliche-Anforderungen.md    # KassenSichV-/GoBD-Vorgaben
    ├── Organisatorische-Anleitung.md  # Betriebsabläufe für den Verein
    └── Manueller-Testplan.md          # Checkliste für den manuellen Regressionstest
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
```

Die TSE-Konfiguration (Mount-Pfad, Client-ID) gibt es nur über die Admin-UI
(Einstellungen → System) — kein `.env`-Pendant. Ohne physische TSE
(lokale Entwicklung, CI) einfach unkonfiguriert lassen; das Backend
überspringt die Signierung dann und lässt die `tse_*`-Spalten der Rechnung
`null`. Siehe docs/TSE-Integration.md.

### 2. Infrastruktur starten

Nur PostgreSQL läuft in Docker; das Backend läuft lokal.

```bash
docker compose up -d
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

**Keine Containerisierung.** Backend und Frontend laufen als nativer
Node.js-Prozess direkt auf einem dedizierten Ubuntu-Server, PostgreSQL nativ
über das Ubuntu-Standardpaket installiert (kein Docker, keine Major-Version
gepinnt — siehe `docs/Installationsanleitung.md` Abschnitt 2). Grund: der einzige Punkt,
an dem Docker hier echten Mehraufwand verursacht hätte, ist die
Swissbit-USB-TSE — ein Container hätte Bind-Mount-Propagation für
hot-plug-fähige USB-Hardware benötigt (`rslave`), nur um ein Problem zu lösen,
das auf einem einzelnen dedizierten Server ohne Skalierungsbedarf gar nicht
existiert, wenn der Node-Prozess direkt auf dem Host läuft. Die vollständige,
schrittweise Installationsanleitung (Postgres-Setup, systemd-Unit,
Berechtigungen für den TSE-Mountpunkt, Automatisierungsskripte) steht in
`docs/Installationsanleitung.md`.

Kurzfassung für alle, die die Anleitung schon kennen:

```bash
npm ci
npm run build -w packages/shared
npm run build -w packages/backend
npm run build -w packages/frontend
cp packages/frontend/build/* packages/backend/public/ -r   # siehe Installationsanleitung für den genauen Schritt
npm run db:migrate -w packages/backend
```

Danach startet ein systemd-Service `node packages/backend/dist/index.js`
(Details, inkl. Unit-Datei-Vorlage: `docs/Installationsanleitung.md`). Die
Anwendung ist dann unter `http://<server-ip>:3000` erreichbar.

**Lokale Entwicklung** nutzt weiterhin `docker-compose.yml`, aber
ausschließlich für PostgreSQL (siehe oben, Abschnitt "Lokale
Entwicklungsumgebung") — Backend/Frontend laufen dort wie in Produktion nativ
via `npm run dev`.

### Swissbit USB-TSE-Anbindung

Kein Container, keine Middleware — das Backend ruft
`packages/backend/native/tse-cli` als Subprozess auf. Details (Architektur,
Concurrency-Modell, Vendoring, Lifecycle) stehen vollständig in
docs/TSE-Integration.md; hier nur das Deployment-relevante:

- Die TSE muss auf dem Host als Dateisystem gemountet sein, bevor die
  Signierung genutzt werden kann — der Node-Prozess liest/schreibt direkt auf
  diesem Pfad, kein Container-Mapping dazwischen.
- Mount-Pfad und Client-ID werden ausschließlich über Einstellungen →
  System in der Admin-UI konfiguriert (inkl. "Auto-erkennen"-Button, der die
  TSE unter den aktuell gemounteten Wechseldatenträgern findet — kein
  manuelles Pfad-Tippen nötig) — es gibt bewusst kein `.env`-Pendant mehr
  dafür. Beide Werte wirken sofort, ohne Neustart.
- Die Client-ID ist ein frei wählbarer Bezeichner für diese Kasse (z.B.
  `FairPOS-1`) — muss bei der einmaligen TSE-Inbetriebnahme (`setup`)
  registriert werden.
- Der (laut KassenSichV dauerhaft speicherbare) TimeAdmin-PIN wird ebenfalls
  über die Admin-UI gesetzt (siehe docs/TSE-Integration.md Abschnitt 7).
- `native/tse-cli/vendor/bin/tseCli` (die kompilierte Binary) muss auf dem
  Server gebaut sein (`native/tse-cli/build.sh`, benötigt g++ + das
  gitignored Swissbit-SDK, siehe `vendor/PLACE_SDK_FILES_HERE.txt`) — Details
  in `docs/Installationsanleitung.md`.
- Da der Server ggf. von mehreren Vereinen mit je eigener TSE genutzt wird,
  gibt es bewusst **keine** feste udev-Regel, die eine bestimmte TSE auf einen
  festen Mountpunkt pinnt — der Auto-erkennen-Button in der Admin-UI ersetzt
  das, indem er bei Bedarf neu sucht.

### TSE-Hardware-Tests

Für echte Hardware-Tests (nicht nur den gemockten CLI-Subprozess in den
Unit-Tests) wird ein natives Linux-Hostsystem benötigt — WSL2 kann USB-Geräte
nicht ohne `usbipd-win` durchreichen. Erste echte Verifikation hat am
2026-08-24 im Zuge der Produktionsinstallation auf einem nativen Ubuntu
26.04 Server stattgefunden (`tseCli`-Build + USB-Mount/Berechtigungen, siehe
`docs/TSE-Integration.md` Abschnitt 9 und `docs/Installationsanleitung.md`
Abschnitt 8) — die eigentliche Entwicklungsumgebung bleibt aber weiterhin
WSL2, automatisierte Tests laufen weiterhin nur gegen den CLI-Stub.

---

## Umgebungsvariablen

Alle Variablen werden aus `.env` geladen (in der Entwicklung zusätzlich als
Docker `env_file` für den Postgres-Container). Pflichtfelder, die beim
Backend-Start fehlen, führen zu einem sofortigen Fehler.

| Variable             | Pflicht | Standardwert              | Beschreibung                         |
|----------------------|---------|---------------------------|--------------------------------------|
| `POSTGRES_USER`      | ja      | —                         | DB-Benutzer (Entwicklung: für den Docker-Container; Produktion: für die native `createuser`-Einrichtung, siehe Installationsanleitung) |
| `POSTGRES_PASSWORD`  | ja      | —                         | DB-Passwort (dito)                   |
| `POSTGRES_DB`        | ja      | —                         | DB-Name (dito)                       |
| `DATABASE_URL`       | ja      | —                         | PostgreSQL-Connection-String         |
| `SESSION_SECRET`     | ja      | —                         | Signierungsschlüssel für Cookies     |
| `PIN_HASH_SECRET`    | ja      | —                         | Schlüssel für das PIN-Login (Task #90) — MUSS getrennt von DB-Backups aufbewahrt werden, siehe unten |
| `PORT`               | nein    | `3000`                    | HTTP-Port des Backends               |
| `HOST`               | nein    | `0.0.0.0`                 | Bind-Adresse; hinter einem nginx-Reverse-Proxy (Task #66) empfiehlt die Installationsanleitung `127.0.0.1`, damit das Backend nie direkt erreichbar ist |
| `NODE_ENV`           | nein    | `development`             | `development` oder `production`      |
| `TLS_STAGING_DIR`    | nein    | `/var/lib/fairpos/ssl-staging` | Staging-Verzeichnis für ein hochgeladenes TLS-Zertifikat (Task #66), bevor das privilegierte Install-Skript es in die echte nginx-Config kopiert |
| `TLS_CERT_PATH`      | nein    | `/etc/nginx/ssl/fairpos.crt` | Pfad zum aktuell installierten nginx-Zertifikat — vom unprivilegierten Backend lesbar, um Ablaufdatum/Subject in der Admin-UI zu zeigen |
| `DNS_STAGING_DIR`    | nein    | `/var/lib/fairpos/dns-staging` | Staging-Verzeichnis für die Split-Horizon-DNS-Konfiguration (Task #92), analog zu `TLS_STAGING_DIR` |
| `TSE_CLI_PATH`, `PG_DUMP_PATH`, `SUDO_PATH` | nein | — (nutzt `PATH`) | **Nur für Tests** — zeigen dort auf Stub-Skripte statt der echten, hardwareabhängigen Programme. In Produktion nicht setzen; dort werden `tseCli`, `pg_dump` und `sudo` reell über `PATH` aufgelöst |

`SESSION_SECRET`/`PIN_HASH_SECRET` sollten je mindestens 32 zufällige Zeichen
enthalten und **unterschiedliche** Werte sein. `PIN_HASH_SECRET` ist der
Schlüssel für den deterministischen HMAC-SHA256-Hash der Bedienungs-PINs
(`auth/pin.ts`) — wer nur eine gestohlene DB-Sicherung hat, aber nicht auch
diesen Schlüssel, kann die PINs nicht offline durchprobieren. Deshalb gehört
er **nicht** in dieselbe Sicherung wie die Datenbank.

TSE-Mount-Pfad und Client-ID sind **keine** Umgebungsvariablen — sie werden
ausschließlich über Einstellungen → System in der Admin-UI konfiguriert
(siehe oben, "Swissbit USB-TSE-Anbindung").
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

### Kein SSE/WebSocket — Client-seitiges Polling

Für Echtzeit-Updates (Server → Client) gibt es keinen SSE- oder
WebSocket-Mechanismus — Ansichten mit Aktualisierungsbedarf pollen selbst
per `setInterval`, z.B. das Admin-Dashboard alle 30 Sekunden
(`admin/+page.svelte`) oder der ausstehende-Tagesabschlüsse-Banner alle 5
Minuten (`admin/+layout.svelte`). Einfacher als beide Alternativen und für
die Aktualisierungshäufigkeit dieses Anwendungsfalls ausreichend.

### Swissbit USB-TSE über CLI-Subprozess (kein Middleware-Container)

fiskaltrust wurde als zu teuer verworfen (August 2026). Stattdessen spricht das
Backend eine Swissbit USB-TSE direkt an: ein minimaler, selbst geschriebener
C++-Wrapper (`packages/backend/native/tse-cli`) linkt gegen das offizielle
Swissbit-SDK und wird vom Node-Prozess per `child_process.execFile`
aufgerufen — kein separater Dienst, kein natives Node-Addon, kein REST-Bridge.
Details, Entscheidungsverlauf und das vollständige Architekturkonzept stehen in
docs/TSE-Integration.md.

### PIN-Login als einziger Anmeldeweg (Task #90)

Eine persistente, vom Admin vergebene PIN (Format `XXX-XXX-XXX`) ist für
jeden Benutzer der einzige Anmeldeweg — Kassenpersonal wie Administratoren
gleichermaßen, keine separate Administrator-Loginseite mehr. Ein
Passwort existiert weiterhin, wird aber ausschließlich für den einmal pro
Sitzung nötigen „Systemverwaltung"-Bestätigungsschritt gebraucht
(`POST /api/auth/admin/verify`), bevor die Administrationsoberfläche
erreichbar ist. Sessions sind server-seitig getrackt (Tabelle `session`),
keine reinen JWT-/stateless Cookies mehr.

### Zwei Admin-Stufen (Task #94)

`middleware/authenticate.ts` stellt zwei preHandler bereit:
`authenticateAdmin` (lässt `is_admin` **oder** `is_event_admin` durch —
Default für die meisten Admin-Routen) und `authenticateSystemAdmin`
(verlangt strikt `is_admin`, nur für `events.ts`, `backup.ts`, `logs.ts`).
Einzelne Felder innerhalb ansonsten für beide Stufen offener Routen
(`users.ts`, `settings.ts`) haben zusätzliche inline-Guards für
System-exklusive Aktionen (z.B. `is_admin` vergeben, einen
System-Administrator löschen). Siehe `docs/Anforderungen.md` Abschnitt
„Benutzerrollen" für die fachliche Beschreibung.

### Veranstaltung als Hierarchieebene (Task #95)

Artikel, Artikelgruppen, Kassen, Kassenlayouts, der komplette Saalplan und
Stornogründe sind jeweils einer Veranstaltung (`event`) zugeordnet
(`event_id`-Spalte); Rechnungen/Bestellungen ordnen sich transitiv über
ihre Kasse zu, ohne eigene `event_id` — eine Kasse wechselt nie ihre
Veranstaltung, daher genügt ein `JOIN register`. Diese bewusste
Entscheidung hält die gesetzlich fixierten, lückenlosen Zähler
(`invoice.receipt_number`, `daily_closing.z_number`) vollständig
unberührt von der Veranstaltungs-Zuordnung. Genau eine Veranstaltung ist
global „aktiv" (`system_setting`-Key `active_event_id`, gespiegelt in
`config.activeEventId`, siehe `system/activeEvent.ts` — Muster wie
`tse/settings.ts`); nur ein System-Administrator kann wechseln. Eine
frische, leere Datenbank hat bewusst keine Veranstaltung, bis der erste
System-Administrator selbst eine anlegt und aktiviert.
