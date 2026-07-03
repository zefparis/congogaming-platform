-- Enforce at the DB level that a user can only have one prediction per match,
-- regardless of status. The partial index covers all terminal states so a new
-- bet on the same match is rejected with Postgres error code 23505.
-- The application SELECT-based check in predictions.ts is kept as a fast-path
-- optimisation (avoids an unnecessary balance debit attempt), but this index
-- is the authoritative guard against double-bets.

CREATE UNIQUE INDEX IF NOT EXISTS unique_user_match_active_bet
  ON predictions (user_id, match_id)
  WHERE status IN ('pending', 'won', 'lost');
