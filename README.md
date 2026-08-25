# FairPOS

Kassensystem für Vereine, die bei Veranstaltungen und Festen (Volksfeste,
Vereinsfeiern) kassieren müssen und dabei die deutschen gesetzlichen
Vorgaben für elektronische Aufzeichnungssysteme (KassenSichV) einhalten
wollen. Kommerzielle Kassenlösungen sind für den seltenen, ehrenamtlichen
Einsatz eines Vereins oft unverhältnismäßig teuer — FairPOS ist der Versuch,
eine kostenlose, selbst betriebene Alternative bereitzustellen.

Kernfunktionen: Bonkasse (Selbstabholer-Kassieren mit Sofortdruck) und
Bedienungskasse (Bestellung am Tisch, Kassieren später), Anbindung an eine
Swissbit-USB-TSE zur gesetzlich vorgeschriebenen Signierung, DSFinV-K-Export
für die Finanzverwaltung, Tagesabschluss (Z-Bon), Auswertungen. Läuft
nativ auf einem eigenen Ubuntu-Server, ohne Cloud-Anbindung, ohne laufende
Kosten außer der Hardware — dazu zählt insbesondere die Swissbit-USB-TSE
selbst (Anschaffung + Vertrag, sofern eine TSE-Pflicht gilt und genutzt
werden soll). Außerhalb Deutschlands ohne vergleichbare TSE-Pflicht, oder
für reine Testinstallationen, kann man auch ganz ohne TSE betreiben — dann
bleiben Belege unsigniert, was FairPOS als explizit unterstützten Zustand
behandelt (kein Absturz, nur ein Warnhinweis).

## Haftungsausschluss

**Nutzung auf eigenes Risiko.** FairPOS wird von Freiwilligen entwickelt,
ohne Gewähr und ohne jede Garantie — insbesondere garantieren wir **nicht**,
dass die Software die Anforderungen der KassenSichV, GoBD, AO oder anderer
gesetzlicher Vorgaben tatsächlich vollständig und fehlerfrei erfüllt (siehe
auch die Gewährleistungsausschluss-Klauseln in der [LICENSE](LICENSE),
Abschnitte 15/16). Für die steuerliche/rechtliche Absicherung eures Vereins
bleibt ihr selbst verantwortlich — im Zweifel Steuerberatung hinzuziehen.

Die Software orientiert sich **generell an deutschem Recht** und wurde mit
dem ernsthaften Versuch entwickelt, die einschlägigen Vorgaben abzubilden —
eine ehrliche, detaillierte Aufstellung, was konkret umgesetzt wurde und wo
bewusst Vereinfachungen/Annahmen getroffen wurden, steht in
[docs/Rechtliche-Anforderungen.md](docs/Rechtliche-Anforderungen.md).

> ⚠️ **Für den echten TSE-Betrieb wird zusätzlich das Swissbit-TSE-SDK
> benötigt — das ist proprietär und liegt NICHT in diesem Repo.** Ihr müsst
> es euch über euren eigenen Swissbit-Vertrag besorgen (siehe
> `packages/backend/native/tse-cli/vendor/PLACE_SDK_FILES_HERE.txt` für die
> genaue Dateiliste, `docs/TSE-Integration.md` Abschnitt 3 für den
> Hintergrund). Ohne dieses SDK lässt sich `tseCli` nicht bauen (Abschnitt
> 8.1 der Installationsanleitung) — bitte das **vor** Beginn der
> Produktionsinstallation klären, nicht erst nach vielen Schritten
> feststellen.

## Dokumentation

| Dokument | Inhalt |
|----------|--------|
| [docs/Anforderungen.md](docs/Anforderungen.md) | Fachliche Anforderungen |
| [docs/Datenmodell.dbml](docs/Datenmodell.dbml) | Datenbankschema (dbdiagram.io) |
| [docs/Dictionary.md](docs/Dictionary.md) | Deutsch ↔ Englisch Übersetzungsreferenz |
| [docs/SETUP.md](docs/SETUP.md) | Setup, Architektur, Deployment |
| [docs/Installationsanleitung.md](docs/Installationsanleitung.md) | Schritt-für-Schritt-Produktionsinstallation (native Ubuntu) |
| [docs/TSE-Integration.md](docs/TSE-Integration.md) | TSE-Architekturkonzept |
| [docs/Rechtliche-Anforderungen.md](docs/Rechtliche-Anforderungen.md) | KassenSichV-/GoBD-/DSFinV-K-Rechtsgrundlagen |
| [docs/Organisatorische-Anleitung.md](docs/Organisatorische-Anleitung.md) | Betriebsabläufe (ELSTER-Meldung, Backup, Verfahrensdokumentation) |
| [docs/Manueller-Testplan.md](docs/Manueller-Testplan.md) | Checkliste für den manuellen Regressionstest |
| [TASKS.md](TASKS.md) | Aufgabenliste (offen + Historie) |
| [DANGER.md](DANGER.md) | Bekannte Risiken, Refactoring-Bedarf |

## Schnellstart

```bash
cp .env.example .env
# .env anpassen (Passwörter, DATABASE_URL auf localhost)

docker compose up -d   # nur PostgreSQL, Backend/Frontend laufen nativ
npm install
npm run db:migrate
npm run db:seed -- admin dein-passwort   # erster Admin-Benutzer, sonst kein Login möglich
npm run dev
```

Weitere Details: [docs/SETUP.md](docs/SETUP.md) (Entwicklung) bzw.
[docs/Installationsanleitung.md](docs/Installationsanleitung.md) (Produktion, native Ubuntu-Installation).

## Lizenz

FairPOS ist Open Source unter der [GNU Affero General Public License v3.0](LICENSE)
(AGPL-3.0-or-later), © FairPOS Contributors. Bewusst gewählt, weil Vereine
sich FairPOS-Server gegenseitig „ausleihen" können (siehe Anforderungen) —
die AGPL stellt sicher, dass Änderungen auch bei reiner Netzwerknutzung
(nicht nur bei klassischer Weitergabe) offen bleiben.

Das proprietäre Swissbit-TSE-SDK (siehe oben) ist **nicht** Teil von FairPOS
und unterliegt einer eigenen, separaten Lizenzvereinbarung mit Swissbit.
