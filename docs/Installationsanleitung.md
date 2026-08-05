# FairPOS — Installationsanleitung (native Ubuntu-Installation)

Schritt-für-Schritt-Anleitung für die Produktions-Installation auf einem
dedizierten Ubuntu-Server, **ohne Docker** (Entscheidung siehe
`docs/SETUP.md` → "Production-Deployment" und `docs/Anforderungen.md`
Technologie-Tabelle). Automatisierte Varianten der wiederholbaren Schritte
liegen als Skripte in `scripts/install/` (siehe Abschnitt 8).

Getestet gegen: Ubuntu 24.04 LTS. Andere LTS-Versionen sollten funktionieren,
wurden aber nicht verifiziert.

---

## 1. Voraussetzungen

```bash
sudo apt update
sudo apt install -y curl ca-certificates gnupg build-essential g++
```

- `build-essential`/`g++` — für den TSE-CLI-Build (`native/tse-cli`, C++11).
- Node.js und PostgreSQL werden in den folgenden Abschnitten über eigene
  Paketquellen installiert (die Ubuntu-Standard-Repos liefern je LTS-Version
  unterschiedliche, oft ältere Major-Versionen).

---

## 2. PostgreSQL 16 installieren (PGDG-APT-Repo)

Die Ubuntu-Standard-Repos pinnen Postgres nicht auf eine bestimmte
Major-Version — für ein reproduzierbares Deployment über das offizielle
PostgreSQL-APT-Repo (PGDG) installieren:

```bash
sudo install -d /usr/share/postgresql-common/pgdg
curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  https://www.postgresql.org/media/keys/ACCC4CF8.asc
sudo sh -c 'echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
  https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
  > /etc/apt/sources.list.d/pgdg.list'
sudo apt update
sudo apt install -y postgresql-16
```

**Datenbank und Rolle anlegen** (Werte an die eigene `.env` anpassen, siehe
Abschnitt 4):

```bash
sudo -u postgres psql -c "CREATE ROLE fairpos WITH LOGIN PASSWORD 'changeme';"
sudo -u postgres psql -c "CREATE DATABASE fairpos OWNER fairpos;"
```

Postgres lauscht standardmäßig nur auf `localhost` (`127.0.0.1:5432`) — das
reicht, da Backend und Datenbank auf demselben Server laufen. Kein
zusätzliches Netzwerk-Setup nötig.

`postgresql-16` zieht `postgresql-client-16` (u.a. `pg_dump`, `psql`) als
Abhängigkeit automatisch mit — kein separater Schritt nötig für den manuellen
Datenbank-Backup-Download in der Admin-UI (Systemeinstellungen → System,
siehe `docs/Anforderungen.md` "Backup-Konzept").

---

## 3. Node.js installieren

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # muss >= 20.x sein
```

---

## 4. Repository holen und konfigurieren

```bash
cd /opt
sudo git clone <repository-url> fairpos
sudo chown -R $USER:$USER /opt/fairpos
cd /opt/fairpos

cp .env.example .env
```

`.env` anpassen:

```env
POSTGRES_USER=fairpos
POSTGRES_PASSWORD=changeme            # wie in Abschnitt 2 vergeben
POSTGRES_DB=fairpos
DATABASE_URL=postgresql://fairpos:changeme@localhost:5432/fairpos

NODE_ENV=production
PORT=3000
SESSION_SECRET=<mit dem Befehl unten generieren>

# TSE_MOUNT_POINT/TSE_CLIENT_ID optional hier vorbelegen — normalerweise über
# die Admin-UI (Systemeinstellungen -> System, inkl. "Auto-erkennen"-Button)
# gesetzt, siehe Abschnitt 7.
```

`SESSION_SECRET` generieren:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 5. Bauen

```bash
npm ci
npm run build   # baut packages/shared, packages/backend, packages/frontend in der richtigen Reihenfolge

