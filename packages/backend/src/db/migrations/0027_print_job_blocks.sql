-- Task #105: unified print-block model for all print jobs (receipt, Z-Bon,
-- order slip, test print, PIN slip). `content` (pre-rendered ESC/POS bytes,
-- base64) stays unchanged and is still what the print worker sends as-is;
-- `blocks` is the neutral, format-independent document description each job
-- was built from, stored so the admin UI can generically re-render ANY job
-- as a PDF preview or reprint it, without needing to reload/regenerate from
-- the job's original source data (which is impossible for a PIN slip — the
-- PIN itself is never persisted anywhere except in the print bytes/blocks).
--
-- No data migration: pre-release, existing print_job rows predate the block
-- model entirely and cannot be backfilled meaningfully — truncated instead
-- (Nutzervorgabe 2026-09-01: "kein Migrations-Aufwand für alte Druckaufträge
-- nötig, wir können die Tabelle leeren").
TRUNCATE TABLE print_job;

ALTER TABLE print_job ADD COLUMN blocks JSONB NOT NULL DEFAULT '[]'::jsonb;
