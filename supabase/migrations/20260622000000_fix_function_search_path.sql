-- Fix search_path for functions flagged by Supabase security linter.
--
-- Without an explicit SET search_path, a SECURITY DEFINER function
-- (or any function called by one) is vulnerable to search_path injection:
-- a malicious user could shadow public objects with their own schema.
-- ALTER FUNCTION … SET search_path = public pins resolution to the
-- public schema only, neutralising that attack vector.
--
-- Signatures verified via pg_get_function_identity_arguments.
--
-- Idempotence : plusieurs de ces fonctions ont été créées manuellement
-- en prod (hors migrations) ou par des migrations postérieures à celle-ci
-- dans l'ordre des fichiers (ex. increment_agent_total /
-- get_agent_tier via 20260728_agents_baseline.sql). Chaque ALTER est
-- donc conditionné par to_regprocedure : en prod les fonctions existent
-- et l'ALTER s'applique à l'identique ; sur une base vierge les
-- fonctions absentes sont ignorées — celles créées plus tard embarquent
-- déjà `set search_path = public` dans leur définition.

do $$
begin
  if to_regprocedure('public.check_okapi_color_ticket_slot()') is not null then
    execute 'alter function public.check_okapi_color_ticket_slot() set search_path = public';
  end if;
  if to_regprocedure('public.increment_agent_total(uuid, integer)') is not null then
    execute 'alter function public.increment_agent_total(agent_id uuid, delta integer) set search_path = public';
  end if;
  if to_regprocedure('public.get_agent_tier(numeric)') is not null then
    execute 'alter function public.get_agent_tier(total_cdf numeric) set search_path = public';
  end if;
  if to_regprocedure('public.update_updated_at()') is not null then
    execute 'alter function public.update_updated_at() set search_path = public';
  end if;
end $$;
