import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type DrawState = 'open' | 'closing' | 'drawing' | 'result';

interface Winner {
  ticketRef: string;
  nbRouges: number;
  nbOr: number;
  gainsCdf: number;
}

interface LastDraw {
  drawNumber: number | null;
  slotKey: string | null;
  numerosRouges: number[];
  numerosOr: number[];
  drawnAt: string;
  jackpotPaye: boolean;
  winnerCount: number;
  totalPaidCdf: number;
  winners: Winner[];
}

interface LiveData {
  enabled: boolean;
  serverTime: string;
  ticketPriceCdf: number;
  jackpotCdf: number;
  jackpotThresholdCdf: number;
  drawIntervalSeconds: number;
  currentDraw: {
    slotKey: string;
    status: DrawState;
    drawAt: string;
    closeAt: string;
    secondsRemaining: number;
  };
  lastDraw: LastDraw | null;
  publicStats: { ticketsCount: number; winnerCount: number; totalPaidCdf: number };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const BASE_URL = import.meta.env.VITE_API_URL || '';

function buildPlayUrl(): string {
  if (typeof window === 'undefined') return '/okapi-color';
  const params = new URLSearchParams(window.location.search);
  const locationId = params.get('location_id');
  const base = `${window.location.origin}/okapi-color`;
  return locationId ? `${base}?location_id=${encodeURIComponent(locationId)}` : base;
}

function buildQrUrl(playUrl: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(playUrl)}&bgcolor=0a0a0a&color=ffffff&qzone=1`;
}

const RED_GRADIENT  = 'linear-gradient(135deg,#b91c1c,#ef4444)';
const GOLD_GRADIENT = 'linear-gradient(135deg,#b45309,#fbbf24)';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function Ball({ n, color, visible, delay = 0 }: { n: number; color: 'red' | 'gold'; visible: boolean; delay?: number }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={`ball-${color}-${n}`}
          initial={{ scale: 0, opacity: 0, y: -30 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 20, delay }}
          style={{
            width: 'clamp(40px,10vw,90px)', height: 'clamp(40px,10vw,90px)',
            borderRadius: '50%',
            background: color === 'red' ? RED_GRADIENT : GOLD_GRADIENT,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Bebas Neue, sans-serif',
            fontSize: 'clamp(18px,5vw,42px)', color: color === 'gold' ? '#000' : '#fff',
            boxShadow: color === 'red'
              ? '0 0 24px rgba(239,68,68,0.7), 0 4px 16px rgba(0,0,0,0.5)'
              : '0 0 24px rgba(251,191,36,0.7), 0 4px 16px rgba(0,0,0,0.5)',
          }}
        >
          {n}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function BallPlaceholder({ color }: { color: 'red' | 'gold' }) {
  return (
    <div style={{
      width: 'clamp(40px,10vw,90px)', height: 'clamp(40px,10vw,90px)', borderRadius: '50%',
      background: color === 'red' ? 'rgba(239,68,68,0.1)' : 'rgba(251,191,36,0.1)',
      border: `2px dashed ${color === 'red' ? 'rgba(239,68,68,0.3)' : 'rgba(251,191,36,0.3)'}`,
    }} />
  );
}

function Countdown({ secs }: { secs: number }) {
  const m = String(Math.floor(secs / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(52px,17vw,140px)', lineHeight: 1, color: '#fff', textShadow: '0 0 40px rgba(255,255,255,0.3)' }}>
        {m}
      </span>
      <motion.span
        animate={{ opacity: [1, 0, 1] }}
        transition={{ duration: 1, repeat: Infinity }}
        style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(44px,14vw,120px)', color: '#ef4444', lineHeight: 1 }}
      >
        :
      </motion.span>
      <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(52px,17vw,140px)', lineHeight: 1, color: '#fff', textShadow: '0 0 40px rgba(255,255,255,0.3)' }}>
        {s}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// State screens
// ---------------------------------------------------------------------------
function OpenScreen({ live, secs, qrUrl, playUrl }: { live: LiveData; secs: number; qrUrl: string; playUrl: string }) {
  const isJackpotReady = live.jackpotCdf >= live.jackpotThresholdCdf;
  return (
    <motion.div
      key="open"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 'clamp(16px,3vw,32px)', padding: '0 clamp(16px,5vw,60px)' }}
    >
      {/* Countdown */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(13px,2.5vw,28px)', color: '#9CA3AF', letterSpacing: 6, marginBottom: 8 }}>
          PROCHAIN TIRAGE DANS
        </div>
        <Countdown secs={secs} />
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'clamp(20px,5vw,60px)', alignItems: 'flex-start', justifyContent: 'center' }}>
        {/* Jackpot */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(12px,2vw,22px)', color: '#9CA3AF', letterSpacing: 4 }}>JACKPOT</div>
          <motion.div
            animate={isJackpotReady ? { scale: [1, 1.06, 1], color: ['#ef4444', '#ff6666', '#ef4444'] } : {}}
            transition={{ duration: 1.5, repeat: Infinity }}
            style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(28px,6vw,64px)', color: isJackpotReady ? '#ef4444' : '#FFD700', lineHeight: 1 }}
          >
            {live.jackpotThresholdCdf.toLocaleString('fr-FR')} <span style={{ fontSize: 'clamp(14px,3vw,32px)' }}>CDF</span>
          </motion.div>
          {isJackpotReady && (
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(10px,1.6vw,18px)', color: '#ef4444', letterSpacing: 3, marginTop: 4 }}>
              🔴 JACKPOT DISPONIBLE !
            </div>
          )}
        </div>

        {/* QR code */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(12px,2vw,22px)', color: '#9CA3AF', letterSpacing: 4, marginBottom: 12 }}>SCANNE POUR JOUER</div>
          <img
            src={qrUrl}
            alt="QR code"
            style={{ width: 'clamp(100px,18vw,160px)', height: 'clamp(100px,18vw,160px)', borderRadius: 12, display: 'block' }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(8px,1vw,11px)', color: 'rgba(255,255,255,0.2)', marginTop: 8, letterSpacing: 1 }}>{playUrl}</div>
        </div>
      </div>

      {/* Payout hint */}
      <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(10px,1.8vw,22px)', color: 'rgba(255,255,255,0.3)', letterSpacing: 3, textAlign: 'center' }}>
        {`6 ROUGES = JACKPOT · 6 NUMÉROS À CHOISIR · TIRAGE LIVE TOUTES LES ${Math.round(live.drawIntervalSeconds / 60)} MIN`}
      </div>
    </motion.div>
  );
}

function ClosingScreen({ secs }: { secs: number }) {
  return (
    <motion.div
      key="closing"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 24 }}
    >
      <motion.div
        animate={{ scale: [1, 1.04, 1], opacity: [0.9, 1, 0.9] }}
        transition={{ duration: 0.8, repeat: Infinity }}
        style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(16px,3.5vw,36px)', color: '#ef4444', letterSpacing: 8, textAlign: 'center' }}
      >
        ⚠️ FERMETURE DES PARIS
      </motion.div>
      <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(32px,10vw,110px)', color: '#fff', lineHeight: 1, textAlign: 'center' }}>
        TIRAGE IMMINENT
      </div>
      <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(16px,3.5vw,36px)', color: '#9CA3AF', letterSpacing: 4 }}>
        DANS {secs} SECONDES
      </div>
    </motion.div>
  );
}

function DrawingScreen({ live, revealedRed, revealedGold }: { live: LiveData; revealedRed: number[]; revealedGold: number[] }) {
  const rouges = live.lastDraw?.numerosRouges ?? [];
  const ors    = live.lastDraw?.numerosOr    ?? [];
  const dn     = live.lastDraw?.drawNumber;

  return (
    <motion.div
      key="drawing"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 'clamp(20px,5vw,48px)', padding: '0 clamp(12px,3vw,40px)' }}
    >
      {dn && (
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(14px,2.5vw,28px)', color: '#9CA3AF', letterSpacing: 6 }}>
          TIRAGE #{dn}
        </div>
      )}

      {/* Boules rouges */}
      <div>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(12px,2vw,22px)', color: '#ef4444', letterSpacing: 6, textAlign: 'center', marginBottom: 'clamp(8px,2vw,20px)' }}>
          🔴 NUMÉROS ROUGES
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'clamp(8px,2vw,20px)', justifyContent: 'center' }}>
          {rouges.map((n: number, i: number) => (
            revealedRed.includes(n)
              ? <Ball key={i} n={n} color="red" visible />
              : <BallPlaceholder key={i} color="red" />
          ))}
          {rouges.length === 0 && [0,1,2,3,4,5].map((i: number) => <BallPlaceholder key={i} color="red" />)}
        </div>
      </div>

      {/* Boules or */}
      <div>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(12px,2vw,22px)', color: '#fbbf24', letterSpacing: 6, textAlign: 'center', marginBottom: 'clamp(8px,2vw,20px)' }}>
          🟡 NUMÉROS OR
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'clamp(8px,2vw,20px)', justifyContent: 'center' }}>
          {ors.map((n: number, i: number) => (
            revealedGold.includes(n)
              ? <Ball key={i} n={n} color="gold" visible />
              : <BallPlaceholder key={i} color="gold" />
          ))}
          {ors.length === 0 && [0,1,2,3].map((i: number) => <BallPlaceholder key={i} color="gold" />)}
        </div>
      </div>
    </motion.div>
  );
}

function ResultScreen({ live, secs }: { live: LiveData; secs: number }) {
  const draw    = live.lastDraw;
  const rouges  = draw?.numerosRouges ?? [];
  const ors     = draw?.numerosOr     ?? [];
  const winners = draw?.winners       ?? [];

  return (
    <motion.div
      key="result"
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      style={{ display: 'flex', flex: 1, flexWrap: 'wrap', gap: 'clamp(20px,4vw,40px)', padding: 'clamp(12px,2vw,20px) clamp(16px,5vw,60px)', alignItems: 'flex-start', justifyContent: 'space-between', overflowY: 'auto' }}
    >
      {/* Left: numbers + stats */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 32 }}>
        {draw?.drawNumber && (
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(13px,2.2vw,24px)', color: '#9CA3AF', letterSpacing: 5 }}>
            RÉSULTATS TIRAGE #{draw.drawNumber}
          </div>
        )}

        {/* Rouges */}
        <div>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(12px,1.8vw,18px)', color: '#ef4444', letterSpacing: 4, marginBottom: 12 }}>🔴 ROUGES</div>
          <div style={{ display: 'flex', gap: 'clamp(6px,1.2vw,12px)', flexWrap: 'wrap' }}>
            {rouges.map((n: number, i: number) => (
              <div key={i} style={{ width: 'clamp(32px,7vw,70px)', height: 'clamp(32px,7vw,70px)', borderRadius: '50%', background: RED_GRADIENT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(14px,3.5vw,32px)', color: '#fff', boxShadow: '0 0 16px rgba(239,68,68,0.5)' }}>{n}</div>
            ))}
          </div>
        </div>

        {/* Or */}
        <div>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(12px,1.8vw,18px)', color: '#fbbf24', letterSpacing: 4, marginBottom: 12 }}>🟡 OR</div>
          <div style={{ display: 'flex', gap: 'clamp(6px,1.2vw,12px)', flexWrap: 'wrap' }}>
            {ors.map((n: number, i: number) => (
              <div key={i} style={{ width: 'clamp(32px,7vw,70px)', height: 'clamp(32px,7vw,70px)', borderRadius: '50%', background: GOLD_GRADIENT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(14px,3.5vw,32px)', color: '#000', boxShadow: '0 0 16px rgba(251,191,36,0.5)' }}>{n}</div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 40 }}>
          <div>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(12px,1.8vw,18px)', color: '#9CA3AF', letterSpacing: 3 }}>GAGNANTS</div>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(24px,5vw,56px)', color: '#fff' }}>{draw?.winnerCount ?? 0}</div>
          </div>
          <div>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(12px,1.8vw,18px)', color: '#9CA3AF', letterSpacing: 3 }}>DISTRIBUÉ</div>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(24px,5vw,56px)', color: '#00A86B' }}>
              {(draw?.totalPaidCdf ?? 0).toLocaleString('fr-FR')} <span style={{ fontSize: 'clamp(14px,2.5vw,28px)' }}>CDF</span>
            </div>
          </div>
        </div>

        {/* Next draw */}
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(12px,2vw,22px)', color: '#9CA3AF', letterSpacing: 3 }}>
          PROCHAIN TIRAGE DANS {String(Math.floor(secs / 60)).padStart(2, '0')}:{String(secs % 60).padStart(2, '0')}
        </div>
      </div>

      {/* Right: winners list */}
      {winners.length > 0 && (
        <div style={{ width: 'clamp(260px,35vw,380px)', display: 'flex', flexDirection: 'column', gap: 'clamp(8px,1.2vw,12px)' }}>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(13px,2vw,22px)', color: '#9CA3AF', letterSpacing: 5, marginBottom: 4 }}>
            GAGNANTS
          </div>
          {winners.map((w: Winner, i: number) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.12 }}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                padding: 'clamp(8px,1.2vw,14px) clamp(10px,1.8vw,20px)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(13px,2vw,22px)', color: '#fff' }}>
                  Ticket #{w.ticketRef}
                </div>
                <div style={{ fontSize: 14, color: '#9CA3AF', marginTop: 2 }}>
                  {w.nbRouges > 0 && <span style={{ color: '#ef4444' }}>{w.nbRouges}🔴 </span>}
                  {w.nbOr > 0 && <span style={{ color: '#fbbf24' }}>{w.nbOr}🟡</span>}
                </div>
              </div>
              <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(14px,2.5vw,28px)', color: '#00A86B' }}>
                +{w.gainsCdf.toLocaleString('fr-FR')} CDF
              </div>
            </motion.div>
          ))}
          {draw?.jackpotPaye && (
            <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 12, padding: '14px 20px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 24, color: '#ef4444' }}>🎉 JACKPOT PAYÉ !</div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main TV Screen
// ---------------------------------------------------------------------------
export default function OkapiColorTVScreen() {
  const [live, setLive]           = useState<LiveData | null>(null);
  const [secs, setSecs]           = useState(0);
  const [revealedRed, setRed]     = useState<number[]>([]);
  const [revealedGold, setGold]   = useState<number[]>([]);
  const [error, setError]         = useState(false);
  const prevSlotRef               = useRef('');
  const prevStateRef              = useRef<DrawState | ''>('');

  const playUrl = buildPlayUrl();
  const qrUrl   = buildQrUrl(playUrl);

  // Poll live data every 2s
  useEffect(() => {
    const fetchLive = async () => {
      try {
        const r = await fetch(`${BASE_URL}/api/okapi-color/live`, { cache: 'no-store' });
        if (!r.ok) { setError(true); return; }
        const data: LiveData = await r.json();
        setError(false);
        setLive(() => {
          setSecs(data.currentDraw.secondsRemaining);
          return data;
        });
      } catch { setError(true); }
    };
    fetchLive();
    const id = setInterval(fetchLive, 2000);
    return () => clearInterval(id);
  }, []);

  // Local countdown tick every second
  useEffect(() => {
    const id = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  // Ball reveal animation — triggered when entering drawing state with a new slot
  useEffect(() => {
    if (!live) return;
    const st      = live.currentDraw.status;
    const slotKey = live.lastDraw?.slotKey ?? live.currentDraw.slotKey;

    if (st !== 'drawing') {
      // Reset balls when leaving drawing state
      if (prevStateRef.current === 'drawing') {
        setRed([]);
        setGold([]);
      }
      prevStateRef.current = st;
      return;
    }

    // Already animated this slot
    if (slotKey === prevSlotRef.current) return;
    prevSlotRef.current  = slotKey;
    prevStateRef.current = 'drawing';

    const rouges = live.lastDraw?.numerosRouges ?? [];
    const ors    = live.lastDraw?.numerosOr    ?? [];
    setRed([]);
    setGold([]);

    const timers: ReturnType<typeof setTimeout>[] = [];
    rouges.forEach((n, i) => {
      timers.push(setTimeout(() => setRed(p => [...p, n]), 600 + i * 1800));
    });
    ors.forEach((n, i) => {
      timers.push(setTimeout(() => setGold(p => [...p, n]), 600 + rouges.length * 1800 + 800 + i * 1800));
    });
    return () => timers.forEach(clearTimeout);
  }, [live?.currentDraw.status, live?.lastDraw?.slotKey, live?.currentDraw.slotKey]);

  return (
    <div style={{
      width: '100vw', minHeight: '100vh',
      background: 'radial-gradient(ellipse at 20% 50%, rgba(185,28,28,0.08) 0%, #050505 60%)',
      color: 'white', overflowX: 'hidden', overflowY: 'auto', display: 'flex', flexDirection: 'column',
      position: 'relative',
    }}>
      {/* Decorative bg circles */}
      <div style={{ position: 'absolute', top: -100, right: -100, width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(239,68,68,0.06), transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -80, left: -80, width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(251,191,36,0.04), transparent 70%)', pointerEvents: 'none' }} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'clamp(10px,2vw,20px) clamp(16px,4vw,48px)', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(8px,1.5vw,20px)' }}>
          <div style={{ width: 'clamp(6px,0.8vw,10px)', height: 'clamp(6px,0.8vw,10px)', borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 12px #ef4444' }} />
          <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(18px,3vw,36px)', letterSpacing: 6, color: '#fff' }}>OKAPI COLOR</span>
          <div style={{ width: 'clamp(6px,0.8vw,10px)', height: 'clamp(6px,0.8vw,10px)', borderRadius: '50%', background: '#fbbf24', boxShadow: '0 0 12px #fbbf24' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(12px,2.5vw,32px)' }}>
          {live?.lastDraw?.drawNumber && (
            <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(12px,2vw,24px)', color: '#9CA3AF', letterSpacing: 3 }}>
              TIRAGE #{live.lastDraw.drawNumber}
            </span>
          )}
          {(() => {
            const st = live?.currentDraw.status;
            return (
              <div style={{
                padding: '6px 16px', borderRadius: 20,
                background: st === 'open' ? 'rgba(0,168,107,0.2)' : st === 'closing' ? 'rgba(239,68,68,0.2)' : st === 'drawing' ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.08)',
                border: `1px solid ${st === 'open' ? 'rgba(0,168,107,0.4)' : st === 'closing' ? 'rgba(239,68,68,0.4)' : st === 'drawing' ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.1)'}`,
              }}>
                <motion.span
                  animate={st === 'drawing' ? { opacity: [1, 0.4, 1] } : {}}
                  transition={{ duration: 0.6, repeat: Infinity }}
                  style={{
                    fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(10px,1.5vw,18px)', letterSpacing: 4,
                    color: st === 'open' ? '#00A86B' : st === 'closing' ? '#ef4444' : st === 'drawing' ? '#fbbf24' : '#9CA3AF',
                  }}
                >
                  {st === 'open' ? '● EN DIRECT' : st === 'closing' ? '● FERMETURE' : st === 'drawing' ? '● TIRAGE' : st === 'result' ? '● RÉSULTATS' : '● CONNEXION...'}
                </motion.span>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Content area */}
      {/* Show connection error only when we have NO live data yet */}
      {error && !live && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, color: '#9CA3AF', letterSpacing: 4 }}>
            CONNEXION AU SERVEUR...
          </div>
        </div>
      )}

      {/* Always render content once live data has loaded, even if a subsequent fetch fails */}
      {live && (
        <AnimatePresence mode="wait">
          {live.currentDraw.status === 'open'    && <OpenScreen    key="open"    live={live} secs={secs} qrUrl={qrUrl} playUrl={playUrl} />}
          {live.currentDraw.status === 'closing' && <ClosingScreen key="closing" secs={secs} />}
          {live.currentDraw.status === 'drawing' && <DrawingScreen key="drawing" live={live} revealedRed={revealedRed} revealedGold={revealedGold} />}
          {live.currentDraw.status === 'result'  && <ResultScreen  key="result"  live={live} secs={secs} />}
        </AnimatePresence>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'clamp(8px,1.5vw,12px) clamp(16px,4vw,48px)', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(9px,1.4vw,16px)', color: 'rgba(255,255,255,0.2)', letterSpacing: 3 }}>
          {`CONGO GAMING · TIRAGE LIVE TOUTES LES ${Math.round((live?.drawIntervalSeconds ?? 600) / 60)} MIN`}
        </span>
        <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(9px,1.4vw,16px)', color: 'rgba(255,255,255,0.2)', letterSpacing: 2 }}>
          {playUrl}
        </span>
      </div>
    </div>
  );
}
