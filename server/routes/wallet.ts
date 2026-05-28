import type { FastifyPluginAsync } from 'fastify';
import { getSupabase } from '../lib/supabase.js';

const walletRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/wallet/balance', { preHandler: app.requireAuth }, async (req, reply) => {
    const user_id = req.user.id;
    const sb = getSupabase();
    if (!sb) return reply.code(503).send({ error: 'Database not configured' });
    const { data, error } = await sb.from('users').select('balance_cdf').eq('id', user_id).maybeSingle();
    if (error) {
      app.log.error({ err: error.message, user_id }, 'wallet balance query failed');
      return reply.code(500).send({ error: 'Balance query failed' });
    }
    if (!data) return reply.code(404).send({ error: 'User not found' });
    return reply.send({ balance: Number(data.balance_cdf ?? 0) });
  });
};

export default walletRoutes;
export { walletRoutes };
