const API_URL = import.meta.env.VITE_API_URL || 'https://api.congogaming.com'

export interface BetResponse { bet_id: string; balance: number | null }
export interface CashoutResponse { win_amount: number; multiplier: number; balance: number | null }
export interface HistoryResponse { history: number[] }
export interface BalanceResponse { balance: number }
export interface AutoStartParams { user_id?: string; bet_amount_cdf: number; target_multiplier: number; max_rounds: number | null; stop_on_profit_cdf?: number | null; stop_on_loss_cdf?: number | null }
export interface AutoStartResponse { session_id: string }
export interface AutoProgressResponse { rounds_played: number; total_pnl_cdf: number; status: 'active' | 'completed' | 'aborted'; finished: boolean }
export interface AutoActiveSession { id: string; bet_amount_cdf: number; target_multiplier: number; max_rounds: number | null; stop_on_profit_cdf: number | null; stop_on_loss_cdf: number | null; rounds_played: number; total_pnl_cdf: number; status: 'active'; started_at: string }
export interface AutoActiveResponse { session: AutoActiveSession | null }

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) } })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let extra = ''
    try { const j = JSON.parse(text) as { error?: string; detail?: string }; extra = j.detail ? ` ${j.detail}` : j.error ? ` ${j.error}` : '' } catch {}
    throw new Error(`API error ${res.status}: ${text}${extra}`)
  }
  return res.json() as Promise<T>
}

export const okapiApi = {
  placeBet: (_user_id: string, amount_cdf: number, auto_session_id?: string | null) =>
    request<BetResponse>('/api/game/bet', { method: 'POST', body: JSON.stringify({ amount_cdf, auto_session_id }) }),
  cashout: (_user_id: string, bet_id: string) =>
    request<CashoutResponse>('/api/game/cashout', { method: 'POST', body: JSON.stringify({ bet_id }) }),
  history: () => request<HistoryResponse>('/api/game/history'),
  getBalance: (_user_id?: string) => request<BalanceResponse>('/api/wallet/balance'),
  autoStart: (params: AutoStartParams) => request<AutoStartResponse>('/api/okapi/auto/start', { method: 'POST', body: JSON.stringify(params) }),
  autoProgress: (session_id: string, _user_id: string, delta_cdf: number) => request<AutoProgressResponse>('/api/okapi/auto/progress', { method: 'POST', body: JSON.stringify({ session_id, delta_cdf }) }),
  autoActive: (_user_id?: string) => request<AutoActiveResponse>('/api/okapi/auto/active'),
  autoStop: (session_id: string, _user_id: string, reason: 'completed' | 'stopped' | 'aborted' = 'stopped') => request<{ ok: boolean; status: string }>('/api/okapi/auto/stop', { method: 'POST', body: JSON.stringify({ session_id, reason }) }),
}
