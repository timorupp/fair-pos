# FairPOS — Installationsanleitung (native Ubuntu-Installation)

Schritt-für-Schritt-Anleitung für die Produktions-Installation auf einem
dedizierten Ubuntu-Server, **ohne Docker** (Entscheidung siehe
`docs/SETUP.md` → "Production-Deployment" und `docs/Anforderungen.md`
Technologie-Tabelle). Automatisierte Varianten der wiederholbaren Schritte
liegen als Skripte in `scripts/install/` (siehe Abschnitt 9).

Getestet gegen: Ubuntu 24.04 LTS und (vollständig, inkl. echter
Swissbit-USB-TSE-Hardware, 2026-08-24) Ubuntu 26.04 LTS. Andere
LTS-Versionen sollten funktionieren, wurden aber nicht verifiziert.

> ⚠️ **Bevor du anfängst — Swissbit-TSE-SDK klären.** Für den echten
> TSE-Betrieb (Abschnitt 8) wird das proprietäre Swissbit-TSE-SDK benötigt —
> das ist **nicht** Teil dieses Repos (Lizenzgründe, siehe
> `docs/TSE-Integration.md` Abschnitt 3) und muss über den eigenen
> Swissbit-Vertrag separat besorgt werden (genaue Dateiliste:
> `packages/backend/native/tse-cli/vendor/PLACE_SDK_FILES_HERE.txt`). Ohne
> dieses SDK lässt sich `tseCli` in Abschnitt 8.1 nicht bauen — das lieber
> jetzt klären als nach sieben Abschnitten Vorarbeit daran zu scheitern.
> Alle Abschnitte bis einschließlich 7 (Voraussetzungen bis Datenbank-Setup)
> funktionieren unabhängig davon.

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

## 2. PostgreSQL installieren

Ubuntu-Standardpaket, keine zusätzliche Paketquelle nötig — die Migrationen
verwenden ausschließlich Standard-SQL (keine versionsspezifischen Features),
daher genügt, was die jeweilige Ubuntu-LTS-Version mitbringt:

```bash
sudo apt install -y postgresql
psql --version
```

(Frühere Fassungen dieser Anleitung pinnten über das PGDG-APT-Repo explizit
auf Version 16, um exakt der Version zu entsprechen, gegen die
Dev-Docker-Compose und die Integrationstests laufen. Bei einem so simplen
SQL-Schema überwiegt der Vorteil eines Abhängigkeits-Layers weniger: kein
zusätzlicher Signing-Key/Repo, keine Gefahr eines 404, falls PGDG einen ganz
neuen Ubuntu-Codenamen noch nicht unterstützt — das ist uns beim Test dieser
Anleitung gegen Ubuntu 26.04 „resolute" fast passiert. Dev/Test wurden im
Gegenzug auf dieselbe Major-Version angehoben, siehe `docker-compose.yml`
und `packages/backend/src/test/global-setup.ts`.)

**Datenbank und Rolle anlegen** (Werte an die eigene `.env` anpassen, siehe
Abschnitt 5):

```bash
sudo -u postgres psql -c "CREATE ROLE fairpos WITH LOGIN PASSWORD 'changeme';"
sudo -u postgres psql -c "CREATE DATABASE fairpos OWNER fairpos;"
```

Postgres lauscht standardmäßig nur auf `localhost` (`127.0.0.1:5432`) — das
reicht, da Backend und Datenbank auf demselben Server laufen. Kein
zusätzliches Netzwerk-Setup nötig.

Das `postgresql`-Metapaket zieht das passende `postgresql-client-*` (u.a.
`pg_dump`, `psql`) als Abhängigkeit automatisch mit — kein separater Schritt
nötig für den manuellen
Datenbank-Backup-Download in der Admin-UI (Systemeinstellungen → System,
siehe `docs/Anforderungen.md` "Backup-Konzept").

---

