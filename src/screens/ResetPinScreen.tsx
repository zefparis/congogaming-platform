import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import NumPad from '../components/NumPad';
import { AuthApiError, resetPinByPhone } from '../lib/auth';

type Step = 'new' | 'confirm' | 'done';

export default function ResetPinScreen() {
  const nav = useNavigate();
  const location = useLocation();
  const phone = (location.state as { phone?: string } | null)?.phone || '';

  const [step, setStep] = useState<Step>('new');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Hard guard: without a phone we cannot call the API. Send back to login.
    if (!phone) nav('/login', { replace: true });
  }, [phone, nav]);

  const activePin = step === 'new' ? newPin : confirmPin;
  const setActivePin = step === 'new' ? setNewPin : setConfirmPin;

  const onDigit = (d: string) => {
    setErr(null);
    setActivePin((prev) => (prev.length < 4 ? prev + d : prev));
  };
  const onDelete = () => {
    setErr(null);
    setActivePin((prev) => prev.slice(0, -1));
  };

  const goConfirm = () => {
    if (newPin.length !== 4) return;
    setStep('confirm');
    setErr(null);
  };

  const submit = async () => {
    if (loading) return;
    if (confirmPin.length !== 4) return;
    if (newPin !== confirmPin) {
      setErr('Les deux PIN sont différents.');
      setConfirmPin('');
      return;
    }
    try {
      setLoading(true);
      await resetPinByPhone(phone, newPin);
      setStep('done');
    } catch (e) {
      if (e instanceof AuthApiError) {
        if (e.code === 'PIN_RESET_NOT_REQUIRED') {
          setErr('Votre PIN est déjà à jour. Connectez-vous.');
        } else if (e.code === 'USER_NOT_FOUND') {
          setErr('Numéro inconnu.');
        } else if (e.code === 'INVALID_PIN_FORMAT') {
          setErr('PIN invalide.');
        } else {
          setErr(e.message || 'Erreur');
        }
      } else {
        setErr('Erreur réseau.');
      }
      setConfirmPin('');
      setStep('new');
      setNewPin('');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'done') {
    return (
      <div className="min-h-screen flex flex-col p-6 pt-16 items-center text-center">
        <div className="text-5xl mb-4">✅</div>
        <div className="font-display text-3xl text-gold mb-3">PIN changé.</div>
        <div className="text-zinc-300 text-base mb-10">Connectez-vous avec votre nouveau PIN.</div>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => nav('/login', { replace: true })}
          className="w-full max-w-sm h-14 rounded-2xl bg-gold text-black font-display text-2xl tracking-wider"
        >
          SE CONNECTER
        </motion.button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col p-6 pt-10">
      <div className="flex items-center gap-3 mb-4">
        <img src="/images/okapi.PNG" alt="Congo Gaming" className="h-10 w-auto object-contain" />
        <div className="text-zinc-500 text-xs uppercase tracking-widest">Nouveau PIN</div>
      </div>

      <div className="bg-amber-900/30 border border-amber-700/40 rounded-2xl p-4 mb-5">
        <div className="text-amber-200 font-display text-lg mb-1">Votre ancien PIN doit être remplacé.</div>
        <div className="text-amber-100/80 text-sm">
          {step === 'new'
            ? 'Entrez un nouveau PIN à 4 chiffres.'
            : 'Entrez à nouveau le même PIN pour confirmer.'}
        </div>
      </div>

      <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 flex items-center gap-3">
        <Lock className="w-6 h-6 text-gold" />
        <div className="flex-1">
          <div className="text-xs text-zinc-500">
            {step === 'new' ? 'Nouveau PIN' : 'Confirmer PIN'}
          </div>
          <div className="flex gap-3 mt-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center font-display text-2xl ${
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

      {/* Hidden numeric input for native mobile keyboards if user taps */}
      <input
        type="tel"
        inputMode="numeric"
        pattern="\d*"
        maxLength={4}
        value={activePin}
        onChange={(e) => setActivePin(e.target.value.replace(/\D/g, '').slice(0, 4))}
        className="sr-only"
        aria-hidden="true"
      />

      {err && <div className="mt-3 text-red-400 text-sm">{err}</div>}
      {loading && <div className="mt-3 text-gold text-sm">Mise à jour…</div>}

      <div className="mt-5">
        <NumPad onDigit={onDigit} onDelete={onDelete} />
      </div>

      {step === 'new' && newPin.length === 4 && (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={goConfirm}
          className="w-full mt-6 py-5 bg-gold text-black font-black text-xl rounded-2xl tracking-widest"
        >
          CONTINUER
        </motion.button>
      )}

      {step === 'confirm' && confirmPin.length === 4 && (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={submit}
          disabled={loading}
          className="w-full mt-6 py-5 bg-amber-600 text-white font-black text-xl rounded-2xl tracking-widest disabled:opacity-60"
        >
          CHANGER MON PIN
        </motion.button>
      )}

      {step === 'confirm' && (
        <button
          onClick={() => {
            setStep('new');
            setConfirmPin('');
            setErr(null);
          }}
          className="mt-4 text-zinc-400 text-sm"
        >
          ← Recommencer
        </button>
      )}
    </div>
  );
}
