import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pickaxe, ChevronDown, ChevronUp, X } from 'lucide-react';
import { api, type FarmingStatus } from '../lib/api';

const TIER_ORDER = ['debutant', 'bronze', 'argent', 'or', 'diamant'];

function tierIndex(name?: string): number {
  return name ? TIER_ORDER.indexOf(name) : -1;
}

/** Lightweight confetti burst rendered with framer-motion (no extra deps). */
function Confetti() {
  const colors = ['#FFD700', '#38BDF8', '#22C55E', '#F472B6', '#F59E0B', '#A855F7'];
  const pieces = Array.from({ length: 28 }, (_, i) => i);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 5 }}>
      {pieces.map((i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.25;
        const duration = 1.1 + Math.random() * 0.9;
        const size = 6 + Math.random() * 6;
        const rotate = Math.random() * 360;
        return (
          <motion.span
            key={i}
            initial={{ y: -20, opacity: 1, rotate: 0 }}
            animate={{ y: 220, opacity: 0, rotate }}
            transition={{ duration, delay, ease: 'easeIn' }}
            style={{
              position: 'absolute',
              top: 0,
              left: `${left}%`,
              width: size,
              height: size * 1.4,
              background: colors[i % colors.length],
              borderRadius: 1,
            }}
          />
        );
      })}
    </div>
  );
}

interface Props {
  /** Distance from the bottom of the viewport (px) — clears the BottomNav. */
  bottomOffset?: number;
}

export default function FarmingWidget({ bottomOffset = 12 }: Props) {
  const [status, setStatus] = useState<FarmingStatus | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [celebration, setCelebration] = useState<{ label: string; reward: number } | null>(null);
  const prevTierRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await api.farmingStatus();
      // Detect a tier-up between polls and celebrate once.
      const newIdx = tierIndex(s.current_tier?.name);
      if (prevTierRef.current !== null && newIdx > prevTierRef.current && s.current_tier.cglt_reward > 0) {
        setCelebration({ label: s.current_tier.label, reward: s.current_tier.cglt_reward });
        setCollapsed(false);
        setHidden(false);
        window.setTimeout(() => setCelebration(null), 6000);
      }
      prevTierRef.current = newIdx;
      setStatus(s);
    } catch {
      /* keep last known value; widget is best-effort */
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

  return (
    <div
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: bottomOffset,
        zIndex: 40,
        maxWidth: 480,
        margin: '0 auto',
      }}
    >
      <AnimatePresence>
        {celebration && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10 }}
            style={{
              position: 'relative',
              marginBottom: 8,
              background: 'linear-gradient(135deg, #16a34a, #0ea5e9)',
              borderRadius: 14,
              padding: '12px 14px',
              color: 'white',
              fontWeight: 700,
              textAlign: 'center',
              boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
              overflow: 'hidden',
            }}
          >
            <Confetti />
            <div style={{ position: 'relative', zIndex: 6, fontSize: 14 }}>
              🎉 {celebration.label} débloqué !
            </div>
            <div style={{ position: 'relative', zIndex: 6, fontSize: 12, opacity: 0.95, marginTop: 2 }}>
              {celebration.reward.toLocaleString('fr-FR')} CGLT envoyés dans UniPay 🔷
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          background: 'rgba(15,15,18,0.96)',
          border: '1px solid rgba(255,215,0,0.25)',
          borderRadius: 14,
          boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
          backdropFilter: 'blur(6px)',
          padding: collapsed ? '8px 12px' : '12px 14px',
        }}
      >
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Pickaxe className="w-4 h-4" style={{ color: '#FFD700', flexShrink: 0 }} />
          <span style={{ color: '#FFD700', fontWeight: 800, fontSize: 12, letterSpacing: '0.04em' }}>
            FARMING CGLT
          </span>
          <span style={{ color: '#e5e7eb', fontSize: 12, marginLeft: 4 }}>{current_tier.label}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
            <button
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? 'Déplier' : 'Replier'}
              style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 2 }}
            >
              {collapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setHidden(true)}
              aria-label="Masquer"
              style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 2 }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!collapsed && (
          <>
            {/* Progress bar */}
            <div
              style={{
                marginTop: 8,
                height: 10,
                borderRadius: 6,
                background: 'rgba(255,255,255,0.08)',
                overflow: 'hidden',
              }}
            >
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress_percent}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                style={{
                  height: '100%',
                  background: 'linear-gradient(90deg, #FFD700, #38BDF8)',
                  borderRadius: 6,
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11 }}>
              <span style={{ color: '#9ca3af' }}>
                {Math.floor(total_xp).toLocaleString('fr-FR')}
                {next_tier ? ` / ${next_tier.xp_needed + Math.floor(total_xp)} XP` : ' XP'}
              </span>
              {next_tier ? (
                <span style={{ color: '#38BDF8' }}>
                  Encore {next_tier.xp_needed.toLocaleString('fr-FR')} XP → {next_tier.label}
                </span>
              ) : (
                <span style={{ color: '#22C55E' }}>Palier maximum atteint 💎</span>
              )}
            </div>

            {next_tier && next_tier.cglt_reward > 0 && (
              <div style={{ marginTop: 6, fontSize: 12, color: '#e5e7eb' }}>
                Tu farmeras{' '}
                <span style={{ color: '#FFD700', fontWeight: 700 }}>
                  {next_tier.cglt_reward.toLocaleString('fr-FR')} CGLT 🔷
                </span>{' '}
                au prochain palier
              </div>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}