## 3. Node.js installieren

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # muss >= 24.x sein
```

---

## 4. Service-User anlegen

Der App-Service soll unabhängig vom SSH-Login-User laufen, mit dem die
Installation durchgeführt wird — der kann sich später ändern oder ganz
entfallen (Benutzerwechsel, Server-Übergabe). Dafür ein dediziertes,
unprivilegiertes Systemkonto:

```bash
sudo useradd --system --create-home --home-dir /opt/fairpos --shell /usr/sbin/nologin fairpos
id fairpos
```

- `--create-home --home-dir /opt/fairpos` legt `/opt/fairpos` direkt als
  `fairpos`-eigenes Verzeichnis an — dasselbe Verzeichnis, in das in
  Abschnitt 5 der Checkout kommt und das die systemd-Unit (Abschnitt 10) als
  `WorkingDirectory` verwendet.
- Das Verzeichnis ist danach nur für `fairpos` selbst (und `root`) lesbar —
  ab hier für alles unter `/opt/fairpos` `sudo` bzw. `sudo -u fairpos`
  verwenden, auch als root/Admin-User reicht ein einfaches `ls` nicht mehr.
- `--shell /usr/sbin/nologin` verhindert einen interaktiven Login als
  `fairpos`. `sudo -u fairpos <befehl>` funktioniert trotzdem — `sudo` führt
  den Befehl direkt aus, nicht über die Login-Shell des Zielusers.

---

## 5. Repository holen und konfigurieren

`/opt/fairpos` gehört bereits `fairpos` (Abschnitt 4) und ist für alle
anderen gesperrt (`0750`) — `git clone` verlangt aber ein leeres oder nicht
existierendes Zielverzeichnis, und `--create-home` hat dort bereits
Shell-Skeleton-Dateien (`.bashrc` etc.) abgelegt. Deshalb: als `tru` (mit dem
eigenen Git-Zugang) in ein Temp-Verzeichnis klonen, dann nach `/opt/fairpos`
kopieren und umbesitzen:

**Bewusst `develop`, nicht `master`** — der Produktivserver dient laufend
als Testumgebung für Zwischenstände direkt während der Entwicklung, nicht
nur für fertige Releases (siehe AGENTS.md, „Git-Workflow (Branches)").
`master` enthält nur die aufgeräumte, öffentlich sichtbare Historie ohne
Zwischenschritte.

```bash
git clone -b develop <repository-url> /tmp/fairpos-checkout
sudo cp -a /tmp/fairpos-checkout/. /opt/fairpos/
sudo chown -R fairpos:fairpos /opt/fairpos
rm -rf /tmp/fairpos-checkout
```

**⚠️ `cp -a` kann die Rechte von `/opt/fairpos` selbst aufweiten** (in einem
Testlauf wurde daraus `0775` statt `0750`) — direkt danach zurücksetzen und
kontrollieren:

```bash
sudo chmod 750 /opt/fairpos
sudo stat /opt/fairpos   # erwartet: Uid/Gid fairpos, Mode 0750
```

Ab hier alles innerhalb von `/opt/fairpos` als `fairpos` ausführen — `sudo -u
fairpos bash` startet trotz `nologin`-Shell eine interaktive Shell als
`fairpos` (siehe Abschnitt 4), darin bleiben bis inklusive Abschnitt 7:

```bash
sudo -u fairpos bash
cd /opt/fairpos
cp .env.example .env
chmod 600 .env    # enthält gleich Secrets — nicht world-readable lassen
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
PIN_HASH_SECRET=<mit demselben Befehl generieren — ANDERER Wert als SESSION_SECRET>
```

Die Swissbit-TSE (Mount-Pfad, Client-ID) gehört **nicht** in die `.env` —
ausschließlich über die Admin-UI konfigurierbar, siehe Abschnitt 8.

`SESSION_SECRET`/`PIN_HASH_SECRET` generieren (in der `fairpos`-Shell, Node
ist schon installiert — für jeden der beiden Werte einmal ausführen):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Wichtig:** `PIN_HASH_SECRET` sichert die Bedienungs-PINs (Task #90) gegen
Offline-Angriffe im Falle eines gestohlenen DB-Backups — dieser Wert darf
deshalb **nicht** zusammen mit dem Datenbank-Backup gesichert/exportiert
werden, sondern gehört ausschließlich in die `.env` auf diesem Server.

---

## 6. Bauen

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

## 7. Datenbank migrieren + ersten Admin anlegen

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
schon existiert). Erzeugt dabei auch eine zufällige PIN (Task #90 — Login
läuft für alle, auch Admins, ausschließlich über PIN; `<sicheres-passwort>`
wird nur noch für die Systemverwaltung-Stufenauth im Adminbereich gebraucht)
und gibt sie einmalig auf der Konsole aus — notieren, sie wird danach nicht
erneut angezeigt (bei Bedarf über die Benutzerverwaltung neu vergeben).

---

## 8. Swissbit USB-TSE einrichten

Details zur Architektur: `docs/TSE-Integration.md`. Hier nur die für die
Installation relevanten Schritte.

**Kein SDK/keine TSE vorhanden?** Diesen ganzen Abschnitt einfach
überspringen und direkt mit Abschnitt 9 weitermachen. FairPOS funktioniert
vollständig ohne TSE — Belege bleiben dann unsigniert (KassenSichV
ausdrücklich tolerierter Zustand bei TSE-Ausfall/-Abwesenheit, siehe
`docs/TSE-Integration.md` → „TSE-Ausfall"), kassiert wird trotzdem ganz
normal weiter. Relevant z.B. außerhalb Deutschlands ohne vergleichbare
TSE-Pflicht, oder für reine Testinstallationen (siehe README
„Haftungsausschluss").

### 8.1 `tseCli` bauen

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

### 8.2 TSE-Mountpunkt — automatisches Einbinden beim Einstecken

Da der Server ggf. von mehreren Vereinen mit je eigener TSE genutzt wird
(kein fester Mountpunkt für ein bestimmtes Gerät, siehe `docs/SETUP.md`),
reicht ein generisches Automount für **beliebige** eingesteckte
USB-Massenspeicher — welcher Mountpunkt tatsächlich die TSE ist, ermittelt
FairPOS selbst über den "Auto-erkennen"-Button in der Admin-UI (Abschnitt 8.3).

**✅ Verifiziert gegen echte Swissbit-USB-TSE-Hardware** (2026-08-24, Ubuntu
26.04 LTS "resolute"). `usbmount` — das ursprünglich hier vorgesehene Paket
für generisches Automount auf einem Headless-Server (kein eingeloggter
Desktop-Nutzer, für den `udisks2` automatisch mounten würde) — **existiert
in Ubuntu 26.04 nicht mehr im Archiv** (weder in `main` noch in `universe`/
`multiverse` — komplett aus der Distribution entfernt, nicht nur ein
fehlendes Repo). Ersatz: eine eigene udev-Regel, die bei jedem neu
erkannten USB-Massenspeicher `systemd-mount` aufruft — Teil von systemd
selbst, kein Zusatzpaket nötig.

```bash
sudo tee /etc/udev/rules.d/99-usb-automount.rules > /dev/null <<'EOF'
ACTION=="add", SUBSYSTEM=="block", ENV{DEVTYPE}=="partition", ENV{ID_BUS}=="usb", RUN{program}+="/bin/sh -c 'systemd-mount --no-block --automount=no --collect --options=uid=$(id -u fairpos),gid=$(id -g fairpos),umask=0077 $devnode'"
EOF
sudo udevadm control --reload-rules
```

Steckt danach jeden neu eingesteckten USB-Massenspeicher automatisch unter
`/run/media/system/<Label>` ein (z.B. `/run/media/system/SWISSBIT`, wenn die
TSE so formatiert ist) — kein Login, kein Zusatzpaket nötig. Zwei nicht
offensichtliche Stolperfallen, gegen die diese Regel bereits absichert:

1. **`systemd-mount` mountet Block-Devices standardmäßig `--automount=yes`
   — auch ohne die Option explizit anzugeben.** Das erzeugt einen *lazy*
   Automount, der erst beim ersten tatsächlichen Dateizugriff auf den
   Mountpunkt wirklich mountet. `lsblk` (worauf `tse/detect.ts`s
   "Auto-erkennen" aufbaut) zeigt einen solchen Mountpunkt aber **nicht**,
   solange er nicht wirklich gemountet ist — die TSE würde also nie als
   Kandidat auftauchen. Deshalb explizit `--automount=no` (sofortiger,
   "eager" Mount).
2. **Die Swissbit-TSE präsentiert sich als `vfat`/FAT32** — ein
   Dateisystem ohne echte Unix-Rechte. Ohne explizite `uid=`/`gid=`/
   `umask=`-Mount-Optionen erscheint der Mount `root:root` mit `0755`
   (nur lesbar für den Service-User `fairpos`, siehe Abschnitt 4 — kein
   Schreibzugriff, den das TSE-Kommandoprotokoll aber braucht). Die Regel
   löst `fairpos`s UID/GID zur Laufzeit dynamisch über `id -u fairpos`/
   `id -g fairpos` auf (nicht hart verdrahtet — falls ein anderer Server
   `fairpos` mit einer anderen UID/GID anlegt) und vergibt mit
   `umask=0077` volle Rechte (`0700`) exklusiv an `fairpos` (root hat
   ohnehin immer Zugriff, niemand sonst braucht welchen).

**Verifizieren** (ohne die TSE physisch abziehen/einstecken zu müssen — per
udev-Retrigger):

```bash
sudo udevadm trigger --action=add /sys/block/sdX/sdXN   # sdX/sdXN durch das echte Device ersetzen, siehe lsblk
sleep 1
lsblk
stat /run/media/system/<Label>
```

Erwartet: `lsblk` zeigt den Mountpunkt, `stat` zeigt `Uid: fairpos`,
`Gid: fairpos`, Mode `0700`, und `Device:` mit der echten Block-Device-Major/
Minor-Nummer (nicht `0,NN` — das wäre noch das leere `tmpfs`-Platzhalter-
verzeichnis vor Abschluss des asynchronen Mounts; `systemd-mount --no-block`
gibt sofort zurück, ohne auf den tatsächlichen Mount-Abschluss zu warten —
bei Bedarf `lsblk`/`stat` einfach nach einer Sekunde erneut ausführen).

### 8.3 TSE in der Admin-UI konfigurieren

Nach dem ersten Start des Backends (Abschnitt 10): Systemeinstellungen →
System → "Auto-erkennen" klickt sich durch alle aktuell gemounteten
Wechseldatenträger und trägt den ersten Treffer automatisch ein. Danach
Client-ID frei vergeben (z.B. `FairPOS-1`), TimeAdmin-PIN eintragen und
speichern.

### 8.4 Einmalige Hardware-Inbetriebnahme (`setup`)

**Kein Admin-UI-Schritt** — bewusst nicht Teil der UI (siehe
`docs/TSE-Integration.md` Abschnitt 7): die einmalige Aktivierung der TSE
läuft direkt über die `tseCli`-Binary, mit Zugangsdaten (Credential-Seed,
Admin-PUK, Admin-PIN), die aus den Swissbit-Vertragsunterlagen des Vereins
kommen — nicht aus diesem Repo, und laut KassenSichV-Vorgabe nirgends
dauerhaft speicherbar (auch nicht in der Bash-History):

```bash
sudo -u fairpos /opt/fairpos/packages/backend/native/tse-cli/vendor/bin/tseCli \
  <mount-pfad> setup <client-id> <credential-seed> <admin-puk> <admin-pin> <time-admin-pin>
