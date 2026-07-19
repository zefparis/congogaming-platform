import { env } from '../env.js';
import { supabaseAdmin } from './supabase.js';

/**
 * Server-to-server client for the UniPay CGLT gaming integration.
 *
 * SECURITY: the shared secret lives ONLY here, server-side.
 * It must never be bundled into the Vite client. The browser talks to our own
 * Fastify routes; those routes call UniPay through this module.
 *
 * Trust boundary 1: CongoGaming → UniPay API.
 * Uses CONGOGAMING_UNIPAY_API_KEY (new) with legacy GAMING_API_KEY fallback.
 */

const UNIPAY_API = env.UNIPAY_API_URL ?? 'https://unipay-api.onrender.com';

/**
 * Resolve the API key for UniPay calls.
 * Priority: CONGOGAMING_UNIPAY_API_KEY (new) → GAMING_API_KEY (legacy fallback).
 * Logs a warning when the legacy key is used (no secret value in log).
 */
function resolveUnipayApiKey(): string | null {
  const newKey = env.CONGOGAMING_UNIPAY_API_KEY;
  const legacyKey = env.GAMING_API_KEY;
  if (newKey) return newKey;
  if (legacyKey) {
    console.warn('[LEGACY_API_KEY_USED] boundary=congogaming_to_unipay — using legacy GAMING_API_KEY fallback');
    return legacyKey;
  }
  return null;
}

export interface CgltBalance {
  phone: string;
  cglt_balance: number;
  equivalent_usdt: number | null;
}

export interface CgltDebitResult {
  success: boolean;
  new_balance: number;
  tx_ref: string;
}

export interface CgltCreditResult {
  success: boolean;
  new_balance: number;
  blockchain_tx_hash: string | null;
}

export class CgltError extends Error {
  constructor(public code: string, public status: number) {
    super(code);
    this.name = 'CgltError';
  }
}

function assertConfigured(): string {
  const key = resolveUnipayApiKey();
  if (!key) {
    throw new CgltError('CGLT_NOT_CONFIGURED', 503);
  }
  return key;
}

/**
 * Convert a canonical DRC phone (`0XXXXXXXXX`) to the E.164 form UniPay
 * expects (`+243XXXXXXXXX`).
 */
export function toUnipayPhone(canonicalPhone: string): string {
  const digits = canonicalPhone.replace(/[^\d]/g, '');
  const local = digits.startsWith('0') ? digits.slice(1) : digits;
  return `+243${local}`;
}

/** Resolve a Congo Gaming user_id to their UniPay (+243) phone. */
export async function getUserUnipayPhone(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('users')
    .select('phone')
    .eq('id', userId)
    .maybeSingle();
  if (!data?.phone) return null;
  return toUnipayPhone(String(data.phone));
}

async function call<T>(path: string, init: RequestInit): Promise<T> {
  const key = assertConfigured();
  const res = await fetch(`${UNIPAY_API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new CgltError(body?.error ?? 'CGLT_REQUEST_FAILED', res.status);
  }
  return body as T;
}

export async function getCGLTBalance(phone: string): Promise<CgltBalance> {
  return call<CgltBalance>(`/v1/wallet/cglt-balance?phone=${encodeURIComponent(phone)}`, {
    method: 'GET',
  });
}

export async function debitCGLT(phone: string, amount: number, gameRef: string): Promise<CgltDebitResult> {
  return call<CgltDebitResult>('/v1/wallet/cglt-debit', {
    method: 'POST',
    body: JSON.stringify({ phone, amount, game_ref: gameRef }),
  });
}

export async function creditCGLT(
  phone: string,
  amount: number,
  gameRef: string,
  txRef: string,
): Promise<CgltCreditResult> {
  return call<CgltCreditResult>('/v1/wallet/cglt-credit', {
    method: 'POST',
    body: JSON.stringify({ phone, amount, game_ref: gameRef, tx_ref: txRef }),
  });
}
