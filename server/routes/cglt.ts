import type { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'node:crypto';
import { env } from '../env.js';
import { getCGLTBalance, getUserUnipayPhone, creditCGLT, debitCGLT, CgltError } from '../lib/unipay-cglt.js';
import { recordLedgerEntry } from '../lib/ledger.js';
import { supabaseAdmin } from '../lib/supabase.js';

/**
 * Conversion rate CDF -> CGLT. Currently a flat 1:1; kept as a constant so a
 * future CDF/USD oracle can drive it without touching the swap logic.
 */
const CDF_TO_CGLT_RATE = 1;

// Internal (non-Unipesa) transaction sentinel, mirroring the loto/flash routes.
const CGLT_SWAP_PROVIDER_ID = 0;

// CGLT withdrawal (player → any UniPay wallet) constraints.
const MIN_CGLT_WITHDRAW = 10;
const WITHDRAW_RATE_LIMIT = 3; // max successful withdrawals…
const WITHDRAW_RATE_WINDOW_MS = 60 * 60 * 1000; // …per rolling hour, per user.

const UNIPAY_API = env.UNIPAY_API_URL ?? 'https://unipay-api.onrender.com';

/**
 * Normalize an arbitrary DRC phone input (`+243…`, `243…`, `0…`, or bare
 * 9-digit local) to the canonical UniPay E.164 form `+243XXXXXXXXX`.
 * Returns null when the local part is not exactly 9 digits.
 */
function normalizeUnipayPhone(input: string): string | null {
  const digits = String(input ?? '').replace(/[^\d]/g, '');
  let local: string;
  if (digits.startsWith('243')) local = digits.slice(3);
  else if (digits.startsWith('0')) local = digits.slice(1);
  else local = digits;
  if (!/^\d{9}$/.test(local)) return null;
  return `+243${local}`;
}

/**
 * Serialize ANY thrown value into a fully-loggable object: message, name,
 * stack trace, and — for CgltError — the upstream status/code relayed by the
 * UniPay API. This is what surfaces the real cause of a 500 in the logs.
 */
function describeError(e: unknown): Record<string, unknown> {
  if (e instanceof CgltError) {
    return { kind: 'CgltError', code: e.code, upstream_status: e.status, message: e.message, stack: e.stack };
  }
  if (e instanceof Error) {
    return { kind: e.name, message: e.message, stack: e.stack };
  }
  return { kind: 'unknown', value: String(e) };
}

// Whether the server-to-server UniPay key is present (never log the value).
const GAMING_API_KEY_SET = Boolean(env.GAMING_API_KEY);

/**
 * CGLT gaming bridge — server-side proxy so the browser never sees the
 * shared GAMING_API_KEY. The frontend currency toggle reads the player's
 * CGLT balance through this route.
 */
const cgltRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/cglt/balance', { preHandler: app.requireAuth }, async (req, reply) => {
    let phone: string | null = null;
    try {
      phone = await getUserUnipayPhone(req.user.id);
      if (!phone) {
        req.log.warn({ user_id: req.user.id }, '[cglt/balance] no phone resolved for user');
        return reply.code(404).send({ error: 'phone_not_found' });
      }
      const balance = await getCGLTBalance(phone);
      return reply.send(balance);
    } catch (e) {
      // Log EVERYTHING (incl. the previously-silent non-404 CgltError path)
      // with the upstream UniPay status so a relayed 500 is never invisible.
      req.log.error(
        {
          err: describeError(e),
          user_id: req.user.id,
          phone,
          unipay_api: UNIPAY_API,
          gaming_api_key_set: GAMING_API_KEY_SET,
        },
        '[cglt/balance] failed',
      );
      if (e instanceof CgltError) {
        // A missing UniPay wallet (404) is normal for a brand-new player.
        if (e.status === 404) return reply.send({ phone: null, cglt_balance: 0, equivalent_usdt: null });
        // Don't leak an upstream 500 as our own 500: report it as a 502
        // Bad Gateway so the cause (UniPay) is unambiguous.
        const status = e.status >= 500 ? 502 : e.status;
        return reply.code(status).send({ error: e.code || 'cglt_upstream_error', upstream_status: e.status });
      }
      return reply.code(500).send({ error: 'server_error' });
    }
  });

  /**
   * POST /api/cglt/swap — convert the player's house CDF balance into CGLT.
   *
   * CDF is debited from the Congo Gaming ledger (`users.balance_cdf`) and the
   * resulting CGLT is credited to the player's UniPay wallet — the single
   * source of truth used by every CGLT bet. On a UniPay failure the CDF debit
   * is refunded so the two ledgers never drift. The session identifies the
   * player; any `user_id` in the body is ignored (anti-IDOR).
   */
  app.post('/api/cglt/swap', { preHandler: app.requireAuth }, async (req, reply) => {
    const user_id = req.user.id;
    const body = (req.body ?? {}) as { amount_cdf?: number };
    const amount = Math.trunc(Number(body.amount_cdf));
    if (!Number.isFinite(amount) || amount <= 0) {
      return reply.code(400).send({ error: 'invalid_amount' });
    }

    // Resolve phone OUTSIDE the inner steps but INSIDE a guard, so a Supabase
    // throw here is logged instead of producing an opaque 500.
    let phone: string | null = null;
    try {
      phone = await getUserUnipayPhone(user_id);
    } catch (e) {
      req.log.error(
        { err: describeError(e), user_id, unipay_api: UNIPAY_API, gaming_api_key_set: GAMING_API_KEY_SET },
        '[cglt/swap] phone resolution failed',
      );
      return reply.code(500).send({ error: 'phone_lookup_failed' });
    }
    if (!phone) {
      req.log.warn({ user_id }, '[cglt/swap] no phone resolved for user');
      return reply.code(404).send({ error: 'phone_not_found' });
    }

    const amountCglt = amount * CDF_TO_CGLT_RATE;
    const orderId = randomUUID();
    const gameRef = `cglt_swap_${orderId}`;

    // 1 + 2. Debit CDF from the house ledger (atomic, balance-gated).
    let cdfBalance: number | null = null;
    try {
      const debit = await recordLedgerEntry({
        user_id,
        direction: 'debit',
        amount,
        currency: 'CDF',
        reason: 'cglt_swap',
        reference_type: 'cglt_swap',
        reference_id: orderId,
        idempotency_key: `cglt:swap:${orderId}:debit`,
      });
      cdfBalance = debit.balance;
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (/insufficient/i.test(msg)) return reply.code(402).send({ error: 'insufficient_cdf' });
      req.log.error({ err: describeError(e), user_id, amount }, '[cglt/swap] CDF debit failed');
      return reply.code(500).send({ error: 'debit_failed' });
    }

    // 3. Credit CGLT in the UniPay wallet.
    let newCgltBalance: number;
    let txHash: string | null = null;
    try {
      const credit = await creditCGLT(phone, amountCglt, gameRef, gameRef);
      newCgltBalance = Number(credit.new_balance);
      txHash = credit.blockchain_tx_hash;
    } catch (e) {
      // UniPay credit failed → refund the CDF so balances stay consistent.
      await recordLedgerEntry({
        user_id,
        direction: 'credit',
        amount,
        currency: 'CDF',
        reason: 'cglt_swap_refund',
        reference_type: 'cglt_swap',
        reference_id: orderId,
        idempotency_key: `cglt:swap:${orderId}:refund`,
      }).catch((refundErr) =>
        req.log.error({ err: describeError(refundErr), user_id, orderId }, '[cglt/swap] CDF refund failed'),
      );

      // Log the full upstream cause (previously silent for CgltError).
      req.log.error(
        {
          err: describeError(e),
          user_id,
          phone,
          amount_cglt: amountCglt,
          unipay_api: UNIPAY_API,
          gaming_api_key_set: GAMING_API_KEY_SET,
        },
        '[cglt/swap] CGLT credit failed (CDF refunded)',
      );
      return reply.code(502).send({
        error: e instanceof CgltError ? e.code || 'cglt_credit_failed' : 'cglt_credit_failed',
        ...(e instanceof CgltError ? { upstream_status: e.status } : {}),
      });
    }

    // 4. Record the swap in transactions history (best-effort).
    const { error: txErr } = await supabaseAdmin.from('transactions').insert({
      user_id,
      order_id: orderId,
      type: 'cglt_swap',
      amount,
      currency: 'CDF',
      provider_id: CGLT_SWAP_PROVIDER_ID,
      status: 2, // success
      transaction_id: txHash ?? gameRef,
    });
    if (txErr) req.log.error({ err: txErr.message, user_id, orderId }, '[cglt/swap] transaction insert failed');

    // 5. Return the new CGLT balance (and the new CDF balance for the header).
    return reply.send({
      success: true,
      new_cglt_balance: newCgltBalance,
      new_cdf_balance: cdfBalance,
      amount_cdf: amount,
      amount_cglt: amountCglt,
      rate: CDF_TO_CGLT_RATE,
    });
  });

  /**
   * POST /api/cglt/withdraw — send CGLT from the player's UniPay wallet to ANY
   * UniPay wallet (the player can pay out to themselves or to someone else).
   *
   * Body: { amount_cglt: number, phone: string } — the destination phone.
   * The player is identified by the session (never the body) to prevent IDOR.
   *
   * Flow (mirrors /api/cglt/swap's atomic debit→credit→rollback pattern):
   *  1. Validate amount (≥ MIN, ≤ player CGLT balance) and destination phone.
   *  2. Rate-limit: ≤ WITHDRAW_RATE_LIMIT successful withdrawals / rolling hour.
   *  3. Verify the destination UniPay wallet exists (404 → UNIPAY_WALLET_NOT_FOUND).
   *  4. Debit the player's wallet, then credit the destination.
   *  5. On a credit failure, refund the player so balances never drift.
   */
  app.post('/api/cglt/withdraw', { preHandler: app.requireAuth }, async (req, reply) => {
    const user_id = req.user.id;
    const body = (req.body ?? {}) as { amount_cglt?: number; phone?: string };

    const amount = Math.trunc(Number(body.amount_cglt));
    if (!Number.isFinite(amount) || amount <= 0) {
      return reply.code(400).send({ error: 'invalid_amount' });
    }
    if (amount < MIN_CGLT_WITHDRAW) {
      return reply.code(400).send({ error: 'amount_too_small', min: MIN_CGLT_WITHDRAW });
    }

    const destPhone = normalizeUnipayPhone(String(body.phone ?? ''));
    if (!destPhone) {
      return reply.code(400).send({ error: 'invalid_phone' });
    }

    // 1. Resolve the player's own UniPay phone from the session.
    let playerPhone: string | null = null;
    try {
      playerPhone = await getUserUnipayPhone(user_id);
    } catch (e) {
      req.log.error({ err: describeError(e), user_id }, '[cglt/withdraw] phone resolution failed');
      return reply.code(500).send({ error: 'phone_lookup_failed' });
    }
    if (!playerPhone) {
      return reply.code(404).send({ error: 'phone_not_found' });
    }

    // 2. Rate limit: count this user's successful withdrawals in the last hour.
    const since = new Date(Date.now() - WITHDRAW_RATE_WINDOW_MS).toISOString();
    const { count, error: countErr } = await supabaseAdmin
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user_id)
      .eq('type', 'cglt_withdraw')
      .eq('status', 2)
      .gte('created_at', since);
    if (countErr) {
      req.log.error({ err: countErr.message, user_id }, '[cglt/withdraw] rate-limit query failed');
      return reply.code(500).send({ error: 'rate_limit_check_failed' });
    }
    if ((count ?? 0) >= WITHDRAW_RATE_LIMIT) {
      return reply.code(429).send({ error: 'rate_limited', retry_after_ms: WITHDRAW_RATE_WINDOW_MS });
    }

    // 3. Ensure the player has enough CGLT.
    let playerBalance: number;
    try {
      const bal = await getCGLTBalance(playerPhone);
      playerBalance = Number(bal.cglt_balance) || 0;
    } catch (e) {
      if (e instanceof CgltError && e.status === 404) playerBalance = 0;
      else {
        req.log.error({ err: describeError(e), user_id, playerPhone }, '[cglt/withdraw] balance lookup failed');
        return reply.code(502).send({ error: 'cglt_balance_failed' });
      }
    }
    if (amount > playerBalance) {
      return reply.code(402).send({ error: 'insufficient_cglt', available: playerBalance });
    }

    // 4. Verify the DESTINATION UniPay wallet exists before moving any funds.
    try {
      await getCGLTBalance(destPhone);
    } catch (e) {
      if (e instanceof CgltError && e.status === 404) {
        return reply.code(404).send({ error: 'UNIPAY_WALLET_NOT_FOUND' });
      }
      req.log.error({ err: describeError(e), user_id, destPhone }, '[cglt/withdraw] dest wallet check failed');
      return reply.code(502).send({ error: 'dest_wallet_check_failed' });
    }

    const orderId = randomUUID();
    const gameRef = `cglt_withdraw_${orderId}`;

    // 5. Debit the player's UniPay wallet (atomic, balance-gated server-side).
    let newCgltBalance: number;
    try {
      const debit = await debitCGLT(playerPhone, amount, gameRef);
      newCgltBalance = Number(debit.new_balance);
    } catch (e) {
      if (e instanceof CgltError && (e.status === 402 || /insufficient/i.test(e.code))) {
        return reply.code(402).send({ error: 'insufficient_cglt' });
      }
      req.log.error({ err: describeError(e), user_id, playerPhone, amount }, '[cglt/withdraw] debit failed');
      return reply.code(502).send({ error: 'cglt_debit_failed' });
    }

    // 6. Credit the destination wallet. On failure, refund the player.
    let txHash: string | null = null;
    try {
      const credit = await creditCGLT(destPhone, amount, gameRef, gameRef);
      txHash = credit.blockchain_tx_hash;
    } catch (e) {
      await creditCGLT(playerPhone, amount, `${gameRef}_refund`, `${gameRef}_refund`).catch((refundErr) =>
        req.log.error({ err: describeError(refundErr), user_id, orderId }, '[cglt/withdraw] refund failed'),
      );
      req.log.error(
        { err: describeError(e), user_id, destPhone, amount, unipay_api: UNIPAY_API },
        '[cglt/withdraw] credit failed (player refunded)',
      );
      return reply.code(502).send({
        error: e instanceof CgltError ? e.code || 'cglt_credit_failed' : 'cglt_credit_failed',
        ...(e instanceof CgltError ? { upstream_status: e.status } : {}),
      });
    }

    // 7. Record the withdrawal in transactions history (best-effort).
    const { error: txErr } = await supabaseAdmin.from('transactions').insert({
      user_id,
      order_id: orderId,
      type: 'cglt_withdraw',
      amount,
      currency: 'CGLT',
      provider_id: CGLT_SWAP_PROVIDER_ID,
      status: 2, // success
      transaction_id: txHash ?? gameRef,
    });
    if (txErr) req.log.error({ err: txErr.message, user_id, orderId }, '[cglt/withdraw] transaction insert failed');

    return reply.send({
      success: true,
      new_cglt_balance: newCgltBalance,
      amount_cglt: amount,
    });
  });
};

export default cgltRoutes;
export { cgltRoutes };
