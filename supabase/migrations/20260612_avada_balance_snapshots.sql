-- Avada Pay balance snapshots — captured every 15 min by the scraper worker.
-- Stores raw CDF totals per provider for finance dashboards and alerting.

CREATE TABLE IF NOT EXISTS avada_balance_snapshots (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at     TIMESTAMPTZ NOT NULL    DEFAULT now(),

  -- DR Congo CDF (merchant-wide total)
  cdf_total        NUMERIC(20, 2) NOT NULL DEFAULT 0,
  cdf_hold         NUMERIC(20, 2) NOT NULL DEFAULT 0,
  cdf_available    NUMERIC(20, 2) NOT NULL DEFAULT 0,

  -- Afrimoney (provider 19)
  afrimoney_total      NUMERIC(20, 2) NOT NULL DEFAULT 0,
  afrimoney_hold       NUMERIC(20, 2) NOT NULL DEFAULT 0,
  afrimoney_available  NUMERIC(20, 2) NOT NULL DEFAULT 0,

  -- Airtel Money (provider 17)
  airtel_total         NUMERIC(20, 2) NOT NULL DEFAULT 0,
  airtel_hold          NUMERIC(20, 2) NOT NULL DEFAULT 0,
  airtel_available     NUMERIC(20, 2) NOT NULL DEFAULT 0,

  -- Orange Money (provider 10)
  orange_total         NUMERIC(20, 2) NOT NULL DEFAULT 0,
  orange_hold          NUMERIC(20, 2) NOT NULL DEFAULT 0,
  orange_available     NUMERIC(20, 2) NOT NULL DEFAULT 0
);

-- Index for time-range queries (dashboards, alerting)
CREATE INDEX IF NOT EXISTS avada_balance_snapshots_captured_at_idx
  ON avada_balance_snapshots (captured_at DESC);

-- Row-level security: no direct client access — service role only
ALTER TABLE avada_balance_snapshots ENABLE ROW LEVEL SECURITY;
