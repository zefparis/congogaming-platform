import cron from 'node-cron';
import { executerTirageFlash } from './routes/flash.js';
import { getOkapiColorSlotBoundaries, getOkapiColorSlotKey, getIntervalSecs, buildRecoveryLockKey } from './routes/okapi-color.js';
import { executerTirageLoto } from './routes/loto.js';
import { executerTirageOkapiColor } from './routes/okapi-color.js';
import { acquireJobLock } from './lib/jobLock.js';
import { isCongoLotoEnabled } from './lib/featureFlags.js';
import { supabaseAdmin } from './lib/supabase.js';
import { startReconciliationLoop } from './lib/unipesa-reconciliation.js';
import { env } from './env.js';
import { resolveMatchPredictions, fetchLiveMatches } from './routes/predictions.js';
import { finalScore, isPlayed, teamName } from '../src/screens/predictionsShared.js';

/**
 * Self-healing recovery for Loto Express (Flash) draws.
 *
 * `node-cron` runs in-process. On hosts with sleep behaviour, deploy
 * restarts, GC pauses, or any node-cron init failure, scheduled slots
 * can be silently skipped — pending tickets then stay `status='pending'`
 * forever, even though the settlement logic itself is fine.
 *
 * This helper is invoked both on boot and on a 2-minute safety-net
 * interval (independent of node-cron). It only acts when it detects
 * tickets that have been pending for longer than the slot window
 * (35 min). The per-slot job lock ensures a single recovery per slot
 * even if multiple instances or restarts fire it simultaneously.
 */
