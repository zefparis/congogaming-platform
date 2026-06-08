import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Gem, Send } from 'lucide-react';
import SwapCGLTModal from './SwapCGLTModal';
import WithdrawCGLTModal from './WithdrawCGLTModal';

interface Props {
  /** Current CGLT balance to display in the sheet header. */
  cgltBalance: number;
  /** Close the sheet (backdrop, X, or after an action completes). */
  onClose: () => void;
  /** Bubble up the new CGLT balance after a swap or withdrawal. */
  onBalanceChange?: (newCgltBalance: number) => void;
}

const fmt = (n: number) => Math.max(0, Math.floor(n)).toLocaleString('fr-FR');

type ActiveModal = 'none' | 'swap' | 'withdraw';

export default function CGLTWalletSheet({ cgltBalance, onClose, onBalanceChange }: Props) {
  const [modal, setModal] = useState<ActiveModal>('none');

  return (
    <>
      <AnimatePresence>
        {modal === 'none' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 55,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(4px)',
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
                background: 'linear-gradient(180deg, #131316, #0b0b0d)',
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                border: '1px solid rgba(255,215,0,0.25)',
                padding: '16px 16px',
                paddingBottom: 'max(env(safe-area-inset-bottom), 18px)',
                color: 'white',
                position: 'relative',
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
              <button
                onClick={onClose}
                aria-label="Fermer"
                style={{
                  position: 'absolute',
                  top: 14,
                  right: 14,
                  background: 'transparent',
                  border: 'none',
                  color: '#9ca3af',
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                <X className="w-5 h-5" />
              </button>

              {/* Balance header */}
              <div style={{ textAlign: 'center', marginBottom: 18 }}>
                <div style={{ fontSize: 12, color: '#9ca3af', letterSpacing: '0.05em' }}>
                  SOLDE CGLT
                </div>
                <div
                  style={{
                    fontSize: 34,
                    fontWeight: 800,
                    color: '#38BDF8',
                    letterSpacing: '-0.5px',
                    marginTop: 2,
                  }}
                >
                  {fmt(cgltBalance)} <span style={{ fontSize: 18, color: '#9ca3af', fontWeight: 600 }}>CGLT 🔷</span>
                </div>
              </div>

              {/* Actions */}
              <button
                onClick={() => setModal('swap')}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 16px',
                  borderRadius: 14,
                  border: '1px solid rgba(255,215,0,0.35)',
                  background: 'rgba(255,215,0,0.08)',
                  color: 'white',
                  cursor: 'pointer',
                  marginBottom: 10,
                  textAlign: 'left',
                }}
              >
                <span
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: 'rgba(255,215,0,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Gem className="w-5 h-5" style={{ color: '#FFD700' }} />
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontWeight: 700, fontSize: 15 }}>Obtenir des CGLT</span>
                  <span style={{ display: 'block', fontSize: 12, color: '#9ca3af' }}>
                    Convertir vos CDF en CGLT
                  </span>
                </span>
              </button>

              <button
                onClick={() => setModal('withdraw')}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 16px',
                  borderRadius: 14,
                  border: '1px solid rgba(56,189,248,0.35)',
                  background: 'rgba(56,189,248,0.08)',
                  color: 'white',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: 'rgba(56,189,248,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Send className="w-5 h-5" style={{ color: '#38BDF8' }} />
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontWeight: 700, fontSize: 15 }}>Envoyer vers UniPay</span>
                  <span style={{ display: 'block', fontSize: 12, color: '#9ca3af' }}>
                    Transférer vos CGLT vers un wallet UniPay
                  </span>
                </span>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {modal === 'swap' && (
        <SwapCGLTModal
          onClose={() => setModal('none')}
          onSuccess={(newBalance) => {
            onBalanceChange?.(newBalance);
          }}
        />
      )}
      {modal === 'withdraw' && (
        <WithdrawCGLTModal
          onClose={() => setModal('none')}
          onSuccess={(newBalance) => {
            onBalanceChange?.(newBalance);
          }}
        />
      )}
    </>
  );
}
