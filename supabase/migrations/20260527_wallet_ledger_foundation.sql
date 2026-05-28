create extension if not exists "pgcrypto";

create table if not exists public.wallet_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  currency text not null default 'CDF',
  balance_cdf integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, currency)
);

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  direction text not null,
  amount integer not null,
  currency text not null default 'CDF',
  reason text not null,
  reference_type text,
  reference_id text,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  check (direction in ('credit', 'debit')),
  check (amount > 0)
);

create index if not exists wallet_accounts_user_id_idx
  on public.wallet_accounts(user_id);

create index if not exists ledger_entries_user_created_idx
  on public.ledger_entries(user_id, created_at desc);

create index if not exists ledger_entries_reference_idx
  on public.ledger_entries(reference_type, reference_id)
  where reference_type is not null and reference_id is not null;

alter table public.wallet_accounts enable row level security;
alter table public.ledger_entries enable row level security;
