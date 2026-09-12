-- ─────────────────────────────────────────────────────────────────────────────
-- 0036 — Einlage/Entnahme-Funktion entfernt (Task #143, Nutzervorgabe 2026-09-12)
--
-- `cash_transaction` (Einlagen/Entnahmen) wurde nie an den Kassenabschluss
-- angebunden — keine TSE-Signatur, kein Bezug zu `daily_closing`, kein
-- DSFinV-K-Export (siehe D-075-Diskussion). Der Nutzer hat entschieden, die
-- Funktion ganz zu entfernen statt sie nachträglich compliance-konform
-- auszubauen. Bewusste Entscheidung, auch vorhandene Produktivdaten mit
-- fallen zu lassen (kein Migrations-Backup nötig) — siehe BACKLOG-DONE.md
-- Task #143.
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE cash_transaction;
