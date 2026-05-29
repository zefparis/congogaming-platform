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
  app.get('/api/me/referral', { preHandler: app.requireAuth }, async (req, reply) => {
    const [userRes, countRes, rewardsRes] = await Promise.all([
      supabaseAdmin.from('users').select('referral_code').eq('id', req.user.id).maybeSingle(),
      supabaseAdmin
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('referred_by', req.user.id),
      supabaseAdmin
        .from('referral_rewards')
        .select('amount_cdf, status')
        .eq('referrer_id', req.user.id),
    ]);

    if (userRes.error) return reply.code(500).send({ error: userRes.error.message });

    let totalCredited = 0;
    let totalPending = 0;
    for (const r of rewardsRes.data || []) {
      const amt = Number(r.amount_cdf || 0);
      if (r.status === 'credited') totalCredited += amt;
      else if (r.status === 'pending') totalPending += amt;
    }

    return reply.send({
      code: userRes.data?.referral_code ?? null,
      referred_count: countRes.count ?? 0,
      total_credited_cdf: totalCredited,
      total_pending_cdf: totalPending,
    });
  });
}
