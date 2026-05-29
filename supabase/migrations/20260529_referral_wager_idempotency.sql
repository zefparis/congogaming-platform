-- Phase 2.1 — Idempotence par mise (et plus seulement par palier).
--
-- Contexte :
--   `process_referral_wager` n'était idempotent que par palier (un palier
--   donné n'est jamais crédité 2 fois). Mais `users.lifetime_wagered_cdf`
--   était incrémenté à CHAQUE appel — donc un retry HTTP, un double submit,
--   un re-render frontend ou un callback dupliqué pouvait doubler le
--   compteur. Effet de bord : un joueur ayant misé 5 000 CDF une fois
--   pouvait franchir le palier des 25 000 prématurément si l'event est
--   rejoué 5x, puisque `lifetime_wagered_cdf` croîtrait artificiellement.
--
-- Correction :
--   * Nouvelle table `referral_wager_events` (wager_source, wager_id, …)
--     avec PK composite → 1 mise = 1 event.
--   * `process_referral_wager` exige maintenant `p_source` + `p_wager_id`.
--     Elle tente d'insérer l'event ; si conflit → return immédiat.
--     Ainsi tout incrément de `lifetime_wagered_cdf` ET tout tier reward
--     sont gardés à l'abri d'un double-call.

-- ============================================================
-- Dedup table
-- ============================================================
create table if not exists public.referral_wager_events (
  wager_source text not null
    check (wager_source in ('loto', 'flash', 'scratch', 'okapi')),
  wager_id     text not null,
  user_id      uuid not null references public.users(id) on delete cascade,
  amount_cdf   numeric(15,2) not null check (amount_cdf > 0),
  created_at   timestamptz not null default now(),
  primary key (wager_source, wager_id)
);

create index if not exists referral_wager_events_user_idx
  on public.referral_wager_events (user_id, created_at desc);

alter table public.referral_wager_events enable row level security;
-- Service role only (no policies = denied by default).

-- ============================================================
-- Replace the function signature
-- ============================================================
drop function if exists public.process_referral_wager(uuid, numeric);

create or replace function public.process_referral_wager(
  p_user_id uuid,
  p_amount numeric,
  p_source text,
  p_wager_id text
) returns void
language plpgsql
security definer
set search_path = public
as $func_wager_v2$
declare
  v_referrer uuid;
  v_new_wagered numeric;
  v_annual_cap numeric := 50000;
  v_annual_credited numeric;
  v_remaining numeric;
  v_tier record;
  v_credit numeric;
  v_inserted_id text;
begin
  if p_amount is null or p_amount <= 0 then return; end if;
  if p_source is null or p_wager_id is null then return; end if;
  if p_source not in ('loto', 'flash', 'scratch', 'okapi') then return; end if;

  -- Idempotency gate: try to record the wager event.
  -- If it already exists (retry / double submit), bail out silently.
  insert into public.referral_wager_events
    (wager_source, wager_id, user_id, amount_cdf)
  values
    (p_source, p_wager_id, p_user_id, p_amount)
  on conflict (wager_source, wager_id) do nothing
  returning wager_id into v_inserted_id;

  if v_inserted_id is null then
    -- Duplicate event. Do nothing — no balance change, no counter bump.
    return;
  end if;

  -- First time we see this wager: increment the lifetime counter.
  update public.users
    set lifetime_wagered_cdf = lifetime_wagered_cdf + p_amount
    where id = p_user_id
    returning lifetime_wagered_cdf, referred_by into v_new_wagered, v_referrer;

  if v_referrer is null or v_referrer = p_user_id then return; end if;

  v_annual_credited := public.referrer_annual_credited(v_referrer);
  v_remaining := v_annual_cap - v_annual_credited;
  if v_remaining <= 0 then return; end if;

  for v_tier in
    select tier, reward_cdf
    from public.referral_tier_for_wagered(v_new_wagered)
  loop
    if exists (
      select 1 from public.referral_rewards
      where referrer_id = v_referrer
        and referred_id = p_user_id
        and trigger_event = v_tier.tier
        and status = 'credited'
    ) then
      continue;
    end if;

    v_credit := least(v_tier.reward_cdf, v_remaining);
    if v_credit <= 0 then exit; end if;

    perform public.adjust_balance(v_referrer, v_credit);

    insert into public.referral_rewards (
      referrer_id, referred_id, amount_cdf, status, trigger_event, credited_at
    ) values (
      v_referrer, p_user_id, v_credit, 'credited', v_tier.tier, now()
    )
    on conflict (referrer_id, referred_id, trigger_event) do nothing;

    v_remaining := v_remaining - v_credit;
    if v_remaining <= 0 then exit; end if;
  end loop;
end;
$func_wager_v2$;

-- ============================================================
-- Permissions
-- ============================================================
revoke all on function public.process_referral_wager(uuid, numeric, text, text)
  from public, anon, authenticated;
grant execute on function public.process_referral_wager(uuid, numeric, text, text)
  to service_role;
