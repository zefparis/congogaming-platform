import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api, type FarmingStatus } from '../lib/api';

const TIER_ORDER = ['debutant', 'bronze', 'argent', 'or', 'diamant'];

function tierIndex(name?: string): number {
  return name ? TIER_ORDER.indexOf(name) : -1;
}

function cap(name?: string): string {
  if (!name) return '';
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Render the inline `[████░░]` micro-bar used in the single-line summary. */
function MicroBar({ percent }: { percent: number }) {
  const cells = 6;
  const filled = Math.round((Math.max(0, Math.min(100, percent)) / 100) * cells);
  return (
    <span
      aria-hidden
      style={{ letterSpacing: 1, fontSize: 11, fontFamily: 'monospace', flexShrink: 0 }}
    >
      <span style={{ color: '#9ca3af' }}>[</span>
      <span style={{ color: '#FFD700' }}>{'█'.repeat(filled)}</span>
      <span style={{ color: 'rgba(255,255,255,0.18)' }}>{'░'.repeat(cells - filled)}</span>
      <span style={{ color: '#9ca3af' }}>]</span>
    </span>
  );
}

interface Props {
  /** Sticky offset from the top of the scroll container (px). */
  top?: number;
  /** Extra zIndex if the host stacks content above the default. */
  zIndex?: number;
}

/**
 * Sticky CGLT farming progress mini-bar (28px) shown at the top of each game,
 * just under the game header. Replaces the old floating FarmingWidget overlay.
 *
 * - Single-line summary with a thin 4px gold fill across the band.
 * - Tap opens a bottom sheet with the full tier ladder & recent rewards.
 * - Swipe down on the band dismisses it for the session.
 * - Refreshes on the `farming:refresh` event (dispatched after each bet),
 *   on window focus, and via a slow poll.
 */
export default function FarmingBar({ top = 0, zIndex = 20 }: Props) {
  const [status, setStatus] = useState<FarmingStatus | null>(null);
  const [hidden, setHidden] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const prevTierRef = useRef<number | null>(null);

  // Touch tracking for swipe-down-to-dismiss vs tap-to-open.
  const touchStartY = useRef<number | null>(null);
  const touchMoved = useRef(false);

  const load = useCallback(async () => {
    try {
      const s = await api.farmingStatus();
      const newIdx = tierIndex(s.current_tier?.name);
      if (prevTierRef.current !== null && newIdx > prevTierRef.current) {
        // Brief gold pulse on tier-up — no blocking overlay during play.
        setPulse(true);
        setHidden(false);
        window.setTimeout(() => setPulse(false), 1800);
      }
      prevTierRef.current = newIdx;
      setStatus(s);
    } catch {
      /* keep last known value; the bar is best-effort */
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(load, 20000);
    const onFocus = () => load();
    const onRefresh = () => load();
    window.addEventListener('focus', onFocus);
    window.addEventListener('farming:refresh', onRefresh as EventListener);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('farming:refresh', onRefresh as EventListener);
    };
  }, [load]);

  if (hidden || !status) return null;

  const { current_tier, next_tier, total_xp, progress_percent } = status;
  const totalFloor = Math.floor(total_xp);
  const nextThreshold = next_tier ? next_tier.xp_needed + totalFloor : totalFloor;

  function onTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0]?.clientY ?? null;
    touchMoved.current = false;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (touchStartY.current == null) return;
    const dy = (e.touches[0]?.clientY ?? 0) - touchStartY.current;
    if (Math.abs(dy) > 6) touchMoved.current = true;
    if (dy > 48) {
      setHidden(true);
      touchStartY.current = null;
    }
  }
  function onClick() {
    if (touchMoved.current) return; // was a swipe, not a tap
    setSheetOpen(true);
  }

  return (
    <>
      <div
        onClick={onClick}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        role="button"
        aria-label="Progression farming CGLT — toucher pour le détail"
        style={{
          position: 'sticky',
          top,
          zIndex,
          height: 28,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 12px',
          cursor: 'pointer',
          userSelect: 'none',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          fontSize: 11.5,
          color: '#e5e7eb',
          background: pulse ? 'rgba(255,215,0,0.18)' : 'rgba(0,0,0,0.85)',
          borderBottom: '1px solid rgba(255,215,0,0.25)',
          transition: 'background 0.4s ease',
        }}
      >
        <span style={{ flexShrink: 0 }}>🪓</span>
        <span style={{ color: '#FFD700', fontWeight: 700, flexShrink: 0 }}>
          {cap(current_tier.name)}
        </span>
        <span style={{ color: '#6b7280', flexShrink: 0 }}>·</span>
        <MicroBar percent={progress_percent} />
        <span style={{ color: '#9ca3af', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          {next_tier ? `${totalFloor}/${nextThreshold} XP` : `${totalFloor} XP`}
        </span>
        <span style={{ color: '#6b7280', flexShrink: 0 }}>·</span>
        <span
          style={{
            color: next_tier ? '#38BDF8' : '#22C55E',
            flexShrink: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {next_tier ? `+${next_tier.xp_needed} XP → ${cap(next_tier.name)}` : 'Palier max 💎'}
        </span>

        {/* Thin 4px gold fill across the bottom of the band. */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            height: 4,
            width: `${Math.max(0, Math.min(100, progress_percent))}%`,
            background: 'linear-gradient(90deg, #B8860B, #FFD700)',
            transition: 'width 0.6s ease',
          }}
        />
      </div>

      <FarmingSheet open={sheetOpen} onClose={() => setSheetOpen(false)} status={status} />
    </>
  );
}

function FarmingSheet({
  open,
  onClose,
  status,
}: {
  open: boolean;
  onClose: () => void;
  status: FarmingStatus;
}) {
  const { current_tier, total_xp, total_cglt_earned, tiers, recent_rewards } = status;
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 480,
              maxHeight: '82vh',
              overflowY: 'auto',
              background: '#0f0f12',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              border: '1px solid rgba(255,215,0,0.2)',
              padding: '14px 16px',
              paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
            }}
          >
            <div
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                background: 'rgba(255,255,255,0.25)',
                margin: '0 auto 14px',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ color: '#FFD700', fontWeight: 800, fontSize: 15, letterSpacing: '0.04em' }}>
                FARMING CGLT
              </span>
              <span style={{ color: '#9ca3af', fontSize: 12 }}>
                {Math.floor(total_xp).toLocaleString('fr-FR')} XP · {Number(total_cglt_earned).toLocaleString('fr-FR')} CGLT gagnés
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tiers.map((t) => {
                const isCurrent = t.name === current_tier.name;
                const reached = Math.floor(total_xp) >= t.xp_min;
                return (
                  <div
                    key={t.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      borderRadius: 12,
                      background: isCurrent ? 'rgba(255,215,0,0.12)' : 'rgba(255,255,255,0.04)',
                      border: isCurrent
                        ? '1px solid rgba(255,215,0,0.45)'
                        : '1px solid rgba(255,255,255,0.06)',
                      opacity: reached || isCurrent ? 1 : 0.6,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 13 }}>{t.label}</div>
                      <div style={{ color: '#9ca3af', fontSize: 11 }}>
                        {t.xp_min.toLocaleString('fr-FR')}
                        {t.xp_max != null ? ` – ${t.xp_max.toLocaleString('fr-FR')}` : '+'} XP
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {t.cglt_reward > 0 ? (
                        <span style={{ color: '#FFD700', fontWeight: 700, fontSize: 13 }}>
                          +{t.cglt_reward.toLocaleString('fr-FR')} CGLT
                        </span>
                      ) : (
                        <span style={{ color: '#6b7280', fontSize: 12 }}>—</span>
                      )}
                      {isCurrent && (
                        <div style={{ color: '#38BDF8', fontSize: 10, fontWeight: 700, marginTop: 2 }}>
                          PALIER ACTUEL
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {recent_rewards.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ color: '#9ca3af', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', marginBottom: 8 }}>
                  RÉCOMPENSES RÉCENTES
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {recent_rewards.map((r, i) => (
                    <div
                      key={`${r.tier}-${r.created_at}-${i}`}
                      style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#d1d5db' }}
                    >
                      <span>{cap(r.tier)}</span>
                      <span style={{ color: r.status === 'completed' ? '#22C55E' : '#f59e0b' }}>
                        +{r.cglt_amount.toLocaleString('fr-FR')} CGLT
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={onClose}
              style={{
                marginTop: 16,
                width: '100%',
                height: 44,
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.06)',
                color: '#e5e7eb',
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Fermer
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
