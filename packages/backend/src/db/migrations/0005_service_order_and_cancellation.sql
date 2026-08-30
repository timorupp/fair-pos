-- ─────────────────────────────────────────────────────────────────────────────
-- 0005 — service_order + order_cancellation (TSE-Vorbereitung)
--
-- Zwei neue Entitäten, die für die spätere TSE-Integration nötig sind, weil
-- die KassenSichV je Vorgang eine eigene TSE-Transaktion verlangt:
--
--  - service_order       → repräsentiert einen Bestellvorgang der Bedienung,
--                          bekommt eine TSE-Signatur vom Typ `AVBestellung`
--  - order_cancellation  → repräsentiert einen Storno offener Positionen
--                          (vor dem Kassieren), TSE-Vorgangstyp `AVSonstige`
--
-- Beide Tabellen tragen die üblichen TSE-Felder — solange keine TSE angebunden
-- ist, bleiben sie NULL. Die tatsächliche Belegung erfolgt in Task #4.
--
-- `order_item` erhält zwei zusätzliche Referenzen:
--  - `service_order_id`     → Bedienungs-Bestellung, aus der die Position
--                             stammt (bei Bonkasse-Positionen: NULL)
--  - `order_cancellation_id` → Stornovorgang, wenn die Position storniert oder
--                              als kostenfrei markiert wurde (sonst NULL)
--
-- Bestehende offene Positionen bekommen einen automatischen Backfill: pro
-- Kombination (register_id, dining_table_id, user_id, Minute) wird eine
-- service_order angelegt und die order_items referenzieren sie. Analog für
-- bereits stornierte Positionen mit cancellation_reason_id.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── service_order (Bedienungsbestellung, AVBestellung) ──────────────────────

CREATE TABLE service_order (
  id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  register_id            UUID          NOT NULL REFERENCES register(id),
  dining_table_id        UUID          REFERENCES dining_table(id),
  user_id                UUID          REFERENCES "user"(id),
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT now(),
  tse_transaction_number BIGINT,
  tse_signature_counter  BIGINT,
  tse_signature          TEXT,
  tse_start_time         TIMESTAMPTZ,
  tse_end_time           TIMESTAMPTZ,
  tse_serial_number      VARCHAR(128)
);

CREATE INDEX ON service_order (dining_table_id);
CREATE INDEX ON service_order (register_id);

-- ── order_cancellation (Storno offener Positionen, AVSonstige) ──────────────

CREATE TABLE order_cancellation (
  id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  register_id            UUID          NOT NULL REFERENCES register(id),
  cancellation_reason_id UUID          NOT NULL REFERENCES cancellation_reason(id),
  cancelled_by           UUID          REFERENCES "user"(id),
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT now(),
  tse_transaction_number BIGINT,
  tse_signature_counter  BIGINT,
  tse_signature          TEXT,
  tse_start_time         TIMESTAMPTZ,
  tse_end_time           TIMESTAMPTZ,
  tse_serial_number      VARCHAR(128)
);

CREATE INDEX ON order_cancellation (register_id);

-- ── order_item erweitern ────────────────────────────────────────────────────

ALTER TABLE order_item
  ADD COLUMN service_order_id      UUID REFERENCES service_order(id),
  ADD COLUMN order_cancellation_id UUID REFERENCES order_cancellation(id);

CREATE INDEX ON order_item (service_order_id);
CREATE INDEX ON order_item (order_cancellation_id);

-- ── Backfill 1: service_order für alle vorhandenen Bedienungs-Positionen ───
--
-- Wir gruppieren order_items nach (register_id, dining_table_id, user_id) plus
-- einem Zeitfenster (Minute), weil Kellner typischerweise mehrere Positionen
-- in einer Interaktion aufnehmen. Das Ergebnis ist zwar nicht perfekt (frühere
-- Bestellungen sind nicht mit sekundengenauer Präzision rekonstruierbar), reicht
-- aber, um die Struktur nachträglich mit Daten zu füllen.

INSERT INTO service_order (register_id, dining_table_id, user_id, created_at)
SELECT register_id,
       dining_table_id,
       user_id,
       MIN(created_at) AS created_at
  FROM order_item
 WHERE dining_table_id IS NOT NULL
 GROUP BY register_id, dining_table_id, user_id, date_trunc('minute', created_at);

-- Jedes order_item mit dining_table_id bekommt seinen service_order zugeordnet.
UPDATE order_item oi
   SET service_order_id = so.id
  FROM service_order so
 WHERE oi.dining_table_id IS NOT NULL
   AND so.dining_table_id = oi.dining_table_id
   AND so.register_id     = oi.register_id
   AND (so.user_id = oi.user_id OR (so.user_id IS NULL AND oi.user_id IS NULL))
   AND date_trunc('minute', oi.created_at) = date_trunc('minute', so.created_at);

-- ── Backfill 2: order_cancellation für bereits stornierte Positionen ────────

INSERT INTO order_cancellation (register_id, cancellation_reason_id, cancelled_by, created_at)
SELECT register_id,
       cancellation_reason_id,
       cancelled_by,
       MIN(COALESCE(cancelled_at, created_at)) AS created_at
  FROM order_item
 WHERE status IN ('cancelled', 'free')
   AND cancellation_reason_id IS NOT NULL
 GROUP BY register_id, cancellation_reason_id, cancelled_by, date_trunc('minute', COALESCE(cancelled_at, created_at));

UPDATE order_item oi
   SET order_cancellation_id = oc.id
  FROM order_cancellation oc
 WHERE oi.status IN ('cancelled', 'free')
   AND oi.cancellation_reason_id IS NOT NULL
   AND oc.register_id = oi.register_id
   AND oc.cancellation_reason_id = oi.cancellation_reason_id
   AND (oc.cancelled_by = oi.cancelled_by OR (oc.cancelled_by IS NULL AND oi.cancelled_by IS NULL))
   AND date_trunc('minute', oc.created_at) = date_trunc('minute', COALESCE(oi.cancelled_at, oi.created_at));
