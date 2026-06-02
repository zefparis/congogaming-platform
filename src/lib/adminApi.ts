// Client-side helper for /api/admin/* endpoints.
//
// Token is stored under `cg_admin_token` and sent as `Authorization: Bearer`
// on every request. On 401 the token is cleared so the UI falls back to the
// PIN prompt automatically.

const BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined) || 'https://api.congogaming.com';
const BASE = BASE_URL;
// eslint-disable-next-line no-console
console.log('BASE_URL:', BASE_URL);
const TOKEN_KEY = 'cg_admin_token';
const SECRET_KEY = 'cg_admin_secret';
const FALLBACK_SECRET = 'cg_admin_loto_2026';
// Toggle verbose Authorization logging by setting localStorage.cg_admin_debug = '1'.
const DEBUG = (() => {
  try {
    return localStorage.getItem('cg_admin_debug') === '1';
  } catch {
    return false;
  }
})();

export function getAdminToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAdminToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function getAdminSecret(): string | null {
  try {
    return sessionStorage.getItem(SECRET_KEY);
  } catch {
    return null;
  }
}

export function setAdminSecret(secret: string | null) {
  try {
    if (secret) sessionStorage.setItem(SECRET_KEY, secret);
    else sessionStorage.removeItem(SECRET_KEY);
  } catch {
    /* ignore */
  }
}

export class AdminAuthError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'AdminAuthError';
  }
}

