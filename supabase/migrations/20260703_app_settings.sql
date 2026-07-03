-- Migration: app_settings
-- Generic key-value store for runtime-configurable settings.
-- Used initially for predictions_resolve_mode ('manual' | 'auto').

CREATE TABLE IF NOT EXISTS app_settings (
  key         text        PRIMARY KEY,
  value       text        NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid        REFERENCES users(id) NULL
);

-- Seed default: manual resolution mode
INSERT INTO app_settings (key, value)
VALUES ('predictions_resolve_mode', 'manual')
ON CONFLICT (key) DO NOTHING;
