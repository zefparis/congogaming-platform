import cron from 'node-cron';
import { executerTirageFlash } from './routes/flash.js';
import { executerTirageLoto } from './routes/loto.js';
import { acquireJobLock } from './lib/jobLock.js';

function getFlashSlotKey(): string {
  const now = new Date();
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

  // Tirage Loto Congo — tous les jours à 20h00 pile à Kinshasa
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
}
