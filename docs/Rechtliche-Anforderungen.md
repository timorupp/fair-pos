# FairPOS — Rechtliche Anforderungen & Empfehlungen

Stand: August 2026 | Rechtsgrundlagen: KassenSichV, § 146a AO, DSFinV-K v2.4, GoBD, AEAO zu § 146a AO (Neufassung 30.06.2023)

---

## 1. Rechtliche Grundlagen im Überblick

| Grundlage | Inhalt |
|---|---|
| **§ 146a AO** | Materiell-rechtliche Kernpflichten: TSE-Pflicht, Belegausgabepflicht, Meldepflicht |
| **KassenSichV** | Technische Ausführungsverordnung: Bonpflichtangaben, TSE-Anforderungen |
| **DSFinV-K v2.4** | Exportstandard für digitale Betriebsprüfungen (seit Januar 2024) |
| **GoBD** | Grundsätze für digitale Buchführung; Verfahrensdokumentation, Unveränderlichkeit |
| **§ 147 AO / § 257 HGB** | Aufbewahrungspflichten |

---

## 2. Pflichtangaben auf dem Kassenbon

Rechtsgrundlage: **§ 6 KassenSichV**, **§ 146a Abs. 1 und 2 AO**

Seit 01.01.2020 gilt Belegausgabepflicht bei jeder Transaktion. Der Bon muss folgende Angaben enthalten:

| Nr. | Pflichtangabe |
|---|---|
| 1 | Vollständiger Name und Anschrift des Unternehmens |
| 2 | Datum der Belegausstellung |
| 3 | Zeitpunkt des Vorgangsbeginns und der Vorgangsbeendigung |
| 4 | Menge und Art der gelieferten Waren / Leistungen |
| 5 | Transaktionsnummer (eindeutig, fortlaufend) |
| 6 | Entgelt und Steuerbeträge, aufgeschlüsselt nach Steuersätzen |
| 7 | Hinweis auf Steuerbefreiung (falls zutreffend) |
| 8 | Seriennummer des Kassensystems |
| 9 | Seriennummer des TSE-Sicherheitsmoduls |
| 10 | Prüfwert (kryptographische Signatur der TSE) |
| 11 | Fortlaufender Signaturzähler (von der TSE ausgegeben) |

Ausgabeform: Papier, QR-Code oder elektronisch zulässig. Kunde muss den Bon nicht annehmen, er muss aber angeboten werden.

**✅ Geprüft (August 2026):** Alle 11 Pflichtangaben sind in `ReceiptData`
(`packages/backend/src/receipt/types.ts`) modelliert und werden von
`escpos-receipt.ts`/`pdf.ts` gedruckt. Kein Feld fehlt. Details und Quelle
(§ 6 KassenSichV, verbatim geprüft): `docs/Anforderungen.md` → „Pflichtangaben
auf dem Kassenbon".

---

## 3. Meldepflichten

### 3.1 Kassenmeldung beim Finanzamt (§ 146a Abs. 4 AO)

**Gilt ab 01.01.2025.** Alle elektronischen Aufzeichnungssysteme müssen beim Finanzamt gemeldet werden.

**Fristen:**
- Kassensysteme angeschafft **vor 01.07.2025** → Meldung bis **31.07.2025**
- Kassensysteme angeschafft **ab 01.07.2025** → Meldung **innerhalb eines Monats**
- Bei Außerbetriebnahme gelten dieselben Fristen für die Abmeldung

**Meldeverfahren:** Ausschließlich elektronisch über ELSTER
- Direkteingabe im ELSTER-Formular „Mitteilung über elektronische Aufzeichnungssysteme (§ 146a Abs. 4 AO)"
- XML-Upload auf mein.elster.de
- Oder über Steuerberater (ERiC-Schnittstelle)

**Pflichtangaben je gemeldetes System:**

| Kategorie | Felder |
|---|---|
| Steuerpflichtiger | Steueridentifikationsnummer, Name, Anschrift |
| Betriebsstätte | Bezeichnung, vollständige Adresse |
| Kassensystem | Systemart, Hersteller, Modellbezeichnung, Seriennummer, Softwarename/-version, Anschaffungsdatum, Inbetriebnahmedatum, Anschaffungsart |
| TSE | Seriennummer (64 Zeichen Hex), BSI-Zertifizierungs-ID (9-stellig), TSE-Art (Hardware), Aktivierungsdatum |

