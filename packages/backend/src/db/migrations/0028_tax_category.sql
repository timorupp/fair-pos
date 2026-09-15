-- Task #110: USt-Sätze als Einstellung statt Freitext — schließt die
-- Regelsteuersatz-Änderungslücke. article_category.tax_rate (freier
-- Prozentwert) wird durch tax_category (feste Kategorie: zero/reduced/
-- standard) ersetzt; die tatsächlichen Prozentsätze für reduced/standard
-- leben ab jetzt als system_setting (vat_rate_reduced/vat_rate_standard,
-- siehe routes/admin/settings.ts), nicht mehr im Schema.
--
-- order_item bekommt zusätzlich zum bereits vorhandenen tax_rate (Snapshot
-- des Prozentwerts zum Verkaufszeitpunkt) die Spalte tax_category (Snapshot
-- der Kategorie) — beide zusammen lassen taxSlot()/ustSchluessel()/
-- computeClosingTotals() nach Kategorie statt nach geratener Zahl
-- verzweigen, ohne die historische Prozentzahl selbst zu verlieren.
--
-- Task #113: Pfand unterliegt in Deutschland immer dem Regelsteuersatz,
-- unabhängig vom Steuersatz des Artikels. order_item bekommt dafür
-- deposit_tax_rate — der zum Verkaufszeitpunkt gültige Regelsteuersatz,
-- getrennt vom Artikel-eigenen tax_rate/tax_category.
--
-- Backfill-Entscheidung (Nutzervorgabe 2026-09-03): ein bestehender
-- tax_rate-Wert, der zu keiner der drei Kategorien passt, wird ohne
-- Sonderbehandlung auf 'zero' abgebildet — im System sind aktuell
-- ausschließlich Testdaten vorhanden, kein Produktivrisiko.

-- ── article_category: tax_rate → tax_category ──────────────────────────────

ALTER TABLE article_category ADD COLUMN tax_category VARCHAR(10);

UPDATE article_category SET tax_category = CASE
  WHEN tax_rate = 19 THEN 'standard'
  WHEN tax_rate = 7  THEN 'reduced'
  ELSE 'zero'
END;

ALTER TABLE article_category
  ALTER COLUMN tax_category SET NOT NULL,
  ADD CONSTRAINT article_category_tax_category_check
    CHECK (tax_category IN ('zero', 'reduced', 'standard'));

ALTER TABLE article_category DROP COLUMN tax_rate;

-- ── order_item: tax_category (Artikel-Anteil) + deposit_tax_rate (Pfand-Anteil) ──

ALTER TABLE order_item ADD COLUMN tax_category VARCHAR(10);

UPDATE order_item SET tax_category = CASE
  WHEN tax_rate = 19 THEN 'standard'
  WHEN tax_rate = 7  THEN 'reduced'
  ELSE 'zero'
END;

ALTER TABLE order_item
  ALTER COLUMN tax_category SET NOT NULL,
  ADD CONSTRAINT order_item_tax_category_check
    CHECK (tax_category IN ('zero', 'reduced', 'standard'));

ALTER TABLE order_item ADD COLUMN deposit_tax_rate DECIMAL(5,2);

-- Bestehende Zeilen mit Pfand: der zum Zeitpunkt dieser Migration gültige
-- Regelsteuersatz (19 %) — Testdaten, siehe Backfill-Entscheidung oben.
UPDATE order_item SET deposit_tax_rate = 19
 WHERE deposit_price IS NOT NULL AND deposit_price <> 0;
