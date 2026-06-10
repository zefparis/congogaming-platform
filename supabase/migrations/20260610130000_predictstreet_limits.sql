-- PredictStreet per-user limits table
-- Separate from user_limits (which stores CDF deposit limits).
-- Defaults: 1000 USDC deposit limit / 500 shares trade limit per user.
-- PredictStreet polls GET /api/predictstreet/users/:id/limits for this data.

CREATE TABLE IF NOT EXISTS public.predictstreet_limits (
  user_id          UUID          PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  deposit_limit    NUMERIC(12,2) NOT NULL DEFAULT 1000.00,
  deposit_consumed NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  trade_limit      NUMERIC(12,2) NOT NULL DEFAULT 500.00,
  trade_consumed   NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  kyc_status       TEXT          NOT NULL DEFAULT 'approved',
  eligible         BOOLEAN       NOT NULL DEFAULT true,
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.predictstreet_limits IS
  'Per-user limits for the PredictStreet sports-betting widget (USDC + shares).';

-- Index for the limits API lookup
CREATE INDEX IF NOT EXISTS predictstreet_limits_user_idx
  ON public.predictstreet_limits (user_id);
