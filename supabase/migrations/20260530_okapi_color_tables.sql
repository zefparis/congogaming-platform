-- =============================================================
-- Okapi Color - Tables
-- =============================================================
-- Tirage : 6 rouges + 4 ors tirés parmi 1..24 (10 numéros distincts)
-- Ticket : joueur choisit 6 numéros parmi 1..24
-- =============================================================

-- 1. Tirages
-- ---------------------------------------------------------
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

create index if not exists okapi_color_tirages_drawn_at_idx
  on public.okapi_color_tirages (drawn_at desc);

-- 2. Tickets
-- ---------------------------------------------------------
create table if not exists public.okapi_color_tickets (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null,
  numeros           int[]       not null,
  prix_cdf          integer     not null default 1000,
  status            text        not null default 'pending',
  nb_rouges         integer     not null default 0,
  nb_or             integer     not null default 0,
  total_bons        integer     not null default 0,
  gains_cdf         integer     not null default 0,
  jackpot_en_attente boolean    not null default false,
  tirage_id         uuid        references public.okapi_color_tirages(id) on delete set null,
  settled_at        timestamptz,
  created_at        timestamptz not null default now(),

  constraint chk_numeros_count  check (array_length(numeros, 1) = 6),
  constraint chk_prix_positive  check (prix_cdf > 0),
  constraint chk_status check (status in ('pending','gagnant','perdant','cancelled','jackpot_attente'))
);

create index if not exists okapi_color_tickets_user_idx
  on public.okapi_color_tickets (user_id, created_at desc);
create index if not exists okapi_color_tickets_tirage_idx
  on public.okapi_color_tickets (tirage_id);
create index if not exists okapi_color_tickets_status_idx
  on public.okapi_color_tickets (status);

-- 3. Jackpot (singleton row id=1)
-- ---------------------------------------------------------
create table if not exists public.okapi_color_jackpot (
  id          integer     primary key default 1,
  pot_cdf     numeric     not null default 0,
  updated_at  timestamptz not null default now(),

  constraint chk_singleton check (id = 1),
  constraint chk_pot_nonneg check (pot_cdf >= 0)
);

insert into public.okapi_color_jackpot (id, pot_cdf)
  values (1, 0)
  on conflict (id) do nothing;

-- 4. RLS – activate (no policies = service_role only)
-- ---------------------------------------------------------
alter table public.okapi_color_tirages  enable row level security;
alter table public.okapi_color_tickets  enable row level security;
alter table public.okapi_color_jackpot  enable row level security;
