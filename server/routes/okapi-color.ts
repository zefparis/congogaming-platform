import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import crypto from 'node:crypto';
import { recordLedgerEntry } from '../lib/ledger.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { OkapiColorTicketBodySchema } from '../lib/validation.js';
import { onWagerPlaced } from '../lib/referral.js';
import { env } from '../env.js';

// =============================================================
// Config — source de vérité backend. Jamais exposée comme telle
// au frontend pour le calcul des gains.
// =============================================================
export const OKAPI_COLOR_CONFIG = {
  ticketPriceCdf:         1000,
  get jackpotContributionCdf() { return env.OKAPI_COLOR_CONTRIBUTION_CDF ?? 50; },
  get jackpotCdf()            { return env.OKAPI_COLOR_JACKPOT_CDF         ?? 250_000; },
  numbersRange:            24,
  playerPickCount:          6,
  redDrawCount:             6,
  goldDrawCount:            4,
} as const;

// =============================================================
// RNG — rejection sampling pour distribution uniforme parfaite
// Utilise crypto.randomBytes (CSPRNG).
// =============================================================
export function drawUniqueNumbers(
  count: number,
  min: number,
  max: number,
  exclude: Set<number> = new Set(),
): number[] {
  const range = max - min + 1;
  const available = range - exclude.size;
  if (count > available) {
    throw new Error(`Cannot draw ${count} unique numbers from ${available} available`);
  }

  const picked = new Set<number>();
  const bytesNeeded = Math.ceil(Math.log2(range) / 8) + 1;
  const cap = Math.floor(256 ** bytesNeeded / range) * range; // rejection threshold

  while (picked.size < count) {
    const buf = crypto.randomBytes(bytesNeeded);
    let val = 0;
    for (let i = 0; i < bytesNeeded; i++) val = val * 256 + buf[i];
    if (val >= cap) continue; // rejection to eliminate modulo bias
    const n = (val % range) + min;
    if (!exclude.has(n) && !picked.has(n)) picked.add(n);
  }

  return Array.from(picked).sort((a, b) => a - b);
}

// =============================================================
// Validation ticket joueur
// =============================================================
export function isValidOkapiColorNumbers(nums: unknown): nums is number[] {
  if (!Array.isArray(nums)) return false;
  if (nums.length !== OKAPI_COLOR_CONFIG.playerPickCount) return false;
  const set = new Set<number>();
  for (const n of nums) {
    if (!Number.isInteger(n)) return false;
    if ((n as number) < 1 || (n as number) > OKAPI_COLOR_CONFIG.numbersRange) return false;
    set.add(n as number);
  }
  return set.size === OKAPI_COLOR_CONFIG.playerPickCount;
}

// =============================================================
// Scoring
// =============================================================
export function calculateOkapiColorHits(
  playerNumbers: number[],
  redNumbers: number[],
  goldNumbers: number[],
): { redHits: number; goldHits: number; totalHits: number } {
  const redSet  = new Set(redNumbers);
  const goldSet = new Set(goldNumbers);
  let redHits  = 0;
  let goldHits = 0;
  for (const n of playerNumbers) {
    if (redSet.has(n))  redHits++;
    if (goldSet.has(n)) goldHits++;
  }
  return { redHits, goldHits, totalHits: redHits + goldHits };
}