```

`<mount-pfad>`/`<client-id>`/`<time-admin-pin>` entsprechen genau den Werten
aus Abschnitt 8.3. Danach in der Admin-UI über "TSE testen" verifizieren
(`hasPassedSelfTest: true` erwartet).

---

## 9. Automatisierungsskripte

Die Schritte 1–7 (alles außer der TSE-Einrichtung, die echte Hardware
voraussetzt) sind als idempotente Skripte in `scripts/install/` hinterlegt:

| Skript | Zweck |
|---|---|
| `scripts/install/01-system.sh` | Node.js + PostgreSQL (Ubuntu-Standardpaket) + Build-Tools installieren |
| `scripts/install/02-database.sh` | Rolle + Datenbank anlegen (liest Werte aus `.env`) |
| `scripts/install/03-build.sh` | `npm ci`, Build, Frontend-Kopie nach `packages/backend/public/` |
| `scripts/install/04-systemd.sh` | systemd-Unit installieren + aktivieren |
| `scripts/install/smoke-test.sh` | DB-Verbindung, TSE-Erreichbarkeit (falls konfiguriert), Backend-Healthcheck |
| `scripts/install/update.sh` | Update-Ablauf (Abschnitt 12) — als `sudo` von einem beliebigen Account startbar, führt `git pull`/`npm ci`/Build/Migration intern selbst als Service-User aus (liest den Namen aus der installierten systemd-Unit), nur der Neustart läuft als root |

Reihenfolge: `01` → Service-User anlegen (Abschnitt 4) → `.env` ausfüllen →
`02` → `03` → `npm run db:migrate` → `04` → `smoke-test.sh`.

> ⚠️ Die Skripte legen den Service-User (Abschnitt 4) noch nicht selbst an
> und laufen nicht als `fairpos` — `02`/`03` müssten entsprechend Abschnitt 5
> angepasst werden (Checkout/Build als `fairpos`, `/opt/fairpos` am Ende
> `0750` statt versehentlich aufgeweitet). Bis dahin: die manuellen Schritte
> aus Abschnitt 4/5 verwenden statt der Skripte.

---

## 10. systemd-Service

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

`User=fairpos` — der in Abschnitt 4 angelegte dedizierte Service-User, nicht
der SSH-Login-User der Installation.

---

## 11. Smoke-Test

Nach dem Start:

```bash
curl -f http://localhost:3000/api/health
```

Plus (siehe `scripts/install/smoke-test.sh`, Abschnitt 9): Datenbankverbindung,
TSE-Status (`GET /api/admin/tse/status`, falls konfiguriert), Login als Admin
über die UI.

---

## 12. Updates

```bash
sudo /opt/fairpos/scripts/install/update.sh
```

Führt den kompletten Ablauf aus (`git pull`, `npm ci`, Build, Frontend-Kopie,
Migration, Neustart, Smoke-Test) — `git`/`npm`/Migration laufen dabei intern
als Service-User, nicht als root, auch wenn das Skript selbst per `sudo`
gestartet wird. Äquivalent manuell, falls das Skript einmal nicht zur Hand
ist:

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

---

## 13. Optionale privilegierte Admin-Aktionen (Sudoers)

Drei Funktionen in der Admin-UI (Systemeinstellungen → System) brauchen
Root-Rechte, die der `fairpos`-Service-User bewusst nicht hat (Abschnitt 4):
Systemzeit und Zeitzone manuell setzen (Task #60) und Server herunterfahren
(Task #61). Alle drei Endpunkte sind bereits implementiert und rufen `sudo`
auf — ohne die folgende `sudoers`-Regel schlagen sie mit einer klaren
Fehlermeldung fehl, statt etwas Unerwartetes zu tun. Ohne diesen Abschnitt
funktioniert der Rest von FairPOS unverändert — alle drei Funktionen sind
rein optional.

### 13.1 Voraussetzung: NTP deaktivieren

**`timedatectl set-time` verweigert den Dienst, solange automatische
Zeitsynchronisation (NTP, standardmäßig aktiv via `systemd-timesyncd`)
eingeschaltet ist** — ohne diesen Schritt schlägt das manuelle Setzen der
Systemzeit über die Admin-UI garantiert fehl, unabhängig von der
`sudoers`-Regel unten:

```bash
timedatectl show -p NTP    # zur Kontrolle: sollte "NTP=yes" zeigen (Standard)
sudo timedatectl set-ntp false
timedatectl show -p NTP    # jetzt "NTP=no"
```

Sinnvoll ohnehin, da der Server laut Konzept auch ganz ohne Internet/NTP
laufen soll (siehe „Datum und Uhrzeit" in `docs/Anforderungen.md`).
Zeitzone-Setzen (`set-timezone`) ist davon **nicht** betroffen, funktioniert
unabhängig vom NTP-Status.

### 13.2 Sudoers-Regel anlegen

**Bewusst kein Full-Sudo** — die Regel erlaubt exakt drei Befehle, sonst
nichts:

```bash
cat <<'EOF' | sudo tee /tmp/fairpos-system-control > /dev/null
fairpos ALL=(root) NOPASSWD: /usr/bin/timedatectl set-time *
fairpos ALL=(root) NOPASSWD: /usr/bin/timedatectl set-timezone *
fairpos ALL=(root) NOPASSWD: /usr/bin/systemctl poweroff
EOF
sudo visudo -c -f /tmp/fairpos-system-control && \
  sudo install -m 0440 -o root -g root /tmp/fairpos-system-control /etc/sudoers.d/fairpos-system-control && \
  rm /tmp/fairpos-system-control
