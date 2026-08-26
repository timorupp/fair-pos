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
- [x] **#54** `DELETE /api/admin/registers/:id` — verständliche Fehlermeldung bei
  vorhandenen Transaktionen
  **Erledigt (2026-08-05):** `23503` (Fremdschlüssel-Verletzung) abgefangen, 409 mit
  Klartext-Fehlermeldung ("Kasse hat bereits Transaktionen und kann nicht gelöscht
  werden") statt rohem 500 — analog zum bestehenden `23505`-Handling in
  `categories.ts`/`articles.ts`. 3 neue Integrationstests
  (`registers.integration.test.ts`, vorher gab es keine): unbenutzte Kasse löschen
  (204), nicht existierende Kasse (404), Kasse mit Rechnung (409 + Meldung, Kasse
  und Rechnung bleiben unverändert bestehen).
- [x] **#55** Kassen (`register`): Archivieren/Deaktivieren statt dauerhaft
  blockierter Löschung
  **Erledigt (2026-08-06):** Migration `0007_register_is_active.sql` —
  `register.is_active BOOLEAN NOT NULL DEFAULT true`. `registers.ts` GET/POST/PUT
  geben/setzen `is_active` mit; DELETE unverändert (bleibt harter Löschversuch
  analog #54). `register-session.ts`: `GET /me` filtert `AND r.is_active = true`
  (archivierte Kasse verschwindet aus dem Kassen-Login-Picker); `GET /registers/:id`
  behandelt eine archivierte Kasse wie eine gelöschte (404), auch wenn der Benutzer
  noch per `user_register` zugewiesen ist. Admin-UI (`registers/+page.svelte`):
  „Aktiv"-Checkbox im Bearbeiten-Formular (Löschen-Button bleibt dort, siehe
  [[feedback_delete_button_placement]]), „Archiviert"-Badge + abgedunkelte Zeile in
  der Übersicht. 2 neue Integrationstests (`registers.integration.test.ts`) + 2 neue
  (`register-session.integration.test.ts`: `GET /me`-Filterung, 404 bei archivierter
  Kasse).
- [x] **#56** Benutzer (`user`): Archivieren/Deaktivieren statt dauerhaft
  blockierter Löschung
  **Erledigt (2026-08-06):** Migration `0008_user_is_active.sql` —
  `"user".is_active BOOLEAN NOT NULL DEFAULT true`. `users.ts`: DELETE bleibt ein
  echter Hard-Delete-Versuch — gelingt für Benutzer ohne Referenzen, fängt sonst
  `23503` ab und liefert 409 mit Hinweis auf die Deaktivierung statt rohem 500
  (analog #54); PUT setzt `is_active`, verweigert aber die Selbstdeaktivierung
  (400, analog zum bestehenden Selbstlöschschutz). `auth.ts`: Admin-Login und
  QR-Token-Tausch prüfen zusätzlich `is_active` (derselbe generische 401 wie bei
  falschem Passwort/unbekanntem Token — kein Enumerieren deaktivierter Accounts).
  `middleware/authenticate.ts`: beide PreHandler fragen `is_active` bei **jedem**
  Request erneut ab — eine Deaktivierung beendet eine bereits offene Kassen-Session
  sofort, nicht erst beim nächsten Login. Admin-UI (`users/+page.svelte`):
  „Aktiv"-Checkbox (deaktiviert für den eigenen Account), Status-Spalte
  „Deaktiviert"/„aktiv" in der Übersicht, Kassenzuweisungsliste blendet archivierte
  Kassen aus (außer bereits zugewiesene). Getestet: 4 neue Tests in
  `admin-routes.integration.test.ts` (Hard-Delete, 409+Bestand, Selbstschutz,
  Toggle), 2 neue in `auth.integration.test.ts` (deaktivierter Admin-Login,
  deaktivierter Token-Tausch), 1 neues in `register-session.integration.test.ts`
  (sofortiger Logout einer offenen Session).
- [x] **#57** `DELETE /api/admin/printers/:id` — verständliche Fehlermeldung bei
  vorhandenem Gerät in Verwendung
  **Erledigt (2026-08-06):** `23503` abgefangen, 409 mit Klartext-Fehlermeldung
  („Drucker wird noch verwendet und kann nicht gelöscht werden") statt rohem 500 —
  analog #54, kein Archivieren nötig (Drucker müssen im Gegensatz zu
  Kassen/Benutzern nicht dauerhaft historisch nachweisbar bleiben). 3 neue
  Integrationstests (`printers.integration.test.ts`, vorher gab es keine):
  unbenutzten Drucker löschen (204), nicht existierenden Drucker (404), Drucker mit
  zugeordneter Kasse (409 + Meldung, Drucker bleibt bestehen). FK-Referenzen auf
  `printer(id)`: `register.printer_id`, `article.printer_id`, `print_job.printer_id`
  (NOT NULL).
- [x] **#58** TSE-Zeitsynchronisation + Self-Test (`maintainTse`) tatsächlich aufrufen
  Gefunden bei der Live-Installation (2026-08-24), als die Frage aufkam, wofür
  die TimeAdmin-PIN in den Systemeinstellungen eigentlich gebraucht wird:
  `tse/client.ts` hat eine fertige `maintainTse(timeAdminPin)`-Funktion, die
  aber **nirgends aufgerufen wird** — kein Cronjob, kein Scheduler, kein
  Button in der Admin-UI. Die UI zeigt nur an, wie viele Tage bis zur
  nächsten fälligen Zeitsync bzw. zum nächsten Self-Test bleiben
  (`GET /api/admin/tse/status` → `timeUntilNextTimeSynchronization` /
  `timeUntilNextSelfTest`), tut aber nichts, wenn eines davon fällig wird.
  **Deckt beides in einem Schritt ab:** Das zugrundeliegende CLI-Kommando
  `maintain <clientId> <timeAdminPin>` (`native/tse-cli/src/tseCli.cpp`,
  `cmdMaintain`) führt Self-Test und Zeitsync bereits bewusst in einer
  Operation aus (Self-Test muss laut Kommentar dort sogar vor dem Zeitsync
  laufen, weil er die TSE-Zeit invalidiert) — kein separater Task für den
  Self-Test nötig, `maintainTse()` deckt automatisch beides ab, sobald sie
  aufgerufen wird.
  **Zusammengeführt in Task #64 (2026-08-24):** Kein eigenständiger Task
  mehr — der `maintainTse()`-Aufruf wird als einer der automatischen
  Health-Checks in #64 umgesetzt (dort auch der endgültig festgelegte
  Auslösepunkt: Backend-Start, siehe #64).
- [x] **#59** TSE-Status-Karte: Public-Key-Zeile läuft über den Kartenrahmen hinaus
  **Erledigt (2026-08-24):** Ursache bestätigt (Grid-Item-Default
  `min-width: auto` verhindert das Schrumpfen der `1fr`-Spalte trotz
  `word-break`). Fix in `admin/settings/system/+page.svelte`:
  `grid-template-columns: max-content minmax(0, 1fr)` (statt `1fr`) +
  `min-width: 0` auf `.kv dd` + zusätzlich `overflow-wrap: anywhere` neben
  dem bestehenden `word-break: break-all` auf `.pubkey`.
- [x] **#60** Systemzeit des Servers anzeigen + manuell setzen können
  Aufgekommen bei der Live-Installation (2026-08-24) im Zusammenhang mit
  Task #58: die TSE-Zeitsynchronisation gleicht die TSE-Uhr gegen die
  **Systemzeit des `fairpos`-Servers** ab — wenn die falsch steht, synchronisiert
  die TSE gegen eine falsche Zeit. Aktuell zeigt die Admin-UI
  (`admin/settings/system/+page.svelte`) nur eine live tickende
  "Serverzeit" (rein lesend, aus `GET /api/admin/system/status`) — keine
  Möglichkeit, sie zu **setzen**. Gewünscht: manuelle Eingabe reicht (keine
  NTP-Anbindung nötig — die Kasse kann auch ganz ohne Internet laufen, siehe
  `docs/Anforderungen.md` "Datum und Uhrzeit" — dort bisher nur als
  Anforderung notiert, nie umgesetzt). Nebenbei nützlich für die Entwicklung,
  um mit einer zurückgedrehten Uhr eine eigentlich schon abgelaufene
  Dev-TSE weiter benutzen zu können.
  **Technischer Haken:** Der Backend-Prozess läuft absichtlich als
  unprivilegierter `fairpos`-User (siehe Abschnitt 4 der
  Installationsanleitung) — kann die Systemuhr nicht selbst stellen
  (`CAP_SYS_TIME`/root nötig). Lösung vermutlich eine eng zugeschnittene
  `sudoers`-Regel, die `fairpos` **ausschließlich** den Aufruf von
  `sudo timedatectl set-time '<wert>'` ohne Passwort erlaubt (kein
  Full-Sudo!) — vom Backend per `execFile` aufgerufen. Sicherheitsaspekt
  beachten: eine Manipulationsmöglichkeit der Systemzeit aus der Web-UI
  heraus ist grundsätzlich sensibel (Admin-only, wie schon alle anderen
  Settings-Endpoints — aber ggf. zusätzliches Logging erwägen). Dieselbe
  Sudoers-Mechanik lässt sich vermutlich für Task #61 (Shutdown-Button)
  wiederverwenden.
  **Ergänzt (2026-08-24):** Warnung auf der Administrator-Startseite, wenn
  Server- und Browserzeit um mehr als 30 Sekunden voneinander abweichen
  (Vergleich clientseitig: Browser-`Date.now()` gegen `server_time` aus
  `GET /api/admin/system/status`, ähnliches Muster wie der bestehende
  globale Tagesabschluss-Banner in `admin/+layout.svelte`). Zusätzlich bei
  der manuellen Zeiteinstellung selbst ein Button „Aktuelle Browserzeit
  übernehmen" — übernimmt `new Date()` des Browsers als Vorschlagswert statt
  manueller Eingabe von Hand.
  **Erledigt (2026-08-24):** Vollständig umgesetzt. Backend:
  `system/time.ts` (`setSystemTime`/`setSystemTimezone`, letztere validiert
  gegen `Intl.supportedValuesOf('timeZone')` bevor `sudo` überhaupt
  aufgerufen wird), Routen `PUT /api/admin/system/time` +
  `PUT /api/admin/system/timezone`, `config.sudoPath` als Test-Override
  (Muster wie `pgDumpPath`/`tseCliPath`) mit neuem
  `test/fixtures/sudoStub.sh`. Frontend: Zeitzone jetzt ein `<select>`
  (befüllt aus `Intl.supportedValuesOf('timeZone')`, kein extra
  Backend-Roundtrip nötig) statt reiner Anzeige, „Aktuelle Browserzeit
  übernehmen"-Button, Abweichungs-Warnung auf der Admin-Startseite
  (`admin/+page.svelte`, >30s Differenz Browser/Server). Sudoers-Doku in
  `docs/Installationsanleitung.md` Abschnitt 13 (inkl. Fund: `set-time`
  funktioniert gar nicht, solange NTP aktiv ist — Abschnitt 13.1 lässt es
  vorher deaktivieren). Unit- + Integrationstests für beide Routen/Funktionen.
  **Noch offen (bewusst zurückgestellt für die nächste Session):** die
  eigentliche `sudoers`-Datei muss noch live auf dem Server angelegt werden
  (SSH-Zugriff nötig, hat niemand aus dieser Session heraus) — bis dahin
  liefern beide Endpunkte eine klare Fehlermeldung statt zu funktionieren.
- [x] **#61** Shutdown-Button in der Admin-UI
  Gewünscht, damit ein normaler Vereins-Nutzer den Server kontrolliert
  herunterfahren kann, ohne auf die Shell zu müssen. Gleiches technisches
  Muster wie Task #60: `fairpos` braucht dafür eine eng zugeschnittene
  `sudoers`-Regel (z.B. ausschließlich `sudo systemctl poweroff` ohne
  Passwort erlaubt, kein Full-Sudo), vom Backend per `execFile` aufgerufen.
  UI-seitig unbedingt mit deutlicher Sicherheitsabfrage (analog zu anderen
  destruktiven Aktionen in der App, z.B. Backup-Restore/Reset-Diskussionen)
  — ein versehentlicher Klick legt sofort den laufenden Kassenbetrieb lahm.
  **Erledigt (2026-08-24):** `system/shutdown.ts` (`shutdownServer`, ruft
  `sudo systemctl poweroff` — fixer Befehl, keine Nutzereingabe, daher keine
  Validierung nötig), Route `POST /api/admin/system/shutdown`, neue Karte
  „Server herunterfahren" in `admin/settings/system/+page.svelte` mit
  `confirm()`-Sicherheitsabfrage. Gleiche `sudoers`-Regel wie #60 (ein
  gemeinsamer Abschnitt 13 in der Installationsanleitung), gleiches
  Test-Stub-Muster. **Noch offen:** wie bei #60 — `sudoers`-Datei muss noch
  live auf dem Server angelegt werden.
- [x] **#62** Open-Source-Lizenz für das Repo hinzufügen
  **Erledigt (2026-08-24):** Lizenzen verglichen (MIT, Apache-2.0, GPL-3.0,
  AGPL-3.0) — Abhängigkeiten (`license-checker`-Scan über das ganze Monorepo)
  erzwingen keine bestimmte Wahl (fast ausschließlich MIT/ISC/BSD/Apache-2.0,
  ein paar LGPL-3.0 als reine npm-Abhängigkeit unproblematisch). Entscheidung:
  **AGPL-3.0-or-later** — die Netzwerk-Klausel (§13) greift genau beim schon
  geplanten Szenario "Verein A leiht den Server mit FairPOS an Verein B"
  (reine Netzwerknutzung ohne klassische Weitergabe, wo GPL-3.0 nicht
  greifen würde) und verhindert, dass ein kommerzieller Anbieter FairPOS als
  geschlossene SaaS-Lösung anbietet. Copyright-Halter bewusst generisch:
  "FairPOS Contributors". Kanonischer Lizenztext direkt von
  `www.gnu.org/licenses/agpl-3.0.txt` übernommen (kein Fabrizieren von
  Rechtstext) → `LICENSE` (Repo-Root). `license`-Feld in allen vier
  `package.json`-Dateien ergänzt. Neue "Lizenz"-Sektion in `README.md`,
  Kurznotiz in `CLAUDE.md`. Swissbit-TSE-SDK explizit als lizenzrechtlich
  getrennt dokumentiert (eigener Swissbit-Vertrag, nie Teil des Repos).
  Nebenbei: prominenter Hinweis auf die benötigte, separat zu beschaffende
  Swissbit-SDK ergänzt — in `README.md` direkt am Anfang und am Kopf von
  `docs/Installationsanleitung.md` (vor Abschnitt 1), damit das nicht erst
  nach vielen Installationsschritten auffällt (Abschnitt 8.1 braucht es
  zum Bauen von `tseCli`).
- [ ] **#63** Admin-Startseite zu einem echten Dashboard ausbauen
  Aktuell (`admin/+page.svelte`) nur ein Platzhalter ("Willkommen, {Name}.
  Wähle links einen Bereich aus."), keine echten Daten. Idee: Übersicht über
  Fehler und Systemzustand direkt beim Einloggen — z.B. fehlgeschlagene
  TSE-Signaturen der letzten Stunde, wartende/fehlgeschlagene Druckaufträge,
  aber auch positive Statuswerte (z.B. aktueller TSE-Zustand). **Vor der
  Umsetzung analysieren**, welche Fehler/Systemdaten tatsächlich sinnvoll
  und verfügbar sind — noch nicht festgelegt, welche Datenquellen konkret
  einfließen (Kandidaten: `tse_outage`-Tabelle für TSE-Ausfälle, `print_job`
  für die Druckwarteschlange, `GET /api/admin/tse/status` für den aktuellen
  TSE-Zustand, ggf. die bereits bestehende Tagesabschluss-Pending-Logik aus
  dem globalen Banner in `admin/+layout.svelte`). Siehe auch Task #60 für die
  geplante Server/Browser-Zeitabweichungs-Warnung, die konzeptionell
  ähnlich/ergänzend auf derselben Seite sitzen könnte.
- [ ] **#64** System-Health-Check (Sammlung technischer Prüfungen, automatisch beim Start)
  Eine Sammelstelle für technische Systemprüfungen, unabhängig von
  Business-Zuständen (die deckt eher Task #63 ab) — z.B. genug freier
  Festplattenspeicher auf allen Volumes, Datenbank fehlerfrei (keine
  korrupten Tabellen/Indizes etc.). Verhältnis zu Task #63 (Dashboard) und
  `scripts/install/smoke-test.sh` (einmaliger Check bei/nach der
  Installation) noch zu klären — vermutlich ergänzen sich alle drei:
  Health-Check als wiederverwendbare Prüf-Logik, die sowohl vom
  Smoke-Test-Skript als auch von einer Dashboard-Kachel (#63) konsumiert
  werden kann. Noch nicht analysiert, welche konkreten Prüfungen sinnvoll
  und mit vertretbarem Aufwand umsetzbar sind (z.B. Festplattenspeicher via
  `statvfs`/`df`, DB-Integrität via `pg_catalog`-Abfragen oder `VACUUM`/
  `ANALYZE`-Fehlerstatus).

  **Ergänzt (2026-08-24):**
  - **Task #58 ist Teil dieses Tasks:** der `maintainTse()`-Aufruf
    (Self-Test + Zeitsync der TSE, siehe #58) läuft als einer der
    Health-Checks hier mit, nicht als eigenständiger Mechanismus.
  - Die Checks sollen **automatisch beim Systemstart** laufen (Backend-Boot,
    analog zu `runMigrations()` in `index.ts`), nicht nur auf Abruf.
  - `maintainTse()` zusätzlich **manuell auslösbar** im TSE-Bereich der
    Admin-UI (Systemeinstellungen → System, künftig ggf. eigene Seite siehe
    Task #65) — eigener Button neben "TSE testen", nicht nur automatisch
    beim Start.
  - Ergebnisse jedes Laufs **in ein Protokoll schreiben** (Format/Ablageort
    noch offen — eigene DB-Tabelle vs. Logdatei; ggf. an das bestehende
    `tse_outage`-Muster anlehnen, das für TSE-Ausfälle schon eine Art
    Protokollierung macht).
  - Fehlerhafte Checks sollen sich im Dashboard (Task #63) zeigen.

  **Teilweise vorgezogen (2026-08-26):** Der manuelle Button (dritter Punkt
  oben) wurde live beim ersten Hardware-Test dringend — eine frisch
  eingerichtete TSE hatte nie eine gültige Uhrzeit, jede Signierung schlug
  mit `WORM_ERROR_NO_TIME_SET` fehl (siehe `DANGER.md` D-038-Fortsetzung).
  `POST /api/admin/tse/maintain` + „Zeit synchronisieren"-Button in
  `settings/tse/+page.svelte` sind fertig, getestet und **live bestätigt**
  (2026-08-26: TSE signiert seitdem fehlerfrei in Bonkasse und
  Bedienungskasse). **Weiterhin offen:**
  automatischer Aufruf beim Backend-Start, Protokollierung der Läufe,
  Anzeige fehlerhafter Checks im Dashboard (#63) — der Rest dieses Tasks.

  **Verhalten beim automatischen Start-Check präzisiert (2026-08-26):**
  Schlägt der automatische `maintainTse()`-Aufruf beim Backend-Start fehl
  (TSE nicht erreichbar/noch nicht initialisiert), soll das **nicht** den
  Start blockieren oder als harter Fehler erscheinen — stattdessen eine
  Meldung „TSE noch initialisiert" im Dashboard (Task #63), die der Admin
  sieht und daraufhin den Zeitsync manuell nachholt (Button existiert
  bereits, siehe oben). Deckt sich mit dem bereits bestehenden
  AEAO-zu-§146a-Nr.1.14.3-Prinzip in `tse/signing.ts` — Betrieb ohne
  funktionierende TSE ist zulässig, muss nur sichtbar/behebbar sein, nicht
  den Betrieb blockieren.

  **Lücke gefunden (2026-08-26):** ein "nur beim Backend-Start"-Check deckt
  nicht den Fall ab, dass die TSE danach zwischenzeitlich die Verbindung
  verliert (USB-Stick gezogen/wackelt, kurzer Stromausfall o.ä.) — nach dem
  erneuten Verbinden braucht sie vermutlich wieder Self-Test + Zeitsync,
  bevor sie erneut signieren kann (noch nicht verifiziert, ob das SDK das
  tatsächlich so verlangt, aber plausibel angesichts `WORM_ERROR_NO_TIME_SET`
  bei der ursprünglichen frischen Einrichtung). Ein einmaliger Start-Check
  bildet das nicht ab. **Nutzervorschlag: Konzept nochmal grundsätzlich
  überdenken** — statt (oder zusätzlich zu) dem Start-Check ein
  wiederkehrender Hintergrund-Job, der die TSE regelmäßig prüft und bei
  Bedarf automatisch nachsynchronisiert, statt nur einmal beim Boot und
  sonst rein manuell über den Button.

  **Präzisiert nach echtem Test auf der Hardware (2026-08-26):** Nutzer hat
  den Self-Test direkt ausprobiert — läuft in der Praxis sehr schnell und
  ressourcenarm, blockiert die TSE nur kurz. Vorschlag für den
  Hintergrund-Job: nicht blind im festen Intervall `maintainTse()` (voller
  Self-Test + Zeitsync) aufrufen, sondern zweistufig arbeiten — zyklisch nur
  den günstigen `info`-Aufruf (`getTseInfo()`) machen, dessen Ergebnis
  bereits `hasValidTime`/`hasPassedSelfTest` enthält (siehe `TseInfo` in
  `tse/types.ts`, auch schon in der Status-Karte der Admin-UI sichtbar), und
  den vollen, aufwendigeren `maintainTse()`-Aufruf nur auslösen, wenn dieser
  günstige Check tatsächlich Bedarf anzeigt. Noch zu klären: sinnvolles
  Polling-Intervall für den `info`-Check, und ob `hasPassedSelfTest`
  überhaupt zwischen zwei erfolgreichen `maintain`-Läufen wieder auf
  „nicht bestanden" zurückfällt (z. B. nach einem Verbindungsverlust) oder
  ob dafür ein anderes Signal nötig ist.
- [x] **#65** TSE-Einstellungen auf eine eigene Settings-Seite auslagern
  **Erledigt (2026-08-24):** Neue Seite `admin/settings/tse/+page.svelte`
  mit den beiden Karten „TSE-Verbindung" und „TSE-Status" (inkl. eigenem
  Speichern-Button, der nur noch `tse_mount_point`/`tse_client_id`/
  `tse_time_admin_pin` sendet — das Backend-PUT war schon immer ein
  partielles Upsert, kein Problem). `admin/settings/system/+page.svelte`
  bereinigt (nur noch Seriennummer/Zeitzone/Server-Adresse/Backup, eigener
  Speichern-Button nur für `server_address`). Neuer Nav-Punkt „TSE" in
  `admin/+layout.svelte`. Der CSS-Fix aus Task #59 ist mit umgezogen.
- [ ] **#66** SSL/HTTPS-Einrichtung dokumentieren
  Die Installationsanleitung deckt aktuell nur reines HTTP ab
  (`http://<server-ip>:3000`) — genau das hat D-030 (kaputte
  Kopieren-Buttons, weil `navigator.clipboard` einen Secure Context
  braucht) live zutage gefördert. Ein LAN-Server ohne öffentlichen
  DNS-Namen bekommt kein Let's-Encrypt-Zertifikat — vermutlich
  selbstsigniertes Zertifikat oder eine lokale CA als praktikabler Weg für
  dieses Deployment-Modell. Zu klären/dokumentieren: Reverse-Proxy (z.B.
  nginx/Caddy) vor dem Node-Prozess vs. TLS direkt in Fastify terminieren;
  wie Nutzer im LAN dem selbstsignierten Zertifikat vertrauen (Browser-
  Warnung, CA-Import); ob/wie sich das mit der bestehenden
  „kein Docker, alles nativ"-Architekturentscheidung (`docs/SETUP.md` →
  „Production-Deployment") verträgt. Ergebnis gehört in
  `docs/Installationsanleitung.md` als neuer Abschnitt.

  **Bevorzugtes Konzept, noch nicht final entschieden (2026-08-24):**
  Eigene lokale CA (z.B. via `mkcert`) statt Let's Encrypt (keine Domain
  nötig, kein Internet-Zwang — passt zum Offline-fähigen Charakter von
  FairPOS) und statt reinem Klick-weg-Selbstsigniert (schlechte UX, trainiert
  Nutzer:innen darauf, Sicherheitswarnungen wegzuklicken). Verteilung des
  öffentlichen CA-Zertifikats (nicht der private Key!) über einen bewusst
  **unverschlüsselten** Download-Endpunkt (z.B. `http://<server-ip>/ca.crt`
  — muss HTTP sein, sonst Henne-Ei-Problem: ein Gerät ohne CA-Vertrauen kann
  die Datei nicht warnungsfrei über HTTPS laden), plus Onboarding-Seite mit
  QR-Code + Schritt-für-Schritt-Anleitung je Plattform (Android/iOS/Windows/
  macOS).
  **Offene Hürde:** Das Installieren eines CA-Zertifikats in den
  Geräte-Trust-Store braucht auf den meisten Plattformen Admin-/Geräte-
  Besitzrechte — bei privaten/dienstlich verwalteten Geräten von Helfer:innen
  ggf. nicht ohne Weiteres möglich. Kein Web-Standard kann das automatisieren
  (wäre sonst ein Sicherheitsloch). Muss bei der endgültigen Entscheidung
  berücksichtigt werden — evtl. bleibt der einfache Klick-weg-Selbstsignierte
  Weg für Geräte ohne Admin-Zugriff als Fallback nötig.
- [x] **#67** Produktbeschreibung + Haftungsausschluss (README/Repo-weit)
  **Erledigt (2026-08-24):** `README.md` um eine ausführlichere
  Produktbeschreibung (was FairPOS ist, für wen, welches Problem es löst,
  Kernfunktionen) sowie eine neue "Haftungsausschluss"-Sektion ergänzt —
  Nutzung auf eigenes Risiko, keine Garantie der Konformität mit KassenSichV/
  GoBD/AO (mit Verweis auf die entsprechenden Klauseln in `LICENSE`
  Abschnitte 15/16), aber die Software orientiert sich generell an
  deutschem Recht und versucht ernsthaft, die einschlägigen Vorgaben
  abzubilden — für die ehrliche Detailaufstellung, was konkret umgesetzt
  wurde und wo Vereinfachungen getroffen wurden, Verweis auf
  `docs/Rechtliche-Anforderungen.md` (dort schon vorhanden, kein zusätzlicher
  Verweis in der Datei selbst nötig, da sie bereits das maßgebliche Dokument
  ist, auf das README verweist).
- [x] **#68** npm-Vulnerabilities + veraltete Pakete aufräumen
  Aufgekommen beim Server-Update (2026-08-25): `npm ci` meldet 24
  Vulnerabilities (1 niedrig, 13 mittel, 10 hoch) sowie mehrere
  deprecated-Warnungen (`inflight`, `rimraf@2`, `lodash.isequal`,
  `glob@7/10/11`, `whatwg-encoding`, `fstream`, `uuid@8/10`). Nicht blind
  `npm audit fix --force` verwenden — kann unkontrolliert Major-Versionen
  ziehen. Stattdessen bei der Umsetzung: `npm audit` im Detail durchgehen,
  je Fund unterscheiden zwischen (a) Produktions-Abhängigkeiten (laufen im
  Backend/Frontend mit) und (b) reinem Build-/Test-Tooling (`vite`,
  `svelte-kit`, `testcontainers`, `vitest` — nie in Produktion aktiv, geringere
  Priorität), gezielt einzeln aktualisieren statt pauschal, danach volle
  Testsuite + Build gegenprüfen. Bei kassenrelevanter Software lieber
  gründlich als schnell.
  **Erledigt (2026-08-25):** Alle 24 Findings einzeln nachverfolgt (installierte
  Version, tatsächliche Codenutzung, Upgrade-Pfad, Breaking Changes) und in
  sechs Kategorien zerlegt:
  - **Gefahrlos, umgesetzt:** `npm audit fix` (ohne `--force`) — behebt 9
    Findings rein innerhalb bestehender SemVer-Ranges (`@sveltejs/kit`
    2.67.0→2.70.3, `brace-expansion`, `concurrently` 9.2.3→9.2.4, `fast-uri`,
    `find-my-way`, `nanoid`, `postcss`, `protobufjs`, `shell-quote`).
  - **Produktions-Abhängigkeit, Major-Bump, verifiziert unschädlich:**
    `@fastify/static` 8.3.0→10.1.3 (high, Path-Traversal/Auth-Bypass). Einzige
    dokumentierte Breaking Change zwischen 8→10 ist die `setHeaders`-Signatur
    (Node-`Response`→`FastifyReply`) — `app.ts` nutzt `setHeaders` nirgends
    (nur `root`/`prefix`), also gezielt gezogen.
  - Danach volle Testsuite + Build gegengeprüft: Backend-Unit (235/235),
    Frontend-Unit (49/49), Backend-Integration inkl. Static-File-Pfad
    (144/144), `npm run build` — alles grün, keine Regression.
  - **Test-only Tooling mit Node-Versionskonflikt, Framework-Migrationskette
    ohne isolierten Fix:** ausgelagert in eigene Tasks #70 (testcontainers
    12.x verlangt Node ≥22.22) und #71 (Svelte-5-Migration nötig, um
    vite/esbuild/svelte-hmr/vitefu zu fixen).
  - **Kein Upstream-Fix verfügbar, als Restrisiko dokumentiert:** siehe
    `DANGER.md` D-033 (exceljs/uuid) und D-034 (cookie via SvelteKit).
  16 der ursprünglich 24 Findings bleiben offen — vollständig aufgeschlüsselt
  in #70/#71/DANGER.md, kein Fund wurde stillschweigend fallengelassen.
- [x] **#69** Wording „Kategorie" → „Artikelgruppe" vereinheitlichen
  **Erledigt (2026-08-25):** Gefunden beim Live-Testen — UI/Fehlermeldungen
  benutzten uneinheitlich „Kategorie"/„Artikelkategorie"/„Artikelgruppe" für
  dasselbe (`article_category`). Alle Vorkommen auf „Artikelgruppe"
  vereinheitlicht: `articles/+page.svelte`, `settings/categories/+page.svelte`
  (inkl. Seitentitel, Modal-Titel, Lösch-Bestätigung), `routes/admin/articles.ts`,
  `routes/admin/categories.ts` (alle Fehlermeldungen), `docs/Anforderungen.md`.
  `docs/Dictionary.md` als maßgebliche Referenz korrigiert (führte bisher
  „Artikelgruppe / Artikelkategorie" als gleichwertige Alternativen —
  jetzt eindeutig „Artikelgruppe" mit Hinweis auf die frühere
  Uneinheitlichkeit). `docs/Rechtliche-Anforderungen.md:67` bewusst
  unverändert gelassen — dortiges „Kategorie" bezeichnet etwas anderes
  (Gruppierung der ELSTER-Meldepflichtangaben, nicht `article_category`).
- [x] **#70** Test-Tooling: `testcontainers` auf 12.x heben (Node-≥22.22-Frage klären)
  Bei der Analyse zu Task #68 gefunden: `testcontainers`/
  `@testcontainers/postgresql` 10.28.0→12.0.4 würde die moderate/high
  Vulnerabilities in `dockerode`/`undici` beheben (reine `devDependencies`,
  laufen nie in Produktion). Zwei Breaking Changes recherchiert: (a) Node-
  Mindestversion springt in v12 auf `>=22.22` — aktuell läuft überall (lokale
  Dev-Maschinen, vermutlich CI) Node 20.x, genau die auch in
  `docs/Installationsanleitung.md` für die **Produktion** dokumentierte
  Version (Produktion selbst bräuchte kein Node 22, `testcontainers` läuft
  dort nie — aber jede Maschine, die `npm run test:integration` ausführen
  will, müsste umsteigen). (b) Default-Wartestrategie für Container ändert
  sich (Docker-Healthcheck statt reinem Port-Listening) — gegen
  `src/test/global-setup.ts` zu prüfen. Bewusst nicht in #68 mitgezogen, da
  die Node-Versionsfrage das ganze Team/CI betrifft und eine eigene
  Entscheidung verdient.
  **Erledigt (2026-08-25):** Beide Sorgen aus der #68-Analyse vertieft geprüft:
  - **Wartestrategie:** Quellcode von `@testcontainers/postgresql@10.28.0` vs.
    `12.0.4` direkt verglichen (`npm pack` + `grep`) — beide Versionen setzen in
    `PostgreSqlContainer` identisch `Wait.forAll([Wait.forHealthCheck(),
    Wait.forListeningPorts()])` und legen bei Bedarf selbst einen
    `pg_isready`-Healthcheck an. Die in den Release Notes erwähnte
    Default-Änderung betrifft nur `GenericContainer`/`DockerComposeEnvironment`
    ohne explizite Strategie — für uns folgenlos, da `global-setup.ts`
    ausschließlich `PostgreSqlContainer` nutzt.
  - **Node-Version:** präziser als angenommen — `testcontainers@12.0.4` selbst
    hat kein `engines`-Feld; erst `@testcontainers/postgresql`s `^12.0.4`-Range
    löst standardmäßig auf `12.1.0`+ auf, die `>=22.22` deklarieren. Da
    `engine-strict` in diesem Repo nicht gesetzt ist (npm-Default `false`),
    wäre das nur eine `EBADENGINE`-Warnung, kein Install-Fehler. Kein
    CI-Workflow im Repo gefunden (`.github/workflows` existiert nicht) —
    „betrifft CI" aus der ursprünglichen Formulierung trifft nicht zu, nur
    lokale Dev-Maschinen sind betroffen.
  - **Größerer, unabhängiger Fund:** Node 20 ("Iron") ist laut offiziellem
    Node-Release-Schedule bereits seit 2026-04-30 EOL — keine
    Security-Patches vom Node-Projekt mehr, betrifft direkt die dokumentierte
    Produktionsinstallation (`setup_20.x`). Dem Nutzer vorgelegt: Node-Baseline
    komplett anheben statt nur testcontainers isoliert zu betrachten.
    Entscheidung: **Node 24 LTS** (aktuelle Active-LTS seit 2025-10-28, Support
    bis 2028-04-30) statt Node 22 (bereits in reiner Maintenance-Phase).
  - Umgesetzt: `testcontainers`/`@testcontainers/postgresql` auf `^12.0.4`
    (`packages/backend/package.json`); `engines.node` in `package.json`
    (Repo-Root) auf `>=24.0.0`; `docs/Installationsanleitung.md` Abschnitt 3
    auf `setup_24.x` umgestellt. Dev-Rechner selbst per NodeSource-Befehl auf
    Node 24.19.0 gehoben (vom Nutzer ausgeführt, da diese Session keine
    `sudo`-Rechte hat) — danach `npm ci` + volle Suite unter echtem Node 24
    gegengeprüft: Build ✓, Backend-Unit 235/235 ✓, Frontend-Unit 49/49 ✓,
    Backend-Integration 144/144 ✓ (testcontainers 12.x + Postgres-Container
    real getestet, keine `EBADENGINE`-Warnung mehr). npm-Vulnerabilities damit
    von 16 auf 12 gesunken (nur noch Kategorie D/E/F aus der #68-Analyse
    offen, siehe #71/DANGER.md).
  **Noch offen:** die Produktions-Node-Version muss noch manuell auf dem
  echten Server umgestellt werden (SSH-Zugriff nötig, hat niemand aus dieser
  Session heraus — gleiches Muster wie die `sudoers`-Einrichtung bei #60/#61).
- [x] **#71** Frontend: Svelte-4→5-Migration (einziger Weg, um vite/esbuild/svelte-hmr/vitefu-CVEs zu schließen)
  Bei der Analyse zu Task #68 gefunden: die Vulnerabilities in `vite`,
  `esbuild` (transitiv über vite), `svelte-hmr`, `vitefu` und
  `@sveltejs/vite-plugin-svelte` selbst hängen zusammen — per
  `npm view <pkg> peerDependencies` verifiziert, dass bereits die niedrigste
  Version von `@sveltejs/vite-plugin-svelte`, die den Fix enthält (5.0.0),
  `svelte: ^5.0.0` verlangt. Das Projekt läuft aber auf Svelte 4.2.20. Diese
  CVEs lassen sich also nicht isoliert patchen, nur über eine vollständige
  Migration (Runes-Umstellung, kein reines Dependency-Update). Praktisches
  Risiko niedriger als der Schweregrad vermuten lässt: Frontend läuft im
  SPA-Modus (`adapter-static`, siehe `CLAUDE.md`) — die SSR-bezogenen
  Svelte-CVEs (XSS via SSR-Spread-Attribute etc.) greifen nur bei aktivem
  SSR, nicht im ausgelieferten statischen Build; die Vite/esbuild-CVEs
  betreffen primär den Dev-Server. Bewusst nicht in #68 mitgezogen — eigene
  Framework-Migration mit vollem Regressionstest, keine Bereinigung.
  **Erledigt (2026-08-25):** Auf Nutzerentscheidung hin vollständig auf
  Runes migriert statt im Svelte-5-Legacy-Kompatibilitätsmodus zu bleiben —
  Begründung: nichts ist live, die volle QA-Runde ist wegen des
  Dependency-Bumps ohnehin fällig, ein zweiter Migrationsaufwand später
  (Legacy-Modus ist als Übergangshilfe angekündigt, keine Dauerlösung)
  wäre teurer als jetzt einmal gründlich.
  - Toolchain gehoben: `svelte@5.56.10`, `@sveltejs/vite-plugin-svelte@7.3.0`,
    `vite@8.2.2`, `svelte-check@4.7.6` (`packages/frontend/package.json`).
    Erster gezielter Install ließ eine doppelte alte/neue Paketkopie im Baum
    stehen (npm hatte den bestehenden Lockfile-Graphen nur erweitert statt
    neu aufgelöst) — behoben durch vollständiges Neuaufsetzen
    (`rm -rf node_modules package-lock.json && npm install`), danach
    durchgängig eine Version pro Paket.
  - Migration mit dem offiziellen Codemod (`npx sv migrate svelte-5`, v1.10.3)
    über alle 36 `.svelte`-Dateien laufen lassen. Das Tool ist rein interaktiv
    (kein Non-Interactive-Flag) und reagiert nicht auf simples Stdin-Piping
    (Checkbox-Prompts brauchen ein echtes TTY) — mit einem kleinen
    `pexpect`-Skript (isolierte venv) über eine echte Pseudo-TTY gesteuert.
  - Codemod-Ergebnis stichprobenartig geprüft (`Modal.svelte`,
    `EventSelector.svelte`, Saalplan-Editor, Kassieren-Seite): durchgängig
    korrekte, mechanische Übersetzung — `export let` → `$props()`
    (inkl. korrekt erkannter `$bindable()` bei `bind:`-Nutzung im Aufrufer),
    `let x = y` → `$state(y)`, reine `$:`-Ableitungen → `$derived(...)`,
    `$:`-Statements mit Zuweisungen → `run()` aus `svelte/legacy`,
    `on:click` → `onclick`, `<slot />` → `{@render children?.()}`.
  - 3 durch die Migration aufgedeckte Typfehler behoben (`svelte-check`
    0→3 Fehler, danach wieder 0): `settings/company/+page.svelte` —
    `bind:this`-Ref brauchte das Svelte-5-Idiom `$state()!` statt
    unmöglichem `$state()` mit nicht-optionalem Typ;
    `settings/layouts/[id]/+page.svelte` — redundantes
    `stopPropagation(...)`-Wrapper aus `svelte/legacy` entfernt (die
    aufgerufene Funktion ruft `e.stopPropagation()` bereits selbst auf, der
    Wrapper typisierte das Event nur unnötig auf das generische `Event`
    herunter); `settings/system/+page.svelte` — `$derived(ternary)` durch
    `$derived.by(() => ...)` ersetzt (bekannte TS-Einschränkung: Narrowing
    in einer `$derived`-Ausdrucksposition funktioniert nicht zuverlässig,
    in einem Callback-Body schon).
  - Verifiziert: `svelte-check` 431 Dateien/0 Fehler (nur 2 vorbestehende
    a11y-Warnungen), `npm run build` (Root, alle drei Packages) grün,
    Backend-Unit 235/235 + Frontend-Unit 49/49 grün, `vite preview` gegen den
    Static-Build gestartet und `/`, `/login`, `/admin` per `curl` auf 200 +
    korrekt gerendertes SSR-HTML geprüft (Login-Formular mit deutschen
    Labels, Hydration-Bootstrap referenziert die neuen Bundle-Dateien).
  - npm-Vulnerabilities: 12 → 5 (nur noch die bereits in `DANGER.md`
    dokumentierten Restrisiken D-033/D-034 offen — kein Fund mehr aus
    Kategorie D der #68-Analyse).
  **Noch offen — von dieser Session nicht leistbar:** echtes interaktives
  Browser-Testing (Klickpfade: Bonkasse-Checkout, Bedienungskasse mit
  Tischen/Split-Checkout, Saalplan-Editor Drag-and-Drop, alle Formulare) —
  diese Session hat keinen Browser, nur HTTP-Ebene wurde geprüft. Laut
  `CLAUDE.md`-Konvention für Frontend-Änderungen vor Produktivsetzung
  zwingend nachzuholen, siehe auch `docs/Manueller-Testplan.md`.
- [ ] **#72** TSE-Ausfall-Log als eigene Auswertungsseite in der Admin-UI
  Aufgekommen beim ersten echten Hardware-Test (2026-08-26): `signTseTransaction()`
  zeigte bisher nur die generische Meldung „TSE nicht erreichbar" in der
  Bedienungskasse-UI (`tseWarning`), ohne den tatsächlichen Grund — der wird
  zwar bereits in `tse_outage.reason` geloggt (siehe `tse/outage.ts`), ist
  aber nirgends in der Admin-UI einsehbar. Nutzerwunsch: eine echte
  Log-Ansicht für Admins (Liste vergangener/offener Ausfälle mit Zeitpunkt +
  Fehlergrund), analog zu den bestehenden Auswertungsseiten
  (`admin/reports/*`) — dann muss die Detailmeldung nicht mehr im
  Bedienungsfrontend erscheinen, das für Nicht-Admin-Bedienpersonal gedacht
  ist.
  **Abgrenzung zu #63** (Dashboard-Ausbau): #63 ist eher eine
  Zusammenfassungs-/Alarm-Kachel auf der Startseite („N Ausfälle in der
  letzten Stunde"); dieser Task ist die dazugehörige **Detail-Log-Seite**
  zum Durchklicken/Nachschlagen — beide ergänzen sich, #63 könnte später auf
  diese Seite verlinken. Absichtlich getrennt gehalten, damit dieser Task
  auch unabhängig von der (noch unklar terminierten) vollen
  Dashboard-Überarbeitung umgesetzt werden kann.
  **Zwischenzeitliche Übergangslösung (2026-08-26):** Bis diese Seite
  existiert, zeigt `signTseTransaction()`s `warning` bewusst den echten
  Fehlergrund inline (`TSE nicht erreichbar (<Grund>) — ...`) — sonst wäre
  während des laufenden Hardware-Tests kein Fehlergrund ohne direkten
  DB-Zugriff sichtbar gewesen. Sobald dieser Task umgesetzt ist: erneut
  abwägen, ob die Bedienungskasse-Meldung wieder auf die generische Variante
  zurückgestellt wird (Nutzerpräferenz) oder der Grund als hilfreicher
  Sofort-Hinweis bestehen bleibt — bewusst nicht vorab entschieden.
- [x] **#73** Server-Adresse-Einstellung: Beschreibung verbessern + Testfunktion
  Aufgekommen beim ersten echten Hardware-Test (2026-08-26): unklar, ob das
  Feld „Server-Adresse (QR-Code)" mit oder ohne `http://`-Präfix befüllt
  werden muss — Hinweistext und Placeholder erwähnten das Protokoll gar
  nicht. Nutzerwunsch: mit Protokoll angeben lassen (der Admin weiß am
  besten, welches gilt), dazu ein Test-Button, der QR-Code + Link zum
  direkten Ausprobieren zeigt. Der zugehörige echte Bug (Backend hängte
  `http://` unbedingt vor den Wert, unabhängig von einem evtl. schon
  angegebenen Protokoll) ist separat in `DANGER.md` D-041 dokumentiert.
  **Erledigt (2026-08-26):** Hinweistext + Placeholder überarbeitet (Protokoll
  erwähnt, Beispiel mit `http://`/`https://`). Neuer „Testen"-Button neben
  dem Feld öffnet ein Modal mit QR-Code + Link zur konfigurierten
  Serveradresse (analog zum bestehenden „QR-Login-Link"-Muster in
  `users/+page.svelte`, reine Frontend-Vorschau — normalisiert das Protokoll
  clientseitig nach derselben Regel wie `buildReceiptQrUrl()` im Backend,
  Kommentar verweist auf beide Stellen). Admin kann mit dem eigenen Handy im
  WLAN sofort verifizieren, ohne erst eine echte Rechnung anzulegen.
  **Konzeptionell unzureichend (2026-08-26, Nutzer-Review):** die
  Testfunktion prüft aktuell die Erreichbarkeit von `/` (Login-Seite) — die
  `server_address`-Einstellung wird aber ausschließlich für den öffentlichen,
  nicht-authentifizierten Rechnungs-Endpunkt `/receipt/:token` verwendet
  (siehe `buildReceiptQrUrl()` in `receipt/qr.ts`). Ob das Erreichen von `/`
  tatsächlich verlässlich dasselbe testet oder ob Admins dadurch etwas
  anderes bestätigt bekommen, als sie eigentlich prüfen wollen, ist nicht
  geklärt — dafür siehe Task #80.
- [x] **#74** Bedienungskasse-Header: „Kasse wechseln" + „Abmelden" durch ein Icon ersetzen
  Aufgekommen beim ersten echten Hardware-Test (2026-08-26): die beiden
  Text-Buttons im Header nehmen auf den kleinen Touch-Bildschirmen der
  Zielhardware unnötig viel Platz weg. Nutzervorgabe: nur noch ein Home-/
  Exit-Icon, das auf den „Kasse wechseln"-Screen führt — dort gibt es
  bereits die Kassenliste, ein „Abmelden"-Button zieht ebenfalls dorthin um.
  **Erledigt (2026-08-26):** `register/+layout.svelte` — beide Text-Buttons
  durch einen einzelnen Icon-Button (⌂, `aria-label`/`title` „Kasse
  wechseln") ersetzt, bleibt wie zuvor auf der Kassen-Auswahl-Seite selbst
  ausgeblendet (nichts, wohin man von dort wechseln könnte). Die jetzt tote
  `logout()`-Funktion aus dem Layout entfernt. `register/+page.svelte`
  (Kassen-Auswahl) — neue Kopfzeile mit „Abmelden"-Button, `logout()`-Logik
  von dort übernommen (identisches Verhalten: löscht nur die
  Register-Session, eine evtl. offene Admin-Session bleibt unangetastet).
  **Icon-Button live bestätigt (2026-08-26).** Nutzer-Feedback dazu: der
  „Abmelden"-Button auf der Kassen-Auswahl-Seite saß zu prominent direkt in
  der Überschrift. **Nachgebessert (2026-08-26):** von der Kopfzeile ans
  Ende der Seite verschoben, unter die Kassenliste, mittig, als klar
  untergeordnete Aktion. **Live bestätigt (2026-08-26).**
- [x] **#75** Brand-Icon vor „FairPOS"-Schriftzug in Admin- und Kassen-UI ergänzen
  Aufgekommen beim ersten echten Hardware-Test (2026-08-26): der Login-Screen
  zeigt bereits ein Platzhalter-Icon (⊕) vor „FairPOS", die Admin- und
  Kassen-Header zeigen bisher nur den nackten Schriftzug. Nutzerwunsch: das
  gleiche Platzhalter-Icon überall ergänzen, damit die Marke konsistent
  auftritt — das eigentliche Icon wird ggf. später durch ein echtes Logo
  ersetzt, aber die Stelle soll schon jetzt überall vorgesehen sein.
  **Erledigt (2026-08-26):** `⊕` (dasselbe Zeichen wie auf dem Login-Screen)
  vor „FairPOS" ergänzt in `admin/+layout.svelte` (Sidebar-Header) und
  `register/+layout.svelte` (Kassen-Header, in kleinerer Form passend zur
  Topbar-Höhe). Keine weiteren Fundstellen — Login-Screen selbst hatte es
  schon. **Live bestätigt (2026-08-26).**
- [x] **#76** Bonkasse: Artikel-Grid verschiebt sich beim Antippen (Buttons wandern unter dem Finger weg)
  Aufgekommen beim ersten echten Hardware-Test (2026-08-26), Nutzerwunsch:
  „hier müssen wir uns Gedanken über eine gute Lösung machen" — bewusst nur
  als Task angelegt, kein Fix in dieser Session. Beobachtung: In der
  Bonkasse (`register/[id]/+page.svelte`) wächst die Bestellpositions-Liste
  (`.order-section`) bei jedem angetippten Artikel, bis sie ihre Kappung
  erreicht — dabei rutscht das Artikel-Grid (`.grid-section`) darunter jedes
  Mal ein Stück nach unten. Bei schnellem Nacheinander-Antippen (typischer
  Bonkasse-Anwendungsfall: mehrere Getränke direkt hintereinander) landet
  der nächste Fingertipp dadurch nicht mehr auf dem beabsichtigten Button.
  **Mögliche Ursache identifiziert (nicht als fertige Lösung zu verstehen):**
  `.order-section` nutzt hier `max-height: 40vh` statt einer festen `height`
  — die Sektion wächst also erst bis zur Kappung mit jedem neuen Artikel
  natürlich mit, statt von Anfang an eine feste Höhe zu belegen und intern
  zu scrollen. Die strukturell sehr ähnliche Bestellansicht der
  Bedienungskasse (`register/[id]/tables/[tableId]/order/+page.svelte`)
  nutzt für dieselbe Sektion bereits `height: 35vh; min-height: 220px;`
  (feste Höhe) und zeigt das Problem vermutlich deshalb nicht — als
  möglicher Ansatzpunkt, aber noch offen, ob eine feste Höhe für die
  Bonkasse tatsächlich die richtige Lösung ist (z. B. Platzverbrauch bei
  leerer/kurzer Bestellung auf kleinen Bildschirmen gegenprüfen) oder ob ein
  anderes Layout-Konzept besser passt.

  **Design festgelegt und umgesetzt (2026-08-26):** Nutzervorgabe — echtes
  responsives Verhalten statt nur eine feste Höhe: auf schmalen Bildschirmen
  (Handheld) Artikel-Grid **über** der Liste, beide wachsen frei mit ihrem
  Inhalt, keine interne Höhenbegrenzung mehr — die ganze Seite scrollt. Ab
  einer Tablet-Breite (z. B. iPad) wird die Bestellliste stattdessen eine
  Seitenleiste rechts (~30 % Breite) neben dem Grid, die selbst scrollt
  (`position: sticky`) und beim Scrollen durchs Grid sichtbar bleibt.
  Ausdrücklicher Wunsch: **eine** Implementierung statt zwei separat
  gepflegter Layouts — machbar über CSS Grid mit `grid-template-areas`,
  reines CSS über einen Media-Query-Breakpoint (768px), keine
  Doppel-Komponente, keine JS-Logik nötig, identische DOM-Reihenfolge in
  beiden Ansichten.
  **Erledigt (2026-08-26):** Neue `.pos-layout`-Grid-Umschließung in
  `register/[id]/+page.svelte` (Bonkasse) und `.../order/+page.svelte`
  (Bedienungskasse-Bestellansicht) — beide identisch aufgebaut. Alte feste
  Höhen/interne Scrollbereiche (`max-height: 40vh` bzw. `height: 35vh` +
  `overflow-y: auto` auf `.order-section`, `flex:1; overflow:auto` auf
  `.grid-section`) entfernt; Sidebar-Verhalten (`position: sticky` +
  `max-height`/`overflow-y: auto`) nur innerhalb des Media Querys aktiv.
  **Live bestätigt (2026-08-26).**
- [x] **#77** Button-Style app-weit überarbeiten (Kontrast aktuell sehr stark: weiß auf dunkelblau)
  Aufgekommen beim ersten echten Hardware-Test (2026-08-26), Nutzerwunsch:
  „Ggf. den Button-Style optimieren für alle Buttons". Technischer Fund als
  Ausgangspunkt: `admin/+layout.svelte:322-336`, `:global(.btn-primary)`/
  `:global(.btn-ghost)`, ist die Stelle, von der Admin **und** Kassen-UI
  ihre Button-Farben erben (obwohl konzeptionell getrennte Bereiche) —
  Korrektur zur ursprünglichen Notiz: die Login-Seite hat eine **zweite,
  eigenständige** lokale `.btn-primary`-Definition (`login/+page.svelte`,
  da außerhalb von Admin-/Register-Layout), nicht mitbetroffen von der einen
  globalen Stelle. Beide angepasst. Aktuell vorher: `.btn-primary` =
  `background: var(--color-primary)` (`#4f7cff`) + `color: #fff` — reines
  Weiß auf vollgesättigtem Blau direkt gegen den fast schwarzen
  Seitenhintergrund (`--color-bg: #0f1117`) wirkte hart/grell.
  **Erledigt (2026-08-26):** Ruhezustand über `color-mix(in srgb,
  var(--color-primary) 78%, black)` bewusst abgedunkelt/gedämpft (aus dem
  bestehenden Token abgeleitet, kein neuer Hex-Wert), Text von `#fff` auf
  `#eef1fb` leicht gedämpft, Schriftgewicht 500→600 zum Ausgleich der
  reduzierten Rohhelligkeit. Hover geht zurück auf den ursprünglichen
  `var(--color-primary)`, Press/Active auf das schon vorhandene
  `var(--color-primary-hover)` — der Button „aktiviert" sich sichtbar bei
  Interaktion, statt durchgehend in voller Intensität dazustehen.
  `.btn-ghost` bewusst unverändert gelassen — die gemeldete Härte betraf nur
  `.btn-primary` (weiß auf blau), `.btn-ghost` ist bereits gedämpft
  (transparenter Hintergrund, `--color-text-muted`).

  **Nachbesserung (2026-08-26):** Nutzer meldete, die Änderung sei nur im
  Adminbereich sichtbar gewesen. Ursache: Admin und Kassen-UI sind getrennte
  Top-Level-Routen mit eigenem code-gesplitteten CSS-Chunk (bestätigt über
  den Build-Output/Vite-Manifest) — `register/+layout.svelte` hatte für
  `.btn-primary`/`.btn-ghost` bisher **nie** eigene Farbregeln, nur die
  Touch-Größen-Overrides. Farbregeln 1:1 aus `admin/+layout.svelte` dorthin
  dupliziert (mit Kommentar, warum die Duplizierung nötig ist statt
  eine geteilte Stelle). Über den Build-Output verifiziert: die neue Farbe
  landet jetzt auch im `register`-Chunk. **Live bestätigt (2026-08-26).**
- [ ] **#78** (Low Prio) QR-Code auch auf den Bondrucker-Ausdruck bringen
  Aufgekommen beim ersten echten Hardware-Test (2026-08-26): der PDF-Beleg
  zeigt einen QR-Code (DSFinV-K Anhang I, `receipt/qr.ts`), der physische
  Bon-Ausdruck über den Thermodrucker (`escpos-receipt.ts`) nicht — kein
  Compliance-Problem (siehe `docs/Rechtliche-Anforderungen.md` Abschnitt 2:
  „✅ Geprüft (August 2026)" — alle 11 Pflichtangaben stehen auf beiden
  Ausgaben als Klartext, kein Feld fehlt), aber inkonsistent zwischen den
  beiden Ausgabekanälen. Nutzer-Einschätzung: niedrige Priorität. Technisch
  machbar über ESC/POS-QR-Druckbefehle (`GS ( k ...`, von den meisten
  modernen Thermodruckern unterstützt), aber druckerabhängig und noch nicht
  untersucht, ob/wie zuverlässig das über alle in der Zielumgebung
  eingesetzten Druckermodelle funktioniert.
- [ ] **#79** Druckauftrag „Abbrechen" soll auf Status „abgebrochen" statt Löschen umstellen
  Aufgekommen beim ersten echten Hardware-Test (2026-08-26). Aktuell löscht
  „Abbrechen" den `print_job`-Datensatz komplett (`DELETE FROM print_job
  WHERE id = $1`, an zwei Stellen: `routes/admin/printers.ts` und
  `routes/admin/print-jobs.ts` — evtl. dabei auch klären, ob beide Routen
  noch gebraucht werden oder eine davon veraltet ist). Nutzervorgabe:
  stattdessen einen neuen Status setzen (z.B. `cancelled`), der über den
  bestehenden Status-Filter der Druckwarteschlangen-Seite
  (`admin/settings/print-queue/+page.svelte`, aktuell `pending`/`printing`/
  `failed`/`done`) sichtbar bleibt — für Transparenz, was abgebrochen wurde,
  statt es spurlos verschwinden zu lassen.
  **Technischer Umfang:** Migration für den neuen `status`-Wert (aktuell
  `CHECK (status IN ('pending', 'printing', 'done', 'failed'))` in
  `0001_initial.sql` — laut Konvention als neue nummerierte Migration, nicht
  rückwirkend ändern); beide Backend-Endpunkte von `DELETE` auf ein `UPDATE
  ... SET status = 'cancelled'` umstellen; Frontend-Status-Filter um den
  neuen Wert ergänzen.
- [ ] **#80** Server-Adresse-Testfunktion (Task #73) prüft die falsche Sache — Konzept überarbeiten
  Beim Nutzer-Review von Task #73 aufgefallen (2026-08-26): der neue
  „Testen"-Button in den Systemeinstellungen zeigt einen QR-Code + Link zu
  `<server_address>/` — das ist die Login-Seite des Backends. Die
  `server_address`-Einstellung wird aber ausschließlich für den öffentlichen,
  nicht-authentifizierten Rechnungs-Endpunkt `/receipt/:token`
  verwendet — genau der Pfad, den ein Kunde nach dem Bezahlen scannt, um
  seine PDF-Rechnung zu sehen, ganz ohne Login. Ob das Backend unter der
  konfigurierten Adresse erreichbar ist, muss nicht zwingend heißen, dass
  auch der öffentliche Rechnungs-Pfad im selben Sinne „funktioniert" (und
  umgekehrt), auch wenn beide vom selben Fastify-Prozess bedient werden —
  ungeklärt, ob Admins durch den Test etwas anderes bestätigt bekommen, als
  sie eigentlich prüfen wollen.
  **Zu klären, bevor implementiert wird:** Wie sieht ein Test aus, der
  wirklich den `/receipt/:token`-Pfad abbildet, wenn beim Testen (noch)
  keine echte Rechnung/kein echter Token existiert? Optionen zum Abwägen:
  ein eigener, dedizierter Test-Endpunkt, der wie `/receipt/:token`
  aussieht/sich verhält, aber keinen echten Token braucht; ein Hinweistext,
  der ehrlich sagt, was der Test tatsächlich zeigt (reine
  Netzwerk-Erreichbarkeit des Servers) statt zu suggerieren, der komplette
  Rechnungs-Abruf sei geprüft; oder etwas anderes — noch keine Entscheidung
  getroffen.
- [x] **#81** Checkout-/Bestell-Tabellen-Overflow (D-039) — Nachbesserung
  Der erste Fix (`.line-name` mit `min-width: 0` + Ellipsis auf der
  Bestellansicht, `table-layout: fixed` mit festen Spaltenbreiten auf der
  Checkout-Tabelle — siehe `DANGER.md` D-039) war beim erneuten Live-Test
  nicht ausreichend: „teilweise gelöst aber passt noch nicht ganz" (Nutzer,
  2026-08-26). Präzisiert per Screenshot: auf einem iPhone (schmaler
  Bildschirm) verschwand der Artikelname jetzt **komplett** — die
  Ellipsis-Lösung konnte zwar schrumpfen, aber die übrigen Spalten (farbiger
  Punkt, Einzelpreis, +/−-Stepper, Gesamtpreis) beanspruchten so viel Platz,
  dass für den Namen praktisch nichts mehr übrig blieb. Nutzervorgabe:
  Platz sparen statt nur schrumpfen lassen — farbigen Punkt vor jeder Zeile
  entfernen, +/−-Buttons verkleinern, Gesamtpreis-Spalte (ganz rechts)
  komplett weglassen.
  **Erledigt (2026-08-26)**, auf beiden betroffenen Screens
  (`register/[id]/+page.svelte` Bonkasse, `.../order/+page.svelte`
  Bedienungskasse-Bestellansicht — identisches Layout-Muster, konsistent
  behandelt; die zuvor nur auf der Bestellansicht vorhandene
  Ellipsis-Behandlung fehlte in der Bonkasse ganz und wurde dabei ergänzt):
  `.line-dot` (Punkt) und `.line-total` (Gesamtpreis je Zeile) aus Markup und
  Grid-Spalten entfernt (`grid-template-columns` von `12px 1fr 4em auto 5em`
  auf `1fr 4em auto`), jetzt tote `colorOf()`-Helper mit entfernt. Stepper-
  Buttons (`.qty-btn`) von 44px (aus dem app-weiten Touch-Target-Minimum in
  `register/+layout.svelte`, per `!important`) auf 32px verkleinert — bewusst
  nur für diese Zeilen per höherer Selektor-Spezifität überschrieben, statt
  das app-weite Minimum überall aufzuweichen. Die Gesamtsumme über alle
  Positionen (`.total-row`, unterhalb der Liste) bleibt unverändert
  bestehen — nur die Zeilen-Einzelsumme fiel weg, kein Informationsverlust
  bei „was kostet das insgesamt". **Live bestätigt (2026-08-26).**
- [x] **#82** Update-Ablauf als Skript (`scripts/install/update.sh`)
  Aufgekommen beim Hardware-Test (2026-08-26) — der Update-Ablauf aus
  Abschnitt 12 der Installationsanleitung wurde an diesem Tag mehrfach von
  Hand wiederholt. Nutzervorgabe: von einem beliebigen Account per `sudo`
  startbar, das Skript soll selbst prüfen, ob es Root-Rechte hat, und intern
  mit dem richtigen (Service-)User arbeiten.
  **Erledigt (2026-08-26):** `scripts/install/update.sh` — bricht ab, wenn
  nicht als root gestartet; ermittelt den Service-User nicht per Annahme,
  sondern liest ihn aus der bereits installierten systemd-Unit
  (`/etc/systemd/system/fairpos.service`, `User=`-Zeile) zurück, Fallback
  `fairpos` falls die Unit noch nicht existiert. `git pull`/`npm ci`/Build/
  Migration laufen über `sudo -u <service-user>`, damit im Checkout nichts
  root-owned zurückbleibt — nur `systemctl restart` läuft tatsächlich als
  root. Schließt mit einem Aufruf von `smoke-test.sh` ab. Ausführbar-Bit
  gesetzt (`git update-index --chmod=+x`, siehe D-028 zur WSL-Falle).
  In Abschnitt 9 (Skript-Tabelle) und Abschnitt 12 (Updates) der
  Installationsanleitung referenziert, alte manuelle Befehlsfolge bleibt als
  Fallback dokumentiert.
  **Erste Live-Ausführung (2026-08-26):** Alle Schritte (Pull, Build,
  Migration, Neustart) liefen als `fairpos` erfolgreich durch — der
  abschließende Smoke-Test schlug allerdings beim Health-Check fehl, weil
  der Backend-Prozess nach dem Neustart noch nicht ganz hochgefahren war
  (`systemctl restart` gilt schon als „aktiv", bevor der Port gebunden ist)
  — behoben in `smoke-test.sh` selbst, siehe `DANGER.md` D-045 (Retry statt
  Einzelversuch).
  **Vollständig live bestätigt (2026-08-26):** zweiter `update.sh`-Lauf mit
  dem Retry-Fix lief komplett durch, alle Smoke-Test-Checks inkl.
  Health-Check grün.
- [x] **#83** Label „Gesamt" vor dem Summenbetrag entfernen (Bonkasse + Bedienungskasse-Bestellansicht)
  Aufgekommen beim Hardware-Test (2026-08-26), Nutzervorgabe: ergibt sich aus
  dem Kontext (großer Betrag direkt neben dem „Kassieren"/„Bestellen"-Button),
  braucht kein eigenes Label.
  **Erledigt (2026-08-26):** `<span class="total-label">Gesamt</span>` aus
  `register/[id]/+page.svelte` (Bonkasse) und `.../order/+page.svelte`
  (Bedienungskasse-Bestellansicht) entfernt, jetzt tote `.total-label`-CSS-
  Regel in beiden Dateien mit entfernt. `checkout/+page.svelte` bewusst
  unverändert — dort steht „Summe" als Tabellen-Zellwert unter einer
  gleichnamigen Spaltenüberschrift, ein anderer, nicht vom Nutzer
  angesprochener Kontext. **Noch nicht live durch den Nutzer bestätigt.**
- [ ] **#84** Artikel löschen, das bereits verkauft wurde → „Internal Server Error" statt klarer Fehlermeldung
  Aufgekommen beim Hardware-Test (2026-08-26). Bestätigt: `DELETE
  /api/admin/articles/:id` (`routes/admin/articles.ts`) fängt anders als die
  Endpunkte für Kassen/Benutzer/Drucker (Task #54/#56/#57) keine
  `23503`-Fremdschlüsselverletzung ab — `order_item.article_id` ist `NOT
  NULL REFERENCES article(id)` ohne `ON DELETE CASCADE`
  (`0001_initial.sql`), ein bereits verkaufter Artikel kann also nie
  gelöscht werden, der rohe Postgres-Fehler geht aber ungefangen als 500 an
  den Client durch. Nutzervorgabe: Artikel müssen irgendwie entfernbar
  bleiben (sonst sammeln sie sich endlos an), Vorschlag: nur logisch löschen
  (im UI ausblenden) statt hart aus der DB zu entfernen.
  **Guter Ausgangspunkt für die Umsetzung:** `article.is_active` existiert
  bereits (im Gegensatz zu Task #55/#56, wo das Feld erst per Migration
  ergänzt werden musste) — Admin-UI hat auch schon eine vollständige
  „Aktiv"-Checkbox samt Listen-Spalte (`admin/articles/+page.svelte`). Es
  fehlt nur die Backend-Fehlerbehandlung selbst — vermutlich reicht, dem
  `DELETE`-Handler denselben `23503`→409-Fang wie bei #54/#57 zu geben
  (Fehlermeldung verweist auf die „Aktiv"-Checkbox statt nur generisch
  „wird noch verwendet"), kein Migrations- oder Frontend-Aufwand absehbar.
  Nicht in dieser Session umgesetzt, nur als Task angelegt wie gewünscht.
- [x] **#85** „Halten statt Tippen" (Long-Press) für kritische Kassieren-/Bestellen-Buttons
  Aufgekommen beim Hardware-Test (2026-08-26): versehentliches Antippen von
  „Kassieren"/„Bestellen" sollte verhindert werden. Nutzerfrage: sowas wie
  der iPhone-Slide-to-Answer, gibt's das im Framework? Antwort: nein (reine
  Svelte-5-App ohne UI-Kit wie Ionic/Material, das sowas mitbringt), ein
  Swipe-Slider wäre eine komplette Eigenentwicklung. Alternativen
  vorgeschlagen (Bestätigungsdialog / Swipe-Slider / Long-Press) —
  Nutzerentscheidung: Long-Press, da deutlich einfacher als ein Slider
  (kein Drag-Tracking nötig) und wirksamer gegen Fehlklicks als ein
  zusätzlicher Bestätigungsdialog. Betroffen: Bonkasse „Kassieren",
  Bedienungskasse „Bestellen" (Bestellansicht) und „Kassieren"
  (Checkout-Screen). Buttons sollen erkennbar gekennzeichnet sein, damit
  klar ist, dass sie gehalten statt getippt werden müssen.
  **Erledigt (2026-08-26):** Neue, wiederverwendbare Svelte-Action
  `$lib/longpress.ts` (`use:longpress={{ onHold, durationMs? }}`, Default
  600ms) — feuert `onHold` erst nach durchgehendem Halten, bricht bei
  vorzeitigem Loslassen/Verlassen des Elements sauber ab. Ein
  `setTimeout` ist die alleinige Quelle der Wahrheit dafür, ob die Aktion
  auslöst; eine `holding`-CSS-Klasse treibt zusätzlich eine rein
  kosmetische Füllanimation (`.hold-btn`/`.hold-fill`, links nach rechts,
  Transition-Dauer an `durationMs` angeglichen). Kennzeichnung: ⏱-Symbol
  + „(halten)"-Zusatz im Button-Text, `aria-label` mit vollständiger
  Erklärung für Screenreader. An allen drei genannten Stellen verdrahtet
  (`register/[id]/+page.svelte`, `.../order/+page.svelte`,
  `.../checkout/+page.svelte`) — CSS dort jeweils dupliziert (gleicher
  Grund wie bei den Button-Grundfarben: separate code-gesplittete
  Layout-Bäume, siehe Task #77-Nachbesserung). 8 neue Unit-Tests
  (`longpress.test.ts`, jsdom + Fake-Timer): löst nach voller Haltedauer
  aus, löst bei vorzeitigem Loslassen/Verlassen nicht aus, ignoriert
  Nicht-Primärtasten (Rechtsklick), `holding`-Klasse korrekt gesetzt/
  entfernt, `destroy()` entfernt alle Listener, konfigurierbare Dauer.
  **Noch nicht live durch den Nutzer bestätigt.**
