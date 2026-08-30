-- ─────────────────────────────────────────────────────────────────────────────
-- 0006 — tse_outage (automatisierte Ausfall-Dokumentation)
--
-- AEAO zu § 146a AO, Nr. 1.14.1: Ausfallzeiten und -grund einer TSE sind zu
-- dokumentieren; die Dokumentation kann automatisiert durch das elektronische
-- Aufzeichnungssystem erfolgen. Diese Tabelle ist genau das: jede fehlgeschlagene
-- oder mangels Konfiguration übersprungene TSE-Signierung öffnet (falls noch
-- keine offene Zeile existiert) eine Zeile mit `started_at` + `reason`; die
-- nächste erfolgreiche Signierung schließt sie mit `ended_at`. Siehe
-- packages/backend/src/tse/outage.ts und docs/TSE-Integration.md Abschnitt 8.1.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE tse_outage (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at   TIMESTAMPTZ,
  reason     TEXT        NOT NULL
);

-- At most one open (ended_at IS NULL) row at a time — enforced in the DB, not
-- just in application logic, because concurrent checkouts can fail their TSE
-- call around the same time: two `recordTseFailure` calls could otherwise both
-- pass a "does an open row already exist?" check before either commits and
-- insert two open rows. The `(true)` expression is the standard Postgres
-- pattern for "unique among the filtered rows" when there's no natural column
-- to key on. `recordTseFailure` relies on this via `ON CONFLICT ... DO NOTHING`.
CREATE UNIQUE INDEX tse_outage_one_open_idx ON tse_outage ((true)) WHERE ended_at IS NULL;
