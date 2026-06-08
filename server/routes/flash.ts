import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import crypto, { timingSafeEqual } from 'node:crypto';
import { recordLedgerEntry } from '../lib/ledger.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { FlashTicketBodySchema } from '../lib/validation.js';
import { onWagerPlaced } from '../lib/referral.js';
import { recordAgentCommission, recordAgentWinCommission } from '../lib/agent.js';
import { env } from '../env.js';
import { addXPAndReward, toFarmingPayload, type FarmingPayload } from '../lib/farming.js';
import { getUserUnipayPhone } from '../lib/unipay-cglt.js';

// Best-effort XP/CGLT farming; never breaks the ticket-buy flow.
async function awardFlashFarming(
  log: { error: (obj: unknown, msg?: string) => void },
  userId: string,
  betAmount: number,
): Promise<FarmingPayload | null> {
  try {
    const phone = await getUserUnipayPhone(userId);
    if (!phone) return null;
    return toFarmingPayload(await addXPAndReward(supabaseAdmin, phone, betAmount));
  } catch (err) {
    log.error({ err }, '[farming] flash award failed');
    return null;
  }
}

const PRIX_FLASH = 1000;
const JACKPOT_CONTRIBUTION = 500; // 50% du ticket
const FLASH_SEUIL = env.FLASH_JACKPOT_CDF ?? 250_000;

async function applyFlashJackpotDeltaIdempotent(
  eventKey: string,
  tirageId: string,
  deltaCdf: number,
): Promise<void> {
  const { error } = await supabaseAdmin.rpc('apply_flash_jackpot_delta_idempotent', {
    p_event_key: eventKey,
    p_tirage_id: tirageId,
    p_delta_cdf: deltaCdf,
  });
  if (error) throw new Error(error.message);
}

function calculGainsFlash(nbBons: number, jackpotDispo: boolean): number {
  if (nbBons === 5) return jackpotDispo ? FLASH_SEUIL : 0;
  if (nbBons === 4) return 50_000;
  if (nbBons === 3) return 5_000;
  if (nbBons === 2) return 1_000;
  return 0;
}


function isValidFlashNumbers(nums: unknown): nums is number[] {
  if (!Array.isArray(nums) || nums.length !== 5) return false;
  const set = new Set<number>();
  for (const n of nums) {
    if (!Number.isInteger(n)) return false;
    if ((n as number) < 1 || (n as number) > 20) return false;
    set.add(n as number);
  }
  return set.size === 5;
}

function drawFiveUniqueNumbers(): number[] {
  const picked = new Set<number>();
  while (picked.size < 5) {
    const buf = crypto.randomBytes(2);
    const v = (buf.readUInt16BE(0) % 20) + 1;
    picked.add(v);
  }
  return Array.from(picked).sort((a, b) => a - b);
}

export type ExecuterTirageFlashResult = {
  tirage_id: string;
  tickets_traites: number;
  pot_jackpot: number;
  jackpot_declenche: boolean;
};

/**
 * Logique partagée du tirage Flash :
 * - utilisée par la route POST /api/flash/tirage (admin)
 * - et par le cron toutes les 30 minutes
 */
