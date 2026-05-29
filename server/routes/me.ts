import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';

const RAISE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const LimitsSchema = z.object({
  daily_deposit_cdf: z.number().int().nonnegative().nullable().optional(),
  weekly_deposit_cdf: z.number().int().nonnegative().nullable().optional(),
  monthly_deposit_cdf: z.number().int().nonnegative().nullable().optional(),
});

const SelfExclusionSchema = z.object({
  duration: z.enum(['24h', '7d', '30d', 'permanent']),
});

export default async function meRoutes(app: FastifyInstance) {
  // ---------------- LIMITS ----------------
  app.get('/api/me/limits', { preHandler: app.requireAuth }, async (req, reply) => {
    const { data, error } = await supabaseAdmin
      .from('user_limits')
      .select('*')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) return reply.code(500).send({ error: error.message });

    return reply.send({
      limits: data ? {
        daily_deposit_cdf: data.daily_deposit_cdf,
        weekly_deposit_cdf: data.weekly_deposit_cdf,
        monthly_deposit_cdf: data.monthly_deposit_cdf,
        self_exclusion_until: data.self_exclusion_until,
        pending_raise: data.pending_raise,
        pending_raise_effective_at: data.pending_raise_effective_at,
      } : {
        daily_deposit_cdf: null,
        weekly_deposit_cdf: null,
        monthly_deposit_cdf: null,
        self_exclusion_until: null,
        pending_raise: null,
        pending_raise_effective_at: null,
      },
    });
  });

  app.put('/api/me/limits', { preHandler: app.requireAuth }, async (req, reply) => {
    const parsed = LimitsSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Limites invalides', code: 'INVALID_LIMITS' });
    }

    const { data: existing, error: getErr } = await supabaseAdmin
      .from('user_limits')
      .select('*')
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (getErr) return reply.code(500).send({ error: getErr.message });

    const newValues = parsed.data;
    const immediate: Record<string, number | null> = {};
    const pending: Record<string, number | null> = {};

    const fields = ['daily_deposit_cdf', 'weekly_deposit_cdf', 'monthly_deposit_cdf'] as const;
    for (const field of fields) {
      const current = existing?.[field] ?? null;
      const next = newValues[field] === undefined ? current : (newValues[field] ?? null);

      if (next === current) continue;

      // Lowering / removing a cap is immediate.
      // Raising or removing a low cap is delayed by 24h (cooldown).
      const isRaise = (current === null && next !== null && current !== next) ||
                      (current !== null && next !== null && next > current) ||
                      (current !== null && next === null);
      if (isRaise) {
        pending[field] = next;
      } else {
        immediate[field] = next;
      }
    }

    const update: Record<string, unknown> = {
      user_id: req.user.id,
      ...immediate,
      updated_at: new Date().toISOString(),
    };

    if (Object.keys(pending).length > 0) {
      update.pending_raise = pending;
      update.pending_raise_effective_at = new Date(Date.now() + RAISE_COOLDOWN_MS).toISOString();
    }

    const { error } = await supabaseAdmin
      .from('user_limits')
      .upsert(update, { onConflict: 'user_id' });

    if (error) return reply.code(500).send({ error: error.message });

    return reply.send({
      ok: true,
      applied_immediately: Object.keys(immediate),
      pending_raise: Object.keys(pending).length > 0 ? pending : null,
      pending_raise_effective_at: update.pending_raise_effective_at ?? null,
    });
  });

  app.post('/api/me/self-exclusion', { preHandler: app.requireAuth }, async (req, reply) => {
    const parsed = SelfExclusionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Durée invalide', code: 'INVALID_DURATION' });
    }

    const ms = (() => {
      switch (parsed.data.duration) {
        case '24h': return 24 * 60 * 60 * 1000;
        case '7d': return 7 * 24 * 60 * 60 * 1000;
        case '30d': return 30 * 24 * 60 * 60 * 1000;
        case 'permanent': return 100 * 365 * 24 * 60 * 60 * 1000; // 100 years
      }
    })();

    const until = new Date(Date.now() + ms).toISOString();

    const { error } = await supabaseAdmin
      .from('user_limits')
      .upsert(
        { user_id: req.user.id, self_exclusion_until: until, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );

    if (error) return reply.code(500).send({ error: error.message });

    req.log.warn({ userId: req.user.id, duration: parsed.data.duration }, 'self-exclusion activated');
    return reply.send({ ok: true, self_exclusion_until: until });
  });

  // ---------------- REFERRAL ----------------
  //
  // Returns both perspectives so the front-end can show:
  //   - `as_referrer` : the player's own referral code, count of filleuls,
  //     credited / pending earnings, lifetime wagered (used to compute next
  //     tier progress on the client), annual cap usage.
  //   - `as_referee`  : if the player was themselves referred, what the
  //     welcome bonus status is and which referrer brought them. We never
  //     leak the referrer's phone — only their display_name (or a masked
  //     fallback) — so the relationship is visible without enabling
  //     contact harvesting.
  //
  // The endpoint stays lightweight enough to be polled on every account
  // page mount; rules constants are computed server-side so the UI can
  // adapt automatically if the spec changes.
  app.get('/api/me/referral', { preHandler: app.requireAuth }, async (req, reply) => {
    const [userRes, countRes, rewardsAsReferrerRes, welcomeRes] = await Promise.all([
      // Self: code, lifetime wagered, who referred me.
      supabaseAdmin
        .from('users')
        .select('referral_code, lifetime_wagered_cdf, referred_by')
        .eq('id', req.user.id)
        .maybeSingle(),
      // How many filleuls do I have?
      supabaseAdmin
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('referred_by', req.user.id),
      // Rewards I earned as a referrer (excluding welcome bonuses below).
      supabaseAdmin
        .from('referral_rewards')
        .select('amount_cdf, status, trigger_event, credited_at')
        .eq('referrer_id', req.user.id),
      // Welcome bonus row addressed to me (if I'm a filleul).
      supabaseAdmin
        .from('referral_rewards')
        .select('amount_cdf, status, credited_at')
        .eq('referred_id', req.user.id)
        .eq('trigger_event', 'welcome_bonus')
        .maybeSingle(),
    ]);

    if (userRes.error) return reply.code(500).send({ error: userRes.error.message });

    // ---- AS REFERRER ----
    let totalCredited = 0;
    let totalPending = 0;
    let annualCredited = 0;
    const yearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
    for (const r of rewardsAsReferrerRes.data || []) {
      // Welcome bonuses live in `referral_rewards` for traceability but
      // are paid to the filleul, not the referrer. Never count them in
      // referrer earnings.
      if (r.trigger_event === 'welcome_bonus') continue;
      const amt = Number(r.amount_cdf || 0);
      if (r.status === 'credited') {
        totalCredited += amt;
        if (r.credited_at && new Date(r.credited_at).getTime() >= yearAgo) {
          annualCredited += amt;
        }
      } else if (r.status === 'pending') {
        totalPending += amt;
      }
    }

    // ---- AS REFEREE ----
    let asReferee: {
      has_referrer: boolean;
      referrer_display: string | null;
      welcome_bonus_status: 'credited' | 'pending_first_deposit' | 'none';
      welcome_bonus_cdf: number | null;
      welcome_bonus_credited_at: string | null;
    } = {
      has_referrer: false,
      referrer_display: null,
      welcome_bonus_status: 'none',
      welcome_bonus_cdf: null,
      welcome_bonus_credited_at: null,
    };

    if (userRes.data?.referred_by) {
      const { data: refUser } = await supabaseAdmin
        .from('users')
        .select('display_name, phone')
        .eq('id', userRes.data.referred_by)
        .maybeSingle();

      const display =
        refUser?.display_name?.trim()
          ? refUser.display_name.trim()
          : refUser?.phone
            ? `0${refUser.phone.slice(0, 1)}••••••${refUser.phone.slice(-2)}`
            : null;

      const w = welcomeRes.data;
      asReferee = {
        has_referrer: true,
        referrer_display: display,
        welcome_bonus_status: w?.status === 'credited' ? 'credited' : 'pending_first_deposit',
        welcome_bonus_cdf: w?.status === 'credited' ? Number(w.amount_cdf || 0) : null,
        welcome_bonus_credited_at: w?.status === 'credited' ? (w.credited_at ?? null) : null,
      };
    }

    return reply.send({
      // Legacy fields (kept for backward compat with the existing UI).
      code: userRes.data?.referral_code ?? null,
      referred_count: countRes.count ?? 0,
      total_credited_cdf: totalCredited,
      total_pending_cdf: totalPending,
      // ---- New fields ----
      lifetime_wagered_cdf: Number(userRes.data?.lifetime_wagered_cdf || 0),
      annual_credited_cdf: annualCredited,
      // Program rules — kept server-authoritative so the UI never lies.
      rules: {
        welcome_bonus_pct: 10,
        welcome_bonus_cap_cdf: 5000,
        welcome_min_deposit_cdf: 5000,
        tiers: [
          { tier: 'wager_5k',   threshold_cdf: 5000,   reward_cdf: 2000 },
          { tier: 'wager_25k',  threshold_cdf: 25000,  reward_cdf: 1000 },
          { tier: 'wager_100k', threshold_cdf: 100000, reward_cdf: 5000 },
        ],
        annual_cap_cdf: 50000,
      },
      as_referee: asReferee,
    });
  });
}
