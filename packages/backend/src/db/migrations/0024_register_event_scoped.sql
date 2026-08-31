-- Task #95, Phase 2.4: register becomes a child of the event.

ALTER TABLE register ADD COLUMN event_id UUID REFERENCES event(id);

UPDATE register
   SET event_id = (SELECT id FROM event WHERE name = 'Altbestand')
 WHERE event_id IS NULL;

ALTER TABLE register ALTER COLUMN event_id SET NOT NULL;
