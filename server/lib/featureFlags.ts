import { env } from '../env.js';

/**
 * Whether the Congo Loto product (daily 20h draw) is currently active.
 *
 * Toggled via `CONGO_LOTO_ENABLED` env var. When `false`, all Congo
 * Loto routes return 403 with `code: "COMING_SOON"` so the frontend
 * can show a premium teaser. All Congo Loto data (tickets, tirages,
 * jackpot, transactions) is preserved untouched in the database;
 * disabling the flag is a soft, fully reversible operation.
 */
export const isCongoLotoEnabled = env.CONGO_LOTO_ENABLED;

export const COMING_SOON_PAYLOAD = {
  code: 'COMING_SOON' as const,
  message: 'Congo Loto revient bientôt.',
};
