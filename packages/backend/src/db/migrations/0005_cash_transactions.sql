CREATE TABLE cash_transaction (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  register_id UUID          NOT NULL REFERENCES register(id),
  user_id     UUID          REFERENCES "user"(id),
  type        VARCHAR(20)   NOT NULL CHECK (type IN ('deposit', 'withdrawal')),
  amount      DECIMAL(10,2) NOT NULL,
  note        VARCHAR(200),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX ON cash_transaction (register_id);
