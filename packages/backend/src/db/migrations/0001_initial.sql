-- FairPOS: Initial database schema
-- Matches Datenmodell.dbml (May 2026)

-- ── Users ────────────────────────────────────────────────────────────────────

CREATE TABLE "user" (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_admin      BOOLEAN      NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── Printers ──────────────────────────────────────────────────────────────────

CREATE TABLE printer (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(100) NOT NULL,
  ip_address VARCHAR(45)  NOT NULL,
  port       INT          NOT NULL DEFAULT 9100,
  is_default BOOLEAN      NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── Article categories ────────────────────────────────────────────────────────

CREATE TABLE article_category (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(100) NOT NULL,
  tax_rate   DECIMAL(5,2) NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── Registers ─────────────────────────────────────────────────────────────────

CREATE TABLE register (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(100) NOT NULL,
  type       VARCHAR(20)  NOT NULL CHECK (type IN ('receipt_register', 'service_register')),
  printer_id UUID         REFERENCES printer(id),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── User ↔ register assignments ───────────────────────────────────────────────

CREATE TABLE user_register (
  user_id     UUID NOT NULL REFERENCES "user"(id),
  register_id UUID NOT NULL REFERENCES register(id),
  PRIMARY KEY (user_id, register_id)
);

-- ── QR login tokens ───────────────────────────────────────────────────────────

CREATE TABLE register_access_token (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES "user"(id),
  token       VARCHAR(64) NOT NULL UNIQUE,
  valid_until TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Articles ──────────────────────────────────────────────────────────────────

CREATE TABLE article (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id   UUID          NOT NULL REFERENCES article_category(id),
  name          VARCHAR(100)  NOT NULL,
  price         DECIMAL(10,2) NOT NULL,
  deposit_price DECIMAL(10,2),
  printer_id    UUID          REFERENCES printer(id),
  is_active     BOOLEAN       NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ── Product options ────────────────────────────────────────────────────────────

CREATE TABLE product_option (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id      UUID          NOT NULL REFERENCES article(id),
  name            VARCHAR(100)  NOT NULL,
  price_surcharge DECIMAL(10,2) NOT NULL DEFAULT 0
);

-- ── Register layouts ──────────────────────────────────────────────────────────

CREATE TABLE register_layout (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  register_id UUID         NOT NULL REFERENCES register(id),
  name        VARCHAR(100) NOT NULL,
  is_default  BOOLEAN      NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE register_layout_slot (
  id                 UUID       PRIMARY KEY DEFAULT gen_random_uuid(),
  register_layout_id UUID       NOT NULL REFERENCES register_layout(id),
  article_id         UUID       NOT NULL REFERENCES article(id),
  grid_row           INT        NOT NULL,
  grid_col           INT        NOT NULL,
  color              VARCHAR(7) NOT NULL,
  UNIQUE (register_layout_id, grid_row, grid_col)
);

-- ── Floor plan tables ─────────────────────────────────────────────────────────

CREATE TABLE dining_table (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name      VARCHAR(50) NOT NULL,
  pos_x     INT         NOT NULL,
  pos_y     INT         NOT NULL,
  is_active BOOLEAN     NOT NULL DEFAULT true
);

-- ── Daily closings (Z-Bon) ────────────────────────────────────────────────────

CREATE TABLE daily_closing (
  id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  register_id            UUID          NOT NULL REFERENCES register(id),
  z_number               INT           NOT NULL,
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT now(),
  created_by             UUID          REFERENCES "user"(id),
  is_zero_closing        BOOLEAN       NOT NULL DEFAULT false,
  total_gross            DECIMAL(12,2) NOT NULL,
  total_tax_standard     DECIMAL(12,2) NOT NULL,
  total_tax_reduced      DECIMAL(12,2) NOT NULL,
  total_tax_zero         DECIMAL(12,2) NOT NULL,
  total_cash             DECIMAL(12,2) NOT NULL,
  total_cancellations    DECIMAL(12,2) NOT NULL,
  tse_transaction_number BIGINT,
  tse_signature          TEXT,
  tse_signature_counter  BIGINT,
  UNIQUE (register_id, z_number)
);

-- ── Cancellation reasons ──────────────────────────────────────────────────────

CREATE TABLE cancellation_reason (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(100) NOT NULL,
  booking_type VARCHAR(30)  NOT NULL CHECK (booking_type IN ('cancellation', 'free_of_charge')),
  is_active    BOOLEAN      NOT NULL DEFAULT true
);

-- ── Invoices ──────────────────────────────────────────────────────────────────

CREATE TABLE invoice (
  id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  register_id            UUID         NOT NULL REFERENCES register(id),
  daily_closing_id       UUID         REFERENCES daily_closing(id),
  receipt_number         BIGINT       NOT NULL UNIQUE,
  receipt_type           VARCHAR(30)  NOT NULL CHECK (receipt_type IN ('sales_receipt', 'cancellation', 'training')),
  payment_method         VARCHAR(20)  NOT NULL CHECK (payment_method IN ('cash', 'card')),
  cancels_invoice_id     UUID         REFERENCES invoice(id),
  cancellation_note      TEXT,
  receipt_token          VARCHAR(64)  UNIQUE,
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
  tse_transaction_number BIGINT,
  tse_start_time         TIMESTAMPTZ,
  tse_end_time           TIMESTAMPTZ,
  tse_signature          TEXT,
  tse_signature_counter  BIGINT,
  tse_serial_number      VARCHAR(128)
);

-- ── Order items ───────────────────────────────────────────────────────────────

CREATE TABLE order_item (
  id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id             UUID          REFERENCES invoice(id),
  dining_table_id        UUID          REFERENCES dining_table(id),
  register_id            UUID          NOT NULL REFERENCES register(id),
  user_id                UUID          REFERENCES "user"(id),
  article_id             UUID          REFERENCES article(id),
  article_name           VARCHAR(100)  NOT NULL,
  article_category_name  VARCHAR(100)  NOT NULL,
  tax_rate               DECIMAL(5,2)  NOT NULL,
  price                  DECIMAL(10,2) NOT NULL,
  deposit_price          DECIMAL(10,2),
  options                TEXT,
  status                 VARCHAR(20)   NOT NULL CHECK (status IN ('open', 'paid', 'free', 'cancelled')),
  cancellation_reason_id UUID          REFERENCES cancellation_reason(id),
  cancelled_by           UUID          REFERENCES "user"(id),
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT now(),
  cancelled_at           TIMESTAMPTZ
);

-- ── Print queue ───────────────────────────────────────────────────────────────

CREATE TABLE print_job (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  printer_id      UUID        NOT NULL REFERENCES printer(id),
  type            VARCHAR(20) NOT NULL CHECK (type IN ('order_slip', 'receipt', 'daily_closing')),
  content         TEXT        NOT NULL,
  reference_id    UUID,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'printing', 'done', 'failed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts        INT         NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  error_message   TEXT
);

-- ── System settings ───────────────────────────────────────────────────────────

CREATE TABLE system_setting (
  key        VARCHAR(100) PRIMARY KEY,
  value      TEXT         NOT NULL,
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX ON order_item (status);
CREATE INDEX ON order_item (dining_table_id);
CREATE INDEX ON order_item (invoice_id);
CREATE INDEX ON print_job (status);
CREATE INDEX ON invoice (receipt_number);

-- ── Print notification trigger ────────────────────────────────────────────────

-- Notifies the print worker via pg_notify whenever a new print job is inserted.
CREATE FUNCTION notify_print_job()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('print_job_new', NEW.id::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER print_job_after_insert
AFTER INSERT ON print_job
FOR EACH ROW EXECUTE FUNCTION notify_print_job();
