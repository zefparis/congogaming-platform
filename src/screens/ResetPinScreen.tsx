import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Lock, Headphones } from 'lucide-react';
import NumPad from '../components/NumPad';
import { SelfieCaptureWidget } from '../components/SelfieCaptureWidget';
import { AuthApiError, resetPinByPhone } from '../lib/auth';

// WhatsApp support link — built from VITE_SUPPORT_PHONE (set in Vercel env vars).
// Digits-only: the env var may be stored with or without the leading +.
// If unset, supportHref is null and the link is replaced with plain text.
const rawSupportPhone = import.meta.env.VITE_SUPPORT_PHONE;
const supportHref = rawSupportPhone
  ? `https://wa.me/${rawSupportPhone.replace(/\D/g, '')}`
  : null;

// ─── ResetPinScreen ──────────────────────────────────────────────────────────
//
// Unauthenticated flow — the user has no valid session by definition.
// Steps:
//   1. selfie   → SelfieCaptureWidget (camera → preview → confirm)
//   2. pin      → enter new 6-digit PIN
//   3. confirm  → re-enter to confirm, then POST { phone, selfie_b64, newPin }
//   4. done     → success
//
// PlayGuard error mapping:
//   NOT_ENROLLED         → redirect to support contact (show message + button)
//   FACE_MISMATCH        → retry selfie with lighting tip
//   VERIFICATION_UNAVAILABLE → retry later

type Step = 'selfie' | 'pin' | 'confirm' | 'done';

type SelfieError =
  | { kind: 'NOT_ENROLLED' }
  | { kind: 'FACE_MISMATCH'; message: string }
  | { kind: 'VERIFICATION_UNAVAILABLE'; message: string }
  | { kind: 'generic'; message: string };

