const API_BASE = import.meta.env.VITE_API_URL || 'https://api.congogaming.com';

export type KycStatus = 'pending' | 'approved' | 'denied' | 'verify_age';

export type SessionUser = {
  id: string;
  phone: string;
  balance_cdf: number;
  kyc_status: KycStatus;
  blocked: boolean;
};

let currentUser: SessionUser | null = null;

export class AuthApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function authRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!res.ok) {
    throw new AuthApiError(json?.error || `HTTP ${res.status}`, res.status, json?.code);
  }
  return json as T;
}

export function validateCongoPhone(phone: string): boolean {
  const p = phone.replace(/\s+/g, '');
  return /^0(8[4-9]|9[0-9])\d{7}$/.test(p);
}

export function detectOperator(phone: string): 'Orange' | 'Airtel' | 'Africell' | null {
  const p = phone.replace(/\s/g, '');
  if (/^08[4-9]/.test(p)) return 'Orange';
  if (/^09[7-9]/.test(p)) return 'Airtel';
  if (/^09[0-3]/.test(p)) return 'Africell';
  return null;
}

export function saveSession(user: SessionUser) {
  currentUser = user;
}

export function getSession(): SessionUser | null {
  return currentUser;
}

export async function clearSession() {
  currentUser = null;
  await authRequest<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }).catch(() => ({ ok: true }));
}

export async function registerUser(phone: string, pin: string): Promise<SessionUser> {
  const { user } = await authRequest<{ user: SessionUser }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ phone, pin, adult: true }),
  });
  currentUser = user;
  return user;
}

export async function loginUser(phone: string, pin: string): Promise<SessionUser> {
  const { user } = await authRequest<{ user: SessionUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ phone, pin }),
  });
  currentUser = user;
  return user;
}

export async function resetPinByPhone(phone: string, newPin: string): Promise<void> {
  await authRequest<{ ok: boolean; message: string }>('/api/auth/reset-pin', {
    method: 'POST',
    body: JSON.stringify({ phone, newPin }),
  });
}

export async function refreshSession(): Promise<SessionUser | null> {
  try {
    const { user } = await authRequest<{ user: SessionUser }>('/api/auth/me');
    currentUser = user;
    return user;
  } catch {
    currentUser = null;
    return null;
  }
}

export async function refreshKycStatus(_userId?: string): Promise<KycStatus> {
  const user = await refreshSession();
  return user?.kyc_status || 'pending';
}

export async function refreshBalance(_userId?: string): Promise<number> {
  const user = await refreshSession();
  return Number(user?.balance_cdf ?? 0);
}
