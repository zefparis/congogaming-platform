-- Unipesa reconciliation hardening:
--   * a worker-level lock so only one reconciliation tick runs at a
--     time across the whole fleet,
--   * a row-level claim helper (SELECT ... FOR UPDATE SKIP LOCKED)
--     so two ticks within the same instance can never grab the same
--     transaction,
--   * a `reconcile_attempted_at` marker so a row can be retried after
--     a cooldown if a previous attempt died mid-flight.
--
-- Note on PG advisory locks: pg_try_advisory_lock is session-scoped,
-- but Supabase serves RPC calls through a connection pool, so the
-- lock would be released the moment the acquire RPC returns. We
-- therefore use a small bookkeeping table with a TTL, which gives
-- the same semantics across instances and survives pool churn.

create table if not exists public.worker_locks (
  worker_name text primary key,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create or replace function public.try_acquire_worker_lock(
  p_worker_name text,
  p_ttl_seconds integer default 120
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_expires timestamptz := v_now + make_interval(secs => p_ttl_seconds);
begin
  -- Insert if free, or steal the slot if a previous holder's lease
  -- has expired (worker died without releasing).
  insert into public.worker_locks (worker_name, acquired_at, expires_at)
  values (p_worker_name, v_now, v_expires)
  on conflict (worker_name) do update
    set acquired_at = excluded.acquired_at,
        expires_at = excluded.expires_at
    where public.worker_locks.expires_at < v_now;

  -- We own the lock iff our timestamp is the one persisted.
  return exists (
    select 1
    from public.worker_locks
    where worker_name = p_worker_name
      and acquired_at = v_now
  );
end;
$$;

create or replace function public.release_worker_lock(
  p_worker_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.worker_locks where worker_name = p_worker_name;
end;
$$;

-- ---- Per-row claim for the reconciliation worker --------------------

alter table public.transactions
  add column if not exists reconcile_attempted_at timestamptz;

create index if not exists transactions_pending_reconcile_idx
  on public.transactions (created_at)
  where status = 1;

-- Atomically claim up to N pending transactions for reconciliation.
-- Uses SELECT ... FOR UPDATE SKIP LOCKED so two concurrent calls can
-- never return the same row, then stamps `reconcile_attempted_at` so
-- a subsequent call within `p_retry_after_seconds` will skip them.
-- The cooldown also prevents a crashed worker from blocking a row
-- forever — after the cooldown elapses, another worker can retry.
create or replace function public.claim_pending_unipesa_transactions(
  p_min_age_seconds integer default 90,
  p_max_age_seconds integer default 604800,
  p_batch_size integer default 50,
  p_retry_after_seconds integer default 90
)
returns setof public.transactions
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select id
    from public.transactions
    where status = 1
      and created_at <= now() - make_interval(secs => p_min_age_seconds)
      and created_at >= now() - make_interval(secs => p_max_age_seconds)
      and (
        reconcile_attempted_at is null
        or reconcile_attempted_at < now() - make_interval(secs => p_retry_after_seconds)
      )
    order by created_at asc
    for update skip locked
    limit p_batch_size
  )
  update public.transactions t
    set reconcile_attempted_at = now()
    from candidates c
    where t.id = c.id
    returning t.*;
end;
$$;
