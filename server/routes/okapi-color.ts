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
    if (goldHits >= 2) return { gainsCdf: 1_000, jackpotPending: false };
    return { gainsCdf: 500, jackpotPending: false };
  }

  return { gainsCdf: 0, jackpotPending: false };
}

// =============================================================
// State machine — intervalles configurables (défaut : 10 min)
// Slot aligné sur UTC. Tirage à la fin du slot.
// =============================================================
export function getIntervalSecs()    { return  env.OKAPI_COLOR_DRAW_INTERVAL_SECONDS     ?? 600; }
function getIntervalMs()       { return getIntervalSecs() * 1000; }
export function getCloseBeforeSecs() { return  env.OKAPI_COLOR_CLOSE_BEFORE_SECONDS      ??  40; }
function getCloseBeforeMs()    { return getCloseBeforeSecs() * 1000; }
export function getResultDisplaySecs(){ return  env.OKAPI_COLOR_RESULT_DISPLAY_SECONDS    ?? 130; }
// Drawing window must be >= the TV ball animation (~35s). Defaults to 40s so the
// status stays 'drawing' until the animation finishes, then flips to 'result'.
export function getDrawingWindowSecs() { return env.OKAPI_COLOR_DRAWING_WINDOW_SECONDS ?? 40; }

// -------------------------------------------------------------
// Idempotency / lock key builders (pure — unit-testable)
// -------------------------------------------------------------
export function buildRecoveryLockKey(slotKey: string): string {
  return `oc:recover:${slotKey}`;
}
export function buildJackpotDecrementEventKey(tirageId: string, ticketId: string): string {
  return `okapi-color:draw:${tirageId}:jackpot-decrement:${ticketId}`;
}
export function buildJackpotResolveEventKey(ticketId: string): string {
  return `okapi-color:jackpot-resolve:${ticketId}`;
}

// Admin secret cloisonné : Okapi Color utilise SON propre secret, jamais
// celui du Loto. Helper pur pour pouvoir le tester sans booter le serveur.
export function resolveOkapiColorAdminSecret(e: { OKAPI_COLOR_ADMIN_SECRET?: string } = env): string {
  return e.OKAPI_COLOR_ADMIN_SECRET ?? '';
}

// Résout le slot à tirer. Si slotKey est fourni explicitement, il est utilisé
// tel quel (récupération/manuel). Sinon on retombe sur le slot qui vient de se
// fermer (slot précédent), comportement cron historique.
export function resolveDrawSlotKey(
  options: { slotKey?: string | number } = {},
  now: Date = new Date(),
): string {
  if (options.slotKey != null && String(options.slotKey).length > 0) {
    return String(options.slotKey);
  }
  const iv         = getIntervalMs();
  const prevSlotMs = Math.floor(now.getTime() / iv) * iv - iv;
  return formatSlotKey(new Date(prevSlotMs));
}

