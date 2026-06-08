import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, CheckCircle2, ExternalLink } from 'lucide-react';
import { api } from '../lib/api';
import { getSession } from '../lib/auth';

interface Props {
  onClose: () => void;
  onSuccess?: (newCgltBalance: number) => void;
}

const fmt = (n: number) => Math.max(0, Math.floor(n)).toLocaleString('fr-FR');

function normalizePhone(input: string): string {
  const digits = input.replace(/[^\d]/g, '');
  let local: string;
  if (digits.startsWith('243')) local = digits.slice(3);
  else if (digits.startsWith('0')) local = digits.slice(1);
  else local = digits;
  if (local.length !== 9) return input;
  return `+243 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

export default function WithdrawCGLTModal({ onClose, onSuccess }: Props) {
  const session = getSession();
  const ownPhone = session?.phone ?? '';
  const ownE164 = normalizePhone(ownPhone);

  const [amount, setAmount] = useState<string>('');
  const [phone, setPhone] = useState<string>(ownE164);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const amountNum = useMemo(() => Math.trunc(Number(amount)) || 0, [amount]);

  // Pull CGLT balance so the user knows what's available
  const [cgltAvailable, setCgltAvailable] = useState<number | null>(null);
  useEffect(() => {
    api.cgltBalance()
      .then((r) => setCgltAvailable(Number(r.cglt_balance) || 0))
      .catch(() => setCgltAvailable(null));
  }, []);

  const setMax = () => {
    if (cgltAvailable != null) setAmount(String(Math.floor(cgltAvailable)));
  };

  const insufficient = cgltAvailable != null && amountNum > cgltAvailable;
  const phoneOk = phone.replace(/\D/g, '').length >= 9;
  const canSubmit = amountNum >= 10 && !insufficient && phoneOk && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.cgltWithdraw(amountNum, phone);
      setToast(`✅ ${fmt(res.amount_cglt)} CGLT envoyés vers votre wallet UniPay`);
      onSuccess?.(Number(res.new_cglt_balance) || 0);
      window.setTimeout(() => onClose(), 1800);
    } catch (e: unknown) {
      const code = (e as { code?: string; status?: number })?.code ?? '';
      if (code === 'UNIPAY_WALLET_NOT_FOUND') {
        setError(
          'Aucun compte UniPay trouvé pour ce numéro. Créez votre wallet sur app.unipaycongo.com',
        );
      } else if (code === 'insufficient_cglt') {
        setError('Solde CGLT insuffisant.');
      } else if (code === 'rate_limited') {
        setError('Limite atteinte : max 3 retraits/heure. Réessayez dans 1 h.');
      } else if (code === 'amount_too_small') {
        setError('Montant minimum : 10 CGLT.');
      } else if (code === 'invalid_phone') {
        setError('Numéro de téléphone invalide.');
      } else {
        setError('L\'envoi a échoué. Réessayez.');
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
            Envoyer vers UniPay Congo ↗
          </h2>
          <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
            Transférez vos CGLT vers n'importe quel wallet UniPay
          </p>

          {/* CGLT balance */}
          <div
            style={{
              marginTop: 16,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 13,
            }}
          >
            <span style={{ color: '#9ca3af' }}>Solde CGLT disponible</span>
            <span style={{ color: '#38BDF8', fontWeight: 700 }}>
              {cgltAvailable === null ? '…' : `${fmt(cgltAvailable)} CGLT`}
            </span>
          </div>

          {/* Amount input */}
          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 12, color: '#9ca3af' }}>Montant à envoyer (CGLT)</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input
                type="number"
                inputMode="numeric"
                min={10}
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

          {/* Phone input */}
          <div style={{ marginTop: 14 }}>
            <label style={{ fontSize: 12, color: '#9ca3af' }}>Numéro de réception UniPay (+243…)</label>
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+243 800 000 000"
              style={{
                marginTop: 6,
                width: '100%',
                height: 44,
                borderRadius: 10,
                border: `1px solid ${phoneOk ? '#333' : '#ef4444'}`,
                background: '#1a1a1a',
                color: 'white',
                fontSize: 16,
                fontWeight: 700,
                padding: '0 12px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {!phoneOk && phone.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 11, color: '#f87171' }}>
                Numéro invalide (format +243 800 000 000 attendu)
              </div>
            )}
          </div>

          {/* UniPay registration link */}
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <a
              href="https://app.unipaycongo.com/register"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 12, color: '#38BDF8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}
              onClick={(e) => e.stopPropagation()}
            >
              Pas de compte UniPay ? Créer mon wallet gratuit <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {insufficient && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#f87171' }}>
              Montant supérieur à votre solde CGLT.
            </div>
          )}
          {error && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#f87171' }}>{error}</div>
          )}

          <button
            onClick={handleSubmit}
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
            {submitting ? 'Envoi…' : 'Envoyer'}
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
