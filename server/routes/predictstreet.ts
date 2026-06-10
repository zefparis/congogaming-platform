import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
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

  // Capture raw body for webhook HMAC verification (scoped to this plugin only).
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req: FastifyRequest, body: string, done) => {
    (req as FastifyRequest & { _rawBody: string })._rawBody = body;
    try {
      done(null, JSON.parse(body));
    } catch (e) {
      done(e as Error);
    }
  });

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
   * Bearer-token auth helper — constant-time, supports both vars.
   * ──────────────────────────────────────────────────────────────────────── */
  function verifyBearerToken(authHeader: string | undefined): boolean {
    const secret = process.env.PREDICTSTREET_BEARER_TOKEN
                ?? process.env.PREDICTSTREET_SERVER_SECRET;
    if (!secret) return false;

    const provided = authHeader ?? '';
    const expected = `Bearer ${secret}`;
    const maxLen   = Math.max(provided.length, expected.length);
    const a = Buffer.from(provided.padEnd(maxLen));
    const b = Buffer.from(expected.padEnd(maxLen));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  /* ────────────────────────────────────────────────────────────────────────
   * GET /api/predictstreet/users/:provider_user_id/limits
   * Server-to-server. Auth: Bearer PREDICTSTREET_BEARER_TOKEN.
   * Returns real month-to-date deposit/withdrawal consumed from transactions.
   * ──────────────────────────────────────────────────────────────────────── */
  app.get<{ Params: { provider_user_id: string } }>(
    '/api/predictstreet/users/:provider_user_id/limits',
    async (req, reply) => {
      if (!verifyBearerToken(req.headers.authorization)) {
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

      // Start of current calendar month (UTC)
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const monthStartIso = monthStart.toISOString();

      // Per-user limits row + month-to-date aggregates in parallel
      const [limitsRes, depositRes, withdrawalRes] = await Promise.all([
        supabaseAdmin
          .from('predictstreet_limits')
          .select('deposit_limit, withdrawal_limit, kyc_status, eligible, updated_at')
          .eq('user_id', provider_user_id)
          .maybeSingle(),

        supabaseAdmin
          .from('transactions')
          .select('amount')
          .eq('user_id', provider_user_id)
          .eq('type', 'deposit')
          .eq('status', 2)
          .gte('created_at', monthStartIso),

        supabaseAdmin
          .from('transactions')
          .select('amount')
          .eq('user_id', provider_user_id)
          .eq('type', 'withdrawal')
          .eq('status', 2)
          .gte('created_at', monthStartIso),
      ]);

      const limits = limitsRes.data;
      const depositConsumed    = (depositRes.data    ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
      const withdrawalConsumed = (withdrawalRes.data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);

      return reply.send({
        provider_user_id,
        deposit_limit:         Number(limits?.deposit_limit    ?? 500),
        deposit_consumed:      depositConsumed,
        withdrawal_limit:      Number(limits?.withdrawal_limit ?? 500),
        withdrawal_consumed:   withdrawalConsumed,
        kyc_status:            limits?.kyc_status ?? 'approved',
        eligible:              limits?.eligible   ?? true,
        updated_at:            limits?.updated_at ?? new Date().toISOString(),
      });
    },
  );

  /* ────────────────────────────────────────────────────────────────────────
   * POST /api/predictstreet/limits/webhook
   * Inbound webhook from PredictStreet when a limit or eligibility changes.
   * Auth: X-Partner-Id + X-Limits-Signature: sha256=<HMAC-SHA256 body>
   * Dedup: event id stored in predictstreet_events (idempotent).
   * ──────────────────────────────────────────────────────────────────────── */
  app.post(
    '/api/predictstreet/limits/webhook',
    async (req, reply) => {
      const webhookSecret = process.env.PREDICTSTREET_WEBHOOK_SECRET;
      if (!webhookSecret) {
        app.log.warn('[predictstreet] PREDICTSTREET_WEBHOOK_SECRET not set — webhook rejected');
        return reply.code(503).send({ error: 'Webhook not configured' });
      }

      // ── Verify partner identity ──────────────────────────────────────────
      const partnerId = req.headers['x-partner-id'];
      if (partnerId !== 'congo-gaming') {
        return reply.code(403).send({ error: 'Invalid partner' });
      }

      // ── Verify HMAC-SHA256 signature ──────────────────────────────────────
      const rawSig = req.headers['x-limits-signature'];
      if (typeof rawSig !== 'string' || !rawSig.startsWith('sha256=')) {
        return reply.code(401).send({ error: 'Missing signature' });
      }

      const bodyStr = (req as FastifyRequest & { _rawBody?: string })._rawBody
                     ?? JSON.stringify(req.body);

      const expected  = 'sha256=' + crypto.createHmac('sha256', webhookSecret).update(bodyStr).digest('hex');
      const provided  = rawSig;
      const eqLen     = Math.max(expected.length, provided.length);
      const eBuf      = Buffer.from(expected.padEnd(eqLen));
      const pBuf      = Buffer.from(provided.padEnd(eqLen));
      if (eBuf.length !== pBuf.length || !crypto.timingSafeEqual(eBuf, pBuf)) {
        app.log.warn({ partnerId }, '[predictstreet] Invalid webhook signature');
        return reply.code(401).send({ error: 'Invalid signature' });
      }

      // ── Parse & validate body ─────────────────────────────────────────────
      const body = req.body as { id?: unknown; event?: unknown; subject?: unknown };
      const { id, event, subject } = body;

      if (!id || !event || !subject) {
        return reply.code(400).send({ error: 'Missing required fields: id, event, subject' });
      }
      if (event !== 'limit_changed' && event !== 'eligibility_changed') {
        return reply.code(400).send({ error: 'Unknown event type' });
      }

      // ── Deduplication ─────────────────────────────────────────────────────
      const { error: insertErr } = await supabaseAdmin
        .from('predictstreet_events')
        .insert({ id: String(id), event: String(event), subject: String(subject) });

      if (insertErr) {
        if (insertErr.code === '23505') {
          // Duplicate event — acknowledge without reprocessing
          app.log.info({ id, event }, '[predictstreet] duplicate webhook event — skipped');
          return reply.code(200).send({ received: true, duplicate: true });
        }
        app.log.error({ insertErr }, '[predictstreet] webhook insert error');
        return reply.code(500).send({ error: 'Internal error' });
      }

      app.log.info({ id, event, subject }, '[predictstreet] webhook event received');

      return reply.code(200).send({ received: true });
    },
  );
}
