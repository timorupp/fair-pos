-- ─────────────────────────────────────────────────────────────────────────────
-- 0011 — PIN login + server-side sessions (Task #90)
--
-- Replaces the QR-one-time-token login (register_access_token) with a
-- persistent, admin-assigned PIN per user (user.pin_hash) that both
-- identifies and authenticates in one step — no visible username, so an
-- attacker can't target a specific person's account for a lockout. Replaces
-- the two previously stateless, non-expiring signed cookies (admin_session /
-- register_session) with a single server-tracked session table, needed for
-- the 4h-inactivity sliding expiry and the admin "active sessions" list/
-- terminate feature.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "user" ADD COLUMN pin_hash VARCHAR(64);

CREATE TABLE session (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES "user"(id),
  token            VARCHAR(64) NOT NULL UNIQUE,
  admin_verified   BOOLEAN     NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent       TEXT
);

CREATE INDEX ON session (user_id);

DROP TABLE register_access_token;