// Direct (no-retry, no auto-reauth) fetch used internally by request() and by
// the silent re-auth path to avoid infinite loops.
async function rawFetch(path: string, opts: RequestInit, token: string | null): Promise<Response> {
  const hasBody = opts.body != null;
  const headers: Record<string, string> = {
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...((opts.headers as Record<string, string>) || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.log('[adminApi] →', path, {
      authorization: headers['Authorization'] ?? '(none)',
      tokenRaw: token,
    });
  }
  return fetch(`${BASE}${path}`, { ...opts, headers });
}

// Acquire a fresh token using the cached admin secret. Returns null if no
// secret is available or re-auth fails.
async function silentReauth(): Promise<string | null> {
  const secret = getAdminSecret() || FALLBACK_SECRET;
  try {
    const res = await fetch(`${BASE}/api/admin/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { token?: string };
    if (data?.token) {
      setAdminToken(data.token);
      if (DEBUG) {
        // eslint-disable-next-line no-console
        console.log('[adminApi] ↻ silent re-auth OK, new token stored');
      }
      return data.token;
    }
    return null;
  } catch {
    return null;
  }
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  let token = getAdminToken();
  let res = await rawFetch(path, opts, token);

  // On 401/400, try a one-shot silent re-auth using the cached secret and
  // retry the original request once. This avoids the "expired token" dead-end.
  if ((res.status === 401 || res.status === 400) && path !== '/api/admin/auth') {
    const newToken = await silentReauth();
    if (newToken) {
      token = newToken;
      res = await rawFetch(path, opts, token);
    }
  }

  if (res.status === 401) {
    setAdminToken(null);
    throw new AdminAuthError();
  }

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((json as any)?.error || `HTTP ${res.status}`);
    return json as T;
  }
  // Non-JSON (e.g. CSV export)
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.text()) as any;
}

export interface Agent {
  id: string;
  user_id: string | null;
  display_name: string;
  qr_code: string;
  zone: string | null;
  status: 'active' | 'suspended';
  commission_rate: number;
  total_earned_cdf: number;
  phone: string | null;
  operator: 'orange' | 'vodacom' | 'airtel' | 'africell' | null;
  notes: string | null;
  min_payout_cdf: number;
  payout_requested_at: string | null;
  payout_requested_amount_cdf: number | null;
  created_at: string;
}

export interface AgentCommission {
  id: string;
  agent_id: string;
  user_id: string;
  ticket_id: string;
  ticket_type: string;
  ticket_amount_cdf: number;
  commission_cdf: number;
  status: 'pending' | 'paid';
  created_at: string;
}

export const adminApi = {
  authenticate: (secret: string, phone?: string) =>
    request<{ token: string; expires_at: number; role?: 'admin' | 'super_admin' }>('/api/admin/auth', {
      method: 'POST',
      body: JSON.stringify({ secret, phone: phone || undefined }),
    }),

  me: () => request<{ user_id: string | null; role: 'admin' | 'super_admin' }>('/api/admin/me'),

  overview: () =>
    request<{
      total_balance_cdf: number;
      users_count: number;
      okapi_rounds_today: number;
      kyc?: { approved: number; pending: number; denied: number; verify_age: number };
      active_players_today: number;
      total_deposits_today: number;
      total_withdrawals_today: number;
      avg_crash_point: number;
      loto_tickets_today: number;
    }>('/api/admin/overview'),

  transactionsSummary: () =>
    request<{
      deposits_success_cdf: number;
      withdrawals_success_cdf: number;
      total_count: number;
      failed_count: number;
      failure_rate: number;
    }>('/api/admin/transactions/summary'),

  avadapayBalance: () =>
    request<{ balance_cdf: number | null; raw?: any; error?: string }>(
      '/api/admin/avadapay-balance',
    ).catch((e) => ({ balance_cdf: null as number | null, error: e.message })),

  revenue: (days = 7) =>
    request<{ series: Array<{ day: string; profit_cdf: number }> }>(
      `/api/admin/revenue?days=${days}`,
    ),

  activity: (limit = 10) =>
    request<{
      events: Array<{
        id: string;
        type: 'deposit' | 'withdrawal' | 'okapi_bet' | 'loto_ticket' | 'flash_ticket';
        amount_cdf: number;
        phone: string;
        status?: string | number;
        created_at: string;
      }>;
    }>(`/api/admin/activity?limit=${limit}`),

  users: (search = '', page = 1) => {
    const qs = new URLSearchParams({ page: String(page) });
    if (search) qs.set('search', search);
    return request<{
      items: Array<{
        id: string;
        phone: string;
        display_name: string | null;
        referral_code: string | null;
        balance_cdf: number;
        created_at: string;
        last_activity_at: string | null;
        kyc_status: 'pending' | 'approved' | 'denied' | 'verify_age';
        blocked: boolean;
        self_exclusion_until: string | null;
        pnl_cdf: number;
        rounds_24h: number;
      }>;
      page: number;
      page_size: number;
      total: number | null;
    }>(`/api/admin/users?${qs.toString()}`);
  },

  userDetail: (id: string) =>
    request<{
      user: {
        id: string;
        phone: string;
        display_name?: string | null;
        balance_cdf: number;
        created_at: string;
        kyc_status?: 'pending' | 'approved' | 'denied' | 'verify_age';
        blocked?: boolean;
        referral_code?: string | null;
        referred_by?: string | null;
      };
      transactions: Array<{
        id: string;
        order_id: string;
        type: string;
        amount: number;
        provider_id: number;
        status: number;
        created_at: string;
      }>;
      okapi: {
        rounds_played: number;
        total_wagered_cdf: number;
        total_won_cdf: number;
        pnl_cdf: number;
      };
      kyc_checks?: Array<{
        id: string;
        verdict: 'APPROVED' | 'DENIED' | 'VERIFY_AGE';
        estimated_age: number | null;
        age_low: number | null;
        age_high: number | null;
        is_minor: boolean;
        confidence: number | null;
        scan_id: string | null;
        created_at: string;
      }>;
      limits: null | {
        daily_deposit_cdf: number | null;
        weekly_deposit_cdf: number | null;
        monthly_deposit_cdf: number | null;
        self_exclusion_until: string | null;
        pending_raise: Record<string, number | null> | null;
        pending_raise_effective_at: string | null;
        updated_at: string;
      };
      referral: {
        code: string | null;
        referred_count: number;
        referrer: { id: string; phone: string; referral_code: string | null } | null;
        rewards: Array<{
          id: string;
          referred_id: string;
          amount_cdf: number;
          status: 'pending' | 'credited' | 'cancelled';
          trigger_event: string | null;
          created_at: string;
          credited_at: string | null;
        }>;
      };
    }>(`/api/admin/users/${id}`),

  setUserLimits: (
    id: string,
    body: {
      daily_deposit_cdf?: number | null;
      weekly_deposit_cdf?: number | null;
      monthly_deposit_cdf?: number | null;
    },
  ) =>
    request<{ ok: boolean }>(`/api/admin/users/${id}/limits`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  setUserSelfExclusion: (
    id: string,
    body: { until?: string | null; duration?: '24h' | '7d' | '30d' | 'permanent' | null },
  ) =>
    request<{ ok: boolean; self_exclusion_until: string | null }>(
      `/api/admin/users/${id}/self-exclusion`,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  creditReferralReward: (
    referrerId: string,
    body: { referred_id: string; amount_cdf: number; trigger_event?: string },
  ) =>
    request<{ ok: boolean }>(`/api/admin/users/${referrerId}/referral-reward`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  responsibleGamingOverview: () =>
    request<{
      users_with_limits: number;
      users_with_daily: number;
      users_with_weekly: number;
      users_with_monthly: number;
      users_self_excluded: number;
    }>('/api/admin/responsible-gaming/overview'),

  responsibleGamingExcluded: () =>
    request<{
      items: Array<{
        user_id: string;
        phone: string;
        phone_masked: string;
        self_exclusion_until: string;
        set_at: string;
      }>;
    }>('/api/admin/responsible-gaming/excluded'),

  referralsStatus: () =>
    request<{
      enabled: boolean;
      welcome_bonus_percent: number;
      welcome_bonus_cap_cdf: number;
      min_qualifying_deposit_cdf: number;
      tiers: Array<{ tier: string; threshold_cdf: number; reward_cdf: number }>;
      annual_cap_cdf: number;
    }>('/api/admin/referrals/status'),

  referralsLeaderboard: (limit = 20) =>
    request<{
      items: Array<{
        user_id: string;
        phone: string;
        phone_masked: string;
        display_name: string | null;
        referral_code: string | null;
        referred_count: number;
        total_credited_cdf: number;
      }>;
    }>(`/api/admin/referrals/leaderboard?limit=${limit}`),

  adjustBalance: (id: string, delta_cdf: number, reason?: string) =>
    request<{ new_balance_cdf: number }>(`/api/admin/users/${id}/balance`, {
      method: 'POST',
      body: JSON.stringify({ delta_cdf, reason }),
    }),

  blockUser: (id: string, blocked: boolean) =>
    request<{ ok: boolean; blocked: boolean }>(`/api/admin/users/${id}/block`, {
      method: 'POST',
      body: JSON.stringify({ blocked }),
    }),

  approveKyc: (id: string) => approveKyc(id),

  denyKyc: (id: string) => denyKyc(id),

  okapiRounds: (page = 1) =>
    request<{
      items: Array<{
        id: string;
        crash_point: number;
        started_at: string;
        ended_at: string | null;
        total_bets: number;
        total_cashouts: number;
        house_profit: number;
        players_count: number;
        biggest_cashout: number;
      }>;
      page: number;
      page_size: number;
      total: number | null;
    }>(`/api/admin/okapi/rounds?page=${page}`),

  lotoTirages: (page = 1, type: 'all' | 'congo' | 'flash' = 'all') =>
    request<{
      items: Array<{
        id: string;
        type: 'congo' | 'flash';
        drawn_at: string;
        numeros: number[];
        jackpot_cdf: number | null;
        winners_count: number;
        winners: number;
        tickets_sold: number;
        revenue_cdf: number;
      }>;
      page: number;
      page_size: number;
    }>(`/api/admin/loto/tirages?page=${page}&type=${type}`),

  transactions: (params: {
    page?: number;
    status?: string;
    provider?: string;
    type?: string;
    from?: string;
    to?: string;
  }) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') qs.set(k, String(v));
    }
    return request<{
      items: Array<{
        id: string;
        order_id: string;
        phone: string | null;
        phone_masked: string;
        type: string;
        amount_cdf: number;
        currency: string;
        provider_id: number;
        status: number;
        transaction_id: string | null;
        created_at: string;
      }>;
      page: number;
      page_size: number;
      total: number | null;
    }>(`/api/admin/transactions?${qs.toString()}`);
  },

  scratchTickets: (page = 1) =>
    request<{
      items: Array<{
        id: string;
        phone: string;
        bet_amount_cdf: number;
        win_amount_cdf: number;
        status: 'pending' | 'revealed' | 'claimed';
        created_at: string;
      }>;
      page: number;
      page_size: number;
      total: number | null;
    }>(`/api/admin/scratch/tickets?page=${page}`),

  scratchOverview: () =>
    request<{
      tickets_today: number;
      bets_today: number;
      wins_today: number;
      revenue_today: number;
    }>('/api/admin/scratch/overview'),

  okapiColorLive: () =>
    fetch(`${BASE}/api/okapi-color/live`, { cache: 'no-store' }).then(async r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<{
        enabled: boolean;
        jackpotCdf: number;
        jackpotThresholdCdf: number;
        ticketPriceCdf: number;
        currentDraw: { slotKey: string; status: string; drawAt: string; closeAt: string; secondsRemaining: number };
        lastDraw: { drawNumber: number | null; numerosRouges: number[]; numerosOr: number[]; drawnAt: string; jackpotPaye: boolean; winnerCount: number; totalPaidCdf: number } | null;
        publicStats: { ticketsCount: number; winnerCount: number; totalPaidCdf: number };
      }>;
    }),

  okapiColorLatestDraws: () =>
    fetch(`${BASE}/api/okapi-color/latest-draws`, { cache: 'no-store' }).then(async r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json() as {
        tirages?: Array<{
          id: string;
          draw_number: number | null;
          numeros_rouges: number[];
          numeros_or: number[];
          drawn_at: string;
          jackpot_paye: boolean;
        }>;
      };
      return Array.isArray(json?.tirages) ? json.tirages : [];
    }),

  okapiColorForceDraw: () => {
    const secret = getAdminSecret() || FALLBACK_SECRET;
    return fetch(`${BASE}/api/okapi-color/draw`, {
      method: 'POST',
      headers: { 'x-admin-secret': secret },
    }).then(async r => {
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json?.error || `HTTP ${r.status}`);
      return json as { tirageId: string; rouges: number[]; ors: number[]; winners: number; totalPaidCdf: number };
    });
  },

  okapiColorPurgePending: () => {
    const secret = getAdminSecret() || FALLBACK_SECRET;
    return fetch(`${BASE}/api/okapi-color/purge-pending`, {
      method: 'POST',
      headers: { 'x-admin-secret': secret },
    }).then(async r => {
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json?.error || `HTTP ${r.status}`);
      return json as { scanned: number; refunded: number; total_refunded_cdf: number };
    });
  },

  okapiColorJackpotSet: (amount_cdf: number) =>
    request<{ ok: boolean; old_pot: number; new_pot: number }>(
      '/api/admin/okapi-color/jackpot/set',
      { method: 'POST', body: JSON.stringify({ amount_cdf }) },
    ),

  okapiColorJackpotCredit: (delta_cdf: number) =>
    request<{ ok: boolean; old_pot: number; new_pot: number }>(
      '/api/admin/okapi-color/jackpot/credit',
      { method: 'POST', body: JSON.stringify({ delta_cdf }) },
    ),

  agentsList: () =>
    request<{ agents: Agent[] }>('/api/admin/agents'),

  agentCreate: (body: { display_name: string; zone?: string; commission_rate?: number; phone: string; operator: string; notes?: string }) =>
    request<Agent>('/api/admin/agents', { method: 'POST', body: JSON.stringify(body) }),

  agentUpdate: (id: string, body: { status?: string; zone?: string; commission_rate?: number; phone?: string; operator?: string; notes?: string }) =>
    request<Agent>(`/api/admin/agents/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  agentCommissions: (id: string) =>
    request<{ commissions: AgentCommission[] }>(`/api/admin/agents/${id}/commissions`),

  agentPay: (id: string) =>
    request<{ ok: boolean }>(`/api/admin/agents/${id}/pay`, { method: 'POST' }),

  exportTransactionsUrl: (params: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') qs.set(k, String(v));
    }
    return `${BASE}/api/admin/transactions/export?${qs.toString()}`;
  },
};

// Direct-fetch KYC actions. We bypass request() to guarantee:
//   - absolute URL (BASE_URL),
//   - explicit Content-Type + non-empty JSON body (Fastify rejects empty
//     bodies when Content-Type: application/json is set, returning 400),
//   - real error message surfaced to the UI.
export async function approveKyc(
  id: string,
): Promise<{ ok: boolean; kyc_status: string }> {
  const token = localStorage.getItem(TOKEN_KEY) ?? '';
  const url = `${BASE_URL}/api/admin/users/${id}/kyc-approve`;
  // eslint-disable-next-line no-console
  console.log('KYC approve URL:', url);
  // eslint-disable-next-line no-console
  console.log('Token used:', token);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({}),
  });
  if (res.status === 401) {
    setAdminToken(null);
    throw new AdminAuthError();
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function denyKyc(
  id: string,
): Promise<{ ok: boolean; kyc_status: string; blocked: boolean }> {
  const token = localStorage.getItem(TOKEN_KEY) ?? '';
  const url = `${BASE_URL}/api/admin/users/${id}/kyc-deny`;
  // eslint-disable-next-line no-console
  console.log('KYC deny URL:', url);
  // eslint-disable-next-line no-console
  console.log('Token used:', token);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({}),
  });
  if (res.status === 401) {
    setAdminToken(null);
    throw new AdminAuthError();
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Convenience helper: triggers a CSV download honoring the bearer token.
 * (We can't put auth headers on a plain anchor href, so we fetch + Blob.)
 */
export async function downloadTransactionsCsv(params: Record<string, string | undefined>) {
  const token = getAdminToken();
  const url = adminApi.exportTransactionsUrl(params);
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 401) {
    setAdminToken(null);
    throw new AdminAuthError();
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const a = document.createElement('a');
  const objUrl = URL.createObjectURL(blob);
  a.href = objUrl;
  a.download = `transactions-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objUrl);
}
