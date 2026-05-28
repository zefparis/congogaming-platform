import type { FastifyInstance } from 'fastify';
import { newOrderId, paymentC2B } from '../lib/unipesa.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { DepositBodySchema } from '../lib/validation.js';

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

const MIN_AMOUNTS: Record<number, number> = { 10: 100, 17: 100, 19: 2250 };

export default async function depositRoutes(app: FastifyInstance) {
  app.post('/api/deposit', { preHandler: app.requireAuth }, async (req, reply) => {
    const parsed = DepositBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message || 'Invalid deposit' });

    const user_id = req.user.id;
    const { amount, provider_id, phone } = parsed.data;
    const minAmount = MIN_AMOUNTS[provider_id] ?? 100;
    if (amount < minAmount) return reply.code(400).send({ error: `Montant minimum ${minAmount} CDF pour cet opérateur` });

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
      return reply.code(500).send({ error: 'DB insert failed' });
    }

    const normalizedPhone = normalizePhone(phone, provider_id);
    app.log.info({ order_id, provider_id }, 'unipesa c2b requested');

    try {
      const r = await paymentC2B({ order_id, customer_id: normalizedPhone, amount, provider_id });
      const status = Number(r.status ?? 1);
      const transaction_id = r.transaction_id || null;
      await supabaseAdmin.from('transactions').update({ status, transaction_id }).eq('order_id', order_id);
      return reply.send({ order_id, status, transaction_id });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Payment provider error';
      app.log.error({ err: message, order_id }, 'unipesa c2b failed');
      await supabaseAdmin.from('transactions').update({ status: 3 }).eq('order_id', order_id);
      return reply.code(502).send({ error: message, order_id });
    }
  });
}
