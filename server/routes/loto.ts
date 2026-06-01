import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import crypto, { timingSafeEqual } from 'node:crypto';
import { recordLedgerEntry } from '../lib/ledger.js';
import { env } from '../env.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { LotoTicketBodySchema } from '../lib/validation.js';
import { COMING_SOON_PAYLOAD, isCongoLotoEnabled } from '../lib/featureFlags.js';
import { onWagerPlaced } from '../lib/referral.js';

/**
 * Soft-disable guard for Congo Loto. When the feature flag is off we
 * return a 403 with `code: "COMING_SOON"` for every loto endpoint —
 * the frontend uses this signal to swap the screen for the premium
 * teaser. No DB rows are touched; flipping the env var brings the
 * product back instantly.
 */
async function congoLotoGuard(_req: FastifyRequest, reply: FastifyReply) {
  if (!isCongoLotoEnabled) {
    return reply.code(403).send(COMING_SOON_PAYLOAD);
  }
}

// provider_id sentinel used for internal (non-Unipesa) loto transactions
const LOTO_PROVIDER_ID = 0;

async function recordLotoTransaction(opts: {
  user_id: string;
  type: 'loto_ticket' | 'loto_payout';
  amount: number;
  reference?: string;
}) {
  const order_id = `loto-${opts.type}-${crypto.randomUUID()}`;
  const { error } = await supabaseAdmin.from('transactions').insert({
    user_id: opts.user_id,
    order_id,
    type: opts.type,
    amount: opts.amount,
    currency: 'CDF',
    provider_id: LOTO_PROVIDER_ID,
    status: 2, // success
    transaction_id: opts.reference ?? null,
  });
  if (error) {
    // Non-blocking: log but do not fail the gameplay flow
    console.error('[loto] transaction insert failed', error.message);
  }
}

const TICKET_PRICE_CDF = 2000;
const JACKPOT_CONTRIB_CDF = 1000;
const DEFAULT_JACKPOT_CDF = 5_000_000;

async function applyLotoJackpotDeltaIdempotent(
  eventKey: string,
  tirageId: string,
  deltaCdf: number,
): Promise<void> {
  const { error } = await supabaseAdmin.rpc('apply_loto_jackpot_delta_idempotent', {
    p_event_key: eventKey,
    p_tirage_id: tirageId,
    p_delta_cdf: deltaCdf,
  });
  if (error) throw new Error(error.message);
}

const PRIZE_TABLE: Record<number, number> = {
  5: 500_000,
  4: 50_000,
  3: 5_000,
  2: 1_000,
  1: 0,
  0: 0,
};


function isValidLotoNumbers(nums: unknown): nums is number[] {
  if (!Array.isArray(nums) || nums.length !== 6) return false;
  const set = new Set<number>();
  for (const n of nums) {
    if (!Number.isInteger(n)) return false;
    if ((n as number) < 1 || (n as number) > 49) return false;
    set.add(n as number);
  }
  return set.size === 6;
}

function drawSevenUniqueNumbers(): number[] {
  const picked = new Set<number>();
  while (picked.size < 7) {
    const buf = crypto.randomBytes(2);
    const v = (buf.readUInt16BE(0) % 49) + 1;
    picked.add(v);
  }
  return Array.from(picked);
}

export type ExecuterTirageLotoResult = {
  tirage_id: string;
  tickets_traites: number;
  pot_jackpot: number;
  jackpot_declenche: boolean;
};

/**
 * Logique partagée du tirage Loto :
 * - utilisée par la route POST /api/loto/tirage (admin)
 * - et par le cron quotidien à 20h00 DRC
 */
