-- Optional public display name / pseudo for the player profile.
-- Stored alongside the user; nullable so existing rows stay valid.
-- Length 2..24 to keep it practical for UI rendering and rate-limit abuse.

alter table public.users
  add column if not exists display_name text;

alter table public.users
  add constraint users_display_name_length
  check (display_name is null or (char_length(display_name) between 2 and 24));

-- Case-insensitive uniqueness so two players cannot pick the exact same pseudo.
create unique index if not exists users_display_name_unique_ci
  on public.users (lower(display_name))
  where display_name is not null;
