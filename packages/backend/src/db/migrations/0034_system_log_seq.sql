-- ─────────────────────────────────────────────────────────────────────────────
-- 0034 — system_log: monoton wachsende Sortier-Spalte (seq)
--
-- D-073 (2026-09-12): der Log-Viewer sortierte bisher nach created_at DESC —
-- verlässlich, solange die Systemuhr nur vorwärts läuft (NTP), aber die
-- etablierte Praxis, die Systemuhr für einen abgelaufenen Dev-TSE-Test
-- manuell zurückzusetzen (siehe docs/TSE-Integration.md), lässt danach
-- geschriebene Zeilen mit einem "älteren" created_at entstehen. Sie tauchten
-- dadurch mitten im Protokoll statt oben auf und wurden live (2026-09-12)
-- dauerhaft übersehen — der TSE-Health-Job selbst arbeitete währenddessen
-- korrekt. `id` (UUID) gibt keine Einfüge-Reihenfolge her, daher eine
-- eigene, rein monoton wachsende Spalte, unabhängig von der Systemuhr.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE system_log ADD COLUMN seq BIGSERIAL;
CREATE INDEX ON system_log (seq);
