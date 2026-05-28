alter table public.okapi_bets
  add column if not exists cashed_out_at timestamptz;

create or replace function public.okapi_cashout_atomic(
  p_bet_id uuid,
  p_user_id uuid,
  p_cashout_multiplier numeric,
  p_win_amount integer,
  p_idempotency_key text
)
returns table(applied boolean, balance integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bet public.okapi_bets%rowtype;
  v_ledger record;
  v_balance integer;
begin
  if p_win_amount is null or p_win_amount <= 0 then
    raise exception 'Invalid win amount';
  end if;

  if exists (
    select 1
    from public.ledger_entries
    where idempotency_key = p_idempotency_key
  ) then
    select balance_cdf into v_balance
    from public.users
    where id = p_user_id;

    return query select false, coalesce(v_balance, 0);
    return;
  end if;

  select * into v_bet
  from public.okapi_bets
  where id = p_bet_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Bet not found';
  end if;

  if v_bet.status not in ('active', 'pending') or v_bet.cashout_multiplier is not null then
    raise exception 'Bet already cashed out';
  end if;

  update public.okapi_bets
  set status = 'cashed_out',
      cashout_multiplier = p_cashout_multiplier,
      win_amount_cdf = p_win_amount,
      cashed_out_at = now()
  where id = p_bet_id
    and user_id = p_user_id;

  select * into v_ledger
  from public.record_ledger_entry_atomic(
    p_user_id,
    'credit',
    p_win_amount,
    'CDF',
    'okapi_cashout',
    'okapi_bet',
    p_bet_id::text,
    p_idempotency_key
  );

  return query select coalesce(v_ledger.applied, false), v_ledger.balance::integer;
end;
$$;
