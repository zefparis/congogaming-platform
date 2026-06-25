-- Fix search_path for functions flagged by Supabase security linter.
--
-- Without an explicit SET search_path, a SECURITY DEFINER function
-- (or any function called by one) is vulnerable to search_path injection:
-- a malicious user could shadow public objects with their own schema.
-- ALTER FUNCTION … SET search_path = public pins resolution to the
-- public schema only, neutralising that attack vector.
--
-- Signatures verified via pg_get_function_identity_arguments.

ALTER FUNCTION public.check_okapi_color_ticket_slot()                      SET search_path = public;
ALTER FUNCTION public.increment_agent_total(agent_id uuid, delta integer)   SET search_path = public;
ALTER FUNCTION public.get_agent_tier(total_cdf numeric)                     SET search_path = public;
ALTER FUNCTION public.update_updated_at()                                   SET search_path = public;
