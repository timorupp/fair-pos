-- ─────────────────────────────────────────────────────────────────────────────
-- 0010 — print_job.status: neuer Wert 'cancelled'
--
-- "Abbrechen" in der Druckwarteschlangen-Admin-UI hat den Datensatz bisher
-- per DELETE spurlos entfernt. Task #79: stattdessen den Status auf
-- 'cancelled' setzen, damit ein abgebrochener Druckauftrag über den
-- bestehenden Status-Filter sichtbar bleibt statt zu verschwinden.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE print_job DROP CONSTRAINT print_job_status_check;
ALTER TABLE print_job ADD CONSTRAINT print_job_status_check
  CHECK (status IN ('pending', 'printing', 'done', 'failed', 'cancelled'));
