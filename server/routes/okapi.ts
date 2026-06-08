import type { FastifyPluginAsync } from 'fastify'
import '@fastify/websocket'
import { randomUUID } from 'node:crypto'
import { engine } from '../lib/okapi-engine.js'
import { recordLedgerEntry } from '../lib/ledger.js'
import { getSupabase } from '../lib/supabase.js'
import { OkapiBetBodySchema, OkapiCashoutBodySchema } from '../lib/validation.js'
import { onWagerPlaced } from '../lib/referral.js'
import { recordAgentCommission } from '../lib/agent.js'
import { debitCGLT, creditCGLT, getUserUnipayPhone, CgltError } from '../lib/unipay-cglt.js'
import { addXPAndReward, toFarmingPayload, type FarmingPayload } from '../lib/farming.js'

// Best-effort XP/CGLT farming after a successful wager. Never throws — a
// farming failure must not break the bet flow.
async function awardFarming(
  log: { error: (obj: unknown, msg?: string) => void },
  phone: string | null,
  betAmount: number,
): Promise<FarmingPayload | null> {
  if (!phone) return null
  const sb = getSupabase()
  if (!sb) return null
  try {
    return toFarmingPayload(await addXPAndReward(sb, phone, betAmount))
  } catch (err) {
    log.error({ err }, '[farming] award failed')
    return null
  }
}

// Tracks in-flight CGLT bets so cashout pays winnings in CGLT (via UniPay)
// instead of the CDF ledger. CGLT bets are intentionally kept off the
// CDF-oriented okapi_bets table / cashout RPC so the CDF path is untouched.
const cgltBets = new Map<string, { phone: string; gameRef: string; amount: number }>()

type WSLike = {
  send: (data: string) => void
  on: (event: string, cb: (...args: unknown[]) => void) => void
  close: () => void
  isAlive: boolean
  lastPing: number
  ip: string
}

const sockets = new Set<WSLike>()
const socketsByIp = new Map<string, number>()
// DRC mobile carriers (Orange/Airtel/Africell) use CGNAT, so thousands of
// users can share a single public IP. A small cap would lock out everyone
// behind the same NAT after a few players. Keep this generous; abuse is
// limited by the global rate limiter and per-user balance gating.
const MAX_SOCKETS_PER_IP = 200
const HEARTBEAT_INTERVAL_MS = 15000
let broadcastWired = false
let heartbeatInterval: NodeJS.Timeout | null = null

function cleanupSocket(ws: WSLike) {
  if (!sockets.has(ws)) return
  sockets.delete(ws)
  const ipCount = socketsByIp.get(ws.ip) ?? 0
  if (ipCount > 0) {
    socketsByIp.set(ws.ip, ipCount - 1)
  }
}

function startHeartbeat() {
  if (heartbeatInterval) return
  heartbeatInterval = setInterval(() => {
    const now = Date.now()
    for (const ws of sockets) {
      if (!ws.isAlive) {
        cleanupSocket(ws)
        try { ws.close() } catch {}
        continue
      }
      ws.isAlive = false
      ws.lastPing = now
      try { ws.send(JSON.stringify({ type: 'PING' })) } catch { cleanupSocket(ws) }
    }
  }, HEARTBEAT_INTERVAL_MS)
}

