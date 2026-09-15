-- Splits the single total_cancellations column into three economically
-- distinct totals (Nutzervorgabe 2026-09-12, D-068): "Stornierte Rechnungen"
-- (Bonstorno — money actually paid back), "Kostenfreie Warenabgabe" (goods
-- given away, never charged) and "Stornierte Bestellungen" (goods never
-- left, never charged) were previously conflated into one "Stornos/
-- Kostenfrei" bucket, which also hid Bonstorno from total_gross/total_cash
-- entirely (see D-068 for the full bug history).
--
-- Historical rows: no production data exists yet (Nutzervorgabe 2026-09-12:
-- "keine Rücksicht, da nur Testdaten, DB wird vor Echtbetrieb ohnehin
-- zurückgesetzt") — existing total_cancellations is moved wholesale into
-- total_free; total_order_cancellations/total_bonstorno default to 0 for
-- already-existing rows. No attempt to reconstruct the historical split
-- from order_item — deliberately not worth the complexity for pre-production
-- data.

ALTER TABLE daily_closing ADD COLUMN total_bonstorno DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE daily_closing ADD COLUMN total_free DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE daily_closing ADD COLUMN total_order_cancellations DECIMAL(12,2) NOT NULL DEFAULT 0;

UPDATE daily_closing SET total_free = total_cancellations;

ALTER TABLE daily_closing ALTER COLUMN total_bonstorno DROP DEFAULT;
ALTER TABLE daily_closing ALTER COLUMN total_free DROP DEFAULT;
ALTER TABLE daily_closing ALTER COLUMN total_order_cancellations DROP DEFAULT;

ALTER TABLE daily_closing DROP COLUMN total_cancellations;
