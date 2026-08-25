# FairPOS

KassenSichV-konformes Kassensystem für Vereine.

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
