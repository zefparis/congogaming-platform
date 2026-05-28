// Bottom-sheet modal that displays the prize table for either the daily
// LOTO CONGO or the LOTO EXPRESS (Flash) game. Pure presentation — no
// data fetching, no game logic. Tables are static so we don't need an
// effect or props beyond `type`.
import { motion, AnimatePresence } from 'framer-motion';

type GainsModalProps = {
  open: boolean;
  onClose: () => void;
  type: 'loto' | 'flash';
};

type Row = {
  label: string;
  emoji: string;
  value: string;
  /** Color for the right-hand value column. */
  color: string;
  jackpot?: boolean;
};

type Config = {
  header: string;
  subtitle: string;
  rows: Row[];
  footer: string[];
};

const LOTO: Config = {
  header: '🎱 LOTO CONGO — Gains',
  subtitle: 'Choisissez 6 numéros parmi 49 — Ticket 2 000 CDF',
  rows: [
    { label: '2 bons numéros', emoji: '🎯', value: '1 000 CDF',   color: '#888888' },
    { label: '3 bons numéros', emoji: '🎯', value: '5 000 CDF',   color: '#FFFFFF' },
    { label: '4 bons numéros', emoji: '🎯', value: '50 000 CDF',  color: '#00C875' },
    { label: '5 bons numéros', emoji: '🎯', value: '500 000 CDF', color: '#4a9eff' },
    { label: '6 bons numéros', emoji: '🏆', value: 'JACKPOT',     color: '#FFD700', jackpot: true },
  ],
  footer: [
    'Jackpot minimum garanti : 5 000 000 CDF',
    'Tirage quotidien à 20h00 heure de Kinshasa',
  ],
};

const FLASH: Config = {
  header: '⚡ LOTO EXPRESS — Gains',
  subtitle: 'Choisissez 5 numéros parmi 20 — Ticket 1 000 CDF',
  rows: [
    { label: '2 bons numéros', emoji: '🎯', value: '1 000 CDF',  color: '#888888' },
    { label: '3 bons numéros', emoji: '🎯', value: '5 000 CDF',  color: '#FFFFFF' },
    { label: '4 bons numéros', emoji: '🎯', value: '50 000 CDF', color: '#00C875' },
    { label: '5 bons numéros', emoji: '🏆', value: 'JACKPOT',    color: '#FFD700', jackpot: true },
  ],
  footer: [
    'Jackpot minimum garanti : 250 000 CDF',
    'Tirage automatique toutes les 30 minutes',
  ],
};

export default function GainsModal({ open, onClose, type }: GainsModalProps) {
  const cfg = type === 'loto' ? LOTO : FLASH;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay */}
          <motion.div
            key="gains-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.7)',
              zIndex: 100,
            }}
          />

          {/* Bottom sheet */}
          <motion.div
            key="gains-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={cfg.header}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 101,
              background: '#0D0D18',
              borderRadius: '20px 20px 0 0',
              borderTop: '1px solid rgba(255,215,0,0.3)',
              padding: '20px 16px 40px',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            {/* Drag handle */}
            <div
              aria-hidden
              style={{
                width: 40,
                height: 4,
                background: 'rgba(255,255,255,0.2)',
                borderRadius: 2,
                margin: '0 auto 20px',
              }}
            />

            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              style={{
                position: 'absolute',
                top: 14,
                right: 14,
                background: 'transparent',
                border: 'none',
                color: '#FFD700',
                fontSize: 20,
                cursor: 'pointer',
                lineHeight: 1,
              }}
            >
              ✕
            </button>

            {/* Header */}
            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: '#FFD700',
                marginBottom: 4,
              }}
            >
              {cfg.header}
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'rgba(255,255,255,0.55)',
                marginBottom: 16,
              }}
            >
              {cfg.subtitle}
            </div>

            {/* Prize table */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {cfg.rows.map((r, i) => (
                <div
                  key={r.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 12px',
                    borderRadius: 8,
                    background: r.jackpot
                      ? 'rgba(255,215,0,0.08)'
                      : i % 2 === 0
                      ? '#0D0D18'
                      : '#111120',
                    border: r.jackpot
                      ? '1px solid rgba(255,215,0,0.55)'
                      : '1px solid transparent',
                  }}
                >
                  <span
                    style={{
                      color: '#FFFFFF',
                      fontSize: r.jackpot ? 15 : 13,
                      fontWeight: r.jackpot ? 700 : 500,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: 16 }}>{r.emoji}</span>
                    {r.label}
                  </span>
                  <span
                    style={{
                      color: r.color,
                      fontSize: r.jackpot ? 16 : 13,
                      fontWeight: r.jackpot ? 800 : 700,
                      letterSpacing: r.jackpot ? 1 : 0,
                    }}
                  >
                    {r.jackpot ? `🏆 ${r.value}` : r.value}
                  </span>
                </div>
              ))}
            </div>

            {/* Footer notes */}
            <div
              style={{
                marginTop: 16,
                fontSize: 11,
                color: 'rgba(255,255,255,0.5)',
                lineHeight: 1.6,
                textAlign: 'center',
              }}
            >
              {cfg.footer.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
