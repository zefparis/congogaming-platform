// Referral program — Phase 2 automation hooks.
//
// All credit logic is inside the SQL RPCs `process_referral_deposit` and
// `process_referral_wager`. This module is a thin, fault-tolerant wrapper:
//
//   * Logs (info on credit, error on failure) but NEVER throws — the host
//     deposit / bet flow must not be impacted by a referral hiccup.
//   * Honors a global env-based kill switch so we can disable the program
//     without a code change if abuse is detected.
//
// IMPORTANT: these functions are called from inside critical money paths.
// They must be best-effort and idempotent.

import type { FastifyBaseLogger } from 'fastify';
import { supabaseAdmin } from './supabase.js';

const ENABLED = String(process.env.REFERRAL_PROGRAM_ENABLED ?? 'true').toLowerCase() !== 'false';

export function isReferralProgramEnabled(): boolean {
  return ENABLED;
}

/**
 * Called immediately after a deposit moves to status=2 (success).
 * Best-effort: any error is swallowed and logged.
 */
export async function onDepositSucceeded(
  log: FastifyBaseLogger,
  userId: string,
  amountCdf: number,
): Promise<void> {
  if (!ENABLED) return;
  if (!Number.isFinite(amountCdf) || amountCdf <= 0) return;
  try {
    const { data, error } = await supabaseAdmin.rpc('process_referral_deposit', {
      p_user_id: userId,
      p_amount: amountCdf,
    });
    if (error) {
      log.error({ err: error.message, userId, amountCdf }, 'referral deposit RPC failed');
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.credited) {
      log.info({ userId, bonus_cdf: row.bonus_cdf }, 'referral welcome bonus credited');
    }
  } catch (e) {
    log.error({ err: e instanceof Error ? e.message : String(e), userId }, 'onDepositSucceeded threw');
  }
}

export type WagerSource = 'loto' | 'flash' | 'scratch' | 'okapi' | 'okapi_color';

/**
 * Called after a successful bet (loto, flash, okapi, scratch, …).
 *
 * Idempotent per wager: the SQL function inserts into
 * `referral_wager_events (wager_source, wager_id)` BEFORE incrementing the
 * lifetime counter. Any duplicate call — retry, double-submit, callback
 * replay — is a no-op. Callers MUST pass a stable id that uniquely
 * identifies the bet (ticket_id, bet_id, …).
 *
 * Best-effort: errors are caught and logged; never throws.
 */
export async function onWagerPlaced(
  log: FastifyBaseLogger,
  userId: string,
  amountCdf: number,
  source: WagerSource,
  wagerId: string,
): Promise<void> {
  if (!ENABLED) return;
  if (!Number.isFinite(amountCdf) || amountCdf <= 0) return;
  if (!wagerId || !source) {
    log.warn({ userId, source, wagerId }, 'onWagerPlaced called without source/wagerId — skipped');
    return;
  }
  try {
    const { error } = await supabaseAdmin.rpc('process_referral_wager', {
      p_user_id: userId,
      p_amount: amountCdf,
      p_source: source,
      p_wager_id: wagerId,
    });
    if (error) {
      log.error(
        { err: error.message, userId, amountCdf, source, wagerId },
        'referral wager RPC failed',
      );
    }
  } catch (e) {
    log.error(
      { err: e instanceof Error ? e.message : String(e), userId, source, wagerId },
      'onWagerPlaced threw',
    );
  }
}
