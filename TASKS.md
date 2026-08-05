# Aufgabenliste

Persistente, versionierte Aufgabenverwaltung für FairPOS — ersetzt die
Session-interne Task-Verwaltung, damit die Liste bei einem Systemwechsel
erhalten bleibt und erledigte Aufgaben als Projekthistorie sichtbar sind.

**Konvention:**
- Fortlaufende Nummerierung, IDs werden nie wiederverwendet (auch nicht bei
  Löschung einer Aufgabe).
- `- [ ]` offen, `- [x]` erledigt. Erledigte Aufgaben bleiben stehen (Historie).
- Im Code/in Docs wird auf Aufgaben per `Task #<N>` verwiesen — diese Datei
  ist die maßgebliche Auflösung dafür.
- Neue Aufgaben unten anhängen, nicht zwischen bestehende einsortieren.

---

- [x] **#1** Saalplan-Editor implementieren
- [x] **#2** Print Worker implementieren
- [x] **#3** Kassenbon-PDF-Endpunkt implementieren
- [x] **#4** TSE-Integration implementieren
- [x] **#5** Bonkasse-UI implementieren
- [x] **#6** Bedienungskasse-UI implementieren
- [x] **#7** Tagesabschluss (Z-Bon) implementieren
- [x] **#8** Bonstorno-Maske implementieren (Admin)
- [x] **#9** Auswertungen implementieren
- [x] **#10** Excel-Export implementieren
- [x] **#11** System-Einstellungen implementieren
- [x] **#12** Test-Infrastruktur einrichten
- [x] **#13** DSFinV-K-Export implementieren
- [x] **#14** Tagesabschluss-Lücken erkennen + Kassieren sperren
- [x] **#15** D-013: Admin- und Kassen-Sessions trennen
- [x] **#16** D-001 + D-002: Saalplan-Datenmodell + Migrations-Konsolidierung
- [x] **#17** D-014: Belegnummer atomar per Counter-Row statt App-Lock
- [x] **#18** D-015: Admin-Reprint in Auswertung „Erstellte Rechnungen"
- [x] **#19** T-019: Test-DB-Infrastruktur (testcontainers)
- [x] **#20** DOC-001: JSDoc-Nachzug Pure-Helpers
- [x] **#21** T-Reihe: Integration-Tests für Bestands-Endpoints
- [x] **#22** User-Test-Liste 1: QR-Code-Grafik im Token-Dialog
- [x] **#23** User-Test 4: Touch-Buttons in Kassen-UIs vergrößern
- [x] **#24** User-Test 5: Druckerwarteschlange als eigene Settings-Seite
- [x] **#25** Backup-Dienst implementieren
  **Erledigt (August 2026):** Nur manueller Download-Backup, kein Timer/Cron-Job, kein
  impliziter Trigger am Tagesabschluss (siehe docs/Anforderungen.md "Backup-Konzept").
  `backup/dump.ts` (`createDatabaseDump`/`parseDatabaseUrl`) ruft `pg_dump` auf — Passwort
  über `PGPASSWORD`-Env-Var, nicht als Kommandozeilenargument (sonst über `ps` auf dem
  Server sichtbar); `backup/zip.ts` verpackt das Ergebnis mit einer Wiederherstellungs-
  `README.txt` als ZIP. Neue Route `GET /api/admin/backup`. Admin-UI:
  "Backup herunterladen"-Button in Systemeinstellungen → System (ersetzt die entfernte,
  bisher folgenlose `backup_directory`-Einstellung). `pg_dump` kommt automatisch mit
  `postgresql-16` (PGDG-Paket, siehe `docs/Installationsanleitung.md`), kein zusätzlicher
  Installationsschritt. Unit-Tests (`backup/dump.test.ts`, URL-Parsing) und
  Integrationstests (`backup.integration.test.ts`, 4 Tests: ZIP-Inhalt, PGPASSWORD statt
  Klartext-Argument, Fehlerfall, Auth-Gate) über einen `pg_dump`-Stub
  (`test/fixtures/pgDumpStub.sh`) — der echte `pg_dump` ist in dieser Sandbox nicht
  installierbar (kein passwortloses sudo), daher gegen echten `pg_dump` **nicht**
  verifiziert.
