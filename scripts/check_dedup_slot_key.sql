-- =============================================================
-- Pre-migration safety check for H3: UNIQUE (slot_key) on okapi_color_tirages
-- Run this manually in the Supabase SQL editor BEFORE running
-- 20260601_loto_flash_jackpot_events.sql
-- =============================================================

-- Step 1: Check for duplicate slot_key values.
-- If this returns zero rows, the UNIQUE constraint will apply cleanly — skip Step 2.
-- If this returns rows, run Step 2 first, then re-run Step 1 to confirm it is empty.
SELECT slot_key, COUNT(*)
FROM public.okapi_color_tirages
GROUP BY slot_key
HAVING COUNT(*) > 1;

-- Step 2 (run ONLY if Step 1 returns rows):
-- For each duplicated slot_key, keep the most-recently-created row and delete the rest.
-- Review the Step 1 output before running this — make sure the rows being deleted
-- are genuine duplicates and not legitimate separate draws.
DELETE FROM public.okapi_color_tirages
WHERE id NOT IN (
  SELECT DISTINCT ON (slot_key) id
  FROM public.okapi_color_tirages
  ORDER BY slot_key, created_at DESC
);
