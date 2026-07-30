-- =============================================================
-- Okapi Color — Jackpot ledger idempotent
-- =============================================================
-- Problème : increment_okapi_color_jackpot(-jackpotCdf) n'était pas
-- idempotent. Une relance du settlement après crash (resume) pouvait
-- décrémenter le pot deux fois pour le même tirage / ticket.
--
-- Solution : un ledger d'événements jackpot avec event_key UNIQUE.
-- Le delta n'est appliqué qu'une seule fois ; toute relance avec la même
-- event_key est un no-op.
-- =============================================================

create table if not exists public.okapi_color_jackpot_events (
  id          uuid        primary key default gen_random_uuid(),
  event_key   text        unique not null,
  tirage_id   uuid        not null,
  delta_cdf   integer     not null,
  created_at  timestamptz not null default now()
);

create index if not exists okapi_color_jackpot_events_tirage_idx
  on public.okapi_color_jackpot_events (tirage_id);

-- RLS : service_role only (aucune policy = 0 row pour anon/authenticated).
alter table public.okapi_color_jackpot_events enable row level security;
revoke all on table public.okapi_color_jackpot_events from anon, authenticated;

-- ---------------------------------------------------------
-- okapi_color_apply_jackpot_delta_idempotent
--   Applique un delta au pot une seule fois par event_key.
--   - insert ledger (event_key unique) ; si conflit => no-op (false)
--   - si insert réussi => increment_okapi_color_jackpot(delta) (true)
--   Tout est dans une seule transaction : si l'increment échoue
--   (pot négatif), l'insert ledger est rollback => relançable.
-- ---------------------------------------------------------
create or replace function public.okapi_color_apply_jackpot_delta_idempotent(
  p_event_key text,
  p_tirage_id uuid,
  p_delta_cdf integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.okapi_color_jackpot_events (event_key, tirage_id, delta_cdf)
  values (p_event_key, p_tirage_id, p_delta_cdf)
  on conflict (event_key) do nothing;

  -- FOUND est false si ON CONFLICT a empêché l'insertion => déjà appliqué.
  if not found then
    return false;
  end if;

  perform public.increment_okapi_color_jackpot(p_delta_cdf);
  return true;
end;
$$;

revoke all on function public.okapi_color_apply_jackpot_delta_idempotent(text, uuid, integer)
  from public, anon, authenticated;

grant execute on function public.okapi_color_apply_jackpot_delta_idempotent(text, uuid, integer)
  to service_role;