- [x] **#26** Produktoptionen-UI im Artikel-Modal
- [x] **#27** Standarddrucker: Invariante + UI-Umbau
- [x] **#28** Bonkasse: Selbstabholerbons je Artikel-Einheit am Kassendrucker
- [x] **#29** Admin: PDF einer Rechnung — 404 Not Found beheben
- [x] **#30** Pfandbon-Verhalten am Selbstabholerbon implementieren
- [x] **#31** Konfigurierbares Logo auf Bons und Rechnungen
- [x] **#32** Batch-Export aller Rechnungen als ZIP (PDF je Rechnung)
  **Erledigt (August 2026):** Skalierung wie beim Excel-Export gelöst — zwei Modi, Tag
  ODER Veranstaltung, kein Entweder-oder-Entscheidungsbedarf mehr. Neue Routen
  `GET /api/admin/exports/invoices/day` und `.../invoices/event` in `routes/admin/exports.ts`
  (`loadInvoiceIdsInRange` + `buildInvoicesZip`, wiederverwendet `loadReceiptById`/
  `renderReceiptPdf` aus dem bestehenden Einzel-PDF-Endpunkt). Bewusst **alle**
  Belegtypen (sales_receipt, cancellation, training) enthalten, nicht nur Verkäufe wie
  beim Excel-Export — Zweck ist ein vollständiges Archiv, keine Geschäftsauswertung.
  Dateiname je Eintrag = formatierte Belegnummer. Neue Admin-Seite
  `/admin/exports/invoices` (dritter Nav-Punkt unter "Exporte"), gleiches
  Tag/Veranstaltung-UI-Muster wie der Excel-Export. 6 neue Integrationstests
  (`exports.invoices-zip.integration.test.ts`).
- [ ] **#33** KI-basierte Security-Attack-Tests gegen installierte Anwendung
- [x] **#34** Z-Bon-Sperre / Standarddrucker-Fallback fixen
- [x] **#35** Datenmodell für AVBestellung + AVSonstige (TSE-Vorbereitung)
- [x] **#36** TSE: Vendor-Verzeichnis + Platzhalter + .gitignore
- [x] **#37** TSE: Minimaler CLI-Wrapper (tseCli.cpp) + build.sh
- [x] **#38** TSE: Node-Client-Modul (queue.ts, client.ts, types.ts)
- [x] **#39** TSE: Unit-Tests für queue.ts + client.ts (gemockter Subprozess)
- [x] **#40** TSE: Signierung in Bonkasse-Checkout integrieren (Referenzimplementierung)
- [x] **#41** TSE: Signierung in Bedienungskasse-Flows integrieren
- [x] **#42** TSE: Setup + Status-UI in Systemeinstellungen (Mount-Pfad, PINs, Testfunktion mit Statusanzeige)
- [x] **#43** TSE: SETUP.md + docker-compose + .env.example korrigieren
- [x] **#44** TSE: Automatisiertes Ausfall-Log (Start/Ende/Grund)
- [x] **#45** TSE: AVBelegabbruch bei Fehlschlag zwischen start und finish
- [x] **#46** TSE: processData-Format für Kassenbeleg-V1 auf DSFinV-K-Vorgabe umstellen
- [ ] **#47** Vollen manuellen Regressionstest durchführen (inkl. DSFinV-K)
- [x] **#48** Docker-Cleanup: Produktions-Deployment auf native Ubuntu-Installation umstellen
  **Erledigt:** `docker-compose.yml` auf reines Dev-Postgres reduziert (Backend-Service,
  TSE-Volume-Kommentare entfernt); `docker-compose.dev.yml` und
  `packages/backend/Dockerfile` gelöscht (Override nicht mehr nötig, da die Basis-Datei
  jetzt selbst nur noch Postgres enthält — Dev-Verhalten unverändert: Docker nur für
  Postgres, nie für die TSE). `.env.example`, `README.md`, `docs/SETUP.md`,
  `docs/Anforderungen.md`, `docs/Manueller-Testplan.md` von Docker-Produktions-Framing
  bereinigt (`DATABASE_URL` zeigt jetzt auf `localhost` statt des Compose-Servicenamens
  `postgres`). `TSE_MOUNT_POINT`/`TSE_CLIENT_ID`-Env-Vars bleiben als optionaler
  initialer Seed-Wert erhalten (nützlich für systemd `EnvironmentFile`), nicht mehr als
  "container-seitiger Pfad" dokumentiert.
