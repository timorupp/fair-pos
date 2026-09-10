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

  **Weitgehend umgesetzt 2026-09-06 — Analyse und Auslesen fertig, ein
  Rest bewusst offengelassen:**
  - **Aufwandsanalyse (`WormDLL.h` geprüft):** `worm_getLogMessageCertificate`
    verlangt laut Doku-Kommentar nur eine aktive CTSS-Schnittstelle, **keinen**
    Nutzerlogin (anders als z. B. `worm_export_deleteStoredData`, das
    ausdrücklich "the user Admin to be logged in" verlangt — dieser Satz
    fehlt bei der Zertifikatsfunktion). Auf TSE-Firmware ≥2.0.0 ist die
    CTSS-Schnittstelle laut `worm_info_isCtssInterfaceActive`-Doku ohnehin
    automatisch aktiv, sobald der Self-Test bestanden wurde — kein
    `worm_tse_ctss_enable`-Aufruf nötig (der wäre auf ≥2.0.0 ohnehin ein
    No-Op). Zusätzlich bestätigt der bereits produktiv genutzte
    `exportTar`-Befehl (`worm_export_tar`, identische
    "nur CTSS aktiv"-Doku-Formulierung), dass diese Funktionsklasse im
    bestehenden Code tatsächlich ohne Login funktioniert. Die CTSS-Anbindung
    war damit **kein zusätzlicher Aufwand** — nur ein weiterer Auslese-Aufruf
    im bereits bestehenden `info`-Kommando.
  - **Umgesetzt:** `native/tse-cli/src/tseCli.cpp`s `cmdInfo()` ruft jetzt
    zusätzlich `worm_getLogMessageCertificate` auf (Base64-kodiert im neuen
    JSON-Feld `certificateChain`; leer statt Fehlschlag, falls die TSE sie
    gerade nicht liefern kann). Durchgereicht über `tse/types.ts`s `TseInfo`
    und `tse/certificateInfo.ts`s `TseCertificateInfo` (neues Feld
    `certificateChainBase64`, prozessweit gecacht wie die anderen drei
    Felder). 4 neue Unit-Tests (`certificateInfo.test.ts`).
  - **Compile+Link gegen die echte vendorte SDK erfolgreich verifiziert**
    (`build.sh` lief fehlerfrei mit `-Wall -Wextra`, der gebaute Binary lädt
    `libWormAPI.so` korrekt und meldet bei ungültigem Mount-Pfad den
    erwarteten `worm_init failed`-Fehler) — aber **kein Live-Hardware-Test**:
    ob `worm_getLogMessageCertificate` an einer echten, physisch
    angeschlossenen TSE tatsächlich ohne Login gelingt, ist bisher nur
    durch die SDK-Dokumentation belegt, nicht durch einen echten Aufruf.
  - **Verdrahtet 2026-09-08:** Der offene Punkt (wie die eine PEM-Kette auf
    `TSE_ZERTIFIKAT_I`/`TSE_ZERTIFIKAT_II` aufzuteilen ist) ist jetzt anhand
    des verbindlichen Spezifikationstexts geklärt — Anhang E (S. 78f.) des
    offiziellen DSFinV-K-2.4-Downloadpakets (bzst.de, Bundeszentralamt für
    Steuern): beide Felder enthalten **"das Zertifikat der TSE"** (Singular
    — nur das TSE-eigene Leaf-Zertifikat, nicht die volle Kette samt
    Ausstellern), Base64-kodiert, aufgeteilt in zwei 1.000-Zeichen-Blöcke
    (`TSE_ZERTIFIKAT_I` = erste 1.000 Zeichen, `TSE_ZERTIFIKAT_II` = Rest).
    Neues Modul `exports/dsfinvk/leafCertificate.ts`
    (`extractLeafCertificateChunks`) extrahiert das erste PEM-Zertifikat aus
    der Kette und splittet es entsprechend; `rows.ts` verdrahtet das jetzt in
    `tse.csv`. 5 neue Unit-Tests (`leafCertificate.test.ts`) plus ein
    Rows-Test mit einer >1000 Zeichen langen synthetischen PEM-Kette.

  **Noch ausstehend: echter Live-Test der Zertifikats-Spalten selbst.** Ein
  vom Nutzer bereitgestellter echter DSFinV-K-Export von echter Hardware
  (`dsfinvk_Bonkasse_z17.zip`, 2026-09-08) bestätigt, dass das `info`-Kommando
  insgesamt fehlerfrei gegen die echte TSE läuft (`TSE_SIG_ALGO`/
  `TSE_ZEITFORMAT`/`TSE_PUBLIC_KEY` sind mit echten Werten gefüllt) — das
  deckt aber nicht ab, ob `worm_getLogMessageCertificate` speziell auf dieser
  Hardware auch tatsächlich ein Zertifikat liefert, da dieser Export vor der
  heutigen Verdrahtung erzeugt wurde und `TSE_ZERTIFIKAT_I/II` deshalb noch
  leer sind. Bleibt offen, bis ein **neuer** Export nach diesem Fix zeigt,
  dass beide Spalten mit echten Zertifikatsdaten gefüllt sind.

