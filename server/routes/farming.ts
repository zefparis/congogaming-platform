import type { FastifyPluginAsync } from 'fastify';
import { supabaseAdmin } from '../lib/supabase.js';
import { getUserUnipayPhone, CgltError } from '../lib/unipay-cglt.js';
import { getCurrentTier, getNextTier, TIERS } from '../lib/farming.js';

/**
 * CGLT Farming status — read-only view of the authenticated player's XP,
 * current/next tier, progress and recent rewards. The phone is always
 * resolved server-side from the session so a player can only read their own
 * farming state (no IDOR via a query param).
 */
const farmingRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/farming/status', { preHandler: app.requireAuth }, async (req, reply) => {
    try {
      const phone = await getUserUnipayPhone(req.user.id);
      if (!phone) return reply.code(404).send({ error: 'phone_not_found' });

      const { data: farming } = await supabaseAdmin
        .from('player_farming')
        .select('*')
        .eq('phone', phone)
        .maybeSingle();

      const totalXp = Number(farming?.total_xp ?? 0);
      const totalCgltEarned = Number(farming?.total_cglt_earned ?? 0);

      const current = getCurrentTier(totalXp);
      const next = getNextTier(totalXp);

      // Progress through the CURRENT tier toward the next threshold.
      let progressPercent = 100;
      let xpNeeded = 0;
      if (next) {
        const span = next.xp_min - current.xp_min;
        const into = totalXp - current.xp_min;
        progressPercent = span > 0 ? Math.min(100, Math.round((into / span) * 100)) : 0;
        xpNeeded = Math.max(0, next.xp_min - totalXp);
      }

      const { data: rewards } = await supabaseAdmin
        .from('farming_rewards')
        .select('tier, cglt_amount, xp_at_reward, status, created_at')
        .eq('phone', phone)
        .order('created_at', { ascending: false })
        .limit(10);

      return reply.send({
        phone,
        total_xp: totalXp,
        total_cglt_earned: totalCgltEarned,
        current_tier: {
          name: current.name,
          label: current.label,
          cglt_reward: current.cglt_reward,
        },
        next_tier: next
          ? { name: next.name, label: next.label, cglt_reward: next.cglt_reward, xp_needed: xpNeeded }
          : null,
        progress_percent: progressPercent,
        recent_rewards: rewards ?? [],
        tiers: TIERS,
      });
    } catch (e) {
      if (e instanceof CgltError) return reply.code(e.status).send({ error: e.code });
      req.log.error({ err: e }, '[farming/status]');
      return reply.code(500).send({ error: 'server_error' });
    }
  });
};

export default farmingRoutes;
export { farmingRoutes };
