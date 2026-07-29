import { supabaseAdmin } from './supabase.js';

export async function recordAgentCommission(
  userId: string,
  ticketId: string,
  ticketType: 'flash' | 'scratch' | 'okapi',
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

    const commissionType = 'ticket';

    // Idempotency: check if a commission already exists for this ticket + type.
    // The DB unique constraint (agent_commissions_ticket_id_commission_type_key)
    // is the ultimate guard against race conditions, but this check avoids
    // unnecessary error logs in the common retry case.
    const { data: existing } = await supabaseAdmin
      .from('agent_commissions')
      .select('id')
      .eq('ticket_id', ticketId)
      .eq('commission_type', commissionType)
      .maybeSingle();

    if (existing) {
      console.log(`[agent-commission] duplicate skipped for ticket ${ticketId} (${commissionType})`);
      return;
    }

    const { error: insertErr } = await supabaseAdmin.from('agent_commissions').insert({
      agent_id:           agent.id,
      user_id:            userId,
      ticket_id:          ticketId,
      ticket_type:        ticketType,
      ticket_amount_cdf:  amountCdf,
      commission_cdf:     commissionCdf,
      commission_type:    commissionType,
    });

    if (insertErr) {
      // 23505 = unique_violation — race condition: another request already inserted.
      // This is expected and safe; the commission was already recorded.
      if (insertErr.code === '23505') {
        console.log(`[agent-commission] race-condition duplicate skipped for ticket ${ticketId} (${commissionType})`);
        return;
      }
      throw insertErr;
    }

    await supabaseAdmin.rpc('increment_agent_total', {
      agent_id: agent.id,
      delta:    commissionCdf,
    });
  } catch (err) {
    console.error('[agent-commission] failed:', err);
  }
}

export async function recordAgentWinCommission(
  userId: string,
  ticketId: string,
  ticketType: 'flash' | 'scratch',
  gainCdf: number,
): Promise<void> {
  try {
    const { data: user } = await supabaseAdmin
      .from('users').select('agent_ref').eq('id', userId).single();
    if (!user?.agent_ref) return;

    const { data: agent } = await supabaseAdmin
      .from('agents')
      .select('id, status, total_earned_cdf')
      .eq('id', user.agent_ref)
      .single();
    if (!agent || agent.status !== 'active') return;

    const total = Number(agent.total_earned_cdf);
    if (total < 1000000) return;
    const winRate = total >= 5000000 ? 0.03 : 0.02;

    const commissionCdf = Math.floor(gainCdf * winRate);
    if (commissionCdf <= 0) return;

    const commissionType = 'win';

    // Idempotency: check if a win commission already exists for this ticket.
    const { data: existing } = await supabaseAdmin
      .from('agent_commissions')
      .select('id')
      .eq('ticket_id', ticketId)
      .eq('commission_type', commissionType)
      .maybeSingle();

    if (existing) {
      console.log(`[agent-win-commission] duplicate skipped for ticket ${ticketId} (${commissionType})`);
      return;
    }

    const { error: insertErr } = await supabaseAdmin.from('agent_commissions').insert({
      agent_id:          agent.id,
      user_id:           userId,
      ticket_id:         ticketId,
      ticket_type:       ticketType,
      ticket_amount_cdf: gainCdf,
      commission_cdf:    commissionCdf,
      commission_type:   commissionType,
    });

    if (insertErr) {
      if (insertErr.code === '23505') {
        console.log(`[agent-win-commission] race-condition duplicate skipped for ticket ${ticketId} (${commissionType})`);
        return;
      }
      throw insertErr;
    }

    await supabaseAdmin.rpc('increment_agent_total', {
      agent_id: agent.id,
      delta:    commissionCdf,
    });
  } catch (err) {
    console.error('[agent-win-commission] failed:', err);
  }
}
