import type { FastifyInstance } from 'fastify';
import { KycScanBodySchema } from '../lib/validation.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { env } from '../env.js';

// ─── PlayGuard KYC integration ───────────────────────────────────────────────
//
// This route forwards a player's selfie to the PlayGuard Vercel Edge proxy,
// records the verdict in public.kyc_checks, and updates public.users so the
// rest of the app (admin dashboard, route guards) can react.
//
// The PG_API_KEY is held server-side only (never exposed to the SPA bundle).
// We POST to https://playguard.vercel.app/api/proxy/playguard/scan, which is
// the same edge proxy the PlayGuard SPA uses.
//
// Auth model: there is no Bearer token system in Congo Gaming yet — sessions
// live entirely in localStorage on the client. We therefore validate that the
// supplied user_id corresponds to an existing, non-blocked user, but cannot
// cryptographically prove it's the legitimate owner. This is consistent with
// the rest of the app (loto/flash/withdraw all do the same). Tightening this
// is a follow-up across all routes, not specific to KYC.

const PG_PROXY_URL = env.PG_PROXY_URL || 'https://playguard.vercel.app/api/proxy';
const PG_PROXY_TIMEOUT_MS = 45_000;

type PgVerdict = 'ALLOWED' | 'MINOR' | 'BANNED' | 'VERIFY_AGE';

interface PgScanResult {
  scanId: string;
  verdict: PgVerdict;
  access: boolean;
  age: {
    range: { Low: number; High: number };
    isMinor: boolean;
    isAmbiguous?: boolean;
    estimatedAge?: number;
    threshold?: number;
    ambiguityNote?: string | null;
  };
  ban: { detected: boolean; similarity?: number; faceId?: string; externalId?: string };
  faceConfidence: number;
  timestamp: string;
}

/**
 * Map a PlayGuard verdict to:
 *   - the wire value persisted in kyc_checks.verdict
 *   - the user-facing kyc_status value on public.users
 *   - whether to hard-block the account (blocked=true)
 */
function mapVerdict(pg: PgScanResult): {
  wireVerdict: 'APPROVED' | 'DENIED' | 'VERIFY_AGE';
  kycStatus: 'approved' | 'denied' | 'verify_age';
  block: boolean;
} {
  // Anyone flagged as a minor is denied, even if PG returns ALLOWED with a
  // borderline age. We trust isMinor as the authoritative bit.
  if (pg.age.isMinor) {
    return { wireVerdict: 'DENIED', kycStatus: 'denied', block: true };
  }
  if (pg.verdict === 'BANNED' || pg.verdict === 'MINOR') {
    return { wireVerdict: 'DENIED', kycStatus: 'denied', block: true };
  }
  if (pg.verdict === 'VERIFY_AGE') {
    return { wireVerdict: 'VERIFY_AGE', kycStatus: 'verify_age', block: false };
  }
  return { wireVerdict: 'APPROVED', kycStatus: 'approved', block: false };
}

export default async function kycRoutes(app: FastifyInstance) {
  app.post(
    '/api/kyc/scan',
    { preHandler: app.requireAuth },
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

      // ── Forward to PlayGuard ─────────────────────────────────────────────
      const apiKey = env.PG_API_KEY;
      if (!apiKey) {
        req.log.error('PG_API_KEY not configured — KYC disabled');
        return reply.code(500).send({ error: 'KYC service not configured' });
      }

      const upstreamUrl = `${PG_PROXY_URL}/playguard/scan`;
      let pgRes: Response;
      try {
        pgRes = await fetch(upstreamUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Both header names are accepted by the proxy / backend; we send
            // both so this works whether the proxy forwards X-API-Key or the
            // legacy x-playguard-key header.
            'x-api-key': apiKey,
            'x-playguard-key': apiKey,
          },
          body: JSON.stringify({
            // The PlayGuard backend accepts either snake_case (selfie_b64)
            // or camelCase (image) — we send selfie_b64 to match the SPA.
            // playerId is the field actually persisted in the audit trail.
            selfie_b64: selfie,
            playerId: userId,
            externalId: userId,
            platform: 'congo-gaming',
          }),
          signal: AbortSignal.timeout(PG_PROXY_TIMEOUT_MS),
        });
      } catch (e: any) {
        req.log.error({ err: e, upstreamUrl }, 'PlayGuard upstream unreachable');
        return reply.code(502).send({
          error: 'PlayGuard unreachable',
          detail: e?.message || String(e),
          upstream: upstreamUrl,
        });
      }

      if (!pgRes.ok) {
        const text = await pgRes.text().catch(() => '');
        req.log.warn({ status: pgRes.status, body: text, upstreamUrl }, 'PlayGuard error');
        return reply.code(502).send({
          error: `PlayGuard scan failed (${pgRes.status})`,
          // Surface the upstream body so we can debug in the SPA console.
          // Capped at 500 chars to avoid leaking large stack traces.
          detail: text.slice(0, 500),
          upstream: upstreamUrl,
        });
      }

      const pgJson = (await pgRes.json().catch(() => null)) as
        | { success?: boolean; result?: PgScanResult }
        | null;
      if (!pgJson?.result) {
        return reply.code(502).send({ error: 'Malformed PlayGuard response' });
      }

      const result = pgJson.result;
      const { wireVerdict, kycStatus, block } = mapVerdict(result);

      const ageLow = result.age.range.Low;
      const ageHigh = result.age.range.High;
      const estimatedAge =
        result.age.estimatedAge ?? Math.round((ageLow + ageHigh) / 2);

      // ── Persist audit record ─────────────────────────────────────────────
      const { error: insertErr } = await supabaseAdmin.from('kyc_checks').insert({
        user_id: userId,
        verdict: wireVerdict,
        estimated_age: estimatedAge,
        age_low: ageLow,
        age_high: ageHigh,
        is_minor: result.age.isMinor,
        confidence: Number(result.faceConfidence?.toFixed?.(2) ?? result.faceConfidence ?? 0),
        scan_id: result.scanId,
      });
      if (insertErr) {
        // Don't fail the call on audit-log persistence issues, but log loudly.
        req.log.error({ err: insertErr }, 'kyc_checks insert failed');
      }

      // ── Update user ──────────────────────────────────────────────────────
      const userPatch: Record<string, unknown> = { kyc_status: kycStatus };
      if (block) userPatch.blocked = true;

      const { error: updateErr } = await supabaseAdmin
        .from('users')
        .update(userPatch)
        .eq('id', userId);
      if (updateErr) {
        req.log.error({ err: updateErr }, 'users update failed');
        return reply.code(500).send({ error: updateErr.message });
      }

      return reply.send({
        verdict: wireVerdict,
        kyc_status: kycStatus,
        estimated_age: estimatedAge,
        age_low: ageLow,
        age_high: ageHigh,
        is_minor: result.age.isMinor,
        scan_id: result.scanId,
        blocked: block,
      });
    },
  );
}
