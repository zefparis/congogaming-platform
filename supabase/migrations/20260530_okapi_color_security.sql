-- =============================================================
-- Okapi Color - Sécurité RLS + Privileges
-- =============================================================
-- Modèle : backend service_role ONLY.
-- Ni anon ni authenticated ne peuvent lire ou écrire ces tables
-- directement. Pas de policy RLS : RLS activée sans policy = 0 row
-- visible pour tout rôle non BYPASSRLS (service_role bypasse).
-- =============================================================

-- 1. Tables : revoke tout sur anon et authenticated
-- ---------------------------------------------------------
revoke all on table public.okapi_color_tirages
  from anon, authenticated;

revoke all on table public.okapi_color_tickets
  from anon, authenticated;

revoke all on table public.okapi_color_jackpot
  from anon, authenticated;

-- Séquences générées (uuid pas de séquence, mais par précaution)
-- Les tables n'ont pas de serial donc pas de séquence à révoquer.

-- 2. RPCs : revoke all de PUBLIC / anon / authenticated
--    grant execute uniquement à service_role
-- ---------------------------------------------------------
revoke all on function public.increment_okapi_color_jackpot(numeric)
  from public, anon, authenticated;

grant execute on function public.increment_okapi_color_jackpot(numeric)
  to service_role;

revoke all on function public.okapi_color_settle_ticket_payout_atomic(
  uuid, text, integer, integer, integer, boolean, uuid, text
) from public, anon, authenticated;

grant execute on function public.okapi_color_settle_ticket_payout_atomic(
  uuid, text, integer, integer, integer, boolean, uuid, text
) to service_role;
