import type { FastifyInstance } from 'fastify';
import { KycScanBodySchema } from '../lib/validation.js';
import { supabaseAdmin } from '../lib/supabase.js';

// ─── KYC — manual review ─────────────────────────────────────────────────────
//
// The external verification provider (PlayGuard → Hybrid Vector) has been
// decommissioned. A selfie submission is now stored on public.kyc_checks and
// the user is flagged kyc_status='pending' until an operator approves or
// denies the account in the admin dashboard.
//
// Auth model: there is no Bearer token system in Congo Gaming yet — sessions
// live entirely in localStorage on the client. We therefore validate that the
// supplied user_id corresponds to an existing, non-blocked user, but cannot
// cryptographically prove it's the legitimate owner. This is consistent with
// the rest of the app (ticket purchase, withdraw all do the same). Tightening this
// is a follow-up across all routes, not specific to KYC.

export default async function kycRoutes(app: FastifyInstance) {
  app.post(
    '/api/kyc/scan',
    {
      preHandler: app.requireAuth,
      config: { rateLimit: { max: 3, timeWindow: '1 hour' } },
    },
    async (req, reply) => {
      const parsed = KycScanBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues[0]?.message || 'selfie_b64 required' });
      }
      const userId = req.user.id;
      const selfie = parsed.data.selfie_b64;

      // Verify the user actually exists (and surface a clear error otherwise
      // — the kyc_checks FK would also catch this, but with a less friendly
      // Postgres error message).
      const { data: user, error: userErr } = await supabaseAdmin
        .from('users')
        .select('id, kyc_status, blocked')
        .eq('id', userId)
        .maybeSingle();
      if (userErr) {
        return reply.code(500).send({ error: userErr.message });
      }
      if (!user) {
        return reply.code(404).send({ error: 'User not found' });
      }
      if (user.blocked) {
        return reply.code(403).send({
          error: 'Account blocked',
          kyc_status: user.kyc_status,
        });
      }

      // Already verified — nothing to submit.
      if (user.kyc_status === 'approved') {
        return reply.send({ verdict: 'APPROVED', kyc_status: 'approved' });
      }

      // Idempotent: a submission already queued for review → no duplicate.
      const { data: pendingCheck } = await supabaseAdmin
        .from('kyc_checks')
        .select('id')
        .eq('user_id', userId)
        .eq('verdict', 'PENDING')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (pendingCheck) {
        return reply.send({ verdict: 'PENDING', kyc_status: 'pending' });
      }

      // ── Queue for manual review ─────────────────────────────────────────
      const { error: insertErr } = await supabaseAdmin.from('kyc_checks').insert({
        user_id: userId,
        verdict: 'PENDING',
        selfie_b64: selfie,
      });
      if (insertErr) {
        req.log.error({ err: insertErr }, 'kyc_checks insert failed');
        return reply.code(500).send({ error: 'KYC submission failed' });
      }

      const { error: updateErr } = await supabaseAdmin
        .from('users')
        .update({ kyc_status: 'pending' })
        .eq('id', userId);
      if (updateErr) {
        req.log.error({ err: updateErr }, 'users update failed');
        return reply.code(500).send({ error: updateErr.message });
      }

      return reply.send({ verdict: 'PENDING', kyc_status: 'pending' });
    },
  );
}
