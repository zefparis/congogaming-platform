// OkapiColorScreen — page joueur mobile avec états live
// Réécrit pour utiliser /api/okapi-color/live + /api/okapi-color/my-current-tickets
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Shuffle, Trash2, Loader2 } from 'lucide-react';
import { getSession, refreshBalance } from '../lib/auth';
import { api } from '../lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type BuyState = 'idle' | 'pending' | 'success' | 'error';
type DrawStatus = 'open' | 'closing' | 'drawing' | 'result';

interface LiveData {
  enabled: boolean;
  serverTime: string;
  ticketPriceCdf: number;
  jackpotCdf: number;
  jackpotThresholdCdf: number;
  drawIntervalSeconds: number;
  currentDraw: { slotKey: string; status: DrawStatus; drawAt: string; closeAt: string; secondsRemaining: number };
  lastDraw: {
    drawNumber: number | null; slotKey: string | null;
    numerosRouges: number[]; numerosOr: number[];
    drawnAt: string; jackpotPaye: boolean;
    winnerCount: number; totalPaidCdf: number;
    winners: Array<{ ticketRef: string; nbRouges: number; nbOr: number; gainsCdf: number }>;
  } | null;
  recentDraws: Array<{ drawNumber: number | null; slotKey: string | null; numerosRouges: number[]; numerosOr: number[]; drawnAt: string }>;
  publicStats: { ticketsCount: number; winnerCount: number; totalPaidCdf: number };
}

interface MyTicket {
  ticket_code: string; id: string; numeros: number[];
  status: 'pending' | 'gagnant' | 'perdant' | 'cancelled' | 'jackpot_attente';
  nb_rouges: number; nb_or: number; gains_cdf: number; jackpot_en_attente: boolean;
  slot_key: string; draw_at: string | null; created_at: string;
}

const PAYOUT_TABLE = [
  { label: '6 rouges',          gain: '250 000 CDF — JACKPOT' },
  { label: '5 rouges + 1+ or',  gain: '50 000 CDF' },
  { label: '5 rouges',          gain: '25 000 CDF' },
  { label: '4 rouges + 2+ or',  gain: '15 000 CDF' },
  { label: '4 rouges',          gain: '8 000 CDF' },
  { label: '3 rouges + 3+ or',  gain: '5 000 CDF' },
  { label: '3 rouges + 1-2 or', gain: '2 500 CDF' },
  { label: '3 rouges',          gain: '1 500 CDF' },
  { label: '2 rouges + 2+ or',  gain: '1 000 CDF' },
  { label: '2 rouges + 1 or',   gain: '500 CDF' },
  { label: '2 rouges',          gain: '500 CDF' },
];

// ---------------------------------------------------------------------------
// Ball component (shared by grid + animation)
// ---------------------------------------------------------------------------
function Ball({ n, color, size = 'md', animated = false }: {
  n: number; color: 'red' | 'gold'; size?: 'sm' | 'md' | 'lg'; animated?: boolean;
}) {
  const dims = size === 'sm' ? 'w-8 h-8 text-sm' : size === 'lg' ? 'w-14 h-14 text-2xl' : 'w-10 h-10 text-base';
  const style: React.CSSProperties = color === 'red'
    ? { background: 'linear-gradient(135deg,#b91c1c,#ef4444)', boxShadow: '0 0 10px rgba(239,68,68,0.5)', color: '#fff' }
    : { background: 'linear-gradient(135deg,#d97706,#fbbf24)', boxShadow: '0 0 10px rgba(251,191,36,0.4)', color: '#000' };
  const inner = <div className={`${dims} rounded-full flex items-center justify-center font-display shrink-0`} style={style}>{n}</div>;
  if (!animated) return inner;
  return (
    <motion.div initial={{ scale: 0, opacity: 0, y: -20 }} animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 18 }}>
      {inner}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------
