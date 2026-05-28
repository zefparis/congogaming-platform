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
  return 'ws://localhost:3001'
}

const WS_URL = resolveWsUrl()

export class GameSocket {
  private ws: WebSocket | null = null
  private listeners = new Set<Listener>()
  private statusListeners = new Set<StatusListener>()
  private reconnectTimer: number | null = null
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
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, 1500)
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
