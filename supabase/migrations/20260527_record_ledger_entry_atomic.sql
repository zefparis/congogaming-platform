create or replace function public.record_ledger_entry_atomic(
  p_user_id uuid,
  p_direction text,
  p_amount integer,
  p_currency text,
  p_reason text,
  p_reference_type text,
  p_reference_id text,
  p_idempotency_key text
)
returns table(applied boolean, balance integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delta integer;
  v_balance integer;
begin
  if p_direction not in ('credit', 'debit') then
    raise exception 'Invalid ledger direction';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Ledger amount must be positive';
  end if;

  insert into public.ledger_entries (
    user_id,
    direction,
    amount,
    currency,
    reason,
    reference_type,
    reference_id,
    idempotency_key
  ) values (
    p_user_id,
    p_direction,
    p_amount,
    coalesce(nullif(p_currency, ''), 'CDF'),
    p_reason,
    p_reference_type,
    p_reference_id,
    p_idempotency_key
  ) on conflict (idempotency_key) do nothing;

  if not found then
    select balance_cdf into v_balance
    from public.users
    where id = p_user_id;

    return query select false, coalesce(v_balance, 0);
    return;
  end if;

  v_delta := case when p_direction = 'credit' then p_amount else -p_amount end;

  update public.users
  set balance_cdf = balance_cdf + v_delta
  where id = p_user_id
    and balance_cdf + v_delta >= 0
  returning balance_cdf into v_balance;

  if not found then
    raise exception 'Insufficient balance or user not found';
  end if;

  insert into public.wallet_accounts (
    user_id,
    currency,
    balance_cdf,
    updated_at
  ) values (
    p_user_id,
    coalesce(nullif(p_currency, ''), 'CDF'),
    v_balance,
    now()
  ) on conflict (user_id, currency) do update
  set balance_cdf = excluded.balance_cdf,
      updated_at = now();

  return query select true, v_balance;
end;
$$;
