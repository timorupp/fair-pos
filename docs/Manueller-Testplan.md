# FairPOS — Manueller Regressionstest-Plan

Checkliste für einen vollständigen manuellen Durchlauf durch FairPOS, inkl.
TSE-Signierung, TSE-Ausfallverhalten und DSFinV-K-Export. Ergänzt die
automatisierten Test-Suiten (`npm test`, `npm run test:integration`) — die
prüfen Logik, diese Liste prüft das tatsächliche Erlebnis in der Browser-UI
und mit echter (oder simulierter) TSE-Hardware.

**Nutzung:** Vor jedem größeren Release / vor dem ersten Produktivgang einmal
komplett durchgehen. Zwischendurch reicht der jeweils betroffene Abschnitt.
Gefundene Probleme in `DANGER.md` eintragen, nicht nur hier abhaken.

**Stand:** August 2026. Bei neuen Features diese Liste ergänzen (siehe
Abschnitt „Diese Liste aktuell halten" am Ende).

---

## 0. Vorbereitung

- [ ] Testumgebung aufgesetzt (lokal `npm run dev`, oder eine native Installation gemäß `docs/Installationsanleitung.md` auf einem Testserver)
- [ ] Frische/zurückgesetzte Test-Datenbank (keine Altdaten aus vorherigen Läufen)
- [ ] Mindestens 2 Testbenutzer angelegt: 1 Admin, 1 Kassenpersonal (nicht-Admin)
- [ ] Mindestens 2 Kassen angelegt: 1 Bonkasse (`receipt_register`), 1 Bedienungskasse (`service_register`)
- [ ] Mindestens 3 Artikel in mind. 2 Artikelgruppen mit unterschiedlichen Steuersätzen (19 %, 7 %, ggf. 0 %)
- [ ] Mindestens 1 Artikel mit Pfand (`deposit_price` > 0)
- [ ] Getestet in mind. einem Desktop-Browser und einem mobilen/Touch-Browser (Bonkasse/Bedienungskasse sind Touch-UIs)
- [ ] TSE-Konfiguration (Systemeinstellungen → System) für diesen Lauf bewusst gewählt: **entweder** komplett unkonfiguriert (Warnungs-Pfad testen) **oder** auf echte/simulierte Hardware zeigend (Erfolgs-Pfad testen) — beide Zustände separat durchlaufen, siehe Abschnitt 9

---

## 1. Authentifizierung (Task #90)

- [ ] PIN-Login funktioniert (PIN aus Admin-Benutzerverwaltung vergeben, auf der Login-Seite eingeben — mit und ohne Bindestriche, Groß-/Kleinschreibung egal)
- [ ] Falsche/unbekannte PIN wird mit generischer Meldung abgelehnt
- [ ] Nach 3 Fehlversuchen wird die eigene IP für 15 Minuten gesperrt; „Alle aktiven IP-Sperren zurücksetzen" (Systemeinstellungen → System) hebt die Sperre sofort auf
- [ ] Deaktivierter Benutzer kann sich nicht mehr per PIN anmelden, eine bereits offene Session wird beim nächsten Request sofort beendet (Task #56)
- [ ] „Systemverwaltung"-Button erscheint auf der Kassenauswahl nur bei einem Administrator-Konto, zwischen Kassenliste und „Abmelden"
- [ ] Passwort-Abfrage bei „Systemverwaltung" wird nur beim ersten Klick pro Sitzung gestellt, nicht erneut bei weiteren Wechseln zwischen Kasse und Verwaltung
- [ ] Falsches Passwort bei der Systemverwaltung-Abfrage wird abgelehnt, Zugriff auf `/admin/*` bleibt verwehrt
- [ ] Logout beendet die Sitzung vollständig — sowohl Kassenauswahl als auch Systemverwaltung sind danach ohne erneuten Login nicht mehr erreichbar
- [ ] Admin-Bereich → „Aktive Sessions" zeigt die eigene und andere offene Sitzungen; „Beenden" einer fremden Sitzung meldet dieses Gerät beim nächsten Request ab

---

## 2. Admin: Systemeinstellungen

### Unternehmensdaten (`/admin/settings/company`)
- [ ] Name, Anschrift, Steuernummer, USt-IdNr. speichern und laden
- [ ] Belegnummer-Präfix + Startwert ändern — nächster Beleg übernimmt neuen Präfix
- [ ] Logo hochladen, auf Bon-Vorschau sichtbar; Logo entfernen
- [ ] Logo-Zoom ändern, Vorschau aktualisiert sich
- [ ] Pfand-USt-Satz ändern

### System (`/admin/settings/system`)
- [ ] Kassensystem-Seriennummer wird angezeigt (nicht editierbar), Kopieren-Button funktioniert
- [ ] Zeitzone + laufende Serverzeit werden angezeigt und aktualisieren sich
- [ ] Server-Adresse speichern — QR-Code auf Kundenbon zeigt danach korrekt auf diese Adresse
- [ ] **Datenbank-Backup:** „Backup herunterladen" liefert ein ZIP mit SQL-Dump + Wiederherstellungs-README
- [ ] **TSE-Verbindung:** Mount-Pfad, Client-ID, TimeAdmin-PIN eintragen und speichern — Änderung wirkt **ohne Neustart**
- [ ] **TSE testen**-Button:
  - [ ] Ohne Konfiguration: zeigt „TSE ist nicht konfiguriert"
  - [ ] Mit falschem/nicht existierendem Pfad: zeigt Fehlermeldung, keine Absturz
  - [ ] Mit funktionierender TSE: zeigt Self-Test-Status, Seriennummer, Zertifizierungs-ID, Restsignaturen, Zertifikatsablauf
  - [ ] „Rohdaten (JSON)"-Aufklapper + Kopieren-Button funktionieren

---

## 3. Admin: Stammdaten

- [ ] **Artikelgruppen:** anlegen, Steuersatz ändern, löschen (nur wenn keine Artikel mehr zugeordnet)
- [ ] **Artikel:** anlegen mit Preis/Pfand/Belegtext, Produktoptionen hinzufügen, Drucker zuordnen, deaktivieren/aktivieren
- [ ] **Drucker:** anlegen (IP/Port), Standarddrucker setzen (genau einer aktiv), Testdruck auslösen, Löschen eines noch zugeordneten Druckers zeigt klare Fehlermeldung statt Absturz (Task #57)
- [ ] **Kassen (Register):** Bonkasse + Bedienungskasse anlegen, Typ nicht nachträglich änderbar (falls so vorgesehen), Drucker zuordnen
  - [ ] Kasse mit vorhandener Rechnung archivieren (Aktiv-Häkchen entfernen) — verschwindet aus dem Kassen-Login-Picker, bleibt in Auswertungen/DSFinV-K-Export sichtbar (Task #55)
- [ ] **Kassenlayouts:** Raster anlegen, Artikel per Drag&Drop platzieren, Standardlayout je Kassentyp setzen
- [ ] **Saalplan:** Spalten/Zeilen hinzufügen/löschen, Tische anlegen, Tisch-Status ändern (aktiv/inaktiv/versteckt), Tisch umbenennen
- [ ] **Stornogründe:** anlegen mit `booking_type` Storno bzw. Kostenfrei, deaktivieren
- [ ] **Benutzer:** anlegen (Admin/Kassenpersonal), Passwort setzen (nur Admin), PIN generieren/manuell ändern, Selbstlöschung wird verhindert
  - [ ] PIN-Duplikat wird beim Speichern abgelehnt (409), eigene unveränderte PIN erneut speichern funktioniert
  - [ ] Benutzer mit vorhandener Buchung deaktivieren — PIN-Login und Passwort-Stufenauth werden abgelehnt, eine bereits offene Session dieses Benutzers wird sofort beendet, Selbstdeaktivierung wird verhindert (Task #56)
- [ ] **Veranstaltungen:** anlegen mit Zeitraum, wird als Standard in Auswertungen/Excel-Export vorausgewählt

---

## 4. Bonkasse (Kassieren)

- [ ] Login per QR-Token, Kassenlayout wird angezeigt
- [ ] Artikel per Tap zur Bestellliste hinzufügen, Menge ändern, Position entfernen
- [ ] Negative/leere Bestellliste wird beim Kassieren-Versuch abgelehnt
- [ ] Kassieren erzeugt Beleg mit korrekter, fortlaufender Belegnummer
- [ ] QR-Code im Kassierdialog zeigt auf den Kundenbeleg (siehe Abschnitt 13)
- [ ] „Rechnung drucken" enqueued einen Druckauftrag
- [ ] Selbstabholerbon wird pro Artikel-Einheit am Kassendrucker gedruckt (nicht am Standarddrucker der Bedienung)
- [ ] Pfandartikel: Pfandbon wird korrekt gedruckt (separat oder inline, je Artikelkonfiguration)
- [ ] Kassieren funktioniert weiterhin, wenn kein Drucker zugeordnet ist — `slip_printer_missing`-Hinweis sichtbar
- [ ] **TSE konfiguriert + funktionsfähig:** keine Warnung, Beleg trägt TSE-Transaktionsnummer/-Signatur (in Admin-Rechnungsansicht prüfbar)
- [ ] **TSE nicht konfiguriert oder nicht erreichbar:** Verkauf wird **trotzdem abgeschlossen**, orange Warnung erscheint im Kassierdialog, Beleg hat keine TSE-Felder

---

## 5. Bedienungskasse

- [ ] Login per QR-Token, Saalplan wird angezeigt, Tisch-Belegungsstatus korrekt
- [ ] Tisch auswählen → Bestellansicht → Artikel mit Optionen bestellen
- [ ] Bestellbon wird am artikelspezifischen Drucker gedruckt (Fallback: Standarddrucker)
- [ ] Bestellung ohne verfügbaren Drucker: Bestellung wird trotzdem angelegt, Warnhinweis (Alert) erscheint
- [ ] **TSE-Warnung bei Bestellung:** wie oben — erscheint als Alert, Bestellung wird trotzdem angelegt (AVBestellung)
- [ ] Zurück zur Tischaktionsauswahl, mehrere Bestellrunden am selben Tisch möglich
- [ ] **Kassieren (Split):** offene Positionen laden, Teilmenge auswählen, kassieren → korrekte Restmenge bleibt offen
- [ ] Kassieren-Dialog zeigt QR-Code + Drucken-Button wie Bonkasse
- [ ] **TSE-Warnung beim Kassieren:** Kassenbeleg-V1-Signierung fehlgeschlagen/nicht konfiguriert → inline sichtbar im Kassierdialog, Zahlung trotzdem abgeschlossen
- [ ] **Stornieren:** Positionen auswählen, Stornogrund wählen, bestätigen → Positionen als storniert markiert
- [ ] **Kostenfrei:** wie oben mit `booking_type=free_of_charge`
- [ ] **TSE-Warnung bei Storno/Kostenfrei:** erscheint als Alert (Dialog schließt sofort), AVSonstige-Signierung wird versucht
- [ ] Register-Sperre: Bedienungskasse blockiert Bestellen/Kassieren, wenn für die Kasse ein ausstehender Z-Bon existiert (409, klare Fehlermeldung)

---

## 6. Tagesabschluss (Z-Bon)

- [ ] Manueller Tagesabschluss für eine Kasse mit offenen (unabgeschlossenen) Rechnungen erzeugt korrekten Z-Bon (Summen, Steueraufschlüsselung, Storno-Summe)
- [ ] Nullabschluss (keine Bewegung) wird als solcher markiert und gedruckt/angezeigt
- [ ] Z-Bon-Nummer ist fortlaufend pro Kasse, keine Lücken
- [ ] Ausstehende Tage werden im Banner/Badge angezeigt, bevor sie abgeschlossen werden
- [ ] „Alle ausstehenden Tage jetzt nachholen" schließt sie chronologisch nacheinander ab
- [ ] „Alle Kassen jetzt abschließen" (globaler Shortcut) funktioniert
- [ ] Z-Bon-PDF öffnet sich korrekt, Reprint enqueued einen neuen Druckauftrag
- [ ] Nach Abschluss: betroffene Rechnungen sind dem Z-Bon zugeordnet und erscheinen nicht mehr als „offen"

---

## 7. Admin: Bonstorno (kassenübergreifend)

- [ ] Kasse, Stornogrund (nur `booking_type=cancellation`), Artikel + Menge wählen → Stornobeleg wird erzeugt
- [ ] Stornobeleg reduziert den Bar-Bestand des Tages korrekt (in Auswertung „Kassenbestand" prüfen)
- [ ] Falscher Stornogrund (`free_of_charge`) wird abgelehnt (400)
- [ ] Leere Positionsliste wird abgelehnt
- [ ] **TSE-Warnung:** wie bei anderen Kassenbeleg-V1-Vorgängen — Storno wird trotzdem angelegt, Warnung sichtbar

---

## 8. Auswertungen & Excel-Export

- [ ] Umsatz-/Storno-/offene-Positionen-Reports laden korrekte Daten für die ausgewählte Veranstaltung
- [ ] Kassenbestand-Auswertung zeigt korrekten Soll-Bestand (Stornos/kostenfreie Positionen korrekt ausgeschlossen/eingerechnet)
- [ ] „Erstellte Rechnungen"-Auswertung: Reprint-Button je Zeile funktioniert
- [ ] Excel-Tagesexport für ein gewähltes Datum lädt herunter, öffnet in Excel/LibreOffice, Zeilen plausibel
- [ ] Excel-Veranstaltungsexport für die gewählte Veranstaltung lädt herunter

---

## 9. TSE — Ausfallverhalten (siehe `docs/TSE-Integration.md` „TSE-Ausfall")

Zweimal durchlaufen: einmal **ohne** TSE-Konfiguration, einmal **mit** einer
absichtlich falschen Konfiguration (z. B. nicht existierender Mount-Pfad), um
beide Nicht-Erfolgs-Pfade separat zu prüfen. Falls echte/simulierte
Hardware verfügbar ist, zusätzlich den Erfolgspfad testen.

- [ ] Bonkasse-Checkout blockiert **nicht** — Beleg wird trotzdem angelegt
- [ ] Bedienungskasse-Bestellung blockiert **nicht**
- [ ] Bedienungskasse-Kassieren (Split) blockiert **nicht**
- [ ] Bedienungskasse-Storno/Kostenfrei blockiert **nicht**
- [ ] Admin-Bonstorno blockiert **nicht**
- [ ] In jedem der obigen Fälle: Warnung ist für das Personal sichtbar (nicht nur im Server-Log)
- [ ] Nach einem Fehlschlag: `tse_outage`-Tabelle hat genau eine offene Zeile (per DB-Client prüfen: `SELECT * FROM tse_outage WHERE ended_at IS NULL`)
- [ ] Nach Behebung der Ursache (z. B. TSE korrekt konfiguriert) und einem erfolgreichen Vorgang: die offene `tse_outage`-Zeile wird geschlossen (`ended_at` gesetzt)
- [ ] Wiederholte Fehlschläge öffnen **keine** zusätzliche `tse_outage`-Zeile (nur eine bleibt offen)
- [ ] Gedruckter Kassenbon zeigt bei fehlender Signatur keine „Transaktionsnr."-Zeile (statt einer falschen/Platzhalter-Nummer)

**Nur mit echter Hardware sinnvoll testbar** (siehe `docs/TSE-Integration.md`
Abschnitt 9 — Team plant Wechsel auf natives Ubuntu-System dafür):
- [ ] Erfolgreiche Signierung: Beleg trägt korrekte TSE-Transaktionsnummer, Signaturzähler, Signatur, Start-/Endzeit
- [ ] `maintain` (Self-Test + Zeit-Sync) läuft ohne Fehler, sofern/wenn ein periodischer Job existiert
- [ ] AVBelegabbruch-Pfad: TSE-Verbindung mitten in einem Vorgang trennen (z. B. USB-Stick kurz abziehen) — Vorgang wird per Zweit-`finish` als `AVBelegabbruch` geschlossen, kein dauerhaft offener Vorgang auf der TSE (`info`-Abruf zeigt `startedTransactions` zurück auf 0 statt aufsteigend hängen)

---

## 10. DSFinV-K-Export (siehe `docs/Rechtliche-Anforderungen.md` Abschnitt 6)

- [ ] Mindestens einen vollständigen Testlauf mit **echten Bewegungen** vor dem Export durchführen: Bonkasse-Verkauf, Bedienungskasse-Bestellung+Split-Kassieren, eine Stornierung, ein Bonstorno — dann erst den Z-Bon abschließen
- [ ] `/admin/exports/dsfinvk` — Kasse wählen, Kassenabschlüsse werden gelistet
- [ ] Download „ZIP herunterladen" funktioniert; alternativ Download-Link direkt auf der Kassendetailseite (`/admin/registers/:id`, Spalte „DSFinV-K")
- [ ] Unbekannte/gelöschte Kassenabschluss-ID liefert 404, kein Absturz
- [ ] ZIP entpacken, folgende Dateien sind vorhanden (mind. die mit tatsächlichen Daten):
  - [ ] `index.xml`
  - [ ] `transactions.csv`, `transactions_vat.csv`, `datapayment.csv`, `transactions_tse.csv`
  - [ ] `lines.csv`, `lines_vat.csv`
  - [ ] `allocation_groups.csv` (nur wenn Bedienungskasse-Tisch beteiligt)
  - [ ] `cashpointclosing.csv`, `location.csv`, `cashregister.csv`, `vat.csv`
  - [ ] `tse.csv` (nur wenn eine TSE-Signatur im Abschluss vorkommt)
  - [ ] `businesscases.csv`, `payment.csv`, `cash_per_currency.csv`
- [ ] `transactions.csv` öffnen: ein `Beleg`-Vorgang je Bonkasse-Verkauf/Split-Kassieren/Bonstorno, ein `AVBestellung`-Vorgang je Bedienungskasse-Bestellung, ein `AVSonstige`-Vorgang je Storno/Kostenfrei — Summen (`UMS_BRUTTO`) stimmen mit den tatsächlichen Belegsummen überein
- [ ] Bonstorno-Zeile hat **negatives** `UMS_BRUTTO`, `BON_STORNO='0'` (FairPOS nutzt bewusst nicht `AVBelegstorno`, siehe Abschnitt 6.2)
- [ ] `lines.csv`: Pfandartikel erzeugen zwei Zeilen (`GV_TYP=Umsatz` + `GV_TYP=Pfand`), Leergutrückgabe erzeugt `GV_TYP=PfandRueckzahlung`
- [ ] `transactions_tse.csv`: bei signierten Vorgängen sind `TSE_TANR`/`TSE_TA_SIG` gefüllt (Signatur in Base64, nicht Hex); bei unsignierten Vorgängen ist `TSE_TA_FEHLER` gefüllt statt eines Absturzes
- [ ] `vat.csv`: `UST_SCHLUESSEL` 1=19 %, 2=7 %, 5=0 % — passend zu den im Abschluss tatsächlich verwendeten Steuersätzen
- [ ] Summen in `businesscases.csv`/`payment.csv`/`cash_per_currency.csv` stimmen mit dem gedruckten Z-Bon überein (Bar-Summe, Steueraufschlüsselung)
- [ ] CSV-Dateien lassen sich in Excel/LibreOffice mit Semikolon als Trenner öffnen und sind lesbar (Umlaute korrekt, kein Encoding-Problem)

**Bekannte, dokumentierte Einschränkungen — nicht als Bug melden, aber im Hinterkopf behalten:**
- `service_order`/`order_cancellation` werden über Kasse + Kalendertag angenähert, nicht exakt dem Kassenabschluss zugeordnet (Abschnitt 6.7)
- Nur die volle TSE-Zertifikatskette (`TSE_ZERTIFIKAT_I/II` in `tse.csv`) ist noch leer — Signaturalgorithmus/Zeitformat/Public-Key sind seit Task #46 gefüllt
- CSV-Trennzeichen/`index.xml`-Schema folgen der verbreiteten Konvention, sind aber nicht gegen die separate GoBD-Anlage verifiziert (Abschnitt 6, Einleitung)

---

## 11. Druckwarteschlange

- [ ] Druckwarteschlange-Ansicht zeigt offene/fehlgeschlagene/erledigte Jobs
- [ ] Fehlgeschlagener Job (Drucker offline) kann erneut versucht werden
- [ ] Job kann abgebrochen/gelöscht werden
- [ ] Testdruck vom Drucker-Einstellungsbildschirm funktioniert

---

## 12. Kundenansicht (Rechnung online)

- [ ] QR-Code vom Kassierdialog scannen (oder URL manuell öffnen) → öffentliche Rechnungsseite lädt ohne Login
- [ ] Rechnungs-PDF zeigt dieselben Daten wie der gedruckte Bon (inkl. TSE-Block, auch wenn leer)
- [ ] Ungültiger/abgelaufener Token liefert 404, keine Serverfehler-Seite

---

## 13. Rand- und Fehlerfälle

- [ ] Doppeltes Anlegen (Artikelgruppe, Benutzername, Tisch-Label) wird mit 409 abgelehnt, nicht mit 500
- [ ] Sehr lange Texteingaben (Artikelname, Notiz) werden ohne Absturz verarbeitet oder sinnvoll begrenzt
- [ ] Negative/Null-Mengen werden überall abgelehnt, wo sie keinen Sinn ergeben
- [ ] Gleichzeitiges Kassieren am selben Tisch von zwei Geräten: keine doppelte Belegnummer, keine doppelt kassierten Positionen
- [ ] Browser-Reload mitten in einem Kassiervorgang: kein inkonsistenter Zustand (Bestellliste ggf. verloren, aber keine doppelte Buchung)

---

## 14. Touch-/Mobile-Bedienung

- [ ] Bonkasse- und Bedienungskasse-UI auf einem Tablet/Touch-Gerät im Querformat getestet
- [ ] Buttons groß genug für Touch-Bedienung (kein versehentliches Doppel-Tap-Auslösen)
- [ ] Saalplan-Editor und Kassenlayout-Editor auf Touch nutzbar (Drag&Drop)

---

## Diese Liste aktuell halten

Wenn ein neues Feature entsteht: hier einen Abschnitt/Punkt ergänzen, bevor
die Aufgabe als abgeschlossen gilt — siehe Vorgehen in dieser Session (Docs
werden bei jeder Änderung mitgepflegt, nicht nachträglich gesammelt). Wenn ein
Testschritt beim Durchlaufen einen echten Fehler aufdeckt, den Fehler in
`DANGER.md` eintragen (nicht nur hier den Haken weglassen).
