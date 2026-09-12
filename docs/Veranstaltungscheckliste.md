# FairPOS — Veranstaltungscheckliste

> **Nutzung auf eigenes Risiko.** FairPOS wird von Freiwilligen entwickelt,
> ohne Gewähr und ohne jede Garantie — insbesondere garantieren wir **nicht**,
> dass die Software die Anforderungen der KassenSichV, GoBD, AO oder anderer
> gesetzlicher Vorgaben tatsächlich vollständig und fehlerfrei erfüllt (siehe
> auch die Gewährleistungsausschluss-Klauseln in der [LICENSE](../LICENSE),
> Abschnitte 15/16). Für die steuerliche/rechtliche Absicherung eures Vereins
> bleibt ihr selbst verantwortlich — im Zweifel Steuerberatung hinzuziehen.
> Auch diese Checkliste selbst erhebt keinen Anspruch auf Vollständigkeit.

Dieses Dokument beschreibt die operativen Schritte rund um eine **einzelne
Veranstaltung** ("Fair") — vor dem ersten Verkaufstag, an jedem
Veranstaltungstag selbst, und nach dem letzten Tag. Es ergänzt, aber
ersetzt nicht:

- `docs/Organisatorische-Anleitung.md` Abschnitt 4 ("Jährliche Aufgaben") —
  Aufgaben mit Jahresrhythmus, unabhängig von einzelnen Veranstaltungen.
- `docs/Organisatorische-Anleitung.md` Abschnitt 5
  ("Inbetriebnahme-Checkliste") — die **einmalige** Ersteinrichtung von
  FairPOS bei einem Verein, der das System zum ersten Mal nutzt.

Wer FairPOS bereits produktiv betreibt und lediglich die nächste
Veranstaltung vorbereitet, braucht nur dieses Dokument.

Rechtliche Grundlagen und Fristen werden hier nicht erneut hergeleitet,
sondern aus `docs/Rechtliche-Anforderungen.md` und
`docs/Organisatorische-Anleitung.md` zitiert/verlinkt — Details dort
nachschlagen.

---

## 1. Vor der Veranstaltung

**Rechtliches/Formales**

- [ ] TSE besorgen bzw. sicherstellen, dass die vorhandene TSE über den
      gesamten Veranstaltungszeitraum gültig ist (siehe TSE-Ablaufdatum
      unten).
