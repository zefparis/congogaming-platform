import { useState } from 'react'
import AutoBetPanel, { type AutoConfig } from './AutoBetPanel'

type GameState = 'waiting' | 'playing' | 'crashed' | 'cashedout'
type Mode = 'manual' | 'auto'

interface Props {
  state: GameState
  multiplier: number
  hasBet: boolean
  /** When true, the MISER button is disabled regardless of round phase. */
  locked?: boolean
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

const QUICK = [100, 500, 1000, 5000]
const MIN_BET = 100
const MAX_BET = 50000

export default function BetPanel({
  state,
  multiplier,
  hasBet,
  locked = false,
  onPlaceBet,
  onCashout,
  autoRunning,
  autoRoundsPlayed,
  autoTotalPnl,
  autoError,
  onAutoStart,
  onAutoStop,
}: Props) {
  const [amount, setAmount] = useState<number>(1000)
  const [mode, setMode] = useState<Mode>('manual')

  // While auto is running, force the mode tab to 'auto' so the user can't
  // navigate away from the live status panel.
  const effectiveMode: Mode = autoRunning ? 'auto' : mode

  const canBet = state === 'waiting' && !hasBet && !locked && !autoRunning
  const canCashout = state === 'playing' && hasBet

  const clamp = (n: number) =>
    Math.max(MIN_BET, Math.min(MAX_BET, Math.floor(n) || 0))

  const quickLabel = (n: number) =>
    n >= 1000 ? `${n / 1000}k` : `${n}`

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
            onPlaceBet={() => onPlaceBet(clamp(amount))}
          />
        )}
      </div>

      {/* Right: CASH OUT — only shown in MANUEL mode (auto cashes out itself) */}
      {!isAuto && (
      <button
        disabled={!canCashout}
        onClick={onCashout}
        style={{
          background: canCashout
            ? 'linear-gradient(135deg, #00A86B, #059669)'
            : '#1a1a1a',
          color: canCashout ? 'white' : '#444',
          borderRadius: 8,
          border: 'none',
          fontSize: 14,
          fontWeight: 900,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: canCashout ? 'pointer' : 'default',
          letterSpacing: '0.08em',
        }}
      >
        <span>CASH OUT</span>
        <span style={{ fontSize: 24, marginTop: 4, letterSpacing: '0.04em' }}>
          ×{multiplier.toFixed(2)}
        </span>
      </button>
      )}
    </div>
  )
}

interface ManualBetProps {
  amount: number
  setAmount: (n: number) => void
  canBet: boolean
  onPlaceBet: () => void
}

function ManualBet({ amount, setAmount, canBet, onPlaceBet }: ManualBetProps) {
  const clamp = (n: number) =>
    Math.max(MIN_BET, Math.min(MAX_BET, Math.floor(n) || 0))
  const quickLabel = (n: number) => (n >= 1000 ? `${n / 1000}k` : `${n}`)
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
          min={MIN_BET}
          max={MAX_BET}
          placeholder="100"
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
        <span style={{ color: '#888', fontSize: 12 }}>CDF</span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 4,
        }}
      >
        {QUICK.map((q) => (
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
