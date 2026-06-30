import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Camera, RotateCcw, Check, X, AlertTriangle, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { clearSession, getSession, refreshKycStatus } from '../lib/auth';

// ─── PlayGuard KYC capture flow ─────────────────────────────────────────────
//
// 4 stages:
//   1. capture  → live camera feed + "Prendre la photo" button
//   2. preview  → still image + "Confirmer" / "Reprendre"
//   3. loading  → POST to /api/kyc/scan (PlayGuard via server-side proxy)
//   4. result   → APPROVED / DENIED / VERIFY_AGE branch
//
// DENIED is terminal: the user is logged out and cannot proceed regardless of
// what they tap. VERIFY_AGE allows access but flags the account for manual
// review (the admin dashboard surfaces this).

type Stage = 'capture' | 'preview' | 'loading' | 'result';

type KycVerdict = 'APPROVED' | 'DENIED' | 'VERIFY_AGE';

interface KycResult {
  verdict: KycVerdict;
  estimated_age: number;
  age_low: number;
  age_high: number;
  is_minor: boolean;
}

export default function KycScreen() {
  const nav = useNavigate();
  const session = getSession();

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [stage, setStage] = useState<Stage>('capture');
  const [photoB64, setPhotoB64] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<KycResult | null>(null);

  // ── Camera lifecycle ─────────────────────────────────────────────────────
  useEffect(() => {
    if (stage !== 'capture') return;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: 720, height: 720 },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (e: any) {
        setError(
          e?.name === 'NotAllowedError'
            ? 'Accès à la caméra refusé. Autorisez la caméra dans les paramètres du navigateur.'
            : 'Impossible d\'accéder à la caméra.',
        );
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [stage]);

  // Hard guard: if no session, kick back to splash. (App.tsx already does this
  // for protected routes, but /kyc is also reachable from the registration
  // flow, so we double-check.)
  useEffect(() => {
    if (!session) nav('/splash', { replace: true });
  }, [session, nav]);

  if (!session) return null;

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    // Square crop centered on the video frame so the result matches the
    // circular preview the operator sees.
    const size = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - size) / 2;
    const sy = (video.videoHeight - size) / 2;
    canvas.width = 720;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, sx, sy, size, size, 0, 0, 720, 720);
    const b64 = canvas.toDataURL('image/jpeg', 0.9);
    setPhotoB64(b64);
    setStage('preview');
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function retake() {
    setPhotoB64(null);
    setError(null);
    setStage('capture');
  }

  async function confirm() {
    if (!photoB64 || !session) return;
    setStage('loading');
    setError(null);
    try {
      // Strip the "data:image/...;base64," prefix — the server expects raw base64
      const rawB64 = photoB64.includes(',') ? photoB64.split(',')[1]! : photoB64;
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
      setError(e?.message || 'La vérification a échoué. Réessayez.');
      setStage('preview');
    }
  }

  // After a successful (APPROVED or VERIFY_AGE) scan, bounce the user to
  // wherever they were trying to go before being intercepted by the KYC
  // gate — typically /jouer (PredictStreet). We default to home if no
  // intended destination was recorded.
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
        Vérification requise pour PredictStreet
      </h1>
      <p className="text-zinc-400 text-sm mt-1 mb-6">
        Les paris sportifs FIFA 2026 nécessitent une vérification d'identité.
      </p>

      {stage === 'capture' && (
        <CaptureStage
          videoRef={videoRef}
          onCapture={capture}
          error={error}
        />
      )}

      {stage === 'preview' && photoB64 && (
        <PreviewStage
          photoB64={photoB64}
          onRetake={retake}
          onConfirm={confirm}
          error={error}
        />
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

function CaptureStage({
  videoRef,
  onCapture,
  error,
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
  onCapture: () => void;
  error: string | null;
}) {
  return (
    <>
      <p className="text-center text-white text-base mb-4">
        Regardez droit devant
      </p>
      <div className="flex justify-center mb-6">
        <div
          className="relative rounded-full overflow-hidden border-4 border-gold"
          style={{ width: 280, height: 280, background: '#111' }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />
        </div>
      </div>
      {error && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300 text-center">
          {error}
        </div>
      )}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={onCapture}
        disabled={!!error}
        className="h-14 rounded-2xl bg-gold text-black font-display text-xl tracking-wider flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <Camera size={20} />
        PRENDRE LA PHOTO
      </motion.button>
    </>
  );
}

function PreviewStage({
  photoB64,
  onRetake,
  onConfirm,
  error,
}: {
  photoB64: string;
  onRetake: () => void;
  onConfirm: () => void;
  error: string | null;
}) {
  return (
    <>
      <p className="text-center text-white text-base mb-4">
        Vérifiez que votre visage est bien cadré
      </p>
      <div className="flex justify-center mb-6">
        <div
          className="relative rounded-full overflow-hidden border-4 border-gold"
          style={{ width: 280, height: 280, background: '#111' }}
        >
          <img
            src={photoB64}
            alt="Aperçu"
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />
        </div>
      </div>
      {error && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300 text-center">
          {error}
        </div>
      )}
      <div className="flex gap-3">
        <button
          onClick={onRetake}
          className="flex-1 h-14 rounded-2xl border-2 border-zinc-700 bg-zinc-900 text-white font-display text-base tracking-wider flex items-center justify-center gap-2"
        >
          <RotateCcw size={18} />
          REPRENDRE
        </button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onConfirm}
          className="flex-1 h-14 rounded-2xl bg-gold text-black font-display text-base tracking-wider flex items-center justify-center gap-2"
        >
          <Check size={18} />
          CONFIRMER
        </motion.button>
      </div>
    </>
  );
}

