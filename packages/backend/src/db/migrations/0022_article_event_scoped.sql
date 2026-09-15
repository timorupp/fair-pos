-- Task #95, Phase 2.2: article becomes a child of the event. product_option
-- needs no column of its own — it's already scoped transitively via
-- article_id.

ALTER TABLE article ADD COLUMN event_id UUID REFERENCES event(id);

UPDATE article
   SET event_id = (SELECT id FROM event WHERE name = 'Altbestand')
 WHERE event_id IS NULL;

ALTER TABLE article ALTER COLUMN event_id SET NOT NULL;
