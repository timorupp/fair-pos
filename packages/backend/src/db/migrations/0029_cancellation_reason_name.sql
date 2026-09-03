-- Task #111: Stornogrund-Umbenennung widerspricht der TSE-signierten
-- processData im DSFinV-K-Export. Der Name des Stornogrunds wird zum
-- Stornierungszeitpunkt fest in die TSE-signierte AVSonstige-processData
-- eingebrannt (register-session.ts), aber bisher nirgends als Text
-- eingefroren — nur als lebender Fremdschlüssel (cancellation_reason_id)
-- vorhanden. Nach einem späteren Umbenennen des Stornogrunds würde jeder
-- Live-Lookup (DSFinV-K-Export, Auswertungen) einen anderen Text zeigen als
-- in der Signatur steht.
--
-- Exakt dasselbe, bereits etablierte Muster wie bei cancelled_by_name
-- (0017_user_deletable.sql) — unabhängig auf beiden Tabellen ergänzt:
--   - order_cancellation: für den AVSonstige-Vorgang auf Event-Ebene
--     (exports/dsfinvk/load.ts liest pro Vorgang, nicht pro Zeile).
--   - order_item: deckt zusätzlich den Admin-Bonstorno-Pfad ab, der gar
--     keine order_cancellation-Zeile anlegt (siehe TASKS.md Task #111).
--
-- Backfill-Entscheidung (Nutzervorgabe 2026-09-03): Ungenauigkeit bei
-- zwischenzeitlich bereits umbenannten Stornogründen ist nicht relevant —
-- im System sind aktuell ausschließlich Testdaten vorhanden.

-- order_cancellation.cancellation_reason_id is itself NOT NULL, so the name
-- snapshot can safely be NOT NULL too, once backfilled.
ALTER TABLE order_cancellation ADD COLUMN cancellation_reason_name TEXT;
UPDATE order_cancellation oc
   SET cancellation_reason_name = cr.name
  FROM cancellation_reason cr
 WHERE cr.id = oc.cancellation_reason_id;
ALTER TABLE order_cancellation ALTER COLUMN cancellation_reason_name SET NOT NULL;

-- order_item.cancellation_reason_id stays nullable (only set for
-- cancelled/free rows), so the name snapshot stays nullable too.
ALTER TABLE order_item ADD COLUMN cancellation_reason_name TEXT;
UPDATE order_item oi
   SET cancellation_reason_name = cr.name
  FROM cancellation_reason cr
 WHERE cr.id = oi.cancellation_reason_id;
