# FairPOS — Anforderungen

## Kontext

Ein Kassensystem (Point of Sale) für Vereine, das hauptsächlich bei Veranstaltungen und Festen zum Einsatz kommt. Zentrale Rahmenbedingungen: lauffähig auf handelsüblicher Hardware, minimale laufende Kosten.

Anforderungen werden schrittweise erfasst — nur explizit bestätigte Angaben werden hier dokumentiert.

---

## Rahmenbedingungen

- **Zielgruppe:** Vereine (infrequente Nutzung, z.B. Events und Feste)
- **Hardware:** Handelsübliche, bereits vorhandene Geräte
- **Kosten:** Minimale laufende Kosten, keine teuren Cloud-Abos

---

## Benutzerrollen

Alle Benutzer sind vom gleichen Typ; die Unterscheidung erfolgt über zwei Attribute:

- **Ist Administrator** (Schalter) — gibt Zugang zur Administrationsoberfläche über eine separate Administrator-Loginseite; Anmeldung mit Benutzername + Passwort
- **Zugewiesene Kassen** — bestimmt, auf welche Kassen der Benutzer Zugriff hat; die Kasse bestimmt über ihren **Typ** die angezeigte Oberfläche (Bonkasse → Kassenpersonal-UI, Bedienungskasse → Bedienungs-UI); Anmeldung per Einmal-Zugangscode

**Sessions:** Administrator-Session und Kassen-Session sind vollständig voneinander getrennt und können gleichzeitig aktiv sein (z.B. in verschiedenen Browser-Tabs). Von der Kassen-UI gibt es keinen Zugang zur Administrationsoberfläche und umgekehrt.

Hat ein Benutzer Zugriff auf mehrere Kassen, wird nach dem Kassen-Login eine Auswahl der zugewiesenen Kassen angezeigt.

---

## Plattform / Technische Rahmenbedingungen

- **Server:** Läuft auf einem Linux-Server (lokal im Netzwerk)
- **Client:** Zugriff über Browser oder als PWA (Progressive Web App) auf den Endgeräten
- **Konnektivität:** Endgeräte müssen ständig mit dem Server verbunden sein; eine Internetverbindung ist nicht erforderlich — ein lokales Netzwerk genügt

---

## Funktionale Anforderungen

### Navigationsstruktur

```
Administrator
│
├── Dashboard  ← Startseite
│
├── Auswertungen
│   ├── Offene Positionen je Tisch
│   ├── Erstellte Rechnungen
│   ├── Soll-Kassenstand
│   └── Stornos & kostenfreie Abgaben
│
├── Exporte
│   ├── Excel-Export (Tagesexport / Veranstaltungsexport)
│   └── DSFinV-K-Export
│
├── Kassen
│   ├── [Button: Alle Kassen abschließen]
│   ├── Bonstorno
│   └── [Kassendetail]
│       ├── Kassenstand
│       ├── Wechselgeldeinlage
│       ├── Entnahme
│       ├── Transaktionshistorie
│       ├── Kassenabschluss
│       └── Tagesabschluss
│
├── Artikel
│
├── Veranstaltungen
│
├── Benutzer
│   └── [je Benutzer: Zugangscode erzeugen]
│
└── Einstellungen
    ├── Artikelgruppen
    ├── Kassenlayouts
    │   └── Standardlayout je Typ
    ├── Drucker
    ├── Saalplan
    ├── Stornogründe
    ├── Unternehmensdaten
    └── System (Zeitzone, Uhrzeit, TSE-Status, Seriennummer, Server-Adresse, Backup-Verzeichnis, Backup-Download)
```

---

### UI-Designgrundsätze

- **Zahlen und Beträge** werden in Tabellen und Formularen immer **rechtsbündig** dargestellt

### Allgemeines UI-Muster: Objektverwaltung

Alle Verwaltungsfunktionen für Objekte (Tische, Drucker, Artikel, Kassen, Benutzer, Kassenlayouts, Veranstaltungen) folgen einem einheitlichen Schema:

1. **Übersichtsliste** — zeigt alle bestehenden Objekte; von hier aus kann ein bestehendes Objekt zur Bearbeitung geöffnet oder ein neues Objekt angelegt werden
2. **Bearbeitungsansicht** — zum Anlegen und Bearbeiten eines Objekts; die **Löschfunktion** (sofern für das Objekt erlaubt) befindet sich ausschließlich hier, nie in der Übersichtsliste

---

### Administrator

- **Saalplanverwaltung:** Tische für den Veranstaltungsort konfigurieren
  - Tische werden mit Buchstabe+Zahl benannt (Spalte + Zeile, z.B. A1, B3, E9)
  - **Tische generieren:** Automatisches Anlegen mit folgenden Parametern:
    - **Spalten:** Anzahl (±), Nummerierung wählbar: alphabetisch (A, B, C, …) oder numerisch (1, 2, 3, …), Reihenfolge (Aufsteigend/Absteigend)
    - **Zeilen:** Anzahl (±), Nummerierung wählbar: alphabetisch oder numerisch, Reihenfolge (Aufsteigend/Absteigend)
    - **Tischbeschriftung:** immer „Spalte + Zeile" (z.B. A1, 1A oder 11 — je nach Nummerierung)
  - **Anordnung bearbeiten:** Manuelle Anpassung des Tischlayouts
    - Zeilen und Spalten per Drag-Handle umsortierbar (⋮ links für Zeilen, ⋯ oben für Spalten)
    - Kontextmenü pro Tisch:
      - **Tisch aktiv** — sichtbar und belegbar/bestellbar
      - **Tisch inaktiv** — sichtbar, aber nicht belegbar/bestellbar
      - **Tisch versteckt** — wird im Saalplan nicht angezeigt
      - **Tisch bearbeiten** — Name des Tisches ändern
      - **Tisch löschen** — Tisch entfernen

- **Bondruckerverwaltung:** Beliebig viele Bondrucker konfigurierbar; unterstützter Standard: **ESC/POS über TCP/IP** (de-facto-Standard der Bondruckerbranche, unterstützt von Epson, Star Micronics, Bixolon, Citizen u.v.m.; getestetes Gerät: Epson TM-m30II)
  - Attribute pro Drucker:
    - Name (frei wählbar)
    - IP-Adresse
    - TCP-Port (Standard: 9100)
    - Standarddrucker — genau ein Drucker kann als Standard markiert werden; wird verwendet, wenn beim Artikel kein Drucker angegeben ist
  - Anzeige pro Drucker:
    - **Online-Status** — zeigt an, ob der Drucker aktuell erreichbar ist (ohne Testseite drucken zu müssen)
    - Liste der ausstehenden Druckaufträge (Warteschlange)
    - Möglichkeit, einzelne Druckaufträge aus der Warteschlange zu löschen
  - Aktionen pro Drucker:
    - **Drucker löschen**
    - **Testseite drucken** — zum Überprüfen der Druckerkonfiguration

- **Artikelverwaltung:** Artikel mit Preisen pflegen; Artikel können in Gruppen eingeteilt werden

  **Artikelgruppen — Attribute:**
  - Name
  - Umsatzsteuersatz — freie Eingabe als Prozentwert (z.B. 7, 19, 0); gilt für alle Artikel der Gruppe
  - Zweck: Gruppierung für Auswertungen/Berichte und Träger des Umsatzsteuersatzes; kein Einfluss auf das Kassenlayout

  **Artikel — Attribute:**
  - Artikelgruppe (Pflichtfeld — da der Umsatzsteuersatz in der Gruppe hinterlegt ist)
  - Name (Kurzname — wird als Beschriftung der Taste im Kassenlayout verwendet, da dort wenig Platz ist)
  - Preis
  - Pfandbetrag — optionaler Zusatzbetrag; kann positiv oder negativ sein:
    - Positiv: Pfand wird auf die Rechnung aufgeschlagen (z.B. Ausgabe eines Glases)
    - Negativ: Pfand wird von der Rechnung abgezogen (z.B. Leergutrückgabe); kann zu einer negativen Gesamtrechnung führen, was eine Barauszahlung aus der Kasse bedeutet oder den Betrag einer neuen Bestellung reduziert; Leergutrückgabe-Artikel können in derselben Bestellung mit normalen Artikeln kombiniert werden — der negative Pfand wird direkt verrechnet
    - Ein reiner Pfandartikel hat Preis = 0 und nur einen Pfandbetrag (positiv oder negativ)
  - Pfandbon separat drucken (Option, nur relevant wenn Pfandbetrag gesetzt; gilt ausschließlich für den Selbstabholerbon an der Bonkasse):
    - Aktiv: Es werden 2 Selbstabholerbons gedruckt — ein Artikelbon und ein separater Pfandbon
    - Inaktiv: Es wird 1 Selbstabholerbon gedruckt, auf dem Artikel und Pfand gemeinsam vermerkt sind (verhindert, dass sie voneinander getrennt werden)
    - Bestellbons (Küche/Theke): Pfand wird immer gemeinsam mit dem Artikel auf einem Bon gedruckt
  - Status:
    - *aktiv* — im Kassenlayout bestellbar
    - *inaktiv* — im Kassenlayout sichtbar, aber nicht bestellbar
  - Ob ein Artikel im Kassenlayout erscheint, wird nicht über den Status gesteuert, sondern über die Kassenlayout-Konfiguration (Ablage vs. platziert)
  - Bontext — vollständiger Artikelname für den Kassenbon (separat vom Kurznamen)
  - Bestelldrucker — Drucker, auf dem die Bestellung des Artikels ausgedruckt wird (z.B. Küchendrucker für Speisen, Thekendrucker für Getränke)
  - **Produktoptionen** — beliebig viele Optionen pro Artikel definierbar (z.B. „mit Ketchup", „mit Mayo"); gelten ausschließlich für Bestellungen der Bedienung, nicht an der Bonkasse
    - Kein Einfluss auf den Preis
    - Mehrfachauswahl möglich; Auswahl ist optional (keine Option = Artikel ohne Zusatz)
    - Gewählte Optionen werden auf dem Bestellbon (Küche/Theke) ausgedruckt

