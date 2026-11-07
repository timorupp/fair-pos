-- ─────────────────────────────────────────────────────────────────────────────
-- 0038 — Kleinunternehmerregelung (§ 19 UStG), Task #119
--
-- Two independent additions:
--
-- 1) invoice.is_kleinunternehmer — frozen at sale time (Task #112-style
--    snapshot, `receipt/data.ts::snapshotCompanyDataForInvoice`), so toggling
--    the `kleinunternehmer_enabled` system_setting later never rewrites the
--    legal status of an already-issued receipt. NOT NULL DEFAULT false: unlike
--    the nullable Task #112 company-data columns, there is no pre-feature
--    historical state to distinguish — every invoice before this migration
--    was necessarily issued under normal (non-Kleinunternehmer) taxation.
--
-- 2) order_item.deposit_tax_category — the Pfand-taxation counterpart to the
--    existing `tax_rate`/`tax_category` snapshot (Task #110), needed because
--    Pfand's tax category was never actually stored anywhere: four (really
--    five, see below) call sites hardcoded the literal 'standard' instead
--    (Task #113 — Pfand always taxed at the Regelsteuersatz, independent of
--    the article's own category). That hardcoding made it structurally
--    impossible to ever classify Pfand as `zero` for a Kleinunternehmer sale.
--    This column freezes the deposit's actual category per line, exactly like
--    `tax_category` already does for the article portion — nullable, since
--    not every order_item carries a deposit at all.
--
--    Call sites updated to read this column instead of the hardcoded literal:
--    `closing/totals.ts`, `receipt/format.ts`, `receipt/blocks.ts`,
--    `exports/dsfinvk/rows.ts`, and `tse/processData.ts` (this last one was
--    not yet listed in BACKLOG.md Task #119 — found during this analysis:
--    `buildKassenbelegProcessData` also unconditionally bucketed deposit
--    amounts into the `allgemein` TSE slot).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE invoice ADD COLUMN is_kleinunternehmer BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE order_item ADD COLUMN deposit_tax_category VARCHAR(10)
  CHECK (deposit_tax_category IN ('zero', 'reduced', 'standard'));