const okapiRoutes: FastifyPluginAsync = async (app) => {
  app.get('/ws', {
    websocket: true,
    // CGNAT in DRC: hundreds of users can share an IP. Don't gate WS
    // upgrades through the global IP rate limiter; the per-IP socket cap
    // and heartbeat handle abuse.
    config: { rateLimit: false },
  } as any, (socket, req) => {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || (req.socket.remoteAddress || 'unknown')
    const ipCount = socketsByIp.get(ip) ?? 0
    if (ipCount >= MAX_SOCKETS_PER_IP) {
      socket.close(1008, 'Too many connections from this IP')
      return
    }
    socketsByIp.set(ip, ipCount + 1)

    const ws = socket as WSLike
    ws.isAlive = true
    ws.lastPing = Date.now()
    ws.ip = ip
    sockets.add(ws)

    ws.send(JSON.stringify({ type: 'HISTORY', history: engine.history }))
    const info = engine.info()
    if (info.state === 'PLAYING' && info.startTime) ws.send(JSON.stringify({ type: 'PLAYING', startTime: info.startTime }))
    else if (info.state === 'WAITING') ws.send(JSON.stringify({ type: 'WAITING', countdown: 5 }))
    else if (info.state === 'CRASHED' && info.crashPoint != null) ws.send(JSON.stringify({ type: 'CRASHED', crashPoint: info.crashPoint }))

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'PONG') {
          ws.isAlive = true
        }
      } catch {}
    })

    ws.on('close', () => cleanupSocket(ws))
    ws.on('error', () => cleanupSocket(ws))
  })

  startHeartbeat()

  if (!broadcastWired) {
    engine.on('broadcast', (msg: unknown) => {
      const data = JSON.stringify(msg)
      for (const ws of sockets) {
        try { ws.send(data) } catch { cleanupSocket(ws) }
      }
    })
    broadcastWired = true
  }

  app.post('/api/game/bet', { preHandler: app.requireAuth }, async (req, reply) => {
    const parsed = OkapiBetBodySchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message || 'Invalid bet' })
    const user_id = req.user.id
    const { amount_cdf, auto_session_id, currency } = parsed.data

    const BET_GRACE_MS = 800
    const sincePlayStart = engine.state === 'PLAYING' && engine.startTime ? Date.now() - engine.startTime : Infinity
    const inGrace = engine.state === 'PLAYING' && sincePlayStart < BET_GRACE_MS
    if (engine.state !== 'WAITING' && !inGrace) return reply.code(409).send({ error: 'Betting closed' })

    const bet_id = randomUUID()
    const round_id = engine.info().round_id

    // ── CGLT bet path (1 CGLT = 1 CDF) — handled entirely via UniPay ──────
    if (currency === 'CGLT') {
      const phone = await getUserUnipayPhone(user_id)
      if (!phone) return reply.code(404).send({ error: 'phone_not_found' })
      const gameRef = `okapi:${round_id}:${bet_id}`
      let newBalance: number
      try {
        const res = await debitCGLT(phone, amount_cdf, gameRef)
        newBalance = res.new_balance
      } catch (e) {
        if (e instanceof CgltError) {
          if (e.code === 'INSUFFICIENT_CGLT') return reply.code(402).send({ error: 'Insufficient CGLT' })
          return reply.code(e.status).send({ error: e.code })
        }
        return reply.code(500).send({ error: 'CGLT debit failed' })
      }
      try {
        engine.registerBet({ bet_id, user_id, amount_cdf, round_id, cashed_out: false })
      } catch (error) {
        // Refund the CGLT debit if the engine rejects the bet.
        await creditCGLT(phone, amount_cdf, gameRef, `${gameRef}:refund`).catch((err) =>
          app.log.error({ err }, 'okapi CGLT refund failed'),
        )
        app.log.error({ err: error, user_id, bet_id }, 'failed to register CGLT bet')
        return reply.code(500).send({ error: 'Bet persistence failed' })
      }
      cgltBets.set(bet_id, { phone, gameRef, amount: amount_cdf })
      await onWagerPlaced(app.log, user_id, amount_cdf, 'okapi', bet_id)
      const farming = await awardFarming(app.log, phone, amount_cdf)
      return reply.send({ bet_id, balance: newBalance, currency: 'CGLT', farming })
    }

    let balance: number | null = null
    try {
      const ledger = await recordLedgerEntry({
        user_id,
        direction: 'debit',
        amount: amount_cdf,
        currency: 'CDF',
        reason: 'okapi_bet_placed',
        reference_type: 'okapi_bet',
        reference_id: bet_id || round_id,
        idempotency_key: `okapi:bet:${round_id}:${user_id}`,
      })
      if (ledger.duplicate) return reply.code(409).send({ error: 'Already bet this round' })
      balance = ledger.balance
    }
    catch (e) { return reply.code(400).send({ error: e instanceof Error ? e.message : 'Balance error' }) }

    const sb = getSupabase()
    if (sb) {
      const { error } = await sb.from('okapi_bets').insert({
        id: bet_id,
        user_id,
        round_id,
        amount_cdf,
        status: 'pending',
        auto_session_id: auto_session_id || null,
      })
      if (error) {
        await recordLedgerEntry({
          user_id,
          direction: 'credit',
          amount: amount_cdf,
          currency: 'CDF',
          reason: 'okapi_bet_refund',
          reference_type: 'okapi_bet',
          reference_id: bet_id || round_id,
          idempotency_key: `okapi:bet:${round_id}:${user_id}:refund`,
        }).catch((refundErr) => app.log.error({ err: refundErr }, 'okapi refund failed'))
        app.log.error({ err: error.message, user_id, bet_id }, 'failed to insert bet')
        return reply.code(500).send({ error: 'Bet persistence failed' })
      }
    }

    try {
      engine.registerBet({ bet_id, user_id, amount_cdf, round_id, cashed_out: false })
    } catch (error) {
      await recordLedgerEntry({
        user_id,
        direction: 'credit',
        amount: amount_cdf,
        currency: 'CDF',
        reason: 'okapi_bet_refund',
        reference_type: 'okapi_bet',
        reference_id: bet_id || round_id,
        idempotency_key: `okapi:bet:${round_id}:${user_id}:refund`,
      }).catch((refundErr) => app.log.error({ err: refundErr }, 'okapi refund failed'))
      app.log.error({ err: error, user_id, bet_id }, 'failed to register bet')
      return reply.code(500).send({ error: 'Bet persistence failed' })
    }

    // Best-effort referral tier check; bet_id ensures idempotency.
    await onWagerPlaced(app.log, user_id, amount_cdf, 'okapi', bet_id)
    await recordAgentCommission(user_id, bet_id, 'okapi', amount_cdf)

    const farming = await awardFarming(app.log, await getUserUnipayPhone(user_id), amount_cdf)

    return reply.send({ bet_id, balance, farming })
  })

  app.post('/api/game/cashout', { preHandler: app.requireAuth }, async (req, reply) => {
    const parsed = OkapiCashoutBodySchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message || 'Invalid request' })
    const user_id = req.user.id
    const { bet_id } = parsed.data

    if (engine.state !== 'PLAYING') return reply.code(409).send({ error: 'Game not running' })
    const bet = engine.getBet(bet_id)
    if (!bet || bet.user_id !== user_id) {
      app.log.warn({ bet_id, user_id, engineState: engine.state, hasBet: !!bet }, 'cashout: bet not found or user mismatch')
      return reply.code(404).send({ error: 'Bet not found' })
    }
    if (bet.cashed_out) return reply.code(409).send({ error: 'Already cashed out' })

    const multiplier = engine.currentMultiplier()
    if (engine.crashPoint != null && multiplier >= engine.crashPoint) return reply.code(409).send({ error: 'Too late' })
    const win_amount = Math.floor(bet.amount_cdf * multiplier)

    // ── CGLT cashout path — pay winnings in CGLT via UniPay ──────────────
    const cgltBet = cgltBets.get(bet_id)
    if (cgltBet) {
      let balance: number | null = null
      try {
        const res = await creditCGLT(cgltBet.phone, win_amount, cgltBet.gameRef, `${cgltBet.gameRef}:win`)
        balance = res.new_balance
      } catch (e) {
        return reply.code(e instanceof CgltError ? e.status : 500).send({
          error: e instanceof CgltError ? e.code : 'CGLT credit failed',
        })
      }
      cgltBets.delete(bet_id)
      bet.cashed_out = true
      bet.cashout_multiplier = multiplier
      for (const ws of sockets) {
        try { ws.send(JSON.stringify({ type: 'CASHOUT_CONFIRM', multiplier, winAmount: win_amount })) }
        catch { cleanupSocket(ws) }
      }
      return reply.send({ win_amount, multiplier, balance, currency: 'CGLT' })
    }

    let balance: number | null = null
    try {
      const sb = getSupabase()
      if (!sb) return reply.code(503).send({ error: 'Database not configured' })
      const { data, error } = await sb.rpc('okapi_cashout_atomic', {
        p_bet_id: bet_id,
        p_user_id: user_id,
        p_cashout_multiplier: multiplier,
        p_win_amount: win_amount,
        p_idempotency_key: `okapi:cashout:${bet_id}`,
      })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      balance = row?.balance == null ? null : Number(row.balance)
    }
    catch (e) { return reply.code(500).send({ error: e instanceof Error ? e.message : 'Balance error' }) }

    bet.cashed_out = true
    bet.cashout_multiplier = multiplier

    for (const ws of sockets) {
      try { ws.send(JSON.stringify({ type: 'CASHOUT_CONFIRM', multiplier, winAmount: win_amount })) }
      catch { cleanupSocket(ws) }
    }
    return reply.send({ win_amount, multiplier, balance })
  })

  app.get('/api/game/history', async (_req, reply) => {
    const sb = getSupabase()
    if (!sb) return reply.send({ history: engine.history.slice(0, 20) })
    try {
      const { data, error } = await sb.from('okapi_rounds').select('crash_point').order('started_at', { ascending: false }).limit(20)
      if (error) throw error
      return reply.send({ history: (data ?? []).map((r: { crash_point: number | string }) => Number(r.crash_point)) })
    } catch {
      return reply.send({ history: engine.history.slice(0, 20) })
    }
  })
}

export { okapiRoutes }
export default okapiRoutes
