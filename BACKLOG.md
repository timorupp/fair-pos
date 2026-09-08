# Backlog

Offene Tasks (Nutzerwünsche/geplante Arbeit) und Findings (gefundene Risiken, fragwürdige Designs, Refactoring-Bedarf) in einer gemeinsamen Liste — Typ per `[Task]`/`[Finding]`-Tag. IDs unverändert aus der vorherigen Trennung übernommen (`#N` für Tasks, `D-N`/`T-N`/`DOC-N` für Findings) — bestehende Code-/Commit-Verweise bleiben gültig. Erledigte Einträge wandern nach `BACKLOG-DONE.md`.

---

## Tasks

- [Task] **#33** KI-basierte Security-Attack-Tests gegen installierte Anwendung

- [Task] **#47** Vollen manuellen Regressionstest durchführen (inkl. DSFinV-K)
  **Umfasst auch Task #102** (2026-09-01 dorthin verschoben, Nutzereinordnung:
  "gehört für mich zum Testing"): prüfen, dass wirklich **jede**
  Bestellung/jeder Vorgang der Test-Veranstaltung korrekt an die TSE
  gemeldet und signiert wurde — nicht nur, dass irgendeine Signatur
  erscheint (siehe D-038-Fortsetzung). Bausteine dafür:
  Zähler-Plausibilität (`GET /api/admin/tse/status`, `startedTransactions`
  vor/nach einer bekannten Anzahl Testverkäufe vergleichen), DSFinV-K-Export
  (`transactions_tse.csv`, `TSE_TANR`/`TSE_TA_SIG` pro Vorgang gegen die
  tatsächlich getätigten Testbuchungen abgleichen), sowie **(Werkzeug dafür
  jetzt verfügbar, siehe Task #102)** `tseCli dumpProcessData` für den
  direkten Beträge-Abgleich gegen die TSE selbst — Details/Aufruf in
  `docs/TSE-CLI-Referenz.md` Abschnitt 2/3. Der eigentliche Abgleich selbst
  ist Teil dieses Tasks (#47) und steht noch aus, **nicht** bereits erledigt.

- [Task] **#109** Schutz gegen zu häufige TSE-Zeitsynchronisation (`worm_tse_updateTime`)
  **Priorisierung (Nutzervorgabe 2026-09-06): Pre-Release — vor dem ersten
  Release erledigen.**

  **Klassifikation: Bug (Schwere: mittel bis hoch — kein akutes Problem im
  Normalbetrieb, aber ein von der SDK-Doku ausdrücklich als schädlich
  beschriebenes Szenario ohne jede Absicherung im Code).** Gefunden
  2026-09-02 bei einer Nutzerfrage zu `dumpProcessData`-Testdaten — siehe
  D-055 für die vollständige Analyse.

  **Kurzfassung:** `tse/healthJob.ts`s minütlicher `tick()` ruft bei jedem
  "TSE ungesund"-Snapshot erneut `maintainTse()` auf (Selbsttest +
  `worm_tse_updateTime`) — ohne Backoff/Cooldown über das
  60-Sekunden-Ticksintervall hinaus. Der SDK-Header (`WormDLL.h`, Abschnitt
  "Common Issues" → "Update Time Frequency") warnt ausdrücklich: nicht
  signifikant öfter aufrufen als `worm_info_maxTimeSynchronizationDelay"
  vorsieht; die TSE ist für maximal **150.000** `updateTime`-Aufrufe
  über ihre gesamte Lebensdauer spezifiziert — "if the time gets
  synchronized more often than that, the TSE might get damaged." Bei
  einem dauerhaft "ungesund" gemeldeten Zustand (Bug, Wackelkontakt,
  Fehlkonfiguration) würde das Limit bei einem Aufruf pro Minute in ca.
  104 Tagen aufgebraucht.

  **Ergänzung 2026-09-06 (Nutzerhinweis) — zweites, dringlicheres Risiko in
  derselben Schleife:** `maintainTse()` authentifiziert sich mit der
  `tse_time_admin_pin`-Einstellung. Laut SDK-Header haben PINs einen
  Retry-Zähler von 3 — bei drei Fehlversuchen wird die PIN blockiert und
  ist nur noch über die PUK entsperrbar. Ist die hinterlegte PIN falsch
  (z. B. Tippfehler bei der Ersteinrichtung), würde derselbe minütliche
  Retry-Loop die PIN bereits nach spätestens 3 Minuten dauerhaft
  blockieren — nicht erst nach 104 Tagen wie beim `updateTime`-Limit.
  Jede Lösung für diesen Task muss beide Fälle gemeinsam abdecken, siehe
  D-055 für die vollständige Analyse inkl. SDK-Zitat.

  **Ausdrücklich noch offen — Entscheidung über die beste Lösung steht
  noch aus, hier bewusst nicht vorweggenommen.** Denkbare Ansätze (nicht
  abschließend, nicht bewertet):
  - Exponentielles Backoff zwischen aufeinanderfolgenden
    `maintainTse()`-Versuchen statt fixem 60s-Takt.
  - Fester Mindestabstand zwischen zwei `updateTime`-Aufrufen (z. B.
    orientiert an `worm_info_maxTimeSynchronizationDelay`), unabhängig vom
    Health-Job-Takt.
  - Tageslimit/Gesamtzähler für automatische Maintain-Versuche, danach nur
    noch manuelles Eingreifen (Admin-Alarm statt Dauerschleife).
  - Kombination aus den obigen.

  Vor der Umsetzung: Nutzerentscheidung, welcher Ansatz (oder welche
  Kombination) gewünscht ist.

- [Task] **#112** Firmendaten/Logo auf Rechnungs-PDF und Reprint werden live geladen statt zum Verkaufszeitpunkt eingefroren
  **Priorisierung (Nutzervorgabe 2026-09-06): Pre-Release — vor dem ersten
  Release erledigen.**

  **Klassifikation: Bug (niedrig-mittel).** Nutzerauftrag 2026-09-02,
  Fund per Code-Recherche bestätigt — siehe D-058. Von
  zwei parallelen Audits zum Thema GoBD-Unveränderbarkeit; siehe auch
  Task #111 für den ersten Fund.

  **Kurzfassung:** `receipt/data.ts`s `loadReceiptWhere()` (genutzt von
  sowohl `GET /:id/pdf` als auch `POST /:id/reprint` in `admin/
  invoices.ts`) lädt Firmenname/-adresse/-steuernummer/USt-IdNr. sowie
  das Firmenlogo bei **jedem** Aufruf frisch aus `system_setting`/dem
  aktuellen Logo — kein Snapshot auf `invoice` oder anderswo. Ändert ein
  Admin später diese Stammdaten, zeigt eine alte Rechnung beim erneuten
  Ansehen/Reprint die **neuen** Daten statt der zum Verkaufszeitpunkt
  gültigen.

  **Wichtige Einordnung (geringere Dringlichkeit als Task #111):** die
  eigentlich TSE-/fiskalisch relevanten Felder (Beträge,
  Steueraufschlüsselung, Transaktionsnummer, Signatur, Belegnummer,
  Zeitstempel) kommen aus echten Snapshot-Spalten auf `invoice`/
  `order_item` und sind **nicht** betroffen — nur der "Briefkopf"
  (Name/Adresse/Logo) driftet. Trotzdem ein GoBD-relevanter
  Wiedergabetreue-Aspekt: ein Reprint sollte idealerweise exakt wie das
  Original aussehen.

  **Umsetzungsskizze (grob, nicht final, keine Entscheidung):** entweder
  (a) einen Firmendaten-/Logo-Snapshot beim Erstellen der Rechnung auf
  `invoice` persistieren und beim Laden bevorzugt daraus lesen, oder (b)
  den beim ursprünglichen Verkauf bereits erzeugten `print_job`-Datensatz
  (mit seinen historisch korrekten `blocks`) für Reprints wiederverwenden
  statt die Belegblöcke komplett neu zu bauen — Variante (b) deckt sich
  mit dem in Task #105 eingeführten Block-Modell (`print_job.blocks`
  existiert dafür bereits) und wäre vermutlich der kleinere Eingriff.

  **Offene Frage:** wie schwer wiegt dieser Fall fachlich wirklich —
  ändert sich der Firmenname/die Adresse in der Praxis überhaupt jemals
  bei einem laufenden Verein, oder ist das ein seltenes Ereignis, bei dem
  ein manueller Hinweis ("Reprint zeigt aktuelle Stammdaten") ausreicht
  statt eines vollen Snapshot-Umbaus? Nutzerentscheidung vor Umsetzung.

- [Task] **#119** Unterstützung für Kleinunternehmerregelung (§ 19 UStG)
  **Priorisierung (Nutzervorgabe 2026-09-06): nicht mehr für das erste
  Release, aber bald danach angehen — kein Release-Blocker, aber zeitnahe
  Folgearbeit.**

  **Klassifikation: Feature (aktuell nicht unterstützt).** Nutzerfrage
  2026-09-06: kann ein Verein, der der Kleinunternehmerregelung
  unterliegt (keine USt.-Abführung), einfach `vat_rate_standard`/
  `vat_rate_reduced` in den Einstellungen auf 0 setzen, oder braucht es
  dafür eine eigene Funktion?

  **Antwort der Analyse: reines Nullsetzen der beiden Einstellungen
  reicht nicht.**

  - Der DSFinV-K-Export ordnet den USt-Schlüssel nach `tax_category`
    (`standard`/`reduced`/`zero`) zu, nicht nach dem tatsächlichen
    Prozentsatz (`exports/dsfinvk/rows.ts::ustSchluessel()`). Bei
    genullten Sätzen würden Artikel weiterhin unter Schlüssel 1/2
    ("regelbesteuert"/"ermäßigt", nur mit 0,00 % Satz) exportiert statt
    unter Schlüssel 5 ("nicht steuerbar" — laut
    `docs/Rechtliche-Anforderungen.md` der fachlich korrekte Fall für
    Kleinunternehmer). Für einen echten Kleinunternehmer-Betrieb müssten
    alle Artikelgruppen tatsächlich auf `tax_category = 'zero'`
    umkategorisiert werden — das ist eine Datenumstellung, keine reine
    Einstellungsänderung.
  - Es gibt aktuell keinen Pflicht-/Hinweistext auf dem Beleg für diesen
    Fall (üblich: "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.").
    FairPOS druckt unabhängig vom Satz immer die MwSt-Aufschlüsselungs-
    zeilen.
  - TSE-Signierung ist unabhängig vom Steuersatz und bereits unkritisch
    (läuft immer, keine Änderung nötig).

  **Ausdrücklich kein Bug, sondern Nutzervorgabe (2026-09-06):** bei der
  Analyse fiel auf, dass `receipt/format.ts::computeTaxBreakdown()` die
  gedruckte Aufschlüsselung nach dem **Zahlenwert** des Steuersatzes
  bündelt, nicht nach `tax_category` (anders als `closing/totals.ts` und
  die TSE-`processData`, die nach Kategorie bündeln) — bei zwei
  Kategorien mit zufällig identischem Satz würden sie auf dem Bon in
  eine Zeile mit einem Kennbuchstaben zusammenfallen, obwohl TSE/
  DSFinV-K sie intern weiterhin getrennt (unterschiedlicher USt-
  Schlüssel) führen. **Nutzerentscheidung dazu: das ist so gewollt** —
  identische Sätze brauchen auf dem Bon keine unterschiedlichen
  Kennbuchstaben. Diese Stelle also nicht "reparieren".

  **Ergänzung 2026-09-06 (Nutzerhinweis) — manuelle Umkategorisierung
  allein greift nicht, wegen Pfand:** Pfand wird an vier unabhängigen
  Stellen fest auf die Kategorie `'standard'` verdrahtet, unabhängig vom
  `tax_category` des zugehörigen Artikels (Task #113/D-060, jeweils ein
  Literal im Code, keine Einstellung/Daten): `closing/totals.ts:82`
  (`total_tax_standard += depositGross` unbedingt), `receipt/format.ts:113`
  (`computeTaxBreakdown` bucketet Pfand fest auf `'standard'`),
  `receipt/blocks.ts:79` (`taxCategoryLetter('standard')` für die
  gedruckte Pfand-Zeile) und `exports/dsfinvk/rows.ts:278`
  (`ustSchluessel('standard')` für die DSFinV-K-Pfandzeile). Ein Admin
  könnte also jede Artikelgruppe auf `tax_category = 'zero'`
  umkategorisieren — der Pfandanteil jeder Position bliebe trotzdem
  überall als USt-Schlüssel 1 (Regelsteuersatz) verbucht, da dieser Wert
  nirgends aus den Artikeldaten gelesen wird. Für Vereine mit
  Pfandartikeln (Becher, Flaschen — der Normalfall bei Festen) ist die
  reine Umkategorisierung damit **nicht nur mühsam, sondern unvollständig
  und erreicht nie echte Nullsteuer**.

  **Ausdrücklich noch offen — Lösungsansatz nicht vorweggenommen:**
  - Manuelle Umkategorisierung aller Artikelgruppen auf `tax_category =
    'zero'` — reicht wegen des oben beschriebenen Pfand-Problems allein
    nicht aus; bräuchte zusätzlich eine Code-Änderung, die die vier
    Pfand-`'standard'`-Stellen an einen System-Zustand koppelt.
  - Ein dedizierter System-Schalter ("Kleinunternehmer nach § 19 UStG"),
    der beim Aktivieren automatisch DSFinV-K-Schlüssel 5 erzwingt (auch
    für Pfand), den Beleghinweistext ergänzt und die vier Pfand-Stellen
    mit umschaltet — deckt beide Fälle (Artikel und Pfand) aus einer
    Hand ab, ohne jede Artikelgruppe einzeln anfassen zu müssen.
  - Kombination/anderer Ansatz.

  Vor der Umsetzung: Nutzerentscheidung, welcher Ansatz gewünscht ist.

- [Task] **#120** TSE-Zertifikatskette für `tse.csv` (`TSE_ZERTIFIKAT_I/II`)
  **Klassifikation: Feature/Doku-Lücke (klein, nicht blockierend).**
  Bisher nur in `docs/Rechtliche-Anforderungen.md` Abschnitt 6.7 und
  `docs/TSE-Integration.md` Abschnitt 11 dokumentiert, ohne eigenen Task —
  hier nachgezogen (2026-09-06).

  **Problem:** `tse.csv`s Felder `TSE_ZERTIFIKAT_I`/`TSE_ZERTIFIKAT_II`
  bleiben im DSFinV-K-Export leer. `native/tse-cli` liest die volle
  Zertifikatskette (`worm_getLogMessageCertificate`) noch nicht aus — dafür
  wird laut SDK die CTSS-Schnittstelle benötigt, die der CLI-Wrapper bisher
  nicht anspricht. `TSE_SIG_ALGO`/`TSE_ZEITFORMAT`/`TSE_PUBLIC_KEY` sind
  bereits befüllt (Task #46) — genau die drei für die QR-Code-Prüfung
  relevanten Felder; die Zertifikatskette betrifft nur `tse.csv`s
  Vollständigkeit, nicht die Prüfbarkeit der einzelnen Belege.

  Noch nicht bewertet: Aufwand für die CTSS-Anbindung in `native/tse-cli`,
  Priorisierung.

- [Task] **#121** TSE-Rohdaten-Backup-/Archivierungsstrategie
  **Klassifikation: Feature/Konzept-Lücke.** Bisher nur in
  `docs/TSE-Integration.md` Abschnitt 11 als offener Punkt genannt, kein
  eigener Task — hier nachgezogen (2026-09-06).

  **Problem:** Der TAR-Export der TSE-Rohdaten (`worm_export_tar`,
  TR-03153-konform) ist seit Task #103 über die Admin-UI herunterladbar —
  was danach mit der Datei passieren soll (regelmäßig ziehen? wo dauerhaft
  ablegen? gemeinsam mit dem Datenbank-Backup aus Task #25, oder getrennt?)
  ist weiterhin nicht festgelegt. Bewusst nicht Teil von Task #25 (reines
  `pg_dump`-Datenbank-Backup) oder #103 (nur der Download-Mechanismus
  selbst).

  Noch nicht bewertet: gehört das in `docs/Organisatorische-Anleitung.md`
  als Betriebsroutine, oder braucht es zusätzliche Automatisierung
  (z. B. automatischer periodischer Export)?

- [Task] **#122** DSFinV-K CSV-/index.xml-Format gegen GoBD-Anlage verifizieren
  **Klassifikation: Compliance-Verifikation (noch nicht durchgeführt).**
  Bisher nur in `docs/Rechtliche-Anforderungen.md` Abschnitt 6.7 als offener
  Punkt genannt, kein eigener Task — hier nachgezogen (2026-09-06).

  **Problem:** Das aktuelle CSV-/`index.xml`-Dateiformat (Feldtrennzeichen,
  Kopfzeile, Zeichensatz) folgt der verbreiteten Konvention (Semikolon,
  UTF-8, CRLF, GDPdU-artige `index.xml`), wurde aber nie gegen die separate
  GoBD-Anlage "Ergänzende Informationen zur Datenträgerüberlassung"
  verifiziert — nur gegen die DSFinV-K-Kernspezifikation v2.4 selbst.

  Noch nicht bewertet: Beschaffung der GoBD-Anlage, Abgleich, ggf.
  Anpassungsbedarf.

- [Task] **#123** `service_order`/`order_cancellation` ohne `daily_closing_id` — Zuordnung nur angenähert
  **Klassifikation: Bewusste Vereinfachung, bisher nicht als Task erfasst.**
  Bisher nur in `docs/Rechtliche-Anforderungen.md` Abschnitt 6.7 als
  "bewusste Vereinfachung (dokumentiert, nicht gelöst)" beschrieben — hier
  nachgezogen (2026-09-06).

  **Problem:** Anders als `invoice` haben `service_order`/
  `order_cancellation` keine `daily_closing_id`-Referenz und werden im
  DSFinV-K-Export daher über Kasse + Kalendertag (`business_date`)
  angenähert, nicht über eine exakte Zuordnung zum tatsächlichen
  Kassenabschluss (`exports/dsfinvk/load.ts`). Bei mehreren Abschlüssen
  derselben Kasse am selben Tag kann das zu einer falschen Zuordnung
  führen.

  Noch nicht bewertet: wie oft mehrere Abschlüsse pro Kasse und Tag
  praktisch vorkommen, ob eine echte `daily_closing_id`-Spalte (Migration)
  nötig ist oder die Näherung für den praktischen Betrieb ausreicht.

- [Task] **#124** `docs/Datenmodell.dbml` gegen das echte Schema abgleichen
  **Klassifikation: Doku-Bereinigung.** Bei Task #91 (2026-08-29) aufgefallen
  — nur die für diese Änderung direkt relevanten Felder (`label`, `hidden`
  auf `register_layout_slot`) wurden nachgezogen, eine größere Bereinigung
  bewusst als eigene Aufgabe offen gelassen — hier angelegt (2026-09-06).

  **Bekannte Drift (mindestens):** `register_layout.register_id`/
  `is_default` existieren laut Task #91 im echten Schema gar nicht mehr.
  Vermutlich weitere Abweichungen, da `docs/Datenmodell.dbml` nicht bei
  jeder Migration systematisch mitgepflegt wird.

  Noch nicht bewertet: vollständiger Abgleich aller Tabellen gegen die
  aktuellen Migrationen, danach `docs/Datenmodell.dbml` korrigieren.

## Findings

- [Finding] **D-021** (niedrig, Reports) — Gefunden 2026-06-24 — Kontext: Während Auswertungen-Implementierung gefunden
  **Priorisierung (Nutzervorgabe 2026-09-06): Pre-Release.** „Erstellte Rechnungen" listet `payment_method='card'` mit auf, obwohl die App aktuell nur `cash` produziert. Spalte sinnvoll, aber für Auswertungs-Excel später konsistent halten.
  Beim Excel-Export (#10) sicherstellen, dass die Spalte mit anderen Reports übereinstimmt.

- [Finding] **D-026** (niedrig, Excel-Export) — Gefunden 2026-06-24 — Kontext: Während Excel-Export-Implementierung gefunden
  **Priorisierung (Nutzervorgabe 2026-09-06): Pre-Release.** Storno-Rechnungen (`receipt_type='cancellation'`) sind im Export **nicht** enthalten. **Prämisse überholt (2026-09-02, beim Doku-Audit vor dem QA-Lauf gefunden):** Task #8 (Bonstorno) ist seit längerem umgesetzt und produktiv im Einsatz, die ursprüngliche "solange nicht existiert, irrelevant"-Einschätzung stimmt nicht mehr. Aktueller Code-Stand (`routes/admin/exports.ts:81-84`, Docstring): der Ausschluss ist **bewusst dokumentiert** ("cancellation/training invoices are not part of the standard sales export") — Stornos landen stattdessen im Rechnungs-ZIP-Export und im DSFinV-K-Export, nicht im Excel-Umsatz-Export. Kein Bug, aber die im Vorschlag genannte explizite Entscheidung (separate Spalte/eigenes Sheet) wurde nie wirklich getroffen, nur implizit durch Weglassen.
  Weiterhin offen, aber nicht blockierend: falls gewünscht, explizit im Export selbst dokumentieren/sichtbar machen (z.B. Fußnote im Excel), dass Stornos absichtlich fehlen — sonst könnte ein Auswertender die Summe für vollständig halten.

- [Finding] **D-033** (mittel, Backend / Excel-Export) — Gefunden 2026-08-25 — Kontext: Während npm-Dependency-Cleanup (Task #68) gefunden
  `exceljs` (Produktions-Abhängigkeit für Task #10/#32) bündelt intern `uuid@^8.3.0` — betroffen von GHSA-w5hq-g745-h8pq (fehlende Buffer-Bounds-Prüfung in `uuid` v3/v5/v6 bei übergebenem `buf`-Parameter). Verifiziert: `npm view exceljs dist-tags` → `latest: 4.4.0`, identisch mit der installierten Version — es gibt aktuell **keine** neuere `exceljs`-Version, die ein aktuelleres `uuid` zieht. `npm audit fix --force` schlägt widersinnig ein *Downgrade* auf `exceljs@3.4.0` vor (npms generischer Lösungsversuch, kein echter Fix). Praktische Ausnutzbarkeit gering: eigener Code ruft `uuid` nie direkt auf, nur `exceljs` intern. Dieselbe exceljs-interne Abhängigkeitskette ist auch Ursache der `npm ci`-Deprecation-Warnungen `inflight`, `rimraf@2`, `lodash.isequal`, `glob@7` (über `archiver`/`fast-csv`/`unzipper`) — nicht eigenständig behebbar.
  Kein Handlungsbedarf jetzt. exceljs-Upstream beobachten (öffentlich bekanntes Problem, kein eigenes Issue nötig); sobald exceljs `uuid` intern anhebt, zieht ein normales `npm update` den Fix automatisch.

- [Finding] **D-034** (niedrig, Frontend / Build-Tooling) — Gefunden 2026-08-25 — Kontext: Während npm-Dependency-Cleanup (Task #68) gefunden
  `@sveltejs/kit` (und darüber `@sveltejs/adapter-static`) hängt an `cookie@^0.6.0` — betroffen von GHSA-pxg6-pf52-xh8x (Cookie-Name/Path/Domain mit Out-of-Bounds-Zeichen). Verifiziert: selbst `@sveltejs/kit@latest` (2.70.3, aktueller Stable) verlangt weiterhin `cookie: ^0.6.0`; ein Fix existiert nur in `@sveltejs/kit@3.0.0-next` (Prerelease, nicht produktionsreif). Betrifft nur SvelteKits eigenen Dev-/Build-Server — der ausgelieferte Build läuft im SPA-Modus (`adapter-static`, siehe `CLAUDE.md`), Produktions-Cookie-Handling läuft ohnehin komplett über `@fastify/cookie` im Backend (dort bereits `cookie@1.1.1`, sauber).
  Kein Handlungsbedarf jetzt. SvelteKit-3.0-Release beobachten — hängt ohnehin an der größeren Svelte-5-Migrationsfrage (Task #71).

- [Finding] **D-052** (niedrig, Backend / Tests) — Gefunden 2026-08-31 — Kontext: Während Task #94/#95-Umsetzung (Zwei-Stufen-Admin, Veranstaltung als Hierarchieebene) gefunden
  `settings.receipt-preview.integration.test.ts` — Test `renders identically whether no logo is stored at all, or one is stored but the flag stays off (default)` ist zeitabhängig-flaky, reproduzierbar aber mit jeweils unterschiedlicher Byte-Differenz (einmal 6329 vs. 6328, dann 6327 vs. 6326). Ursache: `receipt/demo.ts`s `buildDemoReceipt(now: Date = new Date())` nutzt beim Aufruf ohne explizites Argument den echten aktuellen Zeitpunkt; die Route ruft sie ohne Override auf, und der Test macht zwei sequentielle `fetchPreview()`-HTTP-Aufrufe, die dadurch minimal unterschiedliche Zeitstempel einbetten — vermutlich wirkt sich das über schriftgrößen-/kerning-abhängige Fließkomma-Koordinaten im PDF-Content-Stream auf die Byte-Länge aus. Kein Zusammenhang mit Task #94/#95 — nur während der Vollständigkeits-Testläufe für Phase 2.3 aufgefallen (Test lief davor offenbar nie zufällig zu einem ungünstigen Zeitpunkt).
  Der Test sollte einen festen `now`-Zeitpunkt injizieren (z. B. Route-Parameter oder Test-Override) statt sich auf `new Date()` zu verlassen — noch nicht umgesetzt, da unabhängig vom aktuellen Task.

- [Finding] **D-054** (hoch, Backend / Tagesabschluss (Z-Bon)) — Gefunden 2026-09-02 — Kontext: Live beim Testen der Admin-UI gefunden (2026-09-02)
  Nutzer berichtet: „Alle Kassen abschließen" meldete 2 erstellte Z-Bons (2 Nullabschlüsse), aber nur eine Kasse hatte laut UI überhaupt einen offenen Tag — und genau diese Kasse zeigte danach weiterhin einen offenen Tag, der Z-Bon musste manuell nachgeholt werden. Ursache: `closeRegister()` stempelte den `daily_closing`-Eintrag immer mit `business_date = current_date` statt dem tatsächlichen Rechnungsdatum.
  **Erledigt 2026-09-03:** neue Funktion `closeAllPendingDays()` ermittelte vor dem Abschließen die tatsächlich vorkommenden Kalendertage unter den unzugeordneten Rechnungen und schloss chronologisch aufsteigend einmal pro Tag. Siehe Task #106.

  **Nachgebessert 2026-09-06 (Live-Test mit 3 Kassen und echten Lücken-Tagen deckte weitere Bugs auf):**
  - **Kernursache:** `closeAllPendingDays()` ermittelte die zu schließenden Tage über `DISTINCT created_at::date` auf unzugeordneten Rechnungen — ein Kalendertag ganz ohne Buchung ("Lücke") tauchte darin nie auf und konnte dadurch **nie** geschlossen werden, obwohl die "ausstehend"-Erkennung (`findPendingDaysForRegister()`) für genau diesen Tag weiterhin einen Abschluss verlangte. Die betroffene Kasse blieb dadurch dauerhaft "1 Tag ausstehend", egal wie oft abgeschlossen wurde.
  - **Zweiter Fund:** wiederholtes Klicken auf einer bereits vollständig abgeschlossenen, untätigen Kasse erzeugte bei jedem Klick einen weiteren Nullabschluss für denselben Geschäftstag (keine Prüfung, ob heute schon abgeschlossen war).
  - **Fix:** `closeAllPendingDays()` durch `closePastPendingDays()` ersetzt — nutzt jetzt exakt dieselbe Tagesliste wie `findPendingDaysForRegister()` (eine einzige Quelle der Wahrheit statt zweier potenziell abweichender Definitionen), wodurch Lücken-Tage automatisch einen Nullabschluss bekommen. Ergänzt um `closeTodayUnlessAlreadyClosed()` — schließt den heutigen Tag nur, wenn tatsächlich unzugeordnete Rechnungen vorliegen oder heute noch gar nicht abgeschlossen wurde.
  - **"Alle Kassen abschließen" (systemweiter Button + `POST /closings/close-all`) komplett entfernt** (Nutzerentscheidung) — ein blinder Sammel-Abschluss über alle Kassen wurde als zu riskant eingestuft; jede Kasse wird jetzt einzeln aus ihrer Detailseite abgeschlossen (`docs/Anforderungen.md` entsprechend nachgezogen).
  - **Fehlender UI-Refresh behoben:** neuer Store `lib/stores/pendingClosings.ts` — beide Kassen-Detail-Aktionen ("Tagesabschluss jetzt durchführen", "ausstehende Tage nachholen") aktualisieren jetzt das globale Banner sofort, nicht erst nach manuellem Neuladen oder Routenwechsel.
  - **"Null"-Markierung** in der Abschluss-Tabelle durch echte Spalte "Nullabschluss" (mit "X" bei Nullabschlüssen) ersetzt, statt eines unklaren Textes hinter den Buttons.
  - Drei neue Integrationstests (Lücken-Tag-Nullabschluss + danach entsperrt, kein doppelter Nullabschluss bei wiederholtem Klick) laufen grün gegen eine echte Postgres-Instanz; bestehende Tests mit fest codiertem historischem Datum (`2026-06-24`) auf relative Daten umgestellt, da die Korrektur das Verhalten bei großem Abstand zu "heute" grundlegend ändert.

  **Noch ausstehend: echter Live-Test.** Der Nutzer hat aktuell keine Kasse mit einem offenen/Lücken-Tag mehr (muss ~2 Tage abwarten, bis sich die Situation im echten Betrieb erneut ergibt) — bis dahin bleibt dieser Eintrag offen, auch wenn Code-Fix + automatisierte Tests bereits stehen.

- [Finding] **D-055** (mittel, Backend / TSE-Health-Job) — Gefunden 2026-09-02 — Kontext: Bei Nutzerfragen zur TSE-Nutzung/Steuersätzen gefunden (2026-09-02)
  Nutzerfrage zu `dumpProcessData`-Testdaten führte zur Prüfung, ob die minütliche TSE-Gesundheitsprüfung (`tse/healthJob.ts`) der TSE schaden könnte. Die routinemäßige Minutenabfrage selbst ist unkritisch (`getTseInfo()`, reiner Lesebefehl, erzeugt keinen Log-Eintrag). Aber: `tick()`s "TSE ungesund"-Zweig ruft bei jedem Fehlschlag erneut `maintainTse()` auf (Selbsttest + `worm_tse_updateTime`) — **ohne jeglichen Backoff/Cooldown** über das 60-Sekunden-Ticksintervall hinaus. Der SDK-Header warnt explizit (Abschnitt „Common Issues" → „Update Time Frequency"): `worm_tse_updateTime` "should NOT be called significantly more often than announced in `worm_info_maxTimeSynchronizationDelay`" (typischerweise im Bereich von Stunden/einem Tag) — "the guaranteed number of supported update time commands is 150000... If the time gets synchronized more often than that, the TSE might get damaged." Würde eine TSE aus irgendeinem Grund dauerhaft als "ungesund" gemeldet (Bug, Wackelkontakt, Fehlkonfiguration, die `maintainTse()` scheinbar erfolgreich durchläuft, `hasValidTime` danach aber weiterhin `false` liefert), würde jede Minute ein neuer `updateTime`-Aufruf ausgelöst — bei diesem Takt wäre das 150.000er-Lebensdauer-Limit in ca. 104 Tagen aufgebraucht. Aktuell rein hypothetisch (im Normalbetrieb ist "ungesund" selten/kurz), aber genau die Art Dauerschleife, vor der die SDK-Doku ausdrücklich warnt. **Ergänzung 2026-09-06:** Dieselbe ungebremste Schleife hat noch ein zweites, deutlich akuteres Risiko — `maintainTse()` authentifiziert sich dabei mit dem `tse_time_admin_pin`-Setting. Laut SDK-Header (`WormDLL.h` Zeile 2273f.): "PINs have a retry counter of 3. If a wrong PIN has been entered 3 times, the PIN will be blocked and must be unblocked with the PUK." Ist die hinterlegte TimeAdmin-PIN aus irgendeinem Grund falsch (Tippfehler bei der Ersteinrichtung, versehentlich geändert), würde der minütliche Retry-Loop die PIN nach spätestens 3 Minuten (statt erst nach 104 Tagen wie beim Update-Time-Limit) dauerhaft blockieren — Entsperrung nur über die separat aufbewahrte PUK möglich. Deutlich dringlicher als das Lebensdauer-Limit, da es in Minuten statt Monaten eintritt.
  Siehe Task #109 — Lösungsansatz (Backoff/Cooldown-Strategie) noch nicht entschieden, mehrere Optionen möglich; muss jetzt auch das PIN-Blockierungsrisiko abdecken, nicht nur das `updateTime`-Lebensdauerlimit.

- [Finding] **D-058** (niedrig-mittel, Backend / Rechnungs-PDF) — Gefunden 2026-09-02 — Kontext: Bei Prüfung der GoBD-Unveränderbarkeit gefunden (2026-09-02)
  Firmendaten (Name/Adresse/Steuernummer/USt-IdNr.) und das Firmenlogo werden bei **jedem** PDF-Abruf/Reprint einer Rechnung live aus `system_setting`/dem aktuell gespeicherten Logo geladen (`receipt/data.ts`s `loadReceiptWhere()`/`loadCompanySettings()`/`loadLogoFor()`), nicht zum Verkaufszeitpunkt eingefroren — weder `invoice` noch eine andere Tabelle speichert einen Snapshot. Sowohl `GET /:id/pdf` als auch `POST /:id/reprint` (`admin/invoices.ts`) rendern die Belegblöcke bei jedem Aufruf neu aus aktuellen Stammdaten, statt den ursprünglich beim Verkauf erzeugten `print_job`-Datensatz wiederzuverwenden. Folge: ändert ein Admin später Firmenname/Adresse/Logo, zeigt die PDF-Ansicht/ein Reprint einer alten Rechnung die **neuen** Daten statt der zum Verkaufszeitpunkt gültigen — die eigentlich TSE-relevanten Felder (Beträge, Steueraufschlüsselung, Transaktionsnummer, Signatur, Belegnummer) bleiben davon unberührt, da sie aus echten Snapshot-Spalten auf `invoice`/`order_item` kommen; betroffen ist nur der "Briefkopf".
  Siehe Task #112.
