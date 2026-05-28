create extension if not exists "pgcrypto";

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  order_id text not null,
  provider_transaction_id text,
  event_hash text not null unique,
  status integer not null,
  raw jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists payment_events_order_id_idx
  on public.payment_events(order_id);

create index if not exists payment_events_provider_transaction_id_idx
  on public.payment_events(provider_transaction_id)
  where provider_transaction_id is not null;

create index if not exists payment_events_created_at_idx
  on public.payment_events(created_at desc);

alter table public.payment_events enable row level security;