- [x] **#49** Ausführliche Installationsanleitung für native Ubuntu-Installation schreiben
  **Erledigt:** `docs/Installationsanleitung.md` — Voraussetzungen, Postgres 16 via
  PGDG-APT-Repo, Node.js via NodeSource, Build (`npm run build` + Kopie nach
  `packages/backend/public/`), Migrationen, TSE-Einrichtung (`tseCli` bauen,
  `usbmount` fürs generische Automount auf einem Headless-Server, Berechtigungen),
  systemd-Unit-Vorlage, Smoke-Test, Update-Ablauf. TSE-Mount-Abschnitt (7.2) explizit
  als **nicht gegen echte Hardware verifiziert** markiert (noch keine Hardware
  verfügbar, siehe docs/TSE-Integration.md Abschnitt 9) — zu prüfen, sobald die
  bestellte Swissbit-Testhardware da ist.
- [x] **#50** Setup-Automatisierungsskripte für native Installation bauen
  **Erledigt:** `scripts/install/01-system.sh` (Node.js + Postgres + Build-Tools),
  `02-database.sh` (Rolle + DB aus `.env` anlegen), `03-build.sh` (npm ci, Build,
  Frontend-Kopie), `04-systemd.sh` (Unit-Datei schreiben + aktivieren),
  `smoke-test.sh` (systemd-Status, `/api/health`, `pg_isready`, TSE-Mountpunkt
  informativ). Alle idempotent, Bash-Syntax geprüft (`bash -n`) — **nicht** gegen
  einen echten Ubuntu-Server ausgeführt/verifiziert, da hier keiner zur Verfügung
  steht.
- [x] **#51** TSE: Auto-Detect-Button + Dropdown für Mount-Pfad in der Admin-UI
  **Erledigt:** Backend — `tse/detect.ts` (`listTseMountCandidates` via `lsblk -J`,
  Baum-Traversal mit `tran`/`rm`-Vererbung an Partitionen; `detectTse` probiert jeden
  Kandidaten über `getTseInfoAt` — neue, config-freie Variante von `getTseInfo` in
  `tse/client.ts`, die einen beliebigen Mountpunkt statt `config.tseMountPoint` testet).
  Neue Routen `GET /api/admin/tse/candidates`, `POST /api/admin/tse/detect`. Unit-Tests
  (`tse/detect.test.ts`, 10 Tests: Baum-Traversal mit synthetischen lsblk-Fixtures, echter
  `lsblk`-Aufruf, `detectTse` mit injizierter Kandidatenliste + Stub-CLI) und
  Integrationstests (`tse.integration.test.ts`, 3 neue Tests: Route-Verdrahtung,
  Auth-Gate). Frontend — Dropdown + "Auto-erkennen"-Button bei Mount-Pfad in
  `system/+page.svelte`, füllt das Feld, speichert aber nicht automatisch (Admin bestätigt
  weiterhin über den bestehenden "Speichern"-Button).