// =============================================================
// Payout table — EV calibrée à ~62 % de taux de retour
//
// Probabilités calculées via distribution hypergéométrique :
// P(r rouges, g ors) = C(6,r)×C(4,g)×C(14,6-r-g) / C(24,6)
// avec C(24,6) = 134 596
//
// EV théorique (jackpot inclus, pot suffisant) ≈ 622 CDF / 1000 CDF
// Taux de retour ≈ 62.2 % | Marge brute ≈ 37.8 %
// =============================================================
export function calculateOkapiColorPayout(
  redHits: number,
  goldHits: number,
  jackpotAvailable: boolean,
): { gainsCdf: number; jackpotPending: boolean } {
  // Jackpot : 6 rouges
  if (redHits === 6) {
    if (jackpotAvailable) return { gainsCdf: OKAPI_COLOR_CONFIG.jackpotCdf, jackpotPending: false };
    return { gainsCdf: 0, jackpotPending: true };
  }

  // 5 rouges
  if (redHits === 5) {
    if (goldHits >= 1) return { gainsCdf: 50_000, jackpotPending: false };
    return { gainsCdf: 25_000, jackpotPending: false };
  }

  // 4 rouges
  if (redHits === 4) {
    if (goldHits >= 2) return { gainsCdf: 15_000, jackpotPending: false };
    return { gainsCdf: 8_000, jackpotPending: false };
  }

  // 3 rouges
  if (redHits === 3) {
    if (goldHits >= 3) return { gainsCdf: 5_000,  jackpotPending: false };
    if (goldHits >= 1) return { gainsCdf: 2_500,  jackpotPending: false };
    return { gainsCdf: 1_500, jackpotPending: false };
  }

  // 2 rouges
  if (redHits === 2) {
    if (goldHits >= 3) return { gainsCdf: 1_000, jackpotPending: false };
    if (goldHits === 2) return { gainsCdf: 1_000, jackpotPending: false };
    if (goldHits >= 1) return { gainsCdf: 500,   jackpotPending: false };
    return { gainsCdf: 500, jackpotPending: false };
  }

  return { gainsCdf: 0, jackpotPending: false };
}

// =============================================================
// Tirage — logique partagée (admin route + cron futur)
// =============================================================
export type TirageOkapiColorResult = {
  tirageId:       string;
  rouges:         number[];
  ors:            number[];
  processed:      number;
  winners:        number;
  jackpotPaid:    boolean;
  totalPaidCdf:   number;
};

