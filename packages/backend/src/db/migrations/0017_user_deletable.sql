-- Users become deletable (Task #97): historical/audit references to "user"
-- are replaced with plain text name-snapshots, taken at booking time,
-- instead of a foreign key — analog to the existing article_name/
-- article_category_name pattern on order_item. This means a user row no
-- longer needs to be kept forever just because it was once referenced by a
-- booking; the booking itself keeps the name regardless of what happens to
-- the user account afterwards.
--
-- Three-step pattern: add new columns, backfill from the still-present
-- foreign keys, then drop the old columns.

ALTER TABLE order_item ADD COLUMN user_name TEXT;
ALTER TABLE order_item ADD COLUMN cancelled_by_name TEXT;
ALTER TABLE daily_closing ADD COLUMN created_by_name TEXT;
ALTER TABLE cash_transaction ADD COLUMN user_name TEXT;
ALTER TABLE service_order ADD COLUMN user_name TEXT;
ALTER TABLE order_cancellation ADD COLUMN cancelled_by_name TEXT;

UPDATE order_item oi SET user_name = u.name FROM "user" u WHERE u.id = oi.user_id;
UPDATE order_item oi SET cancelled_by_name = u.name FROM "user" u WHERE u.id = oi.cancelled_by;
UPDATE daily_closing c SET created_by_name = u.name FROM "user" u WHERE u.id = c.created_by;
UPDATE cash_transaction t SET user_name = u.name FROM "user" u WHERE u.id = t.user_id;
UPDATE service_order s SET user_name = u.name FROM "user" u WHERE u.id = s.user_id;
UPDATE order_cancellation oc SET cancelled_by_name = u.name FROM "user" u WHERE u.id = oc.cancelled_by;

ALTER TABLE order_item DROP COLUMN user_id;
ALTER TABLE order_item DROP COLUMN cancelled_by;
ALTER TABLE daily_closing DROP COLUMN created_by;
ALTER TABLE cash_transaction DROP COLUMN user_id;
ALTER TABLE service_order DROP COLUMN user_id;
ALTER TABLE order_cancellation DROP COLUMN cancelled_by;
