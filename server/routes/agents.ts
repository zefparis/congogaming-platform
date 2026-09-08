import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { env } from '../env.js';

// ---- Agent token (stateless, HMAC-signed) ----
//
// Tokens are stateless: HMAC(JWT_SECRET, "agent|<agent_id>|<issued_ms>|<nonce>")
// This keeps things simple (no DB table) and ensures that rotating the
// JWT_SECRET invalidates outstanding agent tokens.

const AGENT_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function signAgentToken(agentId: string): string {
  const issued = Date.now().toString();
  const nonce = randomBytes(8).toString('hex');
  const body = `${issued}.${agentId}.${nonce}`;
  const sig = createHmac('sha256', env.JWT_SECRET).update(body).digest('hex');
  return `${body}.${sig}`;
}

function verifyAgentToken(token: string): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [issued, agentId, nonce, sig] = parts;
  const issuedMs = Number(issued);
  if (!Number.isFinite(issuedMs)) return null;
  if (Date.now() - issuedMs > AGENT_TOKEN_TTL_MS) return null;
  if (!agentId) return null;
  const expected = createHmac('sha256', env.JWT_SECRET)
    .update(`${issued}.${agentId}.${nonce}`)
    .digest('hex');
  try {
    const ok = timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
    if (!ok) return null;
  } catch {
    return null;
  }
  return agentId;
}

function extractAgentToken(req: FastifyRequest): string | null {
  const auth = req.headers.authorization;
  if (typeof auth === 'string') {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m?.[1]) return m[1];
  }
  return null;
}

const AgentAuthSchema = z.object({
  pin: z.string().regex(/^\d{4,6}$/, 'PIN must be 4-6 digits'),
});

