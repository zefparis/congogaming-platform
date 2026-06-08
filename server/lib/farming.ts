import type { SupabaseClient } from '@supabase/supabase-js';
import { creditCGLT } from './unipay-cglt.js';

/**
 * CGLT Farming engine.
 *
 * Every wager grants XP (1% of the stake, floored). When a player's
 * cumulative XP crosses a tier threshold, the corresponding CGLT reward is
 * credited to their UniPay wallet and logged in `farming_rewards`. All work
 * is best-effort: callers must never let a farming failure break gameplay.
 */

export interface Tier {
  name: string;
  xp_min: number;
  xp_max: number | null;
  cglt_reward: number;
  label: string;
}

// Paliers de récompense
export const TIERS: Tier[] = [
  { name: 'debutant', xp_min: 0,    xp_max: 99,   cglt_reward: 0,    label: 'Mineur Débutant' },
  { name: 'bronze',   xp_min: 100,  xp_max: 499,  cglt_reward: 50,   label: 'Mineur Bronze 🥉' },
  { name: 'argent',   xp_min: 500,  xp_max: 999,  cglt_reward: 300,  label: 'Mineur Argent 🥈' },
  { name: 'or',       xp_min: 1000, xp_max: 4999, cglt_reward: 800,  label: 'Mineur Or 🥇' },
  { name: 'diamant',  xp_min: 5000, xp_max: null, cglt_reward: 5000, label: 'Mineur Diamant 💎' },
];

// Calcule XP gagné pour une mise
export function calculateXP(betAmount: number): number {
  return Math.floor(betAmount * 0.01); // 1% de la mise
}

// Détermine le palier actuel
export function getCurrentTier(totalXP: number): Tier {
  return TIERS.slice().reverse().find((t) => totalXP >= t.xp_min) || TIERS[0];
}

// Retourne le prochain palier (null si déjà au sommet)
export function getNextTier(totalXP: number): Tier | null {
  const current = getCurrentTier(totalXP);
  const idx = TIERS.findIndex((t) => t.name === current.name);
  return idx >= 0 && idx < TIERS.length - 1 ? TIERS[idx + 1] : null;
}

// Calcule si un nouveau palier est atteint
export function checkTierUp(oldXP: number, newXP: number): Tier | null {
  const oldTier = getCurrentTier(oldXP);
  const newTier = getCurrentTier(newXP);
  if (newTier.name !== oldTier.name && newTier.cglt_reward > 0) {
    return newTier;
  }
  return null;
}

export interface AddXPResult {
  xp_gained: number;
  new_total_xp: number;
  tier_up: Tier | null;
}

export interface FarmingPayload {
  xp_gained: number;
  total_xp: number;
  tier_up: { name: string; label: string; cglt_reward: number } | null;
}

/** Shape an AddXPResult for inclusion in a game route response. */
export function toFarmingPayload(r: AddXPResult): FarmingPayload {
  return {
    xp_gained: r.xp_gained,
    total_xp: r.new_total_xp,
    tier_up: r.tier_up
      ? { name: r.tier_up.name, label: r.tier_up.label, cglt_reward: r.tier_up.cglt_reward }
      : null,
  };
}

// Ajoute XP après une mise et distribue CGLT si palier atteint
export async function addXPAndReward(
  supabase: SupabaseClient,
  phone: string,
  betAmount: number,
): Promise<AddXPResult> {
  const xpGained = calculateXP(betAmount);

  // Récupère ou crée le farming record
  let { data: farming } = await supabase
    .from('player_farming')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();

  if (!farming) {
    const { data } = await supabase
      .from('player_farming')
      .insert({ phone, total_xp: 0 })
      .select()
      .single();
    farming = data;
  }

  if (!farming) {
    // Could not read or create the record (e.g. unique-index race). Skip
    // silently; the next bet will reconcile.
    return { xp_gained: xpGained, new_total_xp: xpGained, tier_up: null };
  }

  const oldXP = Number(farming.total_xp);
  const newXP = oldXP + xpGained;

  // Vérifie si nouveau palier atteint
  const tierUp = checkTierUp(oldXP, newXP);
  const newTier = getCurrentTier(newXP);

  // Met à jour XP
  await supabase
    .from('player_farming')
    .update({
      total_xp: newXP,
      current_tier: newTier.name,
      updated_at: new Date().toISOString(),
    })
    .eq('phone', phone);

  // Si nouveau palier → crédit CGLT dans UniPay
  if (tierUp && tierUp.cglt_reward > 0) {
    const gameRef = `farming_${tierUp.name}_${Date.now()}`;

    try {
      const result = await creditCGLT(phone, tierUp.cglt_reward, gameRef, gameRef);

      // Log récompense
      await supabase.from('farming_rewards').insert({
        player_farming_id: farming.id,
        phone,
        tier: tierUp.name,
        xp_at_reward: newXP,
        cglt_amount: tierUp.cglt_reward,
        unipay_tx_ref: result.blockchain_tx_hash || gameRef,
        status: 'completed',
      });

      // Met à jour total CGLT gagné
      await supabase
        .from('player_farming')
        .update({
          total_cglt_earned: Number(farming.total_cglt_earned) + tierUp.cglt_reward,
          last_tier_claimed: tierUp.name,
        })
        .eq('phone', phone);
    } catch (err) {
      console.error('[farming] CGLT credit failed:', err);
      await supabase.from('farming_rewards').insert({
        player_farming_id: farming.id,
        phone,
        tier: tierUp.name,
        xp_at_reward: newXP,
        cglt_amount: tierUp.cglt_reward,
        status: 'failed',
      });
    }
  }

  return { xp_gained: xpGained, new_total_xp: newXP, tier_up: tierUp };
}
