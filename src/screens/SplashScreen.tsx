// FIFA World Cup 2026 splash — IHC Abu Dhabi · ADI PredictStreet co-branding.
import { useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { getSession } from '../lib/auth';

const BEBAS = "'Bebas Neue', sans-serif";
const BARLOW = "'Barlow Condensed', sans-serif";
const KICKOFF = new Date('2026-06-11T00:00:00Z').getTime();

type T = { d: string; h: string; m: string; s: string };
function diff(target: number): T {
  const ms = Math.max(0, target - Date.now());
  const sec = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    d: pad(Math.floor(sec / 86400)),
    h: pad(Math.floor((sec % 86400) / 3600)),
    m: pad(Math.floor((sec % 3600) / 60)),
    s: pad(sec % 60),
  };
}

const FIRE_COLORS = ['#ff6600', '#ff9900', '#ffcc00', '#ff4400'];
const rand = (min: number, max: number) => Math.random() * (max - min) + min;

type Particle = {
  left: number;
  bottom: number;
  size: number;
  color: string;
  opacity: number;
  duration: number;
  delay: number;
};

export default function SplashScreen() {
  const nav = useNavigate();
  const [t, setT] = useState<T>(() => diff(KICKOFF));

  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: 18 }, () => ({
        left: rand(0, 100),
        bottom: rand(0, 30),
        size: rand(2, 6),
        color: FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)],
        opacity: rand(0.2, 0.8),
        duration: rand(3, 7),
        delay: rand(0, 4),
      })),
    [],
  );

  useEffect(() => {
    if (getSession()) {
      nav('/', { replace: true });
      return;
    }
    const id = setInterval(() => setT(diff(KICKOFF)), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100dvh',
        background: '#04080f',
        color: '#ffffff',
        fontFamily: BARLOW,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <style>{KEYFRAMES}</style>

      {/* Background image */}
      <img
        src="/images/screensplash.jpg"
        alt=""
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: 0.55,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      {/* Overlay gradient */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(4,8,15,0.15) 0%, rgba(4,8,15,0.05) 25%, rgba(4,8,15,0.45) 58%, rgba(4,8,15,0.96) 78%, #04080f 100%)',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* Fire particles layer */}
      <div
        aria-hidden
        style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}
      >
        {particles.map((p, i) => (
          <span
            key={i}
            style={{
              position: 'absolute',
              left: `${p.left}%`,
              bottom: `${p.bottom}%`,
              width: p.size,
              height: p.size,
              borderRadius: '50%',
              background: p.color,
              opacity: p.opacity,
              boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
              animation: `splashFloat ${p.duration}s linear ${p.delay}s infinite`,
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div
        style={{
          position: 'relative',
          zIndex: 3,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100dvh',
        }}
      >
        {/* 1. Topbar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 16px',
            fontSize: 9,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.35)',
          }}
        >
          <span>DRC · Officiel</span>
          <span>Agréé MJS N°047/2016</span>
        </div>

        {/* 2. Spacer */}
        <div style={{ flex: 1 }} />

        {/* Centered stack */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '0 20px',
          }}
        >
          {/* 4. Title */}
          <h1
            style={{
              margin: 0,
              fontFamily: BEBAS,
              fontSize: 52,
              lineHeight: 0.85,
              letterSpacing: 4,
              color: '#ffffff',
              textAlign: 'center',
              textShadow: '0 0 60px rgba(255,255,255,0.15)',
              animation: 'splashFadeup 0.8s ease-out both',
            }}
          >
            CONGO GAMING
          </h1>

          {/* 5. Subtitle */}
          <div
            style={{
              fontFamily: BARLOW,
              fontWeight: 300,
              fontStyle: 'italic',
              fontSize: 11,
              letterSpacing: 5,
              color: 'rgba(255,255,255,0.45)',
              textTransform: 'uppercase',
              margin: '6px 0 14px',
              textAlign: 'center',
              animation: 'splashFadeup 0.9s ease-out both',
            }}
          >
            Prediction Market · DRC
          </div>

          {/* 6. FIFA tag */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 2,
              padding: '7px 18px',
              marginBottom: 16,
              fontSize: 11,
              letterSpacing: 3,
              color: '#ffffff',
              fontWeight: 700,
              fontFamily: BARLOW,
              animation: 'splashFadeup 1s ease-out both',
            }}
          >
            <span>★</span>
            <span>FIFA WORLD CUP 2026™ — OFFICIEL</span>
            <span>★</span>
          </div>

          {/* 7. Countdown */}
          <div
            style={{
              display: 'flex',
              animation: 'splashFadeup 1.1s ease-out both',
              marginBottom: 22,
            }}
          >
            {[
              { v: t.d, l: 'Jours' },
              { v: t.h, l: 'Heures' },
              { v: t.m, l: 'Min' },
              { v: t.s, l: 'Sec' },
            ].map((c, i) => (
              <div
                key={c.l}
                style={{
                  minWidth: 54,
                  padding: '10px 12px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '0.5px solid rgba(255,255,255,0.1)',
                  borderLeftWidth: i === 0 ? 0.5 : 0,
                  textAlign: 'center',
                }}
              >
                <div
                  key={c.v}
                  style={{
                    fontFamily: BEBAS,
                    fontSize: 34,
                    lineHeight: 1,
                    color: '#ffffff',
                    animation: 'splashDigitPop 0.45s ease-out',
                  }}
                >
                  {c.v}
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 8,
                    letterSpacing: 2,
                    color: 'rgba(255,255,255,0.3)',
                    textTransform: 'uppercase',
                    fontFamily: BARLOW,
                  }}
                >
                  {c.l}
                </div>
              </div>
            ))}
          </div>

          {/* 9. CTA primary */}
          <button
            type="button"
            onClick={() => nav('/register')}
            style={{
              width: '100%',
              maxWidth: 310,
              padding: 17,
              border: 'none',
              borderRadius: 3,
              background: '#ffffff',
              color: '#04080f',
              fontFamily: BEBAS,
              fontSize: 22,
              letterSpacing: 5,
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              boxShadow: '0 6px 30px rgba(255,255,255,0.2)',
              marginBottom: 10,
              animation: 'splashFadeup 1.3s ease-out both',
            }}
          >
            S'INSCRIRE
          </button>

          {/* 10. CTA secondary */}
          <button
            type="button"
            onClick={() => nav('/login')}
            style={{
              width: '100%',
              maxWidth: 310,
              padding: 14,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 3,
              color: 'rgba(255,255,255,0.6)',
              fontFamily: BEBAS,
              fontSize: 18,
              letterSpacing: 3,
              cursor: 'pointer',
              marginBottom: 16,
              animation: 'splashFadeup 1.4s ease-out both',
            }}
          >
            Déjà client — Se connecter
          </button>
        </div>

        {/* 11. Footer */}
        <div
          style={{
            paddingBottom: 14,
            paddingTop: 8,
            textAlign: 'center',
            fontSize: 9,
            letterSpacing: 1.5,
            color: 'rgba(255,255,255,0.18)',
            textTransform: 'uppercase',
            fontFamily: BARLOW,
          }}
        >
          Orange Money · Airtel · Africell&nbsp;&nbsp;|&nbsp;&nbsp;+18 ans · Jouez responsable
        </div>
      </div>
    </div>
  );
}

const KEYFRAMES = `
@keyframes splashFadeup {
  from { transform: translateY(16px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}
@keyframes splashPulse {
  0%, 100% { transform: scale(1);   opacity: 1;   }
  50%      { transform: scale(1.4); opacity: 0.5; }
}
@keyframes splashFirebreath {
  0%, 100% { opacity: 0.4; transform: scale(1);    }
  50%      { opacity: 1;   transform: scale(1.05); }
}
@keyframes splashShimmer {
  0%   { background-position: 0% 0%;   }
  100% { background-position: 200% 0%; }
}
@keyframes splashFireflicker {
  0%, 100% { opacity: 1;   transform: scale(1)   translateY(0);    }
  50%      { opacity: 0.6; transform: scale(1.3) translateY(-2px); }
}
@keyframes splashFloat {
  0%   { transform: translateY(0)      scale(1);   opacity: 0.7; }
  100% { transform: translateY(-120px) scale(0.3); opacity: 0;   }
}
@keyframes splashDigitPop {
  0%   { transform: scale(1);   }
  50%  { transform: scale(1.2); }
  100% { transform: scale(1);   }
}
`;
