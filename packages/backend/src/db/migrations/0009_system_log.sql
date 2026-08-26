-- ─────────────────────────────────────────────────────────────────────────────
-- 0009 — system_log (generisches System-Ereignisprotokoll)
--
-- Task #64: die TSE-Gesundheitsprüfung (packages/backend/src/tse/healthJob.ts)
-- ist der erste Schreiber, die Tabelle ist aber bewusst generisch gehalten
-- (severity/category/message statt TSE-spezifischer Spalten), damit künftige
-- automatisierte Checks/Background-Jobs denselben Log ohne Schema-Änderung
-- mitnutzen können. Admin-UI-Log-Viewer: packages/backend/src/routes/admin/logs.ts.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE system_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  severity   VARCHAR(20) NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
  category   VARCHAR(50) NOT NULL,
  message    TEXT        NOT NULL
);

CREATE INDEX ON system_log (created_at);
CREATE INDEX ON system_log (category);
