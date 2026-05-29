-- Phase 2 : automatisation du programme de parrainage
--
-- Ajoute :
--   * `users.lifetime_wagered_cdf`        : compteur cumulatif des mises
--   * contrainte anti-auto-parrainage
--   * RPC `process_referral_deposit`      : crédite le bonus de bienvenue au filleul
--   * RPC `process_referral_wager`        : incrémente le wagered et déclenche les paliers parrain
--   * RPC `referral_tier_for_wagered`     : définit les seuils + récompenses parrain
--   * RPC `referrer_annual_credited`      : utilitaire pour le plafond annuel
--
-- Constantes (alignées avec la spec Phase 2) :
--   * Bonus filleul         = 10% du 1er dépôt, plafonné à 5 000 CDF, déclencheur dépôt ≥ 5 000 CDF
--   * Paliers parrain       = 5 000 CDF misés (+2 000), 25 000 (+1 000), 100 000 (+5 000)
--   * Plafond annuel parrain = 50 000 CDF crédités sur 365 jours glissants
--
-- Tous les RPC sont SECURITY DEFINER + REVOKE EXECUTE de public/anon/authenticated.

-- ============================================================
-- Schema changes
-- ============================================================
alter table public.users
  add column if not exists lifetime_wagered_cdf numeric(15,2) not null default 0;

create index if not exists users_lifetime_wagered_idx on public.users (lifetime_wagered_cdf);

-- Defensive guard: a user cannot refer themselves (the app already prevents it).
alter table public.users
  drop constraint if exists no_self_referral;
alter table public.users
  add constraint no_self_referral check (referred_by is null or referred_by <> id);

-- The original migration locked us to ONE reward row per (referrer, referred).
-- We now want MULTIPLE events per relationship (welcome, wager_5k, wager_25k,
-- wager_100k). Replace the constraint with a composite one.
alter table public.referral_rewards
  drop constraint if exists referral_rewards_referrer_id_referred_id_key;

create unique index if not exists referral_rewards_unique_event
  on public.referral_rewards (referrer_id, referred_id, trigger_event);

-- ============================================================
-- Helpers
-- ============================================================

create or replace function public.referrer_annual_credited(p_user_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $func_annual$
  select coalesce(sum(amount_cdf), 0)
  from public.referral_rewards
  where referrer_id = p_user_id
    and status = 'credited'
    and credited_at >= now() - interval '365 days';
$func_annual$;

-- Returns each tier the user has reached given their lifetime wagered amount.
-- The caller iterates and credits any tier not yet credited.
create or replace function public.referral_tier_for_wagered(p_wagered numeric)
returns table(tier text, reward_cdf numeric)
language sql
immutable
as $func_tier$
  select t.tier, t.reward_cdf
  from (values
    ('wager_5k'::text,   2000::numeric, 5000::numeric),
    ('wager_25k'::text,  1000::numeric, 25000::numeric),
    ('wager_100k'::text, 5000::numeric, 100000::numeric)
  ) as t(tier, reward_cdf, threshold)
  where p_wagered >= t.threshold;
$func_tier$;

-- ============================================================
-- Deposit trigger (called by the server after a successful deposit)
-- ============================================================
create or replace function public.process_referral_deposit(
  p_user_id uuid,
  p_amount numeric
) returns table(credited boolean, bonus_cdf numeric)
language plpgsql
security definer
set search_path = public
as $func_deposit$
declare
  v_referrer uuid;
  v_qualifying_deposits int;
  v_bonus numeric;
begin
  -- Only ≥ 5 000 CDF deposits qualify.
  if p_amount < 5000 then
    return query select false, 0::numeric;
    return;
  end if;

  select referred_by into v_referrer from public.users where id = p_user_id;
  if v_referrer is null or v_referrer = p_user_id then
    return query select false, 0::numeric;
    return;
  end if;

  -- Only on the FIRST qualifying deposit (count includes the one that just
  -- succeeded since this RPC is called after status=2 was written).
  select count(*) into v_qualifying_deposits
    from public.transactions
    where user_id = p_user_id
      and type = 'deposit'
      and status = 2
      and amount >= 5000;
  if v_qualifying_deposits <> 1 then
    return query select false, 0::numeric;
    return;
  end if;

  -- Welcome bonus = 10% of the deposit, capped at 5 000 CDF.
  v_bonus := least(p_amount * 0.10, 5000);

  -- Credit the referee balance via the existing RPC.
  perform public.adjust_balance(p_user_id, v_bonus);

  -- Track the event. The amount stored is the bonus paid to the referee
  -- (not to the referrer); trigger_event distinguishes from referrer rewards.
  insert into public.referral_rewards (
    referrer_id, referred_id, amount_cdf, status, trigger_event, credited_at
  ) values (
    v_referrer, p_user_id, v_bonus, 'credited', 'welcome_bonus', now()
  )
  on conflict (referrer_id, referred_id, trigger_event) do nothing;

  return query select true, v_bonus;
end;
$func_deposit$;

-- ============================================================
-- Wager trigger (called by the server after every successful bet)
-- ============================================================
create or replace function public.process_referral_wager(
  p_user_id uuid,
  p_amount numeric
) returns void
language plpgsql
security definer
set search_path = public
as $func_wager$
declare
  v_referrer uuid;
  v_new_wagered numeric;
  v_annual_cap numeric := 50000;
  v_annual_credited numeric;
  v_remaining numeric;
  v_tier record;
  v_credit numeric;
begin
  if p_amount is null or p_amount <= 0 then return; end if;

  -- Always increment the player's lifetime tally — even unreferred players
  -- benefit from this counter for future loyalty features.
  update public.users
    set lifetime_wagered_cdf = lifetime_wagered_cdf + p_amount
    where id = p_user_id
    returning lifetime_wagered_cdf, referred_by into v_new_wagered, v_referrer;

  if v_referrer is null or v_referrer = p_user_id then return; end if;

  v_annual_credited := public.referrer_annual_credited(v_referrer);
  v_remaining := v_annual_cap - v_annual_credited;
  if v_remaining <= 0 then return; end if;

  -- Iterate every tier reached and credit any that hasn't been paid yet.
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
$func_wager$;

-- ============================================================
-- Permissions
-- ============================================================
revoke all on function public.referrer_annual_credited(uuid) from public, anon, authenticated;
grant execute on function public.referrer_annual_credited(uuid) to service_role;

revoke all on function public.referral_tier_for_wagered(numeric) from public, anon, authenticated;
grant execute on function public.referral_tier_for_wagered(numeric) to service_role;

revoke all on function public.process_referral_deposit(uuid, numeric) from public, anon, authenticated;
grant execute on function public.process_referral_deposit(uuid, numeric) to service_role;

revoke all on function public.process_referral_wager(uuid, numeric) from public, anon, authenticated;
grant execute on function public.process_referral_wager(uuid, numeric) to service_role;
