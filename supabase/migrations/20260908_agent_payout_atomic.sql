-- ================================================================
-- Agent payout atomic request — SELECT FOR UPDATE lock
-- ================================================================
-- Prevents double-payout requests from concurrent calls (double-click,
-- retry, or parallel requests). The RPC acquires a row-level lock on
-- the agent, re-checks the 24h cooldown, and updates in a single
-- transaction — mirroring the record_ledger_entry_atomic pattern.
--
-- Returns:
--   { ok: true, amount: <pending total> }  on success
--   { ok: false, code: 'ALREADY_REQUESTED' }  if within 24h cooldown
--   { ok: false, code: 'BELOW_MINIMUM', minimum: <n>, current: <n> }
--   { ok: false, code: 'AGENT_NOT_FOUND' }
--
-- SECURITY DEFINER + REVOKE: only the backend (service_role) calls this.
-- ================================================================

create or replace function public.request_agent_payout_atomic(
  p_agent_id uuid,
  p_min_payout_cdf integer,
  p_diamond_threshold_cdf integer default 5000000,
  p_diamond_minimum_cdf integer default 1000
)
returns table(ok boolean, code text, amount integer, minimum integer, current integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agent record;
  v_pending_total integer;
  v_minimum integer;
  v_ms_since bigint;
begin
  -- Lock the agent row FOR UPDATE to serialize concurrent payout requests.
  select *
    into v_agent
    from public.agents
    where id = p_agent_id
      and status = 'active'
    for update;

  if not found then
    return query select false, 'AGENT_NOT_FOUND'::text, 0, 0, 0;
    return;
  end if;

  -- Sum pending commissions (read after lock — consistent with agent row).
  select coalesce(sum(commission_cdf), 0)
    into v_pending_total
    from public.agent_commissions
    where agent_id = p_agent_id
      and status = 'pending';

  -- Compute tier-based minimum.
  if coalesce(v_agent.total_earned_cdf, 0) >= p_diamond_threshold_cdf then
    v_minimum := p_diamond_minimum_cdf;
  else
    v_minimum := coalesce(p_min_payout_cdf, 2000);
  end if;

  if v_pending_total < v_minimum then
    return query select false, 'BELOW_MINIMUM'::text, 0, v_minimum, v_pending_total;
    return;
  end if;

  -- Check 24h cooldown on previous payout request.
  if v_agent.payout_requested_at is not null then
    v_ms_since := extract(epoch from (now() - v_agent.payout_requested_at)) * 1000;
    if v_ms_since < 24 * 60 * 60 * 1000 then
      return query select false, 'ALREADY_REQUESTED'::text, 0, 0, 0;
      return;
    end if;
  end if;

  -- Atomically mark the payout request.
  update public.agents
    set payout_requested_at = now(),
        payout_requested_amount_cdf = v_pending_total
    where id = p_agent_id;

  return query select true, null::text, v_pending_total, 0, 0;
end;
$$;

-- Revoke execute from anon/authenticated — only service_role (backend) may call.
revoke all on function public.request_agent_payout_atomic(uuid, integer, integer, integer) from anon, authenticated;
grant execute on function public.request_agent_payout_atomic(uuid, integer, integer, integer) to service_role;
