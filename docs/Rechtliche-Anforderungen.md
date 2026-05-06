# FairPOS — Rechtliche Anforderungen & Empfehlungen

Stand: Mai 2026 | Rechtsgrundlagen: KassenSichV, § 146a AO, DSFinV-K v2.4, GoBD

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

### 6.1 Struktur

Der Export besteht aus drei Modulen als CSV-Dateien in einem ZIP-Archiv:

**Modul 1 — Einzelaufzeichnung (Transaktionsdaten)**

| Datei | Inhalt |
|---|---|
| `transactions.csv` | Bonkopf: BON_ID, Zeitstempel, BON_TYP, Kassennummer, Bedienername, Z_NR |
| `transactions_vat.csv` | MwSt.-Summen pro Transaktion |
| `lines.csv` | Artikelzeilen: Menge, Einzelpreis brutto/netto, Steuersatz |
| `lines_vat.csv` | MwSt.-Aufschlüsselung je Position |
| `datapayment.csv` | Zahlartendaten je Transaktion |
| `references.csv` | Referenzen auf andere Vorgänge (z.B. Storno) |
| `transactions_tse.csv` | TSE-Signatur, Signaturzähler, Zeitstempel |

**Modul 2 — Stammdaten**

| Datei | Inhalt |
|---|---|
| `location.csv` | Betriebsstätte: Name, Anschrift, USt-IdNr. |
| `cashregister.csv` | Kassennummer, Softwareversion, Seriennummer |
| `vat.csv` | Aktive Steuersätze mit Schlüssel und Prozentsatz |
| `tse.csv` | TSE-Seriennummer, Zertifikat, Algorithmus, öffentlicher Schlüssel |

**Modul 3 — Kassenabschluss**

| Datei | Inhalt |
|---|---|
| `businesscases.csv` | Summen je Geschäftsvorfalltyp mit MwSt.-Aufschlüsselung |
| `payment.csv` | Zahlartenzusammenfassung je Abschluss |
| `cash_per_currency.csv` | Währungsaufschlüsselung des Bargeldbestands |

### 6.2 Geschäftsvorfalltypen (BON_TYP)

| BON_TYP | Beschreibung | FairPOS-Verwendung |
|---|---|---|
| `Kassenbeleg` | Regulärer Kassenumsatz | Jede abgeschlossene Rechnung |
| `Bestellung` | Bestellvorgang ohne direkte Kassenwirksamkeit | Bestellbons der Bedienung |
| `AVBelegstorno` | Storno eines abgeschlossenen Belegs | Rechnungsstorno (Ebene 2) |
| `Schulungsbeleg` | Trainingsmodus (kein echter Umsatz) | Ggf. für Testzwecke |

### 6.3 Geschäftsvorfallarten (Zeilentypen in `lines.csv`)

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
- Datenfluss: Kassensystem → fiskaltrust Middleware → Swissbit TSE

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
- [ ] fiskaltrust Middleware installieren und konfigurieren
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
- DSFinV-K v2.4: bzst.de (Digitale Schnittstelle der Finanzverwaltung)
- GoBD BMF-Schreiben 28.11.2019: bundesfinanzministerium.de
- ELSTER Kassenmeldung: elster.de/eportal/formulare-leistungen/alleformulare/aufzeichnung146a
- fiskaltrust DSFinV-K Dokumentation: docs.fiskaltrust.cloud
