import cron from 'node-cron';
import { executerTirageFlash } from './routes/flash.js';
import { executerTirageLoto } from './routes/loto.js';
import { executerTirageOkapiColor } from './routes/okapi-color.js';
import { acquireJobLock } from './lib/jobLock.js';
import { isCongoLotoEnabled } from './lib/featureFlags.js';
import { supabaseAdmin } from './lib/supabase.js';
import { startReconciliationLoop } from './lib/unipesa-reconciliation.js';
import { env } from './env.js';

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
// Okapi Color scheduler — mirror of Flash scheduler
// =============================================================
function getOkapiColorSlotKey(at: Date = new Date()): string {
  return getFlashSlotKey(at); // same :00/:30 UTC boundaries
}

async function recoverMissedOkapiColorDraw(reason: 'boot' | 'safety-net') {
  try {
    const cutoffIso = new Date(Date.now() - 31 * 60_000).toISOString();
    const { count, error } = await supabaseAdmin
      .from('okapi_color_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lt('created_at', cutoffIso);
    if (error) {
      console.error(`[OKAPI-COLOR RECOVERY/${reason}] Probe failed:`, error.message);
      return;
    }
    if (!count || count === 0) return;
    const slotKey = `oc:recover:${getOkapiColorSlotKey(new Date(Date.now() - 30 * 60_000))}`;
    const acquired = await acquireJobLock('okapi_color_draw', slotKey);
    if (!acquired) return;
    console.log(`[OKAPI-COLOR RECOVERY/${reason}] ${count} orphan ticket(s) — catch-up draw`);
    const result = await executerTirageOkapiColor();
    console.log(`[OKAPI-COLOR RECOVERY/${reason}] Done`, result);
  } catch (err) {
    console.error(`[OKAPI-COLOR RECOVERY/${reason}] Error:`, err);
  }
}

function scheduleNextOkapiColorDraw() {
  const ms = msUntilNextFlashSlot();
  setTimeout(async () => {
    try {
      const slotKey = `oc:${getOkapiColorSlotKey()}`;
      const acquired = await acquireJobLock('okapi_color_draw', slotKey);
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

  // Okapi Color — tirage toutes les 30 minutes si feature activée.
  // Même architecture que Flash : self-rescheduling, slot lock, safety-net.
  if (env.OKAPI_COLOR_ENABLED) {
    scheduleNextOkapiColorDraw();
    void recoverMissedOkapiColorDraw('boot');
    setInterval(() => { void recoverMissedOkapiColorDraw('safety-net'); }, 60_000).unref();
    console.log('[OKAPI-COLOR SCHEDULER] Tirage toutes les 30 min activé');
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
