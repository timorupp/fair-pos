-- Second admin tier (Task #94): Veranstaltungs-Administrator alongside the
-- existing System-Administrator (is_admin, unchanged). A user can hold
-- either, both, or neither.
ALTER TABLE "user" ADD COLUMN is_event_admin BOOLEAN NOT NULL DEFAULT false;
