-- Scratch Card tickets — one row per purchased ticket.
--   status pending  : ticket bought, grid not yet revealed
--   status revealed : grid revealed client-side (informational)
--   status claimed  : payout (if any) credited via adjust_balance RPC
CREATE TABLE IF NOT EXISTS public.scratch_tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES public.users(id) ON DELETE CASCADE,
  bet_amount_cdf  integer NOT NULL,
  grid            jsonb NOT NULL,
  win_amount_cdf  integer NOT NULL DEFAULT 0,
  status          text DEFAULT 'pending'
    CHECK (status IN ('pending', 'revealed', 'claimed')),
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scratch_tickets_user_created_idx
  ON public.scratch_tickets(user_id, created_at DESC);
