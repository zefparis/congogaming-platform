-- ================================================================
-- Agent payouts — traçabilité des paiements de commissions
-- ================================================================
-- Avant : POST /api/admin/agents/:id/pay marquait TOUTES les
-- commissions pending comme 'paid', sans montant, sans référence de
-- transaction mobile money, sans lien vers un objet payout.
--
-- Après :
--   * table `agent_payouts` : une ligne par paiement réel effectué
--     (montant, opérateur mobile money, référence de transaction,
--     admin payeur).
--   * `agent_commissions.payout_id` relie chaque commission payée au
--     payout correspondant.
--   * RPC `pay_agent_commissions_atomic` : sous SELECT FOR UPDATE sur
--     la ligne agent, seules les commissions pending créées AVANT
--     `payout_requested_at` sont soldées ; le montant saisi doit être
--     exactement égal à leur total sinon AMOUNT_MISMATCH ; la demande
--     de payout est ensuite effacée. Un double-clic ou un retry ne
--     peut pas créer deux payouts (le second voit
--     payout_requested_at = null → NO_PAYOUT_REQUEST).
--
-- Codes de retour :
--   ok=true, payout_id, expected, paid_count
--   ok=false + code : AGENT_NOT_FOUND | NO_PAYOUT_REQUEST |
--                     NOTHING_TO_PAY | AMOUNT_MISMATCH (avec expected)
-- ================================================================


-- ============================================================
-- 1. Table agent_payouts
-- ============================================================
create table if not exists public.agent_payouts (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid not null references public.agents(id) on delete cascade,
  amount_cdf  integer not null check (amount_cdf > 0),
  operator    text not null,        -- opérateur mobile money utilisé pour le paiement
  reference   text not null,        -- référence de la transaction mobile money
  paid_by     uuid references public.users(id) on delete set null,  -- admin payeur
  created_at  timestamptz not null default now()
);

create index if not exists agent_payouts_agent_idx
  on public.agent_payouts (agent_id, created_at desc);

-- Unicité de la référence par opérateur : empêche de réutiliser la
-- même référence mobile money pour deux payouts (double paiement).
create unique index if not exists agent_payouts_operator_reference_uidx
  on public.agent_payouts (operator, reference);


-- ============================================================
-- 2. Lien commission → payout
-- ============================================================
alter table public.agent_commissions
  add column if not exists payout_id uuid references public.agent_payouts(id) on delete set null;

create index if not exists agent_commissions_payout_idx
  on public.agent_commissions (payout_id)
  where payout_id is not null;


-- ============================================================
-- 3. RLS — deny-all pour anon/authenticated (même politique que
--    20260908_agents_rls.sql sur agents / agent_commissions)
-- ============================================================
alter table public.agent_payouts enable row level security;
revoke insert, update, delete on table public.agent_payouts from anon, authenticated;
revoke select on table public.agent_payouts from anon, authenticated;


-- ============================================================
-- 4. RPC pay_agent_commissions_atomic
-- ============================================================
create or replace function public.pay_agent_commissions_atomic(
  p_agent_id      uuid,
  p_amount_cdf    integer,
  p_operator      text,
  p_reference     text,
  p_admin_user_id uuid
)
returns table(ok boolean, code text, payout_id uuid, expected integer, paid_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agent      record;
  v_expected   integer;
  v_ids        uuid[];
  v_payout_id  uuid;
  v_paid_count integer;
begin
  -- Lock the agent row FOR UPDATE : sérialise les paiements concurrents
  -- et rend le cutoff payout_requested_at stable pendant la transaction.
  select * into v_agent
    from public.agents
    where id = p_agent_id
    for update;

  if not found then
    return query select false, 'AGENT_NOT_FOUND'::text, null::uuid, 0, 0;
    return;
  end if;

  -- Un paiement exige une demande de payout active de l'agent.
  if v_agent.payout_requested_at is null then
    return query select false, 'NO_PAYOUT_REQUEST'::text, null::uuid, 0, 0;
    return;
  end if;

  -- Commissions éligibles : pending ET créées AVANT la demande.
  -- Les commissions postérieures à la demande restent pending.
  select coalesce(sum(commission_cdf), 0),
         coalesce(array_agg(id), '{}'::uuid[])
    into v_expected, v_ids
    from public.agent_commissions
    where agent_id = p_agent_id
      and status = 'pending'
      and created_at < v_agent.payout_requested_at;

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    return query select false, 'NOTHING_TO_PAY'::text, null::uuid, v_expected, 0;
    return;
  end if;

  -- Le montant saisi doit correspondre EXACTEMENT au total éligible :
  -- pas de paiement partiel ni de sur-paiement.
  if p_amount_cdf is null or p_amount_cdf <> v_expected then
    return query select false, 'AMOUNT_MISMATCH'::text, null::uuid, v_expected, 0;
    return;
  end if;

  insert into public.agent_payouts (agent_id, amount_cdf, operator, reference, paid_by)
  values (p_agent_id, p_amount_cdf, p_operator, p_reference, p_admin_user_id)
  returning id into v_payout_id;

  update public.agent_commissions
    set status = 'paid',
        payout_id = v_payout_id
    where id = any(v_ids)
      and status = 'pending';
  get diagnostics v_paid_count = row_count;

  update public.agents
    set payout_requested_at = null,
        payout_requested_amount_cdf = null
    where id = p_agent_id;

  return query select true, null::text, v_payout_id, v_expected, v_paid_count;
end;
$$;

revoke all on function public.pay_agent_commissions_atomic(uuid, integer, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.pay_agent_commissions_atomic(uuid, integer, text, text, uuid)
  to service_role;
