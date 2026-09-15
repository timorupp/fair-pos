-- Split-Horizon event scoping (Task #95), foundations.
--
-- Auto-creates a dummy "Altbestand" event to which all pre-existing data
-- will be assigned once the per-table migrations (Task #95, Phase 2) add
-- their event_id columns — a wide date range so any still-time-range-based
-- report logic keeps finding it.
--
-- Only created when there is actually pre-existing data to migrate — a
-- brand-new, empty database has nothing that needs an "Altbestand" event,
-- and starting a fresh install with a fake leftover event would be
-- confusing. In that case `active_event_id` also stays unset; the first
-- System-Administrator creates and activates their own first real event
-- (config.activeEventId simply stays null until then — every event-scoped
-- read/write already handles that gracefully, see system/activeEvent.ts).
DO $$
DECLARE
  has_existing_data boolean;
  altbestand_id uuid;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM article_category
    UNION ALL SELECT 1 FROM article
    UNION ALL SELECT 1 FROM register_layout
    UNION ALL SELECT 1 FROM register
    UNION ALL SELECT 1 FROM floor_plan_column
    UNION ALL SELECT 1 FROM floor_plan_row
    UNION ALL SELECT 1 FROM dining_table
    UNION ALL SELECT 1 FROM cancellation_reason
  ) INTO has_existing_data;

  IF has_existing_data THEN
    INSERT INTO event (name, start_time, end_time)
    VALUES ('Altbestand', '2020-01-01T00:00:00Z', now())
    RETURNING id INTO altbestand_id;

    -- The one globally active event — everything V-scoped operates against
    -- whichever event this points to. Initialized to the just-created
    -- Altbestand event so an existing deployment keeps working unchanged
    -- immediately after this migration runs.
    INSERT INTO system_setting (key, value) VALUES ('active_event_id', altbestand_id::text);
  END IF;
END $$;
