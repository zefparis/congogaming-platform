-- Responsible gaming + referral program
-- Adds:
--   * `user_limits` : optional daily / weekly / monthly deposit caps, self-exclusion deadline.
--   * `users.referral_code` : unique short code generated for every user.
--   * `users.referred_by`  : FK to the user who invited them.
--   * `referral_rewards`   : ledger of credits to referrers (future-proof).
--   * `enforce_deposit_limits` : RPC the server can call to atomically check
--     daily / weekly / monthly caps and self-exclusion before a deposit.

-- ============================================================
-- Responsible gaming
-- ============================================================
create table if not exists public.user_limits (
  user_id uuid primary key references public.users(id) on delete cascade,
  daily_deposit_cdf numeric(15,2),
  weekly_deposit_cdf numeric(15,2),
  monthly_deposit_cdf numeric(15,2),
  self_exclusion_until timestamptz,
  -- When a limit is RAISED, the new value becomes effective only after a
  -- 24h cooldown (regulator-style "cooling-off"). Lowering is immediate.
  pending_raise jsonb,
  pending_raise_effective_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.user_limits enable row level security;
revoke all on table public.user_limits from anon;
revoke all on table public.user_limits from authenticated;

create index if not exists user_limits_self_exclusion_idx
  on public.user_limits (self_exclusion_until)
  where self_exclusion_until is not null;

-- Atomically validate that a deposit is allowed for the user.
-- Returns a row with allowed=false and a reason when blocked.
create or replace function public.check_deposit_allowed(
  p_user_id uuid,
  p_amount numeric
)
returns table(allowed boolean, reason text, retry_after timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limits public.user_limits%rowtype;
  v_daily numeric := 0;
  v_weekly numeric := 0;
  v_monthly numeric := 0;
begin
  select * into v_limits from public.user_limits where user_id = p_user_id;

  -- Self-exclusion (active period)
  if v_limits.self_exclusion_until is not null
     and v_limits.self_exclusion_until > now() then
    return query select false, 'SELF_EXCLUDED'::text, v_limits.self_exclusion_until;
    return;
  end if;

  -- Aggregate successful deposits over rolling windows
  -- status = 2 means SUCCESS in this codebase
  select coalesce(sum(amount), 0) into v_daily
    from public.transactions
    where user_id = p_user_id
      and type = 'deposit'
      and status = 2
      and created_at >= now() - interval '24 hours';

  select coalesce(sum(amount), 0) into v_weekly
    from public.transactions
    where user_id = p_user_id
      and type = 'deposit'
      and status = 2
      and created_at >= now() - interval '7 days';

  select coalesce(sum(amount), 0) into v_monthly
    from public.transactions
    where user_id = p_user_id
      and type = 'deposit'
      and status = 2
      and created_at >= now() - interval '30 days';

  if v_limits.daily_deposit_cdf is not null
     and v_daily + p_amount > v_limits.daily_deposit_cdf then
    return query select false, 'DAILY_LIMIT_EXCEEDED'::text, null::timestamptz;
    return;
  end if;
  if v_limits.weekly_deposit_cdf is not null
     and v_weekly + p_amount > v_limits.weekly_deposit_cdf then
    return query select false, 'WEEKLY_LIMIT_EXCEEDED'::text, null::timestamptz;
    return;
  end if;
  if v_limits.monthly_deposit_cdf is not null
     and v_monthly + p_amount > v_limits.monthly_deposit_cdf then
    return query select false, 'MONTHLY_LIMIT_EXCEEDED'::text, null::timestamptz;
    return;
  end if;

  return query select true, null::text, null::timestamptz;
end;
$$;

revoke all on function public.check_deposit_allowed(uuid, numeric) from public, anon, authenticated;
grant execute on function public.check_deposit_allowed(uuid, numeric) to service_role;

-- ============================================================
-- Referral program
-- ============================================================
alter table public.users
  add column if not exists referral_code text,
  add column if not exists referred_by uuid references public.users(id) on delete set null;

create unique index if not exists users_referral_code_unique
  on public.users (referral_code)
  where referral_code is not null;

create index if not exists users_referred_by_idx on public.users (referred_by);

-- Generate a short, human-friendly code (8 base32-ish chars, no ambiguous 0/O/1/I).
create or replace function public.generate_referral_code()
returns text
language plpgsql
as $$
declare
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_attempt int := 0;
begin
  loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.users where referral_code = v_code);
    v_attempt := v_attempt + 1;
    if v_attempt > 10 then
      raise exception 'Failed to generate unique referral code after 10 attempts';
    end if;
  end loop;
  return v_code;
end;
$$;

revoke all on function public.generate_referral_code() from public, anon, authenticated;
grant execute on function public.generate_referral_code() to service_role;

-- Backfill existing users so they all have a code.
update public.users
  set referral_code = public.generate_referral_code()
  where referral_code is null;

-- Future-proof referral rewards ledger (we only write here when we decide to
-- credit the referrer, e.g. on the referee's first verified deposit).
create table if not exists public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.users(id) on delete cascade,
  referred_id uuid not null references public.users(id) on delete cascade,
  amount_cdf numeric(15,2) not null default 0,
  status text not null default 'pending' check (status in ('pending','credited','cancelled')),
  trigger_event text,
  created_at timestamptz not null default now(),
  credited_at timestamptz,
  unique(referrer_id, referred_id)
);

alter table public.referral_rewards enable row level security;
revoke all on table public.referral_rewards from anon;
revoke all on table public.referral_rewards from authenticated;

create index if not exists referral_rewards_referrer_idx
  on public.referral_rewards (referrer_id, status);
