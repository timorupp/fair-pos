# Gefahrenliste & Refactoring-Bedarf

Während der Entwicklung gefundene Sicherheitsprobleme, fragwürdige Designs und Refactoring-Bedarf, die nicht sofort behoben werden. Wird inkrementell gepflegt und gemeinsam abgearbeitet.

**Spalten:** ID · Schwere · Bereich · Beschreibung · Vorschlag · Gefunden

| ID | Schwere | Bereich | Beschreibung | Vorschlag | Gefunden |
|----|---------|---------|--------------|-----------|----------|
| ~~D-001~~ | ~~mittel~~ | ~~Datenmodell~~ | ~~`col_order`/`row_order` pro Tisch gespeichert.~~ | **Erledigt 2026-06-24:** Eigene Tabellen `floor_plan_column(label PK, col_order UNIQUE)` und `floor_plan_row(...)`; `dining_table` referenziert beide per FK mit `ON DELETE CASCADE`. Order-Werte existieren genau einmal — Datenmodell garantiert Konsistenz. Spaltenlöschung räumt Tische automatisch mit. Backend an JOINs angepasst, Frontend-Schnittstelle unverändert. | 2026-06-24 |
| ~~D-002~~ | ~~mittel~~ | ~~Migrationen~~ | ~~Patch-Historie 0002–0007 für noch nicht produktives Schema.~~ | **Erledigt 2026-06-24:** Alle Deltas in `0001_initial.sql` konsolidiert; 0002–0007 entfernt. Migrations-README dokumentiert wie bestehende lokale DBs zurückgesetzt werden müssen. | 2026-06-24 |
| ~~D-003~~ | ~~hoch~~ | ~~Tests~~ | ~~Keine Tests vorhanden.~~ | **Erledigt 2026-06-24:** Vitest in beiden Paketen, 196 Tests grün, alle Pure-Helpers abgedeckt. Test-DB-Infrastruktur weiterhin offen → T-019. | 2026-06-24 |
| ~~D-004~~ | ~~hoch~~ | ~~Architektur~~ | ~~Print Worker blockt #5/#6/#7.~~ | **Erledigt 2026-06-24:** Print Worker implementiert (#2), #5/#6/#7 fertig. | 2026-06-24 |
| ~~D-005~~ | ~~niedrig~~ | ~~UX~~ | ~~Spalten/Zeilen einzeln hinzufügen/löschen fehlt.~~ | **Erledigt 2026-06-24:** Buttons „+ Spalte"/„+ Zeile" im Editor-Header (Prompt für Label, atomare Backend-Erweiterung). Handle bekommt beim Hover ein „×" zum Löschen der gesamten Spalte/Zeile mit Bestätigung. Backend-Endpoints: `POST /admin/tables/columns`, `POST /admin/tables/rows`, `DELETE /admin/tables/columns/:label`, `DELETE /admin/tables/rows/:label`. | 2026-06-24 |

## Bereits implementierte Bereiche ohne Unit Tests

Tests müssen nachgeholt werden. Reihenfolge nach Risiko/Kritikalität sortiert.

