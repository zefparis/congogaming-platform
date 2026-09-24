import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, Loader2 } from 'lucide-react';
import { Check } from 'lucide-react';
import { api } from '../lib/api';
import { getSession, refreshKycStatus } from '../lib/auth';
import { useTranslation } from 'react-i18next';
import { SelfieCaptureWidget } from '../components/SelfieCaptureWidget';

// ─── KYC manual-review capture flow ─────────────────────────────────────────
//
// 3 stages:
//   1. selfie   → SelfieCaptureWidget (camera feed → preview → confirm)
//   2. loading  → POST to /api/kyc/scan (stored for manual admin review)
//   3. result   → PENDING (queued for review) / APPROVED (already verified)
//
// The external verification provider has been decommissioned — submissions
// are reviewed by an operator in the admin dashboard. The user may keep using
// the app while the review is pending; a denial blocks the account.

type Stage = 'selfie' | 'loading' | 'result';

type KycVerdict = 'PENDING' | 'APPROVED';

interface KycResult {
  verdict: KycVerdict;
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
      setResult({ verdict: res.verdict });
      // Sync the cached session so /splash and route guards see the new status
      // immediately without an extra round-trip.
      await refreshKycStatus(session.id);
      setStage('result');
    } catch (e: any) {
      setError(e?.message || t('kyc.verify_failed'));
      setStage('selfie');
    }
  }

  // After a submission (PENDING) or an already-verified account (APPROVED),
  // bounce the user to wherever they were trying to go before being
  // intercepted by the KYC gate. We default to home if no intended
  // destination was recorded.
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

  function onContinue() {
    nav(consumeKycRedirect(), { replace: true });
  }

  return (
    <div className="min-h-screen flex flex-col p-6 pt-10">
      <div className="flex items-center gap-3 mb-4">
        <img
          src="/images/okapi.png"
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
        <ResultStage result={result} onContinue={onContinue} />
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
  onContinue,
}: {
  result: KycResult;
  onContinue: () => void;
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
        </div>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onContinue}
          className="w-full h-14 rounded-2xl bg-gold text-black font-display text-xl tracking-wider"
        >
          {t('kyc.continue')}
        </motion.button>
      </div>
    );
  }

  // PENDING — queued for manual review.
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6">
      <div className="rounded-full bg-amber-500/20 border-4 border-amber-500 p-6">
        <Clock className="text-amber-400" size={64} strokeWidth={3} />
      </div>
      <div className="text-center">
        <div className="font-display text-2xl text-amber-400 tracking-wider">
          {t('kyc.pending_title')}
        </div>
        <div className="mt-3 text-sm text-zinc-300 max-w-xs">
          {t('kyc.pending_body')}
        </div>
      </div>
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={onContinue}
        className="w-full h-14 rounded-2xl bg-amber-500 text-black font-display text-xl tracking-wider"
      >
        {t('kyc.continue')}
      </motion.button>
    </div>
  );
}
