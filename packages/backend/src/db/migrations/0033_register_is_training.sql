-- Task #130: genuine training mode for cash registers. A register flagged
-- is_training produces bookings that are still TSE-signed and fully
-- documented (transactions.csv/lines.csv etc.), but excluded from the
-- Kassenabschluss totals (closing/totals.ts already had the
-- receipt_type='training' exclusion prepared) and exported with DSFinV-K
-- BON_TYP=AVTraining instead of Beleg/AVBestellung/AVSonstige.
--
-- The flag is locked (application-level, see routes/admin/registers.ts) once
-- the register has any invoice/service_order/order_cancellation row, so it
-- can never be used to "training-wash" a register with real booking history
-- nor accidentally flip a live register into training mode.

ALTER TABLE register ADD COLUMN is_training BOOLEAN NOT NULL DEFAULT false;
