-- Article naming simplification (Task #91 follow-up): the register-button
-- label now lives per-slot (see 0014), so article.name no longer needs to
-- stay a short "Kassentaste" text distinct from the full receipt text —
-- keep only one name, populated with the fuller receipt_text where an
-- admin had bothered to set one. Widen to VARCHAR(200) first (receipt_text
-- allowed up to 200 chars, name only 100) so no existing value is rejected
-- by the UPDATE below.
ALTER TABLE article ALTER COLUMN name TYPE VARCHAR(200);
UPDATE article SET name = receipt_text WHERE receipt_text IS NOT NULL;
ALTER TABLE article DROP COLUMN receipt_text;
