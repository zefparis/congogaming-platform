-- ────────────────────────────────────────────────────────────────────────────
-- PlayGuard KYC integration
--
-- Adds the kyc_checks audit table and the kyc_status / blocked columns on
-- public.users so PredictStreet contract compliance (mandatory age check at
-- registration) can be enforced and audited.
--
-- Verdict values (text, free-form on the wire but constrained at the user
-- level via kyc_status):
--   APPROVED   → user is at least 18 (verified by AWS Rekognition via PlayGuard)
--   DENIED     → user is a minor or otherwise refused; account is blocked
--   VERIFY_AGE → AWS estimate ambiguous; account allowed but flagged for
--                manual review by an operator
--
-- Run in the Supabase SQL editor (or `supabase db push` if using the CLI).
-- ────────────────────────────────────────────────────────────────────────────

-- 1. Audit table -------------------------------------------------------------

create table if not exists public.kyc_checks (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.users(id) on delete cascade,
  verdict         text not null,                       -- APPROVED / DENIED / VERIFY_AGE
  estimated_age   integer,
  age_low         integer,
  age_high        integer,
  is_minor        boolean default false,
  confidence      numeric(5,2),
  scan_id         text,                                -- PlayGuard scanId
  created_at      timestamptz default now()
);

create index if not exists kyc_checks_user_idx
  on public.kyc_checks(user_id);

create index if not exists kyc_checks_created_idx
  on public.kyc_checks(created_at desc);

-- 2. users.kyc_status --------------------------------------------------------

alter table public.users
  add column if not exists kyc_status text default 'pending';

-- Idempotent CHECK constraint. Drop & recreate so re-runs don't fail.
alter table public.users
  drop constraint if exists users_kyc_status_check;

alter table public.users
  add constraint users_kyc_status_check
  check (kyc_status in ('pending', 'approved', 'denied', 'verify_age'));

-- 3. users.blocked -----------------------------------------------------------
-- Already referenced by the admin "block user" route but never created. Add
-- it here so the kyc_status='denied' path can hard-block underage accounts.

alter table public.users
  add column if not exists blocked boolean not null default false;

create index if not exists users_blocked_idx
  on public.users(blocked) where blocked = true;

-- 4. RLS ---------------------------------------------------------------------
-- kyc_checks contains biometric audit data — never readable by anon.
alter table public.kyc_checks enable row level security;
-- (No policies → only service_role can read/write, which is what we want.)