export async function executerTirageLoto(): Promise<ExecuterTirageLotoResult> {
  const all = drawSevenUniqueNumbers();
  const numeros = all.slice(0, 6).sort((a, b) => a - b);
  const complementaire = all[6];
  const ts = Date.now();
  const hash_pre = crypto
    .createHash('sha256')
    .update(JSON.stringify({ numeros, complementaire, ts }))
    .digest('hex');

  const jackpot = env.LOTO_JACKPOT_CDF ?? DEFAULT_JACKPOT_CDF;

  const { data: tirage, error: tirErr } = await supabaseAdmin
    .from('loto_tirages')
    .insert({ numeros, complementaire, jackpot, hash_pre })
    .select('*')
    .single();
  if (tirErr || !tirage) {
    throw new Error(tirErr?.message || 'Tirage insert failed');
  }

  // Lire pot jackpot
  const { data: jackpotRow } = await supabaseAdmin
    .from('loto_jackpot')
    .select('pot_cdf')
    .eq('id', 1)
    .single();
  const potActuel = Number(jackpotRow?.pot_cdf ?? 0);
  const SEUIL = env.LOTO_JACKPOT_CDF ?? DEFAULT_JACKPOT_CDF;
  let jackpotDispo = potActuel >= SEUIL;
  let jackpotPaye = false;

  function calculGains(nbBons: number, jackpotDisponible: boolean): number {
    if (nbBons === 6) return jackpotDisponible ? SEUIL : 0;
    if (nbBons === 5) return 500_000;
    if (nbBons === 4) return 50_000;
    if (nbBons === 3) return 5_000;
    if (nbBons === 2) return 1_000;
    return 0;
  }

  // Résoudre les jackpots en attente si le pot est maintenant suffisant
  if (jackpotDispo) {
    const { data: enAttente } = await supabaseAdmin
      .from('loto_tickets')
      .select('*')
      .eq('status', 'jackpot_attente')
      .eq('jackpot_en_attente', true);

    for (const ticket of enAttente ?? []) {
      await supabaseAdmin.rpc('loto_settle_ticket_payout_atomic', {
        p_ticket_id: ticket.id,
        p_status: 'gagnant',
        p_nb_bons: 6,
        p_gains_cdf: SEUIL,
        p_jackpot_en_attente: false,
        p_tirage_id: tirage.id,
        p_idempotency_key: `loto:payout:${ticket.id}`,
      });
      await applyLotoJackpotDeltaIdempotent(
        `loto:draw:${tirage.id}:jackpot-resolve:${ticket.id}`,
        tirage.id,
        -SEUIL,
      );
      await recordLotoTransaction({
        user_id: ticket.user_id,
        type: 'loto_payout',
        amount: SEUIL,
        reference: ticket.id,
      });
      jackpotPaye = true;

      // Le pot redescend : recalcule pour les suivants
      const { data: potRow } = await supabaseAdmin
        .from('loto_jackpot')
        .select('pot_cdf')
        .eq('id', 1)
        .single();
      jackpotDispo = Number(potRow?.pot_cdf ?? 0) >= SEUIL;
      if (!jackpotDispo) break;
    }
  }

  // Process pending tickets
  const { data: pending, error: pendErr } = await supabaseAdmin
    .from('loto_tickets')
    .select('id, user_id, numeros')
    .eq('status', 'pending');
  if (pendErr) throw new Error(pendErr.message);

  const winSet = new Set<number>(numeros);
  let processed = 0;

  for (const t of pending || []) {
    const tNums: number[] = Array.isArray(t.numeros) ? t.numeros : [];
    const nb_bons = tNums.reduce((acc, n) => acc + (winSet.has(n) ? 1 : 0), 0);
    const isSix = nb_bons === 6;
    const gains_cdf = calculGains(nb_bons, jackpotDispo);
    const jackpot_en_attente = isSix && !jackpotDispo;

    let status: 'gagnant' | 'perdant' | 'jackpot_attente';
    if (jackpot_en_attente) {
      status = 'jackpot_attente';
    } else if (gains_cdf > 0) {
      status = 'gagnant';
    } else {
      status = 'perdant';
    }

    if (gains_cdf > 0 && !jackpot_en_attente) {
      await supabaseAdmin.rpc('loto_settle_ticket_payout_atomic', {
        p_ticket_id: t.id,
        p_status: status,
        p_nb_bons: nb_bons,
        p_gains_cdf: gains_cdf,
        p_jackpot_en_attente: jackpot_en_attente,
        p_tirage_id: tirage.id,
        p_idempotency_key: `loto:payout:${t.id}`,
      });
      await recordLotoTransaction({
        user_id: t.user_id,
        type: 'loto_payout',
        amount: gains_cdf,
        reference: t.id,
      });
      if (isSix) {
        jackpotPaye = true;
        await applyLotoJackpotDeltaIdempotent(
          `loto:draw:${tirage.id}:jackpot-decrement:${t.id}`,
          tirage.id,
          -SEUIL,
        );
      }
    } else {
      await supabaseAdmin
        .from('loto_tickets')
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

  return {
    tirage_id: tirage.id,
    tickets_traites: processed,
    pot_jackpot: potActuel,
    jackpot_declenche: jackpotPaye,
  };
}

const lotoRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Soft-disable: every Congo Loto endpoint short-circuits with
  // `COMING_SOON` when the feature flag is off. Placed as a single
  // onRequest hook so we cannot accidentally miss a new route.
  app.addHook('onRequest', congoLotoGuard);

  // GET latest tirage
  app.get('/api/loto/tirage/latest', async (_req, reply) => {
    const { data, error } = await supabaseAdmin
      .from('loto_tirages')
      .select('*')
      .order('drawn_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return reply.code(500).send({ error: error.message });
    const { data: jackpotRow } = await supabaseAdmin
      .from('loto_jackpot')
      .select('pot_cdf')
      .eq('id', 1)
      .single();
    return reply.send({
      tirage: data || null,
      pot_cdf: Number(jackpotRow?.pot_cdf ?? 0),
    });
  });

  // GET my tickets (auth via Bearer <user_id>)
  app.get('/api/loto/mes-tickets', { preHandler: app.requireAuth }, async (req, reply) => {
    const user_id = req.user.id;
    const { data, error } = await supabaseAdmin
      .from('loto_tickets')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ tickets: data || [] });
  });

  // POST buy ticket
  app.post('/api/loto/ticket', { preHandler: app.requireAuth }, async (req, reply) => {
    const user_id = req.user.id;
    const parsed = LotoTicketBodySchema.safeParse(req.body);
    const numeros = parsed.success ? parsed.data.numeros : undefined;
    if (!isValidLotoNumbers(numeros)) {
      return reply.code(400).send({ error: 'numeros invalides : 6 entiers distincts entre 1 et 49' });
    }

    // Sécurité lancement : seuil minimum de tickets cumulés
    const MIN = Number(process.env.LOTO_MIN_TICKETS ?? 0);
    if (MIN > 0) {
      const { count } = await supabaseAdmin
        .from('loto_tickets')
        .select('*', { count: 'exact', head: true });
      if ((count ?? 0) < MIN) {
        return reply
          .code(503)
          .send({ error: 'Lancement en cours', message: 'Le loto ouvre bientôt, revenez dans quelques jours !' });
      }
    }

    const { data: user, error: userErr } = await supabaseAdmin
      .from('users')
      .select('balance_cdf')
      .eq('id', user_id)
      .single();
    if (userErr || !user) return reply.code(404).send({ error: 'User not found' });
    if (Number(user.balance_cdf) < TICKET_PRICE_CDF) {
      return reply.code(400).send({ error: 'Solde insuffisant' });
    }

    // Debit
    const ticket_id = crypto.randomUUID();
    await recordLedgerEntry({
      user_id,
      direction: 'debit',
      amount: TICKET_PRICE_CDF,
      currency: 'CDF',
      reason: 'loto_ticket_buy',
      reference_type: 'loto_ticket',
      reference_id: ticket_id,
      idempotency_key: `loto:ticket:${ticket_id}:buy`,
    });

    const { data: ticket, error: insErr } = await supabaseAdmin
      .from('loto_tickets')
      .insert({
        user_id,
        numeros: numeros as number[],
        prix_cdf: TICKET_PRICE_CDF,
        status: 'pending',
        id: ticket_id,
      })
      .select('id')
      .single();

    if (insErr || !ticket) {
      // refund on insert failure
      await recordLedgerEntry({
        user_id,
        direction: 'credit',
        amount: TICKET_PRICE_CDF,
        currency: 'CDF',
        reason: 'loto_ticket_buy_refund',
        reference_type: 'loto_ticket',
        reference_id: ticket_id,
        idempotency_key: `loto:ticket:${ticket_id}:buy:refund`,
      });
      return reply.code(500).send({ error: insErr?.message || 'Insert failed' });
    }

    // Feed jackpot pool
    await supabaseAdmin.rpc('increment_jackpot', { delta: JACKPOT_CONTRIB_CDF });

    // Record purchase in transactions history
    await recordLotoTransaction({
      user_id,
      type: 'loto_ticket',
      amount: TICKET_PRICE_CDF,
      reference: ticket.id,
    });

    // Best-effort referral tier check. The wager_id is the ticket id —
    // stable and unique, so retries / double-submits are deduplicated
    // server-side via the `referral_wager_events` table.
    await onWagerPlaced(app.log, user_id, TICKET_PRICE_CDF, 'loto', ticket.id);

    return reply.send({
      ticket_id: ticket.id,
      new_balance: Number(user.balance_cdf) - TICKET_PRICE_CDF,
    });
  });

  // POST admin tirage
  app.post('/api/loto/tirage', async (req, reply) => {
    const secret = env.LOTO_ADMIN_SECRET || '';
    const provided = String(req.headers['x-admin-secret'] || '');
    const a = Buffer.from(provided);
    const b = Buffer.from(secret);
    if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    try {
      const result = await executerTirageLoto();
      return reply.send(result);
    } catch (e: any) {
      return reply.code(500).send({ error: e?.message || 'Tirage failed' });
    }
  });
};

export default lotoRoutes;
