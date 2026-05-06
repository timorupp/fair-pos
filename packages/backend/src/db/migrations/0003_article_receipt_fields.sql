ALTER TABLE article
  ADD COLUMN receipt_text          VARCHAR(200),
  ADD COLUMN print_deposit_receipt BOOLEAN NOT NULL DEFAULT false;
