-- ────────────────────────────────────────────────────────────────────────────
-- Manual KYC review + PIN reset requests
--
-- The external verification provider (PlayGuard → Hybrid Vector) has been
-- decommissioned. KYC is now a manual admin review: the submitted selfie is
-- stored on kyc_checks.selfie_b64 and an operator approves or denies the
-- account from the admin dashboard.
--
-- PIN resets are no longer verified by a biometric match. The user submits a
-- new PIN (Argon2id-hashed at request time) plus a selfie; an admin compares
-- the selfie against the player's KYC document and approves or rejects.
-- Approving applies the stored hash to users.pin_hash.
--
-- Run in the Supabase SQL editor (or `supabase db push` if using the CLI).
-- ────────────────────────────────────────────────────────────────────────────

-- 1. Store the submitted selfie for manual review -----------------------------

alter table public.kyc_checks
  add column if not exists selfie_b64 text;

-- 'PENDING' verdicts = submissions awaiting manual review. Approving/denying
-- a player updates the verdict to APPROVED / DENIED.

-- 2. PIN reset requests ---------------------------------------------------------

create table if not exists public.pin_reset_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  phone       text not null,
  selfie_b64  text not null,
  pin_hash    text not null,                       -- Argon2id hash of the requested PIN
  status      text not null default 'pending'
              check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz default now(),
  reviewed_at timestamptz
);

create index if not exists pin_reset_requests_pending_idx
  on public.pin_reset_requests(created_at)
  where status = 'pending';

-- 3. RLS ---------------------------------------------------------------------
-- Contains biometric data + credential material — never readable by anon.
alter table public.pin_reset_requests enable row level security;
-- (No policies → only service_role can read/write, which is what we want.)
