CREATE TABLE event (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(200) NOT NULL,
  start_time TIMESTAMPTZ  NOT NULL,
  end_time   TIMESTAMPTZ  NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT event_end_after_start CHECK (end_time > start_time)
);
