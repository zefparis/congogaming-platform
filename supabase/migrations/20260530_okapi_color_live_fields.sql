-- =============================================================
-- Okapi Color — champs pour l'affichage TV live
-- Ajoute : draw_number, slot_key, channel, location_id, agent_id, draw_at
-- =============================================================

-- Prérequis idempotent : cette migration trie avant
-- 20260530_okapi_color_tables.sql (ordre alphabétique), qui crée
-- okapi_color_tirages. En prod la table existait déjà. Sur une base
-- vierge on la crée ici avec la MÊME définition — le IF NOT EXISTS
-- rend ce bloc sans effet en prod et tables.sql ne le rejoue pas.
create table if not exists public.okapi_color_tirages (
  id            uuid        primary key default gen_random_uuid(),
  numeros_rouges int[]      not null,
  numeros_or     int[]      not null,
  hash_pre       text       not null,
  jackpot_paye   boolean    not null default false,
  drawn_at       timestamptz not null default now(),
  created_at     timestamptz not null default now(),

  constraint chk_rouges_count   check (array_length(numeros_rouges, 1) = 6),
  constraint chk_ors_count      check (array_length(numeros_or,     1) = 4)
);

-- Séquence auto-incrémentée pour numéroter les tirages
create sequence if not exists public.okapi_color_draw_number_seq start 1;

-- Ajout des colonnes (idempotent)
alter table public.okapi_color_tirages
  add column if not exists draw_number  integer      default nextval('public.okapi_color_draw_number_seq'),
  add column if not exists slot_key     text,
  add column if not exists channel      text         not null default 'public',
  add column if not exists location_id  uuid,
  add column if not exists agent_id     uuid,
  add column if not exists draw_at      timestamptz;

-- Backfill draw_number pour les tirages existants (si la colonne vient d'être créée)
update public.okapi_color_tirages
  set draw_number = nextval('public.okapi_color_draw_number_seq')
  where draw_number is null;

-- Index unique sur slot_key (nullable — plusieurs tirages hors-cron peuvent ne pas avoir de slot)
create unique index if not exists okapi_color_tirages_slot_key_idx
  on public.okapi_color_tirages (slot_key)
  where slot_key is not null;

create index if not exists okapi_color_tirages_draw_number_idx
  on public.okapi_color_tirages (draw_number desc nulls last);
