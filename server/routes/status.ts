import type { FastifyInstance } from 'fastify';
import { paymentStatus } from '../lib/unipesa.js';
import { supabaseAdmin } from '../lib/supabase.js';

export default async function statusRoutes(app: FastifyInstance) {
  app.get<{ Params: { order_id: string } }>(
    '/api/status/:order_id',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const { order_id } = req.params;
      if (!order_id) return reply.code(400).send({ error: 'order_id required' });

      // Ownership check: verify the order belongs to the authenticated user.
      const { data: tx, error: txErr } = await supabaseAdmin
        .from('transactions')
        .select('user_id, status')
        .eq('order_id', order_id)
        .maybeSingle();
      if (txErr || !tx || String(tx.user_id) !== req.user.id) {
        return reply.code(404).send({ error: 'Not found' });
      }

      try {
        const r = await paymentStatus(order_id);
        const status = Number(r.status ?? 0);
        await supabaseAdmin
          .from('transactions')
          .update({ status })
          .eq('order_id', order_id);
        return reply.send({ status, raw: r });
      } catch (e: any) {
        return reply.send({ status: tx.status ?? 0, error: e?.message });
      }
    },
  );
}
