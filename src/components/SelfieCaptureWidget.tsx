import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Camera, RotateCcw, Check } from 'lucide-react';

// ─── SelfieCaptureWidget ─────────────────────────────────────────────────────
//
// Self-contained camera capture component shared between KycScreen (which
// requires a session) and ResetPinScreen (which does not). The widget manages
// its own camera lifecycle, capture, and preview stages internally. It calls
// onCapture(rawBase64) when the user confirms the photo — the data:image/…
// prefix is stripped before passing to the callback so the caller can post it
// directly to the API.
//
// Usage (no session required at this level):
//   <SelfieCaptureWidget onCapture={(rawB64) => { /* submit */ }} />

type InnerStage = 'camera' | 'preview';

interface Props {
  onCapture: (rawB64: string) => void;
}

export function SelfieCaptureWidget({ onCapture }: Props) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [stage, setStage] = useState<InnerStage>('camera');
  const [photoB64, setPhotoB64] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    if (stage !== 'camera') return;
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
        setCameraError(
          e?.name === 'NotAllowedError'
            ? t('kyc.camera_denied')
            : t('kyc.camera_error'),
        );
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [stage, t]);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
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
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function retake() {
    setPhotoB64(null);
    setCameraError(null);
    setStage('camera');
  }

  function confirm() {
    if (!photoB64) return;
    const rawB64 = photoB64.includes(',') ? photoB64.split(',')[1]! : photoB64;
    onCapture(rawB64);
  }

  if (stage === 'camera') {
    return (
      <>
        <p className="text-center text-white text-base mb-4">{t('kyc.look_straight')}</p>
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
        {cameraError && (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300 text-center">
            {cameraError}
          </div>
        )}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={capture}
          disabled={!!cameraError}
          className="w-full h-14 rounded-2xl bg-gold text-black font-display text-xl tracking-wider flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Camera size={20} />
          {t('kyc.take_photo')}
        </motion.button>
      </>
    );
  }

  return (
    <>
      <p className="text-center text-white text-base mb-4">{t('kyc.check_face')}</p>
      <div className="flex justify-center mb-6">
        <div
          className="relative rounded-full overflow-hidden border-4 border-gold"
          style={{ width: 280, height: 280, background: '#111' }}
        >
          <img
            src={photoB64!}
            alt="Aperçu"
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />
        </div>
      </div>
      <div className="flex gap-3">
        <button
          onClick={retake}
          className="flex-1 h-14 rounded-2xl border-2 border-zinc-700 bg-zinc-900 text-white font-display text-base tracking-wider flex items-center justify-center gap-2"
        >
          <RotateCcw size={18} />
          {t('kyc.retake')}
        </button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={confirm}
          className="flex-1 h-14 rounded-2xl bg-gold text-black font-display text-base tracking-wider flex items-center justify-center gap-2"
        >
          <Check size={18} />
          {t('kyc.confirm')}
        </motion.button>
      </div>
    </>
  );
}
