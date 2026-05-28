import type { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../lib/supabase.js';

export default async function transactionsRoutes(app: FastifyInstance) {
  app.get('/api/transactions/me', { preHandler: app.requireAuth }, async (req, reply) => {
    const user_id = req.user.id;
    const { data, error } = await supabaseAdmin
      .from('transactions')
      .select('id, order_id, type, amount, currency, provider_id, status, transaction_id, created_at')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ items: data || [] });
  });
}
