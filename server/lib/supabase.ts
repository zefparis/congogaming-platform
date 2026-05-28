import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../env.js';

const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.warn('[supabase] SUPABASE_URL or SUPABASE_SERVICE_KEY not set — DB operations will fail.');
}

export const supabaseAdmin = createClient(url || 'http://localhost', key || 'anon', {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Returns the configured Supabase admin client, or null if env vars are missing.
 * Used by the Okapi Climb engine for best-effort persistence.
 */
export function getSupabase(): SupabaseClient | null {
  if (!url || !key) return null;
  return supabaseAdmin;
}

/**
 * Adjusts a user's balance atomically via the `adjust_balance` Postgres RPC.
 * The RPC enforces balance_cdf + p_delta >= 0 and returns the new balance.
 * Throws if the user is not found or balance would go negative.
 */
export async function adjustBalance(
  userId: string,
  delta: number,
): Promise<number> {
  const sb = getSupabase();
  if (!sb) return 0;
  const { data, error } = await sb.rpc('adjust_balance', {
    p_user_id: userId,
    p_delta: delta,
  });
  if (error) throw new Error(error.message);
  // Postgres `numeric` is serialized as a string by PostgREST. Coerce so
  // callers always get a real number (otherwise client-side arithmetic on
  // the returned balance produces NaN).
  return Number(data ?? 0);
}