```

`visudo -c -f` prüft die Syntax einer beliebigen Datei, **bevor** sie nach
`/etc/sudoers.d/` installiert wird — ein Syntaxfehler in einer live
installierten Sudoers-Datei kann `sudo` systemweit blockieren, das hier
vermeidet das. `-m 0440 -o root -g root` sind Pflicht: `sudo` weigert sich,
unsicher berechtigte Dateien zu lesen.

**Pfade prüfen** — auf den meisten Ubuntu-Systemen (inkl. den in dieser
Anleitung getesteten 24.04/26.04) sind `/usr/bin/timedatectl` und
`/usr/bin/systemctl` korrekt, aber sicherheitshalber gegenprüfen:

```bash
which timedatectl systemctl
```

Falls abweichend, die Pfade in der Regel oben entsprechend anpassen.

**Verifizieren, ohne den Server tatsächlich zu beeinflussen** — zeigt, was
`fairpos` per `sudo` darf, ohne etwas davon auszuführen:

```bash
sudo -u fairpos sudo -n -l
```

Sollte genau die drei Zeilen aus der Regel oben zeigen, ohne nach einem
Passwort zu fragen (`-n` bricht sofort ab, statt zu warten, falls doch eins
nötig wäre — dann stimmt etwas an der Regel/Dateiberechtigung nicht).

**Echter Funktionstest:**
- Systemzeit/Zeitzone setzen: über die Admin-UI (Systemeinstellungen →
  System) einen Wert setzen und prüfen, dass die Erfolgsmeldung erscheint
  und `date`/`timedatectl` auf dem Server sich tatsächlich geändert haben.
- Shutdown: **fährt den Server wirklich herunter** — bewusst am Ende einer
  Session testen, nicht nebenbei.

---

## 14. Reverse-Proxy / TLS (nginx)

**Optional, aber empfohlen** — genau wie Abschnitt 13. Ohne diesen Abschnitt
läuft FairPOS unverändert per HTTP auf Port 3000 weiter. Empfehlenswert,
weil ein reiner HTTP-Betrieb bereits einen echten Bug live hervorgebracht
hat (D-030: `navigator.clipboard` verlangt einen Secure Context, sonst
funktionieren die Kopieren-Buttons in der Admin-UI nicht).

**Architektur:** nginx terminiert TLS auf Port 443 und reicht alles an den
weiterhin unverändert auf Port 3000 laufenden Node-Prozess weiter
(`proxy_pass` auf `127.0.0.1`). Zertifikate (selbstsigniert, eigene CA, oder
später über Task #92s Split-Horizon-DNS-Weg bezogen) werden über die
Admin-UI hochgeladen — siehe Abschnitt 14.4. Es gibt bewusst nur einen
einzigen vHost (`server_name _;`, Catch-all) — es existiert (noch) keine
echte Domain, und selbst mit einer über Task #92 wäre eine zweite
Server-Konfiguration nicht nötig.

### 14.1 nginx installieren

```bash
sudo apt install -y nginx
```

### 14.2 Platzhalter-Zertifikat erzeugen

nginx braucht beim Start ein Zertifikat, sonst startet der 443-Server-Block
gar nicht. Ein selbstsigniertes Platzhalter-Zertifikat überbrückt das, bis
über die Admin-UI ein echtes hochgeladen wird (Browser zeigen bis dahin
eine Vertrauenswarnung — normal und erwartet):

```bash
sudo mkdir -p /etc/nginx/ssl
sudo openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/fairpos.key -out /etc/nginx/ssl/fairpos.crt \
  -days 3650 -subj "/CN=fairpos.local"