# Frontend-SPA in das Verzeichnis kopieren, aus dem Fastify sie ausliefert:
rm -rf packages/backend/public
mkdir -p packages/backend/public
cp -r packages/frontend/build/* packages/backend/public/
```

`packages/backend/dist/` enthält danach das kompilierte Backend,
`packages/backend/public/` die kompilierte Frontend-SPA (von Fastify als
statische Dateien unter `/` ausgeliefert, `/api/*` bleibt die REST-API).

---

## 6. Datenbank migrieren + ersten Admin anlegen

```bash
npm run db:migrate
npm run db:seed -- <name> <sicheres-passwort>
```

`db:migrate` führt alle `.sql`-Dateien aus `packages/backend/src/db/migrations/`
aus, die noch nicht in `schema_migrations` protokolliert sind — bei einer
frischen Installation also alle.

`db:seed` legt den ersten Admin-Benutzer an, ohne den sich niemand in der
Admin-UI anmelden kann — ohne diesen Schritt ist die frische Installation
nicht benutzbar. Gefahrlos mehrfach ausführbar (macht nichts, wenn der Name
schon existiert).

---

## 7. Swissbit USB-TSE einrichten

Details zur Architektur: `docs/TSE-Integration.md`. Hier nur die für die
Installation relevanten Schritte.

### 7.1 `tseCli` bauen

Das Swissbit-SDK ist aus Lizenzgründen nicht Teil dieses Repos (gitignored) —
siehe `packages/backend/native/tse-cli/vendor/PLACE_SDK_FILES_HERE.txt` für
die genaue Dateiliste und Bezugsquelle. Nach dem Kopieren der SDK-Dateien:

```bash
cd packages/backend/native/tse-cli
./build.sh
cd /opt/fairpos
```

Baut `native/tse-cli/vendor/bin/tseCli`, die Binary, die das Backend per
Subprozess aufruft.

### 7.2 TSE-Mountpunkt — automatisches Einbinden beim Einstecken

Da der Server ggf. von mehreren Vereinen mit je eigener TSE genutzt wird
(kein fester Mountpunkt für ein bestimmtes Gerät, siehe `docs/SETUP.md`),
reicht ein generisches Automount für **beliebige** eingesteckte
USB-Massenspeicher — welcher Mountpunkt tatsächlich die TSE ist, ermittelt
FairPOS selbst über den "Auto-erkennen"-Button in der Admin-UI (Abschnitt 7.3).

Auf einem Headless-Server (kein eingeloggter Desktop-Nutzer, für den
`udisks2` automatisch mounten würde) empfiehlt sich `usbmount`:

```bash
sudo apt install -y usbmount
```

Steckt danach jeden USB-Massenspeicher automatisch unter `/media/usbX`
(`X` = 0–7) ein, ohne dass sich jemand einloggen muss. Konfiguration (Mount-
Optionen, Berechtigungen) in `/etc/usbmount/usbmount.conf`.

**⚠️ Nicht gegen echte TSE-Hardware verifiziert** (Stand dieser Anleitung —
siehe `docs/TSE-Integration.md` Abschnitt 9, echte Hardware-Tests stehen noch
aus). Zu prüfen, sobald Hardware verfügbar ist:
- Mit welchem Dateisystem sich die Swissbit-TSE formatiert präsentiert, und
  ob `usbmount`s Default-Optionen sie automatisch korrekt einbindet.
- Mit welchem Owner/welcher Gruppe der Mount erscheint, und ob der
  Backend-Service-User (Abschnitt 7.4) darauf lesen/schreiben kann — ggf.
  `FS_MOUNTOPTIONS` in `usbmount.conf` um `uid=`/`gid=` für den
  Service-User ergänzen, oder den Service-User der Gruppe hinzufügen, der
  der Mount gehört.

### 7.3 TSE in der Admin-UI konfigurieren

Nach dem ersten Start des Backends (Abschnitt 9): Systemeinstellungen →
System → "Auto-erkennen" klickt sich durch alle aktuell gemounteten
Wechseldatenträger und trägt den ersten Treffer automatisch ein. Danach
`TSE_CLIENT_ID` frei vergeben (z.B. `FairPOS-1`) und einmalig `setup`
ausführen (PUK/PINs — siehe `docs/TSE-Integration.md` Abschnitt 7 für die
Sicherheitsanforderungen, diese Zugangsdaten werden **nicht** dauerhaft
gespeichert).

### 7.4 Berechtigungen für den Backend-Service-User

Der User, unter dem der systemd-Service (Abschnitt 9) läuft, braucht
Lese-/Schreibzugriff auf den TSE-Mountpunkt. Je nachdem, wie der Mount
zustande kommt (Abschnitt 7.2), z.B.:

```bash
sudo usermod -aG plugdev fairpos   # falls der Mount der Gruppe "plugdev" gehört
```

Genauer Gruppenname/Owner hängt vom gewählten Automount-Mechanismus ab —
mit `stat /media/usb0` (oder dem tatsächlichen Mountpunkt) prüfen.

---

## 8. Automatisierungsskripte

Die Schritte 1–6 (alles außer der TSE-Einrichtung, die echte Hardware
voraussetzt) sind als idempotente Skripte in `scripts/install/` hinterlegt:

| Skript | Zweck |
|---|---|
| `scripts/install/01-system.sh` | Node.js + PostgreSQL (PGDG) + Build-Tools installieren |
| `scripts/install/02-database.sh` | Rolle + Datenbank anlegen (liest Werte aus `.env`) |
| `scripts/install/03-build.sh` | `npm ci`, Build, Frontend-Kopie nach `packages/backend/public/` |
| `scripts/install/04-systemd.sh` | systemd-Unit installieren + aktivieren |
| `scripts/install/smoke-test.sh` | DB-Verbindung, TSE-Erreichbarkeit (falls konfiguriert), Backend-Healthcheck |

Reihenfolge: `01` → `.env` ausfüllen → `02` → `03` → `npm run db:migrate` →
`04` → `smoke-test.sh`.

---

## 9. systemd-Service

`/etc/systemd/system/fairpos.service`:

```ini
[Unit]
Description=FairPOS Backend
After=network.target postgresql.service

[Service]
Type=simple
User=fairpos
WorkingDirectory=/opt/fairpos/packages/backend
EnvironmentFile=/opt/fairpos/.env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now fairpos
sudo systemctl status fairpos
journalctl -u fairpos -f   # Logs
```

`EnvironmentFile` lädt `.env` genauso, wie es Docker in der Entwicklung über
`env_file` tut — kein zusätzliches dotenv-Handling im Code nötig.

---

## 10. Smoke-Test

Nach dem Start:

```bash
curl -f http://localhost:3000/api/health
```

Plus (siehe `scripts/install/smoke-test.sh`, Abschnitt 8): Datenbankverbindung,
TSE-Status (`GET /api/admin/tse/status`, falls konfiguriert), Login als Admin
über die UI.

---

## 11. Updates

```bash
cd /opt/fairpos
git pull
npm ci
npm run build
rm -rf packages/backend/public && mkdir -p packages/backend/public
cp -r packages/frontend/build/* packages/backend/public/
npm run db:migrate
sudo systemctl restart fairpos
```
