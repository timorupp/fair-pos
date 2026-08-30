# FairPOS — Organisatorische Anleitung

Dieses Dokument beschreibt die organisatorischen Aufgaben, die der Verein beim Betrieb von FairPOS erfüllen muss. Sie liegen außerhalb der Software, sind aber gesetzlich vorgeschrieben.

---

## 1. Kassenmeldung beim Finanzamt (ELSTER)

Rechtsgrundlage: **§ 146a Abs. 4 AO** (gilt ab 01.01.2025)

Jedes elektronische Kassensystem muss beim zuständigen Finanzamt gemeldet werden — bei Inbetriebnahme und bei Außerbetriebnahme.

### Fristen

| Situation | Frist |
|---|---|
| FairPOS in Betrieb genommen **vor 01.07.2025** | Meldung bis **31.07.2025** |
| FairPOS in Betrieb genommen **ab 01.07.2025** | Meldung **innerhalb eines Monats** nach Inbetriebnahme |
| FairPOS außer Betrieb genommen | Abmeldung **innerhalb eines Monats** |

### Meldeverfahren

Die Meldung erfolgt ausschließlich elektronisch — entweder selbst über ELSTER oder über einen Steuerberater.

**Option A: Selbst über ELSTER**
1. Unter mein.elster.de anmelden (ELSTER-Konto erforderlich)
2. Formular aufrufen: *„Mitteilung über elektronische Aufzeichnungssysteme (§ 146a Absatz 4 AO)"*
3. Daten eingeben (siehe unten)
4. Übermitteln und Bestätigung aufbewahren

**Option B: Über Steuerberater**
- Steuerberater die benötigten Daten (siehe unten) übergeben
- Steuerberater übermittelt die Meldung via ERiC-Schnittstelle

### Benötigte Daten aus FairPOS

Folgende Angaben müssen aus dem FairPOS-System entnommen werden (Einstellungen → System):

| Angabe | Wo in FairPOS |
|---|---|
| Softwarebezeichnung | „FairPOS" |
| Softwareversion | Einstellungen → System |
| Kassensystem-Seriennummer | Einstellungen → System |
| TSE-Seriennummer (64 Zeichen Hex) | Einstellungen → TSE-Konfiguration |
| BSI-Zertifizierungs-ID der TSE | Dokumentation der Swissbit TSE |
| TSE-Aktivierungsdatum | **Nicht in FairPOS gespeichert** — manuell beim Setup notieren (z.B. hier in der Verfahrensdokumentation, Abschnitt 2C) |

Zusätzlich werden folgende Angaben des Vereins benötigt:

- Steueridentifikationsnummer des Vereins
- Name und vollständige Anschrift des Vereins
- Name und vollständige Anschrift der Betriebsstätte (Veranstaltungsort)
- Anschaffungsdatum und Inbetriebnahmedatum von FairPOS
- Anschaffungsart (Kauf)

### Abmeldung

Bei dauerhafter Außerbetriebnahme von FairPOS muss dasselbe Formular erneut ausgefüllt und die Abmeldung übermittelt werden. Frist: innerhalb eines Monats nach Außerbetriebnahme.

---

## 2. Verfahrensdokumentation

Rechtsgrundlage: **GoBD Tz. 151–155**, **§ 145 Abs. 1 AO**

Jede buchführungspflichtige Organisation muss eine schriftliche Verfahrensdokumentation führen. Sie muss historisch nachverfolgbar sein — Änderungen sind mit Datum und Versionsnummer festzuhalten.

**Konsequenz bei Fehlen:** Das Finanzamt kann die gesamte Buchführung verwerfen und Umsätze schätzen.

### Was muss dokumentiert werden?

Die Verfahrensdokumentation besteht aus vier Teilen:

**A — Allgemeine Beschreibung**
- Beschreibung der Geschäftstätigkeit und der steuerlichen Einordnung des Vereins (Zweckbetrieb, wirtschaftlicher Geschäftsbetrieb etc.)
- Zuständigkeiten: wer ist für die Kassenführung verantwortlich?
- Wie werden Änderungen am System dokumentiert (Versionsführung)?

**B — Anwenderdokumentation**
- Kurzanleitung für Administrator, Kassenpersonal und Bedienung
- Regelungen für Mitarbeiter: wie wird kassiert, wie werden Stornos durchgeführt, wie wird der Tagesabschluss gemacht?
- Verhalten bei Fehlern: was tun bei Druckerausfall, Serverausfall, fehlendem Internet?
- Ausweichverfahren: wie wird bei Systemausfall manuell kassiert (offene Ladenkasse)?

**C — Technische Systemdokumentation**
Folgendes muss schriftlich festgehalten und aktuell gehalten werden:

