import { supabaseAdmin } from './supabase.js';

export async function recordAgentCommission(
  userId: string,
  ticketId: string,
  ticketType: 'okapi_color' | 'flash' | 'scratch' | 'okapi',
  amountCdf: number,
): Promise<void> {
  try {
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('agent_ref')
      .eq('id', userId)
      .single();

    if (!user?.agent_ref) return;

    const { data: agent } = await supabaseAdmin
      .from('agents')
      .select('id, commission_rate, status')
      .eq('id', user.agent_ref)
      .single();

    if (!agent || agent.status !== 'active') return;

    const commissionCdf = Math.floor(amountCdf * Number(agent.commission_rate));
    if (commissionCdf <= 0) return;

    await supabaseAdmin.from('agent_commissions').insert({
      agent_id:           agent.id,
      user_id:            userId,
      ticket_id:          ticketId,
      ticket_type:        ticketType,
      ticket_amount_cdf:  amountCdf,
      commission_cdf:     commissionCdf,
    });

    await supabaseAdmin.rpc('increment_agent_total', {
      agent_id: agent.id,
      delta:    commissionCdf,
    });
  } catch (err) {
    console.error('[agent-commission] failed:', err);
  }
}
