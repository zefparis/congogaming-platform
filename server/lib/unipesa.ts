import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { env as appEnv } from '../env.js';
import { callUnipesaResilient, type CallResult, type ResilientCallOptions } from './unipesa-resilience.js';

const BASE = 'https://api.unipesa.tech';

const PROXY_URL = appEnv.FIXIE_URL;
const proxyAgent = PROXY_URL ? new ProxyAgent(PROXY_URL) : null;
let _skipWarned = false;

function isSkipFixieCheck(): boolean {
  const v = appEnv.UNIPESA_SKIP_FIXIE_CHECK;
  return v === '1' || v === 'true';
}

const fetchWithProxy: typeof fetch = proxyAgent
  ? ((url: any, opts: any) =>
      undiciFetch(url, { ...(opts || {}), dispatcher: proxyAgent }) as any)
  : ((url: any, opts: any) => {
      // Hard block: no payment may leave without a Fixie proxy unless an
      // explicit, deliberate bypass flag is set. This check is independent
      // of NODE_ENV — it applies in all environments.
      if (isSkipFixieCheck()) {
        if (!_skipWarned) {
          _skipWarned = true;
          console.warn('[WARN] unipesa.ts: UNIPESA_SKIP_FIXIE_CHECK is set — Unipesa call bypassing Fixie proxy (direct connection). IP whitelisting is NOT active.');
        }
        return fetch(url, opts) as any;
      }
      throw new Error('FIXIE_PROXY_REQUIRED: FIXIE_URL is not set and UNIPESA_SKIP_FIXIE_CHECK is not enabled. Unipesa calls require the Fixie proxy for IP whitelisting.');
    });

export function calculateSignature(data: Record<string, any>, secretKey: string): string {
  let stringForSignature = '';
  // Sort keys alphabetically so the signature is deterministic regardless
  // of JS object iteration order (V8 preserves insertion order for string
  // keys, but the Unipesa provider and our test payloads may not share the
  // same key order). This prevents signature mismatches on callbacks where
  // the provider re-serializes the body in a different order.
  const sortedKeys = Object.keys(data).sort();
  for (const key of sortedKeys) {
    if (key === 'signature') continue;
    const value = data[key];
    if (value !== null && typeof value === 'object') {
      // Nested objects: sort their keys too for deterministic signing.
      for (const k of Object.keys(value).sort()) {
        stringForSignature += `${key}.${k}${value[k]}`;
      }
    } else {
      stringForSignature += `${key}${value}`;
    }
  }
  return createHmac('sha512', secretKey).update(stringForSignature).digest('hex').toLowerCase();
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export type UnipesaResponse = {
  status?: number;
  transaction_id?: string;
  message?: string;
  [k: string]: any;
};

async function call(
  path: string,
  payload: Record<string, any>,
  signal?: AbortSignal,
): Promise<UnipesaResponse> {
  const publicId = env('UNIPESA_PUBLIC_ID');
  const url = `${BASE}/${publicId}${path}`;
  // If the caller passes its own AbortSignal (resilience wrapper),
  // honour it. Otherwise fall back to a 30s safety net so background
  // jobs (reconciliation) do not hang forever.
  const effectiveSignal = signal ?? AbortSignal.timeout(30_000);
  const res = await fetchWithProxy(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: effectiveSignal,
  });
  const text = await res.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`Unipesa error ${res.status}: ${json?.message || text}`);
    (err as any).response = json;
    throw err;
  }
  // Unipesa returns HTTP 200 even when the provider call fails. The
  // result.code field is 0 on success and non-zero on failure (e.g.
  // 10301 = "REQUEST SENDING ERROR | get token error" when the
  // operator API is unreachable). Without this check, failed
  // provider calls are silently treated as "processing" and the
  // transaction gets stuck forever (no callback will ever arrive).
  //
  // IMPORTANT: this check only applies to payment INITIATION calls
  // (/payment_c2b, /payment_b2c). The /status endpoint also returns
  // a non-zero result.code when the TRANSACTION failed (e.g. 10301
  // for a failed Airtel withdrawal) — but the response still contains
  // the authoritative status (status=3) that the reconciliation job
  // needs to refund the user. Throwing on /status would prevent the
  // reconciliation job from ever resolving failed transactions.
  const isStatusEndpoint = path === '/status' || path === '/balance';
  if (!isStatusEndpoint && json?.result && typeof json.result === 'object') {
    const code = (json.result as any).code;
    const message = (json.result as any).message;
    if (code !== undefined && code !== 0 && code !== '0') {
      const err = new Error(`Unipesa provider error: code=${code} message=${message ?? '(no message)'}`);
      (err as any).response = json;
      throw err;
    }
  }
  return json;
}

