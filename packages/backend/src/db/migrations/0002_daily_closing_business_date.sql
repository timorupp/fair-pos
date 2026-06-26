-- ─────────────────────────────────────────────────────────────────────────────
-- 0002 — daily_closing.business_date
--
-- Vorher: Die Logik in `pending-db.ts` hat den abgeschlossenen Tag aus
-- `daily_closing.created_at::date` abgeleitet. Beim Nachholen eines vergangenen
-- Tages (z.B. heute wird der 25.06. abgeschlossen) wird `created_at = now()`
-- gesetzt — also der heutige Tag. Die Pending-Berechnung sah dann den 25.06.
-- weiterhin als offen an und die Kasse blieb gesperrt.
--
-- Lösung: Ein eigener `business_date` (Datum) gibt explizit an, für welchen
-- Kalendertag der Z-Bon gilt. `created_at` bleibt der Erzeugungszeitpunkt
-- (Audit-Trail). Pending-Berechnung verwendet ab jetzt `business_date`.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE daily_closing
  ADD COLUMN business_date DATE;

-- Backfill: für bisherige Zeilen wird der Erzeugungstag als Geschäftstag
-- übernommen — das war ja vorher auch die implizite Annahme.
UPDATE daily_closing
   SET business_date = created_at::date
 WHERE business_date IS NULL;

ALTER TABLE daily_closing
  ALTER COLUMN business_date SET NOT NULL,
  ALTER COLUMN business_date SET DEFAULT current_date;

-- Hinweis: Eine UNIQUE-Constraint (register_id, business_date) wäre logisch
-- konsequent, ist aber bewusst NICHT gesetzt, weil die Test-Datenbank des
-- Entwicklungssystems mehrere Z-Bons mit demselben Backfill-Datum enthalten
-- kann. Der Backend-Code stellt durch die korrigierte Pending-Berechnung
-- sicher, dass `close-pending` einen bereits geschlossenen Tag nicht erneut
-- abschließt. Eine spätere Migration kann den Index nachreichen, sobald
-- echte Daten konsistent sind.
