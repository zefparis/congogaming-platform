alter table public.scratch_tickets
  add column if not exists claimed_at timestamptz;

create or replace function public.scratch_claim_atomic(
  p_ticket_id uuid,
  p_user_id uuid,
  p_idempotency_key text
)
returns table(win_amount_cdf integer, new_balance integer, grid jsonb, applied boolean)
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
    true;
end;
$$;
