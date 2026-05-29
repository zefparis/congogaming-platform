-- Admin role separation
--
-- Adds a `role` column on `public.users` distinguishing:
--   - 'user'        : default, regular player
--   - 'admin'       : back-office staff, read-only on sensitive ops
--   - 'super_admin' : can adjust wallets, block users, modify limits, etc.
--
-- Non-destructive: defaults all existing users to 'user'. Promotes the
-- bootstrap super-admin phone (0997174834) explicitly.
--
-- Also creates an `admin_audit_log` table to record sensitive admin actions
-- (wallet adjust, block, limit override, self-exclusion).

-- ============================================================
-- 1. role column on users
-- ============================================================
alter table public.users
  add column if not exists role text not null default 'user';

-- Defensive CHECK: only known role values are accepted.
do $admin_role_check$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'users'
      and constraint_name = 'users_role_check'
  ) then
    alter table public.users
      add constraint users_role_check
      check (role in ('user', 'admin', 'super_admin'));
  end if;
end
$admin_role_check$;

create index if not exists users_role_idx
  on public.users (role)
  where role in ('admin', 'super_admin');

-- ============================================================
-- 2. Bootstrap super-admin phone
-- ============================================================
-- Phone format in DB is the canonical 0XXXXXXXXX (10 digits with leading 0).
update public.users
set role = 'super_admin'
where phone in ('0997174834', '243997174834', '+243997174834')
  and role <> 'super_admin';

-- ============================================================
-- 3. Admin audit log (append-only)
-- ============================================================
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users(id) on delete set null,
  actor_phone text,
  action text not null,
  target_user_id uuid references public.users(id) on delete set null,
  amount_cdf numeric,
  reason text,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_actor_idx
  on public.admin_audit_log (actor_user_id, created_at desc);
create index if not exists admin_audit_log_target_idx
  on public.admin_audit_log (target_user_id, created_at desc);

alter table public.admin_audit_log enable row level security;
revoke all on table public.admin_audit_log from anon;
revoke all on table public.admin_audit_log from authenticated;
