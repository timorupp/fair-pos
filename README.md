# FairPOS

KassenSichV-konformes Kassensystem für Vereine.

## Dokumentation

| Dokument | Inhalt |
|----------|--------|
| [docs/Anforderungen.md](docs/Anforderungen.md) | Fachliche Anforderungen |
| [docs/Datenmodell.dbml](docs/Datenmodell.dbml) | Datenbankschema (dbdiagram.io) |
| [docs/Dictionary.md](docs/Dictionary.md) | Deutsch ↔ Englisch Übersetzungsreferenz |
| [docs/SETUP.md](docs/SETUP.md) | Setup, Architektur, Deployment |

## Schnellstart

```bash
cp .env.example .env
# .env anpassen (Passwörter, DATABASE_URL auf localhost)

docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
npm install
npm run db:migrate
npm run dev
```

Weitere Details: [docs/SETUP.md](docs/SETUP.md)