export async function executerTirageFlash(): Promise<ExecuterTirageFlashResult> {
  const numeros = drawFiveUniqueNumbers();
  const ts = Date.now();
  const hash_pre = crypto
    .createHash('sha256')
    .update(JSON.stringify({ numeros, ts }))
    .digest('hex');

  const { data: tirage, error: tirErr } = await supabaseAdmin
    .from('flash_tirages')
    .insert({ numeros, hash_pre })
    .select('*')
    .single();
  if (tirErr || !tirage) {
    throw new Error(tirErr?.message || 'Tirage flash insert failed');
  }

  const { data: jackpotRow } = await supabaseAdmin
    .from('flash_jackpot')
    .select('pot_cdf')
    .eq('id', 1)
    .single();
  const potActuel = Number(jackpotRow?.pot_cdf ?? 0);
  let jackpotDispo = potActuel >= FLASH_SEUIL;
  let jackpotPaye = false;

  // Résoudre les jackpots en attente si le pot est maintenant suffisant
  if (jackpotDispo) {
    const { data: enAttente } = await supabaseAdmin
      .from('flash_tickets')
      .select('*')
      .eq('status', 'jackpot_attente')
      .eq('jackpot_en_attente', true);

    for (const ticket of enAttente ?? []) {
      await supabaseAdmin.rpc('flash_settle_ticket_payout_atomic', {
        p_ticket_id: ticket.id,
        p_status: 'gagnant',
        p_nb_bons: 5,
        p_gains_cdf: FLASH_SEUIL,
        p_jackpot_en_attente: false,
        p_tirage_id: tirage.id,
        p_idempotency_key: `flash:payout:${ticket.id}`,
      });
      await applyFlashJackpotDeltaIdempotent(
        `flash:draw:${tirage.id}:jackpot-resolve:${ticket.id}`,
        tirage.id,
        -FLASH_SEUIL,
      );
      jackpotPaye = true;

      // Le pot redescend : recalcule pour les suivants
      const { data: potRow } = await supabaseAdmin
        .from('flash_jackpot')
        .select('pot_cdf')
        .eq('id', 1)
        .single();
      jackpotDispo = Number(potRow?.pot_cdf ?? 0) >= FLASH_SEUIL;
      if (!jackpotDispo) break;
    }
  }

  const { data: pending, error: pendErr } = await supabaseAdmin
    .from('flash_tickets')
    .select('id, user_id, numeros')
    .eq('status', 'pending');
  if (pendErr) throw new Error(pendErr.message);

  const winSet = new Set<number>(numeros);
  let processed = 0;

  for (const t of pending || []) {
    const tNums: number[] = Array.isArray(t.numeros) ? t.numeros : [];
    const nb_bons = tNums.reduce((acc, n) => acc + (winSet.has(n) ? 1 : 0), 0);
    const isFive = nb_bons === 5;
    const gains_cdf = calculGainsFlash(nb_bons, jackpotDispo);
    const jackpot_en_attente = isFive && !jackpotDispo;

    let status: 'gagnant' | 'perdant' | 'jackpot_attente';
    if (jackpot_en_attente) {
      status = 'jackpot_attente';
    } else if (gains_cdf > 0) {
      status = 'gagnant';
    } else {
      status = 'perdant';
    }

    if (gains_cdf > 0 && !jackpot_en_attente) {
      await supabaseAdmin.rpc('flash_settle_ticket_payout_atomic', {
        p_ticket_id: t.id,
        p_status: status,
        p_nb_bons: nb_bons,
        p_gains_cdf: gains_cdf,
        p_jackpot_en_attente: jackpot_en_attente,
        p_tirage_id: tirage.id,
        p_idempotency_key: `flash:payout:${t.id}`,
      });
      await recordAgentWinCommission(String(t.user_id), t.id, 'flash', gains_cdf);
      if (isFive) {
        jackpotPaye = true;
        await applyFlashJackpotDeltaIdempotent(
          `flash:draw:${tirage.id}:jackpot-decrement:${t.id}`,
          tirage.id,
          -FLASH_SEUIL,
        );
      }
    } else {
      await supabaseAdmin
        .from('flash_tickets')
        .update({
          status,
          nb_bons,
          gains_cdf,
          jackpot_en_attente,
          tirage_id: tirage.id,
        })
        .eq('id', t.id);
    }

    processed++;
  }

  if (jackpotPaye) {
    await supabaseAdmin
      .from('flash_tirages')
      .update({ jackpot_paye: true })
      .eq('id', tirage.id);
  }

  return {
    tirage_id: tirage.id,
    tickets_traites: processed,
    pot_jackpot: potActuel,
    jackpot_declenche: jackpotPaye,
  };
}

const flashRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET latest tirage
  app.get('/api/flash/tirage/latest', async (_req, reply) => {
    const { data, error } = await supabaseAdmin
      .from('flash_tirages')
      .select('*')
      .order('drawn_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return reply.code(500).send({ error: error.message });
    const { data: jackpotRow } = await supabaseAdmin
      .from('flash_jackpot')
      .select('pot_cdf')
      .eq('id', 1)
      .single();
    return reply.send({
      tirage: data || null,
      pot_cdf: Number(jackpotRow?.pot_cdf ?? 0),
    });
  });

  // GET my tickets
  app.get('/api/flash/mes-tickets', { preHandler: app.requireAuth }, async (req, reply) => {
    const user_id = req.user.id;
    const { data, error } = await supabaseAdmin
      .from('flash_tickets')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ tickets: data || [] });
  });

  // POST buy ticket
  app.post('/api/flash/ticket', { preHandler: app.requireAuth }, async (req, reply) => {
    const user_id = req.user.id;
    const parsed = FlashTicketBodySchema.safeParse(req.body);
    const numeros = parsed.success ? parsed.data.numeros : undefined;
    if (!isValidFlashNumbers(numeros)) {
      return reply.code(400).send({ code: 'INVALID_NUMBERS', error: 'INVALID_NUMBERS' });
    }

    // Sécurité lancement : seuil minimum de tickets cumulés
    const MIN = Number(process.env.FLASH_MIN_TICKETS ?? 0);
    if (MIN > 0) {
      const { count } = await supabaseAdmin
        .from('flash_tickets')
        .select('*', { count: 'exact', head: true });
      if ((count ?? 0) < MIN) {
        return reply
          .code(503)
          .send({ code: 'SERVICE_STARTING', error: 'SERVICE_STARTING' });
      }
    }

    const { data: user, error: userErr } = await supabaseAdmin
      .from('users')
      .select('balance_cdf')
      .eq('id', user_id)
      .single();
    if (userErr || !user) return reply.code(404).send({ code: 'USER_NOT_FOUND', error: 'USER_NOT_FOUND' });
    if (Number(user.balance_cdf) < PRIX_FLASH) {
      return reply.code(400).send({ code: 'INSUFFICIENT_BALANCE', error: 'INSUFFICIENT_BALANCE' });
    }

    const ticket_id = crypto.randomUUID();
    await recordLedgerEntry({
      user_id,
      direction: 'debit',
      amount: PRIX_FLASH,
      currency: 'CDF',
      reason: 'flash_ticket_buy',
      reference_type: 'flash_ticket',
      reference_id: ticket_id,
      idempotency_key: `flash:ticket:${ticket_id}:buy`,
    });

    const { data: ticket, error: insErr } = await supabaseAdmin
      .from('flash_tickets')
      .insert({
        user_id,
        numeros: numeros as number[],
        prix_cdf: PRIX_FLASH,
        status: 'pending',
        id: ticket_id,
      })
      .select('id')
      .single();

    if (insErr || !ticket) {
      await recordLedgerEntry({
        user_id,
        direction: 'credit',
        amount: PRIX_FLASH,
        currency: 'CDF',
        reason: 'flash_ticket_buy_refund',
        reference_type: 'flash_ticket',
        reference_id: ticket_id,
        idempotency_key: `flash:ticket:${ticket_id}:buy:refund`,
      });
      return reply.code(500).send({ error: insErr?.message || 'Insert failed' });
    }

    await supabaseAdmin.rpc('increment_flash_jackpot', { delta: JACKPOT_CONTRIBUTION });

    // Best-effort referral tier check; ticket id ensures idempotency.
    await onWagerPlaced(app.log, user_id, PRIX_FLASH, 'flash', ticket.id);
    await recordAgentCommission(user_id, ticket.id, 'flash', PRIX_FLASH);

    const farming = await awardFlashFarming(app.log, user_id, PRIX_FLASH);

    return reply.send({
      ticket_id: ticket.id,
      new_balance: Number(user.balance_cdf) - PRIX_FLASH,
      farming,
    });
  });

  // POST admin tirage
  app.post('/api/flash/tirage', async (req, reply) => {
    const secret = env.FLASH_ADMIN_SECRET || '';
    const provided = String(req.headers['x-admin-secret'] || '');
    const a = Buffer.from(provided);
    const b = Buffer.from(secret);
    if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    try {
      const result = await executerTirageFlash();
      return reply.send(result);
    } catch (e: any) {
      return reply.code(500).send({ error: e?.message || 'Tirage failed' });
    }
  });

  /**
   * Admin-only: refund every pending Flash ticket and mark them as
   * cancelled. Used to clean up tickets that got stuck because a
   * scheduled draw never fired. Each refund goes through the same
   * idempotent ledger helper used elsewhere, so re-running the call is
   * safe (already-cancelled tickets are skipped, and the ledger
   * `idempotency_key` blocks any double credit).
   *
   * The ticket's contribution to the jackpot pot is also rolled back
   * so the pot does not stay artificially inflated by cancelled
   * tickets.
   */
  app.post('/api/flash/purge-pending', async (req, reply) => {
    const secret = env.FLASH_ADMIN_SECRET || '';
    const provided = String(req.headers['x-admin-secret'] || '');
    const a = Buffer.from(provided);
    const b = Buffer.from(secret);
    if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    try {
      // Atomic claim: flip every pending ticket to 'cancelled' and get
      // the rows back. Any concurrent draw will then see zero pending
      // tickets and become a no-op.
      const { data: claimed, error: claimErr } = await supabaseAdmin
        .from('flash_tickets')
        .update({ status: 'cancelled', gains_cdf: 0, jackpot_en_attente: false })
        .eq('status', 'pending')
        .select('id, user_id, prix_cdf');
      if (claimErr) return reply.code(500).send({ error: claimErr.message });

      const tickets = claimed ?? [];
      let refunded = 0;
      let totalRefundedCdf = 0;
      let potRollbackCdf = 0;
      const failures: Array<{ ticket_id: string; error: string }> = [];

      for (const t of tickets) {
        const price = Number(t.prix_cdf || 0);
        if (price <= 0) continue;
        try {
          const result = await recordLedgerEntry({
            user_id: String(t.user_id),
            direction: 'credit',
            amount: price,
            currency: 'CDF',
            reason: 'flash_ticket_cancel_refund',
            reference_type: 'flash_ticket',
            reference_id: String(t.id),
            idempotency_key: `flash:ticket:${t.id}:cancel:refund`,
          });
          if (result.applied || result.duplicate) {
            refunded += 1;
            totalRefundedCdf += price;
            // Roll back this ticket's jackpot contribution (50% of price).
            const contribution = Math.trunc(price / 2);
            if (contribution > 0) {
              await supabaseAdmin.rpc('increment_flash_jackpot', { delta: -contribution });
              potRollbackCdf += contribution;
            }
          }
        } catch (err: any) {
          failures.push({ ticket_id: String(t.id), error: err?.message || 'refund failed' });
        }
      }

      return reply.send({
        scanned: tickets.length,
        refunded,
        total_refunded_cdf: totalRefundedCdf,
        pot_rollback_cdf: potRollbackCdf,
        failures,
      });
    } catch (e: any) {
      return reply.code(500).send({ error: e?.message || 'Purge failed' });
    }
  });
};

export default flashRoutes;
