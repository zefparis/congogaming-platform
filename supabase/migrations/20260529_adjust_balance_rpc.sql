-- Atomic balance adjustment RPC
-- Used by admin balance adjustments, withdrawals, deposits, and game payouts
-- Returns the new balance. Raises if user not found or balance would go negative.
-- DROP first because the return type changed from void to numeric in previous versions.

drop function if exists public.adjust_balance(uuid, numeric);

create or replace function public.adjust_balance(
  p_user_id uuid,
  p_delta numeric
)
returns numeric
language plpgsql
set search_path = public
as $$
declare
  new_balance numeric;
begin
  update public.users
  set balance_cdf = balance_cdf + p_delta
  where id = p_user_id
    and balance_cdf + p_delta >= 0
  returning balance_cdf into new_balance;

  if new_balance is null then
    raise exception 'Insufficient balance or user not found';
  end if;

  return new_balance;
end;
$$;

-- Permissions: only service_role can execute this RPC
revoke all on function public.adjust_balance(uuid, numeric) from public, anon, authenticated;
grant execute on function public.adjust_balance(uuid, numeric) to service_role;