- **Unternehmensdaten & Systemeinstellungen:**
  - Name des Unternehmens / Vereins
  - Straße und Hausnummer
  - PLZ
  - Ort
  - Steuernummer (Finanzamt)
  - USt-IdNr. (optional, falls vorhanden)
  - **Logo** — hochladbare Bilddatei (PNG/JPG, max. 2 MB); wird beim Upload einmalig in zwei Druck-Varianten umgerechnet (Farbe für PDF, 1-Bit-Raster für ESC/POS) und zusätzlich im Original gespeichert, damit Zoom-Änderungen ohne Re-Upload möglich sind. Position auf dem Beleg: mittig oben über dem Firmennamen. Größe konfigurierbar über **Zoom (1–500 %)**, Default 100 % = volle Bonbreite. Werte > 100 % werden hardwareseitig auf die maximale Druckkopfbreite begrenzt. Pro Beleg-/Bon-Typ einzeln per Checkbox aktivierbar — Optionen: Kassenbon, Stornobeleg, Z-Bon, Bestellbon (Bedienung), Selbstabholerbon (Bonkasse), Pfandbon. Default-Flags: aus. Zusätzliche Funktion „Testdruck mit Logo" auf einem ausgewählten Drucker — unabhängig von den Flags, damit Operator das Logo vor produktiver Nutzung prüfen kann.
  - **Belegnummer-Präfix** (frei wählbar, z.B. „RE-" oder „2024-")
  - **Belegnummer-Zähler** (Startwert konfigurierbar; wird je ausgestellter Rechnung automatisch um 1 erhöht; resultierendes Format z.B. „RE-00042")
  - **Umsatzsteuersatz Pfand** (global konfigurierbar, da Pfand ggf. einem anderen Steuersatz unterliegt als der zugehörige Artikel)

- **Kassenverwaltung:** Beliebig viele Kassen konfigurierbar; eine Kasse existiert unabhängig von Benutzern und behält ihren Kassenstand auch bei Benutzerwechsel
  - Attribute pro Kasse:
    - Name (z.B. „Kasse 1", „Eingang", „Theke", „Anna")
    - Typ:
      - **Bonkasse** — für Kassenpersonal (Tablet); kassiert sofort, druckt Bon
      - **Bedienungskasse (Geldbeutel)** — für Bedienung (Smartphone); nimmt Bestellungen auf, kassiert am Tisch
    - Zugeordneter Drucker (nur bei Typ Bonkasse; aus den konfigurierten Bondruckern)
    - Zugeordnetes Kassenlayout (optional, für alle Typen; überschreibt das Standardlayout des Typs)
  - Funktionen in der Kassendetailansicht:
    - **Kassenstand anzeigen** — aktueller Soll-Kassenstand (Startgeld + Einnahmen − Entnahmen)
    - **Wechselgeldeinlage** — manuelle Transaktion zur Einlage von Startgeld/Wechselgeld
    - **Entnahme** — manuelle Transaktion zur Zwischenentnahme
    - **Transaktionshistorie** — Übersicht aller Einlagen und Entnahmen der Kasse

- **Benutzerverwaltung:** Administrator kann Benutzer anlegen und verwalten
  - Attribute pro Benutzer:
    - Vollständiger Name
    - **Ist Administrator** (Schalter) — Zugang zur Administrationsoberfläche; Login-Name und Passwort werden nur bei aktivem Schalter konfiguriert
    - **Zugewiesene Kassen** — Liste der Kassen, auf die der Benutzer berechtigt ist; bestimmt über den Kassentyp die angezeigte Kassen-Oberfläche; kann auch bei Administratoren gesetzt sein
  - **Zugangscode erzeugen** — Aktion pro Benutzer direkt in der Übersichtsliste der Benutzerverwaltung; öffnet einen Dialog (oder eine neue Seite) mit dem Einmal-Zugangscode für die Kassen-Session; Gültigkeit: 10 Minuten, einmalig verwendbar. Der Dialog zeigt den Code in drei Formen:
    - **QR-Code** — immer angezeigt; zum Scannen mit dem Mobilgerät
    - **Zugangslink** — immer angezeigt als Klartext-URL mit „Link kopieren"-Button daneben; kann kopiert oder in einem neuen Tab geöffnet werden
    - **„Kasse in neuem Tab öffnen"-Button** — nur angezeigt, wenn der Code für den aktuell eingeloggten Administrator selbst erzeugt wird; öffnet den Zugangslink direkt im Browser
    - Alle drei Optionen enthalten technisch denselben Einmal-Link mit dem Token; nach dem Öffnen wird die Kassenwahl angezeigt
  - **Kassen-Sessions:** persistent — nach dem ersten Login bleibt die Kassen-Session aktiv, auch nach Schließen des Browsers; kein erneuter Login erforderlich, solange die Session gültig ist

- **Stornogründe-Verwaltung:** Liste der Gründe für Stornierungen und kostenfreie Abgaben; in den Einstellungen pflegbar
  - Attribute pro Stornogrund:
    - Name (z.B. „Nicht geliefert", „Ehrengast", „Fehler Bedienung")
    - Buchungsart:
      - **Storno** — Positionen werden still entfernt; kein Beleg, keine TSE-Transaktion
      - **100% Rabatt** — Zahlungsbeleg mit 0 € wird erstellt und TSE-seitig verbucht

- **Kassenlayout-Verwaltung:** Beliebig viele Kassenlayouts anlegbar
  - Attribute pro Kassenlayout:
    - Name
    - Rastergröße: Anzahl Spalten und Zeilen (frei konfigurierbar)
    - Artikelplatzierung: freies Raster mit Drag & Drop (eine Ebene), Lücken erlaubt
    - Kein typ-spezifisches Attribut am einzelnen Layout — Standardlayouts werden typ-global konfiguriert (siehe unten)
  - Aktionen:
    - **Kassenlayout duplizieren** — erstellt eine Kopie eines bestehenden Layouts als Ausgangspunkt
  - **Standardlayout je Kassentyp** — in der Kassenlayout-Verwaltung wird je Typ ein Standardlayout festgelegt:
    - Standard für Bonkassen
    - Standard für Bedienungskassen
    - Einzelne Kassen können dieses Standard durch ein explizit zugewiesenes Layout überschreiben
  - **Ablage:** Alle noch nicht platzierten Artikel, alphabetisch sortiert; Artikel per Drag & Drop zwischen Ablage und Raster verschiebbar
  - **Tastenfarbe:** Wird pro Platzierung im Kassenlayout festgelegt (nicht am Artikel); dasselbe Produkt kann in verschiedenen Layouts unterschiedliche Farben haben
  - Wird die Rastergröße verkleinert und Artikel befinden sich auf weggefallenen Positionen, rutschen diese automatisch in die Ablage zurück
  - Artikelgruppen haben keinen Einfluss auf das Kassenlayout

- **Auswertungen:** Der Administrator hat Einsicht in folgende Übersichten; alle Auswertungsfunktionen bieten eine Veranstaltungsauswahl:
  - **Standardauswahl:** die aktuell laufende Veranstaltung; läuft keine, wird die zuletzt stattgefundene vorausgewählt
  - Auswertungen vergangener Veranstaltungen können jederzeit eingesehen werden
  - **Offene Positionen je Tisch** — alle bestellten aber noch nicht bezahlten Artikel, gruppiert nach Tisch
  - **Erstellte Rechnungen** — alle erzeugten Rechnungen der gewählten Veranstaltung; je Rechnung ist ein PDF-Download der Rechnung möglich
  - **Soll-Kassenstand** — zeigt je Kasse einen einzigen Betrag (Startgeld + Einnahmen − Entnahmen); Details über Einlagen/Entnahmen sind in der Kassenverwaltung einsehbar
  - **Stornos & kostenfreie Abgaben** — Übersicht aller stornierten und kostenfreien Positionen; gefiltert nach Veranstaltung und Bedienung; Spalten: Datum/Uhrzeit, Bedienung, Tisch, Artikel, Menge, Normalpreis, Stornogrund, Buchungsart (Storno / 100% Rabatt); dient der Kontrolle, dass die Funktion nicht missbraucht wird
    - Oben: Zusammenfassungstabelle mit Anzahl Artikel und Gesamtbetrag je Bedienung (gefiltert nach aktiver Filterauswahl)

- **Pflichtexporte (DSFinV-K):** Alle gesetzlich vorgeschriebenen Exporte der deutschen Finanzbehörden müssen unterstützt werden; der Export muss jederzeit auf Anforderung des Finanzamts bereitstehen. Da Hardware-TSE eingesetzt wird, muss der DSFinV-K-Export selbst implementiert werden:
  - **Einzelaufzeichnungsmodul** — Bonkopf (Vorgangsmetadaten) und Bonpositionen (Artikel, Beträge, MwSt.)
  - **Stammdatenmodul** — Unternehmens-, Kassen- und Umsatzsteuerinformationen je Kassenabschluss
  - **Kassendatenabschlussmodul** — Zahlarten, Geschäftsvorfalltypen, Tagesabschluss; der Tagesabschluss wird vom Administrator manuell angestoßen

- **Excel-Exporte:** Veranstaltungsauswahl wie bei den Auswertungen (Standard: laufende bzw. zuletzt stattgefundene Veranstaltung)
  - Export für einen einzelnen Tag (Datum wählbar)
  - Export für eine gesamte Veranstaltung
  - Beide Exporte enthalten jede einzelne Rechnungsposition als eigene Zeile mit folgenden Spalten:
    - Belegnummer (bei mehreren Positionen einer Rechnung in jeder Zeile wiederholt)
    - Datum und Uhrzeit der Rechnung
    - Tischnummer
    - Besteller (Name des Benutzers, der die Bestellung aufgenommen hat)
    - Kasse (Name der Kasse, über die die Bezahlung abgewickelt wurde)
    - Artikelname (Bontext)
    - Menge
    - Einzelpreis
    - Pfandbetrag
    - Umsatzsteuersatz
    - Gesamtbetrag der Position

- **Systemeinstellungen:**
  - **Zeitzone** — Zeitzone des Servers (relevant für Zeitstempel auf Bons, TSE und Auswertungen)
  - **Datum und Uhrzeit** — manuelle Einstellung oder Synchronisation mit NTP-Server
  - **TSE-Verbindung + Status** — Mount-Pfad, Client-ID und TimeAdmin-PIN der Swissbit USB-TSE sind manuell konfigurierbar (wirkt sofort, kein Neustart nötig); ein „TSE testen"-Button ruft den aktuellen Status live ab (Self-Test bestanden, Seriennummer, BSI-Zertifizierungs-ID, Restsignaturen, Zertifikatsablauf) — implementiert, siehe docs/TSE-Integration.md
  - **Kassensystem-Seriennummer** — automatisch generiert beim ersten Serverstart; nur angezeigt, nicht bearbeitbar; Format: `FairPOS-{Jahr}-{10-stellig, Großbuchstaben + Ziffern}`
  - **Server-Adresse (QR-Code)** — lokale Netzwerkadresse des Servers (z.B. `192.168.1.10` oder `fairpos.local`); wird für die Bon-URL im QR-Code verwendet; manuell konfigurierbar
  - **Backup-Verzeichnis** — Zieldverzeichnis für automatische tägliche Backups; konfigurierbar

- **Veranstaltungsverwaltung:** Veranstaltungen dienen ausschließlich als Auswertungszeiträume — sie haben keinen Einfluss auf den laufenden Betrieb
  - Attribute pro Veranstaltung:
    - Name
    - Startdatum und -uhrzeit
    - Enddatum und -uhrzeit
  - Buchungsdaten (Bestellungen, Rechnungen) entstehen unabhängig von Veranstaltungen; bei der Erstellung von Auswertungen werden sie über den Zeitraum der Veranstaltung zugeordnet
  - Veranstaltungen können auch rückwirkend für vergangene Zeiträume angelegt werden
  - Zeiträume mehrerer Veranstaltungen dürfen sich nicht überschneiden
  - Buchungsdaten bleiben dauerhaft im System gespeichert
  - **Buchungsdaten löschen:** Der Administrator gibt ein Datum an; alle Buchungsdaten bis einschließlich dieses Datums werden gelöscht
    - Vor der Ausführung wird eine deutliche Warnung angezeigt (Hinweis auf Unwiderruflichkeit und Verlust der Auswertungsmöglichkeit)
    - Der Administrator muss das Wort „löschen" manuell in ein Textfeld eintippen, um die Aktion zu bestätigen — versehentliches Auslösen wird damit verhindert

---

## Gesetzliche Anforderungen: TSE (Technische Sicherheitseinrichtung)

### Rechtliche Grundlage
- **§ 146a AO** + **KassenSichV**: Seit 01.01.2020 ist für jedes elektronische Kassensystem in Deutschland eine zertifizierte TSE Pflicht
- **GoBD**: Aufbewahrungspflicht aller Kassendaten: 10 Jahre
- **DSFinV-K**: Digitale Schnittstelle der Finanzverwaltung — Export muss jederzeit auf Anforderung des Finanzamts bereitstehen

### Was die TSE leistet
Die TSE signiert jeden Kassenvorgang kryptografisch in Echtzeit und protokolliert ihn unveränderbar (Kettenstruktur). Sie muss nach **BSI TR-03153** zertifiziert sein.

### Ablauf einer Transaktion
Das Kassensystem kommuniziert mit der TSE über drei API-Aufrufe:
1. `StartTransaction` — Vorgangsstart melden
2. `UpdateTransaction` — optionale Zwischenaktualisierung
3. `FinishTransaction` — Vorgang abschließen (Beträge, Positionen, Zahlart)

Die TSE gibt zurück:
- **Transaktionsnummer** (fortlaufend, eindeutig)
- **Signaturzähler** (fortlaufend über alle TSE-Vorgänge)
- **Prüfwert / Signatur** (kryptografischer Hash, 88 Zeichen)
- **Start- und Endzeitpunkt** des Vorgangs
- **TSE-Seriennummer**

### Zu signierende Vorgänge in FairPOS

Signiert wird nicht der „Kassenzustand", sondern **jeder fiskalisch relevante Vorgang** — auch solche ohne unmittelbaren Geldfluss (basiert auf § 146a AO, KassenSichV, DSFinV-K und AEAO zu § 146a). Für unsere zwei Kassenmodi gilt konkret:

**Vorgangstypen laut DSFinV-K, relevant für FairPOS:**
- `Kassenbeleg-V1` — Kassenbeleg mit Zahlung (auch bei Storno-Belegen)
- `AVBestellung` — Bestellung aufnehmen, noch nicht kassiert (fiskalisch relevant, aber ohne Zahlung)
- `AVSonstige` — sonstige Vorgänge (z.B. Storno einer offenen Bestellposition, kostenfreie Abgabe vor Kassierung)
- `AVBelegabbruch` — abgebrochener Beleg

**Szenario 1 — Bonkasse (einfacher Einkauf):**

| Vorgang | TSE-Transaktion? | processType | Beleg-Ausgabe |
|---|---|---|---|
| Kassiervorgang | **1× pro Beleg** | `Kassenbeleg-V1` | Kassenbeleg mit TSE-QR |
| Selbstabholerbon / Pfandbon | nein — interne Doubletten | — | ohne TSE-Angaben |

**Szenario 2 — Bedienungskasse (Bestellung → ggf. Storno → Kassieren mit Split):**

| Vorgang | TSE-Transaktion? | processType | Beleg-Ausgabe |
|---|---|---|---|
| Bestellung aufnehmen (offen, unbezahlt) | **1× pro Bestellvorgang** (nicht pro Position) | `AVBestellung` | interner Bestellbon (Küche/Theke), ohne TSE-QR nötig |
| Storno einer offenen Position | **1× pro Stornovorgang** | `AVSonstige` (mit Storno-Referenz) | interner Vermerk |
| Kassieren, ggf. mit Rechnungssplit | **1× pro Teilrechnung** | `Kassenbeleg-V1` | Kassenbeleg je Teilrechnung mit TSE-QR |
| Bonstorno (nachträglicher Storno eines abgeschlossenen Belegs) | **1× pro Stornobeleg** | `Kassenbeleg-V1` mit `receipt_type='cancellation'` und `cancels_invoice_id`-Referenz | Stornobeleg mit TSE-QR |

**Datenmodell-Konsequenzen** (bereits weitgehend im Schema angelegt):
- `invoice.tse_transaction_number`, `tse_signature_counter`, `tse_signature`, `tse_start_time`, `tse_end_time`, `tse_serial_number` — für Kassenbeleg-V1-Vorgänge (Kassiervorgang, Storno, nachträglicher Storno)
- `invoice.receipt_type` mit `'sales_receipt' | 'cancellation' | 'training'` und `cancels_invoice_id` für die Verkettung
- **Noch zu ergänzen:** eigene Entität `order` mit TSE-Feldern für `AVBestellung`-Vorgänge (aktuell werden Bestellpositionen ohne übergeordnete Order-Entität und ohne eigene TSE-Referenz erfasst)
- **Noch zu ergänzen:** eigene Entität `order_cancellation` mit TSE-Feldern für `AVSonstige`-Vorgänge (Storno offener Positionen), damit der Vorgang unabhängig vom späteren Kassierbeleg dokumentiert bleibt

**Signaturregeln (generisch, unabhängig von TSE-Hardware):**
- **Transaktionsnummer** und **Signaturzähler** sind global über alle Vorgangstypen fortlaufend und werden von der TSE vergeben.
- **Start-** und **Endzeitpunkt** kommen von der TSE (nicht vom Kassensystem), damit Manipulationen an der Systemzeit erkennbar bleiben.
- Ein Vorgang der zwischen Start und Finish abbricht, muss als `AVBelegabbruch` finalisiert werden — er bleibt in der TSE-Kette dokumentiert.
- Bei Beleg-Storno: der neue Stornobeleg referenziert den Original-Beleg über `cancels_invoice_id`; die Original-Signatur wird NICHT verändert (KassenSichV verlangt Unveränderbarkeit der Kette).

### Pflichtangaben auf dem Kassenbon (ab 01.01.2024)

Rechtsgrundlage: § 6 KassenSichV (Anforderungen an den Beleg) — nicht direkt
die DSFinV-K, die den späteren Prüfungs-Export (Task #13) regelt, aber
inhaltlich mit deren Bonkopf/Bonpos-Feldern überschneidend.

- Name und Anschrift des Unternehmens
- **Belegnummer** (fortlaufend, eindeutig; Präfix + Zähler)
- Datum der Belegausstellung
- Menge und Art der Waren/Leistungen
- Entgelt und Steuerbetrag (getrennt nach Steuersatz)
- Zahlungsart
- Seriennummer des Kassensystems
- Seriennummer des TSE-Sicherheitsmoduls
- TSE-Transaktionsnummer
- Signaturzähler
- Prüfwert (Signatur)
- Start- und Endzeitpunkt des Vorgangs
- *(empfohlen: QR-Code mit TSE-Daten für Maschinenlesbarkeit)*

**✅ Geprüft (August 2026):** Alle sieben Pflichtangaben aus § 6 Satz 1
KassenSichV sind in `ReceiptData` (receipt/types.ts) modelliert und werden von
`escpos-receipt.ts`/`pdf.ts` gedruckt — Firmenname/-anschrift, Belegdatum +
Vorgangsbeginn/-ende, Menge/Art der Positionen, Belegnummer, Entgelt +
Steuerbetrag je Steuersatz (`taxBreakdown`), Kassen- und TSE-Seriennummer,
Prüfwert (`tseSignature`) + Signaturzähler. Kein Feld fehlt; keine Code-Änderung
nötig. Quelle: [§ 6 KassenSichV](https://www.gesetze-im-internet.de/kassensichv/__6.html).

**Abgrenzung zur DSFinV-K (für Task #13, nicht den aktuellen Bon betreffend):**
Anhand der offiziellen DSFinV-K-Spezifikation v2.4 (Bonkopf/Bonkopf_USt/Bonpos/
Bonpos_USt) wurde das bestehende Datenmodell (`invoice`, `order_item`)
gegengeprüft. Die meisten Pflichtfelder sind bereits vorhanden (Belegnummer,
Kasse/Terminal-ID über `register_id`, Bediener über `order_item.user_id`,
Steuersatz-Aufschlüsselung deckt sich 1:1 mit `Bonkopf_USt`, „eine Zeile pro
Artikel-Einheit" macht `MENGE` trivial `1`, Storno über `cancels_invoice_id` +
gegenläufigen Zweitbeleg entspricht genau dem in der Spezifikation für
TSE-geschützte Systeme vorgesehenen Verfahren). Zwei konkrete Lücken für die
spätere Export-Implementierung, **nicht** für den Bon selbst:
1. **`BON_START`/`BON_ENDE`** müssen laut Spezifikation vom Aufzeichnungssystem
   selbst stammen und ausdrücklich **nicht** den TSE-Zeitstempeln entsprechen
   (relevant v.a. bei der Bedienungskasse, wo ein Tisch lange vor dem
   Kassieren geöffnet sein kann) — aktuell wird dafür kein eigener
   App-Zeitstempel gespeichert, nur `tse_start_time`/`tse_end_time`.
2. **`GV_TYP`** (Geschäftsvorfalltyp je Position, Anhang C der Spezifikation)
   wird aktuell nicht auf `order_item` abgebildet — z.B. müsste ein Pfandanteil
   ggf. als eigene Position mit eigenem GV_TYP exportiert werden, statt (wie
   aktuell für den Bon-Druck ausreichend) als Zuschlag auf der Artikelzeile.

**Kundendaten (KUNDE_NAME/KUNDE_ID/KUNDE_STRASSE/…):** DSFinV-K sieht optionale
Felder für den Leistungsempfänger vor (v.a. für B2B-Rechnungen). FairPOS erfasst
bewusst **keine** Kundendaten — anonymer Barverkauf an Vereinsfesten — diese
Felder bleiben im späteren Export leer. Das deckt sich mit der
Organisationsvorgabe, niemals personenbezogene Daten von Kunden zu verwenden.
Quelle: [DSFinV-K Version 2.4](https://kassensichv.com/downloads/DSFinV-K-Vers-2-4.pdf).

### TSE-Optionen

#### Hardware-TSE (USB)
- **Empfehlung:** Swissbit USB-Stick (8 GB, 5 Jahre Laufzeit)
- **Preis:** ~185–205 € einmalig; günstigste Handler: gebongt24.de, das-kassensystem.shop, sellersupply.de (Preisvergleich lohnt sich — Unterschied bis zu 100 € für dasselbe Produkt)
- **Laufende Kosten:** keine
- **Laufzeit:** 5 Jahre ab Herstellung (nicht ab Inbetriebnahme) — ein Stick der 2 Jahre im Lager lag hat noch 3 Jahre Restlaufzeit
- **Mindestnutzung:** keine vorgeschrieben — 1 Wochenende/Jahr ist problemlos
- **Internet:** nicht erforderlich
- **Achtung beim Kauf:** Auf „5 Jahre ab Herstellung" achten, nicht auf festes Ablaufdatum (ältere Epson-Modelle hatten feste Daten bis 2025/2026)

**fiskaltrust Middleware zur TSE-Anbindung:**

> ✅ **Geklärt (August 2026):** Der Verdacht hat sich bestätigt — laut Rückmeldung von fiskaltrust ist der produktive Betrieb für uns **zu teuer** (Details zum Angebot nicht dokumentiert, da nicht mehr relevant für die Entscheidung). fiskaltrust ist damit **verworfen**. Alle „kostenlos"-Angaben unten sind nur noch als historischer Kontext zu lesen, nicht als gültige Option.

- **Software (Open Source, EUPL 1.2):** die Middleware-Codebasis selbst ist kostenlos — stellt lokale REST/gRPC-API bereit, übernimmt TSE-Kommunikation mit Swissbit oder Epson; kein eigenes Java-SDK nötig. Ob der produktive Betrieb ohne kostenpflichtigen Cloud-Vertrag möglich ist: **ungeklärt, s.o.**
- **Sorglos-Paket (kostenpflichtig):** Bundle aus Middleware + Cloud-TSE + Archiv + Kassenmeldung als Jahresabo — nur relevant wenn fiskaltrust auch die TSE bereitstellen soll
- **Freemium Bundle (Option, ggf. nicht vollständig kostenlos — s.o.):** alternative Cashbox-Tarifstufe von fiskaltrust ([Produktseite](https://fiskaltrust.eu/de-de/partner/product/bundle/freemiumbundle/)). Laut Produktseite: Open-Source-Middleware unter MIT-Lizenz; Fair-Use-Grenze 10.000 Belege/Monat pro Verkaufsstelle; Audit-/Journal-Export (DSFinV-K-relevant), digitale Quittungen, Offline-Fallback via MQTT-Broker, Portal-Selbstverwaltung. Kein SLA / kein persönlicher Support. **Ob die Portal-/Cashbox-Nutzung selbst gebührenfrei ist, ist nicht verifiziert.** Vor Einsatz zusätzlich prüfen, ob Swissbit USB-TSE im Freemium-Tarif als Hardware-Backend zugelassen ist.
- **Carefree Bundle (Option, Cloud-TSE):** Komplett Cloud-basierte Lösung — keine USB-Hardware nötig. 300–499 €/Jahr pro Standort, bis zu 10.000 Belege/Monat. Inklusive Cloud-Archivierung (10 Jahre), CloudCashBox-Verwaltung, Audit-Reports, digitalen Quittungen, Offline-Fallback. Voraussetzung: Internet am Veranstaltungsort. Für FairPOS-Vereinsfeste über 5 Jahre teurer als lokale Swissbit-Variante, daher nur sinnvoll wenn (a) Internet sicher verfügbar, (b) Hardware-Wartung vermieden werden soll oder (c) revisionssichere Cloud-Archivierung gewünscht ist.
- **Für FairPOS relevant, sofern die obige Klärung positiv ausfällt:** Kostenlose Middleware-Software + separat gekaufte Swissbit USB-TSE → keine Middleware-Kosten. **Falls die Klärung ergibt, dass eine kostenpflichtige Cashbox zwingend ist, muss der Kostenvergleich mit der Epson-nativen Option (unten) neu bewertet werden.**
- **Architektur:** `Backend → fiskaltrust Middleware → Swissbit USB-TSE`

**Wie fiskaltrust die Swissbit-TSE technisch anspricht** (recherchiert Juli 2026, [fiskaltrust interface-doc](https://github.com/fiskaltrust/interface-doc/blob/master/doc/middleware-de-kassensichv/operation-modes/scu/swissbit.md)): über das **von der TSE emulierte Dateisystem** (USB-Mass-Storage), konfiguriert per `devicePath` (z.B. Laufwerksbuchstabe unter Windows). **Kein Socket/TCP** — das widerlegt eine frühere, unverifizierte Annahme in diesem Dokument, Swissbit ginge „vermutlich auch über einen lokalen Socket". Praktisch heißt das: fiskaltrust übernimmt diese dateibasierte Kommunikation vollständig für uns — genau der Teil, der bei einer Eigenintegration (s.u.) aufwändig wäre.

#### Direkte Swissbit-SDK-Integration über CLI-Subprozess (Option, ohne fiskaltrust)

**Status: verifiziert anhand des echten Swissbit-SDK** (User hat `Swissbit_TSE_v6.0.0_LAN_TSE_v2.0.13` lokal bereitgestellt, August 2026 geprüft — löst die vorherige unverifizierte Einschätzung ab). Enthält u.a.:
- `sdk/c/linux64/bin/wormCli` + `libWormAPI.so` — **vorkompilierte 64-Bit-ELF-Binaries für Linux**, sofort startklar, kein eigener Build nötig
- `sdk/examples/wormCli/src/wormCli.cpp` — vollständiger Referenz-Quellcode (871 Zeilen) der CLI-Beispielimplementierung
- `sdk/c/include/WormDLL/WormDLL.h` — kommentierter C-API-Header mit allen Funktionssignaturen

**Architektur — lokal, ohne Netzwerk:**
- `worm_init(mountPoint)` verbindet zur TSE über einen **lokalen Dateisystem-Mount-Pfad** (unter Linux: Pfad ohne abschließenden Slash) — bestätigt: kein Socket, kein TCP für den lokalen Modus.
- Swissbit bietet zusätzlich einen **LAN-Modus** (`worm_init_lan(url, apiToken)`, HTTPS + API-Token) — das ist Swissbits eigenes Pendant zu Epsons EPS TSE Server, für unser Ein-Server-Setup aber nicht nötig.

**CLI-Kommandos dieser Beispielimplementierung decken unseren Bedarf ab:**
- `startTransaction PROCESS_DATA`, `updateTransaction TRANSACTION_NUMBER PROCESS_DATA`, `finishTransaction TRANSACTION_NUMBER PROCESS_DATA` — liefert Timestamp, Transaktionsnummer, Signaturzähler, Signatur, TSE-Seriennummer
- `info` — **bereits strukturiertes JSON** mit allen TSE-Metadaten (`hasPassedSelfTest`, `remainingSignatures`, `maxSignatures`, `certificateExpirationDate`, `tseSerialNumber`, `startedTransactions`, …) — direkt nutzbar für die geplante TSE-Status-Anzeige in den Systemeinstellungen
- `tseSetup`, `tseRunSelfTest`, `updateTime`, `listRegisteredClients`, `exportTar` (Rohdaten-TAR — DSFinV-K-Formatierung bleibt wie erwartet unsere Aufgabe, Task #13)

**Umsetzungsidee (User-Vorschlag, August 2026):** `wormCli` (ggf. leicht angepasste Fork mit JSON-Output auch für die Transaktions-Kommandos, da die Referenzimplementierung dafür aktuell Klartext statt JSON ausgibt — kleiner Patch, da der Code intern bereits `nlohmann::json` nutzt) als **Subprozess aus Node.js aufrufen** (`child_process.execFile`), statt einen eigenen Dienst/Daemon zu betreiben oder native N-API-Bindings zu bauen. Vorteil: kein zusätzlicher Service zu warten; Overhead durch Prozessstart pro Aufruf ist bei unserem Transaktionsvolumen (Vereinsfest, keine Hochlast) vernachlässigbar.

**Wichtige Einschränkung — Concurrency (aus `WormDLL.h`, wörtlich):** „The Swissbit TSE hardware can not be operated from multiple threads or processes at the same time, as it allows only one command to be active at any given time and rejects all further commands." → **Alle CLI-Aufrufe müssen serialisiert werden** (eine Async-Queue im Backend, analog zur bestehenden atomaren Belegnummer-Vergabe) — es darf nie mehr als ein `wormCli`-Prozess gleichzeitig mit derselben TSE sprechen.

**Lizenz — geklärt, unproblematisch:** „Device Driver Distribution Agreement v1.1" (im SDK enthalten): **royalty-free, perpetual, worldwide** Lizenz zur Nutzung „für die Entwicklung eigener Treiber-Software in Verbindung mit Swissbit-Produkten". Keine Kosten für unseren Eigenbetrieb. (Zusätzliche Distributionsauflagen gelten nur, falls wir die Treiber-Software an Dritte weitergeben würden — für FairPOS als Eigenbetrieb irrelevant.)

**Aufwand-Einordnung ggü. vorheriger Annahme:** Diese Variante ist **einfacher als ursprünglich angenommen** — kein N-API/FFI-Binding nötig, da wir nicht die Library direkt einbinden, sondern das fertige CLI-Tool als Subprozess aufrufen. Verbleibender Aufwand: kleiner JSON-Output-Patch an `wormCli.cpp`, Serialisierungs-Queue im Backend, TSE-Lifecycle-Logik (Setup, Self-Test-Monitoring, Zeit-Sync) — vergleichbar mit dem, was Epsons natives Protokoll an Eigenentwicklung verlangt hätte, aber ohne Netzwerk-Protokoll-Implementierung und ohne Windows-Abhängigkeit irgendeiner Art.

#### Epson-natives TSE-Protokoll (Option, ohne kommerzielle Middleware)

Epson bietet als Alternative zu fiskaltrust eine eigene, herstellerspezifische Integration an ([TSE Developer's Guide, Rev. 1.0.1](../docs/GermanFiscal_TSE_Developers_Guide_en_RevB.pdf)). Geprüft, weil auf den ersten Blick „ohne kommerzielle Middleware" verlockend klingt — Abwägung unten zeigt aber erheblichen Mehraufwand.

**Architektur:**
- Ein „TSE-Host" hält die eigentliche TSE-Hardware und stellt sie übers Netzwerk bereit. Drei Varianten:
  1. TSE im Bondrucker eingebaut (TM-m30/II, TM-T88VI-iHub) — koppelt TSE-Verfügbarkeit an Drucker-Verfügbarkeit, für uns unattraktiv (siehe unten)
  2. **EPS TSE Server** — eigenständige Netzwerk-Appliance (SEH, 3- oder 8-Port), hält die TSE unabhängig vom Drucker
  3. TSE an Windows-PC über Epson-Treiber — nur Windows, für unser Linux-Setup irrelevant
- Protokoll: **ePOS Device XML** — kein REST/HTTP, sondern rohes TCP-Socket (Port 8009 unverschlüsselt / 8143 SSL), XML-Umschlag mit eingebettetem JSON-Payload, NULL-terminierte Nachrichten. Laut Hersteller plattformunabhängig inkl. Linux, keine SDK-Installation nötig — „anything that can open a socket is supported"
- Funktionsumfang: `StartTransaction`/`UpdateTransaction`/`FinishTransaction`, Challenge-Response-Login (SHA256-Hash aus Challenge + Shared Secret), `ArchiveExport`/`GetExportData`/`FinalizeExport` für DSFinV-K-Rohdaten — inhaltlich deckungsgleich mit dem, was fiskaltrust abstrahiert

**Abwägung gegenüber fiskaltrust + Swissbit USB:**

| | Epson-natives Protokoll | fiskaltrust + Swissbit USB |
|---|---|---|
| Middleware-/Betriebskosten | **0 € gesichert** — Protokoll gehört zum Gerät, kein Cloud-Portal-Zwang erkennbar in der Herstellerdokumentation | **ungeklärt** — Middleware-Software kostenlos, aber ob die produktive Cashbox-Registrierung im fiskaltrust-Portal kostenpflichtig ist, ist NICHT verifiziert (s. Warnhinweis oben) |
| Hardware | Epson-Drucker mit TSE oder EPS TSE Server-Appliance | Swissbit USB-Stick (~185–205 €) |
| TSE-Protokoll implementieren | **selbst** (Login, PIN/PUK-Setup, Self-Test-Handling, Export-Funktionen) | übernimmt fiskaltrust vollständig |
| DSFinV-K-Formatierung (Task #13) | **selbst** — Rohdaten aus `ArchiveExport` sind unstrukturiert (Base64-TAR) | übernimmt fiskaltrust |
| Vendor-Lock | ja, an Epson-Hardware | nein — Middleware abstrahiert Swissbit/Epson/Cloud austauschbar |
| Architektur-Entkopplung TSE↔Drucker | nur bei EPS TSE Server gegeben, nicht bei TSE-im-Drucker | immer (TSE ist eigenständiges USB-Gerät am Server) |

**Einschätzung, final (August 2026):** fiskaltrust ist zu teuer und damit verworfen (s. Warnhinweis oben). Epson-natives Protokoll bleibt trotzdem **nicht** die gewählte Option — die direkte Swissbit-SDK-Integration über CLI-Subprozess (unten) ist für unseren Stack einfacher zu integrieren und ohne Hardware-Vendor-Lock. Epson-Hardware wird nicht weiterverfolgt.

**Bezug zur direkten Swissbit-SDK-Integration (oben) — final, August 2026:** Swissbit liefert ein fertiges, vorkompiliertes CLI-Tool (`wormCli`) für Linux x64, das sich als Subprozess aus Node.js aufrufen lässt — ohne native Bindings, ohne Netzwerk-Protokoll-Implementierung. Das ist für unseren Stack einfacher als Epsons TCP/JSON-Protokoll (kein eigener Socket-Client nötig) und ohne Hardware-Vendor-Lock. Mit fiskaltrust verworfen (s. Warnhinweis oben) bleibt **Swissbit USB-TSE + direkte CLI-Integration die gewählte Option für Task #4** — Epson-natives Protokoll bringt keinen Vorteil mehr und wird nicht weiterverfolgt.

#### Cloud-TSE
Es gibt 3 BSI-zertifizierte Cloud-TSE-Anbieter (Stand Mai 2026); alle erfordern permanente Internetverbindung:

**fiskaly SIGN DE**
- **Preis:** ~10–15 €/Monat (120–144 €/Jahr); monatliche Kündigung möglich → bei 1 WE/Jahr nur ~10–30 €/Jahr
- **Laufzeit:** keine Mindestlaufzeit bekannt; Direktvertrag oder über Reseller
- **API:** REST, exzellent dokumentiert (developer.fiskaly.com), SDKs für mehrere Sprachen, OpenAPI/Swagger
- **Sandbox:** kostenlos und unbegrenzt nutzbar für Entwicklung/Tests (erzeugt steuerlich ungültige Signaturen)
- **BSI-Zertifikat:** bis 2033 (längste Laufzeit aller Anbieter)
- **DSFinV-K-Export:** wird von fiskaly bereitgestellt — keine eigene Implementierung nötig
- **Hinweis:** Deutsche Fiskal gehört seit April 2025 zu fiskaly
- **Quellen:** kassensichv.net, fiskaly.com, HKSoftware-Reseller (~143 €/Jahr), WaiterOne-Blog (~10–15 €/Monat)

**Swissbit Cloud TSE 2 Typ S**
- **Preis:** 200 € / 3 Jahre (~67 €/Jahr) oder 311 € / 5 Jahre
- **Laufzeit:** 3 oder 5 Jahre Festlaufzeit
- **Inkludierte Signaturen:** 2.500 — reicht bei 1 WE/Jahr mit ~200 Transaktionen für viele Jahre
- **API:** REST, Zugang über Distributoren (Jarltech, Partner Tech Europe)
- **BSI-Zertifikat:** bis ~2029
- **Quellen:** swissbit.com, jarltech.com/de/swissbit-tse-cloud

**Deutsche Fiskal / Fiskal Cloud**
- **Preis:** ~149 €/Jahr (über Reseller Fiscalog)
- **Laufzeit:** Jahresvertrag
- **Hinweis:** Seit April 2025 Teil von fiskaly — Roadmap und Weiterentwicklung unklar; derzeit nicht empfohlen
- **Quellen:** fiscalog.eu/angebot, deutsche-fiskal.de

**Epson:** bietet keine Cloud-TSE an (ausschließlich Hardware)

**Empfehlung für 1 Wochenende/Jahr:**
- Günstigste Option: fiskaly mit monatlicher Kündigung (~10–30 €/Jahr) + DSFinV-K inklusive
- Zweitbeste Option: Swissbit Cloud Typ S (200 € / 3 Jahre, wartungsarm)

**Entscheidung:** Hardware-TSE (Swissbit USB-Stick). Cloud-TSE aufgrund höherer laufender Kosten verworfen. Ursprünglich war eine fiskaltrust-Middleware als TSE-Adapter vorgesehen — **verworfen, August 2026, zu teuer** (siehe TSE-Optionen-Abschnitt oben); stattdessen direkte Swissbit-SDK-Integration über CLI-Subprozess (`native/tse-cli`), siehe docs/TSE-Integration.md.

---

## Technologie-Stack

| Bereich | Technologie | Begründung |
|---|---|---|
| Backend | Node.js + TypeScript + Fastify | Läuft nativ auf Linux, geringer Ressourcenverbrauch, TypeScript für Typsicherheit |
| Frontend | SvelteKit + TypeScript (SPA) | PWA-Unterstützung, schlanke Bundle-Größe, schnell auf Mobilgeräten; als statische Dateien gebaut (`adapter-static`), von Fastify ausgeliefert — kein separater Frontend-Server |
| Datenbank | PostgreSQL | Robust, open source, ACID-transaktionssicher, komplexe Abfragen für DSFinV-K |
| Echtzeit | Server-Sent Events (SSE) | Einweg-Push vom Server zum Browser reicht für alle Anwendungsfälle (Tischstatus, Druckwarteschlange); kein bidirektionaler Kanal nötig; keine Bibliothek erforderlich |
| Druckdienst | Node.js Worker-Prozess | ESC/POS über TCP/IP via `@node-escpos/core`; via PostgreSQL LISTEN/NOTIFY getriggert |
| TSE-Adapter | Swissbit-SDK, eigener CLI-Subprozess (`native/tse-cli`) | Ursprünglich fiskaltrust Middleware vorgesehen — **verworfen (August 2026, zu teuer)**. Stattdessen minimaler, selbst geschriebener C++-Wrapper um das offizielle Swissbit-SDK, vom Backend per `child_process.execFile` aufgerufen; kein separater Container/Dienst. Details: docs/TSE-Integration.md |
| Deployment | Docker Compose | Alle Dienste als Container, einfache Installation auf Linux-Server |
| Projektstruktur | Monorepo | `packages/frontend`, `packages/backend`, `packages/shared` (gemeinsame TypeScript-Typen); ein Repository, ein Docker-Compose-File |

### Komponentenübersicht

```
┌──────────────────────────────────────────────────┐
│                  Linux Server                    │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │           Fastify / Node.js              │   │
│  │  - REST API                              │   │
│  │  - Statische SvelteKit-Dateien (SPA)     │   │
│  │  - SSE-Endpunkt (/events)                │   │
│  │  - Print Worker (integriert)             │   │
│  └──────────────┬───────────────────────────┘   │
│                 │                                │
│       ┌─────────┴──────────┐                    │
│       │                    │                    │
│  ┌────▼─────────┐  ┌───────▼──────────────┐    │
│  │  PostgreSQL  │  │  native/tse-cli       │    │
│  │  (Datenbank) │  │  (Subprozess)         │    │
│  │              │  │  Dateisystem → USB-TSE│    │
│  └──────────────┘  └──────────────────────┘    │
└──────────────────────────────────────────────────┘
```

**Vereinfachungen gegenüber früheren Überlegungen:**
- Print Worker läuft im selben Node.js-Prozess wie die API (kein separater Container)
- SSE statt WebSockets — kein Upgrade-Handshake, kein Reconnect-Protokoll, native Browser-Unterstützung
- Swissbit USB-TSE über selbst geschriebenen CLI-Subprozess (`native/tse-cli`) statt fiskaltrust-Middleware (verworfen, zu teuer) — kein dritter Container, kein natives Node-Addon
- SvelteKit-SPA wird von Fastify mitausgeliefert — ein einziger HTTP-Dienst nach außen

**TSE-Adapter:** `native/tse-cli` kapselt die Swissbit-SDK-Aufrufe hinter einem schlanken JSON-Contract (siehe docs/TSE-Integration.md) — ein späterer Wechsel des TSE-Anbieters würde nur dieses eine Modul betreffen, der Rest der Anwendung bliebe unverändert.

### Coding-Konventionen

- **Sprache der Bezeichner:** Alle Bezeichner im Code und in der Datenbank (Tabellennamen, Spaltennamen, Variablen, Funktionen, Klassen, Typen) sind **englisch**. Benutzeroberfläche und Dokumentation bleiben deutsch.
- **Kommentare:** Jede Funktion, jede Methode und jedes Objekt (Klasse, Interface, Typ) erhält einen Kommentar. Mindestanforderung: ein erklärender Satz direkt oberhalb der Definition.

---

## Nicht-funktionale Anforderungen / Architektur

### Druckarchitektur
- **Trennung von Dokumenterstellung und Druck:** Bestellbons werden zunächst als Druckauftrag in eine Warteschlange geschrieben; ein separater Druckerdienst läuft im Hintergrund und sendet die Aufträge an den jeweiligen Drucker
- **Offline-Toleranz:** Ist ein Drucker nicht erreichbar, verbleiben die Aufträge in der Warteschlange und werden automatisch gedruckt, sobald der Drucker wieder online ist
- **Druckerrouting:**
  - Ist beim Artikel ein Drucker angegeben → Bestellung wird auf diesem Drucker gedruckt
  - Ist kein Drucker angegeben → Bestellung wird auf dem Standarddrucker gedruckt

### Receipt-Renderer
Rechnungsdaten werden einmal strukturiert gespeichert und von zwei unabhängigen Renderern ausgegeben:

```
Rechnungsdaten (strukturiertes Objekt)
        │
        ├──► ESC/POS-Renderer → Bondrucker (via Print Worker)
        │
        └──► PDF-Renderer    → QR-Code / UI-Vorschau / Export
```

- **ESC/POS-Renderer:** erzeugt Druckbefehle für den Bondrucker (`@node-escpos/core`)
- **PDF-Renderer:** erzeugt ein PDF aus einem HTML-Template (`puppeteer` oder `pdfkit`); wird verwendet für den QR-Code auf dem Kassierungsdialog, die UI-Vorschau sowie zukünftige Export-Funktionen
- Beide Renderer arbeiten auf denselben Quelldaten — Layout und Inhalt eines Bons müssen nur einmal definiert werden

#### Zwei getrennte PDF-Endpunkte (Kunde vs. Admin)

Die PDF-Auslieferung ist bewusst in zwei Endpunkte aufgeteilt, weil sie zwei verschiedene Konsumenten mit unterschiedlichen Zugriffsmodellen bedienen:

- **`GET /receipt/:token`** — *öffentlich, token-authentisiert.* Das ist der Pfad, den der Kunde aus dem QR-Code aufruft. Die URL kann hinter einem externen Reverse-Proxy enden (damit Kundengeräte ohne WLAN-Beitritt darauf zugreifen können); die Server-Adresse für den QR-Code ist daher in den Systemeinstellungen konfigurierbar. Schutz: der Token ist zufällig und einmalig pro Rechnung.
- **`GET /api/admin/invoices/:id/pdf`** — *Admin-Session-geschützt.* Das ist der Pfad, den die Admin-UI für „PDF anzeigen" in der Rechnungs-Auswertung verwendet. Adressiert wird per Invoice-ID; Zugriffsschutz ist die Admin-Session, nicht ein Token. **Wichtig:** die Admin-UI darf den Token-Pfad **nicht** verwenden, weil dieser unter Umständen einen anderen Hostnamen / Proxy hat als die Admin-API.
- **`GET /api/admin/print-jobs/:id/pdf`** — *Admin-Session-geschützt, nur für `receipt`-Jobs.* Bietet eine PDF-Vorschau direkt aus der Druckwarteschlange; löst über `reference_id` die Quell-Rechnung auf. Für Bestellbons / Z-Bon / Testdrucke gibt es derzeit keine PDF-Vorschau.

### Druckwarteschlange
- Druckaufträge werden in der PostgreSQL-Datenbank in einer Tabelle `print_jobs` gespeichert
- Felder: ID, Drucker, ESC/POS-Inhalt, Status (`pending` / `printing` / `done` / `failed`), Erstellungszeitpunkt, Anzahl Versuche, Fehlertext
- Druckauftrag und Rechnung werden **in derselben Datenbanktransaktion** angelegt (atomar)
- Der Print Worker wird via **PostgreSQL LISTEN/NOTIFY** sofort benachrichtigt, wenn ein neuer Auftrag eingeht
- Bei Druckerausfall: Status bleibt `pending`, Worker wiederholt den Versuch periodisch
- Die Admin-Oberfläche liest die Warteschlange direkt aus der Datenbank

### Bestelldatenmodell

**Einheitliches Modell für Bonkasse und Bedienungskasse**

Beide Kassentypen arbeiten intern mit demselben Datenmodell. Auch an der Bonkasse wird eine `Bestellung` angelegt — sie wird jedoch sofort beim Kassiervorgang als bezahlt markiert. Der einzige Unterschied ist der Zeitpunkt der Bezahlung, nicht die Datenstruktur.

Vorteile:
- Alle Auswertungen, DSFinV-K-Exporte und TSE-Transaktionen laufen über denselben Codepfad
- Stornologik ist kassentypunabhängig
- Keine Sonderfälle im Backend für Bonkasse vs. Bedienungskasse

**Ein Datensatz pro Artikeleinheit (Option C)**

Eine `BestellungPosition` repräsentiert immer genau eine Einheit eines Artikels — nicht eine Menge. Drei Bier erzeugen drei separate `BestellungPosition`-Datensätze.

Vorteile:
- Einzelne Positionen können unabhängig storniert oder bezahlt werden
- Storno auf Einheitenebene ohne Mengensplitting
- Einfaches Zählen über `COUNT(*)` statt Mengenberechnungen

Darstellung in der UI: Die Einzeldatensätze werden nach Artikel + Produktoptionen gruppiert und als eine Zeile mit Menge angezeigt.

**Datenkopie bei Bestelleingang (Immutabilität)**

Beim Anlegen einer `BestellungPosition` werden alle relevanten Artikeldaten und Kategorieinformationen in die Position kopiert:
- Artikelname
- Artikelkategorie (Name, Steuersatz)
- Preis
- Steuersatz
- Gewählte Produktoptionen (Name + Preisaufschlag)

Spätere Änderungen am Artikelstamm oder an Kategorien (Umbenennung, Preisänderung, Steuersatzänderung, Optionsänderung) haben keinen Einfluss auf bereits erfasste Bestellungen. Die Position ist ein unveränderlicher Schnappschuss zum Bestellzeitpunkt.

**Aggregation beim Bestellbondruck**

Obwohl die Datenhaltung positionsweise erfolgt, werden Bestellbons aggregiert gedruckt:

1. Positionen werden nach **Drucker UND Artikelgruppe** sortiert — je Kombination ein eigener Bon. Wenn zwei Artikelgruppen denselben Drucker teilen (z.B. Küche druckt Speisen und Snacks), erhält die Küche trotzdem zwei physisch getrennte Bons. So bleiben Stationen sauber getrennt und Artikel verschiedener Gruppen lassen sich an der Ausgabe nicht vertauschen. Der Gruppenname erscheint als Untertitel direkt unter dem Tisch-Header.
2. Innerhalb eines Bons werden Positionen nach **identischen Attributen** (Artikel + Produktoptionen) gruppiert
3. Jede Gruppe erscheint als eine Zeile mit der jeweiligen Stückzahl

Beispiel: 3× `BestellungPosition{Artikel: Bier, Optionen: []}` → eine Zeile „3× Bier" auf dem Bestellbon.

An der Bonkasse werden keine Bestellbons gedruckt — die Bestellung ist sofort abgeschlossen und der Kassierbon wird direkt ausgegeben.

---

## Funktionale Anforderungen — Kassenpersonal (Kasse vom Typ Bonkasse)

### Grundprinzip
Die Bonkasse ist für Selbstabholer: Artikel werden sofort kassiert und ein Bon wird direkt gedruckt. Es gibt kein "Bestellung aufnehmen und später kassieren". An der Bonkasse werden keine Bestellbons gedruckt — nur Selbstabholerbons für den Kunden.

### Selbstabholerbon-Druckregeln (Bonkasse)
Beim Klick auf „Kassieren" werden **immer** Selbstabholerbons gedruckt — unabhängig davon, ob der Kunde zusätzlich eine Rechnung drucken oder per QR-Code scannen möchte. Diese Regeln unterscheiden sich bewusst von der Bedienungskasse:

- **Ein Bon je Artikel-Einheit** — keine Gruppierung identischer Artikel auf einem Bon. Bei 3× Bier werden 3 separate Selbstabholerbons gedruckt, damit der Kunde sie an der Ausgabe einzeln einlösen kann.
- **Drucker = der Kasse zugeordnete Drucker** (Fallback: Standarddrucker). Der pro Artikel hinterlegte Drucker wird an der Bonkasse **nicht** verwendet — im Gegensatz zur Bedienungskasse, wo Bestellbons artikelweise auf den jeweils konfigurierten Artikel-Drucker (z.B. Küche/Theke) gehen.
- **Pfand-Behandlung** je Einheit (steuert über das Artikel-Stammdatenflag „Pfandbon separat drucken"):
  - Kein Pfand (`deposit_price` leer/0) → ein Bon mit dem Artikel, ohne Pfandzeile.
  - Pfand gesetzt, Flag aus → ein Bon mit Artikel- und „+ Pfand X.XX EUR"-Zeile.
  - Pfand gesetzt, Flag an → zwei Bons: ein Artikelbon (ohne Pfandzeile) und ein separater Pfandbon (`PFAND`-Header). So bleiben Artikel und Pfand bei Ausgabe an unterschiedlichen Theken trennbar.

### Bestellansicht
- **Artikelraster:** Konfiguriertes Kassenlayout mit farbigen Artikeltasten
  - Tastendruck auf Artikel → Menge wird um 1 erhöht (alternativ: + -Taste in der Bestellliste)
  - Jede Taste zeigt den Artikelnamen und hat die im Kassenlayout für diese Platzierung hinterlegte Farbe
- **Bestellliste (oben):** Zeigt alle aktuell erfassten Positionen
  - Pro Position: Menge (− / +), Artikelname, Einzelpreis
  - Menge auf 0 reduzieren → Artikel verschwindet aus der Liste
  - Farbiger Punkt pro Position (entspricht der Tastenfarbe des Artikels im aktiven Kassenlayout)
- **Gesamtpreis:** Wird laufend aktualisiert bei jeder Änderung der Bestellliste
- **"Kassieren"-Button:** Öffnet einen Rechnungsdialog
  - Die Rechnung wird als QR-Code angezeigt (zum Scannen durch den Kunden); der QR-Code enthält eine URL zum lokalen FairPOS-Server im Format `http://{server-adresse}/receipt/{token}`
  - Der Dialog bietet zwei Abschluss-Aktionen:
    - **„Rechnung drucken"** — druckt den Bon auf dem der Kasse zugeordneten Drucker und schließt den Vorgang ab
    - **„Rechnung per QR Code gescannt"** — bestätigt, dass der Kunde den QR-Code gescannt hat, und schließt den Vorgang ab
  - Nach Abschluss des Vorgangs (egal welche Aktion) wird die Bestellliste automatisch geleert — die Kasse ist sofort für den nächsten Kunden bereit
  - Wechselgeldberechnung ist nicht vorgesehen
  - Negative Gesamtbeträge (z.B. bei Leergutrückgabe) werden nicht gesondert behandelt — der Dialog verhält sich identisch zu positiven Rechnungen; der negative Betrag wird bar an den Kunden ausgezahlt
  - Aktuell nur Barzahlung; Zahlungsartauswahl ist für die Zukunft geplant

---

## Funktionale Anforderungen — Bedienung (Kasse vom Typ Bedienungskasse)

### Schritt 1: Tischauswahl (Saalplan)
- Nach dem Login wird der Bedienung der Saalplan angezeigt
- Tische mit offener Rechnung werden farblich hervorgehoben (andere Farbe als freie Tische)
- Nach Auswahl eines Tisches:
  - **Tisch ohne offene Rechnung** → direkt zur Bestellansicht (Schritt 2)
  - **Tisch mit offener Rechnung** → Auswahl: „Bestellen" (→ Schritt 2) oder „Kassieren" (→ Schritt 3)

### Schritt 2: Bestellansicht
- Identischer Aufbau wie die Bestellansicht der Bonkasse (Artikelraster + Bestellliste + Gesamtpreis)
- Der große Button heißt **„Bestellen"**
- **Bestellliste:** hat eine feste Höhe — der Bereich scrollt intern, verdrängt aber nicht das Artikelraster
- Pro Position in der Bestellliste: − / + Buttons zur Mengenanpassung; Menge auf 0 → Artikel verschwindet
- **Produktoptionen:** Hat ein Artikel Optionen, öffnet sich nach dem Antippen ein Auswahldialog
  - Mehrfachauswahl möglich, Auswahl optional
  - Derselbe Artikel kann mit unterschiedlichen Optionen mehrfach in der Bestellliste erscheinen (z.B. 1× Pommes mit Ketchup + 1× Pommes mit Mayo = zwei separate Positionen)
  - Artikel ohne Optionen werden direkt zur Bestellliste hinzugefügt (wie an der Bonkasse)
- Klick auf „Bestellen":
  - Bestellung wird dem Tisch hinzugefügt
  - Bestellbons werden gedruckt inkl. der gewählten Optionen (Drucker pro Artikel konfiguriert, Fallback: Standarddrucker)
  - Danach: Rückkehr zur Tischaktionsauswahl (Schritt 2b) im Kontext des gewählten Tisches

### Schritt 2b: Tischaktionsauswahl
- Erscheint in zwei Fällen:
  - Nach dem Bestellen (Rückkehr aus Schritt 2)
  - Bei Auswahl eines Tisches mit offener Rechnung im Saalplan
- Optionen:
  - **„Bestellen"** → zur Bestellansicht (Schritt 2)
  - **„Kassieren"** → zum Kassiervorgang (Schritt 3)
  - **„Zurück zum Saalplan"** → zurück zu Schritt 1

### Schritt 3: Kassieren
- Die Bedienung sieht alle offenen Positionen des Tisches, gruppiert nach Artikel + Optionen
- Pro Gruppe: − / + Buttons zur Auswahl der Menge, die auf diese Rechnung kommen soll (0 bis Gesamtmenge der Gruppe); Standard: volle Menge vorausgewählt
- **„Zurücksetzen"-Button** setzt alle Mengen auf 0 — damit kann die Bedienung gezielt einzelne Artikel per + hinzufügen
- Damit können Bestellungen auf mehrere Rechnungen aufgeteilt werden (z.B. von 3 Bier nur 2 kassieren; 1 bleibt offen am Tisch)
- Zwei Aktions-Buttons nach der Positionsauswahl:
  - **„Kassieren"** — Buchung + Öffnen des Zahlungsdialogs (QR-Code + „Rechnung drucken"); die ausgewählten Artikel werden am Tisch als bezahlt markiert
  - **„Stornieren / Kostenfrei"** — öffnet den Stornodialog (siehe unten); die Buchungsentscheidung erfolgt vor der Verbuchung
- Nach Schließen des Dialogs kehrt die Bedienung zur Tischaktionsauswahl (Schritt 2b) zurück
- Sind alle Positionen eines Tisches bezahlt oder storniert, wird der Tisch im Saalplan automatisch als frei angezeigt

#### Stornodialog (Ebene 1)
- Bedienung wählt einen **Stornogrund** aus der konfigurierten Liste (Pflichtfeld)
- Zwei Buchungsarten je nach hinterlegtem Grund:
  - **100% Rabatt** (z.B. Stornogrund „Ehrengast") — Zahlungsbeleg mit 0 € wird erstellt und TSE-seitig verbucht; Positionen gelten als bezahlt
  - **Storno** (z.B. Stornogrund „Nicht geliefert") — Positionen werden still entfernt; kein Beleg, keine TSE-Transaktion
- Gilt nur für die Bedienung; an der Bonkasse nicht verfügbar

---

## Offene Fragen

1. ~~**TSE-Technologie**~~ — **Entschieden (August 2026):** Hardware-TSE (USB), nicht Cloud-TSE (laufende Kosten). fiskaltrust verworfen (zu teuer, bestätigt durch Angebot). Gewählte Lösung: **Swissbit USB-TSE + direkte CLI-Subprozess-Integration** über das echte Swissbit-SDK (`wormCli`, verifiziert — royalty-free lizenziert, vorkompiliert für Linux x64, lokal über Dateisystem-Mount, keine Middleware, kein Netzwerkprotokoll). Details und Umsetzungsplan siehe TSE-Optionen-Abschnitt oben. Epson-natives Protokoll war Zwischenoption, nicht weiterverfolgt.

2. ~~**QR-Code auf dem Kassierungsdialog**~~ — **Entschieden:** URL zum lokalen FairPOS-Server. Format: `http://{server-adresse}/receipt/{token}` — der Token ist ein zufälliger, einmaliger Wert pro Rechnung (schwer zu erraten, kein separater Login nötig). Der Endpunkt liefert die Rechnung als PDF. Voraussetzung: Kundengerät ist im selben WLAN wie der Server. Server-Adresse wird manuell in den Systemeinstellungen konfiguriert.

3. ~~**Authentifizierung**~~ — **Entschieden:** Login für Kassenpersonal und Bedienung erfolgt ausschließlich per QR-Code-Token (Einmaltoken, 10 min gültig), erzeugt vom Administrator. Sessions sind persistent. Kein Passwort für diese Rollen.


---

## Noch zu entscheiden / zu spezifizieren

- ~~**DSFinV-K-Export**~~ — Technisches Implementierungsdetail; Mapping dokumentiert in `Rechtliche-Anforderungen.md`; keine weiteren Entscheidungen ausstehend

- ~~**TSE-Konfiguration**~~ — **Entschieden/umgesetzt (August 2026):** Mount-Pfad, Client-ID und TimeAdmin-PIN der Swissbit USB-TSE werden manuell über Systemeinstellungen → System konfiguriert (kein fiskaltrust/Docker-Compose-Automatismus mehr — dieser Ansatz wurde mit fiskaltrust verworfen). Änderungen wirken sofort, ohne Backend-Neustart. Details: docs/TSE-Integration.md

- ~~**Kassensystem-Seriennummer**~~ — **Entschieden:** Wird beim ersten Serverstart automatisch generiert und unveränderbar in der Datenbank gespeichert. Format: `FairPOS-{Jahr}-{10-stellig, Großbuchstaben + Ziffern}` (Beispiel: `FairPOS-2025-A3B7K2M9XQ`). In den Systemeinstellungen angezeigt, aber nicht bearbeitbar. Gilt für die gesamte Installation (nicht je Kasse); Kassen werden im DSFinV-K über `Z_KASSE_ID` unterschieden.

- ~~**Tagesabschluss (Z-Bon)**~~ — **Entschieden:**
  - **Je Kasse:** In der Kassendetailansicht (unter Kassen) kann der Tagesabschluss für diese Kasse manuell angestoßen werden
  - **Systemweit:** In der Kassenübersicht gibt es zusätzlich einen Button „Alle Kassen abschließen" als Shortcut
  - **Automatische Nullabschlüsse:** Das System erzeugt täglich automatisch Nullabschlüsse für alle Kassen, die an diesem Tag keinen Umsatz hatten — stellt lückenlose Z-Bon-Nummerierung sicher
  - **Z-Bon-Nummerierung:** Fortlaufend je Kasse, nie zurückgesetzt
  - **Inhalt Z-Bon:** Unternehmensname, Datum/Uhrzeit, Z-Bon-Nummer, Bruttoeinnahmen nach MwSt.-Satz, Stornos, Zahlungsartensummen, Nullstellungszähler (Details: `Rechtliche-Anforderungen.md`)
  - **Ausgabe:** Z-Bon wird auf dem der Kasse zugeordneten Drucker gedruckt (bei Bonkassen); zusätzlich in der Admin-UI einsehbar
  - **Navigation:** Unter Kassen (Kassenübersicht + Kassendetailansicht)

- ~~**Kassenmeldung (ELSTER)**~~ — Anleitung in `Organisatorische-Anleitung.md` dokumentiert; FairPOS stellt alle benötigten Daten in den Systemeinstellungen bereit (Softwareversion, Kassensystem-Seriennummer, TSE-Seriennummer, BSI-Zertifizierungs-ID, TSE-Aktivierungsdatum)

- ~~**Verfahrensdokumentation**~~ — Erledigt: Anleitung in `Organisatorische-Anleitung.md` dokumentiert

- ~~**Backup-Konzept**~~ — **Entschieden:** Kombination aus automatischem und manuellem Backup:
  - **Automatisch:** Backup-Dienst im Docker-Stack erstellt täglich ein `pg_dump` und speichert es in einem konfigurierten lokalen Verzeichnis (z.B. gemountete USB-Festplatte oder NAS); Zieldverzeichnis in den Systemeinstellungen konfigurierbar
  - **Manuell:** Administrator kann jederzeit über die Admin-UI ein vollständiges Datenbankexport herunterladen (z.B. vor Updates oder für Jahresarchive)
  - **Anzeige:** Admin-UI zeigt Zeitpunkt des letzten automatischen Backups an
  - Empfehlung in der Organisatorischen Anleitung: externer Datenträger regelmäßig vom Veranstaltungsort mitnehmen

- ~~**Kassenabrechnung**~~ — **Entschieden:**
  - **Kassenabschluss:** Manuell on-demand vom Administrator auslösbar; erfasst Ist-Bestand (manuell eingetippt), berechnet automatisch Soll-Bestand und Differenz; kein Abschlussbon
  - **TSE-Protokollierung:** Einlagen → `Anfangsbestand`/`Einzahlung`, Entnahmen → `Auszahlung` (gesetzlich vorgegeben, keine weiteren Entscheidungen nötig)

- **Storno**
  - ~~**Ebene 1 — Bestellung stornieren**~~ — **Entschieden:** Zweiter Button „Stornieren / Kostenfrei" in Schritt 3 der Bedienung (vor Verbuchung); Stornogrund Pflichtfeld; Buchungsart je Grund: Storno (kein Beleg) oder 100% Rabatt (0€-Beleg); Stornogründe in Einstellungen pflegbar
  - ~~**Ebene 2 — Rechnung stornieren**~~ — **Entschieden:** Nur Administrator; zwei Fälle:
    - **Fall A — Rechnungsstorno (Bedienung):** Storno-Button je Rechnung in der Auswertung „Erstellte Rechnungen"; die Positionen der Rechnung werden als storniert markiert und sind endgültig weg (nicht zurück auf den Tisch); Gegenbuchung im System; TSE-Transaktion `AVBelegstorno`
    - **Fall B — Bonstorno (Bonkasse):** Eigene Maske „Bonstorno" für den Administrator; Felder: Kasse (Pflichtfeld — bestimmt, in welcher Kasse die Negativrechnung gebucht wird), Artikel mit Mengenangabe (Eingabefeld oder +/−), Stornogrund (Freitext); nach Bestätigung wird eine gesammelte Stornorechnung und ggf. Stornobons (je nach Datenmodell) erzeugt — nichts wird gedruckt; TSE-Transaktion `AVBelegstorno`
    - **Stornogrund:** Freitext (Pflichtfeld) in beiden Fällen
