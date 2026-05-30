-- Enable Row Level Security on public.okapi_bets
--
-- Contexte :
--   Toutes les opérations Okapi (placeBet, cashout, history) passent par le
--   backend api.congogaming.com qui utilise la clé service_role. Le frontend
--   n'accède jamais directement à cette table via le client Supabase.
--
--   Cette migration active RLS de manière défensive : si un accès direct
--   Supabase (anon/authenticated) est ajouté plus tard, les utilisateurs ne
--   pourront lire QUE leurs propres bets, et ne pourront jamais écrire.
--
-- Non destructive :
--   * Pas de changement de schéma sur okapi_bets.
--   * Pas de modification des RPC (okapi_cashout_atomic reste SECURITY DEFINER
--     et bypasse RLS).
--   * service_role bypasse RLS par défaut → backend inchangé.

-- ============================================================
-- 1. Activer RLS
-- ============================================================
alter table public.okapi_bets enable row level security;

-- Defensive: certaines tables Postgres peuvent avoir FORCE RLS désactivé.
-- On laisse le défaut (non-FORCE) pour que service_role bypasse toujours.

-- ============================================================
-- 2. Politique SELECT — un user lit uniquement ses propres bets
-- ============================================================
do $okapi_bets_select$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'okapi_bets'
      and policyname = 'okapi_bets_select_own'
  ) then
    create policy okapi_bets_select_own
      on public.okapi_bets
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end
$okapi_bets_select$;

-- ============================================================
-- 3. Pas de politique INSERT/UPDATE/DELETE pour authenticated
-- ============================================================
-- Sans politique correspondante, RLS refuse par défaut. Donc les clients
-- authenticated ne peuvent ni créer, ni modifier, ni supprimer un bet.
-- Seul service_role (backend) peut écrire — il bypasse RLS.

-- ============================================================
-- 4. Verrouillage explicite des privilèges de table
-- ============================================================
-- Belt-and-suspenders : même si une policy était ajoutée par erreur,
-- les rôles anon/authenticated n'ont pas les privilèges SQL pour écrire.
revoke insert, update, delete on table public.okapi_bets from anon, authenticated;
-- SELECT reste autorisé au niveau privilèges ; RLS filtre les lignes.
grant select on table public.okapi_bets to authenticated;
