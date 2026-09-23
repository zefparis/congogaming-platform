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
--
-- Les colonnes ajoutées par des migrations trackées ultérieures sont
-- rappelées en commentaire mais NE sont PAS re-créées ici (déjà
-- couvertes par 20260729_agent_security_idempotence.sql,
-- 20260908_agent_payout_atomic.sql, 20260908_agents_rls.sql).
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
  -- agent_pin_hash            : ajouté par 20260729_agent_security_idempotence.sql
  -- payout_requested_at       : utilisé par 20260908_agent_payout_atomic.sql
  -- payout_requested_amount_cdf : idem
  payout_requested_at         timestamptz,
  payout_requested_amount_cdf integer,
  agent_pin_hash              text,
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
-- agent_pin_hash : déjà couvert par 20260729 (IF NOT EXISTS), répété
-- ici pour que la baseline soit auto-suffisante sur un environnement neuf.
alter table public.agents add column if not exists agent_pin_hash text;

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
  commission_type    text not null default 'ticket',             -- 'ticket' | 'win'
  status             text not null default 'pending',            -- 'pending' | 'paid'
  created_at         timestamptz not null default now()
);

alter table public.agent_commissions add column if not exists user_id uuid;
alter table public.agent_commissions add column if not exists ticket_id uuid;
alter table public.agent_commissions add column if not exists ticket_type text;
alter table public.agent_commissions add column if not exists ticket_amount_cdf integer;
alter table public.agent_commissions add column if not exists commission_cdf integer;
alter table public.agent_commissions add column if not exists commission_type text not null default 'ticket';
alter table public.agent_commissions add column if not exists status text not null default 'pending';
alter table public.agent_commissions add column if not exists created_at timestamptz not null default now();

create index if not exists agent_commissions_agent_idx
  on public.agent_commissions (agent_id, status, created_at desc);

-- Idempotence commission : déjà couverte par 20260729
-- (agent_commissions_ticket_id_commission_type_key). Répétée ici en
-- guard DO-block pour que la baseline soit auto-suffisante.
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'agent_commissions_ticket_id_commission_type_key'
  ) then
    alter table public.agent_commissions
      add constraint agent_commissions_ticket_id_commission_type_key
      unique (ticket_id, commission_type);
  end if;
end $$;


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
create or replace function public.increment_agent_total(agent_id uuid, delta integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.agents
    set total_earned_cdf = coalesce(total_earned_cdf, 0) + delta
    where id = agent_id;
end;
$$;

revoke all on function public.increment_agent_total(uuid, integer) from public, anon, authenticated;
grant execute on function public.increment_agent_total(uuid, integer) to service_role;


-- ============================================================
-- 5. RLS + droits tables — deny-all anon/authenticated
-- ============================================================
-- Modèle : 20260908_agents_rls.sql (qui s'applique avant celle-ci en
-- chaîne complète, mais la baseline est auto-suffisante pour un env
-- où les tables auraient été créées manuellement sans cette migration).
-- Aucune policy n'est créée : RLS activée + zéro policy = deny-all.
-- Tout accès passe par la service_role du backend (bypass RLS).
alter table public.agents enable row level security;
alter table public.agent_commissions enable row level security;

revoke insert, update, delete on public.agents from anon, authenticated;
revoke insert, update, delete on public.agent_commissions from anon, authenticated;
revoke select on public.agents from anon, authenticated;
revoke select on public.agent_commissions from anon, authenticated;
