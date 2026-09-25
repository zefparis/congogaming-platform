import dotenv from 'dotenv';
import { z } from 'zod';

// Test runs (`node --test` / `npx tsx --test`) spawn child processes with
// NODE_TEST_CONTEXT set — only then load the committed .env.test, which
// contains fake values only. dotenv never overrides real env vars.
// Path resolved from cwd: tests are run from the repo root.
if (process.env.NODE_TEST_CONTEXT) {
  dotenv.config({ path: '.env.test' });
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform((val) => Number(val)).pipe(z.number().int().positive()).default('3001'),
  HOST: z.string().default('0.0.0.0'),
  JWT_SECRET: z.string().min(64, 'JWT_SECRET must be at least 64 characters'),
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SERVICE_KEY: z.string().min(1, 'SUPABASE_SERVICE_KEY is required'),
  UNIPESA_PUBLIC_ID: z.string().min(1, 'UNIPESA_PUBLIC_ID is required'),
  UNIPESA_MERCHANT_ID: z.string().min(1, 'UNIPESA_MERCHANT_ID is required'),
  UNIPESA_SECRET_KEY: z.string().min(1, 'UNIPESA_SECRET_KEY is required'),
  UNIPESA_CALLBACK_URL: z.string().url('UNIPESA_CALLBACK_URL must be a valid URL'),
  FIXIE_URL: z.string().optional(),
  // Explicit bypass for local dev/mock only. When set to '1' or 'true',
  // Unipesa calls skip the Fixie proxy requirement. MUST NOT be set in
  // production — a [WARN] is logged at boot and at each bypassed call.
  UNIPESA_SKIP_FIXIE_CHECK: z.string().optional(),
  // DEPRECATED — the PlayGuard integration has been removed (KYC is now a
  // manual admin review). Kept optional so stale env vars don't break boot.
  PG_API_KEY: z.string().optional(),
  PG_PROXY_URL: z.string().url('PG_PROXY_URL must be a valid URL').optional(),
  ALLOWED_ORIGINS: z.string().optional(),
  // Cookie domain for the auth JWT. Set to '.congogaming.com' in production so
  // the cookie is shared with api.congogaming.com (same-site, SameSite=Lax).
  // Leave unset for local dev (host-only cookie on localhost).
  COOKIE_DOMAIN: z.string().optional(),
  LOTO_ADMIN_SECRET: z.string().optional(),
  AUTH_MAX_FAILURES: z.string().transform((val) => Number(val)).pipe(z.number().int().positive()).default('5'),
  AUTH_LOCKOUT_MINUTES: z.string().transform((val) => Number(val)).pipe(z.number().int().positive()).default('15'),
  // Mobile gaming app: default to 15 min; override via env var for longer sessions.
  // Never raise above 86400 (24h) without a token revocation mechanism.
  ACCESS_TOKEN_TTL_SECONDS: z.string().transform((val) => Number(val)).pipe(z.number().int().positive()).default('900'),
  VITE_API_URL: z.string().optional(),
  // UniPay CGLT gaming integration (server-to-server; key must NOT be bundled)
  UNIPAY_API_URL: z.string().url().optional(),
  // Trust boundary 1 sender: CongoGaming → UniPay API (new dedicated key)
  CONGOGAMING_UNIPAY_API_KEY: z.string().min(8).optional(),
  // LEGACY — kept for dual-key rotation only; replaced by CONGOGAMING_UNIPAY_API_KEY
  GAMING_API_KEY: z.string().min(8).optional(),
  // Feature flags. Defaults preserve the production behaviour; set the
  // env var explicitly per environment to flip the flag.
  OKAPI_COLOR_ENABLED: z
    .string()
    .transform((val) => val.toLowerCase() === 'true')
    .default('true'),
  OKAPI_COLOR_ADMIN_SECRET: z.string().optional(),
  OKAPI_COLOR_JACKPOT_CDF: z
    .string()
    .transform((val) => Number(val))
    .pipe(z.number().int().positive())
    .optional(),
  OKAPI_COLOR_CONTRIBUTION_CDF: z
    .string()
    .transform((val) => Number(val))
    .pipe(z.number().int().nonnegative())
    .optional(),
  OKAPI_COLOR_DRAW_INTERVAL_SECONDS: z
    .string()
    .transform((val) => Number(val))
    .pipe(z.number().int().positive())
    .optional(),
  OKAPI_COLOR_CLOSE_BEFORE_SECONDS: z
    .string()
    .transform((val) => Number(val))
    .pipe(z.number().int().nonnegative())
    .optional(),
  OKAPI_COLOR_RESULT_DISPLAY_SECONDS: z
    .string()
    .transform((val) => Number(val))
    .pipe(z.number().int().nonnegative())
    .optional(),
  OKAPI_COLOR_DRAWING_WINDOW_SECONDS: z
    .string()
    .transform((val) => Number(val))
    .pipe(z.number().int().positive())
    .optional(),
  REFERRAL_PROGRAM_ENABLED: z
    .string()
    .transform((val) => val.toLowerCase() !== 'false')
    .default('true'),
  // Kill switch for agent commissions (ticket + win). When 'false',
  // recordAgentCommission / recordAgentWinCommission become no-ops —
  // everything else (agent dashboard, payout requests, admin) keeps working.
  AGENT_COMMISSIONS_ENABLED: z
    .string()
    .transform((val) => val.toLowerCase() !== 'false')
    .default('true'),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function loadEnv(): Env {
  if (cachedEnv) return cachedEnv;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('\n');
    console.error('❌ Invalid environment configuration:\n' + errors);
    process.exit(1);
  }

  cachedEnv = result.data;
  return cachedEnv;
}

export const env = loadEnv();
