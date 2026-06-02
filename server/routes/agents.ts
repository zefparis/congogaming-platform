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
        .select('id, display_name, qr_code, zone, status, total_earned_cdf, phone, operator, created_at')
        .eq('qr_code', qrCode.toUpperCase())
        .eq('status', 'active')
        .single();
      if (error || !agent) return reply.code(404).send({ error: 'Agent introuvable' });

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { data: todayRows } = await supabaseAdmin
        .from('agent_commissions')
        .select('commission_cdf, status')
        .eq('agent_id', agent.id)
        .gte('created_at', today.toISOString());

      const rows = todayRows || [];
      const today_earned_cdf = rows.reduce((s, c) => s + Number(c.commission_cdf), 0);
      const pending_cdf = rows
        .filter(c => c.status === 'pending')
        .reduce((s, c) => s + Number(c.commission_cdf), 0);

      const { data: recentRows } = await supabaseAdmin
        .from('agent_commissions')
        .select('ticket_type, ticket_amount_cdf, commission_cdf, status, created_at')
        .eq('agent_id', agent.id)
        .order('created_at', { ascending: false })
        .limit(20);

      return reply.send({
        agent,
        today_earned_cdf,
        pending_cdf,
        recent: recentRows || [],
      });
    },
  );
}
