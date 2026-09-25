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

-- NOTE: Loto, Loto Express (Flash), Scratch and Okapi Climb were removed
-- (see supabase/migrations/20260923_drop_removed_games.sql). Their tables,
-- RPCs and RLS are intentionally absent from this baseline. The
-- transaction_type enum keeps 'loto_ticket'/'loto_payout' for historical rows.
