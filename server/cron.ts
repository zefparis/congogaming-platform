import { getOkapiColorSlotBoundaries, getOkapiColorSlotKey, getIntervalSecs, buildRecoveryLockKey } from './routes/okapi-color.js';
import { executerTirageOkapiColor } from './routes/okapi-color.js';
import { acquireJobLock } from './lib/jobLock.js';
import { supabaseAdmin } from './lib/supabase.js';
import { startReconciliationLoop } from './lib/unipesa-reconciliation.js';
import { env } from './env.js';

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

/**
 * Démarre les planificateurs serveur :
 * - Okapi Color : tirage à intervalle configurable (OKAPI_COLOR_DRAW_INTERVAL_SECONDS)
 * - Réconciliation Unipesa : résout les transactions PENDING
 */
export function startCrons() {
  // Okapi Color — intervalle configurable via OKAPI_COLOR_DRAW_INTERVAL_SECONDS
  // (défaut 600s = 10 min). Architecture self-rescheduling : slot lock,
  // recovery au boot + safety-net.
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

}
