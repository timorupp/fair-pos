-- Task #161: neue Artikel-Option "Bestellbons nicht zusammenfassen
-- (Einzelbon)" — jede bestellte Einheit bekommt an der Bedienungskasse einen
-- eigenen Bestellbon (z. B. ein Bon pro Teller in der Küche) statt in den
-- Sammelbon ihrer Artikelgruppe einzugehen. Keine Auswirkung auf die
-- Bonkasse, deren Selbstabholerbons ohnehin pro Einheit gedruckt werden.

ALTER TABLE article ADD COLUMN order_slip_per_unit BOOLEAN NOT NULL DEFAULT false;