function formatSlotKey(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm   = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd   = String(d.getUTCDate()).padStart(2, '0');
  const hh   = String(d.getUTCHours()).padStart(2, '0');
  const min  = String(d.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

export function getOkapiColorSlotBoundaries(at: Date = new Date()): {
  slotStart: Date; drawAt: Date; closeAt: Date; slotKey: string;
} {
  const iv       = getIntervalMs();
  const t        = at.getTime();
  const startMs  = Math.floor(t / iv) * iv;
  const drawMs   = startMs + iv;
  return {
    slotStart: new Date(startMs),
    drawAt:    new Date(drawMs),
    closeAt:   new Date(drawMs - getCloseBeforeMs()),
    slotKey:   formatSlotKey(new Date(startMs)),
  };
}

export function getOkapiColorSlotKey(at: Date = new Date()): string {
  return getOkapiColorSlotBoundaries(at).slotKey;
}

export type OkapiColorDrawState = 'open' | 'closing' | 'drawing' | 'result';

export function computeOkapiColorState(
  now: Date = new Date(),
  secsSinceLastDraw: number = Infinity,
): { state: OkapiColorDrawState; slotKey: string; drawAt: Date; closeAt: Date; secondsRemaining: number } {
  const { slotKey, drawAt, closeAt } = getOkapiColorSlotBoundaries(now);
  const resultSecs  = getResultDisplaySecs();
  const drawingSecs = getDrawingWindowSecs();

  let state: OkapiColorDrawState;
  if      (secsSinceLastDraw <= drawingSecs) state = 'drawing';
  else if (secsSinceLastDraw <= resultSecs)  state = 'result';
  else if (now.getTime() >= closeAt.getTime()) state = 'closing';
  else                                       state = 'open';

  return {
    state, slotKey, drawAt, closeAt,
    secondsRemaining: Math.max(0, Math.round((drawAt.getTime() - now.getTime()) / 1000)),
  };
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
  resumed?:       boolean;
  alreadyComplete?: boolean;
};

export type DrawReason = 'cron' | 'manual' | 'recovery';

export interface ExecuterTirageOptions {
  // Slot exact à tirer. Si fourni, il est utilisé tel quel (récupération /
  // manuel) — on ne recalcule jamais le slot depuis `now`.
  slotKey?:     string | number;
  reason?:      DrawReason;
  // Si un tirage existe déjà pour le slot, reprendre le settlement des tickets
  // encore pending au lieu de lever une erreur.
  forceResume?: boolean;
}

// Décrément (ou crédit) jackpot idempotent : la RPC insère un event_key unique
// et n'applique le delta qu'une seule fois. Une relance (resume après crash)
// avec la même event_key est un no-op → jamais de double décrément.
async function applyJackpotDeltaIdempotent(
  eventKey: string,
  tirageId: string,
  deltaCdf: number,
): Promise<void> {
  const { error } = await supabaseAdmin.rpc('okapi_color_apply_jackpot_delta_idempotent', {
    p_event_key: eventKey,
    p_tirage_id: tirageId,
    p_delta_cdf: deltaCdf,
  });
  if (error) throw new Error(error.message);
}

export async function executerTirageOkapiColor(
  options: ExecuterTirageOptions = {},
): Promise<TirageOkapiColorResult> {
  const forceResume = options.forceResume ?? false;
  const now         = new Date();
  // Slot explicite si fourni, sinon slot qui vient de se fermer (comportement cron).
  const slotKey     = resolveDrawSlotKey(options, now);

  // Un tirage existe-t-il déjà pour ce slot ?
  const { data: existingTirage, error: existingErr } = await supabaseAdmin
    .from('okapi_color_tirages')
    .select('id, numeros_rouges, numeros_or, jackpot_paye')
    .eq('slot_key', slotKey)
    .maybeSingle();
  if (existingErr) {
    throw new Error(existingErr.message);
  }

  let tirageId: string;
  let rouges:   number[];
  let ors:      number[];
  let resumed   = false;

  if (existingTirage) {
    // Combien de tickets restent à régler sur ce slot ?
    const { count: pendingForSlot, error: pendCountErr } = await supabaseAdmin
      .from('okapi_color_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .eq('slot_key', slotKey);
    if (pendCountErr) throw new Error(pendCountErr.message);

    // Tirage déjà fait ET tout est réglé → no-op propre (pas d'erreur brutale).
    if (!forceResume && (pendingForSlot ?? 0) === 0) {
      return {
        tirageId:        existingTirage.id,
        rouges:          existingTirage.numeros_rouges,
        ors:             existingTirage.numeros_or,
        processed:       0,
        winners:         0,
        jackpotPaid:     existingTirage.jackpot_paye,
        totalPaidCdf:    0,
        resumed:         false,
        alreadyComplete: true,
      };
    }

    // Reprise : on REUTILISE les numéros déjà tirés (jamais de nouveau RNG).
    tirageId = existingTirage.id;
    rouges   = existingTirage.numeros_rouges;
    ors      = existingTirage.numeros_or;
    resumed  = true;
  } else {
    // Nouveau tirage.
    rouges = drawUniqueNumbers(OKAPI_COLOR_CONFIG.redDrawCount, 1, OKAPI_COLOR_CONFIG.numbersRange);
    ors    = drawUniqueNumbers(OKAPI_COLOR_CONFIG.goldDrawCount, 1, OKAPI_COLOR_CONFIG.numbersRange, new Set(rouges));

    const hash_pre = crypto
      .createHash('sha256')
      .update(JSON.stringify({ rouges, ors, ts: now.getTime() }))
      .digest('hex');

    const { data: tirage, error: tirErr } = await supabaseAdmin
      .from('okapi_color_tirages')
      .insert({
        numeros_rouges: rouges,
        numeros_or:     ors,
        hash_pre,
        slot_key:       slotKey,
        draw_at:        now.toISOString(),
        channel:        'public',
      })
      .select('id')
      .single();
    if (tirErr || !tirage) {
      throw new Error(tirErr?.message || 'Tirage insert failed');
    }
    tirageId = tirage.id;
  }

  // --- Lire le pot actuel ---
  const { data: jackpotRow } = await supabaseAdmin
    .from('okapi_color_jackpot')
    .select('pot_cdf')
    .eq('id', 1)
    .single();
  const potActuel = Number(jackpotRow?.pot_cdf ?? 0);
  let jackpotDispo = potActuel >= OKAPI_COLOR_CONFIG.jackpotCdf;
  let jackpotPaid  = existingTirage?.jackpot_paye ?? false;
  let totalPaidCdf = 0;

  // --- Résoudre les jackpots en attente (FIFO par created_at) ---
  // Idempotent par statut : un ticket déjà payé n'est plus 'jackpot_attente'.
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
        p_tirage_id:         tirageId,
        p_idempotency_key:   `okapi-color:payout:${ticket.id}`,
      });
      await applyJackpotDeltaIdempotent(
        buildJackpotResolveEventKey(ticket.id),
        tirageId,
        -OKAPI_COLOR_CONFIG.jackpotCdf,
      );
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

  // --- Traiter les tickets pending DU SLOT uniquement ---
  // Un ticket déjà settled (gagnant/perdant/jackpot_attente) n'est jamais
  // retraité car on filtre sur status='pending'.
  const { data: pending, error: pendErr } = await supabaseAdmin
    .from('okapi_color_tickets')
    .select('id, user_id, numeros')
    .eq('status', 'pending')
    .eq('slot_key', slotKey);
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
        p_tirage_id:          tirageId,
        p_idempotency_key:    `okapi-color:payout:${t.id}`,
      });
      // Si 6 rouges payés : décrémenter le pot (idempotent par ticket+tirage).
      if (redHits === 6) {
        jackpotPaid   = true;
        totalPaidCdf += gainsCdf;
        await applyJackpotDeltaIdempotent(
          buildJackpotDecrementEventKey(tirageId, t.id),
          tirageId,
          -OKAPI_COLOR_CONFIG.jackpotCdf,
        );
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
          tirage_id:           tirageId,
          settled_at:          status === 'perdant' ? new Date().toISOString() : null,
        })
        .eq('id', t.id);
    }

    processed++;
  }

  if (jackpotPaid && !(existingTirage?.jackpot_paye)) {
    await supabaseAdmin
      .from('okapi_color_tirages')
      .update({ jackpot_paye: true })
      .eq('id', tirageId);
  }

  return { tirageId, rouges, ors, processed, winners, jackpotPaid, totalPaidCdf, resumed };
}

