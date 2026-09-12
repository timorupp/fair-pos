-- ─────────────────────────────────────────────────────────────────────────────
-- 0035 — invoice: Firmendaten-/Logo-Snapshot zum Verkaufszeitpunkt (Task #112)
--
-- Firmenname/-adresse/-steuernummer/USt-IdNr. und das Logo wurden bisher bei
-- jedem PDF-Abruf/Reprint live aus system_setting/company_logo geladen
-- (receipt/data.ts) — änderte ein Admin diese Stammdaten später, zeigte eine
-- alte Rechnung die NEUEN statt der zum Verkaufszeitpunkt gültigen Daten
-- (D-058). Die eigentlich fiskalisch relevanten Felder (Beträge, TSE-Daten)
-- waren davon nie betroffen, nur der "Briefkopf".
--
-- Die Textfelder werden direkt auf `invoice` gespeichert (wenige Bytes pro
-- Zeile, vernachlässigbar). Das Logo wird NICHT pro Rechnung dupliziert —
-- `logo_version` ist eine content-adressierte, append-only Tabelle: ein neuer
-- Upload/eine Zoom-Änderung erzeugt nur dann eine neue Zeile, wenn sich der
-- gerenderte Inhalt tatsächlich ändert (`content_hash` ist UNIQUE);
-- unveränderte Rechnungen während eines Events teilen sich dieselbe Zeile.
--
-- NULL auf bestehenden (Alt-)Rechnungen ist bewusst: es gibt keine
-- Möglichkeit, rückwirkend zu rekonstruieren, was zum damaligen
-- Verkaufszeitpunkt tatsächlich galt — `receipt/data.ts` fällt für solche
-- Zeilen weiterhin auf die aktuell gültigen Einstellungen zurück (bestes
-- verfügbares Ergebnis, nur für Änderungen VOR diesem Fix nicht rückwirkend
-- korrekt).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE logo_version (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash     VARCHAR(64)   NOT NULL UNIQUE,
  pdf_data         BYTEA         NOT NULL,
  escpos_data      BYTEA         NOT NULL,
  pdf_width        INT           NOT NULL,
  pdf_height       INT           NOT NULL,
  pdf_width_factor NUMERIC(5,4)  NOT NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

ALTER TABLE invoice
  ADD COLUMN company_name         TEXT,
  ADD COLUMN company_street       TEXT,
  ADD COLUMN company_postal_code  TEXT,
  ADD COLUMN company_city         TEXT,
  ADD COLUMN company_tax_number   TEXT,
  ADD COLUMN company_vat_id       TEXT,
  ADD COLUMN logo_version_id      UUID REFERENCES logo_version(id);
