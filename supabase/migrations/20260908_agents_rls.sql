-- ================================================================
-- RLS on agents and agent_commissions — DEFENSIVE HARDENING
-- ================================================================
-- Contexte :
--   Les tables `agents` et `agent_commissions` ont été créées manuellement
--   (hors migrations trackées) et n'ont JAMAIS eu RLS activé dans le repo.
--   Aucune migration trackée ne les documente ni ne protège leurs lignes.
--   `supabase/schema.sql` ne les mentionne pas non plus.
--
--   Ces tables contiennent des données sensibles :
--     - agents.agent_pin_hash (hash Argon2 du PIN agent)
--     - agents.phone (numéro de téléphone personnel)
--     - agents.total_earned_cdf, payout_requested_at, payout_requested_amount_cdf
--     - agent_commissions.commission_cdf, ticket_amount_cdf
--
--   Le backend utilise toujours la clé service_role (bypass RLS), donc
--   l'activation de RLS n'a aucun impact sur le fonctionnement normal.
--   L'objectif est défensif : si un accès direct Supabase (anon ou
--   authenticated) est ajouté plus tard, les données sensibles des agents
--   ne fuient pas.
--
-- Non destructif :
--   * Pas de changement de schéma.
--   * service_role bypass RLS → backend inchangé.
--   * Aucune policy SELECT/INSERT/UPDATE/DELETE pour anon/authenticated
--     → RLS refuse tout par défaut pour ces rôles.
-- ================================================================

-- ============================================================
-- 1. Activer RLS sur agents
-- ============================================================
alter table public.agents enable row level security;

-- Aucune policy pour anon/authenticated : RLS refuse tout par défaut.
-- Seul service_role (backend) peut lire/écrire — il bypass RLS.

-- Verrouillage explicite des privilèges de table.
revoke insert, update, delete on table public.agents from anon, authenticated;
revoke select on table public.agents from anon, authenticated;

-- ============================================================
-- 2. Activer RLS sur agent_commissions
-- ============================================================
alter table public.agent_commissions enable row level security;

-- Aucune policy pour anon/authenticated : RLS refuse tout par défaut.
-- Seul service_role (backend) peut lire/écrire — il bypass RLS.

-- Verrouillage explicite des privilèges de table.
revoke insert, update, delete on table public.agent_commissions from anon, authenticated;
revoke select on table public.agent_commissions from anon, authenticated;

-- ============================================================
-- 3. Documentation — état RLS tracké
-- ============================================================
-- Avant cette migration, l'état RLS de ces tables n'était PAS vérifiable
-- depuis le repo (les tables ont été créées manuellement). Cette migration
-- établit l'état attendu et le tracke dans le repo pour les futurs audits.
--
-- NOTE IMPORTANTE : Si ces tables n'existent pas encore en production,
-- cette migration échouera sur le ALTER TABLE. Dans ce cas, exécuter
-- d'abord la création des tables (voir le schéma manuel utilisé lors du
-- déploiement initial), puis ré-appliquer cette migration.
--
-- Pour vérifier l'état RLS en production :
--   SELECT relname, relrowsecurity
--   FROM pg_class
--   WHERE relname IN ('agents', 'agent_commissions')
--     AND relnamespace = 'public'::regnamespace;
