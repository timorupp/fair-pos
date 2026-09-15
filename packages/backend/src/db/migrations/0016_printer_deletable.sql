-- Printers become deletable (Task #96): a printer referenced by an article,
-- register, or print job could previously never be deleted (Postgres'
-- default RESTRICT behavior rejects it with 23503). Switch all three
-- foreign keys to ON DELETE SET NULL so deleting a printer just clears the
-- reference instead of being blocked — print_job.printer_id must become
-- nullable first, it was NOT NULL.

ALTER TABLE print_job ALTER COLUMN printer_id DROP NOT NULL;

ALTER TABLE register DROP CONSTRAINT register_printer_id_fkey;
ALTER TABLE register ADD CONSTRAINT register_printer_id_fkey
  FOREIGN KEY (printer_id) REFERENCES printer(id) ON DELETE SET NULL;

ALTER TABLE article DROP CONSTRAINT article_printer_id_fkey;
ALTER TABLE article ADD CONSTRAINT article_printer_id_fkey
  FOREIGN KEY (printer_id) REFERENCES printer(id) ON DELETE SET NULL;

ALTER TABLE print_job DROP CONSTRAINT print_job_printer_id_fkey;
ALTER TABLE print_job ADD CONSTRAINT print_job_printer_id_fkey
  FOREIGN KEY (printer_id) REFERENCES printer(id) ON DELETE SET NULL;
