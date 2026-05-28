import type { FastifyInstance } from 'fastify';
import { paymentStatus } from '../lib/unipesa.js';
import { supabaseAdmin } from '../lib/supabase.js';

export default async function statusRoutes(app: FastifyInstance) {
  app.get<{ Params: { order_id: string } }>('/api/status/:order_id', async (req, reply) => {
    const { order_id } = req.params;
    if (!order_id) return reply.code(400).send({ error: 'order_id required' });

    try {
      const r = await paymentStatus(order_id);
      const status = Number(r.status ?? 0);
      await supabaseAdmin
        .from('transactions')
        .update({ status })
        .eq('order_id', order_id);
      return reply.send({ status, raw: r });
    } catch (e: any) {
      // fall back to DB
      const { data } = await supabaseAdmin
        .from('transactions')
        .select('status')
        .eq('order_id', order_id)
        .maybeSingle();
      return reply.send({ status: data?.status ?? 0, error: e?.message });
    }
  });
}
