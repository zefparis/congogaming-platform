import type { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'node:crypto';
import { getCGLTBalance, getUserUnipayPhone, creditCGLT, CgltError } from '../lib/unipay-cglt.js';
import { recordLedgerEntry } from '../lib/ledger.js';
import { supabaseAdmin } from '../lib/supabase.js';

/**
 * Conversion rate CDF -> CGLT. Currently a flat 1:1; kept as a constant so a
 * future CDF/USD oracle can drive it without touching the swap logic.
 */
const CDF_TO_CGLT_RATE = 1;

// Internal (non-Unipesa) transaction sentinel, mirroring the loto/flash routes.
const CGLT_SWAP_PROVIDER_ID = 0;

/**
 * CGLT gaming bridge — server-side proxy so the browser never sees the
 * shared GAMING_API_KEY. The frontend currency toggle reads the player's
 * CGLT balance through this route.
 */
const cgltRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/cglt/balance', { preHandler: app.requireAuth }, async (req, reply) => {
    try {
      const phone = await getUserUnipayPhone(req.user.id);
      if (!phone) return reply.code(404).send({ error: 'phone_not_found' });
      const balance = await getCGLTBalance(phone);
      return reply.send(balance);
    } catch (e) {
      if (e instanceof CgltError) {
        if (e.status === 404) return reply.send({ phone: null, cglt_balance: 0, equivalent_usdt: null });
        return reply.code(e.status).send({ error: e.code });
      }
      req.log.error({ err: e }, '[cglt/balance]');
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

    const phone = await getUserUnipayPhone(user_id);
    if (!phone) return reply.code(404).send({ error: 'phone_not_found' });

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
      req.log.error({ err: e, user_id }, '[cglt/swap] debit failed');
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
      }).catch((refundErr) => req.log.error({ err: refundErr }, '[cglt/swap] refund failed'));

      if (e instanceof CgltError) return reply.code(e.status).send({ error: e.code });
      req.log.error({ err: e, user_id }, '[cglt/swap] credit failed');
      return reply.code(502).send({ error: 'cglt_credit_failed' });
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
    if (txErr) req.log.error({ err: txErr.message, user_id }, '[cglt/swap] transaction insert failed');

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
};

export default cgltRoutes;
export { cgltRoutes };
