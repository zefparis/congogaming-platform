import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Bell, Zap } from 'lucide-react';

/**
 * Premium "coming soon" experience for Congo Loto.
 *
 * Hard rules driven by the brief:
 *  - never use the words maintenance / suspendu / error
 *  - never mention jackpot caps or internal constraints
 *  - keep the route reachable so SEO + branding survive
 *  - funnel traffic to Loto Express (`/flash`)
 *  - feel like a TV-quality teaser, not a static placeholder
 *
 * The visual language reuses the gold (`#FFD700`) accent of the rest of
 * the app, but goes darker and more cinematic. All animations are pure
 * CSS / Framer Motion driven and capped to lightweight transforms so
 * the screen stays at 60fps on entry-level Android.
 */
export default function CongoLotoComingSoon() {
  const nav = useNavigate();
  const [countdown, setCountdown] = useState<string>(() => getCountdownToKinshasa20h());

  useEffect(() => {
    const id = setInterval(() => setCountdown(getCountdownToKinshasa20h()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="relative min-h-screen w-full overflow-hidden text-white"
      style={{
        background:
          'radial-gradient(120% 90% at 50% -10%, rgba(255,215,0,0.18) 0%, rgba(255,140,0,0.06) 25%, transparent 55%), linear-gradient(180deg, #0A0A0A 0%, #050505 100%)',
      }}
    >
      <ParticleField />

      {/* Top bar */}
      <header className="relative z-20 flex items-center gap-3 px-4 pt-4">
        <button
          onClick={() => nav('/')}
          aria-label="Retour"
          className="w-11 h-11 rounded-full bg-zinc-900/80 border border-zinc-800 flex items-center justify-center text-gold backdrop-blur"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <img
          src="/images/okapi.PNG"
          alt="Congo Gaming"
          className="h-9 w-auto object-contain"
        />
        <LiveBadge />
      </header>

      {/* Hero */}
      <main className="relative z-10 flex flex-col items-center px-5 pt-6 pb-32 text-center">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-[11px] uppercase tracking-[0.35em] text-gold/70"
        >
          Édition spéciale
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.05 }}
          className="font-display mt-3 text-[38px] leading-[0.95] tracking-wider text-white"
          style={{
            textShadow: '0 0 20px rgba(255,215,0,0.35)',
          }}
        >
          CONGO LOTO
          <br />
          <span
            className="block mt-1 text-gold"
            style={{ textShadow: '0 0 24px rgba(255,215,0,0.55)' }}
          >
            REVIENT BIENTÔT
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="mt-5 max-w-[300px] text-[15px] leading-snug text-zinc-300"
        >
          Nouveaux tirages <span className="text-gold font-semibold">LIVE</span> chaque
          jour à <span className="text-gold font-semibold">20H</span>.
          <br />
          Une nouvelle expérience arrive.
        </motion.p>

        {/* Halo ball */}
        <div className="relative mt-8 mb-2 flex items-center justify-center">
          <Halo />
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.15 }}
            className="relative w-40 h-40 rounded-full flex items-center justify-center"
            style={{
              background:
                'radial-gradient(circle at 35% 30%, #FFE57A 0%, #FFD700 35%, #B8860B 75%, #5A3F00 100%)',
              boxShadow:
                '0 0 60px rgba(255,215,0,0.45), inset 0 -10px 20px rgba(0,0,0,0.35)',
            }}
          >
            <span
              className="font-display text-black"
              style={{ fontSize: 56, lineHeight: 1, textShadow: '0 1px 0 rgba(255,255,255,0.4)' }}
            >
              20H
            </span>
          </motion.div>
        </div>

        {/* Countdown chip */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35 }}
          className="mt-2 inline-flex items-center gap-2 rounded-full border border-gold/40 bg-black/40 px-4 py-2 backdrop-blur"
        >
          <span className="relative flex w-2 h-2">
            <span className="absolute inline-flex w-full h-full rounded-full bg-gold opacity-70 animate-ping" />
            <span className="relative inline-flex w-2 h-2 rounded-full bg-gold" />
          </span>
          <span className="text-[11px] uppercase tracking-[0.3em] text-zinc-300">
            Prochain rendez-vous
          </span>
          <span className="font-mono text-gold text-sm font-semibold">{countdown}</span>
        </motion.div>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.45 }}
          className="mt-10 w-full max-w-sm space-y-3"
        >
          <ShimmerButton onClick={() => nav('/flash')} />
          <button
            onClick={() => nav('/')}
            className="w-full h-12 rounded-2xl border border-gold/40 bg-black/40 text-gold backdrop-blur text-sm font-semibold tracking-wide flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            <Bell className="w-4 h-4" />
            Être prêt pour le lancement
          </button>
        </motion.div>
      </main>
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Sub-components                                                       */
/* -------------------------------------------------------------------- */

