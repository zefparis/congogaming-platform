import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { recordLedgerEntry } from '../lib/ledger.js';
import { verifyCallbackSignature } from '../lib/unipesa.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { onDepositSucceeded } from '../lib/referral.js';

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(',')}}`;
}

function eventHash(body: Record<string, any>): string {
  return createHash('sha256').update(stableStringify(body)).digest('hex');
}

export default async function callbackRoutes(app: FastifyInstance) {
  app.post('/api/callback', async (req, reply) => {
    const body = (req.body || {}) as Record<string, any>;
    app.log.info({ body }, 'unipesa callback');

    const valid = verifyCallbackSignature(body);
    if (!valid) {
      app.log.warn('invalid callback signature');
      return reply.code(401).send({ error: 'Invalid signature' });
    }

    const order_id = String(body.order_id || '');
    const status = Number(body.status ?? 0);
    const transaction_id = body.transaction_id ? String(body.transaction_id) : null;

    if (!order_id) return reply.code(400).send({ error: 'Missing order_id' });

    const hash = eventHash(body);
    const { error: eventErr } = await supabaseAdmin.from('payment_events').insert({
      order_id,
      provider_transaction_id: transaction_id,
      event_hash: hash,
      status,
      raw: body,
    });
    if (eventErr) {
      if (eventErr.code === '23505') {
        app.log.info({ order_id, transaction_id }, 'duplicate payment callback ignored');
        return reply.code(200).send({ ok: true });
      }
      app.log.error({ err: eventErr.message, order_id }, 'payment event insert failed');
      return reply.code(500).send({ error: 'Payment event insert failed' });
    }

    const { data: tx, error: txErr } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .eq('order_id', order_id)
      .maybeSingle();
    if (txErr || !tx) {
      app.log.warn({ order_id }, 'tx not found in callback');
      return reply.code(200).send({ ok: true });
    }

    let shouldApplyBalance = false;

    if (status === 2 && tx.type === 'deposit') {
      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('transactions')
        .update({ status, transaction_id })
        .eq('order_id', order_id)
        .neq('status', 2)
        .select('id');
      if (updateErr) return reply.code(500).send({ error: updateErr.message });
      shouldApplyBalance = (updated?.length ?? 0) > 0;
    } else if (status === 3 && tx.type === 'withdrawal') {
      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('transactions')
        .update({ status, transaction_id })
        .eq('order_id', order_id)
        .not('status', 'in', '(2,3)')
        .select('id');
      if (updateErr) return reply.code(500).send({ error: updateErr.message });
      shouldApplyBalance = (updated?.length ?? 0) > 0;
    } else {
      const { error: updateErr } = await supabaseAdmin
        .from('transactions')
        .update({ status, transaction_id })
        .eq('order_id', order_id);
      if (updateErr) return reply.code(500).send({ error: updateErr.message });
    }

    // DEPOSIT credit on first success.
    if (status === 2 && tx.type === 'deposit' && shouldApplyBalance) {
      await recordLedgerEntry({
        user_id: tx.user_id,
        direction: 'credit',
        amount: Number(tx.amount),
        currency: String(tx.currency || 'CDF'),
        reason: 'payment_deposit_success',
        reference_type: 'transaction',
        reference_id: order_id,
        idempotency_key: `payment:deposit:${order_id}:success`,
      });

      // Best-effort referral welcome bonus. Never throws.
      await onDepositSucceeded(app.log, String(tx.user_id), Number(tx.amount));
    }

    // WITHDRAWAL refund when the provider ultimately fails (status 3).
    // The amount was debited at request time, so we credit it back.
    if (status === 3 && tx.type === 'withdrawal' && shouldApplyBalance) {
      await recordLedgerEntry({
        user_id: tx.user_id,
        direction: 'credit',
        amount: Number(tx.amount),
        currency: String(tx.currency || 'CDF'),
        reason: 'payment_withdrawal_refund',
        reference_type: 'transaction',
        reference_id: order_id,
        idempotency_key: `payment:withdrawal:${order_id}:refund`,
      });
    }

    return reply.code(200).send({ ok: true });
  });
}
