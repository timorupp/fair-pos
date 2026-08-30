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
- [x] **#63** Admin-Startseite zu einem echten Dashboard ausbauen
  Aktuell (`admin/+page.svelte`) nur ein Platzhalter ("Willkommen, {Name}.
  Wähle links einen Bereich aus.") plus die schon umgesetzte Uhrzeit-
  Abweichungs-Warnung aus Task #60. Idee: Übersicht über Fehler und
  Systemzustand direkt beim Einloggen.

  **Konzept geprüft und final (2026-08-29):** Fokus in diesem Schritt
  bewusst nur auf Systemzustand/Fehler, keine Geschäftszahlen (Tagesumsatz
  o.Ä.) — dafür eigene Folgeaufgabe, siehe Task #93. Datenquellen, alle
  ohne neue Backend-Arbeit aus bestehenden Endpoints ableitbar:
  - **TSE-Zustand** — letzter `system_log`-Eintrag der Kategorie
    `tse_health` über `GET /api/admin/logs?category=tse_health`
    (geschrieben von `tse/healthJob.ts`, dessen Kommentar ausdrücklich auf
    dieses Dashboard verweist). **Bewusst nicht** `GET /api/admin/tse/status`
    verwenden — der ruft laut eigenem Kommentar echte TSE-Hardware auf
    ("deliberately not part of the cheap status endpoint") und darf nicht
    bei jedem Dashboard-Aufruf laufen.
  - **Offener TSE-Ausfall** — `GET /api/admin/reports/tse-outages`, oberste
    Zeile mit `ended_at = null`.
  - **Druckwarteschlange** — `GET /api/admin/print-jobs?status=failed`
    (Anzahl), optional zusätzlich `pending`-Anzahl.
  - **Ausstehende Tagesabschlüsse** — `GET /api/admin/closings/pending`
    (bereits als globaler Banner in `admin/+layout.svelte` genutzt) — auf
    dem Dashboard als eigene Karte mit mehr Detail (welche Kassen/Tage)
    statt nur des knappen Banners, beide verlinken auf `/admin/registers`.
  - **Aktive Sitzungen** — `GET /api/admin/sessions`, Anzahl.
  - **Aktive IP-Sperren + Reset** (aus #90) — **Entscheidung (2026-08-29):**
    zieht komplett von der Systemseite hierher um, inkl. Reset-Button
    (`POST /api/admin/system/reset-ip-lockouts`) — nicht auf beiden Seiten,
    nur noch auf dem Dashboard. `admin/settings/system/+page.svelte`
    verliert diese Anzeige entsprechend.

  **Layout-Idee:** oben eine Warnzeile (nur sichtbar, wenn tatsächlich etwas
  ansteht: offener TSE-Ausfall, TSE laut letztem Health-Log ungesund,
  fehlgeschlagene Druckaufträge, aktive IP-Sperren), darunter ruhige
  Kennzahlen-Kacheln für den Rest. Jede Karte verlinkt auf die zugehörige
  bestehende Seite statt Funktionalität zu duplizieren.

  **Erledigt (2026-08-29):** `admin/+page.svelte` komplett neu — Warnzeile
  (Zeitabweichung, offener TSE-Ausfall, aktive IP-Sperren inkl.
  Reset-Button) plus vier Kennzahlen-Kacheln (TSE-Zustand aus dem letzten
  `system_log`-Eintrag Kategorie `tse_health`, ausstehende Tagesabschlüsse
  mit Registerliste, Druckwarteschlange fehlgeschlagen/wartend, aktive
  Sitzungen). IP-Sperren-Anzeige + Reset-Button aus
  `admin/settings/system/+page.svelte` entfernt (nur noch aufs Dashboard,
  wie entschieden). Keine neuen Backend-Endpoints nötig — alles aus
  bestehenden, günstigen Routen zusammengesetzt. Gegen die echte Dev-DB
  verifiziert (offener TSE-Ausfall + mehrere ausstehende Tagesabschlüsse
  lösten die Warnzustände korrekt aus). Geschäftszahlen bewusst nicht
  enthalten, siehe Task #93.
  **Nachbesserung (2026-08-29, Nutzerbericht "Einstellungen-Menü wird immer
  größer"):** neuer Hauptmenüpunkt „Monitoring" in `admin/+layout.svelte`,
  dahin verschoben: Aktive Sessions, Druckwarteschlange, Systemprotokoll
  (vorher alle drei unter „Einstellungen").
  **Nachbesserung (2026-08-29):** "Willkommen, {Name}."-Zeile wieder
  entfernt (überflüssig neben den Kacheln). Außerdem eine echte Lücke
  behoben: es gab keinen Weg zurück zur Kassenauswahl aus dem
  Adminbereich heraus, nur "Abmelden" — neuer Button "Zur Kassenauswahl"
  im `sidebar-footer` neben "Abmelden" (`goto('/register')`, keine
  erneute Passwort-Eingabe nötig beim späteren Zurückwechseln, da
  `admin_verified` an der Session hängt, nicht am Navigationsweg).
  **Bug gefunden und behoben (Nutzerbericht: "IP-Sperren-Funktion
  komplett aus der Admin-UI verschwunden"):** die IP-Sperren-Karte lebte
  nur in der Warnzeile, die komplett ausgeblendet wird sobald keine
  Sperre aktiv ist (Normalfall) — der Reset-Button war dadurch faktisch
  unerreichbar, nicht nur unauffällig. Jetzt eigene, immer sichtbare
  Kachel ("PIN-Login: IP-Sperren", ✓/⚠ + Reset-Button nur wenn nötig),
  aus der Warnzeile entfernt, analog zu den anderen vier Kacheln.
  **Bug gefunden und behoben (Nutzerbericht: "Druckwarteschlange zeigt
  keine Fehler trotz fehlgeschlagenem Auftrag"):** `failed`-Status ist
  laut `print-worker.ts` der *endgültige* Aufgabe-Zustand erst nach
  MAX_ATTEMPTS — betrifft in der Praxis meist alte, nicht mehr relevante
  Aufträge. Ein Auftrag, der gerade wirklich Probleme macht, steht
  stattdessen weiterhin auf `pending` (wird noch automatisch erneut
  versucht) mit gesetztem `error_message` aus dem letzten Versuch — genau
  das ist jetzt das Kriterium (`status = 'pending' AND error_message IS
  NOT NULL`) statt `status = 'failed'`. Variable umbenannt
  (`failedPrintJobs` → `erroringPrintJobs`) und Kachel-Text angepasst
  ("X mit Fehler" statt "X fehlgeschlagen"), um nicht weiter den Eindruck
  zu erwecken, es ginge um den `failed`-Status.
  **Nachbesserungen Systemeinstellungen (2026-08-29):** „Aktuelle
  Browserzeit übernehmen" speichert jetzt direkt (statt nur das Feld zu
  befüllen und ein zweites, zeitkritisches Klicken auf „Setzen" zu
  verlangen — Nutzerbericht: "muss sehr schnell auf Setzen klicken, das
  macht keinen Sinn"). Button-Beschriftung „Setzen"/„Setze…" bei
  Systemzeit und Zeitzone zu „Speichern"/„Speichere…" vereinheitlicht.
  **Erweiterung (2026-08-29, Nutzerwunsch):** zwei weitere Kacheln —
  „Tagesumsatz" (alle heute gebuchten Einnahmen, beide Zahlungsarten,
  Stornos/kostenfrei ausgeschlossen, neuer Endpoint
  `GET /api/admin/reports/today-revenue` — kalendertäglich, bewusst nicht
  veranstaltungsgebunden wie die übrigen Auswertungen, „heute" löst
  Postgres selbst per `CURRENT_DATE` auf) und „Offene Rechnungen" (Summe
  aller offenen Tisch-Positionen, wiederverwendet den bestehenden
  `/open-positions`-Endpoint, keine Backend-Änderung nötig). Beide
  verlinken auf die jeweils bestehende Auswertungsseite
  (Soll-Kassenstand/Offene Positionen). Damit ist ein Teil von Task #93
  bereits vorgezogen umgesetzt — dort verbleibt der Rest.
  **Auto-Refresh (2026-08-29, Nutzerwunsch):** alle 30 Sekunden werden
  sämtliche Kacheln im Hintergrund neu geladen (kein "Lade…"-Flackern,
  nur die Werte aktualisieren sich still).
  **Textkürzungen (2026-08-29, Nutzerwunsch):** `tse/healthJob.ts`s
  Erfolgsmeldung „Automatischer Self-Test + Zeitsync erfolgreich." zu
  „Selbsttest erfolgreich" gekürzt (wirkt sich auch auf den Log-Viewer
  aus, da derselbe `system_log`-Eintrag beide Stellen speist) — die
  Fehlermeldung mit der eingebetteten TSE-Fehlerursache blieb bewusst
  unverändert. Kachel-Detailtext „Angemeldete Geräte (Kasse +
  Verwaltung)" zu „Derzeit angemeldete Geräte" gekürzt.
- [x] **#64** System-Health-Check (Sammlung technischer Prüfungen, automatisch beim Start)
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

  **Nutzerentscheidungen (2026-08-26):**
  - Umfang nur TSE — Festplatte/DB-Integrität wird eigener, manuell
    auslösbarer Task (noch nicht als eigener Eintrag angelegt).
  - Polling-Intervall: jede volle Minute.
  - `hasPassedSelfTest`/`hasValidTime` fallen nach Verbindungsverlust
    tatsächlich zurück auf „nicht bestanden" — live verifiziert.
  - Protokollierung in eigener DB-Tabelle, bewusst generisch angelegt
    (`created_at`, `severity`, `category`, `message`), damit künftige
    weitere Prüfungen dieselbe Tabelle mitnutzen können.
  - Log-Viewer als eigenständiges neues Modul in der Admin-UI, unabhängig
    von Task #63.

  **Erledigt (2026-08-26):**
  - Migration `0009_system_log.sql` (Tabelle `system_log`).
  - `system/log.ts` (`logSystemEvent()`).
  - `tse/healthJob.ts`: zweistufiger Hintergrund-Job (`tick()`, `setInterval`
    alle 60s über `startTseHealthJob()`, aufgerufen aus `index.ts` nach
    `startPrintWorker()`) — pollt den günstigen `info`-Aufruf, löst
    `maintainTse()` nur bei tatsächlichem Bedarf aus. Loggt nur bei
    Zustandswechsel (gesund→ungesund, ungesund→gesund, oder ein
    `maintain`-Versuch), nicht bei jedem Tick.
  - Sowohl der automatische Hintergrund-Job als auch der manuelle „Zeit
    synchronisieren"-Button (`POST /api/admin/tse/maintain`) erzeugen bei
    Erfolg einen INFO-Log-Eintrag (Nutzervorgabe).
  - Neues Admin-Modul „Systemprotokoll" (`admin/settings/logs/+page.svelte`,
    Backend `GET /api/admin/logs` + `/categories` in `routes/admin/logs.ts`)
    mit Schweregrad-/Kategorie-Filter, automatischer Aktualisierung alle 10s,
    auf 500 neueste Einträge begrenzt. Nav-Punkt unter „Einstellungen".
  - Unit-/Integrationstests für `healthJob.ts`, `system/log.ts` und die
    neuen/geänderten Routen (`tse.ts`, `logs.ts`) — alle grün, ebenso
    Typecheck und Build für Backend und Frontend.
  **Live bestätigt (2026-08-26):** Systemprotokoll-Seite öffnet und zeigt
  Einträge; Verbindungsverlust/-wiederherstellung wird korrekt geloggt;
  manuelles „Zeit synchronisieren" erzeugt den INFO-Eintrag; Filter
  funktionieren. Sofort-Tick beim Backend-Start läuft wie vorgesehen — bei
  bereits gesunder TSE bewusst **ohne** sichtbaren Log-Eintrag (nur
  Zustandswechsel werden geloggt), das anfangs wie eine verzögerte erste
  Prüfung wirkte, war aber erwartetes Verhalten und keine Verzögerung.

  **Erledigt (2026-08-29):** Anzeige fehlerhafter Checks im Dashboard —
  die „TSE-Zustand"-Kachel auf `admin/+page.svelte` (Task #63) liest genau
  den letzten `system_log`-Eintrag der Kategorie `tse_health`. Damit sind
  alle drei ursprünglich offenen Punkte abgedeckt; der einzig verbleibende
  Teil des ursprünglichen Umfangs (Festplatten-/DB-Integritätscheck) war
  bereits vorher bewusst als eigener Task #87 abgetrennt.
- [x] **#65** TSE-Einstellungen auf eine eigene Settings-Seite auslagern
  **Erledigt (2026-08-24):** Neue Seite `admin/settings/tse/+page.svelte`
  mit den beiden Karten „TSE-Verbindung" und „TSE-Status" (inkl. eigenem
  Speichern-Button, der nur noch `tse_mount_point`/`tse_client_id`/
  `tse_time_admin_pin` sendet — das Backend-PUT war schon immer ein
  partielles Upsert, kein Problem). `admin/settings/system/+page.svelte`
  bereinigt (nur noch Seriennummer/Zeitzone/Server-Adresse/Backup, eigener
  Speichern-Button nur für `server_address`). Neuer Nav-Punkt „TSE" in
  `admin/+layout.svelte`. Der CSS-Fix aus Task #59 ist mit umgezogen.
- [x] **#66** SSL/HTTPS-Einrichtung dokumentieren
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

  **Ergänzung/Architektur-Konzept (2026-08-29):** Nutzervorschlag — ein
  Reverse-Proxy (z. B. Apache, nur als Beispiel genannt, kein fester
  Produktentscheid) terminiert TLS, nicht Fastify selbst. Der App-Server
  ist von außen **gar nicht** direkt erreichbar, ausschließlich über den
  Reverse-Proxy. Upload-Funktion im Adminbereich (Systemeinstellungen) für
  das Zertifikat; landet an der vom Reverse-Proxy referenzierten Stelle,
  anschließend Neustart von dessen Webserver-Dienst — analog zum
  bestehenden Muster bei anderen privilegierten Aktionen
  (`system/time.ts`/`system/shutdown.ts`: sudoers-Regel + gezielter, eng
  begrenzter Befehl statt allgemeiner Rechte).

  **Eigentliches Ziel des Uploads, präzisiert:** nicht primär für
  selbstsignierte/eigene-CA-Zertifikate gedacht (die dürfen weiterhin
  hochgeladen werden, wer will) — Kernidee ist, den Bedienungen mit
  eigenen Geräten das Installieren eines eigenen CA-Zertifikats komplett zu
  **ersparen**. Weg dafür: **Split-Horizon-/Split-Brain-DNS mit einer
  echten, öffentlich validierten Domain — siehe Task #92** (dort das
  DNS-Masquerading-Konzept inkl. der dafür nötigen Backend-Einstellungen).
  Die Upload-Funktion hier ist dabei nur der Verteilweg für das
  (typischerweise alle ~90 Tage erneuerte) Zertifikat, unabhängig davon, ob
  es über Task #92s DNS-01-Weg oder eine lokale CA entstand.

  **Noch zu klären (dieser Task, unabhängig von #92):** welcher
  Reverse-Proxy konkret (Apache/nginx/Caddy/…), Zertifikatsformat/
  -validierung beim Upload (PEM? Kette inkl. Intermediate-Zertifikat
  nötig?), fester Dateipfad, den der Upload überschreibt, vs. Config-Datei
  anpassen, genaue sudoers-Regel für den Neustart.

  **Konzept im Detail besprochen und entschieden (2026-08-29):** nginx
  (Standard-Ubuntu-Paket, gegen Caddy/Apache abgewogen — Caddys
  automatisches ACME-HTTPS bringt hier nichts, da FairPOS für den
  lokalen-CA-Weg bewusst kein Let's Encrypt nutzt). Umfang dieses Tasks:
  Proxy-Infrastruktur **inklusive** Zertifikat-Upload + Neustart-Button
  (nicht getrennt). Zwei Dateifelder (Zertifikat, privater Schlüssel),
  keine separate Kettendatei nötig (eine bereits verkettete Fullchain-PEM
  funktioniert als "Zertifikat"-Feld genauso). `server_name` bleibt
  dauerhaft Catch-all (`_`) — nur ein einziger vHost, eine Einschränkung
  brächte nichts. Bei der Gelegenheit einen echten, bisher unbemerkten
  Fund korrigiert: `AGENTS.md` (vormals `CLAUDE.md`, siehe unten)
  behauptete SSE als Architekturentscheidung — im Code gibt es dafür
  **keine einzige Verwendung**, alle Echtzeit-Updates laufen über simples
  Client-Polling. Korrigiert, kein SSE-Timeout-Tuning in der
  nginx-Config nötig.

  **Erledigt (2026-08-29):**
  - **Netzwerk:** neue `HOST`-Env-Variable (`config.ts`, Default
    `0.0.0.0` — bestehende Installationen ohne Proxy unverändert
    funktionsfähig), `index.ts` nutzt sie statt des bisher fest
    codierten `'0.0.0.0'`. Installationsanleitung empfiehlt
    `HOST=127.0.0.1`, sobald nginx davor läuft, damit der App-Server
    nicht mehr parallel unverschlüsselt erreichbar ist.
  - **Validierung (`system/tlsCert.ts`, `validateCertKeyPair`):** rein
    in-memory, vor jeder privilegierten Aktion — Node-`crypto`
    (`X509Certificate`, `createPrivateKey`, `checkPrivateKey()`) prüft
    Format, dass Schlüssel zum Zertifikat passt, und dass es noch nicht
    abgelaufen ist. Klare deutsche Fehlermeldungen statt roher
    OpenSSL-Fehler.
  - **Installation (`installCert`):** schreibt validiertes Paar in ein
    für `fairpos` beschreibbares Staging-Verzeichnis
    (`config.tlsStagingDir`), ruft dann ein **parameterloses**
    Sudo-Skript auf (strenger als das `timedatectl set-time *`-Muster
    aus Abschnitt 13 — kein Wildcard nötig, da immer derselbe feste
    Pfad). Das Skript (Inhalt in
    `docs/Installationsanleitung.md` Abschnitt 14.4, nicht als
    Repo-Datei — analog zum bestehenden Sudoers-Muster) sichert das
    alte Zertifikat, installiert das neue, prüft mit `nginx -t`, rollt
    bei Fehler automatisch zurück (Proxy bleibt so immer erreichbar),
    lädt sonst neu.
  - **Anzeige (`readInstalledCertInfo`):** liest das aktuell installierte
    (world-readable, `0644`) Zertifikat direkt von der Festplatte,
    keine separate DB-Speicherung — keine Drift-Gefahr zwischen
    Anzeige und Realität.
  - **Backend-Route** `GET`/`POST /api/admin/tls-cert`
    (`routes/admin/tlsCert.ts`), reines JSON (kein Multipart — PEM ist
    Text, kein Binärformat, spart eine Anpassung des globalen
    `@fastify/multipart`-`files: 1`-Limits).
  - **Neue eigenständige Admin-Seite** „SSL-Zertifikat" unter
    Einstellungen (`admin/settings/tls-cert/+page.svelte`) — bewusst
    nicht in „System"/„TSE" integriert (Nutzervorgabe: bestehende Seiten
    sollen nicht zu umfangreich werden). Zeigt aktuelles Zertifikat
    (Aussteller, gültig von/bis) + Upload-Formular mit
    Sicherheitsabfrage vor dem Ersetzen.
  - **Doku:** `docs/Installationsanleitung.md` Abschnitt 14
    (nginx-Installation, Platzhalter-Zertifikat, Config, Sudoers-Regel)
    — als "optional, aber empfohlen" eingestuft wie Abschnitt 13, mit
    Copy-Paste-Heredocs statt einem neuen nummerierten Skript unter
    `scripts/install/`.
  - Unit-Tests (`system/tlsCert.test.ts`, 5 Tests, Fixtures in
    `test/fixtures/testCert.ts`: gültiges Paar, kaputtes
    Zertifikat/Schlüssel, nicht-passender Schlüssel, abgelaufen via
    `vi.setSystemTime`) und Integrationstests
    (`routes/admin/tlsCert.integration.test.ts`, 7 Tests, Sudo-Stub-Muster
    wie bei Task #60/#61). Backend-Unit (274/274), Backend-Integration,
    Frontend-Unit (70/70), Typecheck grün.

  **Nebenbei erledigt (im Zuge der Konzept-Diskussion):** `CLAUDE.md` zu
  `AGENTS.md` umbenannt (Toolneutralität, Nutzerwunsch) — `git mv` erhält
  die Historie. `CLAUDE.md` existiert weiterhin als winzige Datei mit
  Claude Codes eigenem, dokumentiert bestätigtem `@AGENTS.md`-Import
  (kein Symlink — wäre auf dem WSL/Windows-Setup fragil gewesen).
  Aktive Code-Referenz in `auth/rateLimit.ts` mitaktualisiert; historische
  Verweise in `TASKS.md`/`DANGER.md` bewusst unverändert (datierte
  Journal-Einträge, kein aktueller Zustand).

  **Weiterhin offen (siehe Task #92):** lokale CA + Onboarding-Seite mit
  QR-Code, Split-Horizon-DNS. Der Upload hier akzeptiert schon jetzt jedes
  beliebige Zertifikat, unabhängig davon, wie es entstanden ist.

  **Live bestätigt (2026-08-30):** kompletter Abschnitt 14 auf dem echten
  Produktionsserver durchgeführt — nginx installiert, Platzhalter-Zertifikat
  erzeugt, Proxy funktionsfähig (`https://<server-ip>` erreichbar), `HOST=
  127.0.0.1` gesetzt (Port 3000 danach nicht mehr direkt erreichbar),
  Sudoers-Regel + Staging-Verzeichnis angelegt, echtes Zertifikat über die
  Admin-UI hochgeladen und installiert.
  **Dabei gefunden und behoben:** der neue `HOST`-Umgebungsvariable-Schritt
  wirkte zunächst nicht — Ursache war ein vergessener `git push` vor dem
  Server-seitigen `update.sh` (Server zog dadurch keine neuen Commits,
  lief weiter mit dem alten, `HOST` nicht unterstützenden Build). Kein
  FairPOS-Bug, aber als Lehre für die Doku aufgenommen: Abschnitt 14
  weist jetzt explizit darauf hin, vor dem `HOST`-Schritt Abschnitt 12
  (Updates) durchlaufen zu haben.
  **Nutzerbericht behoben:** copy-paste-anfälliger Codeblock in Abschnitt
  14.3 (`sudo -u fairpos bash` … `exit` … `sudo systemctl restart
  fairpos` in einem zusammenhängenden Block) — bei Shell-Wechsel mitten im
  Block funktioniert Copy-Paste nicht zuverlässig. In drei sichtbar
  getrennte Blöcke aufgeteilt, mit explizitem Hinweis im Text.
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
- [x] **#72** TSE-Ausfall-Log als eigene Auswertungsseite in der Admin-UI
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

  **Erledigt (2026-08-27):**
  - Neue Auswertungsseite `admin/reports/tse-outages/+page.svelte`
    (Backend `GET /api/admin/reports/tse-outages` in `routes/admin/
    reports.ts`) — listet alle `tse_outage`-Zeilen, neueste zuerst, auf 500
    begrenzt, laufende Ausfälle mit Badge „läuft noch" + Dauer-Anzeige,
    automatische Aktualisierung alle 30s. Nav-Punkt unter „Auswertungen".
  - **Übergangslösung zurückgebaut (Nutzerentscheidung):** die
    Bedienungskasse-Meldung ist wieder generisch — und zwar mit neuem,
    einheitlichem Text für beide Fälle (nicht konfiguriert UND nicht
    erreichbar): „TSE nicht verfügbar. Bitte informieren Sie den
    Systemverwalter." (`TSE_UNAVAILABLE_WARNING` in `tse/signing.ts`).
    Begründung: Sicherheitsaspekt — Bedien-/Kassenpersonal soll keine
    technischen Details sehen. Der echte Grund (inkl. Swissbit-Fehlercode)
    landet weiterhin in `tse_outage.reason` und ist jetzt über die neue
    Admin-Seite einsehbar.
  - Bestehende Tests angepasst (`signing.integration.test.ts`,
    `register-session.integration.test.ts`) auf den neuen Text, neuer
    Integrationstest für `/tse-outages` in `reports.integration.test.ts`.
    Alle Suiten (Unit + Integration) sowie Typecheck/Build grün. **Noch
    nicht live durch den Nutzer bestätigt.**
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
- [x] **#79** Druckauftrag „Abbrechen" soll auf Status „abgebrochen" statt Löschen umstellen
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

  **Erledigt (2026-08-26):**
  - Geprüft, welche der beiden Routen noch gebraucht wird: `GET
    /api/admin/printers/:id/jobs` + `DELETE
    /api/admin/printers/:printerId/jobs/:jobId` (`routes/admin/printers.ts`)
    waren toter Code — weder im Frontend (`api.ts` `listJobs`/`deleteJob`)
    noch in Tests referenziert. Nutzerentscheidung: entfernt, statt auch
    umzustellen. Einzig aktiver Pfad ist `routes/admin/print-jobs.ts` (treibt
    die Druckwarteschlangen-Seite).
  - Migration `0010_print_job_cancelled.sql`: `print_job_status_check` um
    `'cancelled'` erweitert.
  - `DELETE /api/admin/print-jobs/:id` setzt jetzt `status = 'cancelled'`
    statt den Datensatz zu löschen (Sperre für `status = 'printing'`
    unverändert). `GET /api/admin/print-jobs` filtert `cancelled` standardmäßig
    aus der Nicht-Terminal-Ansicht heraus, ist aber über `?status=cancelled`
    oder `?status=all` sichtbar, dort neueste zuerst.
  - `admin/settings/print-queue/+page.svelte`: neue Filter-Option
    „Abgebrochen", Status-Label + Farbe, „Abbrechen"-Button nicht mehr bei
    bereits abgebrochenen Jobs sichtbar, Bestätigungstext von „löschen" auf
    „abbrechen" korrigiert.
  - Neue Integrationstests (`print-jobs.integration.test.ts`, 6 Tests) +
    Typecheck/Build für Backend und Frontend — alle grün.

  **Live bestätigt (2026-08-26):** Abbrechen setzt Status statt zu löschen,
  Filter „Abgebrochen"/„Alle" zeigen den Job weiterhin, Button verschwindet
  bei bereits abgebrochenen Jobs. Die 409-Sperre für einen gerade druckenden
  Job wurde bewusst **nicht** live getestet (Zeitfenster zu knapp, seltener
  Fall) — Nutzerentscheidung, auf die bestehende automatisierte Testabdeckung
  zu vertrauen.
- [ ] **#80** (Low Prio) Server-Adresse-Testfunktion (Task #73) prüft die falsche Sache — Konzept überarbeiten
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
- [ ] **#84** (Low Prio) Artikel löschen, das bereits verkauft wurde → „Internal Server Error" statt klarer Fehlermeldung
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

  **Nachgebessert (2026-08-26):** Nutzer meldete, die Füllanimation liefe
  auch bei deaktivierten Buttons — tatsächlich prüfte die Aktion `disabled`
  gar nicht, hätte also nach voller Haltedauer sogar `onHold` ausgelöst,
  falls der Browser auf einem deaktivierten Button doch Pointer-Events
  feuert (uneinheitliches Verhalten je nach Browser/Gerät, kein reines
  Kosmetik-Risiko). Zwei neue Prüfpunkte in `longpress.ts`: `disabled` wird
  sowohl beim Start des Haltevorgangs als auch erneut beim Erreichen der
  vollen Dauer geprüft (falls sich der Zustand währenddessen ändert). 2
  weitere Unit-Tests (jetzt 10 insgesamt): kein Halte-Start bei bereits
  deaktiviertem Button, kein `onHold`-Aufruf, wenn der Button erst während
  des Haltens deaktiviert wird. **Live bestätigt (2026-08-26).**
- [x] **#86** Freitext pro Artikel in der Bedienungskasse (zusätzlich zu den vordefinierten Optionen)
  Nutzerwunsch (2026-08-26): die Bedienung soll zu jedem bestellten Artikel
  einen Freitext eingeben können (z. B. Sonderwünsche, die keine der
  vordefinierten Optionen abdeckt). UI-Gestaltung bewusst noch offen — nur
  als Backlog-Eintrag angelegt.
  **Backend-seitig bereits verifiziert, kein Handlungsbedarf dort:**
  `order_item.options` ist eine reine `TEXT`-Spalte (`0001_initial.sql`,
  keine FK/Länge/Check-Constraint gegen `product_option`);
  `POST /register-session/.../order` (`routes/register-session.ts`,
  Body-Typ `{ article_id, quantity, options?: string | null }`) nimmt für
  `options` bereits jeden beliebigen String entgegen (`pos.options?.trim()`,
  keine Validierung gegen die konfigurierten Optionsnamen). Ein Freitext
  ließe sich also technisch schon heute über denselben String transportieren
  wie die Checkbox-Auswahl — reine Frontend-Aufgabe.
  **Offene UI-Fragen für die Gestaltung:**
  - Aktuell öffnet sich der Options-Dialog (`optionsOpen`/`availableOptions`
    in `.../order/+page.svelte`) nur, wenn der Artikel überhaupt
    vordefinierte Optionen hat (`tapSlot()` — bei null Optionen wird direkt
    ohne Dialog hinzugefügt). Soll der Dialog künftig **immer** erscheinen
    (auch bei Artikeln ohne vordefinierte Optionen), damit Freitext
    grundsätzlich verfügbar ist?
  - Freitext und Checkbox-Auswahl kombinieren — wie werden beide im
    gespeicherten `options`-String zusammengeführt (`confirmOptions()`
    baut aktuell `[...selectedOptionNames].sort().join(', ')`)? Trennzeichen,
    Reihenfolge, Längenbegrenzung in der UI (Spalte selbst ist unbegrenzt)?
  - Wirkt sich das auf die Gruppierung gleicher Positionen aus (Checkout/
    Bonliste gruppieren aktuell nach `(article_id, options)` — bei
    Freitext würde jede leicht unterschiedliche Formulierung eine eigene
    Gruppe erzeugen, das ist bei vordefinierten Optionen bisher nie
    passiert)?

  **Nutzerentscheidungen (2026-08-27):**
  - Umfang **nur** Artikel, die bereits vordefinierte Optionen haben — der
    Dialog öffnet weiterhin wie bisher nur dann. Freitext für Artikel ganz
    ohne Optionen ist als eigener Task ausgelagert, siehe #88.
  - Freitextfeld wird in den bestehenden Options-Dialog eingebaut, hinter
    einem „+ Freitext"-Link eingeklappt (nicht permanent sichtbar), damit
    der Standardfall ohne Sonderwunsch genauso schnell bleibt wie heute.
    Einzeiliges Eingabefeld im bestehenden Modal, max. 50 Zeichen.
  - Zusammenführung: erst alle ausgewählten Optionen, danach der Freitext.
    Als Trennzeichen sowohl zwischen mehreren Optionen als auch zwischen
    letzter Option und Freitext ursprünglich Linefeed (`\n`) angedacht —
    nach Recherche verworfen: `\n` würde in der Anzeige (5 Stellen: Bonliste,
    Checkout, Tisch-Ansicht, Admin-Reports „Offene Positionen"/„Stornos")
    ohne `white-space: pre-line`-Ergänzung an allen 5 Stellen unsichtbar
    kollabieren, im Druck hätte es dagegen korrekt funktioniert. Nutzer hat
    sich für die einfachere Variante entschieden: **bleibt bei `, '`** wie
    bisher, keine CSS-Änderungen nötig.
  - Gruppierung bleibt unverändert (exakter String-Vergleich) — wird
    bewusst nicht sonderbehandelt, auch wenn dadurch bei identischem
    Freitext + identischen Optionen weiterhin korrekt gruppiert wird, bei
    abweichender Formulierung aber nicht.

  **Erledigt (2026-08-27):** `register/[id]/tables/[tableId]/order/+page.svelte`
  — Options-Dialog um „+ Freitext"-Link erweitert, der ein einzeiliges
  Eingabefeld (`maxlength=50`) einblendet; `confirmOptions()` hängt den
  getrimmten Freitext (falls nicht leer) hinter die sortierten Optionsnamen
  an, gemeinsam mit `, '` verbunden. Zustand wird bei jedem `tapSlot()`-Aufruf
  zurückgesetzt. Typecheck und Build grün. Reine Frontend-Änderung ohne
  eigene Komponenten-Testsuite in diesem Projekt (wie die übrigen Funktionen
  in dieser Datei bisher auch) — **noch nicht in echtem Browser/live getestet.**

  **Nachgebessert (2026-08-27):** „+ Freitext"-Button wurde nicht als
  klickbar wahrgenommen — lag daran, dass er innerhalb von `<Modal>`
  außerhalb von `.modal-actions` liegt und damit weder von der
  app-weiten 48px-Touch-Target-Regel (`.order-page .btn-ghost`, greift
  nicht, weil `Modal` als Geschwisterelement von `.order-page` gerendert
  wird, nicht darin verschachtelt) noch von der `.modal-actions
  .btn-ghost`-Regel erfasst wurde — blieb dadurch klein und dünn umrandet.
  Jetzt mit expliziter Größe (volle Breite, 48px Mindesthöhe, größere
  Schrift) statt sich auf die (hier nicht greifende) globale Regel zu
  verlassen.

  **Nachträglich gegen den Code verifiziert (2026-08-29):** alle oben
  beschriebenen Bestandteile (`freetextOpen`/`freetextValue`,
  `OPTIONS_MAX_LENGTH`, `optionsCombinedLabel`/`optionsTooLong`,
  `.freetext-link`-Styling) existieren exakt wie dokumentiert.

  **Nachgebessert (2026-08-27, im Zuge von #88):** bisher war nur das
  Freitextfeld selbst auf 50 Zeichen begrenzt (`maxlength`), nicht die
  **Summe** aus ausgewählten Optionen + Freitext — bei mehreren/langen
  Optionsnamen hätte der kombinierte String trotzdem über 50 Zeichen kommen
  können. Neue `$derived`-Prüfung (`optionsCombinedLabel`/`optionsTooLong`)
  deaktiviert „Hinzufügen" mit Hinweistext, sobald die Summe 50 Zeichen
  überschreitet. `OPTIONS_MAX_LENGTH`-Konstante (vormals
  `FREETEXT_MAX_LENGTH`) wird jetzt von beiden Dialogen (#86 und #88)
  gemeinsam genutzt — Klarstellung: 50 Zeichen ist eine reine UI-Konvention,
  `order_item.options` selbst ist eine unbegrenzte `TEXT`-Spalte.
- [x] **#87** Festplatten-/DB-Integritätscheck (manuell auslösbar)
  Bei der Konzeption des TSE-Health-Checks (#64) bewusst abgetrennt —
  Nutzerentscheidung (2026-08-26): eigener Task, **nicht** automatisch im
  Hintergrund-Job, sondern manuell getriggert (z. B. Button in der
  Admin-UI). Prüfungen noch nicht analysiert — Kandidaten aus der
  ursprünglichen #64-Beschreibung: genug freier Festplattenspeicher auf
  allen relevanten Volumes (`statvfs`/`df`), Datenbank fehlerfrei (keine
  korrupten Tabellen/Indizes, z. B. via `pg_catalog`-Abfragen oder
  `VACUUM`/`ANALYZE`-Fehlerstatus). Ergebnis vermutlich über dieselbe
  `system_log`-Tabelle protokollierbar, die #64 dafür bereits generisch
  angelegt hat.

  **Nutzerentscheidungen (2026-08-30):** neuer Menüpunkt "Health-Check"
  unter "Monitoring" (nicht in eine bestehende Seite integriert). Bewusst
  **live-only** — keine Protokollierung in `system_log` (anders als
  ursprünglich angedacht), da ein manuell getriggerter Check ohne
  Hintergrund-Job keine Historie braucht. Architektur bewusst erweiterbar:
  eine Registry-Liste in `system/healthChecks.ts`
  (`HEALTH_CHECKS: HealthCheckDefinition[]`), die der Runner und die
  Admin-UI generisch durchlaufen — ein neuer Check ist nur ein neuer
  Eintrag, keine sonstige Verdrahtung nötig.

  **Erledigt (2026-08-30):**
  - **Festplattenspeicher** (`checkDiskSpace`): `fs.statfs('/')` (Node-Bordmittel,
    kein `df`-Subprozess nötig). Absolute GB-Schwellwerte statt Prozent
    (Nutzervorgabe — ein Prozentwert liest sich auf einer 32-GB- und einer
    2-TB-Platte völlig unterschiedlich): Warnung <10 GB, Fehler <2 GB
    (zweiter Wert von mir sinnvoll ergänzt, erste Zahl war explizit
    vorgegeben).
  - **Datenbank-Integrität** (`checkDatabaseIntegrity`): Erreichbarkeit
    (`SELECT 1`) + Suche nach als `invalid` markierten Indizes
    (`pg_index.indisvalid = false` — passiert z. B. bei einem
    abgebrochenen `CREATE INDEX CONCURRENTLY`; die Abfrage läuft dann
    lautlos ohne den Index weiter, statt laut zu scheitern).
  - **SMART-Festplattenstatus** (`checkSmartHealth`, Nutzervorschlag,
    gleich mit umgesetzt statt nur vorgemerkt): `lsblk -d` listet
    physische Datenträger (Partitionen/LVM-Mapper-Geräte ausgeschlossen,
    da `smartctl` die nicht direkt abfragen kann), `smartctl -H` je
    Datenträger. Text-Erkennung (`classifySmartOutput`, eigens
    unit-testbar) statt Exit-Code, da ATA ("... PASSED") und SCSI/NVMe
    ("... OK") unterschiedlich formulieren. Braucht `smartmontools` +
    eigene Sudoers-Regel (`smartctl -H /dev/*`, Geräte-Wildcard nötig, da
    der Festplattenname je Server variiert) — fehlt beides, meldet der
    Check **Warnung**, nicht Fehler (optionale Infrastruktur, kein Zeichen
    einer wirklich kaputten Platte).
  - Neue Route `GET /api/admin/health-checks`, neue eigenständige
    Admin-Seite unter Monitoring (Button "Jetzt prüfen", läuft nicht
    automatisch beim Seitenaufruf).
  - Doku: `docs/Installationsanleitung.md` Abschnitt 15 (smartmontools +
    Sudoers-Regel) — optional/empfohlen wie Abschnitt 13/14.
  - Tests: 4 Unit-Tests für `classifySmartOutput`, 2 Integrationstests für
    die Route (im Sandbox-Testlauf bestätigt: `smartctl` fehlt dort
    absichtlich nicht installiert — Check meldet korrekt "Warnung", genau
    der vorgesehene Graceful-Degradation-Pfad). Backend-Unit (278/278),
    Frontend-Unit (70/70), Typecheck grün.

  **Live gefunden und behoben (2026-08-30):** die ursprüngliche
  Sudoers-Regel `smartctl -H /dev/*` (Geräte-Wildcard direkt im Argument)
  scheiterte live an `visudo -c -f` mit "syntax error: wildcards are not
  allowed in command arguments" — auf dem Ubuntu-Stand des Servers sind
  Wildcards in Sudoers-Befehlsargumenten strenger reglementiert als
  angenommen. Der eingebaute `visudo -c -f`-Sicherheitscheck hat genau
  das verhindert, wofür er da ist: die kaputte Regel wurde nie
  installiert. Umgebaut auf dasselbe parameterlose-Skript-Muster wie
  beim nginx-Zertifikat (Task #66, Abschnitt 14.4) — neues
  `/opt/fairpos/scripts/smart-check.sh` (zählt Datenträger selbst per
  `lsblk` auf, `smartctl -H` je Datenträger mit `|| true` gegen
  vorzeitigen Abbruch durch `set -e` bei einem echt fehlerhaften
  Datenträger), Sudoers-Regel jetzt ohne jede Wildcard
  (`.../smart-check.sh`, keine Argumente). `system/healthChecks.ts`s
  `checkSmartHealth()` ruft nur noch dieses eine Skript auf und parst
  dessen kombinierte Ausgabe (`parseSmartCheckOutput`, neu unit-testbar).
  `config.lsblkPath` (nicht mehr gebraucht, `lsblk` läuft jetzt nur noch
  innerhalb des Skripts) wieder entfernt. Doku Abschnitt 15.2
  entsprechend aktualisiert. 2 zusätzliche Unit-Tests für
  `parseSmartCheckOutput`, alle Suiten weiterhin grün.

  **Live gefunden und behoben (2026-08-30, zweite Runde):** ein
  Datenträger hinter einer USB-Bridge meldete sich `smartctl` gegenüber
  mit "Unknown USB bridge ... Please specify device type" statt
  PASSED/FAILED/OK — korrekt als "unklar" klassifiziert (keine
  Erkennungslücke), aber wenig hilfreich. **Nutzerentscheidung:**
  USB-Datenträger werden künftig einfach übersprungen statt mit
  wechselnden `-d`-Typen durchprobiert — `smart-check.sh` filtert jetzt
  per `lsblk -o NAME,TYPE,TRAN` gezielt `TRAN != usb`. Reine
  Skript-Änderung (nur in der Doku als Heredoc, kein Repo-Code) — betrifft
  keine der Node-seitigen Unit-Tests, da das Ausgabeformat
  (`=== /dev/X ===` + smartctl-Text) unverändert bleibt.

  **Erweiterung (2026-08-30, Nutzervorschlag):** vierter Check
  "SSD-Abnutzung" — Nutzer hat live `smartctl -a` gegen eine echte ADATA
  SU800NS38 laufen lassen: `ID 177 Wear_Leveling_Count`, VALUE 100 (per
  SMART-Konvention = Lebensdauer verbleibend, nicht die vom Hersteller
  abweichend befüllte RAW_VALUE). SATA/ATA-Hersteller sind dabei nicht
  einheitlich (anders als NVMe mit dem standardisierten Feld
  "Percentage Used") — `parseSsdWearPercent()` probiert deshalb eine
  Liste bekannter Attributnamen (`Wear_Leveling_Count`,
  `Media_Wearout_Indicator`, `SSD_Life_Left`, `Percent_Lifetime_Remain`)
  und zusätzlich das NVMe-Feld (invertiert: "Percentage Used" → "Prozent
  verbleibend"). `smart-check.sh` läuft jetzt mit `-a` statt nur `-H` —
  liefert damit sowohl den Gesundheitsstatus als auch die volle
  Attributtabelle in einem einzigen `smartctl`-Aufruf pro Datenträger,
  den beide Checks unabhängig voneinander auswerten (dieselbe
  Sudoers-Regel/dasselbe Skript, keine weitere Berechtigung nötig).
  Kein bekanntes Attribut gefunden (reine HDD, oder Hersteller nicht in
  der Liste) → `ok` mit neutralem Hinweis, kein Fehler. 3 neue
  Unit-Tests, davon einer direkt gegen die echte ADATA-Ausgabe.

  **Live gefunden und behoben (2026-08-30, dritte Runde):** durch die
  Umstellung von `-H` auf `-a` meldete "SMART-Festplattenstatus" plötzlich
  für jede gesunde Platte "FEHLER" — `classifySmartOutput()` suchte
  ungeschützt nach dem Teilstring "FAILED" irgendwo im Text, und die
  Attributtabellen-Spaltenüberschrift **"WHEN_FAILED"** enthält genau
  diesen Teilstring. Bei `-H` (nur die Statuszeile, keine Attributtabelle)
  war das nie aufgefallen. Fix: `\bFAILED\b`/`\bPASSED\b` mit
  Wortgrenzen — `_` zählt als Wortzeichen in Regex, „WHEN_FAILED" hat
  daher keine Wortgrenze vor „FAILED". Regressionstest ergänzt (echte
  ADATA-Attributtabelle + Erfolgszeile kombiniert, muss `ok` liefern).
- [x] **#88** Nachträglich Hinweis zu einer bereits platzierten Position hinzufügen (auch für Artikel ohne vordefinierte Optionen)
  Aus #86 ausgelagert (2026-08-27): dort wurde der Umfang bewusst auf
  Artikel mit bereits vorhandenen Optionen beschränkt (Dialog öffnet dort
  ohnehin schon). Dieser Task deckt den restlichen Fall ab — ein Artikel
  ganz ohne konfigurierte Optionen ruft aktuell (`tapSlot()` in
  `register/[id]/tables/[tableId]/order/+page.svelte`) gar keinen Dialog
  auf, sondern fügt die Position direkt hinzu.

  **Konzept-Diskussion (2026-08-27):** Ausgangsfrage: seltener Anwendungsfall,
  darf den normalen Bestell-Workflow (schneller Tap zum Hinzufügen) nicht
  stören. Erster Vorschlag (verworfen): kleines Icon direkt an jeder Zeile
  der Bestellliste, das einen Freitext-only-Dialog öffnet, nur für Artikel
  ohne Optionen. Nutzer-Einwand: die Bestellliste ist ohnehin schon eng,
  keine zusätzliche UI dort einbauen.

  **Nutzervorschlag, umgesetzt:** ein neuer Button „Hinweis hinzufügen"
  unterhalb der kompletten Bestellliste-Karte (inkl. Summe/Bestellen-Zeile,
  nicht dazwischen — damit nichts mit der primären „Bestellen"-Aktion
  konkurriert). Öffnet einen zweistufigen Dialog:
  1. Positionsauswahl — zeigt die Bestellliste (Menge + Name + bisherige
     Optionen) zur Auswahl, mit Abbrechen-Button.
  2. Bearbeitung — zeigt den gewählten Artikelnamen, einen Mengen-Stepper
     (Default 1, Min 1, Max = Menge der Position — für wie viele Einheiten
     der Hinweis gelten soll) und ein einzeiliges Textfeld, vorbefüllt mit
     dem bisherigen Optionstext der Position. Speichern splittet die
     Position bei Bedarf (gewählte Menge < Gesamtmenge): der Rest behält
     seinen bisherigen Text, der abgespaltene Teil bekommt den neuen.

  **Nutzerentscheidungen (2026-08-27):**
  - Gilt generisch für **jede** Position, nicht nur für Artikel ohne
    vordefinierte Optionen — kein Mehraufwand, da der Mechanismus (Text
    direkt im vorbefüllten Feld bearbeiten) ohnehin nicht unterscheidet.
  - Ergibt der neue Text nach dem Split exakt den **aktuellen** Optionstext
    der bearbeiteten Position (keine echte Änderung), bleibt der OK-Button
    deaktiviert — ein Split ohne inhaltliche Änderung wäre ohnehin sinnlos.
    Stimmt der neue Text stattdessen zufällig mit einer **anderen** bereits
    existierenden Position überein, wird automatisch zusammengeführt (wie
    beim normalen Hinzufügen) — kein Sonderfall, keine Nachfrage.
  - Abbrechen in Schritt 2 schließt den kompletten Dialog (kein „Zurück" zu
    Schritt 1).
  - Zeichenlimit: dieselben 50 Zeichen wie bei #86, da `order_item.options`
    ohnehin nur eine UI-Konvention dafür hat (unbegrenzte `TEXT`-Spalte) —
    gemeinsame `OPTIONS_MAX_LENGTH`-Konstante mit #86.

  **Erledigt (2026-08-27):** `register/[id]/tables/[tableId]/order/+page.svelte`
  — `.order-section` in `.order-card` (Liste + Summe + Bestellen, bisheriges
  Card-Styling) und einen neuen `.note-btn` außerhalb der Karte aufgeteilt;
  neuer zweistufiger `Modal`-Dialog (`noteStep: 'select' | 'edit'`) mit
  `openNoteDialog()`/`selectNoteLine()`/`changeNoteQuantity()`/
  `applyNoteEdit()`; `mergeOrInsertLine()` als gemeinsame Merge-Logik
  (identisch zum Verhalten von `addLine()`) für sowohl den unveränderten
  Rest als auch den abgespaltenen Teil. Typecheck und Build grün. Reine
  Frontend-Änderung ohne eigene Komponenten-Testsuite in diesem Projekt
  (wie die übrigen Funktionen in dieser Datei) — **noch nicht in echtem
  Browser/live getestet.**

  **Nachgebessert (2026-08-27):** Nutzer bemängelte an Screenshots, dass im
  „Position wählen"-Schritt nicht erkennbar war, dass die Zeilen anklickbar
  sind — bisher nur dünne Trennlinien ohne visuelle Button-Anmutung.
  Umgestellt auf dasselbe „klickbare Karte"-Muster wie `.register-item` in
  `admin/users/+page.svelte` (Hintergrund + Rahmen + Hover), plus
  Chevron („›") am Zeilenende als zusätzlicher Hinweis auf den nächsten
  Schritt.

  **Nachträglich gegen den Code verifiziert (2026-08-29):** alle oben
  beschriebenen Bestandteile (`noteStep`, `openNoteDialog()`/
  `selectNoteLine()`/`changeNoteQuantity()`/`applyNoteEdit()`,
  `mergeOrInsertLine()`, `.note-select-item`-Kartenstil) existieren exakt
  wie dokumentiert.
- [ ] **#89** Fehlende PWA-Artefakte nachrüsten (iOS + Android)
  Aufgekommen bei der Diskussion um den QR-Login (2026-08-27): geprüft,
  aktuell existiert **keine** echte PWA-Infrastruktur — kein
  `manifest.json`, kein Service Worker, keine Icons (selbst der in
  `app.html` referenzierte `favicon.png` existiert nicht im Quellbaum),
  keine `apple-touch-icon`/`apple-mobile-web-app-capable`-Meta-Tags. Was
  auf den Geräten als „App" gespeichert wird, ist bisher nur reines
  Browser-„Zum Home-Bildschirm hinzufügen" ohne echten Standalone-Modus.
  **Umfang (grob, noch nicht im Detail geplant):** `manifest.json` +
  Icon-Set in mehreren Auflösungen, `apple-touch-icon`/
  `apple-mobile-web-app-capable`/`apple-mobile-web-app-status-bar-style`
  in `app.html`, echten `favicon.png` anlegen. Service Worker nur falls
  Offline-Fähigkeit gewünscht ist — noch zu klären, ob das für diesen
  Anwendungsfall (Kassensystem braucht ohnehin Backend-Verbindung)
  überhaupt sinnvoll ist oder nur unnötige Komplexität wäre.
  **Bekanntes Risiko:** iOS Safaris „Intelligent Tracking Prevention" räumt
  Storage/Cookies bei länger nicht besuchten Seiten unter Umständen
  eigenständig auf — könnte auch mit korrekt gesetztem `maxAge`
  (siehe #90) zu unvorhersehbaren Zwangs-Logouts auf iPads führen,
  unabhängig von der PWA-Nachrüstung. Vorab nicht zuverlässig ausschließbar.
  **Vorbereitung (2026-08-29):** Nutzer hat ein Icon-SVG in
  `tmp-pwa-artifacts/` vorbereitet (Original in Teal/Grün) — auf Wunsch auf
  die tatsächliche App-Palette umgefärbt (`--color-primary`/`--color-bg`/
  `--color-text` aus `routes/+layout.svelte`) und als
  `fairpos-icon-app-theme.svg` gespeichert; die alten PNGs (aus dem
  Teal-Original gerendert) wurden vom Nutzer gelöscht, da veraltet.

  **Erledigt (2026-08-29):** PNG-Icon-Set (48–512px, `rsvg-convert`) aus dem
  neu eingefärbten SVG gerendert, `packages/frontend/static/` angelegt:
  `manifest.json` (Name/Farben/Icons, `display: fullscreen` wie vom Nutzer
  vorgegeben, Beschreibung auf Deutsch lokalisiert), `favicon.png` (behebt
  die bisher kaputte Referenz in `app.html`), `apple-touch-icon.png`
  (180×180), `icons/icon-{48…512}x{n}.png`. `app.html` bekommt
  `<link rel="manifest">`, `<link rel="apple-touch-icon">`,
  `apple-mobile-web-app-capable`/`-status-bar-style`/`-title` — iOS liest
  `manifest.json` für "Zum Home-Bildschirm" ohnehin nicht, nur diese
  Meta-Tags zählen dort. `theme-color` dabei von `#1a1a2e` auf das
  tatsächliche `--color-bg` (`#0f1117`) korrigiert (vorher inkonsistent).
  Service Worker bewusst **nicht** umgesetzt — Kassensystem braucht ohnehin
  eine Backend-Verbindung, ein Offline-Modus wäre unnötige Komplexität ohne
  echten Nutzen.

  Das SVG selbst dauerhaft unter `packages/frontend/static/fairpos-icon.svg`
  gesichert (nicht nur in `tmp-pwa-artifacts/`, das später gelöscht wird) —
  Nutzerwunsch: Quelle behalten, um bei künftigen Farbschema-Änderungen
  jederzeit neue Pixelgrafiken erzeugen zu können. Gleichzeitig das
  bisherige Platzhalter-Icon (⊕-Zeichen) in der UI ersetzt — `login/+page.svelte`
  (großes Icon im Anmelde-Screen), `admin/+layout.svelte` und
  `register/+layout.svelte` (kleines Icon in der jeweiligen Kopfzeile).

  **Zusätzlich (2026-08-29, Nutzerwunsch):** Hinweis „Zum Home-Bildschirm
  hinzufügen" auf dem PIN-Login-Screen — relevant für Bedienungen, die ihr
  eigenes Gerät nutzen (nicht für feste Kassen-Tablets). Zeigt
  plattformspezifische Anleitung (iOS: Teilen-Symbol; Android: Menü),
  erkennt per `display-mode`-Media-Query + `navigator.standalone` (iOS-
  Altlast) ob bereits installiert, per User-Agent-Sniffing die Plattform
  (inkl. iPadOS-13+-Sonderfall, meldet sich als „MacIntel" mit Touch-Punkten
  statt als iPad). Bewusst **nur** auf dem Login-Screen — nach dem Einloggen
  keine weitere Störung, auch nicht im normalen Browser-Tab (Nutzervorgabe).
  Bewusst **nicht** dauerhaft abschaltbar — kein „×", keine
  localStorage-Merkstelle; wird immer angezeigt, solange die App nicht
  standalone läuft (Nutzervorgabe, 2026-08-29, nachträgliche Korrektur:
  ursprünglich mit „×"/localStorage-Dismiss umgesetzt, dann wieder entfernt).
  Neues Modul `lib/pwaInstallHint.ts` mit Unit-Tests (jsdom).

  Kein automatischer Install-Prompt möglich — iOS bietet dafür grundsätzlich
  keine API, und Chromes automatischer Banner (`beforeinstallprompt`)
  braucht einen sicheren Kontext (HTTPS/localhost), den FairPOS im
  Standard-LAN-Betrieb über HTTP nicht hat (siehe Task #66).

  Typecheck, Build (inkl. Kontrolle, dass `manifest.json`/Icons/Meta-Tags im
  Build-Output ankommen) und volle Testsuite grün. **Noch nicht live durch
  den Nutzer bestätigt** (insbesondere: echtes "Zum Home-Bildschirm
  hinzufügen" auf einem echten iOS-/Android-Gerät noch nicht ausprobiert).
  `tmp-pwa-artifacts/` noch nicht gelöscht — enthält weiterhin beide SVG-
  Versionen (Original + neu eingefärbt) und den ursprünglichen
  `manifest-draft.json`, kann nach Bestätigung entfernt werden.

  **Stand 2026-08-30:** Implementierung vollständig, es fehlt nur noch
  der reale Gerätetest. Der hängt an Task #92 — ohne zertifikatsfreies
  HTTPS (Split-Horizon-DNS + offiziell validiertes Zertifikat) zeigen iOS/
  Android beim „Zum Home-Bildschirm hinzufügen" sonst weiterhin
  Zertifikatswarnungen bzw. verweigern den Standalone-Modus. Wartet auf
  #92s finalen Live-Test (dieser wiederum auf neue Router-Hardware beim
  Nutzer, siehe dort).
- [x] **#90** Login-Neukonzeption: PIN-Login statt QR-Einmaltoken, serverseitige Sessions, vereinheitlichtes Admin/Kassen-Login

  **Ausgangsproblem (2026-08-27):** Das heutige QR-Einmaltoken-Login
  (`register_access_token`, 10 Min. gültig, `POST /api/auth/register/token`)
  ist unhandlich, sobald die App als PWA/Homescreen-Bookmark gespeichert
  wird — das Icon zeigt immer auf eine feste URL, nicht auf den Einmallink
  mit Token, und eine installierte PWA hat meist keine Adressleiste, um
  einen neu erzeugten Link von Hand zu öffnen. Zusätzlich gefunden: das
  Session-Cookie (`packages/backend/src/auth/session.ts`,
  `COOKIE_OPTIONS`) hat gar kein `maxAge`/`expires` gesetzt — technisch ein
  reines Browser-Session-Cookie, das beim Schließen verschwindet, obwohl
  `docs/Anforderungen.md` „Sessions sind persistent" verlangt. Das ist ein
  eigenständiger Bug, unabhängig vom Redesign.

  **Konzept-Diskussion, Ergebnis:**
  - **Ein einziges Login-Formular für alle** (kein separates Admin- vs.
    Kassen-Login mehr) — passt zum Datenmodell, `user.is_admin` ist schon
    heute nur ein Flag auf derselben Tabelle, keine getrennte Entität. Löst
    nebenbei die Frage „was zeigt die Root-URL standardmäßig" komplett auf,
    da es nur noch einen Login-Bildschirm gibt.
  - **PIN identifiziert und autorisiert gleichzeitig** — kein
    Benutzernamen-Dropdown (ursprünglich vorgeschlagen, dann verworfen: ein
    sichtbarer Benutzername hätte gezieltes Sperren einer bekannten Person
    durch absichtliche Falscheingaben ermöglicht). Format: `XXX-XXX-XXX`,
    Zeichen A–Z + 0–9 abzüglich verwechselbarer Zeichen (`0`/`O`, `1`/`I`/`l`
    ausschließen), maskiertes Eingabefeld, Paste mit und ohne Bindestriche
    unterstützt. Landet nach Erfolg auf der Kassenauswahl (bestehende
    Weiterleitungslogik in `register/+page.svelte` weitgehend
    wiederverwendbar, im Detail bei Umsetzung zu prüfen).
  - **Admin-Zugriff über Stufenauthentifizierung, nicht eigenes Login:**
    Admin-Benutzer melden sich genau wie alle anderen per PIN an und landen
    auf derselben Kassenauswahl. Zwischen Kassenliste und Logout-Button
    erscheint zusätzlich ein „Systemverwaltung"-Button (nur bei
    `is_admin = true`). Klick darauf fragt einmalig pro Session das
    bestehende Passwort ab (Flag `admin_verified` auf der Session, kein
    erneutes Abfragen bei jedem weiteren Klick). Vorteil: die PIN selbst
    muss für Admin-Konten nicht stärker sein als für alle anderen — der
    eigentliche Schutz für den sensiblen Adminbereich bleibt das Passwort.
  - **PIN-Verwaltung im Adminbereich:** `admin/users/+page.svelte`
    bekommt statt des heutigen QR-Generieren-Buttons ein PIN-Feld
    („PIN generieren" erzeugt eine Zufalls-PIN, manuelle Eingabe ebenfalls
    möglich). Eindeutigkeit wird beim Speichern serverseitig geprüft.
  - **Rate-Limiting statt Pro-Konto-Sperre:** die ursprünglich angedachte
    „3 Fehlversuche sperren dieses Konto" + Benutzerliste-Spalte
    „PIN-Fehler" passt nicht mehr zum PIN-only-Modell — eine falsche
    Eingabe lässt sich keinem Konto zuordnen, wenn der PIN selbst schon die
    Identifikation ist. Ersetzt durch ein klassisches IP-basiertes
    Rate-Limit auf den Login-Endpunkt: 3 Fehlversuche → 15 Minuten Sperre
    dieser IP. Rechnerisch mehr als ausreichend (s.u.), eher Serverlast-/
    Spam-Schutz als sicherheitsentscheidend, da der PIN-Raum selbst (siehe
    unten) schon praktisch nicht durchprobierbar ist.
    **Admin braucht eine Möglichkeit, aktive IP-Sperren manuell
    zurückzusetzen** (falls ein Gerät sich versehentlich selbst aussperrt
    und der Betrieb dadurch blockiert wäre) — einfacher Button „Alle
    aktiven IP-Sperren zurücksetzen" genügt, keine Liste einzelner
    Sperren nötig. Siehe auch Ergänzung bei Task #63 (Dashboard könnte die
    Anzahl aktiver Sperren + denselben Reset-Button zusätzlich zeigen).

  **Sicherheitsbetrachtung:**
  - PIN-Raum: 9 Zeichen aus A–Z+0–9 abzüglich verwechselbarer Zeichen ≈
    3–3,5×10¹³ Kombinationen. Bei 3 Versuchen/15 Min. pro IP käme ein
    Angreifer auf ca. 10⁵ Versuche/Jahr — selbst mit 10.000 parallelen
    IP-Adressen wären das rechnerisch tausende Jahre bis zum Durchprobieren
    des gesamten Raums. Die Sperre ist hier eher Serverlast-Schutz, der
    Raum selbst macht Online-Raten praktisch aussichtslos.
  - Realistische Bedrohung ist stattdessen **Diebstahl eines DB-Backups**
    und anschließendes **Offline-Cracken** der PIN-Hashes. Ein Hash ohne
    Salt oder mit konstantem Salt (z. B. Kassen-Seriennummer, die ohnehin
    in derselben DB steht) ließe sich einmalig offline für den gesamten
    Zeichenraum vorberechnen (auf aktueller GPU-Hardware im Bereich von
    Minuten bis einer Stunde) — eine wiederverwendbare Tabelle gegen jede
    gestohlene DB-Kopie.
  - **Wichtige technische Korrektur während der Konzeption:** ein
    zeilen-gesalzener, langsamer Hash wie bcrypt (wie bei Passwörtern
    verwendet) verhindert zwar Offline-Vorberechnung, macht aber die
    **Login-Suche selbst unpraktikabel** — ohne bekannten Benutzernamen
    müsste bei jedem Login-Versuch gegen **jeden** Benutzer einzeln
    geprüft werden (bcrypt ist absichtlich langsam, ~100ms/Vergleich),
    im Fehlerfall (keine Übereinstimmung) sogar gegen alle. Bei
    realistischen Nutzerzahlen spürbar langsam.
    **Lösung:** `pin_hash` = `HMAC-SHA256(SERVER_SECRET, normalisierte PIN)`
    — deterministisch (gleiche PIN → gleicher Hash), erlaubt eine normale
    indizierte SQL-Abfrage (`WHERE pin_hash = $1`) sowohl beim Login als
    auch bei der Eindeutigkeitsprüfung, bleibt aber offline-resistent,
    **solange** `SERVER_SECRET` getrennt von der Datenbank aufbewahrt wird
    (eigene Env-Variable, nicht Teil des DB-Backups — analog zum
    bestehenden `SESSION_SECRET`-Muster in `config.ts`). Passwörter
    (Admin-Stufenauth) bleiben unverändert bei bcrypt — dort ist die
    Zeilen-Salt-Eigenschaft kein Problem, da immer gegen einen schon
    bekannten Benutzer geprüft wird.

  **Technischer Umfang (grob, Detailplanung folgt bei Umsetzung):**
  - **DB:** `user` bekommt `pin_hash` (nullable, bis Admin eine PIN
    vergibt); `register_access_token`-Tabelle + zugehöriger Code entfällt
    komplett (obsolet). Neue `session`-Tabelle (`id`, `user_id`, `token`,
    `admin_verified`, `created_at`, `last_activity_at`, optional
    `user_agent`) ersetzt die bisherigen zwei getrennten, zustandslosen
    signierten Cookies (`adminUser`/`registerUser`) durch ein einziges,
    serverseitig nachverfolgtes Modell — Voraussetzung für
    Session-Liste + gezieltes Beenden im Adminbereich.
  - **Backend:** neuer Endpunkt `POST /api/auth/pin`; neuer
    Stufenauth-Endpunkt (Passwortprüfung, setzt `admin_verified` auf der
    bestehenden Session statt eine neue zu erzeugen); `POST
    /api/admin/users/:id/token` und `POST /api/auth/register/token`
    entfallen; `authenticateAdmin`/`authenticateRegister`-Middlewares
    verschmelzen zu einer gemeinsamen Session-Prüfung (+ zusätzlicher
    `admin_verified`-Check für admin-only-Routen); In-Memory-Rate-Limiter
    pro IP auf `POST /api/auth/pin`; Reset-Endpunkt für alle aktiven
    IP-Sperren; `last_activity_at` wird bei jedem authentifizierten
    Request aktualisiert (gleitende Verlängerung), Session gilt nach 4h
    Inaktivität als abgelaufen.
  - **Frontend:** `login/+page.svelte` komplett neu (maskiertes
    PIN-Eingabefeld statt Formular-Umschaltung); `adminUser`/`registerUser`-
    Stores verschmelzen zu einem gemeinsamen Nutzer-Store +
    `isAdminVerified`-Flag; „Systemverwaltung"-Button + Passwort-Stufenauth-
    Dialog auf der Kassenauswahl; `admin/users/+page.svelte`: QR-Generieren
    durch PIN-Verwaltung (Anzeige/Generieren/manuell ändern) ersetzen; neue
    Admin-Seite „Aktive Sessions" (Liste + Beenden-Button pro Zeile).

  **Größter struktureller Aufwand — umgangen durch kompatibilitätswahrenden
  Zuschnitt:** `authenticateAdmin`/`authenticateRegister` und die Felder
  `request.adminUser`/`request.registerUser` (in praktisch jeder
  admin-/registerseitigen Route verwendet) bleiben namentlich unverändert —
  beide lesen jetzt intern dieselbe `session`-Tabelle über **ein** Cookie,
  statt zwei komplett getrennte Cookies zu pflegen. `authenticateRegister`
  akzeptiert jede gültige Session; `authenticateAdmin` verlangt zusätzlich
  `is_admin` **und** `admin_verified`. Dadurch musste kein einziger
  bestehender Routen-Handler inhaltlich angefasst werden — die
  Vereinheitlichung passierte ausschließlich in der Session-/Login-Schicht.
  Dasselbe Muster auf der Frontend-Seite: `adminUser`/`registerUser`
  bleiben zwei Stores, beide werden nur noch von einem gemeinsamen
  Login-Fluss befüllt.

  **Erledigt (2026-08-27):**
  - Migration `0011_pin_login_sessions.sql`: `user.pin_hash`, neue
    `session`-Tabelle (`user_id`, `token`, `admin_verified`, `created_at`,
    `last_activity_at`, `user_agent`), `register_access_token` entfernt.
  - `config.pinHashSecret` (`PIN_HASH_SECRET`-Env-Var, getrennt von
    `SESSION_SECRET`) — `.env.example`, `docs/SETUP.md`,
    `docs/Installationsanleitung.md` aktualisiert, inkl. Warnung, dass
    dieser Schlüssel nicht ins DB-Backup gehört.
  - `auth/pin.ts`: Normalisieren/Formatieren/Hashen (`HMAC-SHA256`,
    deterministisch für schnelle Lookup-Abfrage statt bcrypt-Schleife über
    alle Benutzer — Korrektur eines eigenen Fehlvorschlags während der
    Konzeption, siehe Diskussion oben)/Zufalls-PIN ohne `0`/`O`/`1`/`I`.
  - `auth/rateLimit.ts`: In-Memory-IP-Sperre (3 Versuche/15 Min.),
    `countActiveLockouts()`/`resetAllLockouts()`.
  - `auth/session.ts` komplett umgebaut auf die `session`-Tabelle (ein
    Cookie, gleitende 4h-Inaktivitätsgrenze, `admin_verified`-Flag).
  - `middleware/authenticate.ts` wie oben beschrieben umgebaut, ohne
    Signatur-/Feldnamenänderung nach außen.
  - `routes/auth.ts`: `POST /api/auth/pin`, `POST /api/auth/admin/verify`
    (Stufenauth, setzt `admin_verified` auf der bestehenden Session), ein
    gemeinsames `POST /api/auth/logout`; altes Login/Token entfernt.
  - `admin/users.ts`: PIN-Generieren (`POST .../pin/generate`, liefert nur
    einen Vorschlag, noch nicht gespeichert) + Speichern
    (`PUT .../pin`, Eindeutigkeitsprüfung), `has_pin` in der Benutzerliste
    statt des Hash selbst.
  - Neue `admin/sessions.ts` (Liste + gezieltes Beenden) und
    IP-Sperren-Reset-Endpunkt in `admin/system.ts` (+ `ip_lockout_count`
    in `/status`).
  - Frontend: neue Login-Seite (maskiertes PIN-Feld, Paste mit/ohne
    Bindestriche), Kassenauswahl mit „Systemverwaltung"-Button + Passwort-
    Stufenauth-Dialog (unterdrückt außerdem den Single-Register-Autoskip
    für Admins, damit sie den Button überhaupt sehen), PIN-Verwaltung in
    `admin/users/+page.svelte` statt QR-Code, neue Seite „Aktive Sessions",
    IP-Sperren-Anzeige+Reset in den Systemeinstellungen.
  - `db/seed.ts` vergibt jetzt ebenfalls eine PIN (sonst könnte sich der
    erste Admin nach frischer Installation gar nicht anmelden) und gibt
    sie einmalig auf der Konsole aus.
  - E2E-Suite (`full-flow.e2e.test.ts`) und ihr README auf
    `E2E_ADMIN_PIN` + PIN-Vergabe für den Testkassierer umgestellt.
  - `docs/Anforderungen.md` (Authentifizierungs-Entscheidung),
    `docs/Manueller-Testplan.md` (Abschnitt 1 + Benutzerverwaltung),
    `docs/Dictionary.md` (PIN/Sitzung statt Zugangscode) aktualisiert.
  - Neue Unit-Tests (`auth/pin.test.ts`, `auth/rateLimit.test.ts`) und
    Integrationstests (`auth.integration.test.ts` neu geschrieben,
    `admin/sessions.integration.test.ts` neu, PIN-Verwaltung +
    IP-Sperren-Tests in `admin-routes.integration.test.ts` ergänzt);
    bestehende Login-Hilfsfunktionen (`loginAsAdmin`/`loginAsRegisterUser`
    in `test/app-helpers.ts`) auf PIN umgestellt — dadurch automatisch
    alle ~14 bestehenden Testdateien mit angepasst, ohne deren eigentliche
    Testlogik zu ändern. Volle Unit- (262 Tests) und Integrationssuite
    grün, Typecheck (Backend+Frontend) und Build sauber.
  - **Live bestätigt (durchgehend seit 2026-08-29):** produktiv im Einsatz,
    mehrere Runden Live-Test-Feedback eingearbeitet (siehe
    Nachbesserungen unten), zwei Produktions-Migrationsvorfälle (D-049
    fehlender `PIN_HASH_SECRET`, D-050 Bestandsadmin ohne PIN) gefunden
    und behoben.

  **Weiterhin offen / noch nicht entschieden (nicht blockierend):** genaue
  PIN-Länge falls von 3×3 abgewichen werden soll (bisher nicht in Frage
  gestellt, aktuell beibehalten); ob ein Mindestabstand zwischen zwei
  PIN-Neuvergaben für denselben Benutzer nötig ist (bisher nicht
  thematisiert, vermutlich nicht nötig); Task #89 (PWA-Artefakte)
  weiterhin unabhängig offen.

  **Nachbesserungen (2026-08-29):**
  - Manuelle PIN-Eingabe erlaubt jetzt auch verwechselbare Zeichen
    (`0`/`O`/`1`/`I`) — nur der Zufallsgenerator vermeidet sie weiterhin.
    `auth/pin.ts` unterscheidet jetzt `VALID_ALPHABET` (36 Zeichen, für
    `isValidPinFormat`) von `GENERATOR_ALPHABET` (32 Zeichen, für
    `generateRandomPin`).
  - „PIN ändern"-Dialog öffnet jetzt mit **leerem** Feld statt automatisch
    eine neue PIN vorzuschlagen — sonst könnte der Anwender denken, die
    angezeigte PIN sei die bereits bestehende (Verwechslungsgefahr, da die
    echte PIN nie aus dem Hash rekonstruierbar ist). Vorschlag erscheint
    erst nach explizitem Klick auf „Neu erzeugen".
  - Neue Funktion „PIN drucken" im PIN-Dialog: druckt Benutzername + PIN
    über den Standarddrucker aus (`print_job`-Typ `pin_slip`, Migration
    `0012_print_job_pin_slip.sql`, `buildPinSlip()` in `print/escpos.ts`,
    `POST /api/admin/users/:id/pin/print`), mit Bestätigungsdialog „Achtung,
    die PIN wird am Standarddrucker ausgedruckt." vorher. Funktioniert auf
    dem aktuell angezeigten Feldinhalt, unabhängig davon ob schon
    gespeichert.
  - **Bug gefunden und behoben:** die neue „PIN drucken"-Funktion machte aus
    dem Dialog-Aktionen-Bereich fünf Buttons in einer einzigen, nicht
    umbrechenden Zeile (`.modal-actions`) — lief auf schmaleren Bildschirmen
    über den sichtbaren Dialogrand hinaus (Nutzerbericht: „Buttons sind zu
    groß und außerhalb des sichtbaren Bereichs"). Behoben durch Aufteilung
    in zwei Zeilen (Hilfsaktionen „Neu erzeugen"/„Kopieren"/„PIN drucken"
    getrennt von „Abbrechen"/„Speichern") plus `flex-wrap: wrap` als
    generelles Sicherheitsnetz für `.modal-actions` in jedem Admin-Dialog.
    Die zusätzlich gemeldete Beobachtung „im ganzen Adminbereich sind die
    Buttons größer geworden" ließ sich **nicht** bestätigen — Code-Splitting
    zwischen Admin/Register-Bereich per Vite-Manifest geprüft (keine
    Überschneidung der CSS-Chunks), Basis-Button-Stile in
    `admin/+layout.svelte` per Git-Historie auf Unverändertheit geprüft.
    Falls das Problem weiterhin auftritt, brauchen wir einen Screenshot/
    genaueren Kontext (Gerät, Browser, welche konkrete Seite).
  - Bei der Gelegenheit einen echten Bug in `api.ts`s `request()` gefunden
    und behoben: `Object.assign(error, data)` (für Task #90s
    `needs_admin_verification`-Weiterleitung) überschrieb `error.message`,
    falls die Fehlerantwort zufällig ein `message`-Feld enthielt — jetzt
    werden `error`/`message` beim Kopieren der Zusatzfelder ausgeschlossen.
    Von der bestehenden Testsuite aufgefangen, bevor es committet wurde.
  - **Lücke gefunden und behoben (Nutzerbericht):** Setzen der
    Administrator-Checkbox bei einem bestehenden Benutzer ohne Passwort
    (`PUT /api/admin/users/:id`) wurde bisher nicht geprüft — der Benutzer
    wäre Administrator geworden, ohne die Systemverwaltung je per
    Passwort-Step-up erreichen zu können. `password_hash` ist jetzt
    nullable (Migration `0013_admin_password_required.sql`, Non-Admins
    hatten ohnehin nur einen zufälligen, nie herausgegebenen Platzhalter-
    Hash — dieser wird für alle Bestandsbenutzer mit `is_admin = false`
    auf `NULL` zurückgesetzt), `POST`/`PUT` in `admin/users.ts` verlangen
    ein Passwort, sobald `is_admin: true` gesetzt wird und weder ein neues
    Passwort mitgeschickt wird noch bereits eines existiert. Analoge
    Prüfung im Frontend-Formular (`admin/users/+page.svelte`) für
    sofortiges Feedback ohne Round-Trip.
- [x] **#91** Artikel-Button-Beschriftung bricht je nach Bildschirmbreite unterschiedlich um
  Aufgekommen beim Live-Test (2026-08-29): `.grid-btn` (Artikel-Kacheln in
  Bonkasse `register/[id]/+page.svelte` und Bedienungskasse
  `.../order/+page.svelte`) hat nur `min-height: 70px` und
  `overflow-wrap: anywhere`, keine feste Höhe. Beispiel „Weizenbier": auf
  einem schmalen Bildschirm bricht der Text automatisch zweizeilig um und
  sieht gut aus, auf einem breiten Bildschirm ist die Kachel breit genug
  für eine Zeile — dieselbe Beschriftung wirkt je nach Gerät
  unterschiedlich, weil der automatische Umbruch nicht kontrollierbar ist.
  Aktuell zeigen die Buttons direkt `article.name` (`nameOf()` in beiden
  Dateien) — dasselbe Feld, das auch auf Rechnungen/im DSFinV-K-Export
  erscheint.
  **Zwei Lösungsansätze, noch nicht entschieden:**
  1. Beschriftung mit manuellen Zeilenumbrüchen eingebbar machen (Admin
     steuert selbst, wo umgebrochen wird), gerendert mit
     `white-space: pre-line`, damit der Umbruch auf jedem Bildschirm gleich
     aussieht. **Wichtig:** darf nicht `article.name` selbst überschreiben
     (das würde mehrzeilige Namen in Rechnungen/Export/Berichten
     einschleppen) — bräuchte ein eigenes Feld, z. B. `label` auf
     `register_layout_slot` (dort gibt es mit `color` schon ein
     Pro-Slot-Override neben dem Artikel selbst, exakt das gleiche Muster),
     nullable, fällt ohne gesetzten Wert auf `article.name` zurück.
  2. Button-Höhe im Kassenlayout-Editor fest einstellbar machen (statt nur
     `min-height`), damit alle Buttons einheitlich hoch sind, mit
     `overflow: hidden` bei zu langem Text abschneiden statt umzubrechen.
  Beide Ansätze schließen sich nicht zwingend aus (feste Höhe + optionale
  manuelle Umbrüche) — Entscheidung/Kombination noch offen.

  **Konzept korrigiert (2026-08-29):** Annahme oben ("dasselbe Feld, das
  auch auf Rechnungen/DSFinV-K erscheint") war falsch — geprüft anhand
  des Codes: `article.name` wurde schon vorher **ausschließlich** für die
  Kassentaste verwendet (`nameOf()`), Rechnungen/DSFinV-K lasen
  `article.receipt_text ?? article.name` (Bontext). Root Cause der
  Inkonsistenz zusätzlich bestätigt: `grid-template-columns:
  repeat(var(--cols), minmax(80px, 1fr))` — Spaltenbreite ist proportional
  zur Bildschirmbreite, daher unterschiedliche Umbruchpunkte je Gerät.
  Lösung 2 (feste Höhe + Abschneiden) hätte das eigentliche Problem nicht
  behoben, nur verschoben (abgeschnittener Text statt anders umgebrochen
  — Informationsverlust statt nur anderer Optik), daher **Lösung 1**
  umgesetzt.

  **Erledigt (2026-08-29):**
  - Migration `0014_layout_slot_label_hidden.sql`: `register_layout_slot`
    bekommt `label VARCHAR(200) NULL` (Fallback auf Artikelname) und
    `hidden BOOLEAN NOT NULL DEFAULT false`.
  - Migration `0015_article_name_only.sql`: da die Tastenbeschriftung jetzt
    pro Slot lebt, braucht `article` kein separates Kurzname/Bontext-Paar
    mehr — `name` auf VARCHAR(200) verbreitert (Bontext erlaubte bis zu
    200 Zeichen, Kurzname nur 100 — sonst hätte die Migration bei langen
    Bontexten mit einem Fehler abgebrochen, Postgres kürzt VARCHAR nicht
    still), `receipt_text`-Werte wo gesetzt nach `name` übernommen, Spalte
    danach gedroppt. Betroffen: `admin/articles.ts`, `register-session.ts`
    (drei Stellen `article.receipt_text ?? article.name` → `article.name`),
    `admin/cancellations.ts`, `shared/types.ts`, `admin/articles/+page.svelte`
    (Bontext-Feld raus, Kurzname-Label → „Name"). Nebenbei entfernt: toter
    Code `lib/order.ts`s `articleLabel()` — nie aufgerufen, Kommentar log
    zudem veraltet (behauptete receipt_text-Fallback, Body machte nur
    `return a.name`).
  - Layout-Editor (`admin/settings/layouts/[id]/+page.svelte`): Popover pro
    Slot um 3-zeiliges Textfeld ("Tastenbeschriftung", leer = Artikelname)
    und Checkbox ("Vorübergehend verstecken") erweitert. "Entfernen"-Button
    entfernt (redundant zu Zurückziehen in die Ablage per Drag&Drop).
  - **Bug gefunden und behoben (Nutzerbericht: Farbe geht beim Verschieben
    verloren):** `onDrop()` schlug die alte Farbe erst nach dem Entfernen
    des Slots aus dem Array nach (`slotAt()` fand also immer nichts mehr,
    Fallback auf `DEFAULT_COLOR` bei jedem Verschieben). Fix: die komplette
    Slot-Instanz vor dem Entfernen greifen und als Ganzes an die neue
    Position spreaden — nimmt automatisch auch `label`/`hidden` mit.
  - "Verstecken" filtert serverseitig (`register-session.ts`s Slot-Query:
    `AND hidden = false`), nicht clientseitig — ein versteckter Slot kommt
    an der Kasse gar nicht erst an, sieht exakt wie eine leere Zelle aus,
    genau wie beim bestehenden `is_active`-Muster für Artikel/Kassen.
    Dadurch war an den beiden Kassen-Views selbst keine Änderung für das
    "Unsichtbar"-Verhalten nötig.
  - Beide Kassen-Views (`register/[id]/+page.svelte`,
    `.../tables/[tableId]/order/+page.svelte`): Taste zeigt
    `slot.label || nameOf(slot.article_id)`, zusätzlich `white-space:
    pre-line` auf `.grid-btn` für manuelle Umbrüche. Bestellliste/
    Notiz-Dialog-Titel zeigen weiterhin den echten Artikelnamen (nicht das
    Slot-Label) — bewusste Nutzerentscheidung.
  - Neue Tests: `admin-routes.integration.test.ts` (Label/Hidden werden
    beim Speichern und Duplizieren übernommen),
    `register-session.integration.test.ts` (versteckter Slot fehlt in der
    Antwort komplett, sichtbarer Slot liefert sein Label). Backend-Unit
    (269/269), Backend-Integration, Frontend-Unit (70/70) und Typecheck
    grün.
  - **Nebenbei gefunden:** `docs/Datenmodell.dbml` hat für
    `register_layout`/`register_layout_slot` deutlich mehr Drift zum realen
    Schema als hier korrigiert (z. B. `register_layout.register_id`/
    `is_default` existieren im echten Schema gar nicht) — nur die für
    diese Änderung direkt relevanten Felder (`label`, `hidden`) ergänzt,
    größere Doku-Bereinigung als eigenständige Aufgabe noch offen.
- [ ] **#92** DNS-Masquerading für Split-Horizon-DNS (aus Task #66 ausgelagert)
  Herausgelöst aus Task #66 (2026-08-29, Nutzerwunsch: eigener Task). Ziel:
  Bedienungen mit eigenen Geräten das Installieren eines eigenen
  CA-Zertifikats ersparen, indem FairPOS ein öffentlich validiertes
  Zertifikat (z. B. Let's Encrypt) für eine echte, dem Verein gehörende
  Domain nutzt, deren Namensauflösung am Veranstaltungsort per lokalem DNS
  auf die LAN-IP des FairPOS-Servers "umgebogen" wird — jeder
  Standard-Browser vertraut der offiziellen CA ganz normal, kein manueller
  Vertrauensschritt auf irgendeinem Gerät nötig. Details/Ablauf (DNS-01-
  Challenge, DHCP-Verteilung am Vereins-Router, reale Einschränkungen ohne
  eigene Domain/ohne Router-Zugriff): siehe Task #66s bisherige Notizen
  (Versionsgeschichte dieser Datei) — hier nur noch das Backend-seitige
  DNS-Masquerading selbst.

  **Backend-Einstellungen (Nutzervorschlag + Ergänzungen, 2026-08-29):**
  - **Eigene Domain** — die Domain, die am Veranstaltungsort auf die
    lokale IP zeigen soll (z. B. `kasse.mein-verein.de`). Muss zum
    Zertifikat aus Task #66 passen (gleicher Hostname).
  - **Vorgelagerte/Upstream-DNS-Server** (primär + optional sekundär) —
    wohin alle Anfragen weitergeleitet werden, die **nicht** die eigene
    Domain betreffen. Ohne das würde jedes Gerät, das den FairPOS-Server
    als DNS nutzt, für alles andere (normales Internet, andere Apps auf
    demselben Gerät) die Namensauflösung verlieren — der Server muss also
    für alles außer der eigenen Domain ein normaler Forwarder bleiben,
    nicht nur ein Ein-Domain-Resolver.
  - **Eigene IP** — die Ziel-IP, auf die die Domain zeigen soll (LAN-IP
    des FairPOS-Servers selbst). Manuell änderbar (z. B. bei mehreren
    Netzwerkschnittstellen, oder wenn Auto-Detect die falsche erwischt)
    + Auto-Detect-Button (analog zum bestehenden Muster „TSE-Status prüfen"
    o. Ä. — Button löst Server-seitige Erkennung aus, z. B. über die
    Standard-Ausgangsroute, und trägt das Ergebnis ins Feld ein).
  - **An/Aus-Schalter für die gesamte Funktion** — nicht jedes Deployment
    will einen lokalen DNS-Server laufen haben; per Default aus.
  - **TTL für den DNS-Eintrag** — wie lange Geräte die Auflösung cachen,
    bevor sie erneut anfragen. Relevant falls sich die eigene IP mal
    ändert (z. B. Server-Hardware-Wechsel zwischen Veranstaltungen) —
    kurze TTL vermeidet, dass Geräte danach noch die alte IP aus dem Cache
    verwenden.
  - **„Auflösung testen"-Aktion** — schickt eine echte DNS-Anfrage gegen
    den eigenen laufenden Resolver und zeigt, ob die konfigurierte Domain
    tatsächlich auf die konfigurierte IP auflöst, statt dass der erste
    echte Test ein Gerät am Einlass ist.

  **Architekturfragen, noch offen:**
  - Welche DNS-Server-Software läuft im Hintergrund. `dnsmasq` naheliegend
    (leichtgewichtig, Standard-Ubuntu-Paket, kann Forwarder + einzelne
    Host-Overrides gleichzeitig, passt zum bisherigen „native Ubuntu, kein
    Docker"-Ansatz).
  - DNS braucht Port 53 — Node/Fastify läuft nicht privilegiert. Vermutlich
    dasselbe Muster wie `system/time.ts`/`system/shutdown.ts`: `dnsmasq`
    als eigener systemd-Dienst, Backend schreibt nur dessen Konfigdatei und
    stößt einen eng begrenzten Neustart per sudoers-Regel an, statt selbst
    auf Port 53 zu lauschen.
  - Geräte im WLAN müssen diesen DNS-Server tatsächlich **nutzen** —
    braucht entweder eigenen Router/AP mit passender DHCP-Option 6, oder
    manuelle Konfiguration pro Gerät. Kein FairPOS-seitiges Setting kann
    das erzwingen, nur dokumentieren/Onboarding-Hinweis dafür.
  - Verhältnis zu Task #66s Zertifikats-Upload: DNS-Masquerading allein
    bringt nichts ohne ein zur Domain passendes Zertifikat — beide Tasks
    hängen zusammen, aber technisch unabhängig umsetzbar (Zertifikat auch
    ohne diesen DNS-Server per DNS-01-Challenge extern beziehbar und
    manuell hochladbar).

  **Implementiert (2026-08-30):** `dnsmasq` als Hintergrunddienst, exakt
  nach dem oben skizzierten Muster. Backend: `system/dnsConfig.ts`
  (Validierung, Konfig-Rendering, Staging + privilegiertes
  `dns-config.sh`-Skript mit `dnsmasq --test`-Validierung und
  automatischem Rollback, IP-Auto-Erkennung über `ip route get`,
  Auflösungstest per direkter Abfrage an `127.0.0.1`), Route
  `routes/admin/dnsConfig.ts` (`GET`/`POST`/`DELETE` +
  `/detect-ip`/`/test`), Einstellungen in `system_setting`
  (`dns_domain`/`dns_upstream_primary`/`dns_upstream_secondary`/
  `dns_target_ip`/`dns_ttl`) — kein neues Migrations-File nötig.
  **Kein An/Aus-Schalter** (Nutzerentscheidung, 2026-08-30, siehe oben
  „An/Aus-Schalter" — verworfen zugunsten reiner Präsenz-basierter
  Aktivierung, analog zum SSL-Zertifikat: „konfiguriert" = eine Domain ist
  gespeichert; „Deaktivieren"-Button entfernt die Konfiguration
  vollständig). Frontend: eigene Seite Einstellungen → DNS-Masquerading
  (`admin/settings/dns-config`), Upstream-DNS-Server dort mit
  konfigurierbar. Doku: Installationsanleitung Abschnitt 16. Unit- +
  Integrationstests vorhanden (`system/dnsConfig.test.ts`,
  `routes/admin/dnsConfig.integration.test.ts`).

  **Live gefunden und behoben (2026-08-30):** "Auflösung testen" fragte
  hartcodiert `127.0.0.1` ab — dnsmasq lauscht dort aber bewusst nicht
  (`listen-address=<eigene IP>` + `bind-interfaces`, s. o.), daher
  `ECONNREFUSED`. Fix: die Testfunktion fragt jetzt die konfigurierte
  eigene IP ab statt `127.0.0.1` — bildet damit auch genauer nach, was ein
  echtes Gerät am Veranstaltungsort tut (dieselbe IP, die per DHCP verteilt
  würde).

  **Live gefunden und behoben (2026-08-30):** zweiter Speichervorgang
  schlug beim `systemctl restart dnsmasq` fehl
  (`illegal repeated keyword at line 5 of /etc/dnsmasq.d/fairpos.conf.bak`).
  Ursache: `dns-config.sh`s eigenes Rollback-Backup lag als
  `fairpos.conf.bak` direkt in `/etc/dnsmasq.d/` — Ubuntus Standard-
  `conf-dir`-Regel schließt aber nur `.dpkg-dist`/`.dpkg-old`/`.dpkg-new`
  aus, nicht `.bak`, sodass dnsmasq das eigene Backup beim Neustart als
  zweite, echte Konfigurationsdatei mit denselben Direktiven einliest.
  Fix: Backup liegt jetzt außerhalb von `/etc/dnsmasq.d/`
  (`/var/lib/fairpos/dns-staging/fairpos.conf.bak`); zusätzlich rollt das
  Skript jetzt auch zurück, wenn `systemctl restart` selbst fehlschlägt
  (vorher nur bei fehlgeschlagenem `dnsmasq --test`) — sonst hätte ein
  Neustart-Fehler dnsmasq mit der neuen, kaputten Config stehen lassen
  statt beim alten funktionierenden Zustand zu bleiben.

  **Noch offen:** finaler Live-Test — der Nutzer hat noch keinen neuen
  Router, der DHCP-Option 6 (DNS-Server) auf die eigene IP dieses Servers
  umstellen kann; bis dahin bleibt dieser Task offen, auch wenn die
  Implementierung vollständig ist.
- [x] **#93** Geschäftszahlen auf der Admin-Startseite (Folgeaufgabe aus #63)
  Herausgelöst aus Task #63 (2026-08-29, Nutzerentscheidung: Fokus dort
  zunächst nur auf Systemzustand/Fehler). Idee: zusätzliche Kennzahlen-
  Kacheln auf dem Dashboard, die tatsächliche Geschäftszahlen statt
  Systemgesundheit zeigen — z.B. Tagesumsatz, Anzahl offener/besetzter
  Tische, Bestellungen der laufenden Veranstaltung. **Noch nicht
  analysiert:** welche Kennzahlen wirklich aussagekräftig sind, welche
  bestehenden Endpoints/Queries sie günstig liefern können (vermutlich
  Overlap mit den bestehenden Berichten unter `admin/reports.ts`), und ob
  eine Live-Aktualisierung (SSE, analog zu anderen Echtzeit-Ansichten) oder
  ein einfacher Reload beim Seitenaufruf reicht. Erst nach Abschluss von
  Task #63 angehen.

  **Teilweise vorgezogen (2026-08-29, Nutzerwunsch, direkt in Task #63
  umgesetzt):** „Tagesumsatz" (neuer Endpoint `/api/admin/reports/
  today-revenue`) und „Offene Rechnungen" (bestehender `/open-positions`-
  Endpoint) sind bereits da, inkl. 30-Sekunden-Auto-Refresh fürs ganze
  Dashboard (Intervall-Reload statt SSE — passt zum bereits bestehenden
  Client-Polling-Muster der Anwendung, siehe `AGENTS.md`).

  **Bewusst nicht umgesetzt (2026-08-30, Nutzerentscheidung):** „Anzahl
  offener/besetzter Tische" und „Bestellungen der laufenden Veranstaltung"
  — aktuell nicht wichtig genug, kein aktiver Bedarf. Task damit
  abgeschlossen; bei Bedarf später als neuer Task wieder aufgreifen statt
  hier weiter offen zu halten.
