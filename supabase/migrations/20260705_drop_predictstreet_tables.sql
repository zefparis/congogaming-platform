-- Drop orphaned PredictStreet tables (confirmed empty, code fully removed)
-- predictstreet_limits and predictstreet_events were created by
-- 20260610130000 and 20260610200000 but are no longer referenced anywhere
-- in the codebase after PredictStreet integration was removed.

DROP TABLE IF EXISTS public.predictstreet_events;
DROP TABLE IF EXISTS public.predictstreet_limits;