// =============================================================
// Routes Fastify
// =============================================================
const okapiColorRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {

  // ----------------------------------------------------------
  // GET /api/okapi-color/live
  // Public — pas d'auth, utilisé par l'affichage TV
  // ----------------------------------------------------------
  app.get('/api/okapi-color/live', async (_req, reply) => {
    const now = new Date();

    // Dernier tirage en DB
    const { data: lastTirage } = await supabaseAdmin
      .from('okapi_color_tirages')
      .select('id, draw_number, slot_key, numeros_rouges, numeros_or, drawn_at, jackpot_paye, draw_at')
      .order('drawn_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const secsSinceLast = lastTirage?.drawn_at
      ? (now.getTime() - new Date(lastTirage.drawn_at).getTime()) / 1000
      : Infinity;

    const { state, slotKey, drawAt, closeAt, secondsRemaining } = computeOkapiColorState(now, secsSinceLast);

    // Jackpot pot
    const { data: jackpotRow } = await supabaseAdmin
      .from('okapi_color_jackpot')
      .select('pot_cdf')
      .eq('id', 1)
      .maybeSingle();
    const jackpot_cdf = Number(jackpotRow?.pot_cdf ?? 0);

    // Gagnants du dernier tirage (anonymisés)
    let last_draw = null;
    if (lastTirage) {
      const { data: winTickets } = await supabaseAdmin
        .from('okapi_color_tickets')
        .select('id, nb_rouges, nb_or, gains_cdf')
        .eq('tirage_id', lastTirage.id)
        .in('status', ['gagnant', 'jackpot_attente'])
        .gt('gains_cdf', 0)
        .order('gains_cdf', { ascending: false })
        .limit(10);

      const totalPaid = (winTickets || []).reduce((s, w) => s + Number(w.gains_cdf), 0);

      last_draw = {
        draw_number:    lastTirage.draw_number,
        slot_key:       lastTirage.slot_key,
        numeros_rouges: lastTirage.numeros_rouges,
        numeros_or:     lastTirage.numeros_or,
        drawn_at:       lastTirage.drawn_at,
        jackpot_paye:   lastTirage.jackpot_paye,
        winner_count:   (winTickets || []).length,
        total_paid_cdf: totalPaid,
        winners: (winTickets || []).map((w) => ({
          ticket_ref: (w.id as string).slice(-4).toUpperCase(),
          nb_rouges:  w.nb_rouges,
          nb_or:      w.nb_or,
          gains_cdf:  Number(w.gains_cdf),
        })),
      };
    }

    // Recent draws (last 5)
    const { data: recentRows } = await supabaseAdmin
      .from('okapi_color_tirages')
      .select('draw_number, slot_key, numeros_rouges, numeros_or, drawn_at, jackpot_paye')
      .order('drawn_at', { ascending: false })
      .limit(5);

    const recentDraws = (recentRows || []).map((t) => ({
      drawNumber:    t.draw_number,
      slotKey:       t.slot_key,
      numerosRouges: t.numeros_rouges,
      numerosOr:     t.numeros_or,
      drawnAt:       t.drawn_at,
      jackpotPaye:   t.jackpot_paye,
    }));

    const { count: slotTicketsCount } = await supabaseAdmin
      .from('okapi_color_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('slot_key', slotKey)
      .eq('status', 'pending');

    return reply
      .header('Cache-Control', 'no-store')
      .send({
        enabled:            env.OKAPI_COLOR_ENABLED ?? false,
        serverTime:         now.toISOString(),
        ticketPriceCdf:     OKAPI_COLOR_CONFIG.ticketPriceCdf,
        jackpotCdf:         jackpot_cdf,
        jackpotThresholdCdf: OKAPI_COLOR_CONFIG.jackpotCdf,
        drawIntervalSeconds: getIntervalSecs(),
        closeBeforeSeconds:  getCloseBeforeSecs(),
        resultDisplaySeconds: getResultDisplaySecs(),
        drawingWindowSeconds: getDrawingWindowSecs(),
        currentDraw: {
          slotKey,
          drawNumber:       null,
          status:           state,
          drawAt:           drawAt.toISOString(),
          closeAt:          closeAt.toISOString(),
          secondsRemaining,
        },
        lastDraw: last_draw ? {
          drawNumber:    last_draw.draw_number,
          slotKey:       last_draw.slot_key,
          numerosRouges: last_draw.numeros_rouges,
          numerosOr:     last_draw.numeros_or,
          drawnAt:       last_draw.drawn_at,
          jackpotPaye:   last_draw.jackpot_paye,
          winnerCount:   last_draw.winner_count,
          totalPaidCdf:  last_draw.total_paid_cdf,
          winners: last_draw.winners.map((w) => ({
            ticketRef:  w.ticket_ref,
            nbRouges:   w.nb_rouges,
            nbOr:       w.nb_or,
            gainsCdf:   w.gains_cdf,
          })),
        } : null,
        recentDraws,
        publicStats: {
          ticketsCount:  slotTicketsCount ?? 0,
          winnerCount:   last_draw?.winner_count ?? 0,
          totalPaidCdf:  last_draw?.total_paid_cdf ?? 0,
        },
      });
  });

  // ----------------------------------------------------------
  // GET /api/okapi-color/latest-draws
  // Public — derniers tirages (sans données sensibles)
  // ----------------------------------------------------------
  app.get('/api/okapi-color/latest-draws', async (_req, reply) => {
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

    // Refuser les achats pendant CLOSING et DRAWING
    const { data: lastT } = await supabaseAdmin
      .from('okapi_color_tirages')
      .select('drawn_at')
      .order('drawn_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const secsSinceLastDraw = lastT?.drawn_at
      ? (Date.now() - new Date(lastT.drawn_at).getTime()) / 1000
      : Infinity;
    const { state: drawState } = computeOkapiColorState(new Date(), secsSinceLastDraw);
    if (drawState === 'closing' || drawState === 'drawing') {
      return reply.code(423).send({
        error: 'Tirage en cours — paris fermés. Réessayez dans quelques secondes.',
        code:  'DRAW_IN_PROGRESS',
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

    // Attacher le ticket au slot courant (calculé côté serveur)
    const { slotKey: ticketSlotKey, drawAt: ticketDrawAt } = getOkapiColorSlotBoundaries();

    const { data: ticket, error: insErr } = await supabaseAdmin
      .from('okapi_color_tickets')
      .insert({
        id:       ticket_id,
        user_id,
        numeros:  numeros as number[],
        prix_cdf: OKAPI_COLOR_CONFIG.ticketPriceCdf,
        status:   'pending',
        slot_key: ticketSlotKey,
        draw_at:  ticketDrawAt.toISOString(),
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
  // GET /api/okapi-color/my-current-tickets
  // Auth required — tickets du joueur pour le slot courant
  // ----------------------------------------------------------
  app.get('/api/okapi-color/my-current-tickets', { preHandler: app.requireAuth }, async (req, reply) => {
    const user_id = req.user.id;
    const { slotKey } = getOkapiColorSlotBoundaries();

    const { data, error } = await supabaseAdmin
      .from('okapi_color_tickets')
      .select('id, numeros, status, nb_rouges, nb_or, total_bons, gains_cdf, jackpot_en_attente, slot_key, draw_at, created_at')
      .eq('user_id', user_id)
      .eq('slot_key', slotKey)
      .order('created_at', { ascending: false });

    if (error) return reply.code(500).send({ error: error.message });

    return reply.send({
      slot_key: slotKey,
      tickets: (data || []).map((t) => ({
        ticket_code: (t.id as string).slice(-6).toUpperCase(),
        id:                 t.id,
        numeros:            t.numeros,
        status:             t.status,
        nb_rouges:          t.nb_rouges,
        nb_or:              t.nb_or,
        total_bons:         t.total_bons,
        gains_cdf:          Number(t.gains_cdf),
        jackpot_en_attente: t.jackpot_en_attente,
        slot_key:           t.slot_key,
        draw_at:            t.draw_at,
        created_at:         t.created_at,
      })),
    });
  });

  // ----------------------------------------------------------
  // POST /api/okapi-color/draw
  // Admin only — lancer un tirage
  // ----------------------------------------------------------
  app.post('/api/okapi-color/draw', async (req, reply) => {
    const adminSecret = resolveOkapiColorAdminSecret();
    const provided    = req.headers['x-admin-secret'];
    if (!adminSecret || provided !== adminSecret) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    try {
      const result = await executerTirageOkapiColor({ reason: 'manual' });
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
    const adminSecret = resolveOkapiColorAdminSecret();
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
