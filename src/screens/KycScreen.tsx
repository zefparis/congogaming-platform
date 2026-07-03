import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import { Check } from 'lucide-react';
import { api } from '../lib/api';
import { clearSession, getSession, refreshKycStatus } from '../lib/auth';
import { useTranslation } from 'react-i18next';
import { SelfieCaptureWidget } from '../components/SelfieCaptureWidget';

// ─── PlayGuard KYC capture flow ─────────────────────────────────────────────
//
// 3 stages:
//   1. selfie   → SelfieCaptureWidget (camera feed → preview → confirm)
//   2. loading  → POST to /api/kyc/scan (PlayGuard via server-side proxy)
//   3. result   → APPROVED / DENIED / VERIFY_AGE branch
//
// DENIED is terminal: the user is logged out and cannot proceed regardless of
// what they tap. VERIFY_AGE allows access but flags the account for manual
// review (the admin dashboard surfaces this).

type Stage = 'selfie' | 'loading' | 'result';

type KycVerdict = 'APPROVED' | 'DENIED' | 'VERIFY_AGE';

interface KycResult {
  verdict: KycVerdict;
  estimated_age: number;
  age_low: number;
  age_high: number;
  is_minor: boolean;
}

export default function KycScreen() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const session = getSession();

  const [stage, setStage] = useState<Stage>('selfie');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<KycResult | null>(null);

  // Hard guard: if no session, kick back to splash. (App.tsx already does this
  // for protected routes, but /kyc is also reachable from the registration
  // flow, so we double-check.)
  useEffect(() => {
    if (!session) nav('/splash', { replace: true });
  }, [session, nav]);

  if (!session) return null;

  async function handleSelfieConfirmed(rawB64: string) {
    if (!session) return;
    setStage('loading');
    setError(null);
    try {
      const res = await api.kycScan(session.id, rawB64);
      setResult({
        verdict: res.verdict,
        estimated_age: res.estimated_age,
        age_low: res.age_low,
        age_high: res.age_high,
        is_minor: res.is_minor,
      });
      // Sync the cached session so /splash and route guards see the new status
      // immediately without an extra round-trip.
      await refreshKycStatus(session.id);
      setStage('result');
    } catch (e: any) {
      setError(e?.message || t('kyc.verify_failed'));
      setStage('selfie');
    }
  }

  // After a successful (APPROVED or VERIFY_AGE) scan, bounce the user to
  // wherever they were trying to go before being intercepted by the KYC
  // gate. We default to home if no intended destination was recorded.
  function consumeKycRedirect(): string {
    try {
      const dest = localStorage.getItem('kyc_redirect');
      if (dest) {
        localStorage.removeItem('kyc_redirect');
        return dest;
      }
    } catch {
      /* storage unavailable */
    }
    return '/';
  }

  function onApprovedContinue() {
    nav(consumeKycRedirect(), { replace: true });
  }

  function onDeniedAcknowledge() {
    try {
      localStorage.removeItem('kyc_redirect');
    } catch {
      /* ignore */
    }
    clearSession();
    nav('/splash', { replace: true });
  }

  function onVerifyAgeContinue() {
    nav(consumeKycRedirect(), { replace: true });
  }

  return (
    <div className="min-h-screen flex flex-col p-6 pt-10">
      <div className="flex items-center gap-3 mb-4">
        <img
          src="/images/okapi.PNG"
          alt="Congo Gaming"
          className="h-10 w-auto object-contain ml-auto"
        />
      </div>
      <h1 className="font-display text-3xl text-gold tracking-wide">
        {t('kyc.title')}
      </h1>
      <p className="text-zinc-400 text-sm mt-1 mb-6">
        {t('kyc.subtitle')}
      </p>

      {stage === 'selfie' && (
        <>
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300 text-center">
              {error}
            </div>
          )}
          <SelfieCaptureWidget onCapture={handleSelfieConfirmed} />
        </>
      )}

      {stage === 'loading' && <LoadingStage />}

      {stage === 'result' && result && (
        <ResultStage
          result={result}
          onApprovedContinue={onApprovedContinue}
          onDeniedAcknowledge={onDeniedAcknowledge}
          onVerifyAgeContinue={onVerifyAgeContinue}
        />
      )}
    </div>
  );
}

// ─── Stage components ───────────────────────────────────────────────────────

function LoadingStage() {
  const { t } = useTranslation();
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6">
      <Loader2 className="text-gold animate-spin" size={64} />
      <div className="text-center">
        <div className="font-display text-2xl text-gold tracking-wider">
          {t('kyc.verifying')}
        </div>
        <div className="mt-2 text-sm text-zinc-400">
          {t('kyc.biometric')}
        </div>
      </div>
    </div>
  );
}

function ResultStage({
  result,
  onApprovedContinue,
  onDeniedAcknowledge,
  onVerifyAgeContinue,
}: {
  result: KycResult;
  onApprovedContinue: () => void;
  onDeniedAcknowledge: () => void;
  onVerifyAgeContinue: () => void;
}) {
  const { t } = useTranslation();
  if (result.verdict === 'APPROVED') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6">
        <div className="rounded-full bg-emerald-500/20 border-4 border-emerald-500 p-6">
          <Check className="text-emerald-400" size={64} strokeWidth={3} />
        </div>
        <div className="text-center">
          <div className="font-display text-3xl text-emerald-400 tracking-wider">
            {t('kyc.approved')}
          </div>
          <div className="mt-2 text-sm text-zinc-400">
            {t('kyc.welcome')}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            {t('kyc.age_estimate', { age: result.estimated_age })}
          </div>
        </div>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onApprovedContinue}
          className="w-full h-14 rounded-2xl bg-gold text-black font-display text-xl tracking-wider"
        >
          {t('kyc.continue')}
        </motion.button>
      </div>
    );
  }

  if (result.verdict === 'DENIED') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6">
        <div className="rounded-full bg-red-500/20 border-4 border-red-500 p-6">
          <X className="text-red-400" size={64} strokeWidth={3} />
        </div>
        <div className="text-center">
          <div className="font-display text-3xl text-red-400 tracking-wider">
            {t('kyc.denied')}
          </div>
          <div className="mt-3 text-sm text-zinc-300 max-w-xs">
            {t('kyc.denied_msg')}
          </div>
          <div className="mt-2 text-xs text-zinc-500">
            {t('kyc.age_range', { low: result.age_low, high: result.age_high })}
          </div>
        </div>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onDeniedAcknowledge}
          className="w-full h-14 rounded-2xl bg-red-500 text-white font-display text-xl tracking-wider"
        >
          {t('kyc.understood')}
        </motion.button>
      </div>
    );
  }

  // VERIFY_AGE
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6">
      <div className="rounded-full bg-amber-500/20 border-4 border-amber-500 p-6">
        <AlertTriangle className="text-amber-400" size={64} strokeWidth={3} />
      </div>
      <div className="text-center">
        <div className="font-display text-2xl text-amber-400 tracking-wider">
          {t('kyc.age_uncertain')}
        </div>
        <div className="mt-3 text-sm text-zinc-300 max-w-xs">
          {t('kyc.age_uncertain_msg')}
        </div>
        <div className="mt-2 text-xs text-zinc-500">
          {t('kyc.age_range', { low: result.age_low, high: result.age_high })}
        </div>
      </div>
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={onVerifyAgeContinue}
        className="w-full h-14 rounded-2xl bg-amber-500 text-black font-display text-xl tracking-wider"
      >
        {t('kyc.continue')}
      </motion.button>
    </div>
  );
}
