-- Per-event default register layout (Task #95): previously a single global
-- system_setting pair (default_layout_receipt_register/
-- default_layout_service_register) — moved onto `event` directly, since
-- register_layout itself becomes event-scoped in a later migration and a
-- global default pointing at one event's layout would stop making sense.

ALTER TABLE event ADD COLUMN default_receipt_register_layout_id UUID REFERENCES register_layout(id);
ALTER TABLE event ADD COLUMN default_service_register_layout_id UUID REFERENCES register_layout(id);

-- Carry over any previously configured global default onto the (so far
-- only) Altbestand event, so nothing changes in behaviour immediately
-- after this migration runs.
UPDATE event
   SET default_receipt_register_layout_id = (
     SELECT value::uuid FROM system_setting WHERE key = 'default_layout_receipt_register'
   )
 WHERE name = 'Altbestand'
   AND EXISTS (SELECT 1 FROM system_setting WHERE key = 'default_layout_receipt_register' AND value <> '');

UPDATE event
   SET default_service_register_layout_id = (
     SELECT value::uuid FROM system_setting WHERE key = 'default_layout_service_register'
   )
 WHERE name = 'Altbestand'
   AND EXISTS (SELECT 1 FROM system_setting WHERE key = 'default_layout_service_register' AND value <> '');

DELETE FROM system_setting WHERE key IN ('default_layout_receipt_register', 'default_layout_service_register');
