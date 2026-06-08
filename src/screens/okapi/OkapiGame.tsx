import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { gameSocket } from '../../lib/okapi-socket'
import type { GameMessage } from '../../lib/okapi-socket'
import { okapiApi } from '../../lib/okapi-api'
import type { BetCurrency } from '../../lib/okapi-api'
import { getCGLTBalance } from '../../services/unipay-cglt'
import { getSession, refreshBalance, saveSession } from '../../lib/auth'
import MultiplierDisplay from './MultiplierDisplay'
import CrashHistory from './CrashHistory'
import PlayersList from './PlayersList'
import BetPanel from './BetPanel'
import type { AutoConfig } from './AutoBetPanel'
import ClimbCurve from './ClimbCurve'

type GameState = 'waiting' | 'playing' | 'crashed' | 'cashedout'
type BgKey = 'climb' | 'slip' | 'crash' | 'win'

const BG_MAP: Record<BgKey, string> = {
  climb: '/images/okapi/okapi-climb.png',
  slip: '/images/okapi/okapi-slip.png',
  crash: '/images/okapi/okapi-crash.png',
  win: '/images/okapi/okapi-win.png',
}

export default function OkapiGame() {
  const nav = useNavigate()
  const session = getSession()
  const userId = session?.id ?? ''
  // Always start at 0; the real balance is fetched from the backend on mount.
  // Never trust the value cached in localStorage to display in-game.
  const [balance, setBalance] = useState<number>(0)
  // Currency of the next bet (CDF via CDF ledger, CGLT via UniPay wallet).
  const [currency, setCurrency] = useState<BetCurrency>('CDF')
  const [cgltBalance, setCgltBalance] = useState<number>(0)
  const [betError, setBetError] = useState<string | null>(null)
  const [betSubmitting, setBetSubmitting] = useState<boolean>(false)
  // Locks the MISER button after a 409 from the server (e.g. betting closed)
  // until the next WAITING socket message restores a fresh round window.
  // Prevents the client from spamming /api/game/bet during PLAYING/CRASHED.
  const [betLocked, setBetLocked] = useState<boolean>(false)
  // Reflects the real WS connection state. When false, the client is desynced
  // from the server engine and any bet posted will race the wrong state on
  // the backend (the local fallback engine is just a visual stub). We use
  // this to disable MISER and surface a clear error.
  const [wsConnected, setWsConnected] = useState<boolean>(false)

  const updateBalance = useCallback((n: number) => {
    const num = Number(n) || 0
    setBalance(num)
    const s = getSession()
    if (s) saveSession({ ...s, balance_cdf: num })
  }, [])

  // Canonical balance fetch: hits api.congogaming.com/api/wallet/balance which
  // reads public.users.balance_cdf. This is the only source of truth for the
  // in-game balance display.
  const syncBalance = useCallback(async () => {
    if (!userId) return
    // Try the backend wallet endpoint first.
    try {
      const res = await okapiApi.getBalance(userId)
      updateBalance(res.balance)
      return
    } catch {
      /* fallthrough to direct-Supabase fallback below */
    }
    // Fallback: hit Supabase directly with the anon key. Keeps the in-game
    // balance correct even if api.congogaming.com hasn't been redeployed
    // with the new /api/wallet/balance route yet.
    try {
      const bal = await refreshBalance(userId)
      updateBalance(bal)
    } catch {
      /* keep last known value */
    }
  }, [userId, updateBalance])

  const [state, setState] = useState<GameState>('waiting')
  // Mirror of `state` for use inside the WS callback closure (which is
  // installed once and would otherwise capture only the initial value).
  const stateRef = useRef<GameState>('waiting')
  const [countdown, setCountdown] = useState<number>(5)
  const [startTime, setStartTime] = useState<number | null>(null)
  const [crashPoint, setCrashPoint] = useState<number | null>(null)
  const [cashoutMultiplier, setCashoutMultiplier] = useState<number | null>(null)
  const [history, setHistory] = useState<number[]>([])
  const [multiplier, setMultiplier] = useState<number>(1)

  const [betId, setBetId] = useState<string | null>(null)
  const hasBetRef = useRef(false)
  const betIdRef = useRef<string | null>(null)
  const gotServerMsg = useRef(false)
  const crashedSafetyRef = useRef<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioPlayingRef = useRef(false)
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    const saved = localStorage.getItem('okapi_sound_muted')
    return saved === 'true'
  })

  // ---------------- Auto-bet (Aviator-style) ----------------
  // Client-driven loop that reuses /api/game/bet and /api/game/cashout. The
  // session row is created via /api/okapi/auto/start and progress (PnL +
  // round counter) is pushed to /api/okapi/auto/progress after each round.
  const [autoSession, setAutoSession] = useState<{
    id: string
    cfg: AutoConfig
  } | null>(null)
  const [autoRoundsPlayed, setAutoRoundsPlayed] = useState<number>(0)
  const [autoTotalPnl, setAutoTotalPnl] = useState<number>(0)
  const [autoError, setAutoError] = useState<string | null>(null)
  const autoStopRequestedRef = useRef<boolean>(false)
  // Per-round bookkeeping so we can compute delta_cdf on CRASHED.
  const autoCurrentBetAmountRef = useRef<number>(0)
  const autoCurrentWinAmountRef = useRef<number>(0)
  const autoCashedOutThisRoundRef = useRef<boolean>(false)
  const autoBetInFlightRef = useRef<boolean>(false)
  // Latest auto-session reference for use inside socket callbacks that close
  // over stale state.
  const autoSessionRef = useRef<{ id: string; cfg: AutoConfig } | null>(null)
  useEffect(() => {
    autoSessionRef.current = autoSession
  }, [autoSession])
  // Ref-routed auto helpers, populated below after the helpers are declared.
  // Using a ref breaks the "used before declaration" cycle when the socket
  // subscription effect references the helpers.
  const autoHandlersRef = useRef<{
    placeBet: () => Promise<boolean>
    cashout: () => Promise<void>
    settleRound: () => Promise<void>
  }>({
    placeBet: async () => false,
    cashout: async () => {},
    settleRound: async () => {},
  })

  // Keep stateRef in sync with the latest state so WS callbacks (which close
  // over an old `state` value) can read the real current value.
  useEffect(() => {
    stateRef.current = state
  }, [state])

  // Initialize audio element once
  useEffect(() => {
    const audio = new Audio('/audio/pacman.mp3')
    audio.volume = 0.3
    audio.loop = true
    audio.muted = isMuted
    audioRef.current = audio
    return () => {
      audio.pause()
      audioRef.current = null
    }
  }, [])

  // Update audio muted state when isMuted changes
  useEffect(() => {
    const audio = audioRef.current
    if (audio) {
      audio.muted = isMuted
      if (isMuted) {
        audio.pause()
        audio.currentTime = 0
        audioPlayingRef.current = false
      }
    }
    localStorage.setItem('okapi_sound_muted', isMuted.toString())
  }, [isMuted])

  // Play audio when state transitions to PLAYING, stop on CRASHED/CASHEDOUT
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    if (state === 'playing' && !audioPlayingRef.current && !isMuted) {
      // Only play if we have user interaction (browser policy)
      // The audio will play on first PLAYING after user has interacted
      audio.play().catch(() => {
        // Browser blocked autoplay - silent fail
      })
      audioPlayingRef.current = true
    } else if (state === 'crashed' || state === 'cashedout') {
      audio.pause()
      audio.currentTime = 0
      audioPlayingRef.current = false
    } else if (state === 'waiting') {
      audio.pause()
      audio.currentTime = 0
      audioPlayingRef.current = false
    }
  }, [state, isMuted])

  // Pull the player's CGLT balance (UniPay wallet) — used when betting in CGLT.
  const syncCgltBalance = useCallback(async () => {
    if (!userId) return
    try {
      const res = await getCGLTBalance()
      setCgltBalance(Number(res.cglt_balance) || 0)
    } catch {
      /* keep last known value */
    }
  }, [userId])

  // Pull authoritative balance from the backend on mount
  useEffect(() => {
    syncBalance()
    syncCgltBalance()

    // Refresh balance every 30 seconds to catch admin adjustments
    const interval = setInterval(() => {
      syncBalance()
      syncCgltBalance()
    }, 30000)

    return () => clearInterval(interval)
  }, [syncBalance, syncCgltBalance])

  // Restore an active auto-bet session if the user navigates back to /climb
  // mid-session. Without this, leaving the page wipes the in-memory
  // autoSession state and the auto-loop silently dies on next mount.
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    okapiApi
      .autoActive(userId)
      .then((res) => {
        if (cancelled || !res.session) return
        const s = res.session
        setAutoSession({
          id: s.id,
          cfg: {
            amount: s.bet_amount_cdf,
            targetMultiplier: s.target_multiplier,
            maxRounds: s.max_rounds,
            stopOnProfit: s.stop_on_profit_cdf ?? 0,
            stopOnLoss: s.stop_on_loss_cdf ?? 0,
          },
        })
        setAutoRoundsPlayed(s.rounds_played ?? 0)
        setAutoTotalPnl(s.total_pnl_cdf ?? 0)
        autoStopRequestedRef.current = false
      })
      .catch(() => {
        /* best effort; silently ignore */
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  // Connect WS and load history
  useEffect(() => {
    gameSocket.connect()
    const offStatus = gameSocket.onStatus((open) => setWsConnected(open))
    okapiApi.history().then((r) => setHistory(r.history)).catch(() => {})
    return () => {
      offStatus()
      // keep socket alive across re-renders, but close on unmount
      gameSocket.close()
    }
  }, [])

  // Subscribe to socket events
  useEffect(() => {
    const off = gameSocket.on((msg: GameMessage) => {
      gotServerMsg.current = true
      switch (msg.type) {
        case 'WAITING': {
          // The server emits a WAITING message every second during the
          // countdown (5,4,3,2,1,0). We MUST only fully reset the per-round
          // state on the *transition* into WAITING, otherwise a mid-countdown
          // tick would wipe the bet the user just placed — forcing them to
          // re-click MISER 3-4 times to win the race.
          const wasWaiting = stateRef.current === 'waiting'
          setState('waiting')
          setCountdown(msg.countdown)
          if (!wasWaiting) {
            setCrashPoint(null)
            setCashoutMultiplier(null)
            setMultiplier(1)
            setBetId(null)
            betIdRef.current = null
            hasBetRef.current = false
            // Fresh round — release any 409-induced bet lock.
            setBetLocked(false)
            setBetError(null)
          }
          // Cancel the CRASHED safety reset since WAITING did arrive.
          if (crashedSafetyRef.current) {
            clearTimeout(crashedSafetyRef.current)
            crashedSafetyRef.current = null
          }
          // New round: re-sync wallet so any settled bet from the previous
          // round (lost or won) is reflected on screen.
          syncBalance()
          // Auto-bet: if a session is active and the user didn't request
          // STOP, place the bet for this round.
          // eslint-disable-next-line no-console
          console.log('[okapi auto] WAITING received', {
            hasSession: !!autoSessionRef.current,
            stopRequested: autoStopRequestedRef.current,
            handlersReady: !!autoHandlersRef.current.placeBet,
          })
          // Only fire placeBet on the FIRST WAITING tick of a new round
          // (transition into WAITING). Calling it on every countdown tick
          // races the server: by countdown=0 the engine may already have
          // transitioned to PLAYING, returning 409 "Betting closed".
          if (
            !wasWaiting &&
            autoSessionRef.current &&
            !autoStopRequestedRef.current
          ) {
            // eslint-disable-next-line no-console
            console.log('[okapi auto] calling placeBet via handlersRef (transition)')
            autoHandlersRef.current.placeBet()
          }
          break
        }
        case 'PLAYING':
          setState('playing')
          setStartTime(msg.startTime)
          break
        case 'TICK':
          setMultiplier(msg.multiplier)
          break
        case 'CRASHED':
          setState((prev) => (prev === 'cashedout' ? 'cashedout' : 'crashed'))
          setCrashPoint(msg.crashPoint)
          setHistory((h) => [msg.crashPoint, ...h].slice(0, 20))
          // Auto-bet: settle the round (sends delta_cdf to /auto/progress).
          // Runs regardless of cashout outcome (loss = -bet, win = win-bet).
          if (autoSessionRef.current) {
            autoHandlersRef.current.settleRound().then(() => {
              // If the user requested STOP mid-round, finalize the session
              // now that the round is over.
              if (
                autoStopRequestedRef.current &&
                autoSessionRef.current &&
                userId
              ) {
                const sid = autoSessionRef.current.id
                okapiApi
                  .autoStop(sid, userId, 'stopped')
                  .catch(() => {})
                  .finally(() => {
                    setAutoSession(null)
                    autoStopRequestedRef.current = false
                  })
              }
            })
          }
          // Fully clear per-round bet state. Previously only the ref was
          // cleared, leaving `betId` (a React state) holding a stale UUID
          // which kept `hasBet=true` if WAITING was somehow missed, locking
          // the MISER button forever.
          setBetId(null)
          betIdRef.current = null
          hasBetRef.current = false
          // Bet was already deducted at placement; nothing else to charge.
          // Still re-sync to be safe (covers reconnect / missed events).
          syncBalance()
          // Safety: if no WAITING arrives within 15s (engine stuck, WS
          // dropped, etc.), force-reset the UI so the player can bet again
          // as soon as a new round actually starts.
          if (crashedSafetyRef.current) {
            clearTimeout(crashedSafetyRef.current)
          }
          crashedSafetyRef.current = window.setTimeout(() => {
            setState('waiting')
            setBetId(null)
            betIdRef.current = null
            hasBetRef.current = false
            setBetLocked(false)
            setBetError(null)
            setMultiplier(1)
            setCrashPoint(null)
            setCashoutMultiplier(null)
          }, 15000)
          break
        case 'CASHOUT_CONFIRM':
          // eslint-disable-next-line no-console
          console.log('Player cashed out:', msg)
          break
        case 'HISTORY':
          setHistory(msg.history)
          break
      }
    })
    return () => {
      off()
    }
  }, [syncBalance, userId])

  // Auto-cashout trigger: when the multiplier crosses the configured target
  // during PLAYING and we have a live auto bet, fire the cashout exactly once.
  useEffect(() => {
    const sess = autoSessionRef.current
    if (!sess) return
    if (state !== 'playing') return
    if (!hasBetRef.current) return
    if (autoCashedOutThisRoundRef.current) return
    if (multiplier >= sess.cfg.targetMultiplier) {
      autoHandlersRef.current.cashout()
    }
  }, [multiplier, state])

  // Local fallback state machine if no server is connected
  useEffect(() => {
    let raf = 0
    let timer: number | null = null
    let localCrash = 0

    function startWaiting() {
      setState('waiting')
      setMultiplier(1)
      setCrashPoint(null)
      setCashoutMultiplier(null)
      setBetId(null)
      hasBetRef.current = false
      let c = 5
      setCountdown(c)
      timer = window.setInterval(() => {
        c -= 1
        setCountdown(c)
        if (c <= 0) {
          if (timer) window.clearInterval(timer)
          startPlaying()
        }
      }, 1000)
    }

    function startPlaying() {
      const r = Math.random()
      // Local fallback also caps at 50 to match the server engine.
      localCrash = r < 0.05 ? 1.0 : Math.min(50, Math.max(1.0, (1 / (1 - r)) * 0.92))
      // Use Date.now() (epoch ms) so MultiplierDisplay's tickerFn (which now
      // diffs against Date.now()) computes the correct elapsed value.
      const t0 = Date.now()
      setStartTime(t0)
      setState('playing')
      const loop = () => {
        const elapsed = (Date.now() - t0) / 1000
        const raw = 1 + 0.06 * elapsed + Math.pow(0.06 * elapsed, 2)
        const m = Math.min(50, raw)
        setMultiplier(m)
        if (m >= localCrash) {
          setCrashPoint(localCrash)
          setHistory((h) => [localCrash, ...h].slice(0, 20))
          setState((prev) => (prev === 'cashedout' ? 'cashedout' : 'crashed'))
          timer = window.setTimeout(() => startWaiting(), 3000)
          return
        }
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
    }

    const fallback = window.setTimeout(() => {
      if (gotServerMsg.current) return
      startWaiting()
    }, 2000)

    return () => {
      window.clearTimeout(fallback)
      if (timer) {
        window.clearInterval(timer)
        window.clearTimeout(timer)
      }
      cancelAnimationFrame(raf)
    }
  }, [])

  const bgKey: BgKey = useMemo(() => {
    if (state === 'cashedout') return 'win'
    if (state === 'crashed') return 'crash'
    if (state === 'playing' && multiplier >= 5) return 'slip'
    return 'climb'
  }, [state, multiplier])

  const onTick = useCallback((m: number) => {
    setMultiplier(m)
  }, [])

  const handlePlaceBet = async (amount: number) => {
    if (!userId) {
      nav('/login')
      return
    }
    if (betSubmitting) return
    // No client-side balance pre-check: the server is the single source of
    // truth. The `adjust_balance` RPC enforces non-negative balance and will
    // reject the bet if funds are insufficient. This avoids any drift between
    // displayed balance and real wallet from blocking legitimate bets.
    setBetError(null)
    setBetSubmitting(true)
    try {
      const res = await okapiApi.placeBet(userId, amount, null, currency)
      // Only commit the bet client-side after the server has actually
      // debited the wallet via adjust_balance.
      setBetId(res.bet_id)
      betIdRef.current = res.bet_id
      hasBetRef.current = true
      if (currency === 'CGLT') {
        // CGLT bets are settled against the UniPay wallet; the returned
        // balance is the CGLT balance, not the CDF ledger.
        if (res.balance !== null && res.balance !== undefined) setCgltBalance(Number(res.balance) || 0)
        else await syncCgltBalance()
      } else if (res.balance !== null && res.balance !== undefined) {
        updateBalance(res.balance)
      } else {
        // Server up but Supabase not configured: pull authoritative value.
        await syncBalance()
      }
    } catch (err: any) {
      // No optimistic update happened, so nothing to roll back. Surface error.
      const raw = String(err?.message || '')
      let label = 'Mise refusée'
      // 409 = round not in WAITING phase. Lock the bet button until the next
      // WAITING socket event so the user can't spam the server.
      const isConflict =
        raw.includes('409') ||
        raw.includes('Betting closed') ||
        raw.includes('Game not running')
      if (raw.includes('Insufficient')) label = 'Solde insuffisant'
      else if (isConflict) label = 'Tour en cours, patientez'
      else if (raw.includes('Invalid bet')) label = 'Montant invalide'
      if (isConflict) setBetLocked(true)
      // eslint-disable-next-line no-console
      console.error('[okapi] placeBet failed:', raw)
      setBetError(label)
      // Re-sync just in case.
      syncBalance()
    } finally {
      setBetSubmitting(false)
    }
  }

  // -------- Auto-bet helpers --------

  // Place a bet on behalf of the auto loop. Returns true on success.
  const autoPlaceBet = useCallback(async (): Promise<boolean> => {
    const sess = autoSessionRef.current
    if (!sess || !userId) {
      // eslint-disable-next-line no-console
      console.warn('[okapi auto] placeBet skipped: no session or user')
      return false
    }
    if (hasBetRef.current || autoBetInFlightRef.current) {
      // eslint-disable-next-line no-console
      console.warn('[okapi auto] placeBet skipped: already in flight or has bet', {
        hasBet: hasBetRef.current,
        inFlight: autoBetInFlightRef.current,
      })
      return false
    }
    // Check local balance before attempting bet
    if (balance < sess.cfg.amount) {
      setAutoError('Solde insuffisant — session auto arrêtée')
      autoStopRequestedRef.current = true
      // Stop the session immediately
      const sid = sess.id
      okapiApi.autoStop(sid, userId, 'aborted').catch(() => {})
      setAutoSession(null)
      autoStopRequestedRef.current = false
      return false
    }
    autoBetInFlightRef.current = true
    autoCurrentBetAmountRef.current = sess.cfg.amount
    autoCurrentWinAmountRef.current = 0
    autoCashedOutThisRoundRef.current = false
    // eslint-disable-next-line no-console
    console.log('[okapi auto] placing bet', { amount: sess.cfg.amount, session: sess.id })
    try {
      const res = await okapiApi.placeBet(userId, sess.cfg.amount, sess.id)
      // eslint-disable-next-line no-console
      console.log('[okapi auto] bet placed', res)
      setBetId(res.bet_id)
      betIdRef.current = res.bet_id
      hasBetRef.current = true
      if (res.balance !== null && res.balance !== undefined) {
        updateBalance(res.balance)
      }
      setAutoError(null)
      return true
    } catch (err: any) {
      const raw = String(err?.message || '')
      // eslint-disable-next-line no-console
      console.error('[okapi auto] placeBet failed:', raw)
      // Surface the actual cause to the UI so we know whether it's a
      // timing issue (409 Betting closed), balance, or something else.
      let label = 'Mise refusée'
      if (raw.includes('Insufficient')) label = 'Solde insuffisant'
      else if (raw.includes('409') || raw.includes('Betting closed'))
        label = 'Pari en retard (409)'
      else if (raw.includes('Invalid bet')) label = 'Montant invalide'
      else if (raw.includes('Failed to fetch')) label = 'API injoignable'
      setAutoError(`${label} — ${raw.slice(0, 80)}`)
      autoCurrentBetAmountRef.current = 0
      return false
    } finally {
      autoBetInFlightRef.current = false
    }
  }, [userId, updateBalance, balance])

  // Cash out on behalf of the auto loop. Idempotent.
  const autoCashout = useCallback(async () => {
    if (!autoSessionRef.current) return
    if (autoCashedOutThisRoundRef.current) return
    const currentBetId = betIdRef.current
    if (!hasBetRef.current || !currentBetId) return
    autoCashedOutThisRoundRef.current = true
    const localM = multiplier
    // Briefly show the WIN celebration (cashedout state) for 1.5s, then
    // revert to 'playing' so the okapi keeps climbing until the actual
    // server-side CRASHED event. Without this revert, the UI would freeze
    // on the green WIN screen for the rest of the round.
    setState('cashedout')
    setCashoutMultiplier(localM)
    window.setTimeout(() => {
      setState((prev) => (prev === 'cashedout' ? 'playing' : prev))
    }, 1500)
    try {
      const res = await okapiApi.cashout(userId, currentBetId)
      setCashoutMultiplier(res.multiplier)
      autoCurrentWinAmountRef.current = res.win_amount
      if (res.balance !== null && res.balance !== undefined) {
        updateBalance(res.balance)
      }
    } catch (err: any) {
      const raw = String(err?.message || '')
      // eslint-disable-next-line no-console
      console.error('[okapi auto] cashout failed:', raw)
      // Treat as a loss for this round (win stays 0). DO NOT reset
      // autoCashedOutThisRoundRef to false: that would let the auto-cashout
      // useEffect retry on the next TICK and storm the server with 409s.
      syncBalance()
    } finally {
      // Reset bet state after cashout (mirror CRASHED path) so the next
      // WAITING tick can place a fresh bet without being blocked by hasBetRef.
      setBetId(null)
      betIdRef.current = null
      hasBetRef.current = false
      // Safety: if the server crashes/restarts (Render cold start) before
      // emitting CRASHED for this round, the UI would be stuck on
      // 'cashedout' indefinitely. Force-reset to 'waiting' after 20s if
      // nothing else has updated the state.
      if (crashedSafetyRef.current) clearTimeout(crashedSafetyRef.current)
      crashedSafetyRef.current = window.setTimeout(() => {
        // Settle the round locally so auto-bet counters advance and the
        // next WAITING (whenever it arrives) places a fresh bet.
        if (autoSessionRef.current && autoCurrentBetAmountRef.current > 0) {
          autoHandlersRef.current.settleRound()
        }
        setState('waiting')
        setMultiplier(1)
        setCrashPoint(null)
        setCashoutMultiplier(null)
      }, 20000)
    }
  }, [multiplier, userId, syncBalance, updateBalance])

  // Settle the round with the backend: push delta to the auto session.
  const autoSettleRound = useCallback(async () => {
    const sess = autoSessionRef.current
    if (!sess || !userId) return
    const bet = autoCurrentBetAmountRef.current
    if (bet <= 0) return // no bet was placed this round
    const win = autoCurrentWinAmountRef.current
    const delta = (autoCashedOutThisRoundRef.current ? win : 0) - bet
    autoCurrentBetAmountRef.current = 0
    autoCurrentWinAmountRef.current = 0
    autoCashedOutThisRoundRef.current = false
    try {
      const res = await okapiApi.autoProgress(sess.id, userId, delta, autoRoundsPlayed)
      setAutoRoundsPlayed(res.rounds_played)
      setAutoTotalPnl(res.total_pnl_cdf)
      if (res.finished) {
        setAutoSession(null)
        autoStopRequestedRef.current = false
      }
    } catch (err: any) {
      // Network blip: don't kill the loop, just log and continue.
      // eslint-disable-next-line no-console
      console.error('[okapi auto] progress failed:', err?.message)
      setAutoError('Erreur réseau (continuera au prochain round)')
      // Keep local counters approximately in sync.
      setAutoRoundsPlayed((r) => r + 1)
      setAutoTotalPnl((p) => p + delta)
    }
  }, [userId, autoRoundsPlayed])

  // User clicked START AUTO.
  const handleAutoStart = useCallback(
    async (cfg: AutoConfig) => {
      if (!userId) {
        nav('/login')
        return
      }
      setAutoError(null)
      try {
        const res = await okapiApi.autoStart({
          user_id: userId,
          bet_amount_cdf: cfg.amount,
          target_multiplier: cfg.targetMultiplier,
          max_rounds: cfg.maxRounds,
          stop_on_profit_cdf: cfg.stopOnProfit || null,
          stop_on_loss_cdf: cfg.stopOnLoss || null,
        })
        setAutoRoundsPlayed(0)
        setAutoTotalPnl(0)
        autoStopRequestedRef.current = false
        autoCurrentBetAmountRef.current = 0
        autoCurrentWinAmountRef.current = 0
        autoCashedOutThisRoundRef.current = false
        setAutoSession({ id: res.session_id, cfg })
        // If we're already in WAITING, place the bet immediately so the user
        // doesn't have to wait for the next cycle.
        if (state === 'waiting') {
          await autoPlaceBet()
        }
      } catch (err: any) {
        const raw = String(err?.message || 'unknown')
        // eslint-disable-next-line no-console
        console.error('[okapi auto] start failed:', raw)
        // Surface the actual cause so the player sees why nothing happened
        // (typical causes: backend not redeployed -> 404, missing migration
        // -> 500 referencing okapi_auto_sessions, or RLS misconfig).
        let label = 'Impossible de démarrer la session auto'
        if (raw.includes('404')) label = 'Backend pas à jour (404) — redéploie l\'API'
        else if (raw.includes('okapi_auto_sessions')) label = 'Migration Supabase manquante'
        else if (raw.includes('500')) label = 'Erreur serveur (voir console)'
        else if (raw.includes('Failed to fetch')) label = 'API injoignable'
        setAutoError(label)
      }
    },
    [userId, nav, state, autoPlaceBet],
  )

  // Keep the ref pointing at the latest helper closures so the WS-subscribe
  // effect (which runs only once) can call them with fresh state.
  autoHandlersRef.current = {
    placeBet: autoPlaceBet,
    cashout: autoCashout,
    settleRound: autoSettleRound,
  }

  // User clicked STOP AUTO. Finish current round, then halt.
  const handleAutoStop = useCallback(async () => {
    autoStopRequestedRef.current = true
    const sess = autoSessionRef.current
    if (!sess || !userId) {
      setAutoSession(null)
      return
    }
    // If we're not mid-round, end immediately.
    if (!hasBetRef.current) {
      try {
        await okapiApi.autoStop(sess.id, userId, 'stopped')
      } catch {
        /* best effort */
      }
      setAutoSession(null)
      autoStopRequestedRef.current = false
    }
    // else: the CRASHED handler will detect autoStopRequestedRef and call stop.
  }, [userId])

  const handleCashout = async () => {
    if (!hasBetRef.current) return
    const currentBetId = betIdRef.current
    // Defensive: never POST a stale/empty bet_id which the engine has already
    // cleared. This would just produce a server-side 404 "Bet not found".
    if (!currentBetId || currentBetId.startsWith('local-')) return
    const localM = multiplier
    // Briefly show the WIN celebration, then revert to 'playing' so the
    // okapi keeps climbing until CRASHED (mirrors autoCashout).
    setState('cashedout')
    setCashoutMultiplier(localM)
    window.setTimeout(() => {
      setState((prev) => (prev === 'cashedout' ? 'playing' : prev))
    }, 1500)
    try {
      const res = await okapiApi.cashout(userId, currentBetId)
      setCashoutMultiplier(res.multiplier)
      if (currency === 'CGLT') {
        // CGLT winnings are credited to the UniPay wallet; refresh that balance.
        if (res.balance !== null && res.balance !== undefined) setCgltBalance(Number(res.balance) || 0)
        else await syncCgltBalance()
      } else if (res.balance !== null && res.balance !== undefined) {
        updateBalance(res.balance)
      } else {
        // Pull authoritative value from the backend.
        await syncBalance()
      }
    } catch {
      // Cashout failed (e.g. race with crash). Re-sync to reflect the loss.
      if (currency === 'CGLT') syncCgltBalance()
      else syncBalance()
    } finally {
      // Reset bet state after cashout (mirror CRASHED path)
      setBetId(null)
      betIdRef.current = null
      hasBetRef.current = false
      // Safety: same recovery as autoCashout — if the server restarts before
      // emitting CRASHED, the UI would otherwise be stuck on 'cashedout'.
      if (crashedSafetyRef.current) clearTimeout(crashedSafetyRef.current)
      crashedSafetyRef.current = window.setTimeout(() => {
        setState('waiting')
        setMultiplier(1)
        setCrashPoint(null)
        setCashoutMultiplier(null)
      }, 20000)
    }
  }

  const okapiAnimClass =
    state === 'playing'
      ? 'okapi-climbing'
      : state === 'crashed'
      ? 'okapi-crashed'
      : ''

  return (
    <div
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: '#000000',
        overflow: 'hidden',
        color: 'white',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* HEADER */}
      <div
        style={{
          height: 44,
          flexShrink: 0,
          zIndex: 30,
          background: 'rgba(0,0,0,0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          gap: 8,
        }}
      >
        <button
          onClick={() => nav('/')}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            cursor: 'pointer',
            padding: 4,
          }}
          aria-label="Retour"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div
          className="tracking-widest whitespace-nowrap"
          style={{ fontFamily: 'Bebas Neue', fontSize: 18, lineHeight: 1, color: '#FFD700' }}
        >
          OKAPI CLIMB
        </div>
        <div
          className="font-semibold tracking-wider whitespace-nowrap"
          style={{ fontSize: 12, color: currency === 'CGLT' ? '#38BDF8' : '#FFD700' }}
        >
          {currency === 'CGLT'
            ? `${cgltBalance.toLocaleString()} CGLT`
            : `${balance.toLocaleString()} CDF`}
        </div>
        <button
          onClick={() => setIsMuted(!isMuted)}
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            color: 'white',
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 6,
            padding: '4px 8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
          aria-label={isMuted ? 'Activer le son' : 'Couper le son'}
        >
          {isMuted ? '🔇 Muet' : '🔊 Son'}
        </button>
      </div>

      {/* HISTORY BAR */}
      <div
        style={{
          height: 28,
          flexShrink: 0,
          zIndex: 30,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px',
          gap: 6,
          overflowX: 'auto',
        }}
        className="no-scrollbar"
      >
        <CrashHistory history={history} />
      </div>

      {/* GAME ZONE */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        <AnimatePresence>
          <motion.img
            key={bgKey}
            src={BG_MAP[bgKey]}
            alt="okapi"
            draggable={false}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
            className={okapiAnimClass}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center 40%',
            }}
          />
        </AnimatePresence>

        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(to bottom, rgba(0,0,0,0.45), rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.55))',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        />

        <ClimbCurve state={state} startTime={startTime} />

        {/* PlayersList renders its own absolute-positioned pill button +
            slide-in drawer; no wrapper needed. */}
        <PlayersList
          state={state}
          multiplier={multiplier}
          crashPoint={crashPoint}
        />

        {/* PROCHAIN TOUR badge — top-center, out of the way of the okapi
            sprite but still highly visible. Pill-shaped with a soft glass
            background so it reads on any aurora frame. */}
        {state === 'waiting' && (
          <div
            style={{
              position: 'absolute',
              top: 16,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 26,
              pointerEvents: 'none',
              padding: '8px 18px',
              borderRadius: 999,
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,215,0,0.35)',
              boxShadow: '0 4px 18px rgba(0,0,0,0.4)',
              fontFamily: 'Bebas Neue',
              fontSize: 18,
              letterSpacing: '0.18em',
              color: '#FFE38A',
              textShadow: '0 0 8px rgba(255,215,0,0.55)',
              whiteSpace: 'nowrap',
            }}
          >
            PROCHAIN TOUR DANS {countdown}s
          </div>
        )}

        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 25,
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <MultiplierDisplay
              state={state}
              startTime={startTime}
              crashPoint={crashPoint}
              cashoutMultiplier={cashoutMultiplier}
              onTick={onTick}
            />
          </div>
        </div>
      </div>

      {/* BET PANEL — extra bottom padding clears the fixed BottomNav (~64px). */}
      <div
        style={{
          flexShrink: 0,
          flexGrow: 0,
          background: '#111111',
          borderTop: '1px solid #333333',
          padding: '10px 14px',
          paddingBottom: 'calc(72px + env(safe-area-inset-bottom))',
          zIndex: 30,
          position: 'relative',
        }}
      >
        {(betError || !wsConnected) && (
          <div
            role="alert"
            style={{
              position: 'absolute',
              top: -28,
              left: 16,
              right: 16,
              background: !wsConnected
                ? 'rgba(234, 88, 12, 0.95)'
                : 'rgba(220, 38, 38, 0.95)',
              color: 'white',
              fontSize: 12,
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: 6,
              textAlign: 'center',
              zIndex: 40,
            }}
          >
            {!wsConnected
              ? 'Connexion au serveur perdue — reconnexion…'
              : betError}
          </div>
        )}
        {/* Currency toggle: CDF (house ledger) vs CGLT (UniPay wallet). */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          {(['CDF', 'CGLT'] as BetCurrency[]).map((c) => {
            const active = currency === c
            return (
              <button
                key={c}
                type="button"
                disabled={Boolean(betId)}
                onClick={() => setCurrency(c)}
                style={{
                  flex: 1,
                  height: 34,
                  borderRadius: 8,
                  fontWeight: 800,
                  fontSize: 13,
                  letterSpacing: '0.04em',
                  cursor: betId ? 'not-allowed' : 'pointer',
                  opacity: betId && !active ? 0.5 : 1,
                  border: active
                    ? c === 'CGLT' ? '1px solid #38BDF8' : '1px solid #FFD700'
                    : '1px solid #333',
                  background: active
                    ? c === 'CGLT' ? 'rgba(56,189,248,0.15)' : 'rgba(255,215,0,0.15)'
                    : '#1a1a1a',
                  color: active ? (c === 'CGLT' ? '#38BDF8' : '#FFD700') : '#888',
                }}
              >
                {c === 'CGLT' ? 'CGLT 🔷' : 'CDF'}
              </button>
            )
          })}
        </div>
        <BetPanel
          state={state}
          multiplier={multiplier}
          hasBet={Boolean(betId)}
          locked={betLocked || betSubmitting || !wsConnected}
          onPlaceBet={handlePlaceBet}
          onCashout={handleCashout}
          autoRunning={Boolean(autoSession)}
          autoRoundsPlayed={autoRoundsPlayed}
          autoTotalPnl={autoTotalPnl}
          autoError={autoError}
          onAutoStart={handleAutoStart}
          onAutoStop={handleAutoStop}
        />
      </div>
    </div>
  )
}
