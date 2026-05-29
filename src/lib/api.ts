const BASE = import.meta.env.VITE_API_URL || 'https://api.congogaming.com';

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const j = json as { error?: string; message?: string; detail?: string; code?: string };
    const base = j?.error || j?.message || `HTTP ${res.status}`;
    const detail = j?.detail ? ` — ${String(j.detail).slice(0, 300)}` : '';
    throw new ApiError(base + detail, res.status, j?.code);
  }
  return json as T;
}

export const api = {
  deposit: (body: { amount: number; provider_id: number; phone: string }) =>
    req<{ order_id: string; status: number; transaction_id?: string }>('/api/deposit', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  withdraw: (body: { amount: number; provider_id: number; phone: string }) =>
    req<{ order_id: string; status: number }>('/api/withdraw', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  status: (order_id: string) => req<{ status: number }>(`/api/status/${order_id}`),
  transactions: () =>
    req<{ items: Array<{ id: string; order_id: string; type: 'deposit' | 'withdrawal'; amount: number; status: number; created_at: string }> }>('/api/transactions/me'),
  myStats: () =>
    req<{
      totals: { deposit_cdf: number; withdrawal_cdf: number; bet_cdf: number; win_cdf: number; net_cdf: number };
      counts: { bets: number; wins: number; pending_deposits: number; pending_withdrawals: number };
      win_rate_percent: number;
    }>('/api/me/stats'),
  myLimits: () =>
    req<{
      limits: {
        daily_deposit_cdf: number | null;
        weekly_deposit_cdf: number | null;
        monthly_deposit_cdf: number | null;
        self_exclusion_until: string | null;
        pending_raise: Record<string, number | null> | null;
        pending_raise_effective_at: string | null;
      };
    }>('/api/me/limits'),
  updateLimits: (body: { daily_deposit_cdf?: number | null; weekly_deposit_cdf?: number | null; monthly_deposit_cdf?: number | null }) =>
    req<{ ok: boolean; applied_immediately: string[]; pending_raise: Record<string, number | null> | null; pending_raise_effective_at: string | null }>('/api/me/limits', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  selfExclusion: (duration: '24h' | '7d' | '30d' | 'permanent') =>
    req<{ ok: boolean; self_exclusion_until: string }>('/api/me/self-exclusion', {
      method: 'POST',
      body: JSON.stringify({ duration }),
    }),
  myReferral: () =>
    req<{
      code: string | null;
      referred_count: number;
      total_credited_cdf: number;
      total_pending_cdf: number;
      lifetime_wagered_cdf: number;
      annual_credited_cdf: number;
      rules: {
        welcome_bonus_pct: number;
        welcome_bonus_cap_cdf: number;
        welcome_min_deposit_cdf: number;
        tiers: Array<{ tier: string; threshold_cdf: number; reward_cdf: number }>;
        annual_cap_cdf: number;
      };
      as_referee: {
        has_referrer: boolean;
        referrer_display: string | null;
        welcome_bonus_status: 'credited' | 'pending_first_deposit' | 'none';
        welcome_bonus_cdf: number | null;
        welcome_bonus_credited_at: string | null;
      };
    }>('/api/me/referral'),
  lotoTicket: (_user_id: string, numeros: number[]) =>
    req<{ ticket_id: string; new_balance: number }>('/api/loto/ticket', { method: 'POST', body: JSON.stringify({ numeros }) }),
  lotoLatest: () =>
    req<{ tirage: null | { id: string; numeros: number[]; complementaire: number; jackpot: number; hash_pre: string; drawn_at: string }; pot_cdf: number }>('/api/loto/tirage/latest'),
  lotoMesTickets: (_user_id?: string) =>
    req<{ tickets: Array<{ id: string; numeros: number[]; prix_cdf: number; gains_cdf: number; nb_bons: number; status: 'pending' | 'gagnant' | 'perdant' | 'jackpot_attente'; jackpot_en_attente: boolean; tirage_id: string | null; created_at: string }> }>('/api/loto/mes-tickets'),
  flashTicket: (_user_id: string, numeros: number[]) =>
    req<{ ticket_id: string; new_balance: number }>('/api/flash/ticket', { method: 'POST', body: JSON.stringify({ numeros }) }),
  flashLatest: () =>
    req<{ tirage: null | { id: string; numeros: number[]; hash_pre: string; jackpot_paye: boolean; drawn_at: string }; pot_cdf: number }>('/api/flash/tirage/latest'),
  flashMesTickets: (_user_id?: string) =>
    req<{ tickets: Array<{ id: string; numeros: number[]; prix_cdf: number; gains_cdf: number; nb_bons: number; status: 'pending' | 'gagnant' | 'perdant' | 'jackpot_attente'; jackpot_en_attente: boolean; tirage_id: string | null; created_at: string }> }>('/api/flash/mes-tickets'),
  scratchBuy: (_user_id: string, bet_amount_cdf: number) =>
    req<{ ticket_id: string; grid_hidden: true; bet_amount_cdf: number; grid: string[] }>('/api/scratch/buy', { method: 'POST', body: JSON.stringify({ bet_amount_cdf }) }),
  scratchClaim: (_user_id: string, ticket_id: string) =>
    req<{ win_amount_cdf: number; new_balance: number; grid: string[] }>('/api/scratch/claim', { method: 'POST', body: JSON.stringify({ ticket_id }) }),
  kycScan: (_user_id: string, selfie_b64: string) =>
    req<{ verdict: 'APPROVED' | 'DENIED' | 'VERIFY_AGE'; kyc_status: 'approved' | 'denied' | 'verify_age'; estimated_age: number; age_low: number; age_high: number; is_minor: boolean; scan_id: string; blocked: boolean }>('/api/kyc/scan', { method: 'POST', body: JSON.stringify({ selfie_b64 }) }),
};
