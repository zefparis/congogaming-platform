import argon2 from 'argon2';
import { supabaseAdmin } from '../../lib/supabase.js';
import type { AuthUser } from './types.js';

import { env } from '../../env.js';

const MAX_LOGIN_FAILURES = env.AUTH_MAX_FAILURES;
const LOCKOUT_MINUTES = env.AUTH_LOCKOUT_MINUTES;

export class AuthLockedError extends Error {
  lockedUntil: Date;
  retryAfterSeconds: number;
  constructor(lockedUntil: Date) {
    super('ACCOUNT_TEMP_LOCKED');
    this.lockedUntil = lockedUntil;
    this.retryAfterSeconds = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000));
  }
}

export class InvalidCredentialsError extends Error {
  attemptsRemaining: number;
  constructor(attemptsRemaining: number) {
    super('INVALID_CREDENTIALS');
    this.attemptsRemaining = attemptsRemaining;
  }
}

function sanitizeUser(row: Record<string, unknown>): AuthUser {
  return {
    id: String(row.id),
    phone: String(row.phone),
    display_name: row.display_name ? String(row.display_name) : null,
    balance_cdf: Number(row.balance_cdf ?? 0),
    kyc_status: (row.kyc_status as AuthUser['kyc_status']) || 'pending',
    blocked: Boolean(row.blocked),
  };
}

const DISPLAY_NAME_REGEX = /^[\p{L}\p{N}](?:[\p{L}\p{N} _.-]{0,22}[\p{L}\p{N}])?$/u;

export function normalizeDisplayName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

export async function updateDisplayName(userId: string, raw: string | null): Promise<AuthUser> {
  let value: string | null = null;
  if (raw !== null) {
    const normalized = normalizeDisplayName(raw);
    if (normalized.length < 2 || normalized.length > 24) throw new Error('DISPLAY_NAME_INVALID_LENGTH');
    if (!DISPLAY_NAME_REGEX.test(normalized)) throw new Error('DISPLAY_NAME_INVALID_CHARS');
    value = normalized;
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .update({ display_name: value })
    .eq('id', userId)
    .select('id, phone, display_name, balance_cdf, kyc_status, blocked')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') throw new Error('DISPLAY_NAME_TAKEN');
    if (error.code === '23514') throw new Error('DISPLAY_NAME_INVALID_LENGTH');
    throw new Error(error.message);
  }
  if (!data) throw new Error('USER_NOT_FOUND');
  return sanitizeUser(data);
}

export async function registerUser(input: { phone: string; pin: string }): Promise<AuthUser> {
  const pinHash = await argon2.hash(input.pin, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  const { data, error } = await supabaseAdmin
    .from('users')
    .insert({
      phone: input.phone,
      pin_hash: pinHash,
      balance_cdf: 0,
      kyc_status: 'pending',
      blocked: false,
      auth_failed_count: 0,
      auth_locked_until: null,
    })
    .select('id, phone, display_name, balance_cdf, kyc_status, blocked')
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('PHONE_ALREADY_REGISTERED');
    throw new Error(error.message);
  }
  return sanitizeUser(data);
}

export async function loginUser(input: { phone: string; pin: string }): Promise<AuthUser> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, phone, display_name, balance_cdf, pin_hash, kyc_status, blocked, auth_failed_count, auth_locked_until, pin_must_reset')
    .eq('phone', input.phone)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('INVALID_CREDENTIALS');
  if (data.blocked) throw new Error('ACCOUNT_BLOCKED');

  // Legacy SHA-256 hashes cannot be verified with Argon2; force the user
  // through the reset-PIN flow before any login attempt.
  const pinHash = String(data.pin_hash || '');
  const isLegacyHash = /^[a-f0-9]{64}$/i.test(pinHash);
  if (data.pin_must_reset || isLegacyHash) throw new Error('PIN_RESET_REQUIRED');

  const lockedUntil = data.auth_locked_until ? new Date(String(data.auth_locked_until)) : null;
  if (lockedUntil && lockedUntil.getTime() > Date.now()) throw new AuthLockedError(lockedUntil);

  const ok = await argon2.verify(pinHash, input.pin).catch(() => false);
  if (!ok) {
    const failures = Number(data.auth_failed_count ?? 0) + 1;
    const patch: Record<string, unknown> = { auth_failed_count: failures };
    let newLockedUntil: Date | null = null;
    if (failures >= MAX_LOGIN_FAILURES) {
      newLockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60_000);
      patch.auth_locked_until = newLockedUntil.toISOString();
    }
    await supabaseAdmin.from('users').update(patch).eq('id', data.id);
    if (newLockedUntil) throw new AuthLockedError(newLockedUntil);
    throw new InvalidCredentialsError(Math.max(0, MAX_LOGIN_FAILURES - failures));
  }

  await supabaseAdmin
    .from('users')
    .update({ auth_failed_count: 0, auth_locked_until: null, last_login_at: new Date().toISOString() })
    .eq('id', data.id);

  return sanitizeUser(data);
}

/**
 * Phone-based legacy PIN reset. Used by the frontend when login returns
 * `PIN_RESET_REQUIRED`. Allows reset only when the account is in legacy
 * state (`pin_must_reset = true` or pin_hash matches the SHA-256 64-hex
 * pattern). Always uses Argon2id for the new hash.
 */
export async function resetPinByPhone(input: { phone: string; newPin: string }): Promise<void> {
  if (!/^\d{4}$/.test(input.newPin)) throw new Error('INVALID_PIN_FORMAT');

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, pin_hash, pin_must_reset')
    .eq('phone', input.phone)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('USER_NOT_FOUND');

  const isLegacyHash = /^[a-f0-9]{64}$/i.test(String(data.pin_hash || ''));
  const mustReset = Boolean(data.pin_must_reset) || isLegacyHash;
  if (!mustReset) throw new Error('PIN_RESET_NOT_REQUIRED');

  await resetPin(String(data.id), input.newPin);
}

/**
 * Replace the user's PIN with a fresh Argon2id hash and clear the
 * `pin_must_reset` flag. Caller is responsible for verifying the user's
 * identity (KYC selfie match, OTP, admin action, etc.) BEFORE calling this.
 *
 * Throws if the user does not exist.
 */
export async function resetPin(userId: string, newPin: string): Promise<void> {
  const pinHash = await argon2.hash(newPin, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  const { data, error } = await supabaseAdmin
    .from('users')
    .update({
      pin_hash: pinHash,
      pin_must_reset: false,
      auth_failed_count: 0,
      auth_locked_until: null,
    })
    .eq('id', userId)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('USER_NOT_FOUND');
}

export async function getUserById(userId: string): Promise<AuthUser | null> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, phone, display_name, balance_cdf, kyc_status, blocked')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? sanitizeUser(data) : null;
}
