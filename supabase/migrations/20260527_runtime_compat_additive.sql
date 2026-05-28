-- Runtime compatibility additive migration
-- Safe to run multiple times. Does not drop production data.

create extension if not exists "pgcrypto";

alter table public.users
  alter column pin_hash type text,
  add column if not exists kyc_status text not null default 'pending',
  add column if not exists blocked boolean not null default false,
  add column if not exists login_failures integer not null default 0,
  add column if not exists locked_until timestamptz,
  add column if not exists last_login_at timestamptz;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_kyc_status_check'
  ) then
    alter table public.users
      add constraint users_kyc_status_check
      check (kyc_status in ('pending', 'approved', 'denied', 'verify_age'));
  end if;
end $$;

create index if not exists users_locked_until_idx
  on public.users(locked_until) where locked_until is not null;

create index if not exists users_blocked_idx
  on public.users(blocked) where blocked = true;

create table if not exists public.kyc_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  verdict text not null,
  estimated_age integer,
  age_low integer,
  age_high integer,
  is_minor boolean default false,
  confidence numeric(5,2),
  scan_id text,
  created_at timestamptz default now()
);

create index if not exists kyc_checks_user_idx
  on public.kyc_checks(user_id);

create index if not exists kyc_checks_created_idx
  on public.kyc_checks(created_at desc);

alter table public.kyc_checks enable row level security;

create table if not exists public.scratch_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  bet_amount_cdf integer not null,
  grid jsonb not null,
  win_amount_cdf integer not null default 0,
  status text default 'pending',
  created_at timestamptz default now()
);

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'scratch_tickets_status_check'
  ) then
    alter table public.scratch_tickets
      add constraint scratch_tickets_status_check
      check (status in ('pending', 'revealed', 'claimed'));
  end if;
end $$;

create index if not exists scratch_tickets_user_created_idx
  on public.scratch_tickets(user_id, created_at desc);

alter table public.scratch_tickets enable row level security;

create table if not exists public.okapi_auto_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  bet_amount_cdf integer not null check (bet_amount_cdf >= 100),
  target_multiplier numeric(6,2) not null check (target_multiplier >= 1.01),
  max_rounds integer null,
  stop_on_profit_cdf integer null,
  stop_on_loss_cdf integer null,
  rounds_played integer not null default 0,
  total_pnl_cdf integer not null default 0,
  status text not null default 'active',
  started_at timestamptz not null default now(),
  ended_at timestamptz null
);

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'okapi_auto_sessions_status_check'
  ) then
    alter table public.okapi_auto_sessions
      add constraint okapi_auto_sessions_status_check
      check (status in ('active','completed','stopped','aborted'));
  end if;
end $$;

create index if not exists idx_okapi_auto_sessions_user_started
  on public.okapi_auto_sessions(user_id, started_at desc);

create index if not exists idx_okapi_auto_sessions_active
  on public.okapi_auto_sessions(user_id) where status = 'active';

alter table public.okapi_auto_sessions enable row level security;

alter table public.okapi_bets
  add column if not exists auto_session_id uuid null references public.okapi_auto_sessions(id) on delete set null;

create index if not exists idx_okapi_bets_auto_session
  on public.okapi_bets(auto_session_id) where auto_session_id is not null;