**Bruttomethode:** Bei jeder Meldung müssen alle Kassensysteme einer Betriebsstätte vollständig gemeldet werden (nicht nur neu angeschaffte).

**Bußgeld bei Verstößen:** bis zu **25.000 €**

### 3.2 TSE-An- und Abmeldung

Die TSE ist kein separater Meldungsgegenstand bei der BSI. Die TSE-Daten werden im Rahmen der Kassenmeldung nach § 146a Abs. 4 AO mit übermittelt. Die BSI-Zertifizierung muss jedoch nachgewiesen werden können.

**Empfehlung:** An-/Abmeldung über ELSTER selbst durchführen oder über einen Steuerberater abwickeln.

### 3.3 Ausfall der TSE

Rechtsgrundlage: **AEAO zu § 146a AO, Nr. 1.14** (Neufassung, BMF-Schreiben vom
30. Juni 2023, GZ IV D 2 - S 0316-a/20/10003 :006, wirksam ab 1. Januar 2024).
Verbatim geprüft (August 2026) gegen das offizielle BMF-Schreiben.

**Kernaussage: Weiterbetrieb ohne funktionsfähige TSE ist ausdrücklich
zulässig — kein Verkaufsstopp, keine Pflicht, Vorgänge später in die TSE
nachzutragen.** Konkret (Nr. 1.14.1–1.14.4):

1. **Dokumentationspflicht:** Ausfallzeiten und -grund einer TSE sind zu
   dokumentieren — „Diese Dokumentation kann auch automatisiert durch das
   elektronische Aufzeichnungssystem erfolgen" (Nr. 1.14.1).
2. **Kennzeichnung auf dem Beleg:** Kann das System ohne funktionsfähige TSE
   weiterbetrieben werden, muss der Ausfall auf dem Beleg erkennbar sein —
   „durch die fehlende Transaktionsnummer oder durch eine sonstige eindeutige
   Kennzeichnung" (Nr. 1.14.2). FairPOS: Die Transaktionsnummer entfällt beim
   Bon einfach (kein zusätzlicher Hinweistext nötig) — siehe
   `escpos-receipt.ts`, das die Zeile nur druckt, wenn eine Nummer vorliegt.
3. **Kein Blockieren des Verkaufs:** „Soweit der Ausfall lediglich die TSE
   betrifft, wird es nicht beanstandet, wenn das elektronische
   Aufzeichnungssystem bis zur Beseitigung des Ausfallgrundes weiterhin
   genutzt wird. Die grundsätzliche Belegausgabepflicht bleibt von dem
   Ausfall unberührt" (Nr. 1.14.3). Datum/Uhrzeit auf dem Beleg müssen in
   diesem Fall vom Kassensystem selbst kommen, nicht von der TSE.
4. **Unverzügliche Behebung:** Der Betreiber muss die Ausfallursache
   „unverzüglich" beheben und Maßnahmen treffen, um die Anforderungen des
   § 146a AO „schnellstmöglich wieder" einzuhalten (Nr. 1.14.4).

**Explizit NICHT gefordert:** ein Nachtragen/Nachsignieren der während des
Ausfalls erfassten Vorgänge in die TSE, sobald sie wieder funktioniert — wäre
mit der TSE-Architektur (Signatur nur für live ablaufende Vorgänge, mit
TSE-eigenem Zeitstempel) technisch auch nicht sinnvoll möglich.

**Konsequenz für FairPOS** (siehe `docs/TSE-Integration.md` → „TSE-Ausfall"
für das technische Konzept): Kein TSE-Aufruf darf einen Kassiervorgang
blockieren. Bei Fehler oder fehlender Konfiguration wird der Verkauf mit
`tse_*`-Feldern = `null` gebucht (bereits umgesetzt für die Bonkasse, siehe
`routes/register-session.ts`); eine Warnung im UI macht den Zustand für das
Bedienpersonal sichtbar, damit Punkt 4 (unverzügliche Behebung) organisatorisch
umgesetzt werden kann.