type TicketStatus = 'pending' | 'gagnant' | 'perdant' | 'cancelled' | 'jackpot_attente';
const STATUS_STYLE: Record<TicketStatus, string> = {
  pending:        'bg-yellow-500/15 border-yellow-500/30 text-yellow-300',
  gagnant:        'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
  perdant:        'bg-zinc-700/30 border-zinc-700 text-zinc-500',
  cancelled:      'bg-zinc-700/30 border-zinc-700 text-zinc-500',
  jackpot_attente:'bg-red-500/15 border-red-500/40 text-red-400',
};
const STATUS_LABEL: Record<TicketStatus, string> = {
  pending: 'En attente', gagnant: 'Gagnant ✓', perdant: 'Perdant',
  cancelled: 'Annulé', jackpot_attente: '🔴 Jackpot',
};
function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`text-[10px] uppercase tracking-widest font-semibold px-2 py-1 rounded-full border ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Ticket card
// ---------------------------------------------------------------------------
function TicketCard({ t }: { t: MyTicket }) {
  return (
    <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono text-zinc-500">#{t.ticket_code}</span>
        <StatusBadge status={t.status} />
      </div>
      <div className="flex flex-wrap gap-1 mb-2">
        {t.numeros.map((n: number) => <Ball key={n} n={n} color="red" size="sm" />)}
      </div>
      {t.status !== 'pending' && t.status !== 'cancelled' && !t.jackpot_en_attente && (
        <div className="flex items-center gap-2 mt-1 text-[11px]">
          <span className="text-red-400">{t.nb_rouges}🔴</span>
          <span style={{ color: '#fbbf24' }}>{t.nb_or}🟡</span>
          {t.gains_cdf > 0 && <span className="ml-auto text-emerald-400 font-semibold">+{t.gains_cdf.toLocaleString('fr-FR')} CDF</span>}
        </div>
      )}
      {t.jackpot_en_attente && <p className="text-[10px] text-red-400 mt-1">6 rouges ! Jackpot en attente de pot suffisant.</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function OkapiColorScreen() {
  const nav     = useNavigate();
  const session = getSession();

  // Live data
  const [live,       setLive]       = useState<LiveData | null>(null);
  const [secs,       setSecs]       = useState(0);
  const [myTickets,  setMyTickets]  = useState<MyTicket[]>([]);
  const [balance,    setBalance]    = useState<number>(session?.balance_cdf ?? 0);

  // Buy flow
  const [selected,   setSelected]   = useState<number[]>([]);
  const [buyState,   setBuyState]   = useState<BuyState>('idle');
  const [buyMsg,     setBuyMsg]     = useState('');

  // UI
  const [showPayouts, setShowPayouts] = useState(false);

  // Ball animation
  const [revRed,  setRevRed]  = useState<number[]>([]);
  const [revGold, setRevGold] = useState<number[]>([]);
  const prevSlotRef  = useRef('');
  const prevStateRef = useRef<DrawStatus | ''>('');
  const prevStatusForNotifRef = useRef<DrawStatus | ''>('');

  const [showBetsOpen, setShowBetsOpen] = useState(false);

  const grid = useMemo(() => Array.from({ length: 24 }, (_, i) => i + 1), []);

  // Debug mount
  useEffect(() => {
    console.log('[OkapiColor] mounted');
    console.log('[OkapiColor] live endpoint = /api/okapi-color/live');
  }, []);

  // Poll live data every 2s
  useEffect(() => {
    const fetch_ = () => {
      api.okapiColorLive()
        .then((d) => { setLive(d); setSecs(d.currentDraw.secondsRemaining); })
        .catch(() => {});
    };
    fetch_();
    const id = setInterval(fetch_, 2000);
    return () => clearInterval(id);
  }, []);

  // Local countdown tick
  useEffect(() => {
    const id = setInterval(() => setSecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  // Poll my tickets every 4s
  useEffect(() => {
    if (!session) return;
    const fetch_ = () => {
      api.okapiColorMyCurrentTickets().then((r) => setMyTickets(r.tickets)).catch(() => {});
    };
    fetch_();
    const id = setInterval(fetch_, 4000);
    return () => clearInterval(id);
  }, [session?.id]);

  // Balance
  useEffect(() => {
    if (!session) return;
    refreshBalance(session.id).then(setBalance).catch(() => {});
    const id = setInterval(() => refreshBalance(session.id).then(setBalance).catch(() => {}), 30_000);
    return () => clearInterval(id);
  }, [session?.id]);

  // Notify when betting reopens (result → open) or already open on mount
  useEffect(() => {
    if (!live) return;
    const st = live.currentDraw.status;
    // Show notification if transition result → open OR if already open on first load
    if ((prevStatusForNotifRef.current === 'result' && st === 'open') || (prevStatusForNotifRef.current === '' && st === 'open')) {
      setShowBetsOpen(true);
      const t = setTimeout(() => setShowBetsOpen(false), 7000);
      prevStatusForNotifRef.current = st;
      return () => clearTimeout(t);
    }
    prevStatusForNotifRef.current = st;
  }, [live?.currentDraw.status]);

  // Ball reveal animation on DRAWING
  useEffect(() => {
    if (!live) return;
    const st     = live.currentDraw.status;
    const slotKey = live.lastDraw?.slotKey ?? live.currentDraw.slotKey;

    if (st !== 'drawing') {
      if (prevStateRef.current === 'drawing') { setRevRed([]); setRevGold([]); }
      prevStateRef.current = st;
      return;
    }
    if (slotKey === prevSlotRef.current) return;
    prevSlotRef.current  = slotKey;
    prevStateRef.current = 'drawing';

    const rouges = live.lastDraw?.numerosRouges ?? [];
    const ors    = live.lastDraw?.numerosOr    ?? [];
    setRevRed([]); setRevGold([]);

    const ts: ReturnType<typeof setTimeout>[] = [];
    rouges.forEach((n, i) => ts.push(setTimeout(() => setRevRed((p) => [...p, n]),  600 + i * 1600)));
    ors.forEach(   (n, i) => ts.push(setTimeout(() => setRevGold((p) => [...p, n]), 600 + rouges.length * 1600 + 600 + i * 1600)));
    return () => ts.forEach(clearTimeout);
  }, [live?.currentDraw.status, live?.lastDraw?.slotKey]);

  const status     = live?.currentDraw.status ?? 'open';
  const isBlocked  = status === 'closing' || status === 'drawing';
  const isFull     = selected.length === 6;
  const jackpot    = live?.jackpotCdf ?? 0;
  const threshold  = live?.jackpotThresholdCdf ?? 250_000;
  const price      = live?.ticketPriceCdf ?? 1000;
  const intervalMin = Math.round((live?.drawIntervalSeconds ?? 600) / 60);
  const minStr     = String(Math.floor(secs / 60)).padStart(2, '0');
  const secStr     = String(secs % 60).padStart(2, '0');

  const toggle = (n: number) => {
    if (isBlocked) return;
    setSelected((p) => p.includes(n) ? p.filter((x) => x !== n) : p.length >= 6 ? p : [...p, n].sort((a, b) => a - b));
    if (buyState !== 'idle') { setBuyState('idle'); setBuyMsg(''); }
  };

  const quickPick = () => {
    const s = new Set<number>();
    while (s.size < 6) s.add(Math.floor(Math.random() * 24) + 1);
    setSelected(Array.from(s).sort((a, b) => a - b));
    setBuyState('idle'); setBuyMsg('');
  };

  const submit = async () => {
    if (!session || !isFull || buyState === 'pending' || isBlocked) return;
    setBuyState('pending'); setBuyMsg('');
    try {
      await api.okapiColorBuyTicket(selected);
      setBuyState('success'); setBuyMsg('Ticket enregistré !');
      setSelected([]);
      const newBal = await refreshBalance(session.id);
      setBalance(newBal);
      api.okapiColorMyCurrentTickets().then((r) => setMyTickets(r.tickets)).catch(() => {});
    } catch (e: any) {
      setBuyState('error'); setBuyMsg(e.message || 'Erreur');
    }
  };

  const statusColor = status === 'open' ? '#00A86B' : status === 'closing' ? '#ef4444' : status === 'drawing' ? '#fbbf24' : '#9CA3AF';
  const statusLabel = { open: '● EN DIRECT', closing: '● FERMETURE', drawing: '● TIRAGE', result: '● RÉSULTATS' }[status];

  // During result: approximate time until betting reopens (7.5 min = 450s before draw)
  const secsUntilOpen = status === 'result' && secs > 450 ? secs - 450 : 0;
  const openMinStr = String(Math.floor(secsUntilOpen / 60)).padStart(2, '0');
  const openSecStr = String(secsUntilOpen % 60).padStart(2, '0');

  return (
    <div className="min-h-screen pb-28" style={{ background: '#060606', color: '#fff' }}>

      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-zinc-900">
        <button onClick={() => nav('/')} className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center">
          <ArrowLeft className="w-5 h-5 text-zinc-300" />
        </button>
        <div>
          <div className="font-display text-lg tracking-widest leading-none" style={{ color: '#FFD700' }}>OKAPI COLOR</div>
          <div className="text-[10px] text-zinc-500 mt-0.5">Tirage live toutes les {intervalMin} min</div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => window.open('/tv/okapi-color', '_blank')}
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ color: statusColor, background: 'rgba(255,255,255,0.06)', border: `1px solid ${statusColor}44` }}
          >
            {statusLabel}
          </button>
          <div className="text-right">
            <div className="text-[10px] text-zinc-500">Solde</div>
            <div className="text-sm font-bold" style={{ color: '#FFD700' }}>{balance.toLocaleString('fr-FR')} CDF</div>
          </div>
        </div>
      </header>

      {/* Betting-opens notification */}
      <AnimatePresence>
        {showBetsOpen && (
          <motion.div
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            className="mx-4 mt-3 rounded-2xl p-3 flex items-center justify-between"
            style={{ background: 'rgba(0,168,107,0.15)', border: '1px solid rgba(0,168,107,0.4)' }}
          >
            <motion.div
              animate={{ scale: [1, 1.02, 1], opacity: [1, 0.85, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="font-display tracking-widest text-sm"
              style={{ color: '#00A86B' }}
            >
              ✅ PARIS OUVERTS — JOUEZ MAINTENANT !
            </motion.div>
            <button onClick={() => setShowBetsOpen(false)} className="text-zinc-500 text-lg leading-none ml-3">×</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Jackpot banner */}
      <div className="mx-4 mt-4 rounded-2xl border px-4 py-3" style={{
        background: jackpot >= threshold ? 'rgba(239,68,68,0.1)' : 'rgba(30,20,5,0.9)',
        borderColor: jackpot >= threshold ? 'rgba(239,68,68,0.4)' : 'rgba(255,140,0,0.2)',
      }}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">Jackpot</span>
          {jackpot >= threshold && <span className="text-[10px] text-red-400 font-bold animate-pulse">DISPONIBLE !</span>}
        </div>
        <div className="font-display text-3xl mt-0.5" style={{ color: jackpot >= threshold ? '#ff5555' : '#FFD700' }}>
          {threshold.toLocaleString('fr-FR')} CDF
        </div>
        {jackpot < threshold && (
          <div className="mt-2 w-full h-1 rounded-full bg-zinc-800">
            <div className="h-1 rounded-full" style={{ width: `${Math.min((jackpot / threshold) * 100, 100)}%`, background: 'linear-gradient(90deg,#c0392b,#e74c3c)' }} />
          </div>
        )}
      </div>

      {/* VOIR LE LIVE CTA — always visible, opens TV screen in new window */}
      <div className="mx-4 mt-3 flex">
        <button
          onClick={() => window.open('/tv/okapi-color', '_blank')}
          className="flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-bold tracking-wide"
          style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#ef4444' }}
        >
          <span>📺</span> VOIR LE TIRAGE LIVE
        </button>
      </div>

      {/* State-aware main section */}
      <div id="live">
      <AnimatePresence mode="wait">

        {/* ── OPEN / CLOSING : selection grid ── */}
        {(status === 'open' || status === 'closing') && (
          <motion.div key="open" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

            {/* Countdown */}
            <div className="mx-4 mt-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 p-4 text-center">
              {status === 'closing' ? (
                <motion.div animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 0.7, repeat: Infinity }}
                  className="font-display text-xl text-red-400 tracking-widest">
                  ⚠ PARIS FERMÉS — TIRAGE IMMINENT
                </motion.div>
              ) : (
                <>
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Prochain tirage dans</div>
                  <div className="font-display text-5xl tracking-wider" style={{ color: secs < 60 ? '#ef4444' : '#fff' }}>
                    {minStr}:{secStr}
                  </div>
                  <div className="text-[10px] text-zinc-600 mt-1">
                    Votre ticket jouera le prochain tirage ({live?.publicStats.ticketsCount ?? 0} ticket{(live?.publicStats.ticketsCount ?? 0) !== 1 ? 's' : ''} joués)
                  </div>
                </>
              )}
            </div>

            {/* Number grid */}
            <div className="mx-4 mt-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] uppercase tracking-widest text-zinc-500">Choisis 6 numéros (1–24)</span>
                <span className="font-display text-lg" style={{ color: '#FFD700' }}>{selected.length}/6</span>
              </div>
              <div className="grid grid-cols-6 gap-1.5">
                {grid.map((n) => {
                  const on = selected.includes(n);
                  return (
                    <motion.button key={n} whileTap={{ scale: 0.88 }} onClick={() => toggle(n)} disabled={isBlocked}
                      className={`h-11 rounded-xl font-display text-base transition-all disabled:opacity-30 ${on ? 'text-white' : 'bg-zinc-900 border border-zinc-700 text-zinc-400'}`}
                      style={on ? { background: 'linear-gradient(135deg,#b91c1c,#ef4444)', boxShadow: '0 0 12px rgba(239,68,68,0.5)' } : undefined}>
                      {n}
                    </motion.button>
                  );
                })}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <motion.button whileTap={{ scale: 0.97 }} onClick={quickPick} disabled={isBlocked}
                  className="h-11 rounded-xl bg-zinc-800 border border-zinc-700 text-sm font-semibold flex items-center justify-center gap-2 text-zinc-200 disabled:opacity-40">
                  <Shuffle className="w-4 h-4" /> QUICK PICK
                </motion.button>
                <motion.button whileTap={{ scale: 0.97 }} onClick={() => { setSelected([]); setBuyState('idle'); }} disabled={selected.length === 0}
                  className="h-11 rounded-xl bg-zinc-800 border border-zinc-700 text-sm font-semibold flex items-center justify-center gap-2 text-zinc-200 disabled:opacity-40">
                  <Trash2 className="w-4 h-4" /> EFFACER
                </motion.button>
              </div>
            </div>

            {/* Buy button + feedback */}
            <div className="mx-4 mt-3">
              {buyState === 'success' && (
                <div className="mb-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm">{buyMsg}</div>
              )}
              {buyState === 'error' && (
                <div className="mb-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{buyMsg}</div>
              )}
              <motion.button whileTap={{ scale: 0.97 }} onClick={submit}
                disabled={!isFull || buyState === 'pending' || isBlocked}
                className="w-full h-14 rounded-2xl font-display text-xl tracking-widest text-white flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                style={isFull && !isBlocked && buyState !== 'pending'
                  ? { background: 'linear-gradient(135deg,#b91c1c,#ef4444)', boxShadow: '0 0 20px rgba(239,68,68,0.35)' }
                  : { background: '#27272a' }}>
                {buyState === 'pending' ? <Loader2 className="w-5 h-5 animate-spin" /> : `JOUER — ${price.toLocaleString('fr-FR')} CDF`}
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ── DRAWING : ball animation ── */}
        {status === 'drawing' && (
          <motion.div key="drawing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="mx-4 mt-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 p-5">
            <div className="text-center font-display text-xl tracking-widest mb-5" style={{ color: '#fbbf24' }}>
              🎯 TIRAGE EN DIRECT
            </div>
            <div className="mb-4">
              <div className="text-[10px] uppercase tracking-widest text-red-400 mb-2">Rouges</div>
              <div className="flex flex-wrap gap-2">
                {(live?.lastDraw?.numerosRouges ?? []).map((n) => revRed.includes(n) ? (
                  <Ball key={n} n={n} color="red" size="lg" animated />
                ) : (
                  <div key={n} className="w-14 h-14 rounded-full border-2 border-dashed border-zinc-700 opacity-30" />
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: '#fbbf24' }}>Or</div>
              <div className="flex flex-wrap gap-2">
                {(live?.lastDraw?.numerosOr ?? []).map((n) => revGold.includes(n) ? (
                  <Ball key={n} n={n} color="gold" size="lg" animated />
                ) : (
                  <div key={n} className="w-14 h-14 rounded-full border-2 border-dashed opacity-30" style={{ borderColor: 'rgba(251,191,36,0.3)' }} />
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── RESULT : show draw + player results ── */}
        {status === 'result' && live?.lastDraw && (
          <motion.div key="result" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mx-4 mt-4 space-y-3">
            {/* Draw numbers */}
            <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-4">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3">
                Résultats {live.lastDraw.drawNumber ? `— Tirage #${live.lastDraw.drawNumber}` : ''}
              </div>
              <div className="mb-3">
                <div className="text-[10px] uppercase tracking-widest text-red-400 mb-1.5">Rouges</div>
                <div className="flex flex-wrap gap-1.5">
                  {live.lastDraw.numerosRouges.map((n) => <Ball key={n} n={n} color="red" size="md" />)}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: '#fbbf24' }}>Or</div>
                <div className="flex flex-wrap gap-1.5">
                  {live.lastDraw.numerosOr.map((n) => <Ball key={n} n={n} color="gold" size="md" />)}
                </div>
              </div>
              <div className="flex gap-4 mt-3 pt-3 border-t border-zinc-800">
                <div>
                  <div className="text-[10px] text-zinc-500">Gagnants</div>
                  <div className="font-display text-lg">{live.lastDraw.winnerCount}</div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500">Distribué</div>
                  <div className="font-display text-lg text-emerald-400">{live.lastDraw.totalPaidCdf.toLocaleString('fr-FR')} CDF</div>
                </div>
                <div className="ml-auto text-right">
                  <div className="text-[10px] text-zinc-500">Prochain tirage</div>
                  <div className="font-display text-lg">{minStr}:{secStr}</div>
                  {secsUntilOpen > 0 && (
                    <div className="text-[10px] mt-0.5" style={{ color: '#fbbf24' }}>
                      Paris dans {openMinStr}:{openSecStr}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Player tickets for this slot */}
            {myTickets.length > 0 && (
              <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-4">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3">
                  Vos tickets ({myTickets.length})
                </div>
                <div className="space-y-2">
                  {myTickets.map((t) => <TicketCard key={t.id} t={t} />)}
                </div>
              </div>
            )}

            {/* Prepare next ticket CTA */}
            {session && (
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => {
                quickPick_(); void Promise.resolve();
              }}
                className="w-full h-14 rounded-2xl font-display text-xl tracking-widest text-white"
                style={{ background: 'linear-gradient(135deg,#b91c1c,#ef4444)', boxShadow: '0 0 16px rgba(239,68,68,0.3)' }}>
                PRÉPARER LE PROCHAIN TICKET →
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      </div>

      {/* Payout table */}
      <div className="mx-4 mt-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 overflow-hidden">
        <button onClick={() => setShowPayouts((v) => !v)} className="w-full flex items-center justify-between p-4">
          <span className="text-[10px] uppercase tracking-widest text-zinc-400">Table des gains</span>
          <span className="text-zinc-500 text-lg">{showPayouts ? '−' : '+'}</span>
        </button>
        <AnimatePresence initial={false}>
          {showPayouts && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
              <div className="px-4 pb-4 space-y-1.5">
                {PAYOUT_TABLE.map((row, i) => (
                  <div key={i} className="flex items-center justify-between bg-zinc-950 rounded-lg px-3 py-2">
                    <span className="text-xs text-zinc-400">{row.label}</span>
                    <span className="text-xs font-semibold" style={{ color: '#FFD700' }}>{row.gain}</span>
                  </div>
                ))}
                <p className="text-[10px] text-zinc-600 pt-1 text-center">Ticket {price.toLocaleString('fr-FR')} CDF — Taux de retour ~62 %</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* My tickets for current slot (outside RESULT) */}
      {status !== 'result' && myTickets.length > 0 && (
        <div className="mx-4 mt-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 p-4">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3">Vos tickets ce tirage ({myTickets.length})</div>
          <div className="space-y-2">
            {myTickets.map((t) => <TicketCard key={t.id} t={t} />)}
          </div>
        </div>
      )}

      {/* Recent draws history */}
      {live?.recentDraws && live.recentDraws.length > 0 && (
        <div className="mx-4 mt-4 mb-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 p-4">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3">
            Derniers tirages ({live.recentDraws.length})
          </div>
          <div className="space-y-2">
            {live.recentDraws.slice(0, 10).map((d, i) => (
              <div key={i} className="rounded-xl bg-zinc-950 border border-zinc-800 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono text-zinc-500">
                    {d.drawNumber ? `Tirage #${d.drawNumber}` : d.slotKey ?? '—'}
                  </span>
                  <span className="text-[10px] text-zinc-600">
                    {new Date(d.drawnAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {d.numerosRouges.map((n) => <Ball key={`r${n}`} n={n} color="red" size="sm" />)}
                </div>
                <div className="flex flex-wrap gap-1">
                  {d.numerosOr.map((n) => <Ball key={`g${n}`} n={n} color="gold" size="sm" />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  function quickPick_() {
    const s = new Set<number>();
    while (s.size < 6) s.add(Math.floor(Math.random() * 24) + 1);
    setSelected(Array.from(s).sort((a, b) => a - b));
    setBuyState('idle'); setBuyMsg('');
  }
}
