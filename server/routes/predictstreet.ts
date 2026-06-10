import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../lib/supabase.js';

const KID = 'cgl-ps-v1';
const ISS = 'https://api.congogaming.com';
const AUD = 'predictstreet-prod';
const TTL = 300; // 5 minutes

/* ── Module-level RSA state (populated once at plugin init) ─────────────── */
let _privateKeyPem = '';
let _publicJwk: {
  kty: string; use: string; alg: string; kid: string; n: string; e: string;
} | null = null;

function initKeys(log: FastifyInstance['log']): void {
  const envKey = process.env.PREDICTSTREET_RSA_PRIVATE_KEY;

  if (envKey && envKey.trim()) {
    // Support both literal newlines and escaped \n from Railway secrets
    _privateKeyPem = envKey.replace(/\\n/g, '\n');
    log.info('[predictstreet] Loaded RSA private key from PREDICTSTREET_RSA_PRIVATE_KEY');
  } else {
    // Generate ephemeral RSA-2048 keypair — rotates on every restart.
    // Set PREDICTSTREET_RSA_PRIVATE_KEY in Railway for a stable key.
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    _privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    log.warn('[predictstreet] No PREDICTSTREET_RSA_PRIVATE_KEY set — using ephemeral keypair (JWKS changes on restart)');
  }

  const jwk = crypto.createPublicKey(_privateKeyPem).export({ format: 'jwk' }) as {
    kty: string; n: string; e: string;
  };
  _publicJwk = { kty: 'RSA', use: 'sig', alg: 'RS256', kid: KID, n: jwk.n, e: jwk.e };
  log.info('[predictstreet] JWKS ready — kid=%s iss=%s aud=%s ttl=%ds', KID, ISS, AUD, TTL);
}

/* ── RS256 JWT mint — pure Node.js crypto, no external deps ────────────── */
function mintRS256(userId: string): string {
  const now  = Math.floor(Date.now() / 1000);
  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: KID })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: ISS,
    aud: AUD,
    sub: userId,
    iat: now,
    exp: now + TTL,
    jti: crypto.randomUUID(),
  })).toString('base64url');
  const signingInput = `${header}.${payload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  const sig = signer.sign(_privateKeyPem).toString('base64url');
  return `${signingInput}.${sig}`;
}

/* ── Fastify plugin ─────────────────────────────────────────────────────── */
export default async function predictstreetRoutes(app: FastifyInstance) {
  initKeys(app.log);

  /* ────────────────────────────────────────────────────────────────────────
   * GET /.well-known/jwks.json
   * Public — PredictStreet fetches this to verify our JWTs.
   * Cache-Control: 1 h so they don't hammer us.
   * ──────────────────────────────────────────────────────────────────────── */
  app.get('/.well-known/jwks.json', async (_req, reply) => {
    reply.header('Cache-Control', 'public, max-age=3600');
    return { keys: [_publicJwk] };
  });

  /* ────────────────────────────────────────────────────────────────────────
   * POST /api/predictstreet/token
   * Authenticated via cg_access_token cookie (or Bearer header).
   * Mints a fresh RS256 JWT for the current user — never cached.
   * ──────────────────────────────────────────────────────────────────────── */
  app.post('/api/predictstreet/token', { preHandler: app.requireAuth }, async (req, reply) => {
    const jwt = mintRS256(req.user.id);
    // Security: never log the full token — only non-sensitive metadata
    app.log.info(
      { sub_prefix: req.user.id.slice(0, 8), kid: KID, ttl: TTL },
      '[predictstreet] JWT minted',
    );
    return reply.send({ token: jwt });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * GET /api/predictstreet/users/:provider_user_id/limits
   * Server-to-server endpoint called by PredictStreet backend.
   * Auth: Bearer == PREDICTSTREET_SERVER_SECRET (fixed shared secret).
   * ──────────────────────────────────────────────────────────────────────── */
  app.get<{ Params: { provider_user_id: string } }>(
    '/api/predictstreet/users/:provider_user_id/limits',
    async (req, reply) => {
      const secret = process.env.PREDICTSTREET_SERVER_SECRET;
      if (!secret) {
        return reply.code(503).send({ error: 'Limits API not configured — set PREDICTSTREET_SERVER_SECRET' });
      }

      // Constant-time comparison to prevent timing attacks
      const provided = req.headers.authorization ?? '';
      const expected = `Bearer ${secret}`;
      const a = Buffer.from(provided.padEnd(expected.length));
      const b = Buffer.from(expected.padEnd(provided.length));
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const { provider_user_id } = req.params;

      // Verify user exists
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('id', provider_user_id)
        .maybeSingle();

      if (!user) return reply.code(404).send({ error: 'User not found' });

      // Fetch per-user limits (falls back to platform defaults if no row)
      const { data: limits } = await supabaseAdmin
        .from('predictstreet_limits')
        .select('*')
        .eq('user_id', provider_user_id)
        .maybeSingle();

      return reply.send({
        provider_user_id,
        deposit_limit:    String(limits?.deposit_limit    ?? '1000.00'),
        deposit_consumed: String(limits?.deposit_consumed ?? '0.00'),
        trade_limit:      String(limits?.trade_limit      ?? '500'),
        trade_consumed:   String(limits?.trade_consumed   ?? '0'),
        eligible:         limits?.eligible   ?? true,
        kyc_status:       limits?.kyc_status ?? 'approved',
        updated_at:       limits?.updated_at ?? new Date().toISOString(),
      });
    },
  );
}
