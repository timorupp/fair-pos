-- ─────────────────────────────────────────────────────────────────────────────
-- 0004 — company_logo: Originalbild zusätzlich speichern
--
-- Damit Zoom-Änderungen ohne Re-Upload möglich sind, behalten wir das
-- ursprünglich hochgeladene Bild. Bei einer Zoom-Anpassung rendert der Server
-- die zwei Druck-Varianten (PDF + ESC/POS) aus diesem Original neu.
--
-- Spalte ist NULL-able für bestehende Zeilen (Migration läuft auf Daten, die
-- vor dem Feature angelegt wurden) — sobald der Operator ein neues Logo
-- hochlädt, wird sie befüllt. Bis dahin gilt: Zoom-Änderung verlangt einen
-- erneuten Upload, weil sonst keine Quelle für das Re-Rendering existiert.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE company_logo ADD COLUMN original_data BYTEA;
