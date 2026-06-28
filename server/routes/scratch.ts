import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { recordLedgerEntry } from '../lib/ledger.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { generateGrid } from '../lib/scratchEngine.js';
import { ScratchBuyBodySchema, ScratchClaimBodySchema } from '../lib/validation.js';
import { onWagerPlaced } from '../lib/referral.js';
import { recordAgentCommission, recordAgentWinCommission } from '../lib/agent.js';
import { addXPAndReward, toFarmingPayload, type FarmingPayload } from '../lib/farming.js';
import { getUserUnipayPhone } from '../lib/unipay-cglt.js';

// Best-effort XP/CGLT farming; never breaks the buy flow.
async function awardScratchFarming(
  log: { error: (obj: unknown, msg?: string) => void },
  userId: string,
  betAmount: number,
): Promise<FarmingPayload | null> {
  try {
    const phone = await getUserUnipayPhone(userId);
    if (!phone) return null;
    return toFarmingPayload(await addXPAndReward(supabaseAdmin, phone, betAmount));
  } catch (err) {
    log.error({ err }, '[farming] scratch award failed');
    return null;
  }
}

const ALLOWED_BETS = new Set([500, 1000, 2000, 5000]);

export default async function scratchRoutes(app: FastifyInstance) {
  // POST /api/scratch/buy — debits the bet, generates a grid, returns the
  // ticket id + symbols (win amount is stored server-side and only revealed
  // on /claim, so a tampered client can't short-circuit the outcome).
  app.post<{ Body: { bet_amount_cdf?: number; is_free_play?: boolean } }>(
    '/api/scratch/buy',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      try {
        const user_id = req.user.id;
        const parsed = ScratchBuyBodySchema.safeParse(req.body);
        const bet = parsed.success ? parsed.data.bet_amount_cdf : 0;
        const isFreePlay = parsed.success ? parsed.data.is_free_play : false;
        if (!ALLOWED_BETS.has(bet)) return reply.code(400).send({ error: 'invalid_bet' });

        const order_id = randomUUID();
        const debitKey = `scratch:buy:${user_id}:${order_id}`;
        const refundKey = `scratch:buy:${user_id}:${order_id}:refund`;

        if (!isFreePlay) {
          await recordLedgerEntry({
            user_id,
            direction: 'debit',
            amount: Number(bet),
            currency: 'CDF',
            reason: 'scratch_buy',
            reference_type: 'scratch_ticket',
            reference_id: order_id,
            idempotency_key: debitKey,
          });
        }

        const { grid, win } = generateGrid(bet);
        const { data: ticket, error: insErr } = await supabaseAdmin
          .from('scratch_tickets')
          .insert({
            user_id,
            bet_amount_cdf: Number(bet),
            grid,
            win_amount_cdf: Number(win),
            status: 'pending',
          })
          .select('id')
          .single();
        if (insErr || !ticket) {
          // Best-effort refund only if we actually debited CDF.
          if (!isFreePlay) {
            try {
              await recordLedgerEntry({
                user_id,
                direction: 'credit',
                amount: Number(bet),
                currency: 'CDF',
                reason: 'scratch_buy_refund',
                reference_type: 'scratch_ticket',
                reference_id: order_id,
                idempotency_key: refundKey,
              });
            } catch {
              /* ignore refund failure */
            }
          }
          return reply.code(500).send({ error: insErr?.message || 'ticket_insert_failed' });
        }

        // Best-effort referral tier check; ticket id ensures idempotency.
        await onWagerPlaced(req.log, user_id, Number(bet), 'scratch', String(ticket.id));
        await recordAgentCommission(user_id, String(ticket.id), 'scratch', Number(bet));

        const farming = await awardScratchFarming(req.log, user_id, Number(bet));

        return reply.send({
          ticket_id: ticket.id,
          grid_hidden: true,
          bet_amount_cdf: Number(bet),
          grid, // symbols only — payout not exposed
          farming,
        });
      } catch (e: any) {
        req.log.error({ err: e }, '[scratch/buy]');
        return reply.code(500).send({ error: e.message ?? 'server_error' });
      }
    },
  );

  // POST /api/scratch/claim — marks the ticket claimed, credits any win,
  // returns the win amount + new balance.
  app.post<{ Body: { ticket_id?: string } }>(
    '/api/scratch/claim',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      try {
        const user_id = req.user.id;
        const parsed = ScratchClaimBodySchema.safeParse(req.body);
        const ticket_id = parsed.success ? parsed.data.ticket_id : '';
        if (!ticket_id) return reply.code(400).send({ error: 'bad_request' });

        const { data, error } = await supabaseAdmin.rpc('scratch_claim_atomic', {
          p_ticket_id: ticket_id,
          p_user_id: user_id,
          p_idempotency_key: `scratch:claim:${ticket_id}`,
        });
        if (error) {
          if (error.message.includes('ticket_not_found')) return reply.code(404).send({ error: 'ticket_not_found' });
          if (error.message.includes('already_claimed')) return reply.code(400).send({ error: 'already_claimed' });
          return reply.code(500).send({ error: error.message });
        }

        const row = Array.isArray(data) ? data[0] : data;
        const win = Number(row?.win_amount_cdf ?? 0);
        const new_balance = Number(row?.new_balance ?? 0);

        if (win > 0) await recordAgentWinCommission(user_id, ticket_id, 'scratch', win);

        return reply.send({
          win_amount_cdf: Number(win),
          new_balance: Number(new_balance),
          grid: row?.grid,
        });
      } catch (e: any) {
        req.log.error({ err: e }, '[scratch/claim]');
        return reply.code(500).send({ error: e.message ?? 'server_error' });
      }
    },
  );
}
