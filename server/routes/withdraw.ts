import type { FastifyInstance } from 'fastify';
import { newOrderId, paymentB2CResilient } from '../lib/unipesa.js';
import { recordLedgerEntry } from '../lib/ledger.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { WithdrawBodySchema } from '../lib/validation.js';
import { normalizePhoneForProvider, phoneMatchesProvider } from '../lib/phone.js';

export default async function withdrawRoutes(app: FastifyInstance) {
  app.post('/api/withdraw', { preHandler: app.requireAuth }, async (req, reply) => {
    const parsed = WithdrawBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message || 'Invalid withdrawal' });

    const user_id = req.user.id;
    const { amount, provider_id, phone } = parsed.data;

    if (!phoneMatchesProvider(phone, provider_id)) {
      return reply.code(400).send({ error: 'Ce numéro ne correspond pas à l\'opérateur sélectionné' });
    }

    const order_id = newOrderId();

    let newBalance: number;
    try {
      const ledger = await recordLedgerEntry({
        user_id,
        direction: 'debit',
        amount,
        currency: 'CDF',
        reason: 'payment_withdrawal_requested',
        reference_type: 'transaction',
        reference_id: order_id,
        idempotency_key: `payment:withdrawal:${order_id}:debit`,
      });
      newBalance = Number(ledger.balance ?? 0);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Balance error';
      app.log.warn({ err: message, user_id, amount }, 'withdrawal debit failed');
      if (message.includes('Insufficient')) return reply.code(400).send({ error: 'Insufficient balance' });
      return reply.code(500).send({ error: 'Balance error' });
    }

    const { error: insertErr } = await supabaseAdmin.from('transactions').insert({
      user_id,
      order_id,
      type: 'withdrawal',
      amount,
      currency: 'CDF',
      provider_id,
      status: 0,
    });
    if (insertErr) {
      await recordLedgerEntry({
        user_id,
        direction: 'credit',
        amount,
        currency: 'CDF',
        reason: 'payment_withdrawal_provider_error_refund',
        reference_type: 'transaction',
        reference_id: order_id,
        idempotency_key: `payment:withdrawal:${order_id}:provider-error-refund`,
      }).catch((refundErr) => app.log.error({ err: refundErr }, 'refund failed after tx insert error'));
      return reply.code(500).send({ error: 'DB insert failed' });
    }

    const normalizedPhone = normalizePhoneForProvider(phone, provider_id);
    app.log.info({ order_id, provider_id }, 'unipesa b2c requested');

    const result = await paymentB2CResilient(
      { order_id, customer_id: normalizedPhone, amount, provider_id },
      app.log,
    );

    if (result.ok) {
      const r = result.data;
      const status = Number(r.status ?? 1);
      await supabaseAdmin
        .from('transactions')
        .update({ status, transaction_id: r.transaction_id || null })
        .eq('order_id', order_id);
      return reply.send({ order_id, status, balance: newBalance });
    }

    // Provider unreachable / timeout / breaker open. The user has
    // already been debited (idempotent ledger entry above), so we do
    // NOT refund here — that would race with a callback that may
    // still arrive minutes later and would expose us to a double
    // payout. Instead we keep the transaction PENDING (status 1)
    // and let either:
    //   - the Unipesa callback (status 3 → callback refunds), or
    //   - the reconciliation job (poll /status, refund if FAILED)
    // resolve the final state idempotently.
    await supabaseAdmin
      .from('transactions')
      .update({ status: 1 })
      .eq('order_id', order_id);

    return reply.code(202).send({
      order_id,
      status: 1,
      pending: true,
      balance: newBalance,
      code: 'PROVIDER_TEMPORARILY_UNAVAILABLE',
      message: 'Demande enregistrée — paiement en cours de traitement',
    });
  });
}