function LoadingStage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6">
      <Loader2 className="text-gold animate-spin" size={64} />
      <div className="text-center">
        <div className="font-display text-2xl text-gold tracking-wider">
          VÉRIFICATION EN COURS…
        </div>
        <div className="mt-2 text-sm text-zinc-400">
          Analyse biométrique sécurisée
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
  if (result.verdict === 'APPROVED') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6">
        <div className="rounded-full bg-emerald-500/20 border-4 border-emerald-500 p-6">
          <Check className="text-emerald-400" size={64} strokeWidth={3} />
        </div>
        <div className="text-center">
          <div className="font-display text-3xl text-emerald-400 tracking-wider">
            IDENTITÉ VÉRIFIÉE
          </div>
          <div className="mt-2 text-sm text-zinc-400">
            Bienvenue sur Congo Gaming.
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            Âge estimé : {result.estimated_age} ans
          </div>
        </div>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onApprovedContinue}
          className="w-full h-14 rounded-2xl bg-gold text-black font-display text-xl tracking-wider"
        >
          CONTINUER
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
            ACCÈS REFUSÉ
          </div>
          <div className="mt-3 text-sm text-zinc-300 max-w-xs">
            Vous devez avoir 18 ans ou plus pour utiliser Congo Gaming.
          </div>
          <div className="mt-2 text-xs text-zinc-500">
            Âge estimé : {result.age_low}–{result.age_high} ans
          </div>
        </div>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onDeniedAcknowledge}
          className="w-full h-14 rounded-2xl bg-red-500 text-white font-display text-xl tracking-wider"
        >
          J'AI COMPRIS
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
          ÂGE INCERTAIN
        </div>
        <div className="mt-3 text-sm text-zinc-300 max-w-xs">
          Votre compte sera vérifié manuellement par notre équipe. Vous pouvez
          continuer en attendant la validation.
        </div>
        <div className="mt-2 text-xs text-zinc-500">
          Âge estimé : {result.age_low}–{result.age_high} ans
        </div>
      </div>
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={onVerifyAgeContinue}
        className="w-full h-14 rounded-2xl bg-amber-500 text-black font-display text-xl tracking-wider"
      >
        CONTINUER
      </motion.button>
    </div>
  );
}
