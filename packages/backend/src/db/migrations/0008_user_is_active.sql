-- ─────────────────────────────────────────────────────────────────────────────
-- 0008 — user.is_active (Archivieren statt Löschen)
--
-- Gleiche Motivation wie register.is_active (0007): sobald ein Benutzer
-- irgendeine Buchung ausgeführt hat (Rechnung, Bestellung, Kassenbewegung,
-- Storno, Tagesabschluss), verhindert FK-RESTRICT das Löschen. `is_active`
-- ist die Alternative: ein deaktivierter Benutzer kann sich nicht mehr
-- anmelden (Passwort-Login und QR-Token-Login) und verschwindet aus der
-- Kassenzuweisung, bleibt aber vollständig in der DB erhalten — keine
-- Anonymisierung, nur Sperrung des Zugangs. Benutzer ganz ohne solche
-- Referenzen bleiben weiterhin per DELETE hart löschbar. Siehe Task #56.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "user" ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
