-- ─────────────────────────────────────────────────────────────────────────────
-- 0003 — company_logo (singleton)
--
-- Eine kleine Tabelle, die das hochgeladene Vereinslogo in zwei vorgerenderten
-- Varianten speichert:
--   - `pdf_data`    — Originalbild (PNG) für den PDF-Renderer
--   - `escpos_data` — bereits in 1-Bit-Monochrom konvertiertes ESC/POS-Raster,
--                    fertig zum Einbetten in den Druckerstream
-- So muss kein Renderer das Bild zur Druckzeit konvertieren.
--
-- CHECK (id = 1) erzwingt, dass es maximal eine Zeile gibt — ein Verein hat ein
-- Logo, nicht mehrere.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE company_logo (
  id          SMALLINT     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  pdf_data    BYTEA        NOT NULL,
  escpos_data BYTEA        NOT NULL,
  /** Width × height in pixels of the (already-resized) PDF variant — used by the renderer to know the actual aspect. */
  pdf_width   INT          NOT NULL,
  pdf_height  INT          NOT NULL,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
