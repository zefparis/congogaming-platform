-- Ensure predictstreet_limits exists (creates it if 20260610130000 was never applied).
CREATE TABLE IF NOT EXISTS public.predictstreet_limits (
  user_id          UUID          PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  deposit_limit    NUMERIC(12,2) NOT NULL DEFAULT 500.00,
  deposit_consumed NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  trade_limit      NUMERIC(12,2) NOT NULL DEFAULT 500.00,
  trade_consumed   NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  kyc_status       TEXT          NOT NULL DEFAULT 'approved',
  eligible         BOOLEAN       NOT NULL DEFAULT true,
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS predictstreet_limits_user_idx
  ON public.predictstreet_limits (user_id);

-- Add withdrawal_limit (no-op if column already exists).
ALTER TABLE public.predictstreet_limits
  ADD COLUMN IF NOT EXISTS withdrawal_limit NUMERIC(12,2) NOT NULL DEFAULT 500.00;

-- Webhook deduplication table for PredictStreet limit/eligibility events.
-- Primary key = event id sent by PredictStreet — guarantees exactly-once processing.

CREATE TABLE IF NOT EXISTS public.predictstreet_events (
  id          TEXT        PRIMARY KEY,             -- PredictStreet event id
  event       TEXT        NOT NULL,                -- limit_changed | eligibility_changed
  subject     TEXT        NOT NULL,                -- provider_user_id
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.predictstreet_events IS
  'Deduplication log for inbound PredictStreet webhook events.';
