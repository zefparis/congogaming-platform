import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle2, Loader2, Wallet, XCircle } from 'lucide-react';
import NumPad from '../components/NumPad';
import { getSession, refreshBalance } from '../lib/auth';
import { api } from '../lib/api';

type State = 'idle' | 'pending' | 'success' | 'error';

// Detect the mobile-money operator from the user's phone number.
// Mirrors the server-side provider_id mapping
// (Orange=10, Airtel=17, Africell=19).
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

const AFRICELL_MIN = 2250;

export default function WithdrawScreen() {
  const nav = useNavigate();
  const session = getSession();
  const [amount, setAmount] = useState('');
  const initialDetected = detectProvider(session?.phone || '');
  const [providerId, setProviderId] = useState<number>(initialDetected?.id ?? 10);
  const [phone, setPhone] = useState(session?.phone || '');
  const [detectedOperator, setDetectedOperator] = useState<DetectedOperator | null>(initialDetected);
  const [balance, setBalance] = useState<number>(session?.balance_cdf ?? 0);
  const [state, setState] = useState<State>('idle');
  const [msg, setMsg] = useState<string>('');

  useEffect(() => {
    if (session) refreshBalance(session.id).then(setBalance).catch(() => {});
  }, []);

  const onDigit = (d: string) => {
    if (amount.length >= 9) return;
    const next = (amount + d).replace(/^0+/, '');
    setAmount(next);
  };

  const submit = async () => {
    if (!session) return;
    const amt = Number(amount);
    if (!amt || amt < 500) { setState('error'); setMsg('Minimum 500 CDF'); return; }
    if (amt > balance) { setState('error'); setMsg('Solde insuffisant'); return; }
    if (!/^0[89]\d{8}$/.test(phone)) { setState('error'); setMsg('Numéro invalide'); return; }
    setState('pending'); setMsg('Retrait en cours…');
    try {
      await api.withdraw({ amount: amt, provider_id: providerId, phone });
      setState('success'); setMsg('Demande de retrait envoyée');
      const b = await refreshBalance(session.id); setBalance(b);
    } catch (e: any) {
      setState('error'); setMsg(e.message || 'Erreur');
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

      <div className="mt-3 rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-950 border border-gold/20 p-4 flex items-center gap-3">
        <Wallet className="w-7 h-7 text-gold" />
        <div className="flex-1">
          <div className="text-xs text-zinc-500 uppercase tracking-widest">Solde disponible</div>
          <div className="font-display text-3xl text-gold">{balance.toLocaleString('fr-FR')} <span className="text-xs text-zinc-400">CDF</span></div>
        </div>
      </div>

      <div className="mt-3 rounded-2xl bg-zinc-900/70 border border-zinc-800 p-4">
        <div className="text-xs text-zinc-500 uppercase tracking-widest">Numéro de réception</div>
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
              {detectedOperator.name} détecté
            </span>
            <span
              style={{
                color: 'rgba(255,255,255,0.4)',
                fontSize: 11,
                marginLeft: 'auto',
              }}
            >
              ✓ automatique
            </span>
          </div>
        )}
        {phone.length === 10 && !detectedOperator && (
          <div style={{ color: '#FF4444', fontSize: 12, marginTop: 6 }}>
            Numéro non reconnu — vérifiez votre numéro
          </div>
        )}
      </div>

      <div className="mt-4 rounded-2xl bg-zinc-900/70 border border-zinc-800 p-4">
        <div className="text-xs text-zinc-500 uppercase tracking-widest">Montant (CDF) — min 500</div>
        <div className="font-display text-5xl text-white mt-1">
          {amount ? Number(amount).toLocaleString('fr-FR') : <span className="text-zinc-700">0</span>}
        </div>
        {detectedOperator?.id === 19 && Number(amount) > 0 && Number(amount) < AFRICELL_MIN && (
          <div style={{ color: '#FF8C00', fontSize: 12, marginTop: 8 }}>
            Montant minimum Africell : 2 250 CDF
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
        className="mt-4 w-full h-16 rounded-2xl bg-gold text-black font-display text-3xl tracking-widest disabled:opacity-60"
      >
        CONFIRMER
      </motion.button>
    </div>
  );
}
