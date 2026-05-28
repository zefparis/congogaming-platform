import cron from 'node-cron';
import { executerTirageFlash } from './routes/flash.js';
import { executerTirageLoto } from './routes/loto.js';
import { acquireJobLock } from './lib/jobLock.js';
import { isCongoLotoEnabled } from './lib/featureFlags.js';
import { supabaseAdmin } from './lib/supabase.js';

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
    const cutoffIso = new Date(Date.now() - 35 * 60_000).toISOString();
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
 * Démarre tous les planificateurs serveur :
 * - Flash : tirage toutes les 30 minutes (:00 et :30)
 * - Loto Congo : tirage quotidien à 20h00 DRC (UTC+2 = 18:00 UTC)
 */
export function startCrons() {
  cron.schedule('0,30 * * * *', async () => {
    const slotKey = getFlashSlotKey();
    const acquired = await acquireJobLock('flash_draw', slotKey);
    if (!acquired) {
      console.log('[FLASH CRON] Lock already acquired, skipping draw', slotKey);
      return;
    }
    try {
      const result = await executerTirageFlash();
      console.log(
        '[FLASH CRON] Tirage automatique déclenché',
        new Date().toISOString(),
        result,
      );
    } catch (err) {
      console.error('[FLASH CRON] Erreur tirage:', err);
    }
  });
  console.log('[FLASH CRON] Planificateur démarré — tirage toutes les 30 minutes');

  // Boot-time catch-up: if a slot was missed (sleep, deploy, crash),
  // run the missed draw now so pending tickets do not stay unsettled.
  void recoverMissedFlashDraw('boot');

  // Safety-net: independent of node-cron. Every 2 minutes we re-probe
  // for stale pending tickets and run a recovery draw if needed. This
  // guarantees Loto Express keeps settling even if node-cron fails to
  // fire for any reason (init bug, GC pause, missed slot, etc.). The
  // per-slot job lock means real cron + recovery never double-draw.
  setInterval(() => {
    void recoverMissedFlashDraw('safety-net');
  }, 2 * 60_000).unref();
  console.log('[FLASH SAFETY-NET] Watchdog started — checks every 2 min');

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
}
