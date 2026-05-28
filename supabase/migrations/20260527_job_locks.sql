create table if not exists public.job_locks (
  job_name text not null,
  slot_key text not null,
  created_at timestamptz not null default now(),
  primary key (job_name, slot_key)
);

create index if not exists job_locks_created_at_idx
  on public.job_locks(created_at desc);

alter table public.job_locks enable row level security;
