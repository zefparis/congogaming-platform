-- ================================================================
-- Agents baseline — versionnement du schéma existant
-- ================================================================
-- Contexte : les tables `agents` / `agent_commissions`, la colonne
-- `users.agent_ref` et la RPC `increment_agent_total` ont été créés
-- MANUELLEMENT en production et n'ont jamais été trackés dans une
-- migration. Cette migration recrée le schéma déduit du code, en
-- mode entièrement idempotent (IF NOT EXISTS / CREATE OR REPLACE)
-- pour être SANS EFFET sur la prod actuelle.
--
-- Datée 20260728 — volontairement AVANT 20260729 : elle décrit l'état
-- des tables agents telles qu'elles existaient AVANT les migrations
-- 20260729_agent_security_idempotence, 20260908_agents_rls et
-- 20260908_agent_payout_atomic. Tout ce que ces migrations ajoutent
-- est laissé à leur charge :
--   * agents.agent_pin_hash                       → 20260729
--   * agent_commissions.commission_type           → 20260729
--   * unique (ticket_id, commission_type)         → 20260729
--   * RLS + revoke sur agents/agent_commissions   → 20260908_agents_rls
--   * RPC request_agent_payout_atomic             → 20260908_agent_payout_atomic
--   * agent_payouts, agent_commissions.payout_id,
--     RPC pay_agent_commissions_atomic            → 20260924_agents_payouts
--
-- ⚠️ INCERTITUDES (le schéma réel est manuel, non observable ici) :
--   * types exacts : commission_rate (numeric(5,4) ?), total_earned_cdf
--     (integer vs numeric vs bigint), ticket_amount_cdf / commission_cdf
--     (integer vs numeric), payout_requested_amount_cdf (integer ?)
--   * contraintes CHECK éventuelles sur agents.status et
--     agent_commissions.status (le code n'en exige pas — omises ici)
--   * agents.qr_code : unique constraint vs simple index unique —
--     on crée un index unique (équivalent fonctionnel)
--   * FK agent_commissions.user_id -> users(id) : probable mais non
--     confirmé ; ticket_id n'a volontairement PAS de FK (cf.
--     20260923_drop_removed_games.sql : aucune table de paiement ou
--     partagée ne référence les tables de jeux)
--   * users.agent_ref : FK vers agents(id) supposée ; si la prod n'en
--     a pas, l'ALTER ci-dessous l'ajoutera (sans effet fonctionnel
--     négatif — les lignes existantes référencent des agents réels)
--   * corps exact de increment_agent_total : inconnu. Si la version
--     prod diffère (ex. paramètre `delta` en numeric, ou UPDATE avec
--     RETURNING), CREATE OR REPLACE peut créer une SURCHARGE au lieu
--     de remplacer (les noms d'arguments font partie de la signature
--     pour les appels nommés PostgREST). Comparer via la requête
--     d'introspection fournie dans le rapport avant d'appliquer.
-- ================================================================


-- ============================================================
-- 1. Table agents
-- ============================================================
create table if not exists public.agents (
  id                          uuid primary key default gen_random_uuid(),
  display_name                text not null,
  qr_code                     text not null,                       -- code AG-XXXXXX
  zone                        text,
  commission_rate             numeric(5,4) not null default 0.05,  -- fraction (0.05 = 5%)
  status                      text not null default 'active',      -- 'active' | 'suspended'
  phone                       text,
  operator                    text,                                -- 'orange'|'vodacom'|'airtel'|'africell'
  notes                       text,
  min_payout_cdf              integer not null default 2000,
  total_earned_cdf            bigint not null default 0,
  payout_requested_at         timestamptz,                         -- lu par request_agent_payout_atomic (20260908)
  payout_requested_amount_cdf integer,
  -- agent_pin_hash            : ajouté par 20260729_agent_security_idempotence.sql
  created_at                  timestamptz not null default now()
);

-- Colonnes de secours si la table existait déjà avec un sous-ensemble
-- (ALTER ... IF NOT EXISTS ne fait rien si la colonne est là).
alter table public.agents add column if not exists zone text;
alter table public.agents add column if not exists commission_rate numeric(5,4) not null default 0.05;
alter table public.agents add column if not exists status text not null default 'active';
alter table public.agents add column if not exists phone text;
alter table public.agents add column if not exists operator text;
alter table public.agents add column if not exists notes text;
alter table public.agents add column if not exists min_payout_cdf integer not null default 2000;
alter table public.agents add column if not exists total_earned_cdf bigint not null default 0;
alter table public.agents add column if not exists payout_requested_at timestamptz;
alter table public.agents add column if not exists payout_requested_amount_cdf integer;
-- agent_pin_hash : ajouté par 20260729 (DO-block IF NOT EXISTS) — pas
-- dupliqué ici pour que la baseline reflète l'état pré-20260729.

-- Unicité du code agent (lookup par qr_code dans auth + agents routes).
create unique index if not exists agents_qr_code_uidx on public.agents (qr_code);