- [x] **#52** TSE-Status-Anzeige vereinheitlichen: alle Felder in `<dt>`/`<dd>` statt JSON-Fallback
  **Erledigt:** Signaturalgorithmus/Zeitformat/Public-Key (aus Task #46) in die
  bestehende `<dt>`/`<dd>`-Tabelle aufgenommen (waren zuvor nur im rohen JSON-Fallback
  sichtbar); `TseInfo`-Typ im Frontend (`lib/api.ts`) um die drei Felder ergänzt (war
  hinter dem Backend-Typ zurückgeblieben). Zusätzliche Unternehmensdaten-Felder
  (Anschaffungsdatum etc.) bewusst **nicht** ergänzt. Nebenbei behoben: veraltete
  Doku-Referenz "Docker-/Linux-Konfiguration" bei der Zeitzonen-Anzeige (Docker-Cleanup
  #48 hatte diese eine `.svelte`-Datei übersehen, da der ursprüngliche Grep nur
  `.md`/`.yml`/`.ts`/`.json` abdeckte).
- [x] **#53** Automatisierte API-Level End-to-End-Tests gegen eine echte Installation
  **Erledigt (August 2026):** Nur Backend, kein Browser/Frontend-Automatisierung.
  Neue, dritte Vitest-Konfiguration `vitest.e2e.config.ts` (`*.e2e.test.ts`, `npm run
  test:e2e`) — startet nichts selbst (kein Server, keine DB), sondern spricht per
  echtem `fetch()` eine bereits laufende, echte Instanz an (`E2E_BASE_URL`, Standard
  `http://localhost:3000`). `src/e2e/client.ts` — minimaler Cookie-Jar-HTTP-Client
  (getrennt für Admin-/Register-Session, wie `routes/auth.ts` es verlangt).
  `src/e2e/full-flow.e2e.test.ts` bildet den zentralen Ablauf aus
  `docs/Manueller-Testplan.md` ab: Health-Check → Admin-Login → Artikel/Kasse/
  Kassierer anlegen → QR-Token-Login → Bonkasse-Checkout (TSE-Signierung wird
  mitgeprüft, aber nur als Hard-Fail behandelt, wenn `/tse/status` vorher
  `configured+erreichbar` meldete — sonst ist ein Warnhinweis der korrekte, tolerierte
  Zustand) → Tagesabschluss → DSFinV-K-Export-ZIP (Inhalt verifiziert) →
  Rechnungs-PDF-ZIP-Export (Task #32). Jeder Lauf erzeugt eindeutig benannte,
  zeitstempel-präfixte Fixtures — kein automatisches Aufräumen (dokumentiert in
  `src/e2e/README.md`). **Echt verifiziert:** gegen die lokale Dev-Instanz laufen
  lassen (echter Postgres-Container, echter `npm run dev`-Server, dedizierter
  `e2e-admin`-Seed-User) — alle 9 Tests grün. Nebenbei eine echte Lücke in
  `docs/Installationsanleitung.md` gefunden und behoben: Abschnitt 6 erwähnte
  `npm run db:seed` nicht — ohne diesen Schritt wäre eine frische Installation gar
  nicht nutzbar gewesen (kein Login möglich).
  **Nachträglich um weitere Low-Hanging-Fruit-Checks ergänzt** (zweite `describe`,
  14 Tests insgesamt, ebenfalls echt gegen die Dev-Instanz verifiziert): falsches
  Admin-Passwort → 401, unauthentifizierter Zugriff auf einen Admin-Endpunkt → 401,
  Admin-Bonstorno (Task #8) auf dem gecheckten Artikel, Excel-Tages- und
  -Veranstaltungsexport (Task #10), manueller Backup-Download (Task #25) — toleriert
  dabei einen 500 als einzige Alternative zu 200 (falls `pg_dump` auf dem
  Zielsystem fehlt), niemals einen anderen Status. **Bewusst noch nicht abgedeckt**
  (siehe Diskussion): Bedienungskasse (Tische, Split-Checkout, Mehrfach-Bestellrunden),
  Storno offener Tisch-Positionen (AVSonstige), mehrere Steuersätze, Pfand/Leergut,
  aktiv provozierter TSE-Ausfall (`tse_outage`) — bleibt bei Bedarf als
  Erweiterung offen, ansonsten weiterhin Teil des manuellen Regressionstests (#47).
