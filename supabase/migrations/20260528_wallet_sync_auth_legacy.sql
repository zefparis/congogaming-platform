-- Migration: synchronise wallet_accounts with users + flag legacy SHA-256 PIN
-- hashes that must be reset to Argon2id.
-- Safe to run multiple times. Does not delete users, balances, or transactions.

begin;

-- 1) Ensure every user has a matching wallet_accounts row in CDF
insert into public.wallet_accounts (
  user_id,
  currency,
  balance_cdf
)
select
  u.id,
  'CDF',
  coalesce(u.balance_cdf, 0)::integer
from public.users u
on conflict (user_id, currency)
do update set
  balance_cdf = excluded.balance_cdf,
  updated_at = now();

-- 2) Add pin_must_reset flag for legacy auth migration
alter table public.users
  add column if not exists pin_must_reset boolean not null default false;

-- 3) Flag every account still using SHA-256 (64 lowercase hex chars) — these
--    cannot login until the user resets their PIN through the dedicated flow.
update public.users
set pin_must_reset = true
where pin_hash ~ '^[a-f0-9]{64}$';

commit;
