-- Task #95, Phase 2.5: floor plan (floor_plan_column, floor_plan_row,
-- dining_table) becomes a child of the event. floor_plan_column/
-- floor_plan_row use their label as primary key, referenced directly by
-- dining_table -- event-scoping widens both the primary keys and the FKs
-- to the composite (event_id, label), so the same label can be reused
-- across events.

-- 1. New structure: add event_id everywhere.
ALTER TABLE floor_plan_column ADD COLUMN event_id UUID REFERENCES event(id);
ALTER TABLE floor_plan_row    ADD COLUMN event_id UUID REFERENCES event(id);
ALTER TABLE dining_table      ADD COLUMN event_id UUID REFERENCES event(id);

-- 2. Migrate data: backfill everything onto the Altbestand event.
UPDATE floor_plan_column SET event_id = (SELECT id FROM event WHERE name = 'Altbestand') WHERE event_id IS NULL;
UPDATE floor_plan_row    SET event_id = (SELECT id FROM event WHERE name = 'Altbestand') WHERE event_id IS NULL;
UPDATE dining_table      SET event_id = (SELECT id FROM event WHERE name = 'Altbestand') WHERE event_id IS NULL;

ALTER TABLE floor_plan_column ALTER COLUMN event_id SET NOT NULL;
ALTER TABLE floor_plan_row    ALTER COLUMN event_id SET NOT NULL;
ALTER TABLE dining_table      ALTER COLUMN event_id SET NOT NULL;

-- 3. Remove old (global) structure, replace with per-event equivalents.
ALTER TABLE dining_table DROP CONSTRAINT dining_table_col_label_fkey;
ALTER TABLE dining_table DROP CONSTRAINT dining_table_row_label_fkey;
ALTER TABLE dining_table DROP CONSTRAINT dining_table_col_label_row_label_key;

ALTER TABLE floor_plan_column DROP CONSTRAINT floor_plan_column_pkey;
ALTER TABLE floor_plan_column ADD PRIMARY KEY (event_id, label);
ALTER TABLE floor_plan_column DROP CONSTRAINT floor_plan_column_col_order_key;
ALTER TABLE floor_plan_column ADD CONSTRAINT floor_plan_column_event_id_col_order_key UNIQUE (event_id, col_order);

ALTER TABLE floor_plan_row DROP CONSTRAINT floor_plan_row_pkey;
ALTER TABLE floor_plan_row ADD PRIMARY KEY (event_id, label);
ALTER TABLE floor_plan_row DROP CONSTRAINT floor_plan_row_row_order_key;
ALTER TABLE floor_plan_row ADD CONSTRAINT floor_plan_row_event_id_row_order_key UNIQUE (event_id, row_order);

ALTER TABLE dining_table ADD CONSTRAINT dining_table_event_id_col_label_fkey
  FOREIGN KEY (event_id, col_label) REFERENCES floor_plan_column(event_id, label) ON DELETE CASCADE;
ALTER TABLE dining_table ADD CONSTRAINT dining_table_event_id_row_label_fkey
  FOREIGN KEY (event_id, row_label) REFERENCES floor_plan_row(event_id, label) ON DELETE CASCADE;
ALTER TABLE dining_table ADD CONSTRAINT dining_table_event_id_col_label_row_label_key
  UNIQUE (event_id, col_label, row_label);
