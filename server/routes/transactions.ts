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

  // Aggregated personal stats for the AccountScreen.
  // Uses only `transactions` and game tables; everything is scoped by user_id
  // via the JWT (no user-supplied id) so it's safe under RLS bypass.
  app.get('/api/me/stats', { preHandler: app.requireAuth }, async (req, reply) => {
    const userId = req.user.id;

    try {
      const [txRes, lotoRes, flashRes, okapiRes] = await Promise.all([
        supabaseAdmin
          .from('transactions')
          .select('type, amount, status')
          .eq('user_id', userId),
        supabaseAdmin
          .from('loto_tickets')
          .select('prix_cdf, gains_cdf, status')
          .eq('user_id', userId),
        supabaseAdmin
          .from('flash_tickets')
          .select('prix_cdf, gains_cdf, status')
          .eq('user_id', userId),
        supabaseAdmin
          .from('okapi_bets')
          .select('amount_cdf, win_amount_cdf, status')
          .eq('user_id', userId),
      ]);

      let totalDeposit = 0;
      let totalWithdrawal = 0;
      let pendingDeposits = 0;
      let pendingWithdrawals = 0;

      for (const t of txRes.data || []) {
        const amount = Number(t.amount || 0);
        if (t.type === 'deposit') {
          if (t.status === 2) totalDeposit += amount;
          else if (t.status === 0 || t.status === 1) pendingDeposits += 1;
        } else if (t.type === 'withdrawal') {
          if (t.status === 2) totalWithdrawal += amount;
          else if (t.status === 0 || t.status === 1) pendingWithdrawals += 1;
        }
      }

      let betsCount = 0;
      let totalBet = 0;
      let totalWin = 0;
      let winsCount = 0;

      for (const r of lotoRes.data || []) {
        betsCount += 1;
        totalBet += Number(r.prix_cdf || 0);
        const g = Number(r.gains_cdf || 0);
        if (g > 0) {
          totalWin += g;
          winsCount += 1;
        }
      }
      for (const r of flashRes.data || []) {
        betsCount += 1;
        totalBet += Number(r.prix_cdf || 0);
        const g = Number(r.gains_cdf || 0);
        if (g > 0) {
          totalWin += g;
          winsCount += 1;
        }
      }
      for (const r of okapiRes.data || []) {
        if (r.status === 'pending') continue;
        betsCount += 1;
        totalBet += Number(r.amount_cdf || 0);
        const g = Number(r.win_amount_cdf || 0);
        if (g > 0) {
          totalWin += g;
          winsCount += 1;
        }
      }

      const winRate = betsCount > 0 ? Math.round((winsCount / betsCount) * 1000) / 10 : 0;
      const netResult = totalWin - totalBet;

      return reply.send({
        totals: {
          deposit_cdf: totalDeposit,
          withdrawal_cdf: totalWithdrawal,
          bet_cdf: totalBet,
          win_cdf: totalWin,
          net_cdf: netResult,
        },
        counts: {
          bets: betsCount,
          wins: winsCount,
          pending_deposits: pendingDeposits,
          pending_withdrawals: pendingWithdrawals,
        },
        win_rate_percent: winRate,
      });
    } catch (e: any) {
      req.log.error({ err: e?.message }, 'me/stats failed');
      return reply.code(500).send({ error: 'Erreur statistiques' });
    }
  });
}