Quelle: [Neufassung des Anwendungserlasses zu § 146a AO, 30.06.2023](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Weitere_Steuerthemen/Abgabenordnung/AO-Anwendungserlass/2023-06-30-AEAO-Par-146-AO.pdf), Nr. 1.14.

---

## 4. Aufbewahrungspflichten

| Unterlagen | Frist | Beginn |
|---|---|---|
| Kasseneinzeldaten, Transaktionsprotokolle | **10 Jahre** | Schluss des Jahres der letzten Eintragung |
| Buchungsbelege (inkl. Kassenbons, Z-Bons) | **10 Jahre** | Schluss des Jahres |
| Bücher, Jahresabschlüsse | **10 Jahre** | Schluss des Jahres |
| Sonstige steuerlich relevante Unterlagen | **6 Jahre** | Schluss des Jahres |

**Formatanforderungen (GoBD):**
- Daten müssen jederzeit verfügbar, unverzüglich lesbar und maschinell auswertbar sein
- Daten müssen unveränderlich gespeichert sein
- Papierausdrucke allein genügen nicht — digitale Originaldaten sind aufzubewahren
- Kassendaten müssen in der originalen DSFinV-K-Struktur exportierbar bleiben

---

## 5. Tagesabschluss (Z-Bon)

Rechtsgrundlage: **§ 146 Abs. 1 AO**, **GoBD**, **§ 239 Abs. 2 HGB**

Ein **täglicher Kassenabschluss** ist rechtlich zwingend. Pflichtangaben auf dem Z-Bon:

| Angabe |
|---|
| Name des Unternehmens |
| Datum und Uhrzeit des Ausdrucks |
| Fortlaufende Z-Bon-Nummer (lückenlos, keine Lücken zulässig) |
| Bruttoeinnahmen aufgeschlüsselt nach MwSt.-Sätzen |
| Stornobuchungen, Preisnachlässe, Rabatte, Retouren |
| Zahlungsartensummen (Bargeld separat von EC/Karte) |
| Nullstellungszähler |

**Nicht zulässig:** manuelle Nachbearbeitung, periodische statt tägliche Abrechnung, lückenhafte Z-Bon-Nummerierung.

Das DSFinV-K-Kassenabschlussmodul ist das elektronische Äquivalent des Z-Bons (`businesscases.csv`, `payment.csv`, `cash_per_currency.csv`).

---

## 6. DSFinV-K-Export

