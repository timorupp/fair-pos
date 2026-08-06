-- ─────────────────────────────────────────────────────────────────────────────
-- 0007 — register.is_active (Archivieren statt Löschen)
--
-- Eine bereits verwendete Kasse (mind. eine Rechnung/Bestellung/Buchung
-- referenziert sie) lässt sich per FK-RESTRICT nie mehr löschen (siehe
-- Task #54 — dort wurde nur die Fehlermeldung dafür verständlich gemacht).
-- `is_active` ist die Alternative dazu: eine archivierte Kasse verschwindet
-- aus dem Login-/Kassen-Picker der Bedienoberfläche, bleibt aber unverändert
-- in Auswertungen und im DSFinV-K-Export sichtbar, da ihre Zeile nie gelöscht
-- wird. Siehe Task #55.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE register ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
