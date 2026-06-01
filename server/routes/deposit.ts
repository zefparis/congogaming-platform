import type { FastifyInstance } from 'fastify';
import { newOrderId, paymentC2BResilient } from '../lib/unipesa.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { DepositBodySchema } from '../lib/validation.js';
import { normalizePhoneForProvider, phoneMatchesProvider } from '../lib/phone.js';
import { onDepositSucceeded } from '../lib/referral.js';

const MIN_AMOUNTS: Record<number, number> = { 10: 100, 17: 100, 19: 2250 };
const MIN_AMOUNT_CODES: Record<number, string> = { 10: 'MIN_AMOUNT_ORANGE', 17: 'MIN_AMOUNT_AIRTEL', 19: 'MIN_AMOUNT_AFRICELL' };

export default async function depositRoutes(app: FastifyInstance) {
  app.post('/api/deposit', { preHandler: app.requireAuth }, async (req, reply) => {
    const parsed = DepositBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message || 'Invalid deposit' });

    const user_id = req.user.id;
    const { amount, provider_id, phone } = parsed.data;
    const minAmount = MIN_AMOUNTS[provider_id] ?? 100;
    const minCode = MIN_AMOUNT_CODES[provider_id] ?? 'MIN_AMOUNT_GENERIC';
    if (amount < minAmount) return reply.code(400).send({ code: minCode, error: minCode });

    if (!phoneMatchesProvider(phone, provider_id)) {
      return reply.code(400).send({ code: 'PHONE_OPERATOR_MISMATCH', error: 'PHONE_OPERATOR_MISMATCH' });
    }

    // Responsible-gaming guard: self-exclusion + daily/weekly/monthly caps.
    const { data: limitCheck, error: limitErr } = await supabaseAdmin.rpc('check_deposit_allowed', {
      p_user_id: user_id,
      p_amount: amount,
    });
    if (limitErr) {
      app.log.error({ err: limitErr.message, user_id }, 'check_deposit_allowed RPC failed');
      return reply.code(500).send({ code: 'LIMITS_CHECK_FAILED', error: 'LIMITS_CHECK_FAILED' });
    }
    const limitRow = Array.isArray(limitCheck) ? limitCheck[0] : limitCheck;
    if (limitRow && limitRow.allowed === false) {
      const reason = String(limitRow.reason || 'LIMIT_EXCEEDED');
      const errorCode = reason === 'SELF_EXCLUDED' ? 'SELF_EXCLUSION_ACTIVE' : (reason || 'DEPOSIT_BLOCKED');
      return reply.code(403).send({
        error: errorCode,
        code: errorCode,
        retry_after: limitRow.retry_after ?? null,
      });
    }

    const order_id = newOrderId();
    const { error: insertErr } = await supabaseAdmin.from('transactions').insert({
      user_id,
      order_id,
      type: 'deposit',
      amount,
      currency: 'CDF',
      provider_id,
      status: 0,
    });
    if (insertErr) {
      app.log.error({ err: insertErr.message, user_id, order_id }, 'insert transaction failed');
      return reply.code(500).send({ code: 'DB_ERROR', error: 'DB_ERROR' });
    }

    const normalizedPhone = normalizePhoneForProvider(phone, provider_id);
    app.log.info({ order_id, provider_id }, 'unipesa c2b requested');

    const result = await paymentC2BResilient(
      { order_id, customer_id: normalizedPhone, amount, provider_id },
      app.log,
    );

    if (result.ok) {
      const r = result.data;
      const status = Number(r.status ?? 1);
      const transaction_id = r.transaction_id || null;
      await supabaseAdmin.from('transactions').update({ status, transaction_id }).eq('order_id', order_id);
      // Best-effort referral welcome bonus when the deposit confirms synchronously.
      // The callback path also fires this; the underlying RPC is idempotent
      // (only credits on the FIRST qualifying deposit + composite unique on the
      // referral_rewards row).
      if (status === 2) {
        await onDepositSucceeded(app.log, user_id, amount);
      }
      return reply.send({ order_id, status, transaction_id });
    }

    // Provider unreachable / timeout / breaker open. Keep the
    // transaction in PENDING (status 1) and respond fast — the
    // Unipesa callback OR the reconciliation job will resolve it.
    // Do NOT mark the transaction as failed here, otherwise a
    // late-arriving callback would have nothing to update.
    await supabaseAdmin
      .from('transactions')
      .update({ status: 1 })
      .eq('order_id', order_id);

    return reply.code(202).send({
      order_id,
      status: 1,
      pending: true,
      code: 'PROVIDER_TEMPORARILY_UNAVAILABLE',
      message: 'PROVIDER_TEMPORARILY_UNAVAILABLE',
    });
  });
}
