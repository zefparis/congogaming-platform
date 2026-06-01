import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Shuffle,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { displayError } from '../lib/errors';
import { getSession, refreshBalance } from '../lib/auth';
import { api } from '../lib/api';
import GainsModal from '../components/GainsModal';

type State = 'idle' | 'pending' | 'success' | 'error';

type Tirage = {
  id: string;
  numeros: number[];
  hash_pre: string;
  jackpot_paye: boolean;
  drawn_at: string;
};

type Ticket = {
  id: string;
  numeros: number[];
  prix_cdf: number;
  gains_cdf: number;
  nb_bons: number;
  status: 'pending' | 'gagnant' | 'perdant' | 'jackpot_attente';
  jackpot_en_attente: boolean;
  tirage_id: string | null;
  created_at: string;
};

const TICKET_PRICE = 1000;
const FLASH_SEUIL = 250_000;

function msToNextSlot(now = new Date()) {
  const next = new Date(now);
  const m = now.getMinutes();
  if (m < 30) next.setMinutes(30, 0, 0);
  else next.setHours(now.getHours() + 1, 0, 0, 0);
  return next.getTime() - now.getTime();
}

function formatMMSS(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function FlashScreen() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const session = getSession();

  const [selected, setSelected] = useState<number[]>([]);
  const [state, setState] = useState<State>('idle');
  const [msg, setMsg] = useState('');
  const [playedNums, setPlayedNums] = useState<number[] | null>(null);

  const [tirage, setTirage] = useState<Tirage | null>(null);
  const [potCdf, setPotCdf] = useState(0);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [showTickets, setShowTickets] = useState(false);
  const [showGains, setShowGains] = useState(false);

  const [remaining, setRemaining] = useState<number>(msToNextSlot());
  const lastZeroRef = useRef<number>(0);
  const [balance, setBalance] = useState<number>(session?.balance_cdf ?? 0);

  const refresh = () => {
    api
      .flashLatest()
      .then((r) => {
        setTirage(r.tirage);
        setPotCdf(Number(r.pot_cdf || 0));
      })
      .catch(() => {});
    if (session) {
      api
        .flashMesTickets(session.id)
        .then((r) => setTickets(r.tickets))
        .catch(() => {});
    }
  };

  useEffect(() => {
    refresh();
    if (session) refreshBalance(session.id).then(setBalance).catch(() => {});
    const id = setInterval(() => {
      const r = msToNextSlot();
      setRemaining(r);
      // when crossing zero, refetch (debounce: only once per slot)
      if (r > 29 * 60 * 1000 && Date.now() - lastZeroRef.current > 30_000) {
        lastZeroRef.current = Date.now();
        // small delay to let server cron finish
        setTimeout(refresh, 4000);
      }
    }, 1000);

    // Refresh balance every 30 seconds to catch admin adjustments
    const balanceInterval = setInterval(() => {
      if (session) refreshBalance(session.id).then(setBalance).catch(() => {});
    }, 30000);

    return () => {
      clearInterval(id);
      clearInterval(balanceInterval);
    };
  }, []);

  const isFull = selected.length === 5;

  const toggle = (n: number) => {
    setSelected((prev) => {
      if (prev.includes(n)) return prev.filter((x) => x !== n);
      if (prev.length >= 5) return prev;
      return [...prev, n].sort((a, b) => a - b);
    });
    if (state !== 'idle') {
      setState('idle');
      setMsg('');
    }
  };

  const quickPick = () => {
    const set = new Set<number>();
    while (set.size < 5) set.add(Math.floor(Math.random() * 20) + 1);
    setSelected(Array.from(set).sort((a, b) => a - b));
    setState('idle');
    setMsg('');
  };

  const clearSel = () => {
    setSelected([]);
    setState('idle');
    setMsg('');
    setPlayedNums(null);
  };

  const submit = async () => {
    if (!session || !isFull || state === 'pending') return;
    setState('pending');
    setMsg(t('flash.validating'));
    try {
      await api.flashTicket(session.id, selected);
      setState('success');
      setMsg(t('flash.ticket_registered'));
      setPlayedNums(selected);
      setSelected([]);
      const newBal = await refreshBalance(session.id);
      setBalance(newBal);
      api
        .flashMesTickets(session.id)
        .then((r) => setTickets(r.tickets))
        .catch(() => {});
    } catch (e: any) {
      setState('error');
      setMsg(displayError(t, e?.code, e?.message));
    }
  };

  const grid = useMemo(() => Array.from({ length: 20 }, (_, i) => i + 1), []);

  return (
    <div className="min-h-screen p-4 pb-28">
      <header className="flex items-center gap-3 py-2">
        <button
          onClick={() => nav('/')}
          className="w-11 h-11 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-gold"
        >
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
        <h1 className="font-display text-2xl text-gold tracking-wider ml-auto flex items-center gap-1">
          <Zap className="w-5 h-5" /> {t('flash.title')}
        </h1>
        <button
          type="button"
          onClick={() => setShowGains(true)}
          style={{
            background: 'rgba(255,215,0,0.1)',
            border: '1px solid rgba(255,215,0,0.3)',
            borderRadius: 20,
            padding: '6px 14px',
            color: '#FFD700',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          {t('flash.gains_button')}
        </button>
      </header>
      <GainsModal open={showGains} onClose={() => setShowGains(false)} type="flash" />

      <div
        style={{
          textAlign: 'center',
          color: '#f0d060',
          fontWeight: 700,
          fontSize: 14,
          marginTop: 8,
        }}
      >
        {t('flash.balance_display', { amount: balance.toLocaleString('fr-FR') })}
      </div>

      <div className="mt-2 flex justify-end">
        <span className="inline-flex items-center gap-1 bg-congogreen text-white text-[10px] uppercase tracking-widest font-semibold px-3 py-1 rounded-full animate-pulse">
          <Zap className="w-3 h-3" /> {t('flash.draw_interval')}
        </span>
      </div>

      {/* Countdown + pot */}
      <div className="mt-3 rounded-2xl bg-zinc-900/70 border border-zinc-800 p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-widest text-zinc-500">
            {t('flash.next_draw')}
          </div>
        </div>
        <div className="font-display text-5xl text-gold mt-1 tracking-widest">
          {formatMMSS(remaining)}
        </div>

        <div className="mt-4">
          {potCdf < FLASH_SEUIL ? (
            <div>
              <div className="text-xs text-zinc-300">
                {t('flash.pot_label')}{' '}
                <span className="text-gold font-semibold">
                  {potCdf.toLocaleString('fr-FR')}
                </span>{' '}
                / {FLASH_SEUIL.toLocaleString('fr-FR')} CDF
              </div>
              <div
                style={{
                  width: '100%',
                  background: '#333',
                  borderRadius: '4px',
                  height: '6px',
                  marginTop: '6px',
                }}
              >
                <div
                  style={{
                    width: `${Math.min((potCdf / FLASH_SEUIL) * 100, 100)}%`,
                    background: '#FF8C00',
                    height: '6px',
                    borderRadius: '4px',
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>
            </div>
          ) : (
            <div
              className="animate-flicker font-display tracking-wider"
              style={{ color: '#FFD700', fontSize: '1.1rem' }}
            >
              {t('flash.jackpot_available', { amount: potCdf.toLocaleString('fr-FR') })}
            </div>
          )}
        </div>
      </div>

      {/* Dernier tirage */}
      <div className="mt-3 rounded-2xl bg-zinc-900/70 border border-zinc-800 p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-widest text-zinc-500">{t('flash.last_draw')}</div>
          {tirage && (
            <div className="text-[10px] text-zinc-500">
              {new Date(tirage.drawn_at).toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          )}
        </div>
        {tirage ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {tirage.numeros.map((n) => (
              <Ball key={n} n={n} variant="gold" />
            ))}
          </div>
        ) : (
          <div className="mt-2 text-sm text-zinc-400">{t('flash.no_draw')}</div>
        )}
      </div>

      {/* Sélection */}
      <div className="mt-4 rounded-2xl bg-zinc-900/70 border border-zinc-800 p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-widest text-zinc-500">
            {t('flash.choose_numbers')}
          </div>
          <div className="font-display text-xl text-gold">{selected.length}/5</div>
        </div>

        <div className="mt-3 grid grid-cols-5 gap-2">
          {grid.map((n) => {
            const on = selected.includes(n);
            return (
              <motion.button
                key={n}
                whileTap={{ scale: 0.9 }}
                onClick={() => toggle(n)}
                className={`h-12 rounded-lg font-display text-xl transition-colors ${
                  on
                    ? 'bg-gold text-black font-bold shadow-[0_0_12px_rgba(255,215,0,0.5)]'
                    : 'bg-zinc-900 border border-zinc-700 text-zinc-200'
                }`}
              >
                {n}
              </motion.button>
            );
          })}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={quickPick}
            className="h-11 rounded-xl bg-zinc-800 border border-zinc-700 text-sm font-semibold flex items-center justify-center gap-2"
          >
            <Shuffle className="w-4 h-4" /> {t('flash.quick_pick')}
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={clearSel}
            disabled={selected.length === 0}
            className="h-11 rounded-xl bg-zinc-800 border border-zinc-700 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" /> {t('flash.clear')}
          </motion.button>
        </div>
      </div>

      {state !== 'idle' && (
        <div
          className={`mt-4 p-3 rounded-xl border flex items-start gap-2 ${
            state === 'pending'
              ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300'
              : state === 'success'
              ? 'bg-congogreen/10 border-congogreen/30 text-congogreen'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}
        >
          {state === 'pending' && <Loader2 className="w-5 h-5 animate-spin shrink-0" />}
          {state === 'success' && <CheckCircle2 className="w-5 h-5 shrink-0" />}
          {state === 'error' && <XCircle className="w-5 h-5 shrink-0" />}
          <div className="text-sm">
            <div>{msg}</div>
            {state === 'success' && playedNums && (
              <div className="mt-2 flex flex-wrap gap-1">
                {playedNums.map((n) => (
                  <Ball key={n} n={n} variant="gold" small />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={submit}
        disabled={!isFull || state === 'pending'}
        className="mt-4 w-full h-16 rounded-2xl bg-gradient-to-r from-gold via-yellow-300 to-gold text-black font-display text-2xl tracking-widest disabled:opacity-50 disabled:from-zinc-700 disabled:via-zinc-700 disabled:to-zinc-700 disabled:text-zinc-400"
      >
        {t('flash.play_button', { price: TICKET_PRICE.toLocaleString('fr-FR') })}
      </motion.button>

      {/* Mes tickets accordion */}
      <div className="mt-4 rounded-2xl bg-zinc-900/70 border border-zinc-800 overflow-hidden">
        <button
          onClick={() => setShowTickets((v) => !v)}
          className="w-full flex items-center justify-between p-4"
        >
          <div className="text-xs uppercase tracking-widest text-zinc-400">
            {t('flash.my_tickets', { count: tickets.length })}
          </div>
          {showTickets ? (
            <ChevronUp className="w-4 h-4 text-zinc-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-400" />
          )}
        </button>
        <AnimatePresence initial={false}>
          {showTickets && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-2">
                {tickets.length === 0 && (
                  <div className="text-sm text-zinc-500">{t('flash.no_tickets')}</div>
                )}
                {tickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    className="rounded-xl bg-zinc-950 border border-zinc-800 p-3"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[10px] text-zinc-500">
                        {new Date(ticket.created_at).toLocaleString('fr-FR')}
                      </div>
                      <StatusBadge status={ticket.status} />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {ticket.numeros.map((n) => (
                        <Ball key={n} n={n} variant="gold" small />
                      ))}
                    </div>
                    {ticket.jackpot_en_attente && (
                      <div className="mt-2 text-[10px] text-zinc-400">
                        {t('flash.jackpot_pending_note', { amount: FLASH_SEUIL.toLocaleString('fr-FR') })}
                      </div>
                    )}
                    {ticket.gains_cdf > 0 && !ticket.jackpot_en_attente && (
                      <div className="mt-2 text-sm text-congogreen font-semibold">
                        + {ticket.gains_cdf.toLocaleString('fr-FR')} CDF
                      </div>
                    )}
                    {ticket.status !== 'pending' && !ticket.jackpot_en_attente && (
                      <div className="mt-1 text-[10px] text-zinc-500">
                        {t('flash.correct_numbers', { count: ticket.nb_bons })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Ball({
  n,
  variant,
  small,
}: {
  n: number;
  variant: 'gold' | 'green';
  small?: boolean;
}) {
  const size = small ? 'w-7 h-7 text-sm' : 'w-10 h-10 text-lg';
  const color =
    variant === 'gold'
      ? 'bg-gradient-to-br from-yellow-300 to-gold text-black shadow-[0_0_10px_rgba(255,215,0,0.4)]'
      : 'bg-gradient-to-br from-emerald-400 to-congogreen text-white shadow-[0_0_10px_rgba(0,168,107,0.4)]';
  return (
    <div
      className={`${size} ${color} rounded-full flex items-center justify-center font-display`}
    >
      {n}
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: 'pending' | 'gagnant' | 'perdant' | 'jackpot_attente';
}) {
  const map = {
    pending: 'bg-yellow-500/15 border-yellow-500/30 text-yellow-300',
    gagnant: 'bg-congogreen/15 border-congogreen/30 text-congogreen',
    perdant: 'bg-zinc-700/30 border-zinc-700 text-zinc-400',
    jackpot_attente: 'bg-orange-500/15 border-orange-500/40 text-orange-300',
  } as const;
  const { t } = useTranslation();
  const label = {
    pending: t('flash.status_pending'),
    gagnant: t('flash.status_winner'),
    perdant: t('flash.status_loser'),
    jackpot_attente: t('flash.status_jackpot'),
  }[status];
  return (
    <span
      className={`text-[10px] uppercase tracking-widest font-semibold px-2 py-1 rounded-full border ${map[status]}`}
    >
      {label}
    </span>
  );
}