- [Task] **#126** Excel-Export-Verhalten bei Stornos testen
  **Klassifikation: Test-Aufgabe (Verifikation bestehenden Verhaltens).**
  Angelegt 2026-09-09 (Nutzerwunsch).

  Zu testen, was der Excel-Export (`routes/admin/exports.ts`, Task #10/#32)
  jeweils tut bei:
  - Storno einer ganzen Rechnung
  - Erstellen einer Bonstornorechnung
  - Storno durch Bedienung bei der Rechnungstellung, für beide Typen
    (`Storno` und `kostenfrei`, `order_cancellation.cancellation_reason_id`/
    `booking_type`)

  Bekannter Ausgangspunkt: D-026 (bereits geklärt, "nichts zu tun") betrifft
  nur den Ausschluss stornierter Rechnungen aus dem Umsatzexport
  (`receipt_type='cancellation'`/`status NOT IN ('paid','free')`) — die
  Bedienungskasse-Fälle über `order_cancellation` wurden dabei noch nicht
  explizit durchgetestet. Noch nicht bewertet: ob sich dort dasselbe
  korrekte Netto-Umsatz-Verhalten zeigt oder eine Abweichung auftritt.

- [Task] **#127** Tests für nachträgliche Datenänderungen (Artikelname, Artikelpreis, USt-Satz etc.)
  **Klassifikation: Test-Aufgabe / ggf. Datenintegritäts-Prüfung.**
  Angelegt 2026-09-09 (Nutzerwunsch).

  Zu klären: was passiert mit bereits verkauften/historischen Belegen
  (Rechnungen, Z-Bons, Exporte), wenn Stammdaten (Artikelname, -preis,
  USt-Satz) nachträglich geändert werden — bleiben vergangene Belege
  unverändert (Snapshot auf `order_item` zum Verkaufszeitpunkt), oder
  zeigen rückwirkend angezeigte/exportierte Werte die **neuen** Stammdaten?
  Ähnliche Problemklasse wie Task #112 (Firmendaten/Logo werden live statt
  eingefroren geladen) — hier aber für Artikeldaten/Steuersätze, noch nicht
  systematisch getestet.

  Noch nicht bewertet: welche Felder tatsächlich als Snapshot auf
  `order_item`/`invoice` vorliegen vs. welche live aus `article`/
  `tax_rate`-Tabellen nachgeladen werden.

- [Task] **#128** Druckaufträge/Datenschutz beim Geräteverleih zwischen Vereinen
  **Klassifikation: Sicherheits-/Datenschutz-Frage (noch nicht bewertet,
  mehrere Optionen genannt, keine Entscheidung getroffen).**
  Angelegt 2026-09-09 (Nutzerwunsch).

  **Kontext:** Der Server wird laut Konzept zwischen Vereinen verliehen
  (siehe `docs/Anforderungen.md`, Begründung der AGPL-3.0-Lizenzwahl mit
  Netzwerk-Klausel). Offene Frage, wie die Daten eines Vereins vor dem
  nächsten Nutzer geschützt werden — genannte Optionen:
  - Druckaufträge (`print_job`) je Veranstaltung filtern/zuordnen? Aktuell
    hat `print_job` keine `event_id`-Spalte, nur `reference_id` mit
    uneinheitlichem Event-Bezug je nach `type`.
  - Alternativ: eine "alle löschen"-Funktion für die Druckwarteschlange?
  - Grundsätzlichere Frage: wie schützt man beim Verleih überhaupt die
    Daten des vorherigen Vereins insgesamt (nicht nur Druckaufträge) —
    Bezug zu Task #121 (Backup-Berechtigungen) und dem bestehenden
    Veranstaltungs-Datenmodell.

  Noch nicht bewertet: welche der genannten Optionen (oder Kombination)
  sinnvoll ist, ob eine `event_id`-Migration auf `print_job` nötig ist.

