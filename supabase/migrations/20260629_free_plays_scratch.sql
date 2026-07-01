-- Free plays integration with Scratch tickets.
--
-- 1. Track which scratch tickets were bought with a free play.
-- 2. Recreate scratch_claim_atomic so it exposes is_free_play (used to skip
--    agent win commissions on free tickets).
-- 3. Make consume_free_play consume exactly one row (oldest expiring first)
--    instead of all active rows, and lock down execute permissions.
-- 4. Add scratch_buy_free_atomic for atomic free-play debit + ticket creation.

-- ============================================================
-- 1. Scratch ticket flag
-- ============================================================
alter table public.scratch_tickets
  add column if not exists is_free_play boolean not null default false;

-- ============================================================
-- 2. scratch_claim_atomic now returns is_free_play
-- ============================================================
-- Return type changed (added is_free_play), so CREATE OR REPLACE is not enough.
drop function if exists public.scratch_claim_atomic(uuid, uuid, text);

create or replace function public.scratch_claim_atomic(
  p_ticket_id uuid,
  p_user_id uuid,
  p_idempotency_key text
)
returns table(
  win_amount_cdf integer,
  new_balance integer,
  grid jsonb,
  applied boolean,
  is_free_play boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.scratch_tickets%rowtype;
  v_ledger record;
  v_balance integer;
begin
  select * into v_ticket
  from public.scratch_tickets
  where id = p_ticket_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'ticket_not_found';
  end if;

  if v_ticket.status = 'claimed' then
    raise exception 'already_claimed';
  end if;

  update public.scratch_tickets
  set status = 'claimed',
      claimed_at = now()
  where id = p_ticket_id
    and user_id = p_user_id;

  if coalesce(v_ticket.win_amount_cdf, 0) > 0 then
    select * into v_ledger
    from public.record_ledger_entry_atomic(
      p_user_id,
      'credit',
      v_ticket.win_amount_cdf::integer,
      'CDF',
      'scratch_claim',
      'scratch_ticket',
      p_ticket_id::text,
      p_idempotency_key
    );
    v_balance := v_ledger.balance::integer;
  else
    select balance_cdf into v_balance
    from public.users
    where id = p_user_id;
  end if;

  return query select
    coalesce(v_ticket.win_amount_cdf, 0)::integer,
    coalesce(v_balance, 0)::integer,
    v_ticket.grid,
    true,
    v_ticket.is_free_play;
end;
$$;

revoke all on function public.scratch_claim_atomic(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.scratch_claim_atomic(uuid, uuid, text) to service_role;

-- ============================================================
-- 3. consume_free_play: debit exactly one row, oldest expiry first
-- ============================================================
create or replace function public.consume_free_play(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  with row_to_update as (
    select id
    from public.free_plays
    where user_id = p_user_id
      and plays_remaining > 0
      and expires_at > now()
    order by expires_at asc, created_at asc
    limit 1
    for update skip locked
  )
  update public.free_plays fp
  set plays_remaining = plays_remaining - 1
  from row_to_update
  where fp.id = row_to_update.id;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke all on function public.consume_free_play(uuid) from public, anon, authenticated;
grant execute on function public.consume_free_play(uuid) to service_role;

-- ============================================================
-- 4. Atomic free-play scratch ticket creation
-- ============================================================
create or replace function public.scratch_buy_free_atomic(
  p_user_id uuid,
  p_bet_amount_cdf integer,
  p_grid jsonb,
  p_win_amount_cdf integer
)
returns table(ticket_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket_id uuid;
begin
  -- Consume exactly one free play. If none is available, the whole
  -- transaction aborts and no ticket is created.
  with row_to_update as (
    select id
    from public.free_plays
    where user_id = p_user_id
      and plays_remaining > 0
      and expires_at > now()
    order by expires_at asc, created_at asc
    limit 1
    for update skip locked
  )
  update public.free_plays fp
  set plays_remaining = plays_remaining - 1
  from row_to_update
  where fp.id = row_to_update.id;

  if not found then
    raise exception 'no_free_plays';
  end if;

  insert into public.scratch_tickets (
    user_id,
    bet_amount_cdf,
    grid,
    win_amount_cdf,
    status,
    is_free_play
  ) values (
    p_user_id,
    p_bet_amount_cdf,
    p_grid,
    p_win_amount_cdf,
    'pending',
    true
  )
  returning id into v_ticket_id;

  return query select v_ticket_id;
end;
$$;

revoke all on function public.scratch_buy_free_atomic(uuid, integer, jsonb, integer) from public, anon, authenticated;
grant execute on function public.scratch_buy_free_atomic(uuid, integer, jsonb, integer) to service_role;