function LiveBadge() {
  return (
    <div className="ml-auto flex items-center gap-1.5 rounded-full bg-red-600/90 px-2.5 py-1 shadow-[0_0_14px_rgba(255,0,0,0.45)]">
      <span className="relative flex w-2 h-2">
        <span className="absolute inline-flex w-full h-full rounded-full bg-white opacity-80 animate-ping" />
        <span className="relative inline-flex w-2 h-2 rounded-full bg-white" />
      </span>
      <span className="text-[10px] font-bold tracking-[0.2em] text-white">LIVE 20H</span>
    </div>
  );
}

function Halo() {
  return (
    <>
      <motion.div
        aria-hidden
        animate={{ scale: [1, 1.08, 1], opacity: [0.55, 0.85, 0.55] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute w-64 h-64 rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(255,215,0,0.35) 0%, rgba(255,215,0,0.0) 65%)',
          filter: 'blur(4px)',
        }}
      />
      <motion.div
        aria-hidden
        animate={{ scale: [1, 1.18, 1], opacity: [0.25, 0.5, 0.25] }}
        transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
        className="absolute w-80 h-80 rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(255,140,0,0.25) 0%, rgba(255,140,0,0.0) 65%)',
          filter: 'blur(8px)',
        }}
      />
    </>
  );
}

function ShimmerButton({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      className="relative w-full h-16 rounded-2xl overflow-hidden font-display text-black text-xl tracking-widest"
      style={{
        background:
          'linear-gradient(90deg, #FFB300 0%, #FFD700 45%, #FFE57A 55%, #FFD700 60%, #FFB300 100%)',
        boxShadow:
          '0 10px 30px rgba(255,215,0,0.25), inset 0 0 0 1px rgba(255,255,255,0.35)',
      }}
    >
      <span className="relative z-10 flex items-center justify-center gap-2">
        <Zap className="w-5 h-5" />
        JOUER AU LOTO EXPRESS
      </span>
      <span
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.55) 45%, transparent 60%)',
          animation: 'lotoShimmer 2.8s linear infinite',
        }}
      />
      <style>{`
        @keyframes lotoShimmer {
          0%   { transform: translateX(-120%); }
          100% { transform: translateX(120%); }
        }
      `}</style>
    </motion.button>
  );
}

/**
 * Lightweight canvas-free floating particles using only CSS transforms.
 * 14 dots, randomised once at mount, looped via CSS keyframes so React
 * does not re-render on every frame.
 */
function ParticleField() {
  const seed = useRef(Math.random());
  const particles = useMemo(() => {
    const rng = mulberry32(Math.floor(seed.current * 1_000_000));
    return Array.from({ length: 14 }).map((_, i) => ({
      id: i,
      left: rng() * 100,
      top: 30 + rng() * 60,
      size: 2 + rng() * 3,
      delay: rng() * 6,
      duration: 8 + rng() * 6,
      opacity: 0.3 + rng() * 0.5,
    }));
  }, []);

  return (
    <div aria-hidden className="absolute inset-0 z-0 pointer-events-none">
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute rounded-full bg-gold"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.size,
            opacity: p.opacity,
            filter: 'blur(0.5px)',
            boxShadow: '0 0 8px rgba(255,215,0,0.55)',
            animation: `lotoFloat ${p.duration}s ease-in-out ${p.delay}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes lotoFloat {
          0%   { transform: translateY(0) translateX(0); opacity: 0; }
          15%  { opacity: 1; }
          50%  { transform: translateY(-40px) translateX(8px); }
          85%  { opacity: 1; }
          100% { transform: translateY(-90px) translateX(-6px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Utils                                                                */
/* -------------------------------------------------------------------- */

function getCountdownToKinshasa20h(): string {
  const now = new Date();
  const kinshasa = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Kinshasa' }));
  const target = new Date(kinshasa);
  target.setHours(20, 0, 0, 0);
  if (kinshasa >= target) target.setDate(target.getDate() + 1);
  const diff = target.getTime() - kinshasa.getTime();
  const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
  const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
  const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/** Deterministic PRNG so particle layout is stable for one mount. */
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