sudo chown root:root /etc/nginx/ssl/fairpos.crt
sudo chmod 644 /etc/nginx/ssl/fairpos.crt
sudo chown root:www-data /etc/nginx/ssl/fairpos.key
sudo chmod 640 /etc/nginx/ssl/fairpos.key
```

Das Zertifikat ist bewusst world-readable (`644`) — der unprivilegierte
`fairpos`-Prozess liest es direkt (ohne `sudo`), nur um Gültigkeitsdatum/
Aussteller in der Admin-UI anzuzeigen. Der private Schlüssel bleibt enger
gefasst (`640`, Gruppe `www-data` — nginx' Standard-Ausführungsuser auf
Ubuntu).

### 14.3 nginx-Konfiguration anlegen

```bash
cat <<'EOF' | sudo tee /etc/nginx/sites-available/fairpos > /dev/null
server {
    listen 80;
    listen [::]:80;
    server_name _;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name _;

    ssl_certificate     /etc/nginx/ssl/fairpos.crt;
    ssl_certificate_key /etc/nginx/ssl/fairpos.key;

    # Etwas Luft über dem Logo-Upload-Limit (2 MB) hinaus.
    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
sudo ln -sf /etc/nginx/sites-available/fairpos /etc/nginx/sites-enabled/fairpos
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

**Port 80** leitet ausschließlich auf 443 um — es gibt (noch) keinen Inhalt,
der bewusst unverschlüsselt erreichbar sein müsste (anders als beim
ursprünglich angedachten CA-Verteilweg; der entfällt aber voraussichtlich,
siehe Task #92 — Split-Horizon-DNS mit einer echten, offiziell validierten
Domain braucht keine eigene CA-Verteilseite).

**Backend nur noch über den Proxy erreichbar machen** (empfohlen, sonst
bleibt Port 3000 parallel unverschlüsselt offen und die ganze
TLS-Terminierung wäre umgehbar). **Voraussetzung:** der Code muss bereits
die `HOST`-Unterstützung enthalten — bei einer bestehenden Installation
vorher einmal Abschnitt 12 (Updates) durchlaufen, sonst ignoriert der noch
laufende alte Build die neue Variable stillschweigend und bindet weiterhin
auf `0.0.0.0`.

**Achtung beim Copy-Paste:** die folgenden drei Blöcke wechseln zweimal die
Shell (`fairpos` hinein, wieder heraus) — als **drei getrennte Blöcke**
einfügen, nicht als einen zusammenhängenden. In einem Rutsch eingefügt,
geht die Ausführung nach dem Shell-Wechsel nicht zuverlässig weiter, und
der Rest landet in der falschen Shell oder wird gar nicht ausgeführt.

```bash
sudo -u fairpos bash
```

```bash
cd /opt/fairpos
echo "HOST=127.0.0.1" >> .env
exit
```

```bash
sudo systemctl restart fairpos
```

### 14.4 Sudoers-Regel für den Zertifikat-Upload

Das Hochladen eines neuen Zertifikats über die Admin-UI
(Einstellungen → SSL-Zertifikat) validiert Format und Schlüssel-Passung
vollständig im unprivilegierten Backend-Prozess (Abschnitt "Node-Crypto"
in `system/tlsCert.ts`) — **bevor** überhaupt etwas privilegiertes passiert.
Erst danach kommt folgendes Skript zum Einsatz, das die neuen Dateien an
die echte nginx-Stelle kopiert, mit `nginx -t` prüft, bei einem Fehler
automatisch zurückrollt (der laufende Proxy bleibt so in jedem Fall
erreichbar) und sonst neu lädt:

```bash
sudo mkdir -p /opt/fairpos/scripts
cat <<'EOF' | sudo tee /opt/fairpos/scripts/install-cert.sh > /dev/null
#!/bin/bash
set -euo pipefail

STAGING_DIR="/var/lib/fairpos/ssl-staging"
CERT_DEST="/etc/nginx/ssl/fairpos.crt"
KEY_DEST="/etc/nginx/ssl/fairpos.key"

[ -f "$CERT_DEST" ] && cp "$CERT_DEST" "$CERT_DEST.bak"
[ -f "$KEY_DEST" ] && cp "$KEY_DEST" "$KEY_DEST.bak"

install -m 0644 -o root -g root "$STAGING_DIR/fairpos.crt" "$CERT_DEST"
install -m 0640 -o root -g www-data "$STAGING_DIR/fairpos.key" "$KEY_DEST"

if ! nginx -t; then
  echo "nginx -t fehlgeschlagen, rolle zurück" >&2
  [ -f "$CERT_DEST.bak" ] && mv "$CERT_DEST.bak" "$CERT_DEST"
  [ -f "$KEY_DEST.bak" ] && mv "$KEY_DEST.bak" "$KEY_DEST"
  exit 1
fi

systemctl reload nginx
EOF
sudo chmod 0755 /opt/fairpos/scripts/install-cert.sh
```

Staging-Verzeichnis, für `fairpos` beschreibbar (das Backend schreibt hier
die validierten, aber noch nicht installierten Dateien hinein):

```bash
sudo mkdir -p /var/lib/fairpos/ssl-staging
sudo chown fairpos:fairpos /var/lib/fairpos/ssl-staging
sudo chmod 700 /var/lib/fairpos/ssl-staging
```

**Bewusst keine Parameter** in der Sudoers-Regel — strenger als das
Muster aus Abschnitt 13 (`timedatectl set-time *`), da das Skript immer von
diesem festen Verzeichnis liest, also keinerlei Wildcard nötig ist:

```bash
cat <<'EOF' | sudo tee /tmp/fairpos-nginx-control > /dev/null
fairpos ALL=(root) NOPASSWD: /opt/fairpos/scripts/install-cert.sh
EOF
sudo visudo -c -f /tmp/fairpos-nginx-control && \
  sudo install -m 0440 -o root -g root /tmp/fairpos-nginx-control /etc/sudoers.d/fairpos-nginx-control && \
  rm /tmp/fairpos-nginx-control
```

**Verifizieren, ohne den Server tatsächlich zu beeinflussen:**

```bash
sudo -u fairpos sudo -n -l
```

Sollte genau die eine Zeile aus der Regel oben zeigen, ohne nach einem
Passwort zu fragen.

**Echter Funktionstest:** über die Admin-UI (Einstellungen →
SSL-Zertifikat) ein Zertifikat hochladen (z. B. eines von
`mkcert` erzeugt) und prüfen, dass die Erfolgsmeldung erscheint, das
Gültigkeitsdatum in der Karte "Aktuelles Zertifikat" korrekt angezeigt wird
und der Browser beim Aufruf über `https://<server-ip>` das neue Zertifikat
zeigt.

---

## 15. Health-Check: SMART-Datenträgerprüfung + SSD-Abnutzung

**Optional, aber empfohlen** — genau wie Abschnitte 13 und 14. Der
Health-Check (Admin-UI → Monitoring → Health-Check, Task #87) läuft auch
ohne diesen Abschnitt — Festplattenspeicher- und Datenbank-Prüfung
funktionieren immer, SMART-Status und SSD-Abnutzung melden dann lediglich
"nicht verfügbar" (Warnung, kein Fehler) statt eines echten Ergebnisses.

### 15.1 smartmontools installieren

```bash
sudo apt install -y smartmontools
```

### 15.2 Prüf-Skript und Sudoers-Regel

`smartctl` braucht Root-Rechte für den rohen Festplattenzugriff. **Kein
Geräte-Wildcard in der Sudoers-Regel** — auf diesem Ubuntu-Stand lehnt
`visudo` das mit `syntax error: wildcards are not allowed in command
arguments` ab (live gefunden, 2026-08-30, beim ersten Versuch mit
`smartctl -H /dev/*` direkt als Regel: die Prüfung durch `visudo -c -f`
hat genau das verhindert, wofür sie da ist — die kaputte Regel wurde nie
installiert). Stattdessen dasselbe Muster wie beim nginx-Zertifikat
(Abschnitt 14.4): ein festes, **parameterloses** Skript, das Geräte
selbst aufzählt, statt eine Wildcard im Sudoers-Argument zu brauchen.

```bash
sudo mkdir -p /opt/fairpos/scripts
cat <<'EOF' | sudo tee /opt/fairpos/scripts/smart-check.sh > /dev/null
#!/bin/bash
set -euo pipefail

# USB-angebundene Datenträger (externe Platten, manche Gehäuse/Bridge-Chips)
# übersetzen SMART-Befehle oft nicht zuverlässig durch — bewusst
# ausgeschlossen (TRAN != usb), statt mit wechselnden -d-Typen zu tricksen.
#
# -a statt nur -H: liefert zusätzlich zum Gesundheitsstatus auch die volle
# SMART-Attributtabelle in derselben Ausgabe — die SSD-Abnutzungsprüfung
# liest daraus dasselbe Ergebnis dieses einen Aufrufs, statt smartctl ein
# zweites Mal pro Datenträger aufzurufen.
for disk in $(lsblk -d -n -o NAME,TYPE,TRAN | awk '$2=="disk" && $3!="usb"{print $1}'); do
  echo "=== /dev/$disk ==="
  smartctl -a "/dev/$disk" || true
done
EOF
sudo chmod 0755 /opt/fairpos/scripts/smart-check.sh
```

`|| true` hinter dem `smartctl`-Aufruf ist wichtig: ein tatsächlich
fehlerhafter Datenträger lässt `smartctl` mit einem Fehlercode enden —
ohne `|| true` würde `set -e` die Schleife dort sofort abbrechen und
weitere Datenträger nie geprüft werden.

```bash
cat <<'EOF' | sudo tee /tmp/fairpos-smart-control > /dev/null
fairpos ALL=(root) NOPASSWD: /opt/fairpos/scripts/smart-check.sh
EOF
sudo visudo -c -f /tmp/fairpos-smart-control && \
  sudo install -m 0440 -o root -g root /tmp/fairpos-smart-control /etc/sudoers.d/fairpos-smart-control && \
  rm /tmp/fairpos-smart-control
```

**Verifizieren:**

```bash
sudo -u fairpos sudo -n -l
```

Sollte jetzt eine weitere Zeile (`/opt/fairpos/scripts/smart-check.sh`)
neben den bereits bestehenden Regeln zeigen.

**Echter Funktionstest:** über die Admin-UI (Monitoring → Health-Check)
"Jetzt prüfen" klicken — die Zeile "SMART-Festplattenstatus" sollte jetzt
"✓ OK" mit einer Auflistung aller gefundenen Datenträger zeigen, statt der
Warnung "smartctl nicht verfügbar". Die Zeile "SSD-Abnutzung" zeigt bei
SSDs mit einem der bekannten Hersteller-Attribute (siehe
`WEAR_ATTRIBUTE_NAMES` in `system/healthChecks.ts`) den verbleibenden
Anteil der Nennlebensdauer je Datenträger — bei einer reinen HDD oder
einem nicht gelisteten Hersteller-Attribut stattdessen einen neutralen
"keine Daten verfügbar"-Hinweis (kein Fehler).

---

## 16. DNS-Masquerading (Split-Horizon-DNS)

**Optional, aber sinnvoll in Kombination mit Abschnitt 14** — löst das
Zertifikatsproblem des dortigen Platzhalter-Zertifikats: Geräte am
Veranstaltungsort erhalten diesen Server per DHCP als DNS-Resolver und
lösen eine echte, dem Verein gehörende Domain (z. B.
`kasse.mein-verein.de`) direkt auf die eigene LAN-IP-Adresse dieses
Servers auf. Zusammen mit einem über DNS-01-Challenge bezogenen, offiziell
validierten Zertifikat (Einstellungen → SSL-Zertifikat) entfällt so jede
Vertrauenswarnung im Browser — ohne dass auf einem einzigen Gerät manuell
eine eigene Zertifizierungsstelle installiert werden müsste.

**Voraussetzung:** ein DHCP-Server am Veranstaltungsort (i. d. R. der
Router), der als DNS-Server die eigene IP-Adresse dieses Servers
weitergibt, statt der Provider-Standard-DNS-Server. Das gehört nicht zu
diesem Abschnitt — es ist eine Konfiguration am Router/DHCP-Server des
jeweiligen Vereins und je nach Gerät unterschiedlich.

### 16.1 dnsmasq installieren

```bash
sudo apt install -y dnsmasq
```

**Achtung Port-Konflikt:** Ubuntu bindet standardmäßig bereits
`systemd-resolved` auf `127.0.0.53:53`. Die Konfiguration unten bindet
`dnsmasq` explizit nur an die eigene, konfigurierte IP-Adresse
(`listen-address` + `bind-interfaces`), sodass kein Konflikt entsteht —
`systemd-resolved` bleibt für den Server selbst unangetastet.

### 16.2 Konfigurations-Skript und Sudoers-Regel

Wie bei Zertifikat-Upload (Abschnitt 14.4): das Backend validiert alle
Einstellungen vollständig im unprivilegierten Prozess (`system/dnsConfig.ts`)
und schreibt sie erst dann in ein Staging-Verzeichnis. Folgendes Skript
übernimmt das eigentliche Anwenden — es prüft mit `dnsmasq --test` und
rollt bei einem Fehler automatisch zurück, der Server bleibt also in jedem
Fall auflösungsfähig. **Bewusst parameterlos**, aus demselben Grund wie in
Abschnitt 15.2: `visudo` lehnt Geräte-/Pfad-Wildcards in
Sudoers-Kommandoargumenten auf diesem Ubuntu-Stand ab.

Ein und dasselbe Skript deckt sowohl Installieren (Staging-Datei
vorhanden → kopieren) als auch Deaktivieren (keine Staging-Datei →
entfernen) ab:

```bash
sudo mkdir -p /opt/fairpos/scripts
cat <<'EOF' | sudo tee /opt/fairpos/scripts/dns-config.sh > /dev/null
#!/bin/bash
set -euo pipefail

STAGING_FILE="/var/lib/fairpos/dns-staging/fairpos.conf"
DEST_FILE="/etc/dnsmasq.d/fairpos.conf"
# Bewusst NICHT unter /etc/dnsmasq.d/ — Ubuntus Standard-conf-dir-Regel
# schließt nur .dpkg-dist/.dpkg-old/.dpkg-new aus, nicht .bak. Ein Backup
# direkt daneben würde beim nächsten Neustart als zweite, echte
# Konfigurationsdatei eingelesen ("illegal repeated keyword", live
# gefunden, 2026-08-30, bei jedem zweiten Speichervorgang reproduzierbar).
BACKUP_FILE="/var/lib/fairpos/dns-staging/fairpos.conf.bak"

[ -f "$DEST_FILE" ] && cp "$DEST_FILE" "$BACKUP_FILE"

if [ -f "$STAGING_FILE" ]; then
  install -m 0644 -o root -g root "$STAGING_FILE" "$DEST_FILE"
else
  rm -f "$DEST_FILE"
fi

rollback() {
  if [ -f "$BACKUP_FILE" ]; then
    mv "$BACKUP_FILE" "$DEST_FILE"
  else
    rm -f "$DEST_FILE"
  fi
}

if ! dnsmasq --test; then
  echo "dnsmasq --test fehlgeschlagen, rolle zurück" >&2
  rollback
  exit 1
fi

if ! systemctl restart dnsmasq; then
  echo "dnsmasq-Neustart fehlgeschlagen, rolle zurück" >&2
  rollback
  systemctl restart dnsmasq || true
  exit 1
fi

rm -f "$BACKUP_FILE"
EOF
sudo chmod 0755 /opt/fairpos/scripts/dns-config.sh
```

Staging-Verzeichnis, für `fairpos` beschreibbar:

```bash
sudo mkdir -p /var/lib/fairpos/dns-staging
sudo chown fairpos:fairpos /var/lib/fairpos/dns-staging
sudo chmod 700 /var/lib/fairpos/dns-staging
```

```bash
cat <<'EOF' | sudo tee /tmp/fairpos-dns-control > /dev/null
fairpos ALL=(root) NOPASSWD: /opt/fairpos/scripts/dns-config.sh
EOF
sudo visudo -c -f /tmp/fairpos-dns-control && \
  sudo install -m 0440 -o root -g root /tmp/fairpos-dns-control /etc/sudoers.d/fairpos-dns-control && \
  rm /tmp/fairpos-dns-control
```

**Verifizieren, ohne den Server tatsächlich zu beeinflussen:**

```bash
sudo -u fairpos sudo -n -l
```

Sollte genau die eine Zeile aus der Regel oben zeigen, ohne nach einem
Passwort zu fragen.

### 16.3 Echter Funktionstest

Über die Admin-UI (Einstellungen → DNS-Masquerading): Domain, eigene
IP-Adresse (per "Auto-erkennen" oder manuell) und mindestens einen
Upstream-DNS-Server eintragen, speichern. Danach über den Button
"Auflösung testen" prüfen, dass die konfigurierte Domain direkt beim
lokalen `dnsmasq` auf die eingetragene IP-Adresse auflöst.

Der eigentliche Praxistest braucht ein zweites Gerät im selben Netz, das
diesen Server tatsächlich als DNS-Resolver zugewiesen bekommt (siehe
Voraussetzung oben) — dort sollte die konfigurierte Domain auf die eigene
IP-Adresse auflösen, während alle anderen Domains normal über die
eingetragenen Upstream-DNS-Server funktionieren.
