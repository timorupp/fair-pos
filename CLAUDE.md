# FairPOS — Claude-Projektkontext

Diese Datei wird von Claude Code automatisch geladen. Sie ersetzt das flüchtige
Session-Memory und bleibt bei Host- oder Session-Wechseln erhalten.
**Bitte aktualisieren, wenn sich Konventionen oder Projektkontext ändern.**

---

## Projekt

**Name:** FairPOS (Arbeitstitel; "Fair" = Volksfest, "POS" = Point of Sale)

**Zweck:** KassenSichV-konformes Kassensystem für Vereine, eingesetzt bei
Veranstaltungen und Festen.

**Kerndokumente** (alle unter `docs/`):
- `docs/Anforderungen.md` — fachliche Anforderungen (maßgeblich)
- `docs/Datenmodell.dbml` — Datenbankschema (dbdiagram.io)
- `docs/Dictionary.md` — Deutsch ↔ Englisch Übersetzungsreferenz (verbindlich)
- `docs/SETUP.md` — Technisches Setup, Architektur, Deployment

---

## Coding Conventions

### Sprache der Bezeichner

Alle Bezeichner im Code und in der Datenbank sind **englisch**:
- Variablen, Funktionen, Klassen, Typen, Interfaces
- Tabellennamen, Spaltennamen, Enum-Werte
- Dateinamen für Quellcode

UI-Texte, Kommentare, Dokumentation und Git-Commit-Messages dürfen deutsch sein.

Übersetzungen immer aus `Dictionary.md` entnehmen, um Konsistenz zu gewährleisten.

### Kommentare

Über jeder Funktion, Methode und jedem Objekt (Klasse, Interface, Type)
steht mindestens ein Kommentar — Minimum: ein erklärender Satz.

```typescript
/** Runs all pending SQL migration files in alphabetical order. */
export async function runMigrations(): Promise<void> { ... }

/** Shared PostgreSQL connection pool. */
export const pool = new pg.Pool(...);
```

**Warum:** Zukünftige Administratoren haben möglicherweise keinen
deutschsprachigen Programmier-Hintergrund; Englisch + Kommentare
maximieren die Wartbarkeit.

---

## Technologie-Stack

| Schicht    | Technologie                                    |
|------------|------------------------------------------------|
| Frontend   | SvelteKit + TypeScript, `adapter-static` (SPA) |
| Backend    | Node.js + Fastify v5                           |
| Datenbank  | PostgreSQL 16, rohes SQL (kein ORM)            |
| Drucken    | ESC/POS über TCP, Print Worker im Backend      |
| TSE        | fiskaltrust Middleware als Docker-Image        |
| Packaging  | npm Workspaces (shared / backend / frontend)   |

---

## Wichtige Architekturentscheidungen

- **Keine ORM** — direkte SQL-Queries via `node-postgres` (`pg`)
- **SPA-Modus** — SvelteKit mit `adapter-static`; Fastify liefert `index.html` als Fallback
- **Print Worker** läuft im selben Node.js-Prozess wie die API (kein separater Service)
- **SSE statt WebSockets** für Echtzeit-Updates (Server → Client)
- **Migrationen** — nummerierte `.sql`-Dateien, eigener Runner, kein Migrationstool
- **Einmal Bestellung, einmal Rechnung** — `order_item` (eine Zeile pro Artikel-Einheit) + `invoice` (Snapshot mit TSE-Daten)
