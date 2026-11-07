-- ─────────────────────────────────────────────────────────────────────────────
-- 0039 — invoice.cashier_name, Task #159
--
-- Who actually charged an invoice. At the Bedienungskasse the operator who
-- took the order (`order_item.user_name`, "Besteller") and the one who
-- charged the table can be different people, but the latter was never stored
-- anywhere. Text snapshot, not a foreign key, like every other user
-- reference since Task #97 (user rows are deletable).
--
-- Backfill for existing rows, where it can be derived reliably:
--  - Bonkasse sales: order and checkout are one and the same step, so the
--    orderer of the invoice's items is the cashier.
--  - Bonstorno (receipt_type='cancellation'): the admin who performed it,
--    already stored on the invoice's items as `cancelled_by_name`.
-- Bedienungskasse sales stay NULL — the cashier is not recoverable there.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE invoice ADD COLUMN cashier_name TEXT;

UPDATE invoice i
   SET cashier_name = src.name
  FROM (
    SELECT DISTINCT ON (oi.invoice_id) oi.invoice_id, oi.user_name AS name
      FROM order_item oi
      JOIN invoice inv ON inv.id = oi.invoice_id
      JOIN register r ON r.id = inv.register_id
     WHERE r.type = 'receipt_register'
       AND inv.receipt_type <> 'cancellation'
       AND oi.user_name IS NOT NULL
     ORDER BY oi.invoice_id, oi.created_at
  ) src
 WHERE i.id = src.invoice_id;

UPDATE invoice i
   SET cashier_name = src.name
  FROM (
    SELECT DISTINCT ON (oi.invoice_id) oi.invoice_id, oi.cancelled_by_name AS name
      FROM order_item oi
      JOIN invoice inv ON inv.id = oi.invoice_id
     WHERE inv.receipt_type = 'cancellation'
       AND oi.cancelled_by_name IS NOT NULL
     ORDER BY oi.invoice_id, oi.created_at
  ) src
 WHERE i.id = src.invoice_id;
