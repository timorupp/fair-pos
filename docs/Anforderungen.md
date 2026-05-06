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
  - **Logo** — wird auf dem Kassenbon gedruckt (hochladbare Bilddatei)
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
  - **TSE-Status** — zeigt den aktuellen Verbindungsstatus zur fiskaltrust Middleware und der Swissbit USB-TSE (online/offline, Seriennummer, BSI-Zertifizierungs-ID, Ablaufdatum); keine manuelle Konfiguration nötig — Verbindung wird automatisch über Docker Compose hergestellt
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

### Pflichtangaben auf dem Kassenbon (ab 01.01.2024)
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
- **Software (Open Source, EUPL 1.2):** kostenlos — stellt lokale REST/gRPC-API bereit, übernimmt TSE-Kommunikation mit Swissbit oder Epson; kein eigenes Java-SDK nötig
- **Sorglos-Paket (kostenpflichtig):** Bundle aus Middleware + Cloud-TSE + Archiv + Kassenmeldung als Jahresabo — nur relevant wenn fiskaltrust auch die TSE bereitstellen soll
- **Für FairPOS relevant:** Kostenlose Middleware-Software + separat gekaufte Swissbit USB-TSE → keine Middleware-Kosten
- **Architektur:** `Backend → fiskaltrust Middleware (kostenlos) → Swissbit USB-TSE`

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

**Entscheidung:** Hardware-TSE (Swissbit USB-Stick + fiskaltrust Middleware). Cloud-TSE aufgrund höherer laufender Kosten verworfen.

---

## Technologie-Stack

| Bereich | Technologie | Begründung |
|---|---|---|
| Backend | Node.js + TypeScript + Fastify | Läuft nativ auf Linux, geringer Ressourcenverbrauch, TypeScript für Typsicherheit |
| Frontend | SvelteKit + TypeScript (SPA) | PWA-Unterstützung, schlanke Bundle-Größe, schnell auf Mobilgeräten; als statische Dateien gebaut (`adapter-static`), von Fastify ausgeliefert — kein separater Frontend-Server |
| Datenbank | PostgreSQL | Robust, open source, ACID-transaktionssicher, komplexe Abfragen für DSFinV-K |
| Echtzeit | Server-Sent Events (SSE) | Einweg-Push vom Server zum Browser reicht für alle Anwendungsfälle (Tischstatus, Druckwarteschlange); kein bidirektionaler Kanal nötig; keine Bibliothek erforderlich |
| Druckdienst | Node.js Worker-Prozess | ESC/POS über TCP/IP via `@node-escpos/core`; via PostgreSQL LISTEN/NOTIFY getriggert |
| TSE-Adapter | fiskaltrust Middleware (Docker) | Open-Source-Java-Dienst von fiskaltrust; läuft als fertiges Docker-Image ohne eigene Java-Entwicklung; stellt lokale REST-API bereit; Konfiguration nur über Umgebungsvariablen |
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
│  │  PostgreSQL  │  │  fiskaltrust         │    │
│  │  (Datenbank) │  │  Middleware (Docker) │    │
│  │              │  │  REST → USB-TSE      │    │
│  └──────────────┘  └──────────────────────┘    │
└──────────────────────────────────────────────────┘
```

**Vereinfachungen gegenüber früheren Überlegungen:**
- Print Worker läuft im selben Node.js-Prozess wie die API (kein separater Container)
- SSE statt WebSockets — kein Upgrade-Handshake, kein Reconnect-Protokoll, native Browser-Unterstützung
- fiskaltrust Middleware als fertiges Docker-Image — keine Java-Entwicklung, kein eigener TSE-Adapter-Code
- SvelteKit-SPA wird von Fastify mitausgeliefert — ein einziger HTTP-Dienst nach außen

**TSE-Adapter:** Beim späteren Wechsel auf eine Cloud-TSE wird ausschließlich der fiskaltrust-Container ausgetauscht — der Rest der Anwendung bleibt unverändert.

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

1. Positionen werden nach **Drucker** sortiert (je Drucker ein Bon)
2. Innerhalb eines Druckers werden Positionen nach **identischen Attributen** (Artikel + Produktoptionen) gruppiert
3. Jede Gruppe erscheint als eine Zeile mit der jeweiligen Stückzahl

Beispiel: 3× `BestellungPosition{Artikel: Bier, Optionen: []}` → eine Zeile „3× Bier" auf dem Bestellbon.

An der Bonkasse werden keine Bestellbons gedruckt — die Bestellung ist sofort abgeschlossen und der Kassierbon wird direkt ausgegeben.

---

## Funktionale Anforderungen — Kassenpersonal (Kasse vom Typ Bonkasse)

### Grundprinzip
Die Bonkasse ist für Selbstabholer: Artikel werden sofort kassiert und ein Bon wird direkt gedruckt. Es gibt kein "Bestellung aufnehmen und später kassieren". An der Bonkasse werden keine Bestellbons gedruckt — nur der Selbstabholerbon für den Kunden.

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

1. ~~**TSE-Technologie**~~ — **Entschieden:** Hardware-TSE (USB); Empfehlung Swissbit USB-Stick + fiskaltrust Middleware (kostenlos). Cloud-TSE aufgrund höherer laufender Kosten verworfen.

2. ~~**QR-Code auf dem Kassierungsdialog**~~ — **Entschieden:** URL zum lokalen FairPOS-Server. Format: `http://{server-adresse}/receipt/{token}` — der Token ist ein zufälliger, einmaliger Wert pro Rechnung (schwer zu erraten, kein separater Login nötig). Der Endpunkt liefert die Rechnung als PDF. Voraussetzung: Kundengerät ist im selben WLAN wie der Server. Server-Adresse wird manuell in den Systemeinstellungen konfiguriert.

3. ~~**Authentifizierung**~~ — **Entschieden:** Login für Kassenpersonal und Bedienung erfolgt ausschließlich per QR-Code-Token (Einmaltoken, 10 min gültig), erzeugt vom Administrator. Sessions sind persistent. Kein Passwort für diese Rollen.


---

## Noch zu entscheiden / zu spezifizieren

- ~~**DSFinV-K-Export**~~ — Technisches Implementierungsdetail; Mapping dokumentiert in `Rechtliche-Anforderungen.md`; keine weiteren Entscheidungen ausstehend

- ~~**TSE-Konfiguration**~~ — Technisches Implementierungsdetail; Verbindung zur fiskaltrust Middleware wird automatisch über Docker Compose konfiguriert (beide Komponenten laufen lokal im selben Stack); kein manueller Eingriff durch den Benutzer nötig

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
