import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowDown, Loader2, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';

interface Props {
  /** Close the modal (backdrop click, X button, or after success). */
  onClose: () => void;
  /** Called after a successful swap with the new CGLT balance. */
  onSuccess?: (newCgltBalance: number) => void;
  /**
   * CDF -> CGLT conversion rate. 1:1 for now; passed as a prop so a future
   * CDF/USD oracle can drive it without touching this component.
   */
  rate?: number;
}

const fmt = (n: number) => Math.max(0, Math.floor(n)).toLocaleString('fr-FR');

export default function SwapCGLTModal({ onClose, onSuccess, rate = 1 }: Props) {
  const [cdfBalance, setCdfBalance] = useState<number | null>(null);
  const [amount, setAmount] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    api
      .walletBalance()
      .then((r) => setCdfBalance(Number(r.balance) || 0))
      .catch(() => setCdfBalance(0));
  }, []);

  const amountNum = useMemo(() => Math.trunc(Number(amount)) || 0, [amount]);
  const cgltReceived = Math.floor(amountNum * rate);

  const insufficient = cdfBalance !== null && amountNum > cdfBalance;
  const canSubmit = amountNum > 0 && !insufficient && !submitting;

  const setMax = () => {
    if (cdfBalance !== null) setAmount(String(cdfBalance));
  };

  const handleSwap = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.cgltSwap(amountNum);
      setToast(`✅ ${fmt(res.amount_cglt)} CGLT ajoutés à votre compte`);
      onSuccess?.(Number(res.new_cglt_balance) || 0);
      // Leave the toast visible briefly, then close.
      window.setTimeout(() => onClose(), 1400);
    } catch (e: unknown) {
      const code = (e as { code?: string; message?: string })?.code ?? '';
      const msg = (e as { message?: string })?.message ?? '';
      if (code === 'insufficient_cdf' || /insufficient/i.test(msg)) {
        setError('Solde CDF insuffisant.');
      } else if (code === 'phone_not_found') {
        setError('Aucun numéro UniPay lié à ce compte.');
      } else {
        setError('La conversion a échoué. Réessayez.');
      }
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 60,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(6px)',
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 420,
            background: 'linear-gradient(180deg, #131316, #0b0b0d)',
            border: '1px solid rgba(255,215,0,0.3)',
            borderRadius: 18,
            boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            padding: 20,
            color: 'white',
            position: 'relative',
          }}
        >
          <button
            onClick={onClose}
            aria-label="Fermer"
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              background: 'transparent',
              border: 'none',
              color: '#9ca3af',
              cursor: 'pointer',
              padding: 4,
            }}
          >
            <X className="w-5 h-5" />
          </button>

          <h2
            style={{
              fontFamily: 'Bebas Neue',
              fontSize: 24,
              letterSpacing: '0.04em',
              color: '#FFD700',
              margin: 0,
            }}
          >
            Convertir CDF → CGLT 🔷
          </h2>
          <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
            Taux : 1 CDF = {rate} CGLT
          </p>

          {/* CDF balance */}
          <div
            style={{
              marginTop: 16,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 13,
            }}
          >
            <span style={{ color: '#9ca3af' }}>Solde CDF disponible</span>
            <span style={{ color: '#FFD700', fontWeight: 700 }}>
              {cdfBalance === null ? '…' : `${fmt(cdfBalance)} CDF`}
            </span>
          </div>

          {/* Amount input */}
          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 12, color: '#9ca3af' }}>Montant à convertir (CDF)</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="0"
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 10,
                  border: `1px solid ${insufficient ? '#ef4444' : '#333'}`,
                  background: '#1a1a1a',
                  color: 'white',
                  fontSize: 16,
                  fontWeight: 700,
                  padding: '0 12px',
                  outline: 'none',
                }}
              />
              <button
                onClick={setMax}
                type="button"
                style={{
                  height: 44,
                  padding: '0 14px',
                  borderRadius: 10,
                  border: '1px solid #333',
                  background: '#1a1a1a',
                  color: '#FFD700',
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                MAX
              </button>
            </div>
          </div>

          {/* Arrow + result */}
          <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0' }}>
            <ArrowDown className="w-5 h-5" style={{ color: '#38BDF8' }} />
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderRadius: 10,
              border: '1px solid rgba(56,189,248,0.3)',
              background: 'rgba(56,189,248,0.08)',
              padding: '12px 14px',
            }}
          >
            <span style={{ fontSize: 13, color: '#9ca3af' }}>Vous recevez</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#38BDF8' }}>
              {fmt(cgltReceived)} CGLT 🔷
            </span>
          </div>

          {insufficient && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#f87171' }}>
              Montant supérieur à votre solde CDF.
            </div>
          )}
          {error && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#f87171' }}>{error}</div>
          )}

          <button
            onClick={handleSwap}
            disabled={!canSubmit}
            style={{
              marginTop: 16,
              width: '100%',
              height: 48,
              borderRadius: 12,
              border: 'none',
              fontWeight: 800,
              fontSize: 15,
              letterSpacing: '0.04em',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              opacity: canSubmit ? 1 : 0.5,
              background: 'linear-gradient(90deg, #FFD700, #38BDF8)',
              color: '#0b0b0d',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            {submitting ? 'Conversion…' : 'Convertir'}
          </button>

          <AnimatePresence>
            {toast && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={{
                  marginTop: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  borderRadius: 10,
                  background: 'rgba(34,197,94,0.15)',
                  border: '1px solid rgba(34,197,94,0.4)',
                  color: '#22C55E',
                  fontSize: 13,
                  fontWeight: 700,
                  padding: '10px 12px',
                }}
              >
                <CheckCircle2 className="w-4 h-4" />
                {toast}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
