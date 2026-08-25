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
- [ ] **#58** TSE-Zeitsynchronisation + Self-Test (`maintainTse`) tatsächlich aufrufen
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
  Self-Test nötig, `maintainTse()` unten deckt automatisch beides ab, sobald
  sie aufgerufen wird. Ohne regelmäßige Ausführung verliert die TSE laut
  KassenSichV irgendwann die gültige Zeitreferenz bzw. den gültigen
  Self-Test-Status. Bei der Umsetzung überlegen, was ein guter Auslösepunkt
  ist (z.B. beim Backend-Start, wenn einer der beiden Schwellwerte
  unterschritten wird; beim Tagesabschluss; oder ein expliziter „Jetzt
  synchronisieren"-Button in der Admin-UI) — noch nicht entschieden,
  zurückgestellt.
- [ ] **#59** TSE-Status-Karte: Public-Key-Zeile läuft über den Kartenrahmen hinaus
  Gefunden bei der Live-Installation (Screenshot, 2026-08-24):
  `admin/settings/system/+page.svelte`, die `.kv`-Grid-Zeile für „Public Key"
  (`.pubkey`, `word-break: break-all`) bricht trotzdem nicht um und läuft über
  den Kartenrahmen hinaus. Vermutliche Ursache: `.kv` ist
  `grid-template-columns: max-content 1fr` — Grid-Items haben per Default
  `min-width: auto`, wodurch die `1fr`-Spalte trotz `word-break` nicht unter
  die intrinsische (ungebrochene) Breite des Inhalts schrumpft. Ansatz:
  `min-width: 0` auf `.kv dd` (oder gezielt auf `.pubkey`) ergänzen, ggf.
  zusätzlich `overflow-wrap: anywhere` statt/neben `word-break: break-all`.
  Noch nicht umgesetzt.
- [ ] **#60** Systemzeit des Servers anzeigen + manuell setzen können
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
- [ ] **#61** Shutdown-Button in der Admin-UI
  Gewünscht, damit ein normaler Vereins-Nutzer den Server kontrolliert
  herunterfahren kann, ohne auf die Shell zu müssen. Gleiches technisches
  Muster wie Task #60: `fairpos` braucht dafür eine eng zugeschnittene
  `sudoers`-Regel (z.B. ausschließlich `sudo systemctl poweroff` ohne
  Passwort erlaubt, kein Full-Sudo), vom Backend per `execFile` aufgerufen.
  UI-seitig unbedingt mit deutlicher Sicherheitsabfrage (analog zu anderen
  destruktiven Aktionen in der App, z.B. Backup-Restore/Reset-Diskussionen)
  — ein versehentlicher Klick legt sofort den laufenden Kassenbetrieb lahm.
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
- [ ] **#64** System-Health-Check (Sammlung technischer Prüfungen)
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
- [ ] **#65** TSE-Einstellungen auf eine eigene Settings-Seite auslagern
  Aktuell leben „TSE-Verbindung" und „TSE-Status" als zwei Karten mitten auf
  der allgemeinen `/admin/settings/system`-Seite (zusammen mit
  Kassensystem-Seriennummer, Zeitzone/Serverzeit, Server-Adresse,
  Datenbank-Backup) — die TSE-Karten sind inzwischen recht umfangreich
  (Mount-Pfad/Auto-erkennen, Client-ID, TimeAdmin-PIN, ausführliche
  Status-Anzeige mit Rohdaten-Aufklapper) und würden besser auf eine eigene
  Seite passen, analog zu „Unternehmensdaten" oder „Drucker", die auch
  jeweils eigene Nav-Punkte haben (`admin/+layout.svelte`). Neuer Nav-Punkt
  z.B. `/admin/settings/tse`, restliche „System"-Seite bleibt für
  Seriennummer/Zeitzone/Server-Adresse/Backup.
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
