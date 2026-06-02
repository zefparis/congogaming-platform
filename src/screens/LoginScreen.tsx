import { useEffect, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Phone, Lock, Clock } from 'lucide-react';
import NumPad from '../components/NumPad';
import { useTranslation } from 'react-i18next';
import { AuthApiError, detectOperator, linkAgent, loginUser, validateCongoPhone, getSession } from '../lib/auth';
import { displayError } from '../lib/errors';

function formatRemaining(seconds: number): string {
  if (seconds <= 0) return '0s';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

export default function LoginScreen() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const agentRef = (() => {
    const ref = searchParams.get('ref')?.toUpperCase() ?? '';
    return /^AG-[A-Z0-9]{6}$/.test(ref) ? ref : null;
  })();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [step, setStep] = useState<'phone' | 'pin'>('phone');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!lockedUntil) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [lockedUntil]);

  const remainingSeconds = lockedUntil ? Math.max(0, Math.ceil((lockedUntil - now) / 1000)) : 0;
  const isLocked = remainingSeconds > 0;

  useEffect(() => {
    if (lockedUntil && remainingSeconds === 0) {
      setLockedUntil(null);
      setErr(null);
    }
  }, [remainingSeconds, lockedUntil]);

  const op = detectOperator(phone);

  const onPhoneDigit = (d: string) => {
    setPhone((prev) => (prev.length < 10 ? prev + d : prev));
    setErr(null);
  };
  const onPhoneDelete = () => setPhone((prev) => prev.slice(0, -1));

  const goPin = () => {
    if (!validateCongoPhone(phone)) return setErr(t('login.invalid_phone'));
    setStep('pin');
    setErr(null);
  };

  const onPinDelete = () => setPin((prev) => prev.slice(0, -1));
  const onPinDigit = (d: string) => {
    setPin((prev) => (prev.length < 4 ? prev + d : prev));
    setErr(null);
  };
  const goToResetPin = () => {
    nav('/reset-pin', { state: { phone }, replace: true });
  };

  const handleLogin = async () => {
    if (pin.length !== 4 || loading || isLocked) return;
    try {
      setLoading(true);
      await loginUser(phone, pin);
      if (agentRef) await linkAgent(agentRef);
      // KYC is scoped to /jouer (PredictStreet) only — see
      // `PredictStreetRoute` in App.tsx. Always land returning users
      // on home; the KYC scan is triggered on the FIFA card tap.
      nav('/', { replace: true });
    } catch (e: any) {
      // Highest priority: legacy PIN reset flow. Trigger from either the
      // explicit backend code OR a 409 response (defensive fallback in case
      // an older backend revision is live and only returns the status).
      const code = e instanceof AuthApiError ? e.code : undefined;
      const status = e instanceof AuthApiError ? e.status : undefined;
      if (code === 'PIN_RESET_REQUIRED' || (status === 409 && /pin/i.test(String(e.message || '')))) {
        goToResetPin();
        return;
      }
      if (e instanceof AuthApiError && code === 'ACCOUNT_TEMP_LOCKED') {
        const until = e.lockedUntil
          ? new Date(e.lockedUntil).getTime()
          : Date.now() + (e.retryAfterSeconds || 0) * 1000;
        setLockedUntil(until);
        setNow(Date.now());
      }
      setErr(displayError(t, e instanceof AuthApiError ? e.code : undefined, e.message));
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col p-6 pt-12" style={{ position: 'relative' }}>
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
        <div className="text-zinc-500 text-xs uppercase tracking-widest">{t('login.page_label')}</div>
      </div>

      {step === 'phone' ? (
        <>
          <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 flex items-center gap-3">
            <Phone className="w-6 h-6 text-gold" />
            <div className="flex-1">
              <div className="text-xs text-zinc-500">{t('login.phone_label')}</div>
              <input
                type="text"
                value={phone}
                readOnly
                inputMode="none"
                placeholder="09XXXXXXXX"
                aria-label={t('login.phone_aria')}
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
            {t('login.continue')}
          </motion.button>
          <p className="mt-6 text-center text-sm text-zinc-400">
            {t('login.no_account')}{' '}
            <Link to="/register" className="text-gold font-semibold">{t('login.create_account')}</Link>
          </p>
        </>
      ) : (
        <>
          <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 flex items-center gap-3">
            <Lock className="w-6 h-6 text-gold" />
            <div className="flex-1">
              <div className="text-xs text-zinc-500">{t('login.pin_label')}</div>
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
          {isLocked && (
            <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 flex items-start gap-3">
              <Clock className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
              <div className="text-sm">
                <div className="text-amber-300 font-semibold">{t('login.locked_title')}</div>
                <div className="text-amber-200/90 mt-0.5">
                  {t('login.locked_message')}
                </div>
                <div className="mt-1 text-amber-100">
                  {t('login.retry_in')} <span className="font-display tracking-wider">{formatRemaining(remainingSeconds)}</span>
                </div>
              </div>
            </div>
          )}
          {err && !isLocked && (
            <div className="mt-3">
              <div className="text-red-400 text-sm">{err}</div>
              <button
                type="button"
                onClick={goToResetPin}
                className="mt-2 text-gold font-semibold text-sm underline underline-offset-4"
              >
                {t('login.change_pin')}
              </button>
            </div>
          )}
          {loading && <div className="mt-3 text-gold text-sm">{t('login.connecting')}</div>}
          <div className="mt-5">
            <NumPad onDigit={onPinDigit} onDelete={onPinDelete} />
          </div>
          {pin.length === 4 && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleLogin}
              disabled={loading || isLocked}
              className="w-full mt-6 py-5 bg-amber-600 text-white font-black text-xl rounded-2xl tracking-widest disabled:opacity-60"
            >
              {isLocked ? t('login.locked_button', { time: formatRemaining(remainingSeconds) }) : t('login.validate')}
            </motion.button>
          )}
          <button onClick={() => { setStep('phone'); setPin(''); }} className="mt-4 text-zinc-400 text-sm">
            {t('login.back_to_phone')}
          </button>
        </>
      )}
    </div>
  );
}
