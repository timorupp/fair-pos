-- Task #114: neue Artikel-Option "Selbstabholerbon nicht drucken" — wirkt
-- nur an der Bonkasse (siehe register-session.ts), keine Auswirkung auf die
-- Bedienungskasse (nutzt einen komplett anderen Druckpfad). Verwendung z. B.
-- für Artikel zur Direktmitnahme oder für Pfand-Rückgabe.

ALTER TABLE article ADD COLUMN skip_pickup_slip BOOLEAN NOT NULL DEFAULT false;
