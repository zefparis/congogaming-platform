import { useEffect, useMemo, useState } from 'react';
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
import { getSession, refreshBalance } from '../lib/auth';
import { api } from '../lib/api';

type State = 'idle' | 'pending' | 'success' | 'error';

type Ticket = {
  id: string;
  numeros: number[];
  prix_cdf: number;
  status: 'pending' | 'gagnant' | 'perdant' | 'cancelled' | 'jackpot_attente';
  nb_rouges: number;
  nb_or: number;
  total_bons: number;
  gains_cdf: number;
  jackpot_en_attente: boolean;
  tirage_id: string | null;
  created_at: string;
  settled_at: string | null;
};

type Tirage = {
  id: string;
  numeros_rouges: number[];
  numeros_or: number[];
  drawn_at: string;
  jackpot_paye: boolean;
};

const PAYOUT_TABLE = [
  { label: '6 rouges',           gain: '250 000 CDF — JACKPOT' },
  { label: '5 rouges + 1+ or',   gain: '50 000 CDF' },
  { label: '5 rouges',           gain: '25 000 CDF' },
  { label: '4 rouges + 2+ or',   gain: '15 000 CDF' },
  { label: '4 rouges',           gain: '8 000 CDF' },
  { label: '3 rouges + 3+ or',   gain: '5 000 CDF' },
  { label: '3 rouges + 1-2 or',  gain: '2 500 CDF' },
  { label: '3 rouges',           gain: '1 500 CDF' },
  { label: '2 rouges + 2+ or',   gain: '1 000 CDF' },
  { label: '2 rouges + 1 or',    gain: '500 CDF' },
  { label: '2 rouges',           gain: '500 CDF' },
];

