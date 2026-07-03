-- Migration: match_resolutions
-- Persists the submitted scores and metadata for each resolved match.
-- One row per match_id (PRIMARY KEY) acts as the double-resolve guard:
-- a second INSERT will conflict and the backend returns 409 ALREADY_RESOLVED.

CREATE TABLE IF NOT EXISTS match_resolutions (
  match_id                    text        PRIMARY KEY,
  actual_score_home           integer     NOT NULL,
  actual_score_away           integer     NOT NULL,
  resolved_by                 uuid        REFERENCES users(id) NULL,
  resolved_at                 timestamptz NOT NULL DEFAULT now(),
  predictions_resolved_count  integer     NOT NULL,
  total_points_paid           numeric     NOT NULL
);

CREATE INDEX IF NOT EXISTS match_resolutions_resolved_at_idx
  ON match_resolutions (resolved_at DESC);