-- ============================================================
-- 2. Table agent_commissions
-- ============================================================
create table if not exists public.agent_commissions (
  id                 uuid primary key default gen_random_uuid(),
  agent_id           uuid not null references public.agents(id),
  user_id            uuid references public.users(id),           -- joueur à l'origine du ticket
  ticket_id          uuid,                                       -- PAS de FK : les tables de jeux peuvent être droppées
  ticket_type        text,                                       -- 'okapi_color' (+ historique loto/flash/scratch/okapi)
  ticket_amount_cdf  integer,                                    -- mise (type 'ticket') ou gain brut (type 'win')
  commission_cdf     integer not null,
  status             text not null default 'pending',            -- 'pending' | 'paid'
  created_at         timestamptz not null default now()
  -- commission_type  : ajouté par 20260729_agent_security_idempotence.sql
  -- payout_id        : ajouté par 20260924_agents_payouts.sql
);

alter table public.agent_commissions add column if not exists user_id uuid;
alter table public.agent_commissions add column if not exists ticket_id uuid;
alter table public.agent_commissions add column if not exists ticket_type text;
alter table public.agent_commissions add column if not exists ticket_amount_cdf integer;
alter table public.agent_commissions add column if not exists commission_cdf integer;
alter table public.agent_commissions add column if not exists status text not null default 'pending';
alter table public.agent_commissions add column if not exists created_at timestamptz not null default now();

create index if not exists agent_commissions_agent_idx
  on public.agent_commissions (agent_id, status, created_at desc);

-- Contrainte unique (ticket_id, commission_type) : ajoutée par
-- 20260729_agent_security_idempotence.sql (DO-block idempotent) —
-- pas dupliquée ici car elle dépend de la colonne commission_type.


-- ============================================================
-- 3. users.agent_ref — rattachement joueur → agent
-- ============================================================
alter table public.users add column if not exists agent_ref uuid;

-- FK supposée vers agents(id) ; si elle existe déjà, le DO-block ne
-- fait rien. Si la colonne existait sans FK, on l'ajoute.
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'users_agent_ref_fkey'
  ) then
    alter table public.users
      add constraint users_agent_ref_fkey
      foreign key (agent_ref) references public.agents(id) on delete set null;
  end if;
exception
  -- Si la contrainte échoue (données orphelines ou nom différent en
  -- prod), ne pas bloquer la migration : la FK est un durcissement,
  -- pas un prérequis fonctionnel du code.
  when others then
    raise notice 'users_agent_ref_fkey not added: %', sqlerrm;
end $$;

create index if not exists users_agent_ref_idx on public.users (agent_ref);


-- ============================================================
-- 4. RPC increment_agent_total — cumul des gains agent
-- ============================================================
-- Appelée par server/lib/agent.ts après chaque insert de commission.
-- Corps déduit du seul usage observé : total_earned_cdf += delta.
-- Signature imposée par l'appel nommé PostgREST : (agent_id, delta).
--
-- ⚠️ CRÉATION CONDITIONNELLE — jamais CREATE OR REPLACE : en prod la
-- fonction existe déjà (créée manuellement) et son corps réel est
-- inconnu. La baseline ne doit PAS réécrire une fonction existante.
-- to_regprocedure teste la signature (types uniquement) ; si la
-- fonction existe avec une autre signature (ex. delta numeric),
-- une surcharge est créée — comparer via pg_get_functiondef avant.
do $$
begin
  if to_regprocedure('public.increment_agent_total(uuid, integer)') is null then
    execute $fn$
      create function public.increment_agent_total(agent_id uuid, delta integer)
      returns void
      language plpgsql
      security definer
      set search_path = public
      as $body$
      begin
        update public.agents
          set total_earned_cdf = coalesce(total_earned_cdf, 0) + delta
          where id = agent_id;
      end;
      $body$;
    $fn$;
  end if;
end $$;

-- Droits : revoke/grant sans effet destructeur (ne touchent pas le corps).
revoke all on function public.increment_agent_total(uuid, integer) from public, anon, authenticated;
grant execute on function public.increment_agent_total(uuid, integer) to service_role;


-- ============================================================
-- 5. RPC get_agent_tier — rang de l'agent
-- ============================================================
-- Fonction manuelle prod référencée par
-- 20260622000000_fix_function_search_path.sql (signature confirmée :
-- get_agent_tier(total_cdf numeric)). Non utilisée par le code
-- TypeScript — probablement appelée depuis SQL/dashboards.
-- ⚠️ Corps DÉDUIT des seuils du code (gold ≥ 1M, diamond ≥ 5M CDF) et
-- du type de retour supposé text. Vérifier en prod via
-- pg_get_functiondef avant d'appliquer.
-- Même règle : création conditionnelle, jamais d'écrasement.
do $$
begin
  if to_regprocedure('public.get_agent_tier(numeric)') is null then
    execute $fn$
      create function public.get_agent_tier(total_cdf numeric)
      returns text
      language plpgsql
      immutable
      security definer
      set search_path = public
      as $body$
      begin
        if coalesce(total_cdf, 0) >= 5000000 then return 'diamond';
        elsif coalesce(total_cdf, 0) >= 1000000 then return 'gold';
        else return 'standard';
        end if;
      end;
      $body$;
    $fn$;
  end if;
end $$;

revoke all on function public.get_agent_tier(numeric) from public, anon, authenticated;
grant execute on function public.get_agent_tier(numeric) to service_role;

-- RLS : couverte par 20260908_agents_rls.sql (enable row level security
-- + revoke anon/authenticated sur les deux tables). Pas dupliquée ici.