export default function OkapiColorScreen() {
  const nav     = useNavigate();
  const session = getSession();

  const [selected,     setSelected]     = useState<number[]>([]);
  const [state,        setState]        = useState<State>('idle');
  const [msg,          setMsg]          = useState('');
  const [playedNums,   setPlayedNums]   = useState<number[] | null>(null);

  const [latestTirage, setLatestTirage] = useState<Tirage | null>(null);
  const [potCdf,       setPotCdf]       = useState(0);
  const [jackpotCdf,   setJackpotCdf]   = useState(250_000);
  const [tickets,      setTickets]      = useState<Ticket[]>([]);
  const [showTickets,  setShowTickets]  = useState(false);
  const [showPayouts,  setShowPayouts]  = useState(false);
  const [balance,      setBalance]      = useState<number>(session?.balance_cdf ?? 0);
  const [ticketPrice,  setTicketPrice]  = useState(1000);

  const NUMBERS_RANGE = 24;

  const refresh = () => {
    api.okapiColorLatest().then((r) => {
      setLatestTirage(r.tirages?.[0] ?? null);
      setPotCdf(Number(r.pot_cdf || 0));
      if (r.config) {
        setTicketPrice(r.config.ticketPriceCdf);
        setJackpotCdf(r.config.jackpotCdf);
      }
    }).catch(() => {});
    if (session) {
      api.okapiColorHistory().then((r) => setTickets(r.tickets)).catch(() => {});
    }
  };

  useEffect(() => {
    refresh();
    if (session) refreshBalance(session.id).then(setBalance).catch(() => {});
    const balInterval = setInterval(() => {
      if (session) refreshBalance(session.id).then(setBalance).catch(() => {});
    }, 30_000);
    return () => clearInterval(balInterval);
  }, []);

  const isFull = selected.length === 6;

  const toggle = (n: number) => {
    setSelected((prev) => {
      if (prev.includes(n)) return prev.filter((x) => x !== n);
      if (prev.length >= 6) return prev;
      return [...prev, n].sort((a, b) => a - b);
    });
    if (state !== 'idle') { setState('idle'); setMsg(''); }
  };

  const quickPick = () => {
    const set = new Set<number>();
    while (set.size < 6) set.add(Math.floor(Math.random() * NUMBERS_RANGE) + 1);
    setSelected(Array.from(set).sort((a, b) => a - b));
    setState('idle'); setMsg('');
  };

  const clearSel = () => {
    setSelected([]); setState('idle'); setMsg(''); setPlayedNums(null);
  };

  const submit = async () => {
    if (!session || !isFull || state === 'pending') return;
    setState('pending');
    setMsg('Validation du ticket…');
    try {
      await api.okapiColorBuyTicket(selected);
      setState('success');
      setMsg('Ticket enregistré !');
      setPlayedNums(selected);
      setSelected([]);
      const newBal = await refreshBalance(session.id);
      setBalance(newBal);
      api.okapiColorHistory().then((r) => setTickets(r.tickets)).catch(() => {});
    } catch (e: any) {
      setState('error');
      setMsg(e.message || 'Erreur');
    }
  };

  const grid = useMemo(() => Array.from({ length: NUMBERS_RANGE }, (_, i) => i + 1), []);

  return (
    <div className="min-h-screen p-4 pb-28">

      {/* Header */}
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
          onClick={() => nav(session ? '/home' : '/')}
        />
        <div className="ml-auto text-right">
          <h1 className="font-display text-xl text-gold tracking-wider leading-none">OKAPI COLOR</h1>
          <p className="text-[10px] text-zinc-400 mt-0.5">Les rouges paient plus.</p>
        </div>
      </header>

      {/* Balance */}
      <div className="mt-3 text-center text-sm font-semibold" style={{ color: '#f0d060' }}>
        💰 Solde : {balance.toLocaleString('fr-FR')} CDF
      </div>

      {/* Jackpot banner */}
      <div className="mt-3 rounded-2xl border p-4"
        style={{ background: potCdf >= jackpotCdf ? 'rgba(255,60,60,0.12)' : 'rgba(30,20,5,0.8)', borderColor: potCdf >= jackpotCdf ? 'rgba(255,80,80,0.4)' : 'rgba(255,140,0,0.25)' }}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-widest text-zinc-500">Jackpot</span>
          {potCdf >= jackpotCdf && (
            <span className="text-[10px] uppercase tracking-widest text-red-400 font-bold animate-pulse">Disponible !</span>
          )}
        </div>
        <div
          className="font-display text-3xl mt-1 tracking-wider"
          style={{ color: potCdf >= jackpotCdf ? '#ff5555' : '#FFD700' }}
        >
          {potCdf.toLocaleString('fr-FR')} CDF
        </div>
        {potCdf < jackpotCdf && (
          <div className="mt-2">
            <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
              <span>Progression</span>
              <span>{Math.round((potCdf / jackpotCdf) * 100)}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full" style={{ background: '#333' }}>
              <div
                className="h-1.5 rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min((potCdf / jackpotCdf) * 100, 100)}%`,
                  background: 'linear-gradient(90deg,#c0392b,#e74c3c)',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Dernier tirage */}
      {latestTirage && (
        <div className="mt-3 rounded-2xl bg-zinc-900/70 border border-zinc-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-widest text-zinc-500">Dernier tirage</span>
            <span className="text-[10px] text-zinc-500">
              {new Date(latestTirage.drawn_at).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
            </span>
          </div>
          <div className="flex items-start gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-red-400 mb-1">Rouges</p>
              <div className="flex flex-wrap gap-1">
                {latestTirage.numeros_rouges.map((n) => (
                  <Ball key={n} n={n} color="red" />
                ))}
              </div>
            </div>
            <div className="w-px self-stretch bg-zinc-800" />
            <div>
              <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: '#FFD700' }}>Ors</p>
              <div className="flex flex-wrap gap-1">
                {latestTirage.numeros_or.map((n) => (
                  <Ball key={n} n={n} color="gold" />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sélection */}
      <div className="mt-4 rounded-2xl bg-zinc-900/70 border border-zinc-800 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs uppercase tracking-widest text-zinc-500">Choisis 6 numéros (1-24)</span>
          <span className="font-display text-xl text-gold">{selected.length}/6</span>
        </div>

        <div className="grid grid-cols-6 gap-1.5">
          {grid.map((n) => {
            const on = selected.includes(n);
            return (
              <motion.button
                key={n}
                whileTap={{ scale: 0.88 }}
                onClick={() => toggle(n)}
                className={`h-12 rounded-xl font-display text-lg transition-all ${
                  on
                    ? 'text-white font-bold shadow-[0_0_14px_rgba(220,38,38,0.6)]'
                    : 'bg-zinc-900 border border-zinc-700 text-zinc-300'
                }`}
                style={on ? { background: 'linear-gradient(135deg,#b91c1c,#ef4444)' } : undefined}
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
            className="h-11 rounded-xl bg-zinc-800 border border-zinc-700 text-sm font-semibold flex items-center justify-center gap-2 text-zinc-200"
          >
            <Shuffle className="w-4 h-4" /> QUICK PICK
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={clearSel}
            disabled={selected.length === 0}
            className="h-11 rounded-xl bg-zinc-800 border border-zinc-700 text-sm font-semibold flex items-center justify-center gap-2 text-zinc-200 disabled:opacity-40"
          >
            <Trash2 className="w-4 h-4" /> EFFACER
          </motion.button>
        </div>
      </div>

      {/* Message état */}
      <AnimatePresence>
        {state !== 'idle' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`mt-4 p-3 rounded-xl border flex items-start gap-2 ${
              state === 'pending'
                ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300'
                : state === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}
          >
            {state === 'pending' && <Loader2 className="w-5 h-5 animate-spin shrink-0 mt-0.5" />}
            {state === 'success' && <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />}
            {state === 'error'   && <XCircle className="w-5 h-5 shrink-0 mt-0.5" />}
            <div className="text-sm">
              <div>{msg}</div>
              {state === 'success' && playedNums && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {playedNums.map((n) => <Ball key={n} n={n} color="red" small />)}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bouton jouer */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={submit}
        disabled={!isFull || state === 'pending'}
        className="mt-4 w-full h-16 rounded-2xl font-display text-2xl tracking-widest text-white disabled:opacity-40 disabled:cursor-not-allowed"
        style={isFull && state !== 'pending'
          ? { background: 'linear-gradient(135deg,#b91c1c,#ef4444,#b91c1c)', boxShadow: '0 0 20px rgba(239,68,68,0.4)' }
          : { background: '#27272a' }
        }
      >
        JOUER — {ticketPrice.toLocaleString('fr-FR')} CDF
      </motion.button>

      {/* Table des gains (accordéon) */}
      <div className="mt-4 rounded-2xl bg-zinc-900/70 border border-zinc-800 overflow-hidden">
        <button
          onClick={() => setShowPayouts((v) => !v)}
          className="w-full flex items-center justify-between p-4"
        >
          <span className="text-xs uppercase tracking-widest text-zinc-400 flex items-center gap-2">
            <Zap className="w-3 h-3 text-gold" /> Table des gains
          </span>
          {showPayouts ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
        </button>
        <AnimatePresence initial={false}>
          {showPayouts && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-1.5">
                {PAYOUT_TABLE.map((row, i) => (
                  <div key={i} className="flex items-center justify-between bg-zinc-950 rounded-lg px-3 py-2">
                    <span className="text-xs text-zinc-400">{row.label}</span>
                    <span className="text-xs font-semibold text-gold">{row.gain}</span>
                  </div>
                ))}
                <p className="text-[10px] text-zinc-600 pt-1 text-center">Ticket 1 000 CDF — Taux de retour ~62 %</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Mes tickets (accordéon) */}
      <div className="mt-4 rounded-2xl bg-zinc-900/70 border border-zinc-800 overflow-hidden">
        <button
          onClick={() => setShowTickets((v) => !v)}
          className="w-full flex items-center justify-between p-4"
        >
          <span className="text-xs uppercase tracking-widest text-zinc-400">
            Mes tickets ({tickets.length})
          </span>
          {showTickets ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
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
              <div className="px-4 pb-4 space-y-3">
                {tickets.length === 0 && (
                  <p className="text-sm text-zinc-500">Aucun ticket pour le moment.</p>
                )}
                {tickets.map((t) => (
                  <TicketCard key={t.id} ticket={t} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ===========================================================
// Sub-components
// ===========================================================
function Ball({ n, color, small }: { n: number; color: 'red' | 'gold'; small?: boolean }) {
  const size = small ? 'w-7 h-7 text-sm' : 'w-9 h-9 text-base';
  const style: React.CSSProperties = color === 'red'
    ? { background: 'linear-gradient(135deg,#b91c1c,#ef4444)', boxShadow: '0 0 8px rgba(239,68,68,0.5)', color: '#fff' }
    : { background: 'linear-gradient(135deg,#d97706,#fbbf24)', boxShadow: '0 0 8px rgba(251,191,36,0.4)', color: '#000' };
  return (
    <div className={`${size} rounded-full flex items-center justify-center font-display`} style={style}>
      {n}
    </div>
  );
}

function StatusBadge({ status }: { status: Ticket['status'] }) {
  const map: Record<Ticket['status'], string> = {
    pending:        'bg-yellow-500/15 border-yellow-500/30 text-yellow-300',
    gagnant:        'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
    perdant:        'bg-zinc-700/30 border-zinc-700 text-zinc-500',
    cancelled:      'bg-zinc-700/30 border-zinc-700 text-zinc-500',
    jackpot_attente:'bg-red-500/15 border-red-500/40 text-red-400',
  };
  const label: Record<Ticket['status'], string> = {
    pending:        'En attente',
    gagnant:        'Gagnant',
    perdant:        'Perdant',
    cancelled:      'Annulé',
    jackpot_attente:'🔴 Jackpot en attente',
  };
  return (
    <span className={`text-[10px] uppercase tracking-widest font-semibold px-2 py-1 rounded-full border ${map[status]}`}>
      {label[status]}
    </span>
  );
}

function TicketCard({ ticket }: { ticket: Ticket }) {
  return (
    <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-zinc-500">
          {new Date(ticket.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </span>
        <StatusBadge status={ticket.status} />
      </div>

      {/* Numéros joués */}
      <div className="flex flex-wrap gap-1 mb-2">
        {ticket.numeros.map((n) => (
          <Ball key={n} n={n} color="red" small />
        ))}
      </div>

      {/* Résultat si settled */}
      {ticket.status !== 'pending' && ticket.status !== 'cancelled' && !ticket.jackpot_en_attente && (
        <div className="flex items-center gap-3 mt-1">
          <span className="text-[10px] text-red-400">{ticket.nb_rouges} rouge{ticket.nb_rouges !== 1 ? 's' : ''}</span>
          <span className="text-[10px]" style={{ color: '#fbbf24' }}>{ticket.nb_or} or{ticket.nb_or !== 1 ? 's' : ''}</span>
          {ticket.gains_cdf > 0 && (
            <span className="text-sm font-semibold text-emerald-400 ml-auto">
              +{ticket.gains_cdf.toLocaleString('fr-FR')} CDF
            </span>
          )}
        </div>
      )}
      {ticket.jackpot_en_attente && (
        <p className="text-[10px] text-red-400 mt-1">6 rouges ! Paiement dès que le pot est suffisant.</p>
      )}
    </div>
  );
}
