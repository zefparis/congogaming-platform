export type GameMessage =
  | { type: 'WAITING'; countdown: number }
  | { type: 'PLAYING'; startTime: number }
  | { type: 'TICK'; multiplier: number }
  | { type: 'CRASHED'; crashPoint: number }
  | { type: 'CASHOUT_CONFIRM'; multiplier: number; winAmount: number }
  | { type: 'HISTORY'; history: number[] }
  | { type: 'PING' }

export type Listener = (msg: GameMessage) => void
export type StatusListener = (open: boolean) => void

// Resolve the WS URL. Priority:
//   1. VITE_WS_URL (explicit override)
//   2. Derive from VITE_API_URL by swapping http(s) -> ws(s). This is the
//      common case: same Render service serves REST + WS on /ws.
//   3. Fallback to localhost (dev).
function resolveWsUrl(): string {
  const explicit = import.meta.env.VITE_WS_URL as string | undefined
  if (explicit && explicit.length > 0) return explicit
  const api = import.meta.env.VITE_API_URL as string | undefined
  if (api && api.length > 0) {
    return api.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:')
  }
  return 'wss://api.congogaming.com'
}

// Normalize the base so the final URL is always `<host>/ws` regardless of
// whether the env var was configured with or without a trailing `/ws` or
// trailing slash. Avoids `wss://host/ws/ws` (404) when ops set
// `VITE_WS_URL=wss://api.congogaming.com/ws`.
function normalizeWsBase(raw: string): string {
  let base = raw.trim().replace(/\/+$/, '') // strip trailing slashes
  if (/\/ws$/i.test(base)) base = base.replace(/\/ws$/i, '')
  return base
}

const WS_URL = normalizeWsBase(resolveWsUrl())

export class GameSocket {
  private ws: WebSocket | null = null
  private listeners = new Set<Listener>()
  private statusListeners = new Set<StatusListener>()
  private reconnectTimer: number | null = null
  private reconnectAttempts = 0
  private _open = false

  get isOpen() {
    return this._open
  }

  connect() {
    if (this.ws && this.ws.readyState <= 1) return
    try {
      this.ws = new WebSocket(`${WS_URL}/ws`)
    } catch {
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this._open = true
      this.reconnectAttempts = 0
      this.statusListeners.forEach((l) => l(true))
    }
    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as GameMessage
        if (msg.type === 'PING') {
          this.send({ type: 'PONG' })
          return
        }
        this.listeners.forEach((l) => l(msg))
      } catch {
        /* ignore */
      }
    }
    this.ws.onclose = () => {
      this._open = false
      this.statusListeners.forEach((l) => l(false))
      this.scheduleReconnect()
    }
    this.ws.onerror = () => this.ws?.close()
  }

  onStatus(listener: StatusListener) {
    this.statusListeners.add(listener)
    // Fire immediately with current value so subscribers don't miss it.
    listener(this._open)
    return () => this.statusListeners.delete(listener)
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return
    // Exponential backoff with jitter, capped. Server may reject due to
    // CGNAT IP cap or transient outages; don't hammer it.
    const attempt = this.reconnectAttempts++
    const base = Math.min(1500 * 2 ** attempt, 15000)
    const jitter = Math.floor(Math.random() * 500)
    const delay = base + jitter
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  on(listener: Listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  send(data: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  close() {
    this.ws?.close()
    this.ws = null
  }
}

export const gameSocket = new GameSocket()
