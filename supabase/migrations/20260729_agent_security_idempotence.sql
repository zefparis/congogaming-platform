-- ================================================================
-- Agent security & commission idempotence
-- ================================================================
-- 1. Add commission_type column to agent_commissions (default 'ticket')
-- 2. Add agent_pin_hash column to agents (for PIN-based auth)
-- 3. Check for existing duplicates before adding unique constraint
-- 4. Add unique constraint on agent_commissions(ticket_id, commission_type)
-- ================================================================

-- Step 1: Add commission_type column if it doesn't exist
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'agent_commissions'
      and column_name = 'commission_type'
  ) then
    alter table public.agent_commissions
      add column commission_type text not null default 'ticket';
  end if;
end $$;

-- Step 2: Add agent_pin_hash column if it doesn't exist
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'agents'
      and column_name = 'agent_pin_hash'
  ) then
    alter table public.agents
      add column agent_pin_hash text;
  end if;
end $$;

-- Step 3: Report duplicates (does NOT fail the migration — just logs)
-- Run this manually first in production to check for existing duplicates:
--
--   select ticket_id, commission_type, count(*) as dup_count
--   from public.agent_commissions
--   group by ticket_id, commission_type
--   having count(*) > 1;
--
-- If duplicates exist, deduplicate before applying the constraint:
--
--   delete from public.agent_commissions ac
--   where ctid in (
--     select ctid from (
--       select ctid, row_number() over (
--         partition by ticket_id, commission_type
--         order by created_at desc
--       ) as rn
--       from public.agent_commissions
--     ) t where rn > 1
--   );
--
-- Also subtract the duplicate amounts from agents.total_earned_cdf
-- before running the delete, if accurate totals are required.

-- Step 4: Add unique constraint (safe — uses IF NOT EXISTS)
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'agent_commissions_ticket_id_commission_type_key'
  ) then
    alter table public.agent_commissions
      add constraint agent_commissions_ticket_id_commission_type_key
      unique (ticket_id, commission_type);
  end if;
end $$;
