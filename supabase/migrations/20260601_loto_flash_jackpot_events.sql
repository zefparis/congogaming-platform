-- =============================================================
-- H2: Loto Congo & Loto Express (Flash) — Idempotent jackpot delta
-- =============================================================
-- Problem: increment_jackpot / increment_flash_jackpot at payout time
-- were not idempotent. A process crash between loto_settle_ticket_payout_atomic
-- (idempotent) and the bare increment call would double-decrement the pot on retry.
--
-- Solution: event ledger tables with UNIQUE event_key.
-- =============================================================

-- ---- Loto Congo jackpot event ledger ----

create table if not exists public.loto_jackpot_events (
  id          uuid        primary key default gen_random_uuid(),
  event_key   text        unique not null,
  tirage_id   uuid        not null,
  delta_cdf   integer     not null,
  created_at  timestamptz not null default now()
);

create index if not exists loto_jackpot_events_tirage_idx
  on public.loto_jackpot_events (tirage_id);

alter table public.loto_jackpot_events enable row level security;
revoke all on table public.loto_jackpot_events from anon, authenticated;

-- ---------------------------------------------------------
-- apply_loto_jackpot_delta_idempotent
--   Applies a delta to loto_jackpot.pot_cdf exactly once per event_key.
--   Returns true if the delta was applied, false if it was a duplicate.
-- ---------------------------------------------------------
create or replace function public.apply_loto_jackpot_delta_idempotent(
  p_event_key text,
  p_tirage_id uuid,
  p_delta_cdf integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.loto_jackpot_events (event_key, tirage_id, delta_cdf)
  values (p_event_key, p_tirage_id, p_delta_cdf)
  on conflict (event_key) do nothing;

  if not found then
    return false;
  end if;

  perform public.increment_jackpot(p_delta_cdf);
  return true;
end;
$$;

revoke all on function public.apply_loto_jackpot_delta_idempotent(text, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.apply_loto_jackpot_delta_idempotent(text, uuid, integer)
  to service_role;


-- ---- Loto Express (Flash) jackpot event ledger ----

create table if not exists public.flash_jackpot_events (
  id          uuid        primary key default gen_random_uuid(),
  event_key   text        unique not null,
  tirage_id   uuid        not null,
  delta_cdf   integer     not null,
  created_at  timestamptz not null default now()
);

create index if not exists flash_jackpot_events_tirage_idx
  on public.flash_jackpot_events (tirage_id);

alter table public.flash_jackpot_events enable row level security;
revoke all on table public.flash_jackpot_events from anon, authenticated;

-- ---------------------------------------------------------
-- apply_flash_jackpot_delta_idempotent
--   Applies a delta to flash_jackpot.pot_cdf exactly once per event_key.
-- ---------------------------------------------------------
create or replace function public.apply_flash_jackpot_delta_idempotent(
  p_event_key text,
  p_tirage_id uuid,
  p_delta_cdf integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.flash_jackpot_events (event_key, tirage_id, delta_cdf)
  values (p_event_key, p_tirage_id, p_delta_cdf)
  on conflict (event_key) do nothing;

  if not found then
    return false;
  end if;

  perform public.increment_flash_jackpot(p_delta_cdf);
  return true;
end;
$$;

revoke all on function public.apply_flash_jackpot_delta_idempotent(text, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.apply_flash_jackpot_delta_idempotent(text, uuid, integer)
  to service_role;

