import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform((val) => Number(val)).pipe(z.number().int().positive()).default('3001'),
  HOST: z.string().default('0.0.0.0'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SERVICE_KEY: z.string().min(1, 'SUPABASE_SERVICE_KEY is required'),
  UNIPESA_PUBLIC_ID: z.string().min(1, 'UNIPESA_PUBLIC_ID is required'),
  UNIPESA_MERCHANT_ID: z.string().min(1, 'UNIPESA_MERCHANT_ID is required'),
  UNIPESA_SECRET_KEY: z.string().min(1, 'UNIPESA_SECRET_KEY is required'),
  UNIPESA_CALLBACK_URL: z.string().url('UNIPESA_CALLBACK_URL must be a valid URL'),
  FIXIE_URL: z.string().optional(),
  PG_API_KEY: z.string().min(1, 'PG_API_KEY is required'),
  PG_PROXY_URL: z.string().url('PG_PROXY_URL must be a valid URL').optional(),
  ALLOWED_ORIGINS: z.string().optional(),
  LOTO_ADMIN_SECRET: z.string().optional(),
  LOTO_JACKPOT_CDF: z.string().transform((val) => Number(val)).pipe(z.number().int().positive()).optional(),
  LOTO_MIN_TICKETS: z.string().transform((val) => Number(val)).pipe(z.number().int().nonnegative()).optional(),
  FLASH_ADMIN_SECRET: z.string().optional(),
  FLASH_JACKPOT_CDF: z.string().transform((val) => Number(val)).pipe(z.number().int().positive()).optional(),
  FLASH_MIN_TICKETS: z.string().transform((val) => Number(val)).pipe(z.number().int().nonnegative()).optional(),
  AUTH_MAX_FAILURES: z.string().transform((val) => Number(val)).pipe(z.number().int().positive()).default('5'),
  AUTH_LOCKOUT_MINUTES: z.string().transform((val) => Number(val)).pipe(z.number().int().positive()).default('15'),
  ACCESS_TOKEN_TTL_SECONDS: z.string().transform((val) => Number(val)).pipe(z.number().int().positive()).default('900'),
  VITE_API_URL: z.string().optional(),
  VITE_WS_URL: z.string().optional(),
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
