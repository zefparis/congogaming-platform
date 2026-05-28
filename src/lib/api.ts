const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const j = json as { error?: string; detail?: string };
    const base = j?.error || `HTTP ${res.status}`;
    const detail = j?.detail ? ` — ${String(j.detail).slice(0, 300)}` : '';
    throw new Error(base + detail);
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