export async function executerTirageOkapiColor(): Promise<TirageOkapiColorResult> {
  const rouges = drawUniqueNumbers(
    OKAPI_COLOR_CONFIG.redDrawCount,
    1,
    OKAPI_COLOR_CONFIG.numbersRange,
  );
  const ors = drawUniqueNumbers(
    OKAPI_COLOR_CONFIG.goldDrawCount,
    1,
    OKAPI_COLOR_CONFIG.numbersRange,
    new Set(rouges),
  );

  const ts = Date.now();
  const hash_pre = crypto
    .createHash('sha256')
    .update(JSON.stringify({ rouges, ors, ts }))
    .digest('hex');

  const { data: tirage, error: tirErr } = await supabaseAdmin
    .from('okapi_color_tirages')
    .insert({ numeros_rouges: rouges, numeros_or: ors, hash_pre })
    .select('*')
    .single();
  if (tirErr || !tirage) {
    throw new Error(tirErr?.message || 'Tirage insert failed');
  }

  // --- Lire le pot actuel ---
  const { data: jackpotRow } = await supabaseAdmin
    .from('okapi_color_jackpot')
    .select('pot_cdf')
    .eq('id', 1)
    .single();
  const potActuel = Number(jackpotRow?.pot_cdf ?? 0);
  let jackpotDispo = potActuel >= OKAPI_COLOR_CONFIG.jackpotCdf;
  let jackpotPaid  = false;
  let totalPaidCdf = 0;

  // --- Résoudre les jackpots en attente (FIFO par created_at) ---
  if (jackpotDispo) {
    const { data: enAttente } = await supabaseAdmin
      .from('okapi_color_tickets')
      .select('id, user_id')
      .eq('status', 'jackpot_attente')
      .eq('jackpot_en_attente', true)
      .order('created_at', { ascending: true });

    for (const ticket of enAttente ?? []) {
      if (!jackpotDispo) break;
      await supabaseAdmin.rpc('okapi_color_settle_ticket_payout_atomic', {
        p_ticket_id:         ticket.id,
        p_status:            'gagnant',
        p_nb_rouges:         6,
        p_nb_or:             0,
        p_gains_cdf:         OKAPI_COLOR_CONFIG.jackpotCdf,
        p_jackpot_en_attente: false,
        p_tirage_id:         tirage.id,
        p_idempotency_key:   `okapi-color:payout:${ticket.id}`,
      });
      await supabaseAdmin.rpc('increment_okapi_color_jackpot', {
        delta: -OKAPI_COLOR_CONFIG.jackpotCdf,
      });
      jackpotPaid   = true;
      totalPaidCdf += OKAPI_COLOR_CONFIG.jackpotCdf;

      const { data: potRow } = await supabaseAdmin
        .from('okapi_color_jackpot')
        .select('pot_cdf')
        .eq('id', 1)
        .single();
      jackpotDispo = Number(potRow?.pot_cdf ?? 0) >= OKAPI_COLOR_CONFIG.jackpotCdf;
    }
  }

  // --- Traiter les tickets pending ---
  const { data: pending, error: pendErr } = await supabaseAdmin
    .from('okapi_color_tickets')
    .select('id, user_id, numeros')
    .eq('status', 'pending');
  if (pendErr) throw new Error(pendErr.message);

  let processed = 0;
  let winners   = 0;

  for (const t of pending ?? []) {
    const playerNums: number[] = Array.isArray(t.numeros) ? t.numeros : [];
    const { redHits, goldHits } = calculateOkapiColorHits(playerNums, rouges, ors);
    const { gainsCdf, jackpotPending } = calculateOkapiColorPayout(
      redHits,
      goldHits,
      jackpotDispo,
    );

    let status: 'gagnant' | 'perdant' | 'jackpot_attente';
    if (jackpotPending) {
      status = 'jackpot_attente';
    } else if (gainsCdf > 0) {
      status = 'gagnant';
    } else {
      status = 'perdant';
    }

    if (gainsCdf > 0 && !jackpotPending) {
      await supabaseAdmin.rpc('okapi_color_settle_ticket_payout_atomic', {
        p_ticket_id:          t.id,
        p_status:             status,
        p_nb_rouges:          redHits,
        p_nb_or:              goldHits,
        p_gains_cdf:          gainsCdf,
        p_jackpot_en_attente: false,
        p_tirage_id:          tirage.id,
        p_idempotency_key:    `okapi-color:payout:${t.id}`,
      });
      // Si 6 rouges payés : décrémenter le pot
      if (redHits === 6) {
        jackpotPaid   = true;
        totalPaidCdf += gainsCdf;
        await supabaseAdmin.rpc('increment_okapi_color_jackpot', {
          delta: -OKAPI_COLOR_CONFIG.jackpotCdf,
        });
        const { data: potRow } = await supabaseAdmin
          .from('okapi_color_jackpot')
          .select('pot_cdf')
          .eq('id', 1)
          .single();
        jackpotDispo = Number(potRow?.pot_cdf ?? 0) >= OKAPI_COLOR_CONFIG.jackpotCdf;
      } else {
        totalPaidCdf += gainsCdf;
      }
      winners++;
    } else {
      // Ticket perdant ou jackpot_attente — update sans ledger
      await supabaseAdmin
        .from('okapi_color_tickets')
        .update({
          status,
          nb_rouges:           redHits,
          nb_or:               goldHits,
          total_bons:          redHits + goldHits,
          gains_cdf:           gainsCdf,
          jackpot_en_attente:  jackpotPending,
          tirage_id:           tirage.id,
          settled_at:          status === 'perdant' ? new Date().toISOString() : null,
        })
        .eq('id', t.id);
    }

    processed++;
  }

  if (jackpotPaid) {
    await supabaseAdmin
      .from('okapi_color_tirages')
      .update({ jackpot_paye: true })
      .eq('id', tirage.id);
  }

  return { tirageId: tirage.id, rouges, ors, processed, winners, jackpotPaid, totalPaidCdf };
}

