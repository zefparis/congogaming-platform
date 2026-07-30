-- =============================================================
-- Okapi Color - RPCs atomiques
-- =============================================================
-- NOTE : Ce fichier crée d'abord les tables (IF NOT EXISTS) pour
-- garantir qu'elles existent lors de la compilation des fonctions
-- PL/pgSQL, quelle que soit l'ordre d'exécution des migrations.
-- Les DDL dans okapi_color_tables.sql sont idempotentes et
-- deviennent des no-ops quand ce fichier est exécuté en premier.
-- =============================================================

-- ---------------------------------------------------------
-- Tables (IF NOT EXISTS — idempotent)
-- ---------------------------------------------------------
create table if not exists public.okapi_color_tirages (
  id             uuid        primary key default gen_random_uuid(),
  numeros_rouges int[]       not null,
  numeros_or     int[]       not null,
  hash_pre       text        not null,
  jackpot_paye   boolean     not null default false,
  drawn_at       timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  constraint chk_rouges_count check (array_length(numeros_rouges, 1) = 6),
  constraint chk_ors_count    check (array_length(numeros_or,     1) = 4)
);

create table if not exists public.okapi_color_tickets (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null,
  numeros            int[]       not null,
  prix_cdf           integer     not null default 1000,
  status             text        not null default 'pending',
  nb_rouges          integer     not null default 0,
  nb_or              integer     not null default 0,
  total_bons         integer     not null default 0,
  gains_cdf          integer     not null default 0,
  jackpot_en_attente boolean     not null default false,
  tirage_id          uuid        references public.okapi_color_tirages(id) on delete set null,
  settled_at         timestamptz,
  created_at         timestamptz not null default now(),
  constraint chk_numeros_count check (array_length(numeros, 1) = 6),
  constraint chk_prix_positive check (prix_cdf > 0),
  constraint chk_status check (status in ('pending','gagnant','perdant','cancelled','jackpot_attente'))
);

create table if not exists public.okapi_color_jackpot (
  id         integer     primary key default 1,
  pot_cdf    numeric     not null default 0,
  updated_at timestamptz not null default now(),
  constraint chk_singleton  check (id = 1),
  constraint chk_pot_nonneg check (pot_cdf >= 0)
);

insert into public.okapi_color_jackpot (id, pot_cdf)
  values (1, 0)
  on conflict (id) do nothing;

-- Indexes (IF NOT EXISTS)
create index if not exists okapi_color_tirages_drawn_at_idx on public.okapi_color_tirages (drawn_at desc);
create index if not exists okapi_color_tickets_user_idx     on public.okapi_color_tickets (user_id, created_at desc);
create index if not exists okapi_color_tickets_tirage_idx   on public.okapi_color_tickets (tirage_id);
create index if not exists okapi_color_tickets_status_idx   on public.okapi_color_tickets (status);

-- RLS (activate — no policies = service_role only)
alter table public.okapi_color_tirages enable row level security;
alter table public.okapi_color_tickets  enable row level security;
alter table public.okapi_color_jackpot  enable row level security;

-- ---------------------------------------------------------
-- 1. increment_okapi_color_jackpot
--    Incrémente (ou décrémente) le pot de façon atomique.
--    Sécurisé : revoke / grant ci-dessous dans okapi_color_security.sql
-- ---------------------------------------------------------
create or replace function public.increment_okapi_color_jackpot(delta numeric)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.okapi_color_jackpot
  set pot_cdf   = pot_cdf + delta,
      updated_at = now()
  where id = 1
    and pot_cdf + delta >= 0;

  if not found then
    raise exception 'Jackpot pot would go negative or row not found';
  end if;
end;
$$;

-- 2. okapi_color_settle_ticket_payout_atomic
--    Settlement atomique d'un ticket :
--    - FOR UPDATE sur le ticket (verrou exclusif)
--    - vérification idempotency_key dans ledger_entries
--    - protection double payout (ticket already paid)
--    - update ticket status / gains / tirage_id / settled_at
--    - crédit wallet via record_ledger_entry_atomic si gains > 0
--    Retourne (applied boolean, balance integer)
-- ---------------------------------------------------------
create or replace function public.okapi_color_settle_ticket_payout_atomic(
  p_ticket_id        uuid,
  p_status           text,
  p_nb_rouges        integer,
  p_nb_or            integer,
  p_gains_cdf        integer,
  p_jackpot_en_attente boolean,
  p_tirage_id        uuid,
  p_idempotency_key  text
)
returns table(applied boolean, balance integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ticket  public.okapi_color_tickets%rowtype;
  v_ledger  record;
  v_balance integer;
begin
  -- Verrouille le ticket pour éviter les races
  select * into v_ticket
  from public.okapi_color_tickets
  where id = p_ticket_id
  for update;

  if not found then
    raise exception 'ticket_not_found';
  end if;

  -- Idempotency : si l'entrée ledger existe déjà, retourner sans modifier
  if coalesce(p_gains_cdf, 0) > 0 and exists (
    select 1
    from public.ledger_entries
    where idempotency_key = p_idempotency_key
  ) then
    select balance_cdf into v_balance
    from public.users
    where id = v_ticket.user_id;
    return query select false, coalesce(v_balance, 0);
    return;
  end if;

  -- Double-payout guard
  if v_ticket.status = 'gagnant'
     and coalesce(v_ticket.gains_cdf, 0) > 0
     and coalesce(p_gains_cdf, 0) > 0
  then
    raise exception 'ticket_already_paid';
  end if;

  -- Mettre à jour le ticket
  update public.okapi_color_tickets
  set status              = p_status,
      nb_rouges           = p_nb_rouges,
      nb_or               = p_nb_or,
      total_bons          = p_nb_rouges + p_nb_or,
      gains_cdf           = p_gains_cdf,
      jackpot_en_attente  = p_jackpot_en_attente,
      tirage_id           = p_tirage_id,
      settled_at          = case when p_status in ('gagnant','perdant') then now() else null end
  where id = p_ticket_id;

  -- Créditer le wallet si gains > 0
  if coalesce(p_gains_cdf, 0) > 0 then
    select * into v_ledger
    from public.record_ledger_entry_atomic(
      v_ticket.user_id,
      'credit',
      p_gains_cdf,
      'CDF',
      'okapi_color_payout',
      'okapi_color_ticket',
      p_ticket_id::text,
      p_idempotency_key
    );
    return query select coalesce(v_ledger.applied, false), v_ledger.balance::integer;
    return;
  end if;

  -- Pas de gains : retourner le solde actuel
  select balance_cdf into v_balance
  from public.users
  where id = v_ticket.user_id;
  return query select true, coalesce(v_balance, 0);
end;
$$;
