import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import AutoBetPanel, { type AutoConfig } from './AutoBetPanel'
import type { BetCurrency } from '../../lib/okapi-api'

const fmtAmount = (n: number) =>
  Math.max(0, Math.floor(n)).toLocaleString('fr-FR')

type GameState = 'waiting' | 'playing' | 'crashed' | 'cashedout'
type Mode = 'manual' | 'auto'

interface Props {
  state: GameState
  multiplier: number
  hasBet: boolean
  /** When true, the MISER button is disabled regardless of round phase. */
  locked?: boolean
  /** Betting currency — drives presets, limits and labels. */
  currency?: BetCurrency
  onPlaceBet: (amount: number) => void
  onCashout: () => void
  // --- Auto-bet integration ---
  autoRunning: boolean
  autoRoundsPlayed: number
  autoTotalPnl: number
  autoError: string | null
  onAutoStart: (cfg: AutoConfig) => void
  onAutoStop: () => void
}

// Per-currency presets, limits and default stake.
const BET_CONFIG: Record<BetCurrency, { quick: number[]; min: number; max: number; default: number }> = {
  CDF: { quick: [100, 500, 1000, 5000], min: 100, max: 50000, default: 1000 },
  CGLT: { quick: [1, 5, 10, 50], min: 1, max: 1000, default: 1 },
}

export default function BetPanel({
  state,
  multiplier,
  hasBet,
  locked = false,
  currency = 'CDF',
  onPlaceBet,
  onCashout,
  autoRunning,
  autoRoundsPlayed,
  autoTotalPnl,
  autoError,
  onAutoStart,
  onAutoStop,
}: Props) {
  const cfg = BET_CONFIG[currency]
  const [amount, setAmount] = useState<number>(cfg.default)
  const [mode, setMode] = useState<Mode>('manual')

  // When the player switches currency, reset the stake to that currency's
  // default so a 1000 CDF stake doesn't leak into a CGLT bet (and vice-versa).
  useEffect(() => {
    setAmount(cfg.default)
  }, [currency, cfg.default])

  // While auto is running, force the mode tab to 'auto' so the user can't
  // navigate away from the live status panel.
  const effectiveMode: Mode = autoRunning ? 'auto' : mode

  const canBet = state === 'waiting' && !hasBet && !locked && !autoRunning
  const canCashout = state === 'playing' && hasBet

  const clamp = (n: number) =>
    Math.max(cfg.min, Math.min(cfg.max, Math.floor(n) || 0))

  // In AUTO mode, the cashout is handled automatically by the bot, so the
  // manual CASH OUT button is irrelevant — and on narrow phones the 2-column
  // grid squeezes the AutoBetPanel to ~50% width, clipping the × field and
  // the ⚙ button. We collapse to a single full-width column in that case.
  const isAuto = effectiveMode === 'auto'

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isAuto ? '1fr' : '1fr 1fr',
        gap: 12,
        width: '100%',
      }}
    >
      {/* Left (or full width in auto): MISE or AUTO. alignSelf:start makes
          this column content-sized (otherwise the grid would stretch it to
          match CASH OUT and add a gap below START AUTO / MISER). */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          alignSelf: 'start',
        }}
      >
        {/* Mode tabs */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 4,
            background: '#1a1a1a',
            borderRadius: 8,
            padding: 3,
          }}
        >
          {(['manual', 'auto'] as Mode[]).map((m) => {
            const active = effectiveMode === m
            const disabled = autoRunning && m !== 'auto'
            return (
              <button
                key={m}
                disabled={disabled}
                onClick={() => setMode(m)}
                style={{
                  background: active ? '#FFD700' : 'transparent',
                  color: active ? '#000' : '#888',
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  borderRadius: 6,
                  padding: '4px 0',
                  border: 'none',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.4 : 1,
                }}
              >
                {m === 'manual' ? 'MANUEL' : 'AUTO'}
              </button>
            )
          })}
        </div>
        {effectiveMode === 'auto' ? (
          <AutoBetPanel
            running={autoRunning}
            roundsPlayed={autoRoundsPlayed}
            totalPnl={autoTotalPnl}
            errorMsg={autoError}
            onStart={onAutoStart}
            onStop={onAutoStop}
          />
        ) : (
          <ManualBet
            amount={amount}
            setAmount={setAmount}
            canBet={canBet}
            currency={currency}
            onPlaceBet={() => onPlaceBet(clamp(amount))}
          />
        )}
      </div>

      {/* Right: CASH OUT — only shown in MANUEL mode (auto cashes out itself).
          Shows the live potential winnings (bet × multiplier) animating as
          the okapi climbs, instead of the multiplier alone. */}
      {!isAuto && (
        <CashoutCard
          canCashout={canCashout}
          hasBet={hasBet}
          state={state}
          amount={amount}
          multiplier={multiplier}
          currency={currency}
          onCashout={onCashout}
        />
      )}
    </div>
  )
}

interface ManualBetProps {
  amount: number
  setAmount: (n: number) => void
  canBet: boolean
  currency: BetCurrency
  onPlaceBet: () => void
}

