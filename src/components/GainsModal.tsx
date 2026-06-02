// Bottom-sheet modal that displays the prize table for either the daily
// LOTO CONGO or the LOTO EXPRESS (Flash) game. Pure presentation — no
// data fetching, no game logic. Tables are static so we don't need an
// effect or props beyond `type`.
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

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

function getLotoConfig(t: TFunction): Config {
  return {
    header: t('gains_modal.loto_header'),
    subtitle: t('gains_modal.loto_subtitle'),
    rows: [
      { label: t('gains_modal.row_2_nums'), emoji: '🎯', value: '1 000 CDF',   color: '#888888' },
      { label: t('gains_modal.row_3_nums'), emoji: '🎯', value: '5 000 CDF',   color: '#FFFFFF' },
      { label: t('gains_modal.row_4_nums'), emoji: '🎯', value: '50 000 CDF',  color: '#00C875' },
      { label: t('gains_modal.row_5_nums'), emoji: '🎯', value: '500 000 CDF', color: '#4a9eff' },
      { label: t('gains_modal.row_6_nums'), emoji: '🏆', value: 'JACKPOT',     color: '#FFD700', jackpot: true },
    ],
    footer: [
      t('gains_modal.loto_footer_1'),
      t('gains_modal.loto_footer_2'),
    ],
  };
}

function getFlashConfig(t: TFunction): Config {
  return {
    header: t('gains_modal.flash_header'),
    subtitle: t('gains_modal.flash_subtitle'),
    rows: [
      { label: t('gains_modal.row_2_nums'), emoji: '🎯', value: '1 000 CDF',  color: '#888888' },
      { label: t('gains_modal.row_3_nums'), emoji: '🎯', value: '5 000 CDF',  color: '#FFFFFF' },
      { label: t('gains_modal.row_4_nums'), emoji: '🎯', value: '50 000 CDF', color: '#00C875' },
      { label: t('gains_modal.row_5_nums'), emoji: '🏆', value: 'JACKPOT',    color: '#FFD700', jackpot: true },
    ],
    footer: [
      t('gains_modal.flash_footer_1'),
      t('gains_modal.flash_footer_2'),
    ],
  };
}

export default function GainsModal({ open, onClose, type }: GainsModalProps) {
  const { t } = useTranslation();
  const cfg = type === 'loto' ? getLotoConfig(t) : getFlashConfig(t);

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
              aria-label={t('gains_modal.close')}
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
