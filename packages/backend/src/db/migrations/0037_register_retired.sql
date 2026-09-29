-- Task #151: "Kasse stilllegen" — a register that will never be used again
-- can be given a retirement date (the last calendar day it was/is allowed
-- to book on) so it stops demanding a daily Z-Bon for every day after that
-- date, and is hard-locked against further checkout/order use from the day
-- after onward. NULL means "not retired" (the default, current behaviour
-- unchanged). A DATE, not a TIMESTAMPTZ, since this is a calendar-day
-- concept (matching daily_closing.business_date), not an execution instant
-- — the application decides at what point in time to set it, but the value
-- itself is always a whole day.
--
-- Reversible on purpose (Nutzerentscheidung 2026-09-21): a System-
-- Administrator can clear this again (see routes/admin/registers.ts), so a
-- misclick is never permanent.

ALTER TABLE register ADD COLUMN retired_date DATE NULL;
