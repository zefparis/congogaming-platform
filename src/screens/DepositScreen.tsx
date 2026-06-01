import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import NumPad from '../components/NumPad';
import { useTranslation } from 'react-i18next';
import { displayError } from '../lib/errors';
import { getSession, refreshBalance } from '../lib/auth';
import { api } from '../lib/api';

type State = 'idle' | 'pending' | 'success' | 'error';

// Keep these in sync with server/routes/deposit.ts MIN_AMOUNTS.
const MIN_AMOUNTS: Record<number, number> = {
  10: 100,   // Orange
  17: 100,   // Airtel
  19: 2250,  // Africell / Afrimoney
};
const DEFAULT_CHIPS = [1000, 5000, 10000, 25000];
const AFRICELL_CHIPS = [2500, 5000, 10000, 20000];

// Detect the mobile-money operator from the user's phone number. Used
// instead of the previous manual ProviderCard selector. Mirrors the
// server-side provider_id mapping (Orange=10, Airtel=17, Africell=19).
type DetectedOperator = { id: number; name: string; color: string };

function detectProvider(phone: string): DetectedOperator | null {
  const p = phone.replace(/\s/g, '');
  // Orange Money: 084, 085, 086, 087, 088, 089
  if (/^08[4-9]/.test(p)) return { id: 10, name: 'Orange Money', color: '#FF6600' };
  // Airtel Money: 097, 098, 099
  if (/^09[7-9]/.test(p)) return { id: 17, name: 'Airtel Money', color: '#FF0000' };
  // Africell: 090, 091, 092, 093
  if (/^09[0-3]/.test(p)) return { id: 19, name: 'Africell',     color: '#0066CC' };
  return null;
}

const MIN_AMOUNT_CODES: Record<number, string> = { 10: 'MIN_AMOUNT_ORANGE', 17: 'MIN_AMOUNT_AIRTEL', 19: 'MIN_AMOUNT_AFRICELL' };

