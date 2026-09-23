-- Drop removed games: Loto Congo, Loto Express (Flash), Scratch, Okapi Climb.
-- Also drops free_plays (scratch-only) and the CGLT farming tables
-- (player_farming / farming_rewards — no longer fed by any game).
--
-- FK check done beforehand: NO payment/shared table references these
-- tables. The only FKs were game-internal:
--   loto_tickets.tirage_id -> loto_tirages
--   flash_tickets.tirage_id -> flash_tirages
--   okapi_bets.round_id -> okapi_rounds
--   okapi_bets.auto_session_id -> okapi_auto_sessions
-- transactions, wallet_ledger, users, agent_commissions, referral_*
-- do NOT reference any of the dropped tables.
--
-- NOTE: the `transaction_type` enum still contains 'loto_ticket' and
-- 'loto_payout' values used by historical transactions rows. Postgres
-- cannot drop enum values without recreating the type — intentionally
-- left in place (harmless, historical data stays readable).

-- -------------------------------------------------------------
-- Game-specific RPC functions
-- -------------------------------------------------------------
drop function if exists public.increment_jackpot(numeric);
drop function if exists public.increment_flash_jackpot(numeric);
drop function if exists public.apply_loto_jackpot_delta_idempotent(text, uuid, integer);
drop function if exists public.apply_flash_jackpot_delta_idempotent(text, uuid, integer);
drop function if exists public.loto_settle_ticket_payout_atomic(uuid, text, integer, integer, boolean, uuid, text);
drop function if exists public.flash_settle_ticket_payout_atomic(uuid, text, integer, integer, boolean, uuid, text);
drop function if exists public.okapi_cashout_atomic(uuid, uuid, numeric, integer, text);
drop function if exists public.scratch_buy_free_atomic(uuid, integer, jsonb, integer);
drop function if exists public.scratch_claim_atomic(uuid, uuid, text);
drop function if exists public.consume_free_play(uuid);

-- -------------------------------------------------------------
-- Game tables (order respects game-internal FKs)
-- -------------------------------------------------------------
drop table if exists public.loto_tickets;
drop table if exists public.loto_tirages;
drop table if exists public.loto_jackpot;
drop table if exists public.loto_jackpot_events;

drop table if exists public.flash_tickets;
drop table if exists public.flash_tirages;
drop table if exists public.flash_jackpot;
drop table if exists public.flash_jackpot_events;

drop table if exists public.scratch_tickets;

drop table if exists public.okapi_bets;
drop table if exists public.okapi_rounds;
drop table if exists public.okapi_auto_sessions;

drop table if exists public.free_plays;

drop table if exists public.player_farming;
drop table if exists public.farming_rewards;
