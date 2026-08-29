-- Per-slot overrides for the register-layout editor (Task #91 follow-up):
-- a custom button label (falls back to the article name when unset) and a
-- "hidden" flag to temporarily pull an article off the Bonkasse/Bedienung
-- grid without losing its position/color/label — same soft-hide precedent
-- as user.is_active/register.is_active, filtered out server-side rather
-- than client-side (see register-session.ts).
ALTER TABLE register_layout_slot ADD COLUMN label VARCHAR(200);
ALTER TABLE register_layout_slot ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT false;
