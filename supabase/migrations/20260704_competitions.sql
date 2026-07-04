-- Migration: multi-competition support
-- Adds competition_id to predictions and match_resolutions, plus a
-- competitions config table. The DEFAULT 'worldcup2026' ensures all
-- existing rows remain valid without a manual backfill.

-- 1. Add competition_id to predictions
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS competition_id text NOT NULL DEFAULT 'worldcup2026';

-- 2. Add competition_id to match_resolutions
ALTER TABLE match_resolutions
  ADD COLUMN IF NOT EXISTS competition_id text NOT NULL DEFAULT 'worldcup2026';

-- 3. Index for filtering predictions by competition
CREATE INDEX IF NOT EXISTS predictions_competition_id_idx
  ON public.predictions (competition_id);

-- 4. Competitions config table
CREATE TABLE IF NOT EXISTS public.competitions (
  id              text PRIMARY KEY,
  display_name    text NOT NULL,
  data_source     text NOT NULL CHECK (data_source IN ('worldcup2026_legacy', 'espn')),
  espn_slug       text,
  active          boolean NOT NULL DEFAULT true,
  display_order   integer NOT NULL DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "competitions_public_read" ON public.competitions
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "service_role_all" ON public.competitions
  FOR ALL TO service_role USING (true);

-- 5. Seed initial competitions
INSERT INTO public.competitions (id, display_name, data_source, espn_slug, display_order) VALUES
  ('worldcup2026',   'Coupe du Monde 2026',    'worldcup2026_legacy', NULL,             0),
  ('fra.1',          'Ligue 1',                'espn',                'fra.1',          1),
  ('eng.1',          'Premier League',         'espn',                'eng.1',          2),
  ('caf.champions',  'CAF Champions League',   'espn',                'caf.champions',  3)
ON CONFLICT (id) DO NOTHING;
