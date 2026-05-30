-- =============================================================
-- Okapi Color tickets — ajout slot_key et draw_at
-- Permet de traiter uniquement les tickets du slot courant
-- et de rejeter les achats hors-slot.
-- =============================================================

alter table public.okapi_color_tickets
  add column if not exists slot_key text,
  add column if not exists draw_at  timestamptz;

-- Index composite pour les requêtes cron et live stats
create index if not exists okapi_color_tickets_slot_status_idx
  on public.okapi_color_tickets (slot_key, status)
  where slot_key is not null;
