import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type DrawState = 'open' | 'closing' | 'drawing' | 'result';

interface Winner {
  ticket_ref: string;
  nb_rouges: number;
  nb_or: number;
  gains_cdf: number;
}

interface LastDraw {
  draw_number: number | null;
  slot_key: string | null;
  numeros_rouges: number[];
  numeros_or: number[];
  drawn_at: string;
  jackpot_paye: boolean;
  winner_count: number;
  total_paid_cdf: number;
  winners: Winner[];
}

interface LiveData {
  state: DrawState;
  slot_key: string;
  next_draw_at: string;
  secs_to_next: number;
  jackpot_cdf: number;
  jackpot_threshold_cdf: number;
  tickets_pending: number;
  ticket_price_cdf: number;
  last_draw: LastDraw | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const BASE_URL = import.meta.env.VITE_API_URL || '';
const PLAY_URL = typeof window !== 'undefined' ? `${window.location.origin}/okapi-color` : '';
const QR_URL   = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(PLAY_URL)}&bgcolor=0a0a0a&color=ffffff&qzone=1`;

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
            width: 90, height: 90,
            borderRadius: '50%',
            background: color === 'red' ? RED_GRADIENT : GOLD_GRADIENT,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Bebas Neue, sans-serif',
            fontSize: 42, color: color === 'gold' ? '#000' : '#fff',
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
      width: 90, height: 90, borderRadius: '50%',
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
      <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 140, lineHeight: 1, color: '#fff', textShadow: '0 0 40px rgba(255,255,255,0.3)' }}>
        {m}
      </span>
      <motion.span
        animate={{ opacity: [1, 0, 1] }}
        transition={{ duration: 1, repeat: Infinity }}
        style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 120, color: '#ef4444', lineHeight: 1 }}
      >
        :
      </motion.span>
      <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 140, lineHeight: 1, color: '#fff', textShadow: '0 0 40px rgba(255,255,255,0.3)' }}>
        {s}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// State screens
// ---------------------------------------------------------------------------
function OpenScreen({ live, secs }: { live: LiveData; secs: number }) {
  const isJackpotReady = live.jackpot_cdf >= live.jackpot_threshold_cdf;
  return (
    <motion.div
      key="open"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 32, padding: '0 60px' }}
    >
      {/* Countdown */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, color: '#9CA3AF', letterSpacing: 6, marginBottom: 8 }}>
          PROCHAIN TIRAGE DANS
        </div>
        <Countdown secs={secs} />
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 60, alignItems: 'flex-start' }}>
        {/* Jackpot */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, color: '#9CA3AF', letterSpacing: 4 }}>JACKPOT</div>
          <motion.div
            animate={isJackpotReady ? { scale: [1, 1.06, 1], color: ['#ef4444', '#ff6666', '#ef4444'] } : {}}
            transition={{ duration: 1.5, repeat: Infinity }}
            style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 64, color: isJackpotReady ? '#ef4444' : '#FFD700', lineHeight: 1 }}
          >
            {live.jackpot_cdf.toLocaleString('fr-FR')} <span style={{ fontSize: 32 }}>CDF</span>
          </motion.div>
          {isJackpotReady && (
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 18, color: '#ef4444', letterSpacing: 3, marginTop: 4 }}>
              🔴 JACKPOT DISPONIBLE !
            </div>
          )}
        </div>

        {/* Tickets */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, color: '#9CA3AF', letterSpacing: 4 }}>TICKETS JOUÉS</div>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 64, color: '#fff', lineHeight: 1 }}>
            {live.tickets_pending}
          </div>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 18, color: '#9CA3AF', letterSpacing: 2, marginTop: 4 }}>
            {live.ticket_price_cdf.toLocaleString('fr-FR')} CDF / ticket
          </div>
        </div>

        {/* QR code */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, color: '#9CA3AF', letterSpacing: 4, marginBottom: 12 }}>SCANNE POUR JOUER</div>
          <img
            src={QR_URL}
            alt="QR code"
            width={160} height={160}
            style={{ borderRadius: 12, display: 'block' }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      </div>

      {/* Payout hint */}
      <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, color: 'rgba(255,255,255,0.3)', letterSpacing: 3 }}>
        6 ROUGES = JACKPOT · 6 NUMÉROS À CHOISIR · TIRAGE LIVE TOUTES LES 30 MIN
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
        style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 36, color: '#ef4444', letterSpacing: 8 }}
      >
        ⚠️ FERMETURE DES PARIS
      </motion.div>
      <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 110, color: '#fff', lineHeight: 1 }}>
        TIRAGE IMMINENT
      </div>
      <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 36, color: '#9CA3AF', letterSpacing: 4 }}>
        DANS {secs} SECONDES
      </div>
    </motion.div>
  );
}

function DrawingScreen({ live, revealedRed, revealedGold }: { live: LiveData; revealedRed: number[]; revealedGold: number[] }) {
  const rouges = live.last_draw?.numeros_rouges ?? [];
  const ors    = live.last_draw?.numeros_or    ?? [];
  const dn     = live.last_draw?.draw_number;

  return (
    <motion.div
      key="drawing"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 48 }}
    >
      {dn && (
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, color: '#9CA3AF', letterSpacing: 6 }}>
          TIRAGE #{dn}
        </div>
      )}

      {/* Boules rouges */}
      <div>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, color: '#ef4444', letterSpacing: 6, textAlign: 'center', marginBottom: 20 }}>
          🔴 NUMÉROS ROUGES
        </div>
        <div style={{ display: 'flex', gap: 20, justifyContent: 'center' }}>
          {rouges.map((n, i) => (
            revealedRed.includes(n)
              ? <Ball key={i} n={n} color="red" visible />
              : <BallPlaceholder key={i} color="red" />
          ))}
          {rouges.length === 0 && [0,1,2,3,4,5].map(i => <BallPlaceholder key={i} color="red" />)}
        </div>
      </div>

      {/* Boules or */}
      <div>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, color: '#fbbf24', letterSpacing: 6, textAlign: 'center', marginBottom: 20 }}>
          🟡 NUMÉROS OR
        </div>
        <div style={{ display: 'flex', gap: 20, justifyContent: 'center' }}>
          {ors.map((n, i) => (
            revealedGold.includes(n)
              ? <Ball key={i} n={n} color="gold" visible />
              : <BallPlaceholder key={i} color="gold" />
          ))}
          {ors.length === 0 && [0,1,2,3].map(i => <BallPlaceholder key={i} color="gold" />)}
        </div>
      </div>
    </motion.div>
  );
}

function ResultScreen({ live, secs }: { live: LiveData; secs: number }) {
  const draw    = live.last_draw;
  const rouges  = draw?.numeros_rouges ?? [];
  const ors     = draw?.numeros_or     ?? [];
  const winners = draw?.winners        ?? [];

  return (
    <motion.div
      key="result"
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      style={{ display: 'flex', flex: 1, gap: 40, padding: '0 60px', alignItems: 'flex-start', justifyContent: 'space-between', paddingTop: 20 }}
    >
      {/* Left: numbers + stats */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 32 }}>
        {draw?.draw_number && (
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 24, color: '#9CA3AF', letterSpacing: 5 }}>
            RÉSULTATS TIRAGE #{draw.draw_number}
          </div>
        )}

        {/* Rouges */}
        <div>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 18, color: '#ef4444', letterSpacing: 4, marginBottom: 12 }}>🔴 ROUGES</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {rouges.map((n, i) => (
              <div key={i} style={{ width: 70, height: 70, borderRadius: '50%', background: RED_GRADIENT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, color: '#fff', boxShadow: '0 0 16px rgba(239,68,68,0.5)' }}>{n}</div>
            ))}
          </div>
        </div>

        {/* Or */}
        <div>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 18, color: '#fbbf24', letterSpacing: 4, marginBottom: 12 }}>🟡 OR</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {ors.map((n, i) => (
              <div key={i} style={{ width: 70, height: 70, borderRadius: '50%', background: GOLD_GRADIENT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, color: '#000', boxShadow: '0 0 16px rgba(251,191,36,0.5)' }}>{n}</div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 40 }}>
          <div>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 18, color: '#9CA3AF', letterSpacing: 3 }}>GAGNANTS</div>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 56, color: '#fff' }}>{draw?.winner_count ?? 0}</div>
          </div>
          <div>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 18, color: '#9CA3AF', letterSpacing: 3 }}>DISTRIBUÉ</div>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 56, color: '#00A86B' }}>
              {(draw?.total_paid_cdf ?? 0).toLocaleString('fr-FR')} <span style={{ fontSize: 28 }}>CDF</span>
            </div>
          </div>
        </div>

        {/* Next draw */}
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, color: '#9CA3AF', letterSpacing: 3 }}>
          PROCHAIN TIRAGE DANS {String(Math.floor(secs / 60)).padStart(2, '0')}:{String(secs % 60).padStart(2, '0')}
        </div>
      </div>

      {/* Right: winners list */}
      {winners.length > 0 && (
        <div style={{ width: 380, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, color: '#9CA3AF', letterSpacing: 5, marginBottom: 4 }}>
            GAGNANTS
          </div>
          {winners.map((w, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.12 }}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                padding: '14px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, color: '#fff' }}>
                  Ticket #{w.ticket_ref}
                </div>
                <div style={{ fontSize: 14, color: '#9CA3AF', marginTop: 2 }}>
                  {w.nb_rouges > 0 && <span style={{ color: '#ef4444' }}>{w.nb_rouges}🔴 </span>}
                  {w.nb_or > 0 && <span style={{ color: '#fbbf24' }}>{w.nb_or}🟡</span>}
                </div>
              </div>
              <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, color: '#00A86B' }}>
                +{w.gains_cdf.toLocaleString('fr-FR')} CDF
              </div>
            </motion.div>
          ))}
          {draw?.jackpot_paye && (
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

  // Poll live data every 2s
  useEffect(() => {
    const fetchLive = async () => {
      try {
        const r = await fetch(`${BASE_URL}/api/okapi-color/live`, { cache: 'no-store' });
        if (!r.ok) { setError(true); return; }
        const data: LiveData = await r.json();
        setError(false);
        setLive(prev => {
          setSecs(data.secs_to_next);
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
    const slotKey = live.last_draw?.slot_key ?? live.slot_key;

    if (live.state !== 'drawing') {
      // Reset balls when leaving drawing state
      if (prevStateRef.current === 'drawing') {
        setRed([]);
        setGold([]);
      }
      prevStateRef.current = live.state;
      return;
    }

    // Already animated this slot
    if (slotKey === prevSlotRef.current) return;
    prevSlotRef.current  = slotKey;
    prevStateRef.current = 'drawing';

    const rouges = live.last_draw?.numeros_rouges ?? [];
    const ors    = live.last_draw?.numeros_or    ?? [];
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
  }, [live?.state, live?.last_draw?.slot_key, live?.slot_key]);

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: 'radial-gradient(ellipse at 20% 50%, rgba(185,28,28,0.08) 0%, #050505 60%)',
      color: 'white', overflow: 'hidden', display: 'flex', flexDirection: 'column',
      position: 'relative',
    }}>
      {/* Decorative bg circles */}
      <div style={{ position: 'absolute', top: -100, right: -100, width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(239,68,68,0.06), transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -80, left: -80, width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(251,191,36,0.04), transparent 70%)', pointerEvents: 'none' }} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 48px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 12px #ef4444' }} />
          <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 36, letterSpacing: 6, color: '#fff' }}>OKAPI COLOR</span>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#fbbf24', boxShadow: '0 0 12px #fbbf24' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          {live?.last_draw?.draw_number && (
            <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 24, color: '#9CA3AF', letterSpacing: 3 }}>
              TIRAGE #{live.last_draw.draw_number}
            </span>
          )}
          <div style={{
            padding: '6px 16px', borderRadius: 20,
            background: live?.state === 'open' ? 'rgba(0,168,107,0.2)' : live?.state === 'closing' ? 'rgba(239,68,68,0.2)' : live?.state === 'drawing' ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.08)',
            border: `1px solid ${live?.state === 'open' ? 'rgba(0,168,107,0.4)' : live?.state === 'closing' ? 'rgba(239,68,68,0.4)' : live?.state === 'drawing' ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.1)'}`,
          }}>
            <motion.span
              animate={live?.state === 'drawing' ? { opacity: [1, 0.4, 1] } : {}}
              transition={{ duration: 0.6, repeat: Infinity }}
              style={{
                fontFamily: 'Bebas Neue, sans-serif', fontSize: 18, letterSpacing: 4,
                color: live?.state === 'open' ? '#00A86B' : live?.state === 'closing' ? '#ef4444' : live?.state === 'drawing' ? '#fbbf24' : '#9CA3AF',
              }}
            >
              {live?.state === 'open' ? '● EN DIRECT' : live?.state === 'closing' ? '● FERMETURE' : live?.state === 'drawing' ? '● TIRAGE' : live?.state === 'result' ? '● RÉSULTATS' : '● CONNEXION...'}
            </motion.span>
          </div>
        </div>
      </div>

      {/* Content area */}
      {error && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, color: '#9CA3AF', letterSpacing: 4 }}>
            CONNEXION AU SERVEUR...
          </div>
        </div>
      )}

      {!error && live && (
        <AnimatePresence mode="wait">
          {live.state === 'open'    && <OpenScreen    key="open"    live={live} secs={secs} />}
          {live.state === 'closing' && <ClosingScreen key="closing" secs={secs} />}
          {live.state === 'drawing' && <DrawingScreen key="drawing" live={live} revealedRed={revealedRed} revealedGold={revealedGold} />}
          {live.state === 'result'  && <ResultScreen  key="result"  live={live} secs={secs} />}
        </AnimatePresence>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 48px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 16, color: 'rgba(255,255,255,0.2)', letterSpacing: 3 }}>
          CONGO GAMING · TIRAGE LIVE TOUTES LES 30 MIN
        </span>
        <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 16, color: 'rgba(255,255,255,0.2)', letterSpacing: 2 }}>
          {PLAY_URL}
        </span>
      </div>
    </div>
  );
}
