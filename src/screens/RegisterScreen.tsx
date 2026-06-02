import { useEffect, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Phone, Lock, Check, Gift } from 'lucide-react';
import NumPad from '../components/NumPad';
import { detectOperator, registerUser, validateCongoPhone, getSession } from '../lib/auth';
import { displayError } from '../lib/errors';

type Step = 'phone' | 'pin';

export default function RegisterScreen() {
  const nav = useNavigate();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [adult, setAdult] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [agentRef, setAgentRef] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (!ref) return;
    const upper = ref.toUpperCase();
    if (/^AG-[A-Z0-9]{6}$/.test(upper)) {
      setAgentRef(upper);
    } else {
      setReferralCode(upper.replace(/[^A-Z0-9]/g, '').slice(0, 12));
    }
  }, [searchParams]);

  const op = detectOperator(phone);

  const onPhoneDigit = (d: string) => {
    setPhone((prev) => (prev.length < 10 ? prev + d : prev));
    setErr(null);
  };
  const onPhoneDelete = () => setPhone((prev) => prev.slice(0, -1));
  const onPinDelete = () => setPin((prev) => prev.slice(0, -1));
  const onPinDigit = (d: string) => {
    setPin((prev) => (prev.length < 4 ? prev + d : prev));
    setErr(null);
  };
  const handleRegister = async () => {
    if (pin.length !== 4 || loading) return;
    try {
      setLoading(true);
      const user = await registerUser(phone, pin, referralCode || null, agentRef);
      // KYC is now scoped to PredictStreet (/jouer) only — see
      // `PredictStreetRoute` in App.tsx. Fresh accounts go straight to
      // home; the KYC scan is triggered the first time they tap the
      // FIFA card.
      if (user.blocked || user.kyc_status === 'denied') {
        // Shouldn't happen on a fresh insert, but be safe.
        setErr(t('register.error_blocked'));
      } else {
        nav('/', { replace: true });
      }
    } catch (e: any) {
      setErr(displayError(t, e?.code, e?.message));
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const goNext = () => {
    if (!validateCongoPhone(phone)) return setErr(t('register.error_phone'));
    if (!adult) return setErr(t('register.error_adult'));
    setErr(null);
    setStep('pin');
  };

  return (
    <div className="min-h-screen flex flex-col p-6 pt-10">
      <div className="flex items-center gap-3 mb-4">
        <Link to="/login" className="text-zinc-400 text-sm">{t('register.back')}</Link>
        <img
          src="/images/okapi.PNG"
          alt="Congo Gaming"
          className="h-10 w-auto object-contain cursor-pointer ml-auto"
          onClick={() => {
            const user = getSession();
            user ? nav('/home') : nav('/');
          }}
        />
      </div>
      <h1 className="font-display text-4xl text-gold tracking-wide">{t('register.title')}</h1>
      <p className="text-zinc-400 text-sm mt-1 mb-6">
        {step === 'phone' ? t('register.subtitle_phone') : t('register.subtitle_pin')}
      </p>

      {agentRef && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-gold/30 bg-gold/8 p-4">
          <div className="flex-1">
            <p className="text-xs text-zinc-400 mb-2">Vous avez déjà un compte ?</p>
            <button
              onClick={() => nav(`/login?ref=${agentRef}`)}
              className="w-full rounded-xl bg-zinc-800 border border-zinc-700 py-2 text-sm font-semibold text-gold"
            >
              Se connecter
            </button>
          </div>
          <span className="text-zinc-600 text-xs px-1">ou</span>
          <div className="flex-1 text-center">
            <p className="text-xs text-zinc-400 mb-2">Nouveau ?</p>
            <p className="text-sm font-semibold text-white">Créer un compte</p>
          </div>
        </div>
      )}

      {step === 'phone' ? (
        <>
          <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 flex items-center gap-3">
            <Phone className="w-6 h-6 text-gold" />
            <div className="flex-1">
              <div className="text-xs text-zinc-500">{t('register.phone_label')}</div>
              <input
                type="text"
                value={phone}
                readOnly
                inputMode="none"
                placeholder="09XXXXXXXX"
                aria-label={t('register.phone_label')}
                className="w-full bg-transparent border-0 outline-none font-display text-3xl tracking-widest text-white placeholder:text-zinc-700 caret-transparent select-none"
              />
            </div>
            {op && <span className="text-xs px-2 py-1 rounded bg-gold/20 text-gold font-bold">{op}</span>}
          </div>

          <button
            onClick={() => setAdult(!adult)}
            className="mt-5 flex items-center gap-3 p-4 rounded-2xl bg-zinc-900 border border-zinc-800"
          >
            <div className={`w-7 h-7 rounded-md flex items-center justify-center ${adult ? 'bg-congogreen' : 'bg-zinc-800 border border-zinc-700'}`}>
              {adult && <Check className="w-5 h-5 text-white" />}
            </div>
            <span className="text-sm text-left">{t('register.adult_check')}</span>
          </button>

          <div className="mt-3 bg-zinc-900 rounded-2xl p-4 border border-zinc-800 flex items-center gap-3">
            <Gift className="w-5 h-5 text-gold" />
            <div className="flex-1">
              <div className="text-xs text-zinc-500">{t('register.referral_label')}</div>
              <input
                type="text"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))}
                placeholder="ABCD1234"
                className="w-full bg-transparent border-0 outline-none font-display text-lg tracking-[0.2em] text-white placeholder:text-zinc-700 mt-0.5"
              />
            </div>
          </div>

          {referralCode.length >= 4 && (
            <div className="mt-3 rounded-2xl bg-gradient-to-br from-gold/10 to-amber-500/5 border border-gold/30 p-4">
              <div className="flex items-center gap-2 mb-1">
                <Gift className="w-4 h-4 text-gold" />
                <div className="font-display text-sm text-gold tracking-wider">{t('register.welcome_bonus_title')}</div>
              </div>
              <div className="text-sm text-zinc-200 leading-relaxed">
                {t('register.welcome_bonus_desc')}
              </div>
              <div className="text-[11px] text-zinc-500 mt-2">
                {t('register.welcome_bonus_note')}
              </div>
            </div>
          )}

          {err && <div className="mt-3 text-red-400 text-sm">{err}</div>}

          <div className="mt-5">
            <NumPad onDigit={onPhoneDigit} onDelete={onPhoneDelete} variant="amount" />
          </div>

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={goNext}
            className="mt-5 h-14 rounded-2xl bg-gold text-black font-display text-2xl tracking-wider"
          >
            {t('common.continue')}
          </motion.button>
        </>
      ) : (
        <>
          <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 flex items-center gap-3">
            <Lock className="w-6 h-6 text-gold" />
            <div className="flex-1">
              <div className="text-xs text-zinc-500">{t('register.pin_label')}</div>
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
          {loading && <div className="mt-3 text-gold text-sm">{t('register.creating')}</div>}

          <div className="mt-5">
            <NumPad onDigit={onPinDigit} onDelete={onPinDelete} />
          </div>

          {pin.length === 4 && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleRegister}
              disabled={loading}
              className="w-full mt-6 py-5 bg-amber-600 text-white font-black text-xl rounded-2xl tracking-widest disabled:opacity-60"
            >
              {t('common.validate')}
            </motion.button>
          )}

          <button onClick={() => setStep('phone')} className="mt-4 text-zinc-400 text-sm">
            {t('register.back_phone')}
          </button>
        </>
      )}
    </div>
  );
}
