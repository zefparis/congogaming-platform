import type { FastifyPluginAsync } from 'fastify';
import { getCGLTBalance, getUserUnipayPhone, CgltError } from '../lib/unipay-cglt.js';

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
};

export default cgltRoutes;
export { cgltRoutes };
