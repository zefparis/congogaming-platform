import { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';

type DrawStatus = 'open' | 'closing' | 'drawing' | 'result';
type HitColor = 'red' | 'gold';

type HitState = 'neutral' | 'redHit' | 'goldHit';

type DrawItem = {
  number: number;
  color: HitColor;
  index: number;
};

export default function OkapiColorDrawShow({
  redNumbers,
  goldNumbers,
  status,
  drawKey,
  mode,
  onComplete,
}: {
  redNumbers: number[];
  goldNumbers: number[];
  status: DrawStatus;
  drawKey: string;
  mode: 'tv' | 'mobile';
  onComplete?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const ballLayerRef = useRef<HTMLDivElement | null>(null);
  const flashRef = useRef<HTMLDivElement | null>(null);
  const cellRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const lastAnimatedDrawKeyRef = useRef('');
  const [hits, setHits] = useState<Record<number, HitState>>({});
  const [showRotateOverlay, setShowRotateOverlay] = useState(false);

  const isTv = mode === 'tv';
  const numbers = useMemo(() => Array.from({ length: 24 }, (_, i) => i + 1), []);

  // Stabilised arrays → useMemo won't re-create them unless values actually change
  const cleanRedNumbers  = useMemo(
    () => (Array.isArray(redNumbers)  ? redNumbers  : []).filter((n) => n >= 1 && n <= 24),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [redNumbers.join(',')],
  );
  const cleanGoldNumbers = useMemo(
    () => (Array.isArray(goldNumbers) ? goldNumbers : []).filter((n) => n >= 1 && n <= 24),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [goldNumbers.join(',')],
  );
  const totalNumbers = cleanRedNumbers.length + cleanGoldNumbers.length;

  // Always-current refs so the animation effect can read latest numbers
  // without those arrays being in the effect's dependency array.
  const redRef  = useRef<number[]>([]);
  const goldRef = useRef<number[]>([]);
  redRef.current  = cleanRedNumbers;
  goldRef.current = cleanGoldNumbers;
  const statusRef  = useRef<DrawStatus>('open');
  statusRef.current = status;

  // ─── Orientation lock (mobile only) ────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'mobile') return;

    if (status === 'drawing') {
      const tryLock = async () => {
        try {
          await (screen.orientation as ScreenOrientation & { lock: (o: string) => Promise<void> }).lock('landscape');
          setShowRotateOverlay(false);
        } catch {
          // Lock not supported (iOS) or no permission → check if still portrait
          const isPortrait = window.matchMedia('(orientation: portrait)').matches;
          setShowRotateOverlay(isPortrait);
        }
      };
      tryLock();

      const onOrientationChange = () => {
        const isPortrait = window.matchMedia('(orientation: portrait)').matches;
        setShowRotateOverlay(isPortrait);
      };
      screen.orientation?.addEventListener('change', onOrientationChange);
      window.addEventListener('orientationchange', onOrientationChange);

      return () => {
        screen.orientation?.removeEventListener('change', onOrientationChange);
        window.removeEventListener('orientationchange', onOrientationChange);
      };
    } else {
      setShowRotateOverlay(false);
      try { screen.orientation.unlock(); } catch { /* noop */ }
    }
  }, [status, mode]);

  // ─── Effect 1 : status watcher — never kills a running animation ──────────
  // When backend switches drawing→result, we let the GSAP timeline play to its
  // natural end so every ball is revealed before the grid locks in place.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (status === 'result') {
      if (timelineRef.current?.isActive()) return; // animation still running → hands off
      const next: Record<number, HitState> = {};
      redRef.current.forEach((n)  => { next[n] = 'redHit'; });
      goldRef.current.forEach((n) => { next[n] = 'goldHit'; });
      setHits(next);
      return;
    }
    if (status === 'open' || status === 'closing') {
      timelineRef.current?.kill();
      timelineRef.current = null;
      lastAnimatedDrawKeyRef.current = '';
      setHits({});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // ─── Effect 2 : ball animation — deps do NOT include status ─────────────────
  // Cleanup only fires on drawKey/isTv/onComplete change or unmount.
  // A status change to 'result' will NOT kill this timeline mid-flight.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (statusRef.current !== 'drawing') return;
    if (!drawKey || lastAnimatedDrawKeyRef.current === drawKey) return;
    if (!rootRef.current || !ballLayerRef.current) return;

    const reds  = redRef.current.slice(0, 6);
    const golds = goldRef.current.slice(0, 4);

    // Both colour sets must be present before starting — otherwise wait for next poll
    if (reds.length === 0 || golds.length === 0) return;

    const items: DrawItem[] = [
      ...reds.map((number, index) => ({ number, color: 'red' as const, index })),
      ...golds.map((number, index) => ({ number, color: 'gold' as const, index: index + reds.length })),
    ];

    if (items.length === 0) return;

    lastAnimatedDrawKeyRef.current = drawKey;
    setHits({});
    timelineRef.current?.kill();

    const rootBox = rootRef.current.getBoundingClientRect();
    const tl = gsap.timeline({ onComplete });
    timelineRef.current = tl;
    const duration = isTv ? 3.0 : 2.2;   // visible travel time per ball
    const gap      = isTv ? 1.4 : 1.0;   // pause after each impact before next ball

    items.forEach((item) => {
      const target = cellRefs.current[item.number];
      if (!target || !ballLayerRef.current || !rootRef.current) return;

      const targetBox = target.getBoundingClientRect();
      const targetX = targetBox.left - rootBox.left + targetBox.width / 2;
      const targetY = targetBox.top  - rootBox.top  + targetBox.height / 2;
      const size    = isTv ? 74 : 42;

      // Alternate entry sides for variety
      const fromRight = item.index % 2 === 0;
      const startX = fromRight ? rootBox.width + size + (item.index % 3) * 40 : -size - (item.index % 3) * 40;
      const startY = item.index % 3 === 0 ? -size : item.index % 3 === 1 ? rootBox.height + size : rootBox.height * 0.5;

      const bounceOneX = rootBox.width * (0.72 - (item.index % 3) * 0.07);
      const bounceOneY = rootBox.height * (0.22 + (item.index % 4) * 0.10);
      const bounceTwoX = rootBox.width * (0.42 + (item.index % 2) * 0.14);
      const bounceTwoY = rootBox.height * (0.72 - (item.index % 3) * 0.08);

      const ball = document.createElement('div');
      ball.className = `okapi-draw-ball okapi-draw-ball-${item.color}`;
      ball.style.width = `${size}px`;
      ball.style.height = `${size}px`;
      ball.style.marginLeft = `${-size / 2}px`;
      ball.style.marginTop = `${-size / 2}px`;
      ballLayerRef.current.appendChild(ball);

      let trailFrame = 0;
      tl.set(ball, { x: startX, y: startY, scale: 0.72, opacity: 0, rotate: 0 })
        .to(ball, { opacity: 1, scale: 1, duration: 0.18, ease: 'power2.out' })
        .to(ball, {
          keyframes: [
            { x: bounceOneX, y: bounceOneY, rotate: item.color === 'red' ? 200 : -200, scale: 1.1,  duration: duration * 0.32, ease: 'power2.out' },
            { x: bounceTwoX, y: bounceTwoY, rotate: item.color === 'red' ? 420 : -420, scale: 0.96, duration: duration * 0.28, ease: 'power1.inOut' },
            { x: targetX,    y: targetY,    rotate: item.color === 'red' ? 720 : -720, scale: 0.82, duration: duration * 0.4,  ease: 'power3.in' },
          ],
          onUpdate() {
            trailFrame++;
            if (trailFrame % 2 !== 0 || !ballLayerRef.current) return;
            const cx = gsap.getProperty(ball, 'x') as number;
            const cy = gsap.getProperty(ball, 'y') as number;
            const variance = size * 0.35;
            const pSize = size * (0.28 + Math.random() * 0.38);
            const p = document.createElement('div');
            p.className = `okapi-trail-particle okapi-trail-particle-${item.color}`;
            p.style.width  = `${pSize}px`;
            p.style.height = `${pSize}px`;
            p.style.left   = `${cx - pSize / 2 + (Math.random() - 0.5) * variance}px`;
            p.style.top    = `${cy - pSize / 2 + (Math.random() - 0.5) * variance}px`;
            ballLayerRef.current.appendChild(p);
            gsap.to(p, {
              opacity: 0, scale: 0.08,
              x: (Math.random() - 0.5) * size * 0.9,
              y: (Math.random() - 0.5) * size * 0.9 + size * 0.25,
              duration: 0.32 + Math.random() * 0.28,
              ease: 'power2.out',
              onComplete: () => p.remove(),
            });
          },
        })
        .add(() => {
          setHits((prev) => ({ ...prev, [item.number]: item.color === 'red' ? 'redHit' : 'goldHit' }));
          gsap.fromTo(target, { scale: 1, x: 0 }, { scale: 1.14, x: isTv ? 7 : 4, yoyo: true, repeat: 3, duration: 0.07, ease: 'power1.inOut' });
          gsap.fromTo(
            target,
            { boxShadow: item.color === 'red' ? '0 0 0 rgba(239,68,68,0)' : '0 0 0 rgba(251,191,36,0)' },
            { boxShadow: item.color === 'red' ? '0 0 52px rgba(239,68,68,0.95)' : '0 0 52px rgba(251,191,36,0.95)', duration: 0.28, yoyo: true, repeat: 1 },
          );
          if (flashRef.current) {
            gsap.fromTo(flashRef.current, { opacity: 0 }, { opacity: isTv ? 0.38 : 0.2, duration: 0.07, yoyo: true, repeat: 1, ease: 'power2.out' });
          }
        })
        .to(ball, { scale: 1.3, duration: 0.12, ease: 'power2.out' })
        .to(ball, { scale: 0, opacity: 0, duration: 0.22, ease: 'power2.in', onComplete: () => ball.remove() })
        .to({}, { duration: gap });
    });

    return () => {
      tl.kill();
      ballLayerRef.current?.querySelectorAll('.okapi-draw-ball, .okapi-trail-particle').forEach((b) => b.remove());
    };
  // totalNumbers in deps: re-run when gold numbers arrive after reds (common on first poll)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawKey, totalNumbers, isTv, onComplete]);

  return (
    <div ref={rootRef} className={`okapi-draw-show okapi-draw-show-${mode} okapi-draw-show-${status}`}>
      <style>{`
        /* ── Shared base ─────────────────────────────────────────────────────── */
        .okapi-draw-show {
          position: relative; width: 100%; overflow: hidden;
          background: radial-gradient(circle at 70% 25%, rgba(251,191,36,0.13), transparent 28%),
                      radial-gradient(circle at 20% 70%, rgba(239,68,68,0.15), transparent 34%),
                      linear-gradient(135deg, rgba(10,10,15,0.98), rgba(3,3,6,0.98));
          border: 1px solid rgba(255,255,255,0.08);
          box-shadow: inset 0 0 80px rgba(255,255,255,0.035), 0 22px 80px rgba(0,0,0,0.55);
        }
        .okapi-draw-stage-glow {
          position: absolute; inset: -20%; pointer-events: none;
          background: conic-gradient(from 180deg, transparent, rgba(239,68,68,0.08), transparent, rgba(251,191,36,0.08), transparent);
          filter: blur(18px); opacity: 0.9;
        }
        .okapi-draw-flash { position: absolute; inset: 0; pointer-events: none; background: #fff; opacity: 0; z-index: 4; mix-blend-mode: screen; }
        .okapi-draw-content { position: relative; z-index: 2; height: 100%; min-height: inherit; display: flex; flex-direction: column; justify-content: center; }
        .okapi-draw-title-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; }
        .okapi-draw-kicker { font-family: Bebas Neue, sans-serif; color: rgba(255,255,255,0.55); }
        .okapi-draw-message { font-family: Bebas Neue, sans-serif; text-align: right;
          color: ${status === 'open' ? '#00A86B' : status === 'closing' ? '#ef4444' : status === 'drawing' ? '#fbbf24' : '#fff'}; }
        .okapi-draw-grid { display: grid; }
        .okapi-draw-cell {
          position: relative; aspect-ratio: 1 / 1; display: flex; align-items: center; justify-content: center;
          font-family: Bebas Neue, sans-serif; color: rgba(255,255,255,0.72);
          background: linear-gradient(145deg, rgba(255,255,255,0.085), rgba(255,255,255,0.025));
          border: 1px solid rgba(255,255,255,0.1);
          box-shadow: inset 0 -12px 28px rgba(0,0,0,0.35);
          text-shadow: 0 2px 10px rgba(0,0,0,0.55); overflow: hidden;
          transition: background 220ms ease, color 220ms ease, border-color 220ms ease, transform 220ms ease;
        }
        .okapi-draw-cell::after {
          content: ''; position: absolute; inset: -35%; opacity: 0;
          background: radial-gradient(circle, rgba(255,255,255,0.62), transparent 42%);
          transform: scale(0.4); transition: opacity 260ms ease, transform 260ms ease;
        }
        .okapi-draw-cell-redHit  { color: white; background: linear-gradient(145deg, #7f1d1d, #ef4444 58%, #fb7185); border-color: rgba(248,113,113,0.85); box-shadow: 0 0 28px rgba(239,68,68,0.6), inset 0 -16px 28px rgba(76,5,25,0.45); }
        .okapi-draw-cell-goldHit { color: #080808; background: linear-gradient(145deg, #b45309, #fbbf24 58%, #fde68a); border-color: rgba(253,230,138,0.9); box-shadow: 0 0 30px rgba(251,191,36,0.62), inset 0 -16px 28px rgba(120,53,15,0.32); text-shadow: none; }
        .okapi-draw-cell-redHit::after, .okapi-draw-cell-goldHit::after { opacity: 0.32; transform: scale(1); }
        .okapi-draw-ball-layer { position: absolute; inset: 0; z-index: 5; pointer-events: none; }
        .okapi-draw-ball {
          position: absolute; left: 0; top: 0; border-radius: 999px;
          display: flex; align-items: center; justify-content: center;
          font-family: Bebas Neue, sans-serif; font-weight: 900;
          will-change: transform, opacity; border: 2px solid rgba(255,255,255,0.22);
        }
        .okapi-draw-ball-red  {
          background: radial-gradient(circle at 32% 28%, #fecaca, #ef4444 40%, #7f1d1d 80%);
          box-shadow: 0 0 38px rgba(239,68,68,0.95), 0 0 70px rgba(239,68,68,0.3), 0 14px 28px rgba(0,0,0,0.5);
          animation: okapi-glow-red 0.38s ease-in-out infinite alternate;
        }
        .okapi-draw-ball-gold {
          background: radial-gradient(circle at 32% 28%, #fff7ad, #fbbf24 40%, #92400e 80%);
          box-shadow: 0 0 38px rgba(251,191,36,0.95), 0 0 70px rgba(251,191,36,0.3), 0 14px 28px rgba(0,0,0,0.5);
          animation: okapi-glow-gold 0.38s ease-in-out infinite alternate;
        }
        @keyframes okapi-glow-red  { to { box-shadow: 0 0 60px rgba(239,68,68,1), 0 0 110px rgba(239,68,68,0.45), 0 14px 28px rgba(0,0,0,0.5); } }
        @keyframes okapi-glow-gold { to { box-shadow: 0 0 60px rgba(251,191,36,1), 0 0 110px rgba(251,191,36,0.45), 0 14px 28px rgba(0,0,0,0.5); } }
        .okapi-trail-particle {
          position: absolute; border-radius: 50%; pointer-events: none; z-index: 4;
          opacity: 0.75;
        }
        .okapi-trail-particle-red  { background: radial-gradient(circle at 35% 30%, rgba(255,220,220,0.95), rgba(239,68,68,0.6) 50%, transparent); }
        .okapi-trail-particle-gold { background: radial-gradient(circle at 35% 30%, rgba(255,252,180,0.95), rgba(251,191,36,0.6) 50%, transparent); }

        /* ── TV mode ─────────────────────────────────────────────────────────── */
        .okapi-draw-show-tv { flex: 1; min-height: 0; border-radius: 34px; }
        .okapi-draw-show-tv .okapi-draw-content  { padding: clamp(22px,3vw,44px);   gap: clamp(18px,2.2vw,30px); }
        .okapi-draw-show-tv .okapi-draw-kicker   { font-size: clamp(18px,2.6vw,36px); letter-spacing: 7px; }
        .okapi-draw-show-tv .okapi-draw-message  { font-size: clamp(18px,2.6vw,34px); letter-spacing: 5px; }
        .okapi-draw-show-tv .okapi-draw-grid     { grid-template-columns: repeat(8, minmax(0,1fr)); gap: clamp(10px,1.35vw,20px); }
        .okapi-draw-show-tv .okapi-draw-cell     { border-radius: 22px; font-size: clamp(34px,5.3vw,78px); }
        .okapi-draw-show-tv .okapi-draw-badge    { position: absolute; top: 10px; right: 12px; font-family: system-ui,sans-serif; font-weight: 900; font-size: clamp(10px,1.1vw,16px); letter-spacing: 0.08em; opacity: 0.82; }
        .okapi-draw-show-tv .okapi-draw-ball     { font-size: 42px; }

        /* ── Mobile mode ─────────────────────────────────────────────────────── */
        .okapi-draw-show-mobile .okapi-draw-title-row { display: none; }
        .okapi-draw-show-mobile {
          min-height: 480px; border-radius: 22px;
          max-height: 900px; overflow: hidden;
          transition: max-height 0.6s cubic-bezier(0.4,0,0.2,1), opacity 0.5s ease, margin 0.5s ease;
        }
        .okapi-draw-show-mobile.okapi-draw-show-result {
          max-height: 0; opacity: 0; pointer-events: none; margin: 0 !important;
        }
        .okapi-draw-show-mobile .okapi-draw-content { padding: 18px; gap: 14px; }
        .okapi-draw-show-mobile .okapi-draw-kicker  { font-size: 15px; letter-spacing: 1.5px; }
        .okapi-draw-show-mobile .okapi-draw-message { font-size: 14px; letter-spacing: 1.5px; }
        .okapi-draw-show-mobile .okapi-draw-grid    { grid-template-columns: repeat(4, minmax(0,1fr)); gap: 10px; }
        .okapi-draw-show-mobile .okapi-draw-cell    { border-radius: 14px; font-size: clamp(24px,6.5vw,40px); }
        .okapi-draw-show-mobile .okapi-draw-badge   { position: absolute; top: 5px; right: 7px; font-family: system-ui,sans-serif; font-weight: 900; font-size: 9px; letter-spacing: 0.08em; opacity: 0.82; }
        .okapi-draw-show-mobile .okapi-draw-ball    { font-size: 24px; }

        /* ── Mobile landscape (auto-triggered during draw) ───────────────────── */
        @media (orientation: landscape) {
          .okapi-draw-show-mobile { min-height: 100svh; border-radius: 0; }
          .okapi-draw-show-mobile .okapi-draw-content { padding: 14px 20px; gap: 10px; }
          .okapi-draw-show-mobile .okapi-draw-kicker  { font-size: clamp(13px,2.2vh,20px); letter-spacing: 3px; }
          .okapi-draw-show-mobile .okapi-draw-message { font-size: clamp(12px,2vh,18px); }
          .okapi-draw-show-mobile .okapi-draw-grid    { grid-template-columns: repeat(8, minmax(0,1fr)); gap: clamp(6px,1.2vw,12px); }
          .okapi-draw-show-mobile .okapi-draw-cell    { border-radius: 12px; font-size: clamp(18px,4.5vh,38px); }
          .okapi-draw-show-mobile .okapi-draw-ball    { font-size: clamp(20px,4vh,32px); }
        }

        /* ── Rotate overlay ──────────────────────────────────────────────────── */
        .okapi-rotate-overlay {
          position: fixed; inset: 0; z-index: 9999;
          background: linear-gradient(160deg, rgba(4,4,8,0.97) 0%, rgba(12,2,2,0.97) 100%);
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px;
          backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
        }
        .okapi-rotate-phone {
          font-size: 80px; line-height: 1;
          animation: okapi-phone-spin 1.5s cubic-bezier(0.4,0,0.2,1) infinite;
          transform-origin: center;
          filter: drop-shadow(0 0 24px rgba(251,191,36,0.55));
        }
        @keyframes okapi-phone-spin {
          0%   { transform: rotate(0deg)   scale(1);    }
          35%  { transform: rotate(-90deg) scale(1.12); }
          55%  { transform: rotate(-90deg) scale(1.12); }
          80%  { transform: rotate(0deg)   scale(1);    }
          100% { transform: rotate(0deg)   scale(1);    }
        }
        .okapi-rotate-title {
          font-family: Bebas Neue, sans-serif; font-size: 28px; letter-spacing: 5px;
          color: #fbbf24; text-shadow: 0 0 28px rgba(251,191,36,0.55);
          text-align: center;
        }
        .okapi-rotate-sub {
          font-family: system-ui, sans-serif; font-size: 14px;
          color: rgba(255,255,255,0.45); letter-spacing: 0.5px; text-align: center;
        }
        .okapi-rotate-pulse {
          width: 56px; height: 3px; border-radius: 99px;
          background: linear-gradient(90deg, #ef4444, #fbbf24);
          animation: okapi-pulse-bar 1.5s ease-in-out infinite;
        }
        @keyframes okapi-pulse-bar {
          0%, 100% { opacity: 0.4; transform: scaleX(0.6); }
          50%       { opacity: 1;   transform: scaleX(1);   }
        }
      `}</style>
      {mode === 'mobile' && showRotateOverlay && (
        <div className="okapi-rotate-overlay">
          <div className="okapi-rotate-phone">📱</div>
          <div className="okapi-rotate-title">TOURNE TON TÉLÉPHONE</div>
          <div className="okapi-rotate-sub">Pour vivre le tirage en grand</div>
          <div className="okapi-rotate-pulse" />
        </div>
      )}
      <div className="okapi-draw-stage-glow" />
      <div ref={flashRef} className="okapi-draw-flash" />
      <div ref={ballLayerRef} className="okapi-draw-ball-layer" />
      <div className="okapi-draw-content">
        <div className="okapi-draw-title-row">
          <div>
            <div className="okapi-draw-kicker">OKAPI COLOR</div>
            <div className="okapi-draw-kicker" style={{ color: '#fbbf24' }}>GRILLE 1–24</div>
          </div>
          <div className="okapi-draw-message">
            {status === 'open' && 'JOUEZ MAINTENANT'}
            {status === 'closing' && 'PARIS FERMÉS · TIRAGE IMMINENT'}
            {status === 'drawing' && 'TIRAGE EN DIRECT'}
            {status === 'result' && 'RÉSULTATS DU TIRAGE'}
          </div>
        </div>
        <div className="okapi-draw-grid">
          {numbers.map((n) => {
            const hit = hits[n] ?? 'neutral';
            return (
              <div
                key={n}
                ref={(el) => { cellRefs.current[n] = el; }}
                className={`okapi-draw-cell okapi-draw-cell-${hit}`}
              >
                <span>{n}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
