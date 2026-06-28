-- free_plays table - server-side tracking for cognitive test free plays

CREATE TABLE IF NOT EXISTS public.free_plays (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plays_remaining INTEGER     NOT NULL DEFAULT 0 CHECK (plays_remaining >= 0),
  source          TEXT        NOT NULL DEFAULT 'cognitive_test',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days'
);

CREATE INDEX IF NOT EXISTS free_plays_user_id_idx ON public.free_plays (user_id);
CREATE INDEX IF NOT EXISTS free_plays_expires_at_idx ON public.free_plays (expires_at);

-- Ensure only one active (non-expired) row per user
CREATE UNIQUE INDEX IF NOT EXISTS free_plays_user_active_uniq
  ON public.free_plays (user_id)
  WHERE expires_at > now();

-- RLS
ALTER TABLE public.free_plays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rls_service_role_free_plays" ON public.free_plays;
CREATE POLICY "rls_service_role_free_plays"
  ON public.free_plays FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "rls_postgres_free_plays" ON public.free_plays;
CREATE POLICY "rls_postgres_free_plays"
  ON public.free_plays FOR ALL TO postgres
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "rls_app_backend_free_plays" ON public.free_plays;
CREATE POLICY "rls_app_backend_free_plays"
  ON public.free_plays FOR ALL TO app_backend
  USING (true) WITH CHECK (true);

-- RPC: consume_free_play(p_user_id)
-- Atomically decrements plays_remaining by 1 for the user's active row.
-- Returns TRUE if a free play was consumed, FALSE otherwise.
CREATE OR REPLACE FUNCTION public.consume_free_play(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE public.free_plays
  SET plays_remaining = plays_remaining - 1
  WHERE user_id = p_user_id
    AND plays_remaining > 0
    AND expires_at > now();

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;