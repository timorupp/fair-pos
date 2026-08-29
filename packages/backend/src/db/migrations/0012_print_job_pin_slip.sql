-- ─────────────────────────────────────────────────────────────────────────────
-- 0012 — print_job.type: neuer Wert 'pin_slip'
--
-- "PIN drucken" im PIN-Ändern/-Vergeben-Dialog der Benutzerverwaltung
-- (Task #90 Nachbesserung) — druckt Benutzername + PIN über den
-- Standarddrucker aus, genau wie Testdrucke über denselben print_job-
-- Mechanismus.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE print_job DROP CONSTRAINT print_job_type_check;
ALTER TABLE print_job ADD CONSTRAINT print_job_type_check
  CHECK (type IN ('order_slip', 'receipt', 'daily_closing', 'test_print', 'pin_slip'));
