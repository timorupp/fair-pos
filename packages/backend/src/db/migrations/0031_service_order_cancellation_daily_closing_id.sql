-- Adds a real daily_closing_id foreign key to service_order/order_cancellation,
-- matching the link invoice already has. Previously, the DSFinV-K export
-- approximated their assignment to a Kassenabschluss via register + calendar
-- day (business_date), which could misattribute rows when a register was
-- closed more than once on the same day (Task #123).
--
-- Existing rows are backfilled from that same register+day approximation, so
-- already-issued closings keep exporting exactly the rows they did before.
-- Where a register was closed more than once on the same day historically
-- (the exact ambiguity this migration removes going forward), the earliest
-- closing (lowest z_number) of that day is chosen deterministically — a
-- best-effort choice for already-ambiguous historical data; new closings are
-- unaffected since routes/admin/closings.ts now assigns the FK exactly.

ALTER TABLE service_order ADD COLUMN daily_closing_id UUID REFERENCES daily_closing(id);
ALTER TABLE order_cancellation ADD COLUMN daily_closing_id UUID REFERENCES daily_closing(id);

UPDATE service_order so
   SET daily_closing_id = (
     SELECT dc.id FROM daily_closing dc
      WHERE dc.register_id = so.register_id
        AND dc.business_date = so.created_at::date
      ORDER BY dc.z_number ASC
      LIMIT 1
   )
 WHERE so.daily_closing_id IS NULL;

UPDATE order_cancellation oc
   SET daily_closing_id = (
     SELECT dc.id FROM daily_closing dc
      WHERE dc.register_id = oc.register_id
        AND dc.business_date = oc.created_at::date
      ORDER BY dc.z_number ASC
      LIMIT 1
   )
 WHERE oc.daily_closing_id IS NULL;
