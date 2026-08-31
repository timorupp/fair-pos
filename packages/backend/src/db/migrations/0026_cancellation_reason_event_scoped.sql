-- Task #95, Phase 2.6: cancellation_reason becomes a child of the event.

ALTER TABLE cancellation_reason ADD COLUMN event_id UUID REFERENCES event(id);

UPDATE cancellation_reason
   SET event_id = (SELECT id FROM event WHERE name = 'Altbestand')
 WHERE event_id IS NULL;

ALTER TABLE cancellation_reason ALTER COLUMN event_id SET NOT NULL;