**Quelle für diesen gesamten Abschnitt** (verbatim geprüft August 2026, für
Prüfungszwecke zitierfähig): *DSFinV-K, Version 2.4*, offizielles PDF unter
[kassensichv.com/downloads/DSFinV-K-Vers-2-4.pdf](https://kassensichv.com/downloads/DSFinV-K-Vers-2-4.pdf)
(130 Seiten). Seitenangaben unten beziehen sich auf dieses Dokument. Für
Details zum genauen CSV-Dateiformat (Feldtrennzeichen, Kopfzeile) verweist die
DSFinV-K selbst (S. 10) auf ein separates Dokument „Ergänzende Informationen
zur Datenträgerüberlassung" (Anlage zu den GoBD) — dieses wurde für diese
Dokumentation **nicht** eingesehen; vor der finalen Implementierung des
CSV-Schreibens (Trennzeichen etc.) sollte das nachgeholt werden. Branchenüblich
(nicht als DSFinV-K-Vorgabe zitierfähig, sondern nur als Konvention) ist
Semikolon-getrennte UTF-8-CSV mit Kopfzeile.

### 6.1 Struktur

Der Export besteht aus drei Modulen (S. 15) plus einer beschreibenden
`index.xml` (GDPdU/GoBD-Anlage-Schema) als Manifest. **Vollständige Dateiliste
laut Inhaltsverzeichnis (S. 6)** — FairPOS-Relevanz markiert:

**Einzelaufzeichnungsmodul** (S. 84–105)

| Datei | Inhalt | FairPOS |
|---|---|---|
| `transactions.csv` (Bonkopf) | BON_ID, BON_NR, BON_TYP, BON_NAME, TERMINAL_ID, BON_STORNO, BON_START, BON_ENDE, BEDIENER_ID/NAME, UMS_BRUTTO, KUNDE_* | ✅ genutzt |
| `allocation_groups.csv` (Bonkopf_AbrKreis) | Zuordnung Beleg → Abrechnungskreis (z.B. Tisch) | ✅ passt zu unseren Tischen |
| `transactions_vat.csv` (Bonkopf_USt) | Brutto/Netto/USt je Beleg und Steuersatz | ✅ entspricht unserer `taxBreakdown` |
| `datapayment.csv` (Bonkopf_Zahlarten) | Zahlartenaufschlüsselung je Beleg | ✅ (aktuell nur „Bar", `payment_method` deckt „Unbar" vor) |
| `lines.csv` (Bonpos) | Artikeltext, GV_TYP, GV_NAME, Menge, Faktor, Einheit, Grundpreis | ✅ genutzt |
| `lines_vat.csv` (Bonpos_USt) | Brutto/Netto/USt je Position und Steuersatz | ✅ genutzt |
| `itemamounts.csv` (Bonpos_Preisfindung) | Rabatt/Zuschlag je Position | teilweise (Pfand als Zuschlag denkbar) |
| `subitems.csv` (Bonpos_Zusatzinfo) | Unterpositionen (Menü-Bestandteile) | nicht genutzt — FairPOS hat keine Menüs |
| `references.csv` (Bon_Referenzen) | Verweise auf andere Belege/externe Systeme | nicht benötigt (Bonstorno nutzt `Beleg` mit umgekehrtem Vorzeichen, s.u. — keine Referenzierung über diese Datei nötig) |
| `transactions_tse.csv` (TSE_Transaktionen) | TSE-Signatur, Signaturzähler, Zeitstempel je Vorgang | ✅ genutzt (bisher fälschlich in `transactions_vat.csv` vermutet — korrigiert) |

**Stammdatenmodul** (S. 66–79)

| Datei | Inhalt | FairPOS |
|---|---|---|
| `cashpointclosing.csv` (Stamm_Abschluss) | Kassenabschluss-Metadaten (Z_NR, Start-/End-Vorgangs-ID) | ✅ pro Z-Bon |
| `location.csv` (Stamm_Orte) | Betriebsstätte: Name, Anschrift, USt-IdNr. | ✅ aus `system_setting` |
| `cashregister.csv` (Stamm_Kassen) | Kassennummer, Softwareversion, Seriennummer | ✅ aus `register` |
| `slaves.csv` (Stamm_Terminals) | Terminals einer Master-Kasse | nicht benötigt — FairPOS hat keine Master-Slave-Kassen |
| `pa.csv` (Stamm_Agenturen) | Agenturgeschäfte (Fremdverkauf) | nicht benötigt |
| `vat.csv` (Stamm_USt) | Steuersätze mit Schlüssel (UST_SCHLUESSEL) | ✅ siehe Schlüsselschema unten |
| `tse.csv` (Stamm_TSE) | TSE-Seriennummer, Zertifikat, Signaturalgorithmus, Zeitformat, Public Key | teilweise — Zertifikatsfelder fehlen noch, siehe Task #46 |

**Kassenabschlussmodul** (S. 80–83)

| Datei | Inhalt | FairPOS |
|---|---|---|
| `businesscases.csv` (Z_GV_TYP) | Summen je Geschäftsvorfalltyp + USt-Aufschlüsselung | ✅ Äquivalent zum Z-Bon |
| `payment.csv` (Z_Zahlart) | Zahlartensummen je Abschluss | ✅ |
| `cash_per_currency.csv` (Z_WAEHRUNGEN) | Bargeldbestand nach Währung | ✅ (nur EUR) |

### 6.2 Geschäftsvorfalltypen (BON_TYP) — Anhang B, S. 43–47

Vollständiger Wertebereich (verbindlich, keine eigenen Werte erlaubt):
`Beleg`, `AVRechnung`, `AVTransfer`, `AVBestellung`, `AVTraining`,
`AVBelegstorno`, `AVBelegabbruch`, `AVSachbezug`, `AVSonstige`.

| BON_TYP | Bedeutung laut Spezifikation | FairPOS-Verwendung |
|---|---|---|
| `Beleg` | „Vorgang, der über die Kasse abgeschlossen wird" — verändert die Vermögenszusammensetzung; alle Zahlarten möglich | Kassenbeleg-V1 (Bonkasse-Checkout, Bedienungskasse-Split-Kassieren, **auch** Bonstorno — s.u.) |
| `AVBestellung` | „Bestellungen, die im Kassensystem direkt erfasst und als eigenständiger Vorgang behandelt werden" — noch keine Lieferung/Leistung | Bedienungskasse: Bestellung aufnehmen |
| `AVBelegabbruch` | „Vorgänge, die nach Transaktionsbeginn abgebrochen werden" — keine Zahlung zulässig | Wird von `signTseTransaction` bereits als TSE-`processType` genutzt (Task #45) — als DSFinV-K-`BON_TYP` für den späteren Export ebenfalls zu verwenden |
| `AVSonstige` | „Alle Vorgänge, die hier nicht näher definiert wurden" — `BON_NAME` zwingend mit individueller Beschreibung zu füllen | Storno einer offenen Bestellposition (vor dem Kassieren) |
| `AVTraining` | Übungs-/Trainingsvorgänge, keine echte Zahlung, kein Einfluss auf den Kassenabschluss | Für `invoice.receipt_type='training'` vorgesehen (falls genutzt) |
| `AVBelegstorno` | **Achtung, S. 45f.:** „Sobald eine TSE an einer Kasse eingesetzt wird, ist es technisch nicht mehr möglich, den Vorgangstyp 'AVBelegstorno' korrekt zu verwenden, da jeder Beleg schon vor dem Setzen des Storno-Kennzeichens bereits durch die TSE signiert wurde... Hierfür muss weiterhin der Vorgangstyp 'Beleg' mit umgekehrten Vorzeichen und ohne Storno-Kennzeichen genutzt werden." | **Bestätigt unser bestehendes Bonstorno-Design:** `cancels_invoice_id`-Referenz + `receipt_type='cancellation'` als eigener `Beleg`-Vorgang mit `Kassenbeleg-V1`-Signatur — exakt das von der Spezifikation für TSE-Systeme vorgeschriebene Verfahren, nicht `AVBelegstorno`. |
| `AVRechnung`, `AVTransfer`, `AVSachbezug` | Lieferschein-/Rechnungs-Entkopplung, Sachbezüge von Mitarbeitern | nicht genutzt — kein Anwendungsfall bei FairPOS |

### 6.3 Geschäftsvorfalltypen der Position (GV_TYP) — Anhang C, S. 48–61

Vollständiger Wertebereich: `Umsatz`, `Pfand`, `PfandRueckzahlung`, `Rabatt`,
`Aufschlag`, `ZuschussEcht`, `ZuschussUnecht`, `TrinkgeldAG`, `TrinkgeldAN`,
`EinzweckgutscheinKauf`, `EinzweckgutscheinEinloesung`,
`MehrzweckgutscheinKauf`, `MehrzweckgutscheinEinloesung`,
`Forderungsentstehung`, `Forderungsaufloesung`, `Anzahlungseinstellung`,
`Anzahlungsaufloesung`, `Anfangsbestand`, `Privatentnahme`, `Privateinlage`,
`Geldtransit`, `Lohnzahlung`, `Einzahlung`, `Auszahlung`, `DifferenzSollIst`.

Für FairPOS relevante Typen:

| Typ | FairPOS-Verwendung |
|---|---|
| `Umsatz` | Normaler Artikelverkauf |
| `Pfand` | Artikel mit positivem Pfandbetrag |
| `PfandRueckzahlung` | Artikel mit negativem Pfandbetrag (Leergutrückgabe) |
| `Anfangsbestand` | Wechselgeldeinlage / Startgeld |
| `Einzahlung` | Allgemeine Einzahlung in die Kasse |
| `Auszahlung` | Entnahme aus der Kasse |
| `DifferenzSollIst` | Kassendifferenz beim Abschluss |

### 6.4 UST_SCHLUESSEL-Schema (Stamm_USt, S. 26–27)

Feste ID-Vergabe, nicht frei wählbar für die Standard-IDs:
- **1–4**: aktuell gültige Steuersätze nach §§ 12, 24 UStG (1 = allgemeiner
  Satz, 2 = ermäßigter Satz, 3/4 = Durchschnittssätze §24 UStG — für FairPOS
  irrelevant, keine Landwirtschaft)
- **5**: 0 % (steuerfrei/nicht steuerbar)
- **ab 11**: historische Steuersätze (zweistellig, zweite Ziffer referenziert
  die ursprüngliche ID)
- **ab 1000**: individuelle Anpassungen durch den Unternehmer, in der
  Verfahrensdokumentation zu erläutern

FairPOS-Abbildung: `article_category.tax_rate` (19/7/0 %) → UST_SCHLUESSEL 1/2/5.

### 6.5 processData-Format für `Kassenbeleg-V1` (Anhang I, S. 112–117)

**Wichtig — betrifft die bereits laufende TSE-Signierung, nicht nur den
späteren Export:** Das Format ist exakt vorgeschrieben, nicht frei wählbar:

```
<Vorgangstyp>^<Brutto-Steuerumsätze>^<Zahlungen>
```
- Trennzeichen zwischen den drei Teilen: `^` (U+005E)
- `<Vorgangstyp>`: einer der BON_TYP-Werte aus Abschnitt 6.2
- `<Brutto-Steuerumsätze>`: Bruttoumsatz je Steuersatz, getrennt durch `_`
  (U+005F), in der festen Reihenfolge „allgemeiner Satz, ermäßigter Satz,
  Durchschnittssatz §24(1)Nr.3, Durchschnittssatz §24(1)Nr.1, 0 %" — auch
  ungenutzte Steuersätze mit `0.00` angeben, exakt zwei Dezimalstellen, Punkt
  als Dezimaltrennzeichen, keine Tausendertrennzeichen
- `<Zahlungen>`: `<Betrag>:<Zahlungsart>:<Währung>`, mehrere Zahlungen durch
  `_` verkettet; Zahlungsart nur „Bar" oder „Unbar"; Währung nur angeben wenn
  ≠ EUR; Zahlungen von `0.00` entfallen

**Aktueller Stand (August 2026):** `tse/processData.ts` schreibt stattdessen
ein selbstbeschreibendes JSON-Snapshot (dokumentiert als Interimsformat seit
Task #40). Die Umstellung auf das vorgeschriebene Format ist als eigener Task
**#46** erfasst (bewusst zurückgestellt, um Scope zu begrenzen) — betrifft
auch den maschinenlesbaren QR-Code-Inhalt (Anhang I Abschnitt 2, S. 122ff.),
der zusätzlich TSE-Zertifikatsdetails (Signaturalgorithmus, Public Key,
Log-Time-Format) referenziert, die `native/tse-cli` aktuell nicht ausliest.

### 6.6 Kundendaten

DSFinV-K sieht optionale `KUNDE_*`-Felder im Bonkopf vor (Name, Anschrift,
USt-IdNr. des Leistungsempfängers — v.a. für B2B-Rechnungen). FairPOS erfasst
bewusst keine Kundendaten (anonymer Barverkauf); diese Felder bleiben im
Export leer. Das entspricht der Organisationsvorgabe, niemals
personenbezogene Daten von Kunden zu verwenden.

### 6.7 Datenmodell-Abgleich (August 2026, aktualisiert nach Implementierung)

Gegen die offizielle Spezifikation v2.4 geprüft (`Bonkopf`/`Bonkopf_USt`/
`Bonpos`/`Bonpos_USt`). Die zwei ursprünglich vermuteten Schema-Lücken haben
sich bei der Implementierung (`packages/backend/src/exports/dsfinvk/`) als
bereits am Export-Zeitpunkt lösbar herausgestellt — **keine Migration nötig**:
1. `BON_START`/`BON_ENDE` müssen vom Aufzeichnungssystem selbst kommen, nicht
   von der TSE — bei FairPOS ist jeder einzelne DSFinV-K-Vorgang (Bestellung
   aufnehmen, Kassieren, Stornieren) bereits atomar (ein HTTP-Request), daher
   ist `invoice.created_at`/`service_order.created_at`/`order_cancellation.created_at`
   selbst der korrekte Start- **und** Endzeitpunkt — kein separates Feld nötig.
2. `GV_TYP` je Position wird beim Bauen der `lines.csv`-Zeilen aus den
   bestehenden `order_item.price`/`deposit_price`-Feldern synthetisiert: eine
   `Umsatz`-Zeile für den Artikelpreis, plus bei Bedarf eine zweite
   `Pfand`/`PfandRueckzahlung`-Zeile für das Pfand — beides aus denselben
   zwei Spalten ableitbar, keine neue `order_item`-Spalte nötig.

**Bewusste Vereinfachung (dokumentiert, nicht "gelöst"):** `service_order`/
`order_cancellation` haben keine `daily_closing_id`-Referenz (anders als
`invoice`) und werden daher über Kasse + Kalendertag (`business_date`)
angenähert, nicht über eine exakte Zuordnung zum Kassenabschluss. Bei mehreren
Abschlüssen desselben Tages und derselben Kasse kann das zu einer falschen
Zuordnung führen. Siehe `exports/dsfinvk/load.ts` für die genaue Logik.

**Ebenfalls noch offen:** TSE-Zertifikatsfelder (`TSE_SIG_ALGO`,
`TSE_PUBLIC_KEY`, `TSE_ZERTIFIKAT_I/II`) bleiben leer — `native/tse-cli` liest
sie aktuell nicht aus (Task #46, zusammen mit der processData-Formatkorrektur).
Das genaue CSV-/index.xml-Dateiformat (Feldtrennzeichen, Kopfzeile) folgt der
verbreiteten Konvention (Semikolon, UTF-8, CRLF, GDPdU-artige index.xml), ist
aber nicht gegen die separate GoBD-Anlage "Ergänzende Informationen zur
Datenträgerüberlassung" verifiziert (siehe Einleitung Abschnitt 6).

---

## 7. Unveränderlichkeit der Daten

Rechtsgrundlage: **§ 146 Abs. 4 AO**, **§ 3 KassenSichV**, **GoBD**

- Einmal gespeicherte Aufzeichnungen dürfen nicht ohne Protokollierung geändert oder gelöscht werden
- Stornierungen erfordern eine **eigene Gegenbuchung** — keine Löschung der Originalbuchung
- Lücken in der Transaktionskette müssen erkennbar sein
- Die TSE erzeugt kryptographisch verkettete Signaturen — Manipulationen werden erkennbar
- Daten müssen in originaler DSFinV-K-Struktur aufbewahrbar bleiben

---

## 8. Verfahrensdokumentation

Rechtsgrundlage: **GoBD Tz. 151–155**, **§ 145 Abs. 1 AO**

Jede buchführungspflichtige Organisation muss eine **schriftliche Verfahrensdokumentation** führen. Sie muss historisch nachverfolgbar sein — Änderungen sind mit Datum und Version zu dokumentieren.

**Pflichtbestandteile:**

### A. Allgemeine Beschreibung
- Beschreibung der Geschäftstätigkeit und steuerlichen Pflichten des Vereins
- Zuständigkeiten und Verantwortlichkeiten
- Änderungs- und Versionierungskonzept des Kassensystems

### B. Anwenderdokumentation
- Bedienungsanleitung für das Kassensystem (Administrator, Kassenpersonal, Bedienung)
- Richtlinien für Mitarbeiter: Datenerfassung, Stornierung, Tagesabschluss
- Umgang mit Fehlern und Ausnahmesituationen (z.B. Druckerausfall, Serverausfall)

### C. Technische Systemdokumentation
- Hardware-Komponenten mit Seriennummern (Server, Tablets, Smartphones, Drucker)
- Netzwerkaufbau und IP-Adressen
- TSE: Modell, BSI-Zertifizierungs-ID, Seriennummer, Aktivierungsdatum
- FairPOS-Softwareversion und Lizenzdaten
- Datenfluss: Kassensystem (FairPOS-Backend) → TSE-CLI-Subprozess (`native/tse-cli`) → Swissbit USB-TSE (siehe docs/TSE-Integration.md; fiskaltrust wurde als zu teuer verworfen, August 2026)

### D. Betriebsdokumentation
- Backup-Konzept und Ablageort der Datensicherungen
- Maßnahmen zur Datenintegrität
- Benutzerverwaltung und Berechtigungskonzept
- Verfahren bei Systemausfall (Ausweichverfahren: offene Ladenkasse)
- Dokumentation aller Systemänderungen (Softwareupdates, Konfigurationsänderungen) mit Datum und Grund

**Konsequenz bei Fehlen:** Das Finanzamt kann die gesamte Buchführung verwerfen und Zuschätzungen vornehmen.

> **→ Die Verfahrensdokumentation für FairPOS muss als separates Dokument erstellt werden.**

---

## 9. Besonderheiten für Vereine

### Steuerliche Sphären

Ein gemeinnütziger Verein ist in vier steuerliche Bereiche aufgeteilt:

| Bereich | Beispiele | Kassenpflicht bei elektronischer Kasse |
|---|---|---|
| **Ideeller Bereich** | Mitgliedsbeiträge, Spenden | Bonausgabepflicht; TSE-Pflicht wenn elektronische Kasse |
| **Vermögensverwaltung** | Miet-/Zinseinnahmen | Keine direkte TSE-Pflicht (keine Kassennutzung) |
| **Zweckbetrieb** | Vereinsfeste, Sportveranstaltungen | Volle TSE-Pflicht bei elektronischer Kasse |
| **Wirtschaftlicher Geschäftsbetrieb** | Vereinsgaststätte, Warenverkauf | Volle TSE-Pflicht, volle Kassenpflichten |

**Kernregel:** Es gibt keine generelle Kassenbefreiung für Vereine. Sobald eine elektronische Kasse eingesetzt wird, gelten alle Anforderungen der KassenSichV uneingeschränkt.

**Wahlrecht offene Ladenkasse:** Solange kein elektronisches System genutzt wird, gilt weder TSE-Pflicht noch Bonausgabepflicht. Mit der Einführung von FairPOS entfällt dieses Wahlrecht.

---

## 10. Checkliste: Inbetriebnahme FairPOS

- [ ] Swissbit USB-TSE beschaffen und aktivieren
- [ ] TSE-CLI-Binary bauen (`native/tse-cli/build.sh`) und `TSE_MOUNT_POINT`/`TSE_CLIENT_ID` konfigurieren (Systemeinstellungen → System oder `.env`, siehe docs/TSE-Integration.md)
- [ ] FairPOS-Seriennummer und Softwareversion dokumentieren
- [ ] Unternehmensdaten und Steuernummer im System hinterlegen
- [ ] Alle Steuersätze korrekt konfigurieren
- [ ] Kassenmeldung via ELSTER einreichen (Frist beachten)
- [ ] Verfahrensdokumentation erstellen
- [ ] Backup-Konzept umsetzen (10-jährige Aufbewahrungspflicht)
- [ ] Tägliche Kassenabschluss-Routine einführen (Z-Bon)
- [ ] Mitarbeiter schulen

---

## Quellen

- KassenSichV: gesetze-im-internet.de/kassensichv
- § 146a AO: gesetze-im-internet.de/ao_1977/__146a.html
- § 147 AO (Aufbewahrung): gesetze-im-internet.de/ao_1977/__147.html
- DSFinV-K v2.4 (verbatim geprüft, konkretes PDF für Abschnitt 6 zitiert): kassensichv.com/downloads/DSFinV-K-Vers-2-4.pdf — offizielle Fassung auch über bzst.de (Digitale Schnittstelle der Finanzverwaltung) auffindbar
- AEAO zu § 146a AO, Neufassung 30.06.2023 (verbatim geprüft, Abschnitt 3.3): bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Weitere_Steuerthemen/Abgabenordnung/AO-Anwendungserlass/2023-06-30-AEAO-Par-146-AO.pdf
- GoBD BMF-Schreiben 28.11.2019: bundesfinanzministerium.de
- ELSTER Kassenmeldung: elster.de/eportal/formulare-leistungen/alleformulare/aufzeichnung146a
