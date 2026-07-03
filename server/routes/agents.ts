import type { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../lib/supabase.js';

export default async function agentsPublicRoutes(app: FastifyInstance) {
  // GET /api/agents/:qrCode — public stats for AgentDashboard
  // No auth required.
  app.get<{ Params: { qrCode: string } }>(
    '/api/agents/:qrCode',
    async (req, reply) => {
      const { qrCode } = req.params;
      const { data: agent, error } = await supabaseAdmin
        .from('agents')
        .select('id, display_name, zone, status, total_earned_cdf, commission_rate')
        .eq('qr_code', qrCode.toUpperCase())
        .eq('status', 'active')
        .single();
      if (error || !agent) return reply.code(404).send({ error: 'Agent introuvable' });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [{ data: todayRows }, { data: allPendingRows }, { data: recentRows }] = await Promise.all([
        supabaseAdmin
          .from('agent_commissions')
          .select('commission_cdf')
          .eq('agent_id', agent.id)
          .gte('created_at', today.toISOString()),
        supabaseAdmin
          .from('agent_commissions')
          .select('commission_cdf')
          .eq('agent_id', agent.id)
          .eq('status', 'pending'),
        supabaseAdmin
          .from('agent_commissions')
          .select('ticket_type, ticket_amount_cdf, commission_cdf, status, created_at')
          .eq('agent_id', agent.id)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      const today_earned_cdf = (todayRows || []).reduce((s, c) => s + Number(c.commission_cdf), 0);
      const pending_cdf      = (allPendingRows || []).reduce((s, c) => s + Number(c.commission_cdf), 0);

      const totalEarned = Number(agent.total_earned_cdf);
      let tier: string;
      if      (totalEarned >= 5000000) tier = 'diamond';
      else if (totalEarned >= 1000000) tier = 'gold';
      else                             tier = 'standard';

      const tierThresholds: Record<string, number | null> = {
        standard: 1000000, gold: 5000000, diamond: null,
      };
      const next_tier_cdf = tierThresholds[tier];

      return reply.send({
        agent,
        today_earned_cdf,
        pending_cdf,
        tier,
        next_tier_cdf,
        recent: recentRows || [],
      });
    },
  );

  // POST /api/agents/:qrCode/request-payout — no auth required
  app.post<{ Params: { qrCode: string } }>(
    '/api/agents/:qrCode/request-payout',
    async (req, reply) => {
      const { qrCode } = req.params;
      const { data: agent, error } = await supabaseAdmin
        .from('agents')
        .select('id, status, total_earned_cdf, min_payout_cdf, payout_requested_at')
        .eq('qr_code', qrCode.toUpperCase())
        .eq('status', 'active')
        .single();
      if (error || !agent) return reply.code(404).send({ error: 'Agent introuvable' });

      const { data: pendingRows } = await supabaseAdmin
        .from('agent_commissions')
        .select('commission_cdf')
        .eq('agent_id', agent.id)
        .eq('status', 'pending');

      const total        = (pendingRows || []).reduce((s, c) => s + Number(c.commission_cdf), 0);
      const totalEarned  = Number(agent.total_earned_cdf ?? 0);
      const agentTier    = totalEarned >= 5000000 ? 'diamond'
                         : totalEarned >= 1000000 ? 'gold' : 'standard';
      const minimum      = agentTier === 'diamond' ? 1000 : Number(agent.min_payout_cdf ?? 2000);

      if (total < minimum) {
        return reply.code(400).send({ code: 'BELOW_MINIMUM', minimum, current: total });
      }

      if (agent.payout_requested_at) {
        const msSince = Date.now() - new Date(agent.payout_requested_at).getTime();
        if (msSince < 24 * 60 * 60 * 1000) {
          return reply.code(400).send({ code: 'ALREADY_REQUESTED' });
        }
      }

      const { error: updateErr } = await supabaseAdmin
        .from('agents')
        .update({
          payout_requested_at:         new Date().toISOString(),
          payout_requested_amount_cdf: total,
        })
        .eq('id', agent.id);

      if (updateErr) return reply.code(500).send({ error: updateErr.message });

      return reply.send({ ok: true, amount: total });
    },
  );
}
