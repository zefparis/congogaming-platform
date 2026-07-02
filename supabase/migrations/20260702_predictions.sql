CREATE TABLE IF NOT EXISTS public.predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  match_id text not null,
  prediction_type text not null check (prediction_type in ('winner', 'score_exact')),
  predicted_winner text,
  predicted_score_home integer,
  predicted_score_away integer,
  points_wagered integer not null default 100,
  points_won integer,
  status text not null default 'pending' check (status in ('pending', 'won', 'lost', 'cancelled')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.predictions FOR ALL TO service_role USING (true);
