-- Task #95, Phase 2.1: article_category becomes a child of the event —
-- every existing category is assigned to the Altbestand event (created in
-- migration 0019). Name uniqueness moves from global to per-event, since
-- two different events reasonably reuse the same category name (e.g.
-- "Getränke") without conflict.

ALTER TABLE article_category ADD COLUMN event_id UUID REFERENCES event(id);

UPDATE article_category
   SET event_id = (SELECT id FROM event WHERE name = 'Altbestand')
 WHERE event_id IS NULL;

ALTER TABLE article_category ALTER COLUMN event_id SET NOT NULL;

ALTER TABLE article_category DROP CONSTRAINT article_category_name_key;
ALTER TABLE article_category ADD CONSTRAINT article_category_event_id_name_key UNIQUE (event_id, name);
