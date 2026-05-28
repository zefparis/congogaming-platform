create or replace function public.loto_settle_ticket_payout_atomic(
  p_ticket_id uuid,
  p_status text,
  p_nb_bons integer,
  p_gains_cdf integer,
  p_jackpot_en_attente boolean,
  p_tirage_id uuid,
  p_idempotency_key text
)
returns table(applied boolean, balance integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.loto_tickets%rowtype;
  v_ledger record;
  v_balance integer;
begin
  select * into v_ticket
  from public.loto_tickets
  where id = p_ticket_id
  for update;

  if not found then
    raise exception 'ticket_not_found';
  end if;

  if coalesce(p_gains_cdf, 0) > 0 and exists (
    select 1 from public.ledger_entries where idempotency_key = p_idempotency_key
  ) then
    select balance_cdf into v_balance from public.users where id = v_ticket.user_id;
    return query select false, coalesce(v_balance, 0);
    return;
  end if;

  if v_ticket.status = 'gagnant' and coalesce(v_ticket.gains_cdf, 0) > 0 and coalesce(p_gains_cdf, 0) > 0 then
    raise exception 'ticket_already_paid';
  end if;

  update public.loto_tickets
  set status = p_status,
      nb_bons = p_nb_bons,
      gains_cdf = p_gains_cdf,
      jackpot_en_attente = p_jackpot_en_attente,
      tirage_id = p_tirage_id
  where id = p_ticket_id;

  if coalesce(p_gains_cdf, 0) > 0 then
    select * into v_ledger
    from public.record_ledger_entry_atomic(
      v_ticket.user_id,
      'credit',
      p_gains_cdf,
      'CDF',
      'loto_payout',
      'loto_ticket',
      p_ticket_id::text,
      p_idempotency_key
    );
    return query select coalesce(v_ledger.applied, false), v_ledger.balance::integer;
    return;
  end if;

  select balance_cdf into v_balance from public.users where id = v_ticket.user_id;
  return query select true, coalesce(v_balance, 0);
end;
$$;

create or replace function public.flash_settle_ticket_payout_atomic(
  p_ticket_id uuid,
  p_status text,
  p_nb_bons integer,
  p_gains_cdf integer,
  p_jackpot_en_attente boolean,
  p_tirage_id uuid,
  p_idempotency_key text
)
returns table(applied boolean, balance integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.flash_tickets%rowtype;
  v_ledger record;
  v_balance integer;
begin
  select * into v_ticket
  from public.flash_tickets
  where id = p_ticket_id
  for update;

  if not found then
    raise exception 'ticket_not_found';
  end if;

  if coalesce(p_gains_cdf, 0) > 0 and exists (
    select 1 from public.ledger_entries where idempotency_key = p_idempotency_key
  ) then
    select balance_cdf into v_balance from public.users where id = v_ticket.user_id;
    return query select false, coalesce(v_balance, 0);
    return;
  end if;

  if v_ticket.status = 'gagnant' and coalesce(v_ticket.gains_cdf, 0) > 0 and coalesce(p_gains_cdf, 0) > 0 then
    raise exception 'ticket_already_paid';
  end if;

  update public.flash_tickets
  set status = p_status,
      nb_bons = p_nb_bons,
      gains_cdf = p_gains_cdf,
      jackpot_en_attente = p_jackpot_en_attente,
      tirage_id = p_tirage_id
  where id = p_ticket_id;

  if coalesce(p_gains_cdf, 0) > 0 then
    select * into v_ledger
    from public.record_ledger_entry_atomic(
      v_ticket.user_id,
      'credit',
      p_gains_cdf,
      'CDF',
      'flash_payout',
      'flash_ticket',
      p_ticket_id::text,
      p_idempotency_key
    );
    return query select coalesce(v_ledger.applied, false), v_ledger.balance::integer;
    return;
  end if;

  select balance_cdf into v_balance from public.users where id = v_ticket.user_id;
  return query select true, coalesce(v_balance, 0);
end;
$$;
