import { EventEmitter } from 'node:events'
import { webcrypto } from 'node:crypto'
import { getSupabase } from './supabase.js'

export type GameState = 'WAITING' | 'PLAYING' | 'CRASHED'

export interface PendingBet {
  bet_id: string
  user_id: string
  amount_cdf: number
  round_id: string | null
  cashed_out: boolean
  cashout_multiplier?: number
}

export interface RoundInfo {
  round_id: string | null
  state: GameState
  startTime: number | null
  crashPoint: number | null
}

const WAIT_MS = 5_000
const TICK_MS = 100
const POST_CRASH_MS = 3_000

export function generateCrashPoint(): number {
  const arr = new Uint32Array(1)
  webcrypto.getRandomValues(arr)
  const r = arr[0] / 0xffffffff
  if (r < 0.05) return 1.0
  return Math.min(
    Math.max(1.0, (1 / (1 - r)) * 0.92), // 8% house edge
    50.0 // max ×50 at launch
  )
}

export function multiplierAt(elapsedSec: number): number {
  return 1 + 0.06 * elapsedSec + Math.pow(0.06 * elapsedSec, 2)
}

export class GameEngine extends EventEmitter {
  state: GameState = 'WAITING'
  startTime: number | null = null
  crashPoint: number | null = null
  roundId: string | null = null

  bets = new Map<string, PendingBet>()
  history: number[] = []

  private tickHandle: NodeJS.Timeout | null = null

  start() {
    this.cycle()
  }

  private async cycle() {
    // WAITING
    this.state = 'WAITING'
    this.startTime = null
    this.bets.clear()

    // Pre-generate crash point and create the round row BEFORE opening
    // betting. Bets placed during WAITING reference `engine.roundId`, so
    // the round must exist by then — otherwise every bet is persisted
    // with round_id=null and admin aggregations (joueurs / mises /
    // cashouts / profit maison) join nothing and report 0.
    this.crashPoint = generateCrashPoint()
    this.roundId = await this.createRound(this.crashPoint)

    // If round creation failed, abort and retry after delay
    if (!this.roundId) {
      console.error('[okapi-engine] createRound failed, aborting cycle and retrying in 5s')
      await sleep(5000)
      this.cycle()
      return
    }

    let countdown = Math.ceil(WAIT_MS / 1000)
    this.emit('broadcast', { type: 'WAITING', countdown })
    const waitInterval = setInterval(() => {
      countdown -= 1
      if (countdown >= 0) {
        this.emit('broadcast', { type: 'WAITING', countdown })
      }
    }, 1000)

    await sleep(WAIT_MS)
    clearInterval(waitInterval)

    // PLAYING
    this.state = 'PLAYING'
    this.startTime = Date.now()
    this.emit('broadcast', { type: 'PLAYING', startTime: this.startTime })

    await new Promise<void>((resolve) => {
      this.tickHandle = setInterval(() => {
        if (this.state !== 'PLAYING' || this.startTime == null || this.crashPoint == null) return
        const elapsed = (Date.now() - this.startTime) / 1000
        const m = multiplierAt(elapsed)
        if (m >= this.crashPoint) {
          if (this.tickHandle) clearInterval(this.tickHandle)
          this.tickHandle = null
          resolve()
        } else {
          this.emit('broadcast', { type: 'TICK', multiplier: m })
        }
      }, TICK_MS)
    })

    // CRASHED
    this.state = 'CRASHED'
    const cp = this.crashPoint!
    this.history = [cp, ...this.history].slice(0, 50)
    this.emit('broadcast', { type: 'CRASHED', crashPoint: cp })

    // Persist round end + mark uncashed bets as lost
    await this.finalizeRound(cp)

    await sleep(POST_CRASH_MS)
    this.cycle()
  }

  private async createRound(crashPoint: number): Promise<string | null> {
    const sb = getSupabase()
    if (!sb) return null
    try {
      const { data, error } = await sb
        .from('okapi_rounds')
        .insert({ crash_point: crashPoint })
        .select('id')
        .single()
      if (error) throw error
      return data?.id ?? null
    } catch (e) {
      console.error('createRound failed', e)
      return null
    }
  }

  private async finalizeRound(crashPoint: number) {
    const sb = getSupabase()
    if (!sb || !this.roundId) return
    try {
      await sb
        .from('okapi_rounds')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', this.roundId)

      // Mark uncashed pending bets as lost
      for (const bet of this.bets.values()) {
        if (!bet.cashed_out) {
          await sb
            .from('okapi_bets')
            .update({ status: 'lost' })
            .eq('id', bet.bet_id)
        }
      }
    } catch (e) {
      console.error('finalizeRound failed', e)
    }
  }

  registerBet(bet: PendingBet) {
    bet.round_id = this.roundId
    this.bets.set(bet.bet_id, bet)
  }

  getBet(betId: string) {
    return this.bets.get(betId)
  }

  currentMultiplier(): number {
    if (this.state !== 'PLAYING' || this.startTime == null) return 1
    return multiplierAt((Date.now() - this.startTime) / 1000)
  }

  info(): RoundInfo {
    return {
      round_id: this.roundId,
      state: this.state,
      startTime: this.startTime,
      crashPoint: this.state === 'CRASHED' ? this.crashPoint : null,
    }
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

export const engine = new GameEngine()
