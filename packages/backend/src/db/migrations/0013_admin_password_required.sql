-- An administrator must always have a real, known password_hash (checked
-- for the "Systemverwaltung" step-up in POST /api/auth/admin/verify), while
-- a non-admin user never logs in with one at all (PIN-only, Task #90) — so
-- password_hash no longer needs to be NOT NULL, and NULL now means "no real
-- password set" for the has-password checks in POST/PUT /api/admin/users.
ALTER TABLE "user" ALTER COLUMN password_hash DROP NOT NULL;

-- Existing non-admin users only ever got an unguessable random placeholder
-- hash (nobody knows it, it was never meant to be used) — null it out so it
-- doesn't read as "has a real password" if the user is later promoted to
-- admin.
UPDATE "user" SET password_hash = NULL WHERE is_admin = false;