- [Task] **#130** Echter Trainingsmodus (DSFinV-K `AVTraining`) implementieren
  **Klassifikation: Feature, noch nicht bewertet/entschieden — Diskussionsstand,
  keine finale Design-Entscheidung.** Angelegt 2026-09-10 (Nutzerwunsch).

  **Anforderungen aus der offiziellen DSFinV-K-2.4-Spezifikation (bzst.de,
  Abschnitt 4.2.6 "Trainingsbuchungen" + Anhang B "AVTraining", recherchiert
  2026-09-10):**
  - Trainingsbuchungen sollen **nicht** an der TSE vorbeigehen — sie müssen
    weiterhin protokolliert und über die TSE abgesichert werden (historischer
    Hintergrund laut Spezifikation: "Trainingsbediener"-Modi wurden in der
    Vergangenheit missbraucht, um echte Bareinnahmen zu verschleiern).
  - Der Trainingsmodus muss **aktiv angesteuert** werden — kein
    versehentliches Hineinrutschen.
  - Alle Handlungen im Trainingsmodus müssen dokumentiert, gesondert
    gekennzeichnet und über die DSFinV-K abgebildet werden (`BON_TYP =
    AVTraining`).
  - **Keine Auswirkung auf den Kassenabschluss** — ausgeschlossen aus
    Umsatz-/Steuertotals.
  - **Keine echte Bezahlung** darf im Trainingsmodus stattfinden — die
    Erfassung von Zahlungsarten ist nur zu Trainingszwecken (simuliert)
    erlaubt. `AVTraining` ist dabei die einzige Ausnahme von der sonstigen
    Regel, dass alle `AV*`-Vorgangstypen nur die Zahlart "Keine" nutzen
    dürfen.

  **Bestehende Lücke bei FairPOS:** `invoice.receipt_type` hat bereits den
  Wert `'training'` im Schema/CHECK-Constraint vorgesehen (und
  `docs/Rechtliche-Anforderungen.md` Abschnitt 6.2 verweist korrekt auf
  `AVTraining`) — **wird aber im gesamten Code nirgends tatsächlich
  gesetzt.** Kein UI-Toggle, keine Route erzeugt je eine `training`-Buchung.
  Reine Schema-Vorbereitung ohne Implementierung.

  **Erstes Brainstorming des Nutzers (2026-09-10, zur späteren Bewertung,
  keine Entscheidung):**
  - Trainingsmodus als **Flag auf der Kasse** (`register`), nicht pro
    Vorgang/Transaktion.
  - Vorteil: nutzt die bestehende Berechtigungssteuerung (`user_register`)
    gleich mit — Anwender wählen die Trainingskasse bewusst aus, das erfüllt
    die "aktiv ansteuern"-Anforderung praktisch von selbst.
  - Als Trainingskasse markierte Register fließen nicht in einen anderen
    (echten) Kassenabschluss ein — jede Kasse hat ohnehin ihre eigene
    `daily_closing`-Sequenz.
  - Für als Training markierte Kassen müsste spezielle Logik greifen
    (z. B. andere Art der TSE-Buchung/-Kennzeichnung als bei einer echten
    Kasse).
  - **Sicherheitsmechanismus:** Das Trainings-Flag lässt sich nur umschalten,
    solange die Kasse noch **keine** Buchungen hat. Sobald irgendeine Buchung
    für eine Kasse existiert, ist der Umschalter gesperrt — verhindert sowohl
    das nachträgliche "Training-Waschen" einer echten Kasse mit
    Bestandshistorie als auch das versehentliche Umschalten einer
    Produktivkasse.

  **Offene Fragen / weitere Optionen, noch zu bewerten:**
  - **Wichtigste technische Unbekannte:** Erfordert `AVTraining` eine eigene
    TSE-seitige Kennzeichnung (z. B. eigene `processType`/Vorgangsart bei
    `worm_transaction_start`, analog zu `Kassenbeleg-V1`/`Bestellung-V1`/
    `SonstigerVorgang` in `tse/processData.ts`), oder ist "Training" eine
    reine Export-Klassifikation (normale TSE-Signatur wie bisher, nur beim
    DSFinV-K-Export als `AVTraining` statt `Beleg`/`AVBestellung`/
    `AVSonstige` ausgegeben)? Das entscheidet maßgeblich den Implementierungs-
    umfang (nur Backend-Route + Export vs. auch `native/tse-cli`-Änderungen)
    und ist bisher nicht recherchiert (AEAO zu § 146a Nr. 2.2.3.5/2.2.3.6
    wäre der nächste Ansatzpunkt, siehe `docs/Rechtliche-Anforderungen.md`
    Abschnitt 6.2 für den bisherigen Kontext zu "Art des Vorgangs"/"Daten des
    Vorgangs").
  - **Alternative: Toggle auf Session-/Login-Ebene statt fest an der Kasse.**
    Vorteil: keine dauerhaft "verbrauchte" Trainingskasse nötig, jede Kasse
    könnte ad hoc als Trainingskasse dienen. Nachteil: schwächerer Schutz vor
    versehentlichen echten Buchungen (Vergessen, den Toggle wieder
    umzustellen) als eine physisch/organisatorisch getrennte, klar
    beschriftete Trainingskasse — die Kassen-Flag-Idee des Nutzers erscheint
    hier robuster.
  - **Ergänzend denkbar: eigenes "Trainings-Event"** (nutzt das bestehende
    Event-Datenmodell zur Trennung von Artikeln/Layouts/Floor-Plan) — würde
    aber die eigentliche `AVTraining`-Kennzeichnungspflicht nicht ersetzen,
    da laut Spezifikation *jede* Übungsbuchung als solche markiert werden
    muss, unabhängig davon, ob sie auf einem separaten Event stattfindet.
    Höchstens als organisatorische Ergänzung zur Kassen-Flag-Idee sinnvoll,
    nicht als Ersatz.

  **Zusätzliche Anforderung (Nutzer, 2026-09-10):** Im Bonkasse-/
  Bedienungskasse-Frontend soll bei aktivem Trainingsmodus durchgehend ein
  Warnbanner angezeigt werden, ähnlich der bestehenden TSE-Fehler-Anzeige —
  vermeidet, dass ein Anwender vergisst, dass er gerade auf einer
  Trainingskasse arbeitet. Bestehende Vorbilder im Register-Frontend, an
  denen sich das orientieren kann: der Vollbild-Sperrhinweis bei
  ausstehendem Tagesabschluss (`register/[id]/+page.svelte`, `locked`-Zweig)
  und die punktuellen `tse_warning`-`alert()`-Hinweise nach Bestellung/Storno
  (`order`/`checkout`-Seiten) — für den Trainingsmodus eher als
  durchgehend sichtbarer Banner statt einmaligem Alert gedacht, analog zu
  einem persistenten Status-Hinweis.

## Findings

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

- [Finding] **D-058** (niedrig-mittel, Backend / Rechnungs-PDF) — Gefunden 2026-09-02 — Kontext: Bei Prüfung der GoBD-Unveränderbarkeit gefunden (2026-09-02)
  Firmendaten (Name/Adresse/Steuernummer/USt-IdNr.) und das Firmenlogo werden bei **jedem** PDF-Abruf/Reprint einer Rechnung live aus `system_setting`/dem aktuell gespeicherten Logo geladen (`receipt/data.ts`s `loadReceiptWhere()`/`loadCompanySettings()`/`loadLogoFor()`), nicht zum Verkaufszeitpunkt eingefroren — weder `invoice` noch eine andere Tabelle speichert einen Snapshot. Sowohl `GET /:id/pdf` als auch `POST /:id/reprint` (`admin/invoices.ts`) rendern die Belegblöcke bei jedem Aufruf neu aus aktuellen Stammdaten, statt den ursprünglich beim Verkauf erzeugten `print_job`-Datensatz wiederzuverwenden. Folge: ändert ein Admin später Firmenname/Adresse/Logo, zeigt die PDF-Ansicht/ein Reprint einer alten Rechnung die **neuen** Daten statt der zum Verkaufszeitpunkt gültigen — die eigentlich TSE-relevanten Felder (Beträge, Steueraufschlüsselung, Transaktionsnummer, Signatur, Belegnummer) bleiben davon unberührt, da sie aus echten Snapshot-Spalten auf `invoice`/`order_item` kommen; betroffen ist nur der "Briefkopf".
  Siehe Task #112.

- [Finding] **D-063** (niedrig, Backend / DSFinV-K-Export) — Gefunden 2026-09-08 — Kontext: Bei Task #122 (`index.xml` gegen die offizielle DTD verifiziert) gefunden
  Das jetzt korrekte `index.xml` (`exports/dsfinvk/index-xml.ts`) deklariert keine `ForeignKey`/`VariablePrimaryKey`-Beziehungen zwischen den Tabellen (z. B. `transactions.csv.BON_ID` ↔ `lines.csv.BON_ID`/`transactions_vat.csv.BON_ID`/`datapayment.csv.BON_ID`/`transactions_tse.csv.BON_ID`), obwohl die DTD (`gdpdu-01-09-2004.dtd`) das vorsieht und die offizielle Referenz-`index.xml` (bzst.de) es durchgängig nutzt. Fachlich unschädlich (jede Tabelle bleibt für sich korrekt lesbar), aber ein Prüfungstool könnte die Tabellen ohne diese Angabe nicht automatisch verknüpfen (JOIN von Hand nötig statt automatisch).
  Kein Handlungsbedarf jetzt — nice-to-have für spätere Verbesserung, kein Compliance-Blocker.

- [Finding] **D-064** (niedrig, Backend / DSFinV-K-Export) — Gefunden 2026-09-08 — Kontext: Bei Task #122 gefunden
  `index.xml`s `VariableColumn`-Elemente lassen `Description` (Klartext-Erläuterung je Feld) und `MaxLength` (Performance-Hinweis für `VariableLength`-Tabellen) bewusst weg — beide sind laut DTD optional, ihr Fehlen macht das Dokument nicht ungültig (per `xmllint --valid` gegen die echte, offizielle DTD bestätigt), aber `Description` würde einem Prüfer die Feldbedeutung direkt in der `index.xml` zeigen statt im separaten Anhang-E-Dokument nachschlagen zu müssen.
  Kein Handlungsbedarf jetzt — nice-to-have für spätere Verbesserung, kein Compliance-Blocker.

- [Finding] **D-065** (niedrig, Backend / DSFinV-K-Export) — Gefunden 2026-09-08 — Kontext: Bei Task #122 gefunden
  Die offizielle DSFinV-K-2.4-Spezifikation (Anhang E) nennt für mehrere Geldbetrags-Felder 5 Nachkommastellen (`Z_UMS_BRUTTO`/`Z_UMS_NETTO`/`Z_UST`, `BON_BRUTTO`/`BON_NETTO`/`BON_UST`, `POS_BRUTTO`/`POS_NETTO`/`POS_UST`, `STK_BR`), FairPOS rundet diese Werte aber durchgängig auf 2 Nachkommastellen (`rows.ts`, `toFixed(2)`). Das jetzt korrekte `index.xml` deklariert trotzdem die spec-gemäße `Accuracy` (5) für diese Felder — laut DTD unproblematisch, da eine höhere deklarierte Accuracy als die tatsächlichen Nachkommastellen der Daten explizit erlaubt ist (nur der umgekehrte Fall ist "undefined behaviour"). Nicht bewertet: ob die Steueraufschlüsselung selbst (nicht nur die CSV-Darstellung) von 5-stelliger statt 2-stelliger Rundungsgenauigkeit profitieren würde (z. B. um Rundungsdifferenzen bei einer Betriebsprüfungs-Nachrechnung zu vermeiden) — das wäre eine Änderung an der eigentlichen Berechnung, nicht nur am Export, und dafür bräuchte es eine eigene Bewertung.
  Kein Handlungsbedarf jetzt — reine Beobachtung, kein bekannter Fehler.
