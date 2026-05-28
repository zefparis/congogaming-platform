import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import crypto from 'node:crypto';
import { recordLedgerEntry } from '../lib/ledger.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { FlashTicketBodySchema } from '../lib/validation.js';

const PRIX_FLASH = 1000;
const JACKPOT_CONTRIBUTION = 500; // 50% du ticket
const FLASH_SEUIL = Number(process.env.FLASH_JACKPOT_CDF ?? 250_000);

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
      await supabaseAdmin.rpc('increment_flash_jackpot', { delta: -FLASH_SEUIL });
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
      if (isFive) {
        jackpotPaye = true;
        await supabaseAdmin.rpc('increment_flash_jackpot', { delta: -FLASH_SEUIL });
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
      return reply.code(400).send({ error: 'numeros invalides : 5 entiers distincts entre 1 et 20' });
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
          .send({ error: 'Lancement en cours', message: 'Le loto Flash ouvre bientôt, revenez dans quelques jours !' });
      }
    }

    const { data: user, error: userErr } = await supabaseAdmin
      .from('users')
      .select('balance_cdf')
      .eq('id', user_id)
      .single();
    if (userErr || !user) return reply.code(404).send({ error: 'User not found' });
    if (Number(user.balance_cdf) < PRIX_FLASH) {
      return reply.code(400).send({ error: 'Solde insuffisant' });
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

    return reply.send({
      ticket_id: ticket.id,
      new_balance: Number(user.balance_cdf) - PRIX_FLASH,
    });
  });

  // POST admin tirage
  app.post('/api/flash/tirage', async (req, reply) => {
    const adminSecret = process.env.FLASH_ADMIN_SECRET || '';
    const provided = req.headers['x-admin-secret'];
    if (!adminSecret || provided !== adminSecret) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    try {
      const result = await executerTirageFlash();
      return reply.send(result);
    } catch (e: any) {
      return reply.code(500).send({ error: e?.message || 'Tirage failed' });
    }
  });
};

export default flashRoutes;
