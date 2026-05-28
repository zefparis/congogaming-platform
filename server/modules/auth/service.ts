import argon2 from 'argon2';
import { supabaseAdmin } from '../../lib/supabase.js';
import type { AuthUser } from './types.js';

import { env } from '../../env.js';

const MAX_LOGIN_FAILURES = env.AUTH_MAX_FAILURES;
const LOCKOUT_MINUTES = env.AUTH_LOCKOUT_MINUTES;

function sanitizeUser(row: Record<string, unknown>): AuthUser {
  return {
    id: String(row.id),
    phone: String(row.phone),
    balance_cdf: Number(row.balance_cdf ?? 0),
    kyc_status: (row.kyc_status as AuthUser['kyc_status']) || 'pending',
    blocked: Boolean(row.blocked),
  };
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
    .select('id, phone, balance_cdf, kyc_status, blocked')
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
    .select('id, phone, balance_cdf, pin_hash, kyc_status, blocked, auth_failed_count, auth_locked_until')
    .eq('phone', input.phone)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('INVALID_CREDENTIALS');
  if (data.blocked) throw new Error('ACCOUNT_BLOCKED');

  const lockedUntil = data.auth_locked_until ? new Date(String(data.auth_locked_until)) : null;
  if (lockedUntil && lockedUntil.getTime() > Date.now()) throw new Error('ACCOUNT_TEMP_LOCKED');

  const ok = await argon2.verify(String(data.pin_hash), input.pin).catch(() => false);
  if (!ok) {
    const failures = Number(data.auth_failed_count ?? 0) + 1;
    const patch: Record<string, unknown> = { auth_failed_count: failures };
    if (failures >= MAX_LOGIN_FAILURES) {
      patch.auth_locked_until = new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString();
    }
    await supabaseAdmin.from('users').update(patch).eq('id', data.id);
    throw new Error(failures >= MAX_LOGIN_FAILURES ? 'ACCOUNT_TEMP_LOCKED' : 'INVALID_CREDENTIALS');
  }

  await supabaseAdmin
    .from('users')
    .update({ auth_failed_count: 0, auth_locked_until: null, last_login_at: new Date().toISOString() })
    .eq('id', data.id);

  return sanitizeUser(data);
}

export async function getUserById(userId: string): Promise<AuthUser | null> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, phone, balance_cdf, kyc_status, blocked')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? sanitizeUser(data) : null;
}
