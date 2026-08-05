# FairPOS

KassenSichV-konformes Kassensystem für Vereine.

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