export default function DepositScreen() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const session = getSession();
  const [amount, setAmount] = useState('');
  const initialDetected = detectProvider(session?.phone || '');
  const [providerId, setProviderId] = useState<number>(initialDetected?.id ?? 10);
  const [phone, setPhone] = useState(session?.phone || '');
  const [detectedOperator, setDetectedOperator] = useState<DetectedOperator | null>(initialDetected);
  const [state, setState] = useState<State>('idle');
  const [msg, setMsg] = useState<string>('');

  const onDigit = (d: string) => {
    if (amount.length >= 9) return;
    const next = (amount + d).replace(/^0+/, '');
    setAmount(next);
  };

  const submit = async () => {
    if (!session) return;
    const amt = Number(amount);
    const minAmount = MIN_AMOUNTS[providerId] ?? 100;
    if (!amt || amt < minAmount) {
      setState('error');
      setMsg(t(`errors.${MIN_AMOUNT_CODES[providerId] ?? 'MIN_AMOUNT_GENERIC'}`));
      return;
    }
    if (!/^0[89]\d{8}$/.test(phone)) { setState('error'); setMsg(t('deposit.invalid_number')); return; }
    setState('pending');
    setMsg(t('deposit.request_sent'));
    try {
      const r = await api.deposit({ amount: amt, provider_id: providerId, phone });
      if ((r as any)?.pending) {
        // Provider was unreachable / breaker open. Server has the
        // tx in PENDING and will reconcile asynchronously.
        setMsg(t('deposit.request_registered'));
      }
      // Poll status — extended to ~60s so we cover the reconciliation
      // window when the provider is slow to confirm.
      let tries = 0;
      const poll = async () => {
        tries++;
        try {
          const s = await api.status(r.order_id);
          if (s.status === 2) {
            setState('success'); setMsg(t('deposit.success'));
            await refreshBalance(session.id);
            return;
          }
          if (s.status === 3) { setState('error'); setMsg(t('deposit.failed')); return; }
        } catch {}
        if (tries < 20) setTimeout(poll, 3000);
        else {
          setState('pending');
          setMsg(t('deposit.still_pending'));
          await refreshBalance(session.id).catch(() => {});
        }
      };
      setTimeout(poll, 3000);
    } catch (e: any) {
      setState('error'); setMsg(displayError(t, e.code, e.message));
    }
  };

  return (
    <div className="min-h-screen p-4 pb-28">
      <header className="flex items-center gap-3 py-2">
        <button onClick={() => nav('/')} className="w-11 h-11 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-gold">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <img
          src="/images/okapi.PNG"
          alt="Congo Gaming"
          className="h-10 w-auto object-contain cursor-pointer"
          onClick={() => {
            const user = getSession();
            user ? nav('/home') : nav('/');
          }}
        />
      </header>

      <div className="mt-3 rounded-2xl bg-zinc-900/70 border border-zinc-800 p-4">
        <div className="text-xs text-zinc-500 uppercase tracking-widest">{t('deposit.phone_label')}</div>
        <input
          inputMode="numeric"
          value={phone}
          onChange={(e) => {
            const value = e.target.value.replace(/\D/g, '').slice(0, 10);
            setPhone(value);
            const detected = detectProvider(value);
            if (detected) {
              setProviderId(detected.id);
              setDetectedOperator(detected);
            } else {
              setDetectedOperator(null);
            }
          }}
          className="bg-transparent w-full font-display text-2xl tracking-widest outline-none mt-1"
        />
        {phone.length >= 3 && detectedOperator && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(0,200,117,0.1)',
              border: '1px solid rgba(0,200,117,0.4)',
              borderRadius: 10,
              padding: '8px 14px',
              marginTop: 8,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#00C875',
              }}
            />
            <span
              style={{
                color: '#00C875',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {t('deposit.detected', { operator: detectedOperator.name })}
            </span>
            <span
              style={{
                color: 'rgba(255,255,255,0.4)',
                fontSize: 11,
                marginLeft: 'auto',
              }}
            >
              {t('deposit.automatic')}
            </span>
          </div>
        )}
        {phone.length === 10 && !detectedOperator && (
          <div style={{ color: '#FF4444', fontSize: 12, marginTop: 6 }}>
            {t('deposit.invalid_number')}
          </div>
        )}
      </div>

      <div className="mt-4 rounded-2xl bg-zinc-900/70 border border-zinc-800 p-4">
        <div className="text-xs text-zinc-500 uppercase tracking-widest">{t('deposit.amount_label')}</div>
        <div className="font-display text-5xl text-white mt-1">
          {amount ? Number(amount).toLocaleString('fr-FR') : <span className="text-zinc-700">0</span>}
        </div>
        <div className="flex gap-2 mt-3">
          {(providerId === 19 ? AFRICELL_CHIPS : DEFAULT_CHIPS).map((v) => (
            <button
              key={v}
              onClick={() => setAmount(String(v))}
              className="flex-1 h-9 rounded-lg bg-zinc-800 text-xs font-semibold border border-zinc-700"
            >
              {v.toLocaleString('fr-FR')}
            </button>
          ))}
        </div>
        {detectedOperator?.id === 19 && Number(amount) > 0 && Number(amount) < 2250 && (
          <div style={{ color: '#FF8C00', fontSize: 12, marginTop: 8 }}>
            {t('deposit.min_africell')}
          </div>
        )}
      </div>

      <div className="mt-4">
        <NumPad onDigit={onDigit} onDelete={() => setAmount(amount.slice(0, -1))} variant="amount" />
      </div>

      {state !== 'idle' && (
        <div className={`mt-4 p-3 rounded-xl border flex items-start gap-2 ${
          state === 'pending' ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300' :
          state === 'success' ? 'bg-congogreen/10 border-congogreen/30 text-congogreen' :
          'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          {state === 'pending' && <Loader2 className="w-5 h-5 animate-spin shrink-0" />}
          {state === 'success' && <CheckCircle2 className="w-5 h-5 shrink-0" />}
          {state === 'error' && <XCircle className="w-5 h-5 shrink-0" />}
          <span className="text-sm">{msg}</span>
        </div>
      )}

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={submit}
        disabled={state === 'pending'}
        className="mt-4 w-full h-16 rounded-2xl bg-congogreen text-white font-display text-3xl tracking-widest disabled:opacity-60"
      >
        {t('deposit.confirm')}
      </motion.button>
    </div>
  );
}