| ID | Schwere | Bereich | Beschreibung | Testumfang | Gefunden |
|----|---------|---------|--------------|------------|----------|
| ~~T-001~~ | ~~hoch~~ | ~~Backend / Auth~~ | ~~Authentifizierungsfluss nicht getestet.~~ | **Erledigt 2026-06-24:** `routes/auth.integration.test.ts` mit 12 Tests — Admin-Login (Happy/falsches Passwort/Non-Admin/Unknown User/missing fields), Register-Token-Exchange (gültig/unbekannt/abgelaufen/wiederverwendet), Session-Trennung (admin→register kein Zugriff und umgekehrt), Logout-Cookie-Reset. | 2026-06-24 |
| T-002 | hoch | Backend / DB | `withTransaction` Rollback-Verhalten (braucht echten Throw + Verify Rollback). | Würde minimaler Suite-Eintrag werden. Aktuell durch die anderen Integrationstests indirekt geprüft, da viele auf `withTransaction` aufbauen. Falls echter Datenverlust gemeldet wird, dedizierten Test ergänzen. | 2026-06-24 |
| ~~T-003~~ | ~~hoch~~ | ~~Backend / Admin-Routen~~ | ~~Alle admin/*.ts Routen ungetestet.~~ | **Teilweise erledigt 2026-06-24:** `admin-routes.integration.test.ts` deckt Kategorien (Duplikat-409), Articles (Join), Users (Self-Delete-Block, Duplikat-409), Layouts (Resize+Duplicate), Tables (Generate+Cascade-Delete+Duplicate-409), Invoices-Reprint, Excel-Export ab. CRUD-Vollständigkeit für jeden Endpoint ist noch lückenhaft; Tests für `events` und `cancellation-reasons` folgen bei Bedarf. | 2026-06-24 |
| ~~T-004~~ | ~~mittel~~ | ~~Backend / Layouts~~ | ~~Layouts-Slot-Logik nicht getestet.~~ | **Erledigt 2026-06-24:** Out-of-bounds-Slot-Removal beim Grid-Shrink + Duplicate-Logik in `admin-routes.integration.test.ts` abgedeckt. | 2026-06-24 |
| ~~T-005~~ | ~~mittel~~ | ~~Backend / Tables~~ | ~~Tables-Routen ungetestet.~~ | **Erledigt 2026-06-24:** Generate + Cascade-Delete von Spalten + Duplicate-Label-Check in `admin-routes.integration.test.ts`. `makeLabels` ist bereits per Unit-Test in `tables.test.ts` abgedeckt. | 2026-06-24 |
| ~~T-006~~ | ~~mittel~~ | ~~Frontend / API-Client~~ | ~~`lib/api.ts` request helper.~~ | **Erledigt 2026-06-24:** `request` exportiert + mit fetch-mock getestet (10 Tests). | 2026-06-24 |
| T-007 | mittel | Frontend / Layout-Editor | `routes/admin/settings/layouts/[id]/+page.svelte` — `buildGrid`, `changeSize` (Slots fallen aus Grid raus), Drop-Logik (Swap bei besetzter Zelle). | Reine Funktionen testen: `buildGrid`, `changeSize`, Drop-Swap; Komponententest für Drag-and-Drop optional. | 2026-06-24 |
| ~~T-008~~ | ~~mittel~~ | ~~Frontend / Saalplan-Editor~~ | ~~`reorderArray` + columns/rows Ableitung.~~ | **Erledigt 2026-06-24:** `reorderArray` getestet (8 Tests); `columnsFromTables`/`rowsFromTables` in `lib/floor-plan.ts` extrahiert + getestet (6 Tests). | 2026-06-24 |
| ~~T-009~~ | ~~mittel~~ | ~~Frontend / Deutsche Zahlen~~ | ~~parseDE/formatDE Helpers.~~ | **Erledigt 2026-06-24:** `formatEuro` etc. in `receipt/format.test.ts` umfangreich getestet (de-DE inkl. Negativen, Tausenderpunkten, Cent-Rundung). Die Form-Parser im Frontend nutzen direkt `replace(',','.')` + `parseFloat` — trivial, kein dedizierter Helper extrahiert. | 2026-06-24 |
| T-010 | mittel | Backend / Print Worker | atomarer Claim, Crash-Recovery, Retry. | Pure Helpers (`worker.helpers.ts`) sind getestet. Volle Worker-Schleife braucht Mock-TCP-Drucker (`net.createServer`). Offen. | 2026-06-24 |
| T-011 | mittel | Backend / Print Endpoints | Status-Probe, Test-Print, Job-Listing, Job-Cancel. | Würde mit Mock-TCP-Drucker gehen. Offen — kleines Restrisiko, da der Pfad einfach ist. | 2026-06-24 |

## Während Print-Worker-Implementierung gefunden

| ID | Schwere | Bereich | Beschreibung | Vorschlag | Gefunden |
|----|---------|---------|--------------|-----------|----------|
| ~~D-006~~ | ~~niedrig~~ | ~~Frontend / UX~~ | ~~Sequentielle Status-Abfrage.~~ | **Akzeptiert 2026-06-24:** Implementation läuft bereits über `Promise.all`. Ursprüngliche Beschreibung war ungenau. Wenn später Backoff bei chronisch offlinen Druckern nötig wird, separater Eintrag. | 2026-06-24 |
| ~~D-007~~ | ~~niedrig~~ | ~~Backend / Determinismus~~ | ~~`new Date()` im Test-Print-Handler.~~ | **Akzeptiert 2026-06-24:** Reine Logik `buildTestPrint(name, ts)` nimmt Zeitstempel als Parameter und ist deterministisch testbar (siehe `escpos.test.ts`). Der Endpoint-Aufruf benutzt nur einen Wall-Clock-Stempel im PDF — kein Integrationsrisiko, kein DI nötig. | 2026-06-24 |
| ~~D-008~~ | ~~niedrig~~ | ~~Datenmodell~~ | ~~`print_job.type` ohne `test_print`.~~ | **Erledigt 2026-06-24:** `test_print` als vierter Wert zum `print_job.type` CHECK-Constraint und zum `PrintJobType`-Shared-Type ergänzt. Testdruck-Endpoint nutzt jetzt `enqueuePrintJob('test_print', …)` — durchläuft die gesamte Druck-Infrastruktur (Queue → NOTIFY → Worker → TCP → Status), kein zweiter Druckpfad mehr. UI lädt die Queue nach dem Senden direkt neu, sodass der Operator den Job im Lifecycle sieht. | 2026-06-24 |

## Während Kassenbon-PDF-Implementierung gefunden

| ID | Schwere | Bereich | Beschreibung | Vorschlag | Gefunden |
|----|---------|---------|--------------|-----------|----------|
| ~~D-009~~ | ~~hoch~~ | ~~Compliance~~ | ~~QR-Code-Payload verwendete ein selbst-erfundenes Format.~~ | **Erledigt (Task #46, August 2026):** `receipt/qr.ts` baut jetzt exakt das von DSFinV-K v2.4 Anhang I vorgeschriebene Feldformat (`<qr-code-version>;<kassen-seriennummer>;<processType>;<processData>;<transaktions-nummer>;<signatur-zaehler>;<start-zeit>;<log-time>;<sig-alg>;<log-time-format>;<signatur>;<public-key>`), inkl. Signaturalgorithmus/Zeitformat/Public-Key aus `tse/certificateInfo.ts` (`native/tse-cli`s `info`-Kommando liest sie jetzt aus). Gleichzeitig auf das ebenfalls exakt vorgeschriebene `processData`-Format für `Kassenbeleg-V1`/`Bestellung-V1`/`SonstigerVorgang` umgestellt (`tse/processData.ts`). Verbleibender, kleinerer Rest: volle TSE-Zertifikatskette für `tse.csv` (`TSE_ZERTIFIKAT_I/II`) — siehe `docs/Rechtliche-Anforderungen.md` Abschnitt 6.7. | 2026-06-24, konkretisiert 2026-08-05, erledigt 2026-08-05 |
| ~~D-010~~ | ~~mittel~~ | ~~Anforderungen~~ | ~~`system_serial` wird beim ersten Serverstart noch nicht generiert.~~ | **Erledigt 2026-06-24:** `ensureSystemSerial()` läuft nach Migrations, idempotent. | 2026-06-24 |
| ~~D-011~~ | ~~niedrig~~ | ~~Sicherheit~~ | ~~Token-Entropie für /receipt/:token.~~ | **Erledigt 2026-06-24:** `generateReceiptToken()` in `receipt/numbering.ts` nutzt `crypto.randomBytes(32).toString('base64url')` → 256 Bit Entropie, 43 URL-sichere Zeichen. Brute-Force-Aufzählung astronomisch unrealistisch. | 2026-06-24 |
| ~~D-012~~ | ~~niedrig~~ | ~~UI~~ | ~~Bon-Vorschau via `window.open`.~~ | **Erledigt 2026-06-24:** Vorschau läuft jetzt inline in einem Modal via `<embed>`; sekundärer „In neuem Tab"-Link für PDF-Viewer-Bevorzugung. | 2026-06-24 |

## Während Kassenbon-PDF — Tests fehlen für

| ID | Schwere | Bereich | Beschreibung | Testumfang | Gefunden |
|----|---------|---------|--------------|------------|----------|
| T-012 | mittel | Backend / Receipt-Endpoints | `routes/receipt.ts` (Token→PDF), `settings.ts:/receipt-preview`. | Pure Renderer (`pdf.ts`) ist getestet. Token-Endpoint-Test offen. | 2026-06-24 |
| T-013 | mittel | Backend / loadReceiptByToken | DB-getriebene Datenladelogik. | Indirekt durch Reprint-Test in `admin-routes.integration.test.ts` geprüft. Edge-Cases (case-sensitivity, fehlende Token) noch offen. | 2026-06-24 |
| ~~T-014~~ | ~~niedrig~~ | ~~Backend / ensureSystemSerial~~ | ~~Bootstrap-Hooks ungetestet.~~ | **Erledigt 2026-06-24:** `admin-routes.integration.test.ts` deckt `ensureSystemSerial` (fresh/idempotent/replace-malformed) und `initReceiptCounter` (seed from invoice max / no-overwrite) ab. | 2026-06-24 |

## Während Bonkasse-UI-Implementierung gefunden

| ID | Schwere | Bereich | Beschreibung | Vorschlag | Gefunden |
|----|---------|---------|--------------|-----------|----------|
| ~~D-013~~ | ~~hoch~~ | ~~Sicherheit / Auth~~ | ~~Geteilter Session-Cookie.~~ | **Erledigt 2026-06-24:** Zwei getrennte signierte Cookies `admin_session` / `register_session` mit eigenen Middlewares (`authenticateAdmin` / `authenticateRegister`); Auth-Endpoints aufgeteilt in `/auth/admin/*` und `/auth/register/*`; FastifyRequest hat `adminUser` + `registerUser`; Admin-Login refused Non-Admins. Frontend: zwei separate Stores (`adminUser`/`registerUser`), Layouts prüfen jeweils nur ihren eigenen Endpoint, Login-Seite erkennt Token-URL vs. Username/Password. | 2026-06-24 |
| ~~D-014~~ | ~~mittel~~ | ~~Datenintegrität~~ | ~~App-weiter Advisory-Lock blockt parallele Checkouts.~~ | **Erledigt 2026-06-24:** Globaler Beleg-Zähler als einzelne Row in `system_setting` (`receipt_counter`). `nextReceiptNumber(client)` macht ein `UPDATE … RETURNING` — Row-Lock nur für die Dauer der Anweisung, nicht für den ganzen Checkout. Globale, lückenlose Sequenz bleibt erhalten (Rollback rollt den Zähler mit zurück). Bootstrap seedt den Counter aus `MAX(invoice.receipt_number)`. Settings-PUT zieht den Counter beim Anheben von `receipt_counter_start` mit hoch. | 2026-06-24 |
| ~~D-015~~ | ~~niedrig~~ | ~~UX~~ | ~~Kein Reprint-Pfad für bereits gespeicherte Rechnungen.~~ | **Erledigt 2026-06-24:** Neuer Endpoint `POST /api/admin/invoices/:id/reprint` lädt die persistierte Invoice und enqueued einen frischen Druckauftrag auf dem Drucker der zugehörigen Kasse. UI-Button (🖨) pro Zeile in der Auswertung „Erstellte Rechnungen". Kein UI-Ausbau in Bedienung/Bonkasse (per User-Direktive nicht nötig). | 2026-06-24 |
| ~~D-016~~ | ~~niedrig~~ | ~~UX~~ | ~~Bedienungskasse-User landen auf der Bonkasse-Route und sehen einen statischen Hinweis statt der für ihren Kassentyp passenden UI.~~ | **Erledigt mit Task #6:** eigene Bedienungskasse-UI (Saalplan, Tische, Bestellung, Checkout) unter `register/[id]/floor-plan` bzw. `register/[id]/tables/[tableId]/*` — Nachtrag beim Konsistenz-Check gefunden, Eintrag war nie als erledigt markiert worden. | 2026-06-24, als erledigt nachgetragen 2026-08-05 |

## Während Bonkasse-UI — Tests fehlen für

| ID | Schwere | Bereich | Beschreibung | Testumfang | Gefunden |
|----|---------|---------|--------------|------------|----------|
| ~~T-015~~ | ~~hoch~~ | ~~Backend / register-session~~ | ~~Checkout-Endpoint ungetestet.~~ | **Erledigt 2026-06-24:** `register-session.integration.test.ts` deckt Bonkasse-Checkout (Pos→Items, fortlaufende Nummern, 403/400 Validierung) ab. | 2026-06-24 |
| ~~T-016~~ | ~~mittel~~ | ~~Backend / Reprint-Pfad~~ | ~~Reprint-Endpoint ungetestet.~~ | **Erledigt 2026-06-24:** `admin-routes.integration.test.ts` deckt Reprint (Happy-Path mit Print-Job-Enqueue + 400 bei fehlendem Drucker) ab. | 2026-06-24 |
| T-017 | niedrig | Backend / QR-Endpoint | Token-URL wird korrekt aus `server_address` aufgebaut; ohne Setting fällt auf `request.host` zurück. | Akzeptiert als niedriges Risiko (gross gemockte Server-Adresse seltener Edge Case). | 2026-06-24 |

## Während Bedienungskasse-UI gefunden

| ID | Schwere | Bereich | Beschreibung | Vorschlag | Gefunden |
|----|---------|---------|--------------|-----------|----------|
| ~~D-017~~ | ~~mittel~~ | ~~Compliance~~ | ~~Beim "100 % Rabatt"-Pfad wird im Storno-Endpoint aktuell KEINE 0-€-Invoice + TSE-Eintrag erstellt.~~ | **Erledigt mit Task #41/#45:** kein 0-€-Invoice, sondern der bewusst gewählte, dokumentierte Weg — `order_cancellation` + TSE-signierter `SonstigerVorgang` (AVSonstige) für `booking_type='free_of_charge'`, genau wie für `cancellation` (siehe `docs/Anforderungen.md` → "Zu signierende Vorgänge in FairPOS", `routes/register-session.ts` cancel-Endpoint). Nachtrag beim Konsistenz-Check gefunden, Eintrag war nie als erledigt markiert worden. | 2026-06-24, als erledigt nachgetragen 2026-08-05 |
| ~~D-018~~ | ~~niedrig~~ | ~~UX~~ | ~~UI bestätigt Bestellung auch wenn Items ohne Drucker.~~ | **Erledigt 2026-06-24:** Bestellansicht zeigt jetzt einen `alert()` mit der Anzahl nicht-gedruckter Artikel, bevor sie zur Tischaktionsauswahl zurückkehrt. | 2026-06-24 |
| ~~D-019~~ | ~~niedrig~~ | ~~Datenmodell~~ | ~~Options als Text-Snapshot statt FK.~~ | **Akzeptiert 2026-06-24:** Snapshot-Verhalten ist KassenSichV-korrekt — Bons müssen den Namen zum Bestellzeitpunkt zeigen, auch wenn Optionen später umbenannt werden. Analytik per Option wird aktuell nicht benötigt. Falls in Zukunft ein Report „Welche Optionen werden bestellt?" entsteht, eine `order_item_option` Junction-Tabelle (mit `option_name_snapshot` + nullable FK) einführen. | 2026-06-24 |

## Während Bedienungskasse-UI — Tests fehlen für

| ID | Schwere | Bereich | Beschreibung | Testumfang | Gefunden |
|----|---------|---------|--------------|------------|----------|
| ~~T-018~~ | ~~hoch~~ | ~~Backend / Bedienungs-Endpoints~~ | ~~Bedienungskassen-Flow ungetestet.~~ | **Erledigt 2026-06-24:** `register-session.integration.test.ts` deckt Order-Place (Items angelegt), Checkout (Items→paid + Invoice), Cancel (Items→cancelled) und die Pending-Z-Bon-Sperre (409) ab. | 2026-06-24 |
| ~~T-019~~ | ~~hoch~~ | ~~Test-DB-Infrastruktur~~ | ~~Postgres-spezifische Pfade nicht testbar.~~ | **Erledigt 2026-06-24:** testcontainers-Setup steht. `global-setup.ts` startet einen Postgres-Container pro Test-Run, applies Migrationen; `integration-setup.ts` injiziert die URL pro Worker; `db-fixture.ts` exportiert `truncateAllTables()` für `beforeEach`. Trennung Unit-Tests (`*.test.ts`) vs Integration (`*.integration.test.ts`) per zwei vitest-Konfigs. Erstes Beispiel: `pending-db.integration.test.ts` mit 6 Tests. Befehl: `npm run test:integration`. | 2026-06-24 |

## Dokumentations-Schuld

| ID | Schwere | Bereich | Beschreibung | Vorschlag | Gefunden |
|----|---------|---------|--------------|-----------|----------|
| DOC-001 | mittel | Inline-Doku | JSDoc-Convention (vollständige `@param`/`@returns`) seit 2026-06-24. | **Teilweise erledigt 2026-06-24:** Pure-Helper komplett auf vollständige JSDoc gehoben: `auth/password`, `print/{enqueue,tcp,escpos,order-slip}`, `order/grouping`, `system/serial`, `system/bootstrap`, `db/{client,migrate.helpers}`, `receipt/{format,qr,aggregate,sequence,numbering}`. Routes und Frontend folgen organisch bei künftigen Berührungen — neue Funktionen werden seit der Convention immer komplett dokumentiert. | 2026-06-24 |

## Während Auswertungen-Implementierung gefunden

| ID | Schwere | Bereich | Beschreibung | Vorschlag | Gefunden |
|----|---------|---------|--------------|-----------|----------|
| ~~D-020~~ | ~~niedrig~~ | ~~Reports~~ | ~~Soll-Kassenstand zählt Stornos mit.~~ | **Erledigt 2026-06-24:** `cash-balance` filtert jetzt zusätzlich auf `i.receipt_type='sales_receipt'` und `oi.status IN ('paid','free')`. | 2026-06-24 |
| D-021 | niedrig | Reports | „Erstellte Rechnungen" listet `payment_method='card'` mit auf, obwohl die App aktuell nur `cash` produziert. Spalte sinnvoll, aber für Auswertungs-Excel später konsistent halten. | Beim Excel-Export (#10) sicherstellen, dass die Spalte mit anderen Reports übereinstimmt. | 2026-06-24 |

| ~~T-020~~ | ~~hoch~~ | ~~Backend / Reports~~ | ~~Komplexe Aggregat-Queries ungetestet.~~ | **Erledigt 2026-06-24:** `reports.integration.test.ts` deckt alle vier Reports ab. **Fand einen echten Bug**: `free`-Items wurden im cash-balance mit dem vollen Preis als Bargeld gezählt — sind aber 0€-Belege. Query auf `oi.status = 'paid'` eingeschränkt. | 2026-06-24 |

## Während Z-Bon-Implementierung gefunden

| ID | Schwere | Bereich | Beschreibung | Vorschlag | Gefunden |
|----|---------|---------|--------------|-----------|----------|
| ~~D-022~~ | ~~hoch~~ | ~~Anforderungen~~ | ~~Automatische Nullabschlüsse fehlen.~~ | **Anders gelöst 2026-06-24:** Da der Vereinsserver typisch nur an Veranstaltungstagen läuft, würde ein Cron unzuverlässig feuern. Stattdessen: Server erkennt fehlende Abschlüsse beim Pageload, zeigt globalen Banner + Kassen-Badges + Detail-Liste, und **sperrt Kassieren/Bestellen/Storno** bis der Admin nachgeholt hat. Sicherer als Cron. | 2026-06-24 |
| ~~D-023~~ | ~~mittel~~ | ~~Compliance~~ | ~~Z-Bon-Tagesabgrenzung fehlt.~~ | **Erledigt 2026-06-24:** `closeRegister(id, user, date?)` akzeptiert jetzt einen `YYYY-MM-DD`-Parameter und filtert SQL auf `created_at::date = $date`. Der „Alle ausstehenden abschließen"-Button iteriert pro Tag und erzeugt einen Z-Bon pro Kalendertag. | 2026-06-24 |
| ~~D-024~~ | ~~niedrig~~ | ~~UX~~ | ~~Mehrfacher Abschluss am selben Tag möglich.~~ | **Erledigt 2026-06-24:** Detailseite zeigt jetzt einen Warnhinweis mit der heute schon vergebenen Z-Nr. Operator kann trotzdem fortfahren (Mehrfach-Abschluss ist gewollt im Fehlerfall). | 2026-06-24 |

| ~~T-021~~ | ~~hoch~~ | ~~Backend / Closing-Endpoint~~ | ~~Z-Bon-Erstellung ungetestet.~~ | **Erledigt 2026-06-24:** `closings.integration.test.ts` mit 12 Tests — Z-Nummer sequentiell pro Register, Zero-Closing, Invoice-Link, Print-Job, Pending-Detection, Close-Pending Multi-Day-Catchup, Close-All, Auth. | 2026-06-24 |

## Während Excel-Export-Implementierung gefunden

| ID | Schwere | Bereich | Beschreibung | Vorschlag | Gefunden |
|----|---------|---------|--------------|-----------|----------|
| D-025 | niedrig | Excel-Export | Tagesexport interpretiert das `date`-Query in der Server-Zeitzone. Bei abweichender Client-Zeitzone (z.B. Admin im Urlaub aus anderer TZ) entstehen Lücken/Überlappungen am Tageswechsel. | Zeitzone explizit auf System-Setting `timezone` mappen, oder Datum im UI als Server-Datum dokumentieren. | 2026-06-24 |
| D-026 | niedrig | Excel-Export | Storno-Rechnungen (`receipt_type='cancellation'`) sind im Export **nicht** enthalten. Solange Rechnungsstornos (Task #8) nicht existieren, irrelevant — danach könnten Auswertungs-Differenzen entstehen. | Sobald #8 implementiert ist, entscheiden: separate Spalte/Vorzeichen oder eigenes Sheet für Stornorechnungen. | 2026-06-24 |

| ~~T-022~~ | ~~mittel~~ | ~~Backend / Excel-Endpoint~~ | ~~DB-Query-Pfad ungetestet.~~ | **Teilweise erledigt 2026-06-24:** Smoke-Test in `admin-routes.integration.test.ts` prüft den Tagesexport (XLSX-Magic-Bytes + 400 bei invalidem Datum). Vollständige Datenkorrektheit über das Workbook hinweg bleibt offen — kann nachgezogen werden wenn echte Daten hereinkommen. | 2026-06-24 |
| ~~D-027~~ | ~~niedrig~~ | ~~Sicherheit / Auth~~ | ~~`PUT /api/admin/users/:id` blockte Selbstlöschung und Selbstdeaktivierung, aber nicht die Selbst-Degradierung (`is_admin: false`) — ein einziger verbleibender Administrator hätte sich damit ohne API-seitigen Rückweg aussperren können.~~ | **Erledigt 2026-08-06 (gefunden bei gezieltem Security-Review auf SQL-Injection + Login/Berechtigungsprüfungen aller Endpunkte, sonst keine Funde):** Dritte Guard-Klausel neben den beiden bestehenden (`is_active: false`, DELETE) in `routes/admin/users.ts` PUT — `id === req.adminUser.id && body.is_admin === false` → 400. Test in `admin-routes.integration.test.ts`. | 2026-08-06 |
| ~~D-028~~ | ~~mittel~~ | ~~Repo-Hygiene / Deployment~~ | ~~Alle Shell-Skripte im Repo (`native/tse-cli/build.sh`, `scripts/install/*.sh`, `test/fixtures/*.sh`) waren im Git-Index ohne Ausführbar-Bit (`100644` statt `100755`) gespeichert. Auf dem `/mnt/c/...`-WSL-Mount, auf dem hier entwickelt wird, fällt das nie auf (Windows-Mount täuscht überall `777` vor) — auf echtem Linux (z.B. dem Produktionsserver) schlägt jeder `./skript.sh`-Aufruf mit „Permission denied" fehl. Gefunden live bei der ersten Produktionsinstallation auf einem echten Ubuntu-26.04-Server, als `./build.sh` genau daran scheiterte.~~ | **Erledigt 2026-08-24:** `git update-index --chmod=+x` für alle acht betroffenen Dateien. | 2026-08-24 |
| ~~D-029~~ | ~~hoch~~ | ~~Backend / Build~~ | ~~`npm run build` (`tsc`) kompiliert nur `.ts`→`.js` und kopiert keine `.sql`-Dateien — `dist/db/migrations/` existierte nach dem Build nie. `index.ts` ruft `runMigrations()` bei **jedem** Start auf (idempotente Nachzieh-Prüfung), `migrate.ts` löst seinen Migrationsordner relativ zur eigenen (kompilierten) Datei auf → sucht `dist/db/migrations/`, findet nichts, Absturz mit `ENOENT`. In Dev/Tests nie aufgefallen, weil dort immer `tsx` direkt gegen `src/` läuft (nie über `dist/`). Hat den allerersten echten Produktions-Boot (systemd, `node dist/index.js`) sofort in eine Restart-Schleife geschickt.~~ | **Erledigt 2026-08-24:** `packages/backend/package.json` `build`-Skript kopiert `.sql`-Dateien jetzt explizit nach dem `tsc`-Lauf mit nach `dist/db/migrations/` (`tsc && mkdir -p dist/db/migrations && cp src/db/migrations/*.sql dist/db/migrations/`) — analog zum bereits bestehenden manuellen Frontend-Kopierschritt in `docs/Installationsanleitung.md` Abschnitt 6, hier aber automatisch als Teil von `npm run build`, kein zusätzlicher manueller Schritt in der Anleitung nötig. | 2026-08-24 |
| ~~D-030~~ | ~~mittel~~ | ~~Frontend / UI~~ | ~~Alle drei „Kopieren"-Buttons im Admin-UI (Kassensystem-Seriennummer, TSE-Status-Rohdaten, QR-Login-Link) benutzten `navigator.clipboard` direkt. Die Clipboard-API existiert nur in Secure Contexts (HTTPS oder `http://localhost`) — genau das reale Deployment-Modell dieses Projekts (natives Ubuntu, `http://<LAN-IP>:3000`, keine TLS-Terminierung) ist **kein** Secure Context, `navigator.clipboard` ist dort `undefined`. Zwei der drei Stellen scheiterten dadurch lautlos (`?.`-Chaining schluckt es), eine dritte hätte einen JS-Fehler geworfen (kein Chaining). Gefunden live bei der ersten Produktionsinstallation, als der Kopieren-Button bei den TSE-Rohdaten und bei der Kassensystem-Seriennummer nicht reagierte.~~ | **Erledigt 2026-08-24:** Neue gemeinsame Hilfsfunktion `copyToClipboard()` (`packages/frontend/src/lib/clipboard.ts`, mit Unit-Tests) — versucht zuerst `navigator.clipboard.writeText`, fällt sonst auf das klassische `document.execCommand('copy')`-Textarea-Muster zurück (funktioniert auch außerhalb von Secure Contexts). Alle drei Call-Sites (`settings/system/+page.svelte`: `copySerial`, `copyTseResult`; `users/+page.svelte`: `copyToken`) darauf umgestellt. `jsdom` als Dev-Dependency ergänzt, damit der DOM-Test tatsächlich laufen kann (vorher nur als optionale Vitest-Peer-Dependency vorhanden, nie installiert). | 2026-08-24 |