export function newOrderId(): string {
  return randomUUID();
}

export async function paymentC2B(opts: {
  order_id: string;
  customer_id: string;
  amount: number;
  provider_id: number;
}, signal?: AbortSignal): Promise<UnipesaResponse> {
  const merchant_id = env('UNIPESA_MERCHANT_ID');
  const callback_url = env('UNIPESA_CALLBACK_URL');
  const secret = env('UNIPESA_SECRET_KEY');
  const payload: Record<string, any> = {
    merchant_id,
    customer_id: opts.customer_id,
    order_id: opts.order_id,
    amount: opts.amount,
    currency: 'CDF',
    country: 'CD',
    callback_url,
    provider_id: opts.provider_id,
  };
  payload.signature = calculateSignature(payload, secret);
  return call('/payment_c2b', payload, signal);
}

export async function paymentB2C(opts: {
  order_id: string;
  customer_id: string;
  amount: number;
  provider_id: number;
}, signal?: AbortSignal): Promise<UnipesaResponse> {
  const merchant_id = env('UNIPESA_MERCHANT_ID');
  const callback_url = env('UNIPESA_CALLBACK_URL');
  const secret = env('UNIPESA_SECRET_KEY');
  const payload: Record<string, any> = {
    merchant_id,
    customer_id: opts.customer_id,
    order_id: opts.order_id,
    amount: opts.amount,
    currency: 'CDF',
    country: 'CD',
    callback_url,
    provider_id: opts.provider_id,
  };
  payload.signature = calculateSignature(payload, secret);
  return call('/payment_b2c', payload, signal);
}

/**
 * Resilient wrappers for the user-flow paths.
 *
 * They go through `callUnipesaResilient` which enforces an 8s hard
 * timeout, the in-process circuit breaker, structured logs, and a
 * single short retry on immediate network failure.
 *
 * The raw `paymentC2B` / `paymentB2C` exports above remain available
 * for background jobs (reconciliation) that need a longer leash.
 */
export function paymentC2BResilient(
  opts: { order_id: string; customer_id: string; amount: number; provider_id: number },
  log?: ResilientCallOptions['log'],
): Promise<CallResult<UnipesaResponse>> {
  return callUnipesaResilient<UnipesaResponse>(
    (signal) => paymentC2B(opts, signal),
    { operation: 'payment_c2b', orderId: opts.order_id, log },
  );
}

export function paymentB2CResilient(
  opts: { order_id: string; customer_id: string; amount: number; provider_id: number },
  log?: ResilientCallOptions['log'],
): Promise<CallResult<UnipesaResponse>> {
  return callUnipesaResilient<UnipesaResponse>(
    (signal) => paymentB2C(opts, signal),
    { operation: 'payment_b2c', orderId: opts.order_id, log },
  );
}

export async function paymentStatus(order_id: string): Promise<UnipesaResponse> {
  const merchant_id = env('UNIPESA_MERCHANT_ID');
  const secret = env('UNIPESA_SECRET_KEY');
  const payload: Record<string, any> = { merchant_id, order_id };
  payload.signature = calculateSignature(payload, secret);
  return call('/status', payload);
}

/**
 * Fetch the AvadaPay / Unipesa merchant wallet balance.
 * Calls POST {BASE}/{publicId}/balance with a signed { merchant_id } body
 * via the Fixie static-IP proxy so the request leaves Render with the IP
 * whitelisted by Unipesa.
 *
 * Returns the balance in CDF (number), or throws on transport / auth errors.
 * The exact response shape varies across Unipesa deployments; this helper
 * normalises the most common keys ('balance', 'balance_cdf', 'amount').
 */
export async function getMerchantBalance(): Promise<{ balance_cdf: number; raw: UnipesaResponse }> {
  const merchant_id = env('UNIPESA_MERCHANT_ID');
  const secret = env('UNIPESA_SECRET_KEY');
  const payload: Record<string, any> = { merchant_id };
  payload.signature = calculateSignature(payload, secret);
  const raw = await call('/balance', payload);
  const candidates = [raw?.balance_cdf, raw?.balance, raw?.amount, raw?.data?.balance, raw?.data?.balance_cdf];
  const found = candidates.find((v) => v !== undefined && v !== null);
  const balance_cdf = Number(found ?? 0);
  return { balance_cdf: Number.isFinite(balance_cdf) ? balance_cdf : 0, raw };
}

export function verifyCallbackSignature(body: Record<string, any>): boolean {
  const secret = env('UNIPESA_SECRET_KEY');
  const provided = String(body?.signature || '').toLowerCase();
  if (!provided) return false;
  const expected = calculateSignature(body, secret).toLowerCase();
  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