function ManualBet({ amount, setAmount, canBet, currency, onPlaceBet }: ManualBetProps) {
  const cfg = BET_CONFIG[currency]
  const clamp = (n: number) =>
    Math.max(cfg.min, Math.min(cfg.max, Math.floor(n) || 0))
  const quickLabel = (n: number) =>
    currency === 'CDF' && n >= 1000 ? `${n / 1000}k` : `${n}`
  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          background: '#222',
          borderRadius: 8,
          padding: '0 10px',
          height: 36,
        }}
      >
        <input
          type="number"
          min={cfg.min}
          max={cfg.max}
          placeholder={String(cfg.default)}
          value={amount}
          disabled={!canBet}
          onChange={(e) => setAmount(clamp(Number(e.target.value)))}
          style={{
            flex: 1,
            background: 'transparent',
            color: 'white',
            fontSize: 18,
            border: 'none',
            outline: 'none',
            width: '100%',
            minWidth: 0,
            fontWeight: 600,
            opacity: canBet ? 1 : 0.5,
          }}
        />
        <span style={{ color: '#888', fontSize: 12 }}>{currency}</span>
      </div>

      <div style={{ color: '#666', fontSize: 10, fontWeight: 600 }}>
        Mise min. {fmtAmount(cfg.min)} {currency}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 4,
        }}
      >
        {cfg.quick.map((q) => (
          <button
            key={q}
            disabled={!canBet}
            onClick={() => setAmount(q)}
            style={{
              background: '#333',
              color: '#FFD700',
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 6,
              padding: '4px 0',
              border: 'none',
              cursor: canBet ? 'pointer' : 'not-allowed',
              opacity: canBet ? 1 : 0.5,
            }}
          >
            {quickLabel(q)}
          </button>
        ))}
      </div>

      <button
        disabled={!canBet}
        onClick={onPlaceBet}
        style={{
          background: 'linear-gradient(135deg, #FFD700, #F59E0B)',
          color: '#000000',
          fontWeight: 900,
          fontSize: 16,
          borderRadius: 8,
          border: 'none',
          flex: 1,
          minHeight: 40,
          letterSpacing: '0.08em',
          cursor: canBet ? 'pointer' : 'not-allowed',
          opacity: canBet ? 1 : 0.45,
          marginTop: 'auto',
        }}
      >
        MISER
      </button>
    </>
  )
}

// ----------------- Cashout card -----------------

interface CashoutCardProps {
  canCashout: boolean
  hasBet: boolean
  state: GameState
  amount: number
  multiplier: number
  currency: BetCurrency
  onCashout: () => void
}

function CashoutCard({ canCashout, hasBet, state, amount, multiplier, currency, onCashout }: CashoutCardProps) {
  // Live winnings if the user cashes out RIGHT NOW.
  const win = amount * multiplier

  // Idle state: no live bet running. Show a calm "CASH OUT" placeholder.
  if (!canCashout) {
    return (
      <div
        style={{
          background: '#1a1a1a',
          borderRadius: 12,
          border: '1px solid #2a2a2a',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '14px 10px',
          color: '#555',
          minHeight: 96,
        }}
      >
        <span
          style={{
            fontSize: 11,
            letterSpacing: '0.18em',
            fontWeight: 800,
            color: '#666',
          }}
        >
          CASH OUT
        </span>
        <span
          style={{
            fontSize: 22,
            marginTop: 6,
            fontWeight: 900,
            color: '#444',
          }}
        >
          {hasBet ? `${fmtAmount(amount)} ${currency}` : '—'}
        </span>
        {hasBet && state === 'waiting' && (
          <span style={{ fontSize: 10, color: '#666', marginTop: 4 }}>
            En attente du tour
          </span>
        )}
      </div>
    )
  }

  // Active state: bet placed + game playing → tap to lock in the win.
  return (
    <motion.button
      onClick={onCashout}
      whileTap={{ scale: 0.96 }}
      animate={{
        boxShadow: [
          '0 0 0 0 rgba(0, 200, 117, 0.45)',
          '0 0 0 12px rgba(0, 200, 117, 0)',
        ],
      }}
      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
      style={{
        position: 'relative',
        background:
          'linear-gradient(135deg, #00C875 0%, #059669 60%, #047857 100%)',
        borderRadius: 12,
        border: '1px solid rgba(255, 215, 0, 0.35)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px 10px',
        cursor: 'pointer',
        overflow: 'hidden',
        minHeight: 96,
      }}
    >
      {/* Subtle shimmer overlay */}
      <motion.div
        aria-hidden
        animate={{ x: ['-120%', '120%'] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '60%',
          height: '100%',
          background:
            'linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%)',
          pointerEvents: 'none',
        }}
      />

      <span
        style={{
          fontSize: 10,
          letterSpacing: '0.18em',
          fontWeight: 800,
          color: 'rgba(255, 255, 255, 0.85)',
        }}
      >
        ENCAISSER
      </span>

      <motion.div
        // Re-animate scale on every multiplier tick for a heartbeat effect.
        key={Math.floor(multiplier * 10)}
        initial={{ scale: 0.96 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        style={{
          marginTop: 4,
          display: 'flex',
          alignItems: 'baseline',
          gap: 4,
          color: '#FFFFFF',
          fontWeight: 900,
          letterSpacing: '0.02em',
          textShadow: '0 1px 4px rgba(0,0,0,0.35)',
          lineHeight: 1,
        }}
      >
        <span style={{ fontSize: 26 }}>{fmtAmount(win)}</span>
        <span style={{ fontSize: 12, opacity: 0.85 }}>{currency}</span>
      </motion.div>

      <span
        style={{
          marginTop: 6,
          fontSize: 12,
          fontWeight: 800,
          color: '#FFD700',
          background: 'rgba(0, 0, 0, 0.25)',
          padding: '2px 8px',
          borderRadius: 999,
          letterSpacing: '0.04em',
        }}
      >
        ×{multiplier.toFixed(2)}
      </span>
    </motion.button>
  )
}
