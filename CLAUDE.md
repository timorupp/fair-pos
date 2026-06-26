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

### Inline-Dokumentation (JSDoc, Englisch)

Über jeder exportierten Funktion, Methode und jedem benannten Objekt
(Klasse, Interface, Type) steht ein **JSDoc-Block auf Englisch** mit:

1. Beschreibung dessen, was die Funktion tut.
2. Pro Eingangsparameter eine `@param`-Zeile.
3. Eine `@returns`-Zeile (entfällt nur bei `void`).
4. Für Types/Interfaces reicht eine Beschreibung; einzelne Felder erhalten
   inline JSDoc, wenn ihr Zweck nicht aus dem Namen ersichtlich ist.

```typescript
/**
 * Computes the next receipt number from the existing maximum
 * and the configured starting counter.
 *
 * @param existingMax - Current max receipt_number in the database, or
 *   `null` if no invoices exist yet.
 * @param configuredStart - Counter start value from system settings.
 * @returns The next sequential receipt number to assign.
 */
export function computeNextReceiptNumber(
  existingMax: number | null,
  configuredStart: number,
): number { ... }

/** Shared PostgreSQL connection pool. Reused across the application lifetime. */
export const pool = new pg.Pool(...);
```

**Pflicht bei Signaturänderung:** Wird eine Funktion umbenannt, ein
Parameter hinzugefügt/entfernt/umtypisiert oder der Rückgabewert
geändert, **muss** der JSDoc-Block in derselben Änderung mitgepflegt
werden. Veraltete `@param`-Zeilen für nicht mehr existierende Parameter
sind ein Defekt.

**Ausnahmen** (kein JSDoc erforderlich):
- Triviale Pfeilfunktionen innerhalb größerer Funktionen
- Offensichtliche Getter ohne Parameter

**Warum:** Zukünftige Administratoren haben möglicherweise keinen
deutschsprachigen Programmier-Hintergrund; vollständige Parameter-Docs
erscheinen als IDE-Hover-Tooltips und machen Signaturen selbst-
dokumentierend; explizite Return-Doku fängt stille Vertragsbrüche bei
Refactorings ab.

### Tests (Pflicht parallel zur Implementierung)

Zwei Test-Kategorien laufen nebeneinander:

- **Unit-Tests** (`*.test.ts`) für reine Funktionen — `npm test`.
- **Integration-Tests** (`*.integration.test.ts`) für DB-getriebene Pfade —
  `npm run test:integration`. Startet einen Postgres-Container über
  `testcontainers` (siehe `src/test/global-setup.ts`); pro Test wird mit
  `truncateAllTables()` aufgeräumt.

**Beim Schreiben eines neuen Features gehören die Tests zur selben Änderung:**

- Reine Helfer/Aggregations-/Format-Funktionen → Unit-Test.
- Route-Handler, DB-Helpers, Bootstrap-Hooks → Integration-Test.

Beide Suiten müssen vor jedem Commit grün sein.

### Datenbank-Migrationen

Schema-Änderungen werden **immer** als neue, nummerierte SQL-Datei in
`packages/backend/src/db/migrations/` angelegt (z.B. `0008_add_xyz.sql`).
Die Nummer ist `max+1` der existierenden Dateien.

**Niemals** rückwirkend an einer bereits ausgelieferten Migration schrauben —
der Runner trackt angewendete Dateien per Dateiname in `schema_migrations`,
nachträgliche Änderungen werden ignoriert und führen zu Schema-Drift in
existierenden DBs.

Bei strukturellen Refactors (Spalten umbenennen, Tabellen umbauen): drei
Schritte in einer Migration — neue Struktur anlegen, Daten migrieren, alte
Struktur entfernen. So bleiben bestehende Daten erhalten.

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
