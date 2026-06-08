// Frontend CGLT helper.
//
// SECURITY: the shared GAMING_API_KEY lives ONLY on the Congo Gaming server.
// The browser must never hold it. This client therefore talks to our own
// backend (`/api/cglt/*`), which proxies to UniPay with the secret key.

const API_URL = import.meta.env.VITE_API_URL || 'https://api.congogaming.com'

export interface CgltBalance {
  phone: string | null
  cglt_balance: number
  equivalent_usdt: number | null
}

export async function getCGLTBalance(): Promise<CgltBalance> {
  const res = await fetch(`${API_URL}/api/cglt/balance`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) {
    return { phone: null, cglt_balance: 0, equivalent_usdt: null }
  }
  return res.json() as Promise<CgltBalance>
}
