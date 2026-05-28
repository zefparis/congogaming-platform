import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Phone, Lock } from 'lucide-react';
import NumPad from '../components/NumPad';
import { AuthApiError, detectOperator, loginUser, validateCongoPhone, getSession } from '../lib/auth';

export default function LoginScreen() {
  const nav = useNavigate();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [step, setStep] = useState<'phone' | 'pin'>('phone');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const op = detectOperator(phone);

  const onPhoneDigit = (d: string) => {
    setPhone((prev) => (prev.length < 10 ? prev + d : prev));
    setErr(null);
  };
  const onPhoneDelete = () => setPhone((prev) => prev.slice(0, -1));

  const goPin = () => {
    if (!validateCongoPhone(phone)) return setErr('Numéro RDC invalide');
    setStep('pin');
    setErr(null);
  };

  const onPinDelete = () => setPin((prev) => prev.slice(0, -1));
  const onPinDigit = (d: string) => {
    setPin((prev) => (prev.length < 4 ? prev + d : prev));
    setErr(null);
  };
  const handleLogin = async () => {
    if (pin.length !== 4 || loading) return;
    try {
      setLoading(true);
      await loginUser(phone, pin);
      // KYC is scoped to /jouer (PredictStreet) only — see
      // `PredictStreetRoute` in App.tsx. Always land returning users
      // on home; the KYC scan is triggered on the FIFA card tap.
      nav('/', { replace: true });
    } catch (e: any) {
      if (e instanceof AuthApiError && e.code === 'PIN_RESET_REQUIRED') {
        nav('/reset-pin', { state: { phone }, replace: true });
        return;
      }
      setErr(e.message || 'Erreur');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col p-6 pt-12">
      <div className="flex items-center gap-3 mb-6">
        <img
          src="/images/okapi.PNG"
          alt="Congo Gaming"
          className="h-10 w-auto object-contain cursor-pointer"
          onClick={() => {
            const user = getSession();
            user ? nav('/home') : nav('/');
          }}
        />
        <div className="text-zinc-500 text-xs uppercase tracking-widest">Connexion</div>
      </div>

      {step === 'phone' ? (
        <>
          <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 flex items-center gap-3">
            <Phone className="w-6 h-6 text-gold" />
            <div className="flex-1">
              <div className="text-xs text-zinc-500">Numéro</div>
              <input
                type="text"
                value={phone}
                readOnly
                inputMode="none"
                placeholder="09XXXXXXXX"
                aria-label="Numéro de téléphone"
                className="w-full bg-transparent border-0 outline-none font-display text-3xl tracking-widest text-white placeholder:text-zinc-700 caret-transparent select-none"
              />
            </div>
            {op && <span className="text-xs px-2 py-1 rounded bg-gold/20 text-gold font-bold">{op}</span>}
          </div>
          {err && <div className="mt-3 text-red-400 text-sm">{err}</div>}
          <div className="mt-5">
            <NumPad onDigit={onPhoneDigit} onDelete={onPhoneDelete} variant="amount" />
          </div>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={goPin}
            className="mt-5 h-14 rounded-2xl bg-gold text-black font-display text-2xl tracking-wider"
          >
            CONTINUER
          </motion.button>
          <p className="mt-6 text-center text-sm text-zinc-400">
            Pas de compte ?{' '}
            <Link to="/register" className="text-gold font-semibold">Créer un compte</Link>
          </p>
        </>
      ) : (
        <>
          <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 flex items-center gap-3">
            <Lock className="w-6 h-6 text-gold" />
            <div className="flex-1">
              <div className="text-xs text-zinc-500">Code PIN</div>
              <div className="flex gap-3 mt-2">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center font-display text-2xl ${
                      pin.length > i ? 'bg-gold border-gold text-black' : 'border-zinc-700 text-zinc-700'
                    }`}
                  >
                    {pin.length > i ? '•' : ''}
                  </div>
                ))}
              </div>
            </div>
          </div>
          {err && <div className="mt-3 text-red-400 text-sm">{err}</div>}
          {loading && <div className="mt-3 text-gold text-sm">Connexion…</div>}
          <div className="mt-5">
            <NumPad onDigit={onPinDigit} onDelete={onPinDelete} />
          </div>
          {pin.length === 4 && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleLogin}
              disabled={loading}
              className="w-full mt-6 py-5 bg-amber-600 text-white font-black text-xl rounded-2xl tracking-widest disabled:opacity-60"
            >
              VALIDER
            </motion.button>
          )}
          <button onClick={() => { setStep('phone'); setPin(''); }} className="mt-4 text-zinc-400 text-sm">
            ← Modifier le numéro
          </button>
        </>
      )}
    </div>
  );
}
