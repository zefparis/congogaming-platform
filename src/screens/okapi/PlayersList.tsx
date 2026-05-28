import { useEffect, useMemo, useRef, useState } from 'react'

type GameState = 'waiting' | 'playing' | 'crashed' | 'cashedout'

interface Player {
  name: string
  bet: number
  cashoutAt: number | null
  status: 'betting' | 'cashedout' | 'lost'
  cashedAtValue: number | null
}

interface Props {
  state: GameState
  multiplier: number
  crashPoint: number | null
}

const NAMES = [
  'Kinshasa01',
  'Matadi22',
  'Lubumbashi7',
  'Goma_King',
  'Kisangani_X',
  'Bukavu_Ace',
  'Kananga99',
  'Mbuji_Pro',
]

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// How long the drawer stays open without interaction.
const AUTO_CLOSE_MS = 8000

export default function PlayersList({ state, multiplier, crashPoint }: Props) {
  const [players, setPlayers] = useState<Player[]>([])
  const [open, setOpen] = useState(false)
  const closeTimerRef = useRef<number | null>(null)

  // ---- player simulation (unchanged logic) ----
  useEffect(() => {
    if (state === 'waiting') {
      const count = rand(5, 8)
      const shuffled = [...NAMES].sort(() => Math.random() - 0.5).slice(0, count)
      setPlayers(
        shuffled.map((name) => ({
          name,
          bet: [500, 1000, 2000, 5000, 10000][rand(0, 4)],
          cashoutAt: Math.random() < 0.7 ? 1.2 + Math.random() * 5 : null,
          status: 'betting',
          cashedAtValue: null,
        })),
      )
    }
  }, [state])

  useEffect(() => {
    if (state !== 'playing') return
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.status !== 'betting') return p
        if (p.cashoutAt && multiplier >= p.cashoutAt) {
          return { ...p, status: 'cashedout', cashedAtValue: p.cashoutAt }
        }
        return p
      }),
    )
  }, [multiplier, state])

  useEffect(() => {
    if (state === 'crashed') {
      setPlayers((prev) =>
        prev.map((p) => (p.status === 'betting' ? { ...p, status: 'lost' } : p)),
      )
    }
  }, [state, crashPoint])

  // ---- auto-close timer ----
  const armCloseTimer = () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = window.setTimeout(
      () => setOpen(false),
      AUTO_CLOSE_MS,
    )
  }
  useEffect(() => {
    if (open) armCloseTimer()
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    }
  }, [open])

  const sorted = useMemo(() => players, [players])
  const activeCount = sorted.filter((p) => p.status === 'betting').length

  return (
    <>
      {/* Floating pill button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Joueurs"
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          zIndex: 26,
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,215,0,0.3)',
          borderRadius: 20,
          padding: '6px 12px',
          color: '#FFD700',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.04em',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}
      >
        <span aria-hidden>👥</span>
        <span>{activeCount || sorted.length}</span>
      </button>

      {/* Backdrop click-catcher (transparent, only inside the canvas). It is
          siblings with the drawer and only renders when open. */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 26,
            background: 'transparent',
          }}
        />
      )}

      {/* Slide-in drawer */}
      <div
        onClick={armCloseTimer}
        onTouchStart={armCloseTimer}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '55%',
          maxWidth: 280,
          maxHeight: '65%',
          zIndex: 27,
          transform: open ? 'translateX(0)' : 'translateX(-105%)',
          transition: 'transform 0.25s ease',
          background: 'rgba(10,10,30,0.75)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderRight: '1px solid rgba(255,215,0,0.2)',
          borderBottom: '1px solid rgba(255,215,0,0.2)',
          borderRadius: '0 0 16px 0',
          display: 'flex',
          flexDirection: 'column',
          color: 'white',
          boxShadow: '4px 4px 24px rgba(0,0,0,0.5)',
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 12px',
            borderBottom: '1px solid rgba(255,215,0,0.15)',
          }}
        >
          <span
            style={{
              fontSize: 11,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: '#FFD700',
              fontWeight: 700,
            }}
          >
            Joueurs · {sorted.length}
          </span>
          <button
            onClick={() => setOpen(false)}
            aria-label="Fermer"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#aaa',
              fontSize: 18,
              cursor: 'pointer',
              lineHeight: 1,
              padding: 2,
            }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable list */}
        <div
          className="no-scrollbar"
          style={{
            overflowY: 'auto',
            padding: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            flex: 1,
          }}
        >
          {sorted.map((p) => (
            <div
              key={p.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8,
                padding: '6px 10px',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span
                  style={{
                    color: 'white',
                    fontWeight: 700,
                    fontSize: 13,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {p.name}
                </span>
                <span style={{ color: '#FFD700', fontSize: 11, fontWeight: 600 }}>
                  {p.bet.toLocaleString('fr-FR')} CDF
                </span>
              </div>
              <div style={{ textAlign: 'right', fontSize: 11, fontWeight: 700 }}>
                {p.status === 'betting' && (
                  <span style={{ color: '#888' }}>betting</span>
                )}
                {p.status === 'cashedout' && p.cashedAtValue && (
                  <span style={{ color: '#34d399' }}>
                    ×{p.cashedAtValue.toFixed(2)} ✓
                  </span>
                )}
                {p.status === 'lost' && (
                  <span style={{ color: '#f87171' }}>💥</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
