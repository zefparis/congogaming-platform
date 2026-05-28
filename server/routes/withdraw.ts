import type { FastifyInstance } from 'fastify';
import { newOrderId, paymentB2C } from '../lib/unipesa.js';
import { recordLedgerEntry } from '../lib/ledger.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { WithdrawBodySchema } from '../lib/validation.js';

function normalizePhone(phone: string, provider_id: number): string {
  phone = phone.replace(/\s/g, '');
  if (provider_id === 17) {
    if (phone.startsWith('243')) phone = phone.slice(3);
    if (phone.startsWith('0')) phone = phone.slice(1);
    return phone;
  }
  if (provider_id === 10 || provider_id === 19) {
    if (phone.startsWith('243')) phone = '0' + phone.slice(3);
    if (!phone.startsWith('0')) phone = '0' + phone;
    return phone;
  }
  return phone;
}

export default async function withdrawRoutes(app: FastifyInstance) {
  app.post('/api/withdraw', { preHandler: app.requireAuth }, async (req, reply) => {
    const parsed = WithdrawBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message || 'Invalid withdrawal' });

    const user_id = req.user.id;
    const { amount, provider_id, phone } = parsed.data;
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

    const normalizedPhone = normalizePhone(phone, provider_id);
    app.log.info({ order_id, provider_id }, 'unipesa b2c requested');

    try {
      const r = await paymentB2C({ order_id, customer_id: normalizedPhone, amount, provider_id });
      const status = Number(r.status ?? 1);
      await supabaseAdmin.from('transactions').update({ status, transaction_id: r.transaction_id || null }).eq('order_id', order_id);
      return reply.send({ order_id, status, balance: newBalance });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Payment provider error';
      try {
        await recordLedgerEntry({
          user_id,
          direction: 'credit',
          amount,
          currency: 'CDF',
          reason: 'payment_withdrawal_provider_error_refund',
          reference_type: 'transaction',
          reference_id: order_id,
          idempotency_key: `payment:withdrawal:${order_id}:provider-error-refund`,
        });
      } catch (refundErr) { app.log.error({ err: refundErr, user_id, amount, order_id }, 'refund failed'); }
      await supabaseAdmin.from('transactions').update({ status: 3 }).eq('order_id', order_id);
      return reply.code(502).send({ error: message, order_id });
    }
  });
}
