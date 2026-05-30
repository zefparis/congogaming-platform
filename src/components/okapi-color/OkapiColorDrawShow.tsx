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

  // Always-current refs so the animation effect can read latest numbers
  // without those arrays being in the effect's dependency array.
  const redRef  = useRef<number[]>([]);
  const goldRef = useRef<number[]>([]);
  redRef.current  = cleanRedNumbers;
  goldRef.current = cleanGoldNumbers;

  // ─── Status / drawKey effect ─────────────────────────────────────────────
  // deps: ONLY drawKey, status, isTv, onComplete — NOT the number arrays.
  // This prevents every 2-second poll from killing the GSAP timeline.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (status === 'result') {
      timelineRef.current?.kill();
      timelineRef.current = null;
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
      return;
    }

    if (status !== 'drawing') return;
    if (!drawKey || lastAnimatedDrawKeyRef.current === drawKey) return;
    if (!rootRef.current || !ballLayerRef.current) return;

    const reds  = redRef.current.slice(0, 6);
    const golds = goldRef.current.slice(0, 4);

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
    const duration = isTv ? 2.0 : 1.4;   // visible travel time per ball
    const gap      = isTv ? 0.7 : 0.48;  // pause after each impact before next ball

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
      ball.textContent = String(item.number);
      ball.className = `okapi-draw-ball okapi-draw-ball-${item.color}`;
      ball.style.width = `${size}px`;
      ball.style.height = `${size}px`;
      ball.style.marginLeft = `${-size / 2}px`;
      ball.style.marginTop = `${-size / 2}px`;
      ballLayerRef.current.appendChild(ball);

      tl.set(ball, { x: startX, y: startY, scale: 0.72, opacity: 0, rotate: 0 })
        .to(ball, { opacity: 1, scale: 1, duration: 0.18, ease: 'power2.out' })
        .to(ball, {
          keyframes: [
            { x: bounceOneX, y: bounceOneY, rotate: item.color === 'red' ? 200 : -200, scale: 1.1,  duration: duration * 0.32, ease: 'power2.out' },
            { x: bounceTwoX, y: bounceTwoY, rotate: item.color === 'red' ? 420 : -420, scale: 0.96, duration: duration * 0.28, ease: 'power1.inOut' },
            { x: targetX,    y: targetY,    rotate: item.color === 'red' ? 720 : -720, scale: 0.82, duration: duration * 0.4,  ease: 'power3.in' },
          ],
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
      ballLayerRef.current?.querySelectorAll('.okapi-draw-ball').forEach((b) => b.remove());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawKey, status, isTv, onComplete]);

  return (
    <div ref={rootRef} className={`okapi-draw-show okapi-draw-show-${mode}`}>
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
        .okapi-draw-ball-red  { color: white;   background: radial-gradient(circle at 30% 25%, #fecaca, #ef4444 35%, #7f1d1d 78%); box-shadow: 0 0 34px rgba(239,68,68,0.95),  0 18px 30px rgba(0,0,0,0.42); }
        .okapi-draw-ball-gold { color: #090909; background: radial-gradient(circle at 30% 25%, #fff7ad, #fbbf24 35%, #92400e 78%); box-shadow: 0 0 34px rgba(251,191,36,0.95), 0 18px 30px rgba(0,0,0,0.42); }

        /* ── TV mode ─────────────────────────────────────────────────────────── */
        .okapi-draw-show-tv { min-height: min(74vh, 760px); border-radius: 34px; }
        .okapi-draw-show-tv .okapi-draw-content  { padding: clamp(22px,3vw,44px);   gap: clamp(18px,2.2vw,30px); }
        .okapi-draw-show-tv .okapi-draw-kicker   { font-size: clamp(18px,2.6vw,36px); letter-spacing: 7px; }
        .okapi-draw-show-tv .okapi-draw-message  { font-size: clamp(18px,2.6vw,34px); letter-spacing: 5px; }
        .okapi-draw-show-tv .okapi-draw-grid     { grid-template-columns: repeat(8, minmax(0,1fr)); gap: clamp(10px,1.35vw,20px); }
        .okapi-draw-show-tv .okapi-draw-cell     { border-radius: 22px; font-size: clamp(34px,5.3vw,78px); }
        .okapi-draw-show-tv .okapi-draw-badge    { position: absolute; top: 10px; right: 12px; font-family: system-ui,sans-serif; font-weight: 900; font-size: clamp(10px,1.1vw,16px); letter-spacing: 0.08em; opacity: 0.82; }
        .okapi-draw-show-tv .okapi-draw-ball     { font-size: 42px; }

        /* ── Mobile mode ─────────────────────────────────────────────────────── */
        .okapi-draw-show-mobile { min-height: 480px; border-radius: 22px; }
        .okapi-draw-show-mobile .okapi-draw-content { padding: 18px; gap: 14px; }
        .okapi-draw-show-mobile .okapi-draw-kicker  { font-size: 15px; letter-spacing: 1.5px; }
        .okapi-draw-show-mobile .okapi-draw-message { font-size: 14px; letter-spacing: 1.5px; }
        .okapi-draw-show-mobile .okapi-draw-grid    { grid-template-columns: repeat(4, minmax(0,1fr)); gap: 10px; }
        .okapi-draw-show-mobile .okapi-draw-cell    { border-radius: 14px; font-size: clamp(24px,6.5vw,40px); }
        .okapi-draw-show-mobile .okapi-draw-badge   { position: absolute; top: 5px; right: 7px; font-family: system-ui,sans-serif; font-weight: 900; font-size: 9px; letter-spacing: 0.08em; opacity: 0.82; }
        .okapi-draw-show-mobile .okapi-draw-ball    { font-size: 24px; }
      `}</style>
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
                {hit === 'redHit' && <span className="okapi-draw-badge">ROUGE</span>}
                {hit === 'goldHit' && <span className="okapi-draw-badge">OR</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
