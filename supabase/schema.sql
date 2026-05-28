-- Congo Gaming — Supabase schema
-- Run in the Supabase SQL editor.

create extension if not exists "pgcrypto";

-- ENUM type for transaction direction
do $$ begin
  if not exists (select 1 from pg_type where typname = 'transaction_type') then
    create type transaction_type as enum ('deposit', 'withdrawal', 'loto_ticket', 'loto_payout');
  end if;
end $$;

-- USERS
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  phone varchar(20) not null unique,
  pin_hash varchar(64) not null,
  balance_cdf decimal(15,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists users_phone_idx on public.users(phone);

-- TRANSACTIONS
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  order_id varchar(128) not null unique,
  type transaction_type not null,
  amount decimal(15,2) not null,
  currency varchar(3) not null default 'CDF',
  provider_id integer not null,
  status integer not null default 0,
  transaction_id varchar(100),
  created_at timestamptz not null default now()
);

create index if not exists transactions_user_idx on public.transactions(user_id, created_at desc);
create index if not exists transactions_order_idx on public.transactions(order_id);

-- Atomic balance adjustment (used by withdraw, deposit, okapi)
-- Returns the new balance. Raises if user not found or balance would go negative.
-- DROP first because the return type changed from void to numeric.
drop function if exists public.adjust_balance(uuid, numeric);
create or replace function public.adjust_balance(
  p_user_id uuid,
  p_delta numeric
)
returns numeric
language plpgsql
set search_path = public
as $$
declare
  new_balance numeric;
begin
  update public.users
  set balance_cdf = balance_cdf + p_delta
  where id = p_user_id
    and balance_cdf + p_delta >= 0
  returning balance_cdf into new_balance;

  if new_balance is null then
    raise exception 'Insufficient balance or user not found';
  end if;

  return new_balance;
end;
$$;

-- RLS
alter table public.users enable row level security;
alter table public.transactions enable row level security;

-- Allow anon role to register/login by phone (insert + select own row).
-- For production, you should move auth behind a server-side endpoint.
drop policy if exists "users_insert_anon" on public.users;
create policy "users_insert_anon" on public.users
  for insert to anon
  with check (true);

drop policy if exists "users_select_by_phone" on public.users;
create policy "users_select_by_phone" on public.users
  for select to anon
  using (true);

-- Transactions are read/write only via service key (server). No anon policy.

-- LOTO TIRAGES
create table if not exists public.loto_tirages (
  id uuid primary key default gen_random_uuid(),
  numeros integer[] not null,           -- 6 numéros tirés [1-49]
  complementaire integer not null,       -- 1 numéro complémentaire
  jackpot decimal(15,2) not null default 0,
  hash_pre text not null,               -- SHA-256 publié AVANT le tirage
  drawn_at timestamptz not null default now()
);

-- LOTO TICKETS
create table if not exists public.loto_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  tirage_id uuid references public.loto_tirages(id) on delete set null,
  numeros integer[] not null,           -- 6 numéros choisis par le joueur
  prix_cdf decimal(15,2) not null default 500,
  gains_cdf decimal(15,2) not null default 0,
  nb_bons integer not null default 0,   -- nombre de numéros corrects
  status text not null default 'pending', -- pending | gagnant | perdant
  created_at timestamptz not null default now()
);

create index if not exists loto_tickets_user_idx on public.loto_tickets(user_id, created_at desc);
create index if not exists loto_tickets_tirage_idx on public.loto_tickets(tirage_id);

-- RLS : lecture/écriture via service key uniquement
alter table public.loto_tirages enable row level security;
alter table public.loto_tickets enable row level security;

-- Pot jackpot singleton
create table if not exists public.loto_jackpot (
  id int primary key default 1,
  pot_cdf decimal(15,2) not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.loto_jackpot (id, pot_cdf) values (1, 0)
  on conflict (id) do nothing;

-- Colonne jackpot_en_attente sur loto_tickets
alter table public.loto_tickets
  add column if not exists jackpot_en_attente boolean not null default false;

-- Fonction RPC increment_jackpot
create or replace function public.increment_jackpot(delta numeric)
returns void language plpgsql as $$
begin
  update public.loto_jackpot
  set pot_cdf = pot_cdf + delta, updated_at = now()
  where id = 1;
end;
$$;

alter table public.loto_jackpot enable row level security;

-- FLASH TIRAGES
create table if not exists public.flash_tirages (
  id uuid primary key default gen_random_uuid(),
  numeros integer[] not null,
  hash_pre text not null,
  jackpot_paye boolean not null default false,
  drawn_at timestamptz not null default now()
);

-- FLASH TICKETS
create table if not exists public.flash_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  tirage_id uuid references public.flash_tirages(id) on delete set null,
  numeros integer[] not null,
  prix_cdf decimal(15,2) not null default 500,
  gains_cdf decimal(15,2) not null default 0,
  nb_bons integer not null default 0,
  status text not null default 'pending',
  jackpot_en_attente boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists flash_tickets_user_idx on public.flash_tickets(user_id, created_at desc);
create index if not exists flash_tickets_tirage_idx on public.flash_tickets(tirage_id);

-- POT JACKPOT FLASH (singleton)
create table if not exists public.flash_jackpot (
  id int primary key default 1,
  pot_cdf decimal(15,2) not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.flash_jackpot (id, pot_cdf) values (1, 0)
  on conflict (id) do nothing;

-- RPC increment_flash_jackpot
create or replace function public.increment_flash_jackpot(delta numeric)
returns void language plpgsql as $$
begin
  update public.flash_jackpot
  set pot_cdf = pot_cdf + delta, updated_at = now()
  where id = 1;
end;
$$;

alter table public.flash_tirages enable row level security;
alter table public.flash_tickets enable row level security;
alter table public.flash_jackpot enable row level security;

-- OKAPI CLIMB
create table if not exists public.okapi_rounds (
  id uuid primary key default gen_random_uuid(),
  crash_point decimal(10,2) not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.okapi_bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  round_id uuid references public.okapi_rounds(id),
  amount_cdf decimal(15,2) not null,
  cashout_multiplier decimal(10,2),
  win_amount_cdf decimal(15,2),
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
