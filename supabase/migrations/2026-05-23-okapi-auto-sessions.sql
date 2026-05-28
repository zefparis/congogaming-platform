-- Okapi Climb auto-bet (Aviator-style) session tracking.
-- Each START AUTO inserts a row; each round increments rounds_played and
-- adjusts total_pnl_cdf. A session ends with status='completed' (rounds
-- counter reached zero), 'stopped' (user STOP AUTO), or 'aborted'
-- (stop-on-profit / stop-on-loss threshold hit).
--
-- NOTE: DROP TABLE first to guarantee the schema matches even if a partial
-- version of okapi_auto_sessions was created during an earlier attempt.
-- This is safe because no production data exists in this table yet.
DROP TABLE IF EXISTS public.okapi_auto_sessions CASCADE;

CREATE TABLE IF NOT EXISTS public.okapi_auto_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  bet_amount_cdf      integer NOT NULL CHECK (bet_amount_cdf >= 100),
  target_multiplier   numeric(6,2) NOT NULL CHECK (target_multiplier >= 1.01),
  max_rounds          integer NULL,                -- NULL = infinite
  stop_on_profit_cdf  integer NULL,                -- NULL or 0 = disabled
  stop_on_loss_cdf    integer NULL,                -- NULL or 0 = disabled
  rounds_played       integer NOT NULL DEFAULT 0,
  total_pnl_cdf       integer NOT NULL DEFAULT 0,
  status              text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','completed','stopped','aborted')),
  started_at          timestamptz NOT NULL DEFAULT now(),
  ended_at            timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_okapi_auto_sessions_user_started
  ON public.okapi_auto_sessions(user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_okapi_auto_sessions_active
  ON public.okapi_auto_sessions(user_id) WHERE status = 'active';

-- Link individual bets to their auto session (NULL for manual bets).
ALTER TABLE public.okapi_bets
  ADD COLUMN IF NOT EXISTS auto_session_id uuid NULL
    REFERENCES public.okapi_auto_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_okapi_bets_auto_session
  ON public.okapi_bets(auto_session_id) WHERE auto_session_id IS NOT NULL;