| Was | Beispiel |
|---|---|
| Serverbezeichnung und Seriennummer | z.B. „Intel NUC, S/N: ABC123" |
| IP-Adresse des Servers | z.B. 192.168.1.10 |
| FairPOS-Softwareversion | z.B. 1.2.3 |
| Bondrucker mit IP-Adresse und Seriennummer | z.B. „Epson TM-m30II, 192.168.1.20, S/N: XYZ" |
| Swissbit TSE: Modell, Seriennummer, BSI-ID, Aktivierungsdatum | Aus TSE-Dokumentation |
| Tablets (Kassenpersonal): Modell, Seriennummer | — |
| Smartphones (Bedienung): Modell | — |

**D — Betriebsdokumentation**
- Backup-Konzept: wie und wo werden Daten gesichert? (siehe Abschnitt 3)
- Benutzerverwaltung: wer hat welchen Zugang?
- Änderungsprotokoll: jede Softwareaktualisierung, Konfigurationsänderung oder Hardwareänderung mit Datum und Grund notieren

### Vorlage: Änderungsprotokoll

| Datum | Version | Änderung | Durchgeführt von |
|---|---|---|---|
| TT.MM.JJJJ | 1.0 | Erstinbetriebnahme FairPOS | [Name] |
| | | | |

### Wann muss die Dokumentation aktualisiert werden?

- Bei jeder FairPOS-Softwareaktualisierung
- Bei Änderung der Hardwarekonfiguration (neuer Drucker, neuer Server etc.)
- Bei Änderung der Benutzer oder Zuständigkeiten
- Bei Änderung der Steuersätze oder Artikelstruktur

---

## 3. Backup-Konzept

Rechtsgrundlage: **§ 147 AO**, **GoBD** — Aufbewahrungspflicht 10 Jahre

Alle Kassendaten (Transaktionen, Rechnungen, Kassenabschlüsse) müssen 10 Jahre lang aufbewahrt und jederzeit maschinell auswertbar sein.

### Empfohlenes Vorgehen

**Regelmäßige Datensicherung:**
- PostgreSQL-Datenbank täglich sichern. FairPOS automatisiert das bewusst
  **nicht** selbst (der Server läuft nicht durchgehend, ein zeitbasierter
  automatischer Trigger würde regelmäßig verpasst — siehe
  `docs/Anforderungen.md` "Backup-Konzept") — stattdessen: Admin klickt in
  Systemeinstellungen → System auf "Backup herunterladen" (lädt ein
  vollständiges `pg_dump`-Backup als ZIP), idealerweise direkt nach jedem
  Tagesabschluss.
- Sicherung auf einem externen Medium (USB-Festplatte, NAS) oder Cloud-Speicher (verschlüsselt)
- Sicherung sollte nicht auf demselben Gerät wie der Server liegen

**Aufbewahrung:**
- Backups der letzten 30 Tage: täglich
- Backups der letzten 12 Monate: monatlich
- Jahresarchiv: mindestens 10 Jahre aufbewahren

**Test der Wiederherstellung:**
- Mindestens einmal jährlich prüfen, ob die Backups wiederherstellbar sind

**Dokumentation:**
- Backup-Konzept und Ablageort in der Verfahrensdokumentation festhalten

---

## 4. Jährliche Aufgaben (Checkliste)

- [ ] Tagesabschlüsse vollständig und lückenlos durchgeführt?
- [ ] DSFinV-K-Export erstellt und gesichert?
- [ ] Backup der Datenbank auf Langzeitspeicher übertragen?
- [ ] Softwareversion und Hardwareänderungen im Änderungsprotokoll eingetragen?
- [ ] TSE-Ablaufdatum prüfen (Swissbit USB-TSE: 5 Jahre ab Herstellung)
- [ ] Bei Softwarewechsel oder Außerbetriebnahme: Abmeldung über ELSTER

---

## 5. Inbetriebnahme-Checkliste (Ersteinrichtung)

- [ ] Swissbit USB-TSE beschaffen und über FairPOS (Systemeinstellungen → System bzw. `native/tse-cli`) aktivieren — siehe docs/TSE-Integration.md; fiskaltrust wurde als zu teuer verworfen (August 2026)
- [ ] FairPOS installieren und konfigurieren (Unternehmensdaten, Steuernummer, Steuersätze)
- [ ] Kassensystem-Seriennummer und Softwareversion notieren
- [ ] Kassenmeldung über ELSTER einreichen (Frist beachten)
- [ ] Verfahrensdokumentation erstellen (Abschnitt 2)
- [ ] Backup-Konzept umsetzen (Abschnitt 3)
- [ ] Mitarbeiter schulen