export default async function agentsPublicRoutes(app: FastifyInstance) {
  // POST /api/agents/:qrCode/auth — exchange PIN for a session token
  //
  // Dedicated rate limit: 5 attempts / 15 min per (QR code + IP).
  // The PIN space is only 4-6 digits (10^4 to 10^6), so the global 600/min
  // limiter would allow a distributed brute-force. This per-QR+IP limit
  // caps an attacker at 5 guesses per 15 min per identity, with the
  // shared-IP (CGNAT) dimension still bounded by the QR-code key.
  app.post<{ Params: { qrCode: string } }>(
    '/api/agents/:qrCode/auth',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '15 minutes',
          keyGenerator: (req: FastifyRequest) => {
            const qr = (req.params as { qrCode?: string })?.qrCode?.toUpperCase() || 'unknown';
            const xff = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
            return `agent-auth:${qr}:${xff || req.ip}`;
          },
        },
      },
    },
    async (req, reply) => {
      const { qrCode } = req.params;
      const parsed = AgentAuthSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues[0]?.message || 'Invalid body' });
      }

      const { data: agent, error } = await supabaseAdmin
        .from('agents')
        .select('id, status, agent_pin_hash')
        .eq('qr_code', qrCode.toUpperCase())
        .eq('status', 'active')
        .maybeSingle();
      if (error || !agent) return reply.code(404).send({ error: 'Agent introuvable' });

      if (!agent.agent_pin_hash) {
        return reply.code(403).send({ error: 'No PIN set for this agent. Contact support.', code: 'NO_PIN_SET' });
      }

      const ok = await argon2.verify(String(agent.agent_pin_hash), parsed.data.pin).catch(() => false);
      if (!ok) {
        return reply.code(401).send({ error: 'Invalid PIN', code: 'INVALID_PIN' });
      }

      const token = signAgentToken(String(agent.id));
      return reply.send({ token, expires_in_seconds: Math.floor(AGENT_TOKEN_TTL_MS / 1000) });
    },
  );

  // GET /api/agents/:qrCode — agent stats (requires agent auth)
  app.get<{ Params: { qrCode: string } }>(
    '/api/agents/:qrCode',
    async (req, reply) => {
      const { qrCode } = req.params;

      // Look up agent first (needed to verify token belongs to this agent)
      const { data: agent, error } = await supabaseAdmin
        .from('agents')
        .select('id, display_name, zone, status, total_earned_cdf, commission_rate, phone, operator, notes, min_payout_cdf, payout_requested_at, payout_requested_amount_cdf')
        .eq('qr_code', qrCode.toUpperCase())
        .eq('status', 'active')
        .maybeSingle();
      if (error || !agent) return reply.code(404).send({ error: 'Agent introuvable' });

      // Require agent auth — token must belong to this specific agent
      const token = extractAgentToken(req);
      if (!token) {
        return reply.code(401).send({ error: 'Agent authentication required', code: 'AGENT_AUTH_REQUIRED' });
      }
      const tokenAgentId = verifyAgentToken(token);
      if (!tokenAgentId || tokenAgentId !== String(agent.id)) {
        return reply.code(401).send({ error: 'Invalid or expired agent token', code: 'AGENT_AUTH_INVALID' });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [{ data: todayRows }, { data: allPendingRows }, { data: recentRows }] = await Promise.all([
        supabaseAdmin
          .from('agent_commissions')
          .select('commission_cdf')
          .eq('agent_id', agent.id)
          .gte('created_at', today.toISOString()),
        supabaseAdmin
          .from('agent_commissions')
          .select('commission_cdf')
          .eq('agent_id', agent.id)
          .eq('status', 'pending'),
        supabaseAdmin
          .from('agent_commissions')
          .select('ticket_type, ticket_amount_cdf, commission_cdf, commission_type, status, created_at')
          .eq('agent_id', agent.id)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      const today_earned_cdf = (todayRows || []).reduce((s, c) => s + Number(c.commission_cdf), 0);
      const pending_cdf      = (allPendingRows || []).reduce((s, c) => s + Number(c.commission_cdf), 0);

      const totalEarned = Number(agent.total_earned_cdf);
      let tier: string;
      if      (totalEarned >= 5000000) tier = 'diamond';
      else if (totalEarned >= 1000000) tier = 'gold';
      else                             tier = 'standard';

      const tierThresholds: Record<string, number | null> = {
        standard: 1000000, gold: 5000000, diamond: null,
      };
      const next_tier_cdf = tierThresholds[tier];

      return reply.send({
        agent,
        today_earned_cdf,
        pending_cdf,
        tier,
        next_tier_cdf,
        recent: recentRows || [],
      });
    },
  );

  // POST /api/agents/:qrCode/request-payout — requires agent auth
  //
  // Uses request_agent_payout_atomic RPC (SELECT FOR UPDATE) to prevent
  // double-payout from concurrent requests (double-click, retry, parallel).
  app.post<{ Params: { qrCode: string } }>(
    '/api/agents/:qrCode/request-payout',
    async (req, reply) => {
      const { qrCode } = req.params;

      const { data: agent, error } = await supabaseAdmin
        .from('agents')
        .select('id, status, min_payout_cdf')
        .eq('qr_code', qrCode.toUpperCase())
        .eq('status', 'active')
        .maybeSingle();
      if (error || !agent) return reply.code(404).send({ error: 'Agent introuvable' });

      // Require agent auth — token must belong to this specific agent
      const token = extractAgentToken(req);
      if (!token) {
        return reply.code(401).send({ error: 'Agent authentication required', code: 'AGENT_AUTH_REQUIRED' });
      }
      const tokenAgentId = verifyAgentToken(token);
      if (!tokenAgentId || tokenAgentId !== String(agent.id)) {
        return reply.code(401).send({ error: 'Invalid or expired agent token', code: 'AGENT_AUTH_INVALID' });
      }

      // Atomic payout request via RPC (SELECT FOR UPDATE on the agent row).
      const { data: result, error: rpcErr } = await supabaseAdmin
        .rpc('request_agent_payout_atomic', {
          p_agent_id: agent.id,
          p_min_payout_cdf: Number(agent.min_payout_cdf ?? 2000),
        });

      if (rpcErr) {
        req.log.error({ err: rpcErr.message, agent_id: agent.id }, '[agents/payout] RPC failed');
        return reply.code(500).send({ error: rpcErr.message });
      }

      const row = (result || [])[0] as
        | { ok: boolean; code: string | null; amount: number; minimum: number; current: number }
        | undefined;
      if (!row) {
        req.log.error({ agent_id: agent.id }, '[agents/payout] RPC returned no row');
        return reply.code(500).send({ error: 'payout_rpc_no_result' });
      }

      if (!row.ok) {
        if (row.code === 'ALREADY_REQUESTED') return reply.code(400).send({ code: 'ALREADY_REQUESTED' });
        if (row.code === 'BELOW_MINIMUM')     return reply.code(400).send({ code: 'BELOW_MINIMUM', minimum: row.minimum, current: row.current });
        if (row.code === 'AGENT_NOT_FOUND')   return reply.code(404).send({ error: 'Agent introuvable' });
        return reply.code(500).send({ error: row.code || 'payout_failed' });
      }

      return reply.send({ ok: true, amount: row.amount });
    },
  );
}
