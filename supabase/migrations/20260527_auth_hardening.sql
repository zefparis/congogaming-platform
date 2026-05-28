-- Phase 1 Auth Hardening P0
-- Run after backing up production data.

alter table public.users
  alter column pin_hash type text;

alter table public.users
  add column if not exists kyc_status text not null default 'pending',
  add column if not exists blocked boolean not null default false,
  add column if not exists login_failures integer not null default 0,
  add column if not exists locked_until timestamptz,
  add column if not exists last_login_at timestamptz;

alter table public.users
  add constraint users_balance_non_negative check (balance_cdf >= 0),
  add constraint users_login_failures_non_negative check (login_failures >= 0);

-- Remove public client access to identity/wallet table.
drop policy if exists "users_insert_anon" on public.users;
drop policy if exists "users_select_by_phone" on public.users;

revoke all on table public.users from anon;
revoke all on table public.users from authenticated;
revoke all on table public.transactions from anon;
revoke all on table public.transactions from authenticated;

create index if not exists users_locked_until_idx on public.users(locked_until) where locked_until is not null;
create index if not exists users_blocked_idx on public.users(blocked);

-- Optional future-safe auth audit table.
create table if not exists public.auth_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  phone varchar(20),
  event_type text not null check (event_type in ('register','login_success','login_failed','lockout','logout')),
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.auth_events enable row level security;
revoke all on table public.auth_events from anon;
revoke all on table public.auth_events from authenticated;