async function recoverMissedFlashDraw(reason: 'boot' | 'safety-net') {
  try {
    // 31-min cutoff: a healthy slot fires every 30 min, so anything
    // older than that is a missed slot we must rescue immediately.
    const cutoffIso = new Date(Date.now() - 31 * 60_000).toISOString();
    const { count, error } = await supabaseAdmin
      .from('flash_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lt('created_at', cutoffIso);

    if (error) {
      console.error(`[FLASH RECOVERY/${reason}] Probe failed:`, error.message);
      return;
    }

    if (!count || count === 0) {
      // Boot logs once; safety-net stays quiet on the happy path to
      // avoid log spam every 2 minutes.
      if (reason === 'boot') {
        console.log('[FLASH RECOVERY/boot] No orphan pending tickets — nothing to do');
      }
      return;
    }

    // Lock keyed on the previous slot so concurrent boots / safety-net
    // ticks within the same slot do not run the draw twice.
    const slotKey = `recover:${getFlashSlotKey(new Date(Date.now() - 30 * 60_000))}`;
    const acquired = await acquireJobLock('flash_draw', slotKey);
    if (!acquired) {
      console.log(`[FLASH RECOVERY/${reason}] Already performed for slot:`, slotKey);
      return;
    }

    console.log(`[FLASH RECOVERY/${reason}] ${count} orphan ticket(s) — running catch-up draw`);
    const result = await executerTirageFlash();
    console.log(`[FLASH RECOVERY/${reason}] Catch-up draw complete`, result);
  } catch (err) {
    console.error(`[FLASH RECOVERY/${reason}] Unexpected error:`, err);
  }
}

// =============================================================
// Okapi Color scheduler — intervalles configurables (défaut 10 min)
// =============================================================
function msUntilNextOkapiColorSlot(): number {
  const { drawAt } = getOkapiColorSlotBoundaries();
  return Math.max(0, drawAt.getTime() - Date.now());
}

async function recoverMissedOkapiColorDraw(reason: 'boot' | 'safety-net') {
  try {
    // Slot courant : ses tickets sont encore en cours de pari (open/closing)
    // et ne doivent JAMAIS être tirés par la récupération.
    const currentSlotKey = getOkapiColorSlotKey(new Date());

    // Tous les slots passés ayant encore des tickets pending = orphelins.
    const { data: pendingRows, error } = await supabaseAdmin
      .from('okapi_color_tickets')
      .select('slot_key')
      .eq('status', 'pending')
      .not('slot_key', 'is', null)
      .neq('slot_key', currentSlotKey)
      .limit(5000);
    if (error) { console.error(`[OKAPI-COLOR RECOVERY/${reason}]`, error.message); return; }

    const orphanSlots = Array.from(
      new Set((pendingRows ?? []).map((r) => r.slot_key as string).filter(Boolean)),
    );
    if (orphanSlots.length === 0) {
      if (reason === 'boot') console.log('[OKAPI-COLOR RECOVERY/boot] Aucun slot orphelin');
      return;
    }

    let recoveredSlots = 0;
    let settledTickets = 0;

    for (const slotKey of orphanSlots) {
      // Lock STABLE par slot (jamais Date.now()) : déduplique entre boot,
      // safety-net et instances multiples.
      const acquired = await acquireJobLock('okapi_color_draw', buildRecoveryLockKey(slotKey));
      if (!acquired) continue;

      try {
        // Slot explicite + forceResume : reprend un tirage existant ou en crée
        // un, et règle uniquement les tickets pending de CE slot.
        const result = await executerTirageOkapiColor({ slotKey, reason: 'recovery', forceResume: true });
        recoveredSlots += 1;
        settledTickets += result.processed;
        console.log(`[OKAPI-COLOR RECOVERY/${reason}] slot=${slotKey} processed=${result.processed} resumed=${result.resumed ?? false}`);
      } catch (err) {
        console.error(`[OKAPI-COLOR RECOVERY/${reason}] slot=${slotKey} failed:`, err);
      }
    }

    console.log(`[OKAPI-COLOR RECOVERY/${reason}] ${recoveredSlots} slot(s) récupéré(s), ${settledTickets} ticket(s) réglé(s)`);
  } catch (err) {
    console.error(`[OKAPI-COLOR RECOVERY/${reason}] Error:`, err);
  }
}

function scheduleNextOkapiColorDraw() {
  const ms = msUntilNextOkapiColorSlot();
  console.log(`[OKAPI-COLOR SCHEDULER] Next draw in ${Math.round(ms / 1000)}s`);
  setTimeout(async () => {
    try {
      const { slotKey } = getOkapiColorSlotBoundaries();
      const lockKey = `oc:${slotKey}`;
      const acquired = await acquireJobLock('okapi_color_draw', lockKey);
      if (!acquired) return;
      try {
        const result = await executerTirageOkapiColor();
        console.log('[OKAPI-COLOR SCHEDULER] Draw complete', new Date().toISOString(), result);
      } catch (err) {
        console.error('[OKAPI-COLOR SCHEDULER] Draw failed:', err);
      }
    } catch (err) {
      console.error('[OKAPI-COLOR SCHEDULER] Tick error:', err);
    } finally {
      scheduleNextOkapiColorDraw();
    }
  }, ms).unref();
}

function getFlashSlotKey(at: Date = new Date()): string {
  const now = at;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Kinshasa',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  const hour = parts.find(p => p.type === 'hour')?.value;
  const minute = parts.find(p => p.type === 'minute')?.value;
  const slot = Number(minute) < 30 ? '00' : '30';
  return `${year}-${month}-${day}-${hour}:${slot}`;
}

function getLotoSlotKey(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Kinshasa',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

/**
 * Compute the number of milliseconds until the next :00 or :30 minute
 * boundary in UTC. Africa/Kinshasa is UTC+1 with no DST so its minute
 * hand matches UTC's exactly — a UTC-aligned slot is also a
 * Kinshasa-aligned slot.
 *
 * Guarantees at least 1 second of delay so we never schedule a zero
 * timeout when called exactly on a boundary (which would cause a
 * busy-loop and a duplicate draw attempt against the same slot lock).
 */
function msUntilNextFlashSlot(now: Date = new Date()): number {
  const min = now.getUTCMinutes();
  const sec = now.getUTCSeconds();
  const ms = now.getUTCMilliseconds();
  const minsToNext = min < 30 ? 30 - min : 60 - min;
  return Math.max(minsToNext * 60_000 - sec * 1000 - ms, 1000);
}

/**
 * Self-rescheduling Flash draw timer. Each tick:
 *   1. Computes the current slot key (rounded down to :00 or :30).
 *   2. Tries to claim the per-slot job lock.
 *   3. Runs `executerTirageFlash()` if the lock was acquired.
 *   4. Schedules itself for the next boundary, regardless of outcome.
 *
 * The `finally` block is critical: even if the draw or the lock query
 * throws, we MUST reschedule — otherwise a single transient failure
 * would silently kill the entire scheduler.
 */
function scheduleNextFlashDraw() {
  const ms = msUntilNextFlashSlot();
  console.log(`[FLASH SCHEDULER] Next draw in ${Math.round(ms / 1000)}s`);
  setTimeout(async () => {
    try {
      const slotKey = getFlashSlotKey();
      const acquired = await acquireJobLock('flash_draw', slotKey);
      if (!acquired) {
        console.log('[FLASH SCHEDULER] Slot already drawn:', slotKey);
        return;
      }
      try {
        const result = await executerTirageFlash();
        console.log('[FLASH SCHEDULER] Draw complete', new Date().toISOString(), result);
      } catch (err) {
        console.error('[FLASH SCHEDULER] Draw failed:', err);
      }
    } catch (err) {
      console.error('[FLASH SCHEDULER] Tick error:', err);
    } finally {
      scheduleNextFlashDraw();
    }
  }, ms).unref();
}

// =============================================================
// Predictions auto-resolve — detection + resolution (every 15 min)
// =============================================================

const OPENFOOTBALL_URL =
  'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';

async function getResolveMode(): Promise<'manual' | 'auto'> {
  const { data } = await supabaseAdmin
    .from('app_settings')
    .select('value')
    .eq('key', 'predictions_resolve_mode')
    .maybeSingle();
  return data?.value === 'auto' ? 'auto' : 'manual';
}

async function fetchOpenfootballMatches(): Promise<any[]> {
  try {
    const res = await fetch(OPENFOOTBALL_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const json = await res.json() as { matches?: any[] };
    return json.matches ?? [];
  } catch { return []; }
}

async function detectAndResolvePredictions() {
  const slotKey = `pred-resolve:${new Date().toISOString().slice(0, 16)}`;
  const acquired = await acquireJobLock('predictions_resolve', slotKey);
  if (!acquired) {
    console.log('[PREDICTIONS RESOLVE] Slot already processed:', slotKey);
    return;
  }

  const mode = await getResolveMode();
  console.log(`[PREDICTIONS RESOLVE] Running detection (mode=${mode})`);

  // 1. Get all pending predictions grouped by match_id
  const { data: pendingPreds, error: pendErr } = await supabaseAdmin
    .from('predictions')
    .select('match_id')
    .eq('status', 'pending');
  if (pendErr) { console.error('[PREDICTIONS RESOLVE] Failed to fetch pending:', pendErr.message); return; }

  if (!pendingPreds || pendingPreds.length === 0) {
    console.log('[PREDICTIONS RESOLVE] No pending predictions');
    return;
  }

  const pendingMatchIds = [...new Set(pendingPreds.map(p => String(p.match_id)))];

  // 2. Filter out matches that already have a resolution row
  const { data: alreadyResolved } = await supabaseAdmin
    .from('match_resolutions')
    .select('match_id')
    .in('match_id', pendingMatchIds);
  const resolvedSet = new Set((alreadyResolved ?? []).map(r => r.match_id));
  const unresolvedMatchIds = pendingMatchIds.filter(id => !resolvedSet.has(id));

  if (unresolvedMatchIds.length === 0) {
    console.log('[PREDICTIONS RESOLVE] All pending matches already resolved');
    return;
  }

  // 3. Fetch openfootball matches + live data to find final scores
  const ofMatches = await fetchOpenfootballMatches();
  const liveMatches = await fetchLiveMatches();

  // Build a lookup: match_id (num as string) → RawMatch
  const matchLookup = new Map<string, any>();
  for (const m of ofMatches) {
    if (m.num != null) matchLookup.set(String(m.num), m);
  }

  // 4. For each unresolved match, check if it's final and has a score
  const readyToResolve: { matchId: string; scoreHome: number; scoreAway: number }[] = [];
  let circuitBreakerCount = 0;

  for (const matchId of unresolvedMatchIds) {
    const rawMatch = matchLookup.get(matchId);
    if (!rawMatch) continue;

    // Check if match is played (has score in openfootball data)
    const played = isPlayed(rawMatch);
    const fs = finalScore(rawMatch);

    // Also check live data for final status
    const t1 = teamName(rawMatch.team1).toLowerCase();
    const t2 = teamName(rawMatch.team2).toLowerCase();
    const live = liveMatches.find(l =>
      l.team1.toLowerCase() === t1 && l.team2.toLowerCase() === t2
    );
    const isLiveFinal = live?.status === 'final';

    if (!played && !isLiveFinal) continue;

    // Circuit breaker: match is final but no score available
    if ((played || isLiveFinal) && !fs) {
      circuitBreakerCount++;
      console.warn(`[PREDICTIONS RESOLVE] Circuit breaker: match ${matchId} is final but has no score — skipping (manual required)`);
      continue;
    }

    if (fs && fs.length >= 2) {
      readyToResolve.push({ matchId, scoreHome: fs[0], scoreAway: fs[1] });
    }
  }

  if (readyToResolve.length === 0) {
    console.log(`[PREDICTIONS RESOLVE] No matches ready (circuit breaker: ${circuitBreakerCount}, unresolved: ${unresolvedMatchIds.length})`);
    return;
  }

  console.log(`[PREDICTIONS RESOLVE] ${readyToResolve.length} match(es) ready, ${circuitBreakerCount} circuit breaker(s)`);

  // 5. Resolve based on mode
  if (mode === 'auto') {
    for (const { matchId, scoreHome, scoreAway } of readyToResolve) {
      try {
        const result = await resolveMatchPredictions({
          match_id: matchId,
          actual_score_home: scoreHome,
          actual_score_away: scoreAway,
          resolved_by: null, // null = system/auto-resolved
          log: { error: (obj, msg) => console.error('[PREDICTIONS RESOLVE]', msg, obj) },
        });
        console.log(`[PREDICTIONS RESOLVE] Auto-resolved match ${matchId}:`, result);
      } catch (err: any) {
        if (err.code === 'ALREADY_RESOLVED') continue;
        console.error(`[PREDICTIONS RESOLVE] Failed to auto-resolve match ${matchId}:`, err.message);
      }
    }
  } else {
    // Manual mode: just log — admin UI already shows pending matches
    console.log(`[PREDICTIONS RESOLVE] Manual mode — ${readyToResolve.length} match(es) ready for manual resolution`);
  }
}

/**
 * Démarre tous les planificateurs serveur :
 * - Flash : tirage toutes les 30 minutes (:00 et :30)
 * - Loto Congo : tirage quotidien à 20h00 DRC (UTC+2 = 18:00 UTC)
 */
export function startCrons() {
  // Loto Express scheduler — `setTimeout`-based, self-rescheduling.
  //
  // We deliberately do NOT use node-cron for the Flash draw any more:
  // it was firing unreliably in production (suspected library/GC
  // interaction with our process). A plain timer aligned on the next
  // :00 or :30 boundary is fully deterministic, has zero dependencies
  // and is easy to reason about.
  //
  // The slot boundary is computed against UTC minutes — `Africa/Kinshasa`
  // is UTC+1 with no DST, so its minute hand is identical to UTC's,
  // which means a UTC-aligned :00/:30 is also Kinshasa-aligned :00/:30.
  scheduleNextFlashDraw();

  // Boot-time catch-up: if a slot was missed (sleep, deploy, crash),
  // run the missed draw now so pending tickets do not stay unsettled.
  void recoverMissedFlashDraw('boot');

  // Safety-net: independent of the main scheduler. Every minute we
  // re-probe for stale pending tickets and trigger a recovery draw if
  // needed. The per-slot job lock means the main scheduler and the
  // watchdog never double-draw.
  setInterval(() => {
    void recoverMissedFlashDraw('safety-net');
  }, 60_000).unref();
  console.log('[FLASH SAFETY-NET] Watchdog started — checks every 1 min');

  // Tirage Loto Congo — tous les jours à 20h00 pile à Kinshasa.
  // Suspendu quand la feature flag est désactivée (les tickets ne
  // peuvent plus être achetés ; lancer le tirage n'aurait pas de sens).
  if (isCongoLotoEnabled) {
    cron.schedule(
      '0 20 * * *',
      async () => {
        const slotKey = getLotoSlotKey();
        const acquired = await acquireJobLock('loto_draw', slotKey);
        if (!acquired) {
          console.log('[LOTO CRON] Lock already acquired, skipping draw', slotKey);
          return;
        }
        try {
          const result = await executerTirageLoto();
          console.log('[LOTO CRON] Tirage quotidien effectué', result);
        } catch (err) {
          console.error('[LOTO CRON] Erreur tirage:', err);
        }
      },
      {
        timezone: 'Africa/Kinshasa',
      },
    );
    console.log('[LOTO CRON] Tirage quotidien planifié — 20h00 Africa/Kinshasa');
  } else {
    console.log('[LOTO CRON] Désactivé (CONGO_LOTO_ENABLED=false)');
  }

  // Okapi Color — intervalle configurable via OKAPI_COLOR_DRAW_INTERVAL_SECONDS
  // (défaut 600s = 10 min). Même architecture que Flash : self-rescheduling,
  // slot lock, safety-net.
  if (env.OKAPI_COLOR_ENABLED) {
    scheduleNextOkapiColorDraw();
    void recoverMissedOkapiColorDraw('boot');
    setInterval(() => { void recoverMissedOkapiColorDraw('safety-net'); }, 60_000).unref();
    const ocIntervalMin = Math.round(getIntervalSecs() / 60);
    console.log(`[OKAPI-COLOR SCHEDULER] Tirage toutes les ${ocIntervalMin} min (${getIntervalSecs()}s) activé`);
  } else {
    console.log('[OKAPI-COLOR SCHEDULER] Désactivé (OKAPI_COLOR_ENABLED=false)');
  }

  // Unipesa reconciliation worker — resolves transactions left in
  // PENDING (status 1) by the resilient flows when the provider was
  // unreachable or the circuit breaker tripped. Idempotency keys on
  // every ledger entry guarantee no double credit/debit even if a
  // late callback and a reconciliation tick race each other.
  startReconciliationLoop(60_000);

  // Predictions auto-resolve — detection runs every 15 minutes.
  // Checks openfootball + live cache for final matches with pending
  // predictions. In 'manual' mode it only logs (admin UI surfaces them).
  // In 'auto' mode it resolves directly via resolveMatchPredictions()
  // with resolved_by=null (system). Circuit breaker: if a match is
  // final but has no score data, it is skipped for manual handling.
  cron.schedule('*/15 * * * *', async () => {
    try {
      await detectAndResolvePredictions();
    } catch (err) {
      console.error('[PREDICTIONS RESOLVE CRON] Error:', err);
    }
  });
  console.log('[PREDICTIONS RESOLVE CRON] Detection job scheduled — every 15 min');

}