// =============================================================
// Routes Fastify
// =============================================================
const okapiColorRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {

  function featureGuard(reply: any): boolean {
    if (!env.OKAPI_COLOR_ENABLED) {
      reply.code(404).send({ error: 'Feature not available' });
      return false;
    }
    return true;
  }

  // ----------------------------------------------------------
  // GET /api/okapi-color/latest-draws
  // Public — derniers tirages (sans données sensibles)
  // ----------------------------------------------------------
  app.get('/api/okapi-color/latest-draws', async (_req, reply) => {
    if (!featureGuard(reply)) return;
    const { data, error } = await supabaseAdmin
      .from('okapi_color_tirages')
      .select('id, numeros_rouges, numeros_or, drawn_at, jackpot_paye')
      .order('drawn_at', { ascending: false })
      .limit(10);
    if (error) return reply.code(500).send({ error: error.message });
    const { data: jackpotRow } = await supabaseAdmin
      .from('okapi_color_jackpot')
      .select('pot_cdf')
      .eq('id', 1)
      .single();
    return reply.send({
      tirages:  data || [],
      pot_cdf:  Number(jackpotRow?.pot_cdf ?? 0),
      config: {
        ticketPriceCdf:  OKAPI_COLOR_CONFIG.ticketPriceCdf,
        jackpotCdf:      OKAPI_COLOR_CONFIG.jackpotCdf,
        numbersRange:    OKAPI_COLOR_CONFIG.numbersRange,
        playerPickCount: OKAPI_COLOR_CONFIG.playerPickCount,
        redDrawCount:    OKAPI_COLOR_CONFIG.redDrawCount,
        goldDrawCount:   OKAPI_COLOR_CONFIG.goldDrawCount,
      },
    });
  });

  // ----------------------------------------------------------
  // GET /api/okapi-color/history
  // Auth required — tickets du joueur connecté uniquement
  // ----------------------------------------------------------
  app.get('/api/okapi-color/history', { preHandler: app.requireAuth }, async (req, reply) => {
    if (!featureGuard(reply)) return;
    const user_id = req.user.id; // jamais depuis body
    const { data, error } = await supabaseAdmin
      .from('okapi_color_tickets')
      .select('id, numeros, prix_cdf, status, nb_rouges, nb_or, total_bons, gains_cdf, jackpot_en_attente, tirage_id, created_at, settled_at')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ tickets: data || [] });
  });

  // ----------------------------------------------------------
  // POST /api/okapi-color/tickets
  // Auth required — achat ticket
  // ----------------------------------------------------------
  app.post('/api/okapi-color/tickets', { preHandler: app.requireAuth }, async (req, reply) => {
    if (!featureGuard(reply)) return;

    const user_id = req.user.id; // jamais depuis body

    const parsed = OkapiColorTicketBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Corps invalide', detail: parsed.error.errors });
    }
    const { numeros } = parsed.data;

    if (!isValidOkapiColorNumbers(numeros)) {
      return reply.code(400).send({
        error: 'numeros invalides : 6 entiers distincts entre 1 et 24',
      });
    }

    // Vérifier le solde
    const { data: user, error: userErr } = await supabaseAdmin
      .from('users')
      .select('balance_cdf')
      .eq('id', user_id)
      .single();
    if (userErr || !user) return reply.code(404).send({ error: 'User not found' });
    if (Number(user.balance_cdf) < OKAPI_COLOR_CONFIG.ticketPriceCdf) {
      return reply.code(400).send({ error: 'Solde insuffisant' });
    }

    const ticket_id = crypto.randomUUID();

    // Débiter le wallet (idempotent)
    await recordLedgerEntry({
      user_id,
      direction:       'debit',
      amount:          OKAPI_COLOR_CONFIG.ticketPriceCdf,
      currency:        'CDF',
      reason:          'okapi_color_ticket_buy',
      reference_type:  'okapi_color_ticket',
      reference_id:    ticket_id,
      idempotency_key: `okapi-color:ticket:${ticket_id}:buy`,
    });

    // Insérer le ticket
    const { data: ticket, error: insErr } = await supabaseAdmin
      .from('okapi_color_tickets')
      .insert({
        id:       ticket_id,
        user_id,
        numeros:  numeros as number[],
        prix_cdf: OKAPI_COLOR_CONFIG.ticketPriceCdf,
        status:   'pending',
      })
      .select('id')
      .single();

    // Remboursement automatique si l'insertion échoue
    if (insErr || !ticket) {
      await recordLedgerEntry({
        user_id,
        direction:       'credit',
        amount:          OKAPI_COLOR_CONFIG.ticketPriceCdf,
        currency:        'CDF',
        reason:          'okapi_color_ticket_buy_refund',
        reference_type:  'okapi_color_ticket',
        reference_id:    ticket_id,
        idempotency_key: `okapi-color:ticket:${ticket_id}:buy:refund`,
      });
      return reply.code(500).send({ error: insErr?.message || 'Insert failed' });
    }

    // Contribution jackpot
    await supabaseAdmin.rpc('increment_okapi_color_jackpot', {
      delta: OKAPI_COLOR_CONFIG.jackpotContributionCdf,
    });

    // Référral (best-effort)
    await onWagerPlaced(app.log, user_id, OKAPI_COLOR_CONFIG.ticketPriceCdf, 'okapi_color', ticket.id);

    return reply.code(201).send({
      ticket_id:   ticket.id,
      new_balance: Number(user.balance_cdf) - OKAPI_COLOR_CONFIG.ticketPriceCdf,
    });
  });

  // ----------------------------------------------------------
  // POST /api/okapi-color/draw
  // Admin only — lancer un tirage
  // ----------------------------------------------------------
  app.post('/api/okapi-color/draw', async (req, reply) => {
    if (!featureGuard(reply)) return;
    const adminSecret = env.OKAPI_COLOR_ADMIN_SECRET || '';
    const provided    = req.headers['x-admin-secret'];
    if (!adminSecret || provided !== adminSecret) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    try {
      const result = await executerTirageOkapiColor();
      return reply.send(result);
    } catch (e: any) {
      return reply.code(500).send({ error: e?.message || 'Tirage failed' });
    }
  });

  // ----------------------------------------------------------
  // POST /api/okapi-color/purge-pending
  // Admin only — annuler et rembourser les tickets bloqués
  // ----------------------------------------------------------
  app.post('/api/okapi-color/purge-pending', async (req, reply) => {
    if (!featureGuard(reply)) return;
    const adminSecret = env.OKAPI_COLOR_ADMIN_SECRET || '';
    const provided    = req.headers['x-admin-secret'];
    if (!adminSecret || provided !== adminSecret) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    try {
      // Claim atomique : flip tous les tickets pending → cancelled
      const { data: claimed, error: claimErr } = await supabaseAdmin
        .from('okapi_color_tickets')
        .update({ status: 'cancelled', gains_cdf: 0, jackpot_en_attente: false })
        .eq('status', 'pending')
        .select('id, user_id, prix_cdf');
      if (claimErr) return reply.code(500).send({ error: claimErr.message });

      const tickets = claimed ?? [];
      let refunded        = 0;
      let totalRefundedCdf = 0;
      let potRollbackCdf  = 0;
      const failures: Array<{ ticket_id: string; error: string }> = [];

      for (const t of tickets) {
        const price = Number(t.prix_cdf || 0);
        if (price <= 0) continue;
        try {
          const result = await recordLedgerEntry({
            user_id:         String(t.user_id),
            direction:       'credit',
            amount:          price,
            currency:        'CDF',
            reason:          'okapi_color_ticket_cancel_refund',
            reference_type:  'okapi_color_ticket',
            reference_id:    String(t.id),
            idempotency_key: `okapi-color:ticket:${t.id}:cancel:refund`,
          });
          if (result.applied || result.duplicate) {
            refunded++;
            totalRefundedCdf += price;
            const contribution = OKAPI_COLOR_CONFIG.jackpotContributionCdf;
            if (contribution > 0) {
              // Best-effort : si le pot est déjà à 0 on ignore l'erreur
              try {
                await supabaseAdmin.rpc('increment_okapi_color_jackpot', { delta: -contribution });
              } catch (_) { /* intentionally ignored */ }
              potRollbackCdf += contribution;
            }
          }
        } catch (err: any) {
          failures.push({ ticket_id: String(t.id), error: err?.message || 'refund failed' });
        }
      }

      return reply.send({
        scanned:           tickets.length,
        refunded,
        total_refunded_cdf: totalRefundedCdf,
        pot_rollback_cdf:   potRollbackCdf,
        failures,
      });
    } catch (e: any) {
      return reply.code(500).send({ error: e?.message || 'Purge failed' });
    }
  });
};

export default okapiColorRoutes;
