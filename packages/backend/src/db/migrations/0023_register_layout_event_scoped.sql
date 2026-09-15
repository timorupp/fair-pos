-- Task #95, Phase 2.3: register_layout becomes a child of the event.
-- register_layout_slot needs no column of its own — it's already scoped
-- transitively via register_layout_id.

ALTER TABLE register_layout ADD COLUMN event_id UUID REFERENCES event(id);

UPDATE register_layout
   SET event_id = (SELECT id FROM event WHERE name = 'Altbestand')
 WHERE event_id IS NULL;

ALTER TABLE register_layout ALTER COLUMN event_id SET NOT NULL;