export default function ResetPinScreen() {
  const nav = useNavigate();
  const { t } = useTranslation();
  const location = useLocation();
  const phone = (location.state as { phone?: string } | null)?.phone || '';

  const [step, setStep] = useState<Step>('selfie');
  const [selfieB64, setSelfieB64] = useState<string | null>(null);
  const [selfieError, setSelfieError] = useState<SelfieError | null>(null);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinErr, setPinErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!phone) nav('/login', { replace: true });
  }, [phone, nav]);

  // ── Selfie step ─────────────────────────────────────────────────────────
  function handleSelfieConfirmed(rawB64: string) {
    setSelfieB64(rawB64);
    setSelfieError(null);
    setStep('pin');
  }

  // ── PIN steps ────────────────────────────────────────────────────────────
  const activePin = step === 'pin' ? newPin : confirmPin;
  const setActivePin = step === 'pin' ? setNewPin : setConfirmPin;

  const onDigit = (d: string) => {
    setPinErr(null);
    setActivePin((prev) => (prev.length < 6 ? prev + d : prev));
  };
  const onDelete = () => {
    setPinErr(null);
    setActivePin((prev) => prev.slice(0, -1));
  };

  const goConfirm = () => {
    if (newPin.length !== 6) return;
    setStep('confirm');
    setPinErr(null);
  };

  const submit = async () => {
    if (loading || !selfieB64) return;
    if (confirmPin.length !== 6) return;
    if (newPin !== confirmPin) {
      setPinErr(t('reset_pin.error_mismatch'));
      setConfirmPin('');
      return;
    }
    try {
      setLoading(true);
      await resetPinByPhone(phone, selfieB64, newPin);
      setStep('done');
    } catch (e) {
      if (e instanceof AuthApiError) {
        if (e.code === 'NOT_ENROLLED') {
          setSelfieError({ kind: 'NOT_ENROLLED' });
          setStep('selfie');
          setSelfieB64(null);
        } else if (e.code === 'FACE_MISMATCH') {
          setSelfieError({ kind: 'FACE_MISMATCH', message: t('reset_pin.error_face_mismatch') });
          setStep('selfie');
          setSelfieB64(null);
        } else if (e.code === 'VERIFICATION_UNAVAILABLE') {
          setSelfieError({ kind: 'VERIFICATION_UNAVAILABLE', message: t('reset_pin.error_unavailable') });
          setStep('selfie');
          setSelfieB64(null);
        } else if (e.code === 'INVALID_PIN_FORMAT') {
          setPinErr(t('reset_pin.error_invalid'));
          setStep('pin');
        } else {
          setSelfieError({ kind: 'generic', message: e.message || t('reset_pin.error_network') });
          setStep('selfie');
          setSelfieB64(null);
        }
      } else {
        setSelfieError({ kind: 'generic', message: t('reset_pin.error_network') });
        setStep('selfie');
        setSelfieB64(null);
      }
      setConfirmPin('');
      setNewPin('');
    } finally {
      setLoading(false);
    }
  };

  // ── Done ─────────────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div className="min-h-screen flex flex-col p-6 pt-16 items-center text-center">
        <div className="text-5xl mb-4">✅</div>
        <div className="font-display text-3xl text-gold mb-3">{t('reset_pin.done_title')}</div>
        <div className="text-zinc-300 text-base mb-10">{t('reset_pin.done_body')}</div>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => nav('/login', { replace: true })}
          className="w-full max-w-sm h-14 rounded-2xl bg-gold text-black font-display text-2xl tracking-wider"
        >
          {t('reset_pin.login')}
        </motion.button>
      </div>
    );
  }

  // ── Selfie step ──────────────────────────────────────────────────────────
  if (step === 'selfie') {
    return (
      <div className="min-h-screen flex flex-col p-6 pt-10">
        <div className="flex items-center gap-3 mb-4">
          <img src="/images/okapi.PNG" alt="Congo Gaming" className="h-10 w-auto object-contain" />
          <div className="text-zinc-500 text-xs uppercase tracking-widest">{t('reset_pin.page_label')}</div>
        </div>

        <div className="bg-amber-900/30 border border-amber-700/40 rounded-2xl p-4 mb-5">
          <div className="text-amber-200 font-display text-lg mb-1">{t('reset_pin.selfie_title')}</div>
          <div className="text-amber-100/80 text-sm">{t('reset_pin.selfie_body')}</div>
        </div>

        {selfieError?.kind === 'NOT_ENROLLED' && (
          <div className="mb-4 rounded-2xl border border-orange-500/40 bg-orange-500/10 p-4">
            <div className="text-orange-300 font-display text-base mb-2">{t('reset_pin.error_not_enrolled_title')}</div>
            <div className="text-orange-200/80 text-sm mb-3">{t('reset_pin.error_not_enrolled')}</div>
            {supportHref ? (
              <a
                href={supportHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-orange-300 underline"
              >
                <Headphones size={15} />
                {t('reset_pin.contact_support')}
              </a>
            ) : (
              <span className="inline-flex items-center gap-2 text-sm text-orange-300/60">
                <Headphones size={15} />
                {t('reset_pin.contact_support')}
              </span>
            )}
          </div>
        )}

        {selfieError && selfieError.kind !== 'NOT_ENROLLED' && (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
            {selfieError.message}
          </div>
        )}

        <SelfieCaptureWidget onCapture={handleSelfieConfirmed} />
      </div>
    );
  }

  // ── PIN / Confirm steps ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col p-6 pt-10">
      <div className="flex items-center gap-3 mb-4">
        <img src="/images/okapi.PNG" alt="Congo Gaming" className="h-10 w-auto object-contain" />
        <div className="text-zinc-500 text-xs uppercase tracking-widest">{t('reset_pin.page_label')}</div>
      </div>

      <div className="bg-amber-900/30 border border-amber-700/40 rounded-2xl p-4 mb-5">
        <div className="text-amber-200 font-display text-lg mb-1">
          {step === 'pin' ? t('reset_pin.create_title') : t('reset_pin.confirm_title')}
        </div>
        <div className="text-amber-100/80 text-sm whitespace-pre-line">
          {step === 'pin' ? t('reset_pin.create_body') : t('reset_pin.warning_confirm')}
        </div>
      </div>

      <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 flex items-center gap-3">
        <Lock className="w-6 h-6 text-gold" />
        <div className="flex-1">
          <div className="text-xs text-zinc-500">
            {step === 'pin' ? t('reset_pin.field_new') : t('reset_pin.field_confirm')}
          </div>
          <div className="flex gap-2 mt-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={`w-9 h-9 rounded-xl border-2 flex items-center justify-center font-display text-2xl ${
                  activePin.length > i
                    ? 'bg-gold border-gold text-black'
                    : 'border-zinc-700 text-zinc-700'
                }`}
              >
                {activePin.length > i ? '•' : ''}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hidden numeric input for native mobile keyboards */}
      <input
        type="tel"
        inputMode="numeric"
        pattern="\d*"
        maxLength={6}
        value={activePin}
        onChange={(e) => setActivePin(e.target.value.replace(/\D/g, '').slice(0, 6))}
        className="sr-only"
        aria-hidden="true"
      />

      {pinErr && <div className="mt-3 text-red-400 text-sm">{pinErr}</div>}
      {loading && <div className="mt-3 text-gold text-sm">{t('reset_pin.updating')}</div>}

      <div className="mt-5">
        <NumPad onDigit={onDigit} onDelete={onDelete} />
      </div>

      {step === 'pin' && newPin.length === 6 && (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={goConfirm}
          className="w-full mt-6 py-5 bg-gold text-black font-black text-xl rounded-2xl tracking-widest"
        >
          {t('common.continue')}
        </motion.button>
      )}

      {step === 'confirm' && confirmPin.length === 6 && (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={submit}
          disabled={loading}
          className="w-full mt-6 py-5 bg-gold text-black font-black text-xl rounded-2xl tracking-widest disabled:opacity-60"
        >
          {t('reset_pin.confirm_btn')}
        </motion.button>
      )}

      {step === 'confirm' && (
        <button
          onClick={() => {
            setStep('pin');
            setConfirmPin('');
            setPinErr(null);
          }}
          className="mt-4 text-zinc-400 text-sm"
        >
          {t('reset_pin.restart')}
        </button>
      )}

      <button
        onClick={() => {
          setStep('selfie');
          setSelfieB64(null);
          setSelfieError(null);
          setNewPin('');
          setConfirmPin('');
        }}
        className="mt-3 text-zinc-500 text-xs"
      >
        ← {t('reset_pin.retake_selfie')}
      </button>
    </div>
  );
}