- [ ] TSE beim Finanzamt anmelden — Rechtsgrundlage **§ 146a Abs. 4 AO**:
      Meldung **innerhalb eines Monats** nach Inbetriebnahme (offizieller
      Gesetzestext, gesetze-im-internet.de/ao_1977/__146a.html — nicht "30
      Tage", wie mitunter kolportiert wird). Volles Verfahren inkl.
      benötigter Daten: `docs/Organisatorische-Anleitung.md` Abschnitt 1.
      Da die Monatsfrist erst nach Inbetriebnahme zu laufen beginnt, kann
      die Anmeldung organisatorisch auch **gemeinsam mit der Abmeldung
      nach der Veranstaltung** erfolgen, solange beides innerhalb der
      jeweiligen Monatsfrist bleibt.
- [ ] Prüfen, ob das SSL-Zertifikat für FairPOS noch ausreichend lange
      gültig ist (Einstellungen → SSL-Zertifikat) — **kein eigenständiger
      gesetzlicher Prüfpunkt**, sondern eine rein technische Voraussetzung
      dafür, dass das Kassensystem selbst über die gesamte Veranstaltung
      erreichbar bleibt.
- [ ] **Weitere rechtliche Vorgaben (recherchiert, 2026-09-12):** Über die
      Meldepflicht und die allgemeine, fortlaufende Pflicht zur Nutzung
      einer zertifizierten TSE hinaus wurde **kein zusätzlicher,
      eigenständiger gesetzlicher Vorab-Prüfpunkt** gefunden. Geprüft: der
      Gesetzestext von § 146a AO und § 5 KassenSichV
      (gesetze-im-internet.de) enthalten keine gesonderte "vor
      Inbetriebnahme"-Anforderung über die BSI-Zertifizierung hinaus, die
      ohnehin durchgehend gelten muss, nicht nur zu Veranstaltungsbeginn.
      Eine vollständige Prüfung des zugehörigen BMF-Anwendungserlasses
      (AEAO zu § 146a AO) im Fließtext war wegen Bot-Schutzes auf der
      BMF-Webseite nicht möglich (gleiche Einschränkung wie bereits in
      `docs/Rechtliche-Anforderungen.md` Abschnitt 5 zum GoBD-Schreiben
      dokumentiert) — sollte sich das ändern, hier nachprüfen. Die
      Verfahrensdokumentation (siehe `docs/Organisatorische-Anleitung.md`
      Abschnitt 2) muss laufend aktuell gehalten werden, es ließ sich aber
      keine offizielle Quelle finden, die ihre **Existenz** als
      Bedingung für den Start einer einzelnen Veranstaltung nennt
      (anders als bei der Ersteinrichtung, siehe Abschnitt 5 dort).

**Beschaffung**

- [ ] Wechselgeld bestellen.
- [ ] Bonpapierrollen für alle Kassen bereitstellen.
- [ ] WLAN für FairPOS planen (ausreichend Kabel, Repeater/Access-Points,
      Reichweite an den geplanten Kassenstandorten).

**FairPOS technisch einrichten**

- [ ] TSE anschließen/konfigurieren (siehe `docs/TSE-Integration.md`).
- [ ] SSL-Zertifikat ggf. austauschen (Einstellungen → SSL-Zertifikat).
- [ ] Drucker einrichten und Kassen zuweisen (Einstellungen → Drucker).
- [ ] Systemzeit prüfen und ggf. setzen (Einstellungen → System, Abschnitt
      "Systemzeit setzen").
- [ ] Netzwerkeinstellungen prüfen, insbesondere DNS-Masquerading
      (Einstellungen → DNS-Masquerading).
- [ ] Falls für die Personalschulung eine eigene Trainingskasse benötigt
      wird: jetzt als solche anlegen (Kassen → Kasse anlegen/bearbeiten →
      Häkchen "Trainingskasse" — nur möglich, solange die Kasse noch keine
      Buchung hat, siehe Task #130).

**FairPOS-Daten des Wirtschaftsbetriebs pflegen**

- [ ] Unternehmensdaten (Organisation → Unternehmensdaten).
- [ ] Veranstaltung anlegen und aktivieren (Organisation → Veranstaltungen)
      — erst danach lassen sich Artikel, Kassen, Kassenlayouts und der
      Saalplan für diese Veranstaltung einrichten.
- [ ] Artikelgruppen (Stammdaten → Artikelgruppen).
- [ ] Stornogründe (Stammdaten → Stornogründe).
- [ ] Artikel (Stammdaten → Artikel).
- [ ] Saalplan (Stammdaten → Saalplan).
- [ ] Kassenlayouts (Stammdaten → Kassenlayouts).
- [ ] Kassen anlegen und ggf. Drucker zuweisen (Stammdaten → Kassen).
- [ ] Benutzer anlegen und den Kassen zuweisen (Organisation → Benutzer).

---

## 2. Jeden Veranstaltungstag — vor Beginn

- [ ] Kassen bestücken, Wechselgeldeinlage buchen (Kassen → jeweilige Kasse
      → "+ Einlage / Wechselgeld").
- [ ] Dashboard von FairPOS prüfen, dass keine Fehler vorliegen —
      insbesondere die Kacheln **TSE-Zustand**, **Druckwarteschlange**,
      **Ausstehende Tagesabschlüsse**, **Offene Rechnungen** sowie die
      Warnbanner "⚠ Uhrzeit-Abweichung erkannt" und "⚠ TSE-Ausfall aktiv",
      falls sie erscheinen.
- [ ] Drucker testen (Testdruck an jeder Kasse).
- [ ] **Tägliche rechtliche Vorgabe? (recherchiert, 2026-09-12):** Es
      wurde **keine eigenständige, tagesbezogene gesetzliche
      Prüfpflicht** vor Verkaufsbeginn gefunden — die einschlägigen
      Normen (§ 146 Abs. 1 AO "täglich festzuhalten", GoBD) verpflichten
      zur vollständigen, zeitnahen **Erfassung** der Geschäftsvorfälle des
      Tages und zum täglichen Kassenabschluss (siehe Abschnitt 3), nicht
      zu einer bestimmten Vorab-Prüfroutine. Die obigen Punkte
      (Dashboard, Drucker, Wechselgeld) sind rein betriebliche
      Vorsichtsmaßnahmen, keine Compliance-Pflicht.

---

## 3. Jeden Veranstaltungstag — nach Abschluss

- [ ] Ggf. überzählig oder falsch gedruckte Bons in der korrekten Kasse
      stornieren (Bonstorno, siehe `docs/Manueller-Testplan.md` Abschnitt
      7 für den technischen Ablauf).
- [ ] Prüfen, ob es offene Tischrechnungen gibt (Dashboard-Kachel "Offene
      Rechnungen" bzw. Auswertungen → Offene Positionen) und entsprechend
      behandeln.
- [ ] Kassenabschluss (Z-Bon) für jede Kasse durchführen (Kassen →
      jeweilige Kasse → Tagesabschluss).
- [ ] Z-Bon und DSFinV-K-Export archivieren (Auswertungen → DSFinV-K).
- [ ] Tagesexport Excel (Auswertungen → Excel-Export) und Tagesexport
      Rechnungen (Auswertungen → Rechnungs-PDFs (ZIP)) ziehen und sichern.
- [ ] **Rechtliche Vorgabe zur Datenarchivierung/-sicherung, insbesondere
      zur Häufigkeit (recherchiert, 2026-09-12):** § 147 AO
      (gesetze-im-internet.de/ao_1977/__147.html) verlangt in Abs. 2 Nr. 2,
      dass aufbewahrungspflichtige Unterlagen während der gesamten
      10-jährigen Frist "jederzeit verfügbar sind, unverzüglich lesbar
      gemacht und maschinell ausgewertet werden können" — das ist eine
      Anforderung an die **Abrufbarkeit während der gesamten Frist**, keine
      Vorgabe zur **Häufigkeit der Sicherung** selbst (kein "täglich zu
      sichern" oder Ähnliches im Gesetzestext gefunden). Eine
      Volltextprüfung des BMF-GoBD-Schreibens selbst war wegen
      Bot-Schutzes der BMF-Webseite nicht möglich (siehe bereits
      `docs/Rechtliche-Anforderungen.md` Abschnitt 5 zur selben
      Einschränkung) — eine explizite GoBD-Frequenzvorgabe kann daher
      nicht mit letzter Sicherheit ausgeschlossen werden, wurde aber in
      keiner der zugänglichen offiziellen Quellen (§ 146/§ 147 AO,
      DSFinV-K v2.4) gefunden. **Die tägliche Sicherung ist damit eine
      dringend empfohlene betriebliche Vorsichtsmaßnahme, keine
      nachgewiesene eigenständige Tages-Rechtspflicht** — ihr Zweck ist,
      der ohnehin bestehenden 10-Jahres-Aufbewahrungspflicht (§ 147 AO,
      siehe `docs/Rechtliche-Anforderungen.md` Abschnitt 4) zuverlässig
      nachzukommen, ohne auf einen möglichen späteren Geräte-/Datenverlust
      angewiesen zu sein. Konkretes Vorgehen (Backup-Konzept,
      TSE-Rohdatenexport): `docs/Organisatorische-Anleitung.md` Abschnitt
      3 — dort bereits als Empfehlung "idealerweise direkt nach jedem
      Tagesabschluss" hinterlegt.

---

## 4. Nach der Veranstaltung

- [ ] Datensicherung: vollständiges Datenbank-Backup und
      TSE-Rohdatenexport ziehen und auf externem Medium ablegen (siehe
      `docs/Organisatorische-Anleitung.md` Abschnitt 3) — **dieselbe
      Backup-Pflicht wie beim täglichen Abschluss** (Abschnitt 3 oben),
      hier lediglich am Ende der Veranstaltung angewendet; es wurde bei
      der Recherche kein darüber hinausgehender, veranstaltungsende-
      spezifischer gesetzlicher Zusatzpunkt gefunden.
- [ ] TSE beim Finanzamt abmelden, falls sie weitergegeben/zurückgegeben
      wird oder geplant ist, sie zunächst in einem anderen Verein
      (z. B. Förderverein vs. Hauptverein) zu nutzen — Frist ebenfalls
      **ein Monat** nach Außerbetriebnahme (§ 146a Abs. 4 AO, siehe
      `docs/Organisatorische-Anleitung.md` Abschnitt 1). Wird die TSE im
      selben Verein weiterbetrieben (nächste Veranstaltung), ist keine
      Abmeldung nötig.

---

## Diese Liste aktuell halten

Neue FairPOS-Funktionen, die einen der obigen Schritte betreffen (z. B.
neue Dashboard-Kacheln, neue Exportformate), hier nachziehen — analog zu
`docs/Manueller-Testplan.md`s Hinweis "Diese Liste aktuell halten".
