import { useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { getSession } from '../lib/auth';

const E_BLUE   = '#013CFF';
const E_ORANGE = '#FF710A';
const NAVY     = '#010820';
const BEBAS    = "'Bebas Neue', Impact, sans-serif";

/* ── Inline ADI logo mark (diamond + prediction arrow) ── */
function AdiLogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      aria-label="ADI PredictStreet"
    >
      <defs>
        <linearGradient id="adiMarkG" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={E_BLUE} />
          <stop offset="100%" stopColor={E_ORANGE} />
        </linearGradient>
      </defs>
      {/* Diamond / losange */}
      <polygon points="40,2 78,40 40,78 2,40" fill="url(#adiMarkG)" />
      {/* Prediction arrow — upward triangle */}
      <polygon points="40,19 58,54 22,54" fill="white" opacity="0.95" />
      {/* Center pin notch */}
      <rect x="36.5" y="42" width="7" height="11" rx="2.5" fill={NAVY} />
      {/* Highlight dot at tip */}
      <circle cx="40" cy="23" r="2.5" fill="white" opacity="0.55" />
    </svg>
  );
}

export default function SplashScreen() {
  const nav = useNavigate();

  if (getSession()) {
    nav('/', { replace: true });
  }

  const particles = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 1.5 + Math.random() * 2.5,
        isBlue: i % 3 !== 2,
        opacity: 0.07 + Math.random() * 0.2,
        dur: 7 + Math.random() * 9,
        del: Math.random() * 7,
      })),
    [],
  );

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100dvh',
        background: `linear-gradient(160deg, ${NAVY} 0%, ${E_BLUE} 65%, ${E_ORANGE} 100%)`,
        color: '#fff',
        overflowX: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Barlow Condensed', sans-serif",
      }}
    >
      <style>{KEYFRAMES}</style>

      {/* — Noise texture overlay — */}
      <div
        aria-hidden
        style={{
          position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
          opacity: 0.045,
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='256' height='256'%3E%3Cfilter id='n' x='0' y='0'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='256' height='256' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '256px',
        }}
      />

      {/* — Ambient glow orbs — */}
      <div
        aria-hidden
        style={{
          position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
          background:
            `radial-gradient(ellipse at 78% 28%, rgba(1,60,255,0.22) 0%, transparent 55%),` +
            `radial-gradient(ellipse at 18% 72%, rgba(255,113,10,0.15) 0%, transparent 50%)`,
        }}
      />

      {/* — Particles — */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        {particles.map((p) => (
          <span
            key={p.id}
            style={{
              position: 'absolute',
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              borderRadius: '50%',
              background: p.isBlue ? E_BLUE : E_ORANGE,
              opacity: p.opacity,
              boxShadow: `0 0 ${p.size * 5}px ${p.isBlue ? E_BLUE : E_ORANGE}99`,
              animation: `aDrift ${p.dur}s ease-in-out ${p.del}s infinite alternate`,
            }}
          />
        ))}
      </div>

      {/* ════ CONTENT ════ */}
      <div
        style={{
          position: 'relative', zIndex: 1,
          display: 'flex', flexDirection: 'column', flex: 1,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >

        {/* ── TOP BAR ── */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px 6px',
          }}
        >
          <span
            style={{
              fontFamily: BEBAS,
              fontSize: 20, letterSpacing: 3,
              textShadow: `0 0 28px rgba(1,60,255,0.75)`,
            }}
          >
            CONGO GAMING
          </span>
          <span
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.14), rgba(255,255,255,0.04))',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,215,0,0.32)',
              borderRadius: 20,
              padding: '3px 9px',
              fontSize: 8, fontWeight: 800, letterSpacing: 1,
              color: '#FFD700',
              whiteSpace: 'nowrap',
            }}
          >
            🏆 OFFICIEL FIFA WC 2026™
          </span>
        </div>

        {/* ── HERO + PHONE (split layout) ── */}
        <div
          style={{
            flex: 1, position: 'relative',
            display: 'flex', alignItems: 'flex-start',
            padding: '6px 16px 0',
            overflow: 'hidden',
            minHeight: 220,
          }}
        >
          {/* Left: Hero text */}
          <div style={{ width: '55%', paddingTop: 6, position: 'relative', zIndex: 2 }}>
            <div
              style={{
                fontFamily: BEBAS,
                fontSize: 'clamp(66px, 19vw, 84px)',
                fontWeight: 900,
                lineHeight: 0.88,
                letterSpacing: -1,
                textShadow: `0 0 55px rgba(1,60,255,0.65), 0 3px 18px rgba(0,0,0,0.45)`,
                animation: 'aFadeUp 0.5s ease-out both',
              }}
            >
              PREDICT
            </div>

            <div
              style={{
                fontFamily: BEBAS,
                fontSize: 'clamp(13px, 3.8vw, 16px)',
                fontWeight: 900,
                letterSpacing: 2,
                color: E_ORANGE,
                textShadow: `0 0 18px rgba(255,113,10,0.75)`,
                marginTop: 6,
                lineHeight: 1.15,
                animation: 'aFadeUp 0.62s ease-out both',
              }}
            >
              AT THE SPEED<br />OF PLAY
            </div>

            <div
              style={{
                fontSize: 11,
                color: 'rgba(255,255,255,0.58)',
                marginTop: 8,
                lineHeight: 1.5,
                animation: 'aFadeUp 0.74s ease-out both',
              }}
            >
              Pariez sur la Coupe<br />du Monde en CDF
            </div>
          </div>

          {/* Right: Phone mockup + P2P market overlay */}
          <div
            style={{
              position: 'absolute',
              right: 0, top: 0, bottom: 0,
              width: '52%',
              animation: 'aFadeUp 0.78s ease-out both',
            }}
          >
            {/* Glow behind phone */}
            <div
              aria-hidden
              style={{
                position: 'absolute',
                top: '8%', left: '8%',
                width: '84%', height: '76%',
                borderRadius: '50%',
                background: `radial-gradient(ellipse, rgba(1,60,255,0.4) 0%, rgba(255,113,10,0.2) 52%, transparent 70%)`,
                filter: 'blur(24px)',
                pointerEvents: 'none',
              }}
            />

            {/* Phone image */}
            <img
              src="/assets/phone mockup.png"
              alt="ADI PredictStreet app"
              style={{
                position: 'absolute',
                top: 0, right: 0,
                height: '100%', width: 'auto',
                objectFit: 'contain',
                objectPosition: 'right top',
                zIndex: 1,
                filter:
                  `drop-shadow(0 0 16px rgba(1,60,255,0.55))` +
                  ` drop-shadow(0 6px 22px rgba(0,0,0,0.42))`,
              }}
            />

            {/* P2P market simulation card — overlaid on phone screen area */}
            <div
              style={{
                position: 'absolute',
                top: '14%',
                right: '10%',
                left: '12%',
                zIndex: 3,
                background: 'rgba(1,8,32,0.91)',
                border: `1px solid rgba(1,60,255,0.55)`,
                borderRadius: 10,
                padding: '8px 8px 7px',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.55)',
              }}
            >
              {/* Live indicator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <span
                  style={{
                    width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                    background: '#00ff88',
                    boxShadow: '0 0 6px #00ff88',
                    display: 'inline-block',
                    animation: 'aPulse 1.4s ease-in-out infinite',
                  }}
                />
                <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: 1, color: E_ORANGE }}>
                  P2P · JUNE 15
                </span>
              </div>

              {/* Match flags */}
              <div style={{ textAlign: 'center', fontSize: 15, marginBottom: 5, letterSpacing: 1 }}>
                🇨🇩 vs 🇧🇷
              </div>

              {/* Odds bar */}
              <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', height: 7, marginBottom: 3 }}>
                <div
                  style={{
                    width: '54%',
                    background: `linear-gradient(90deg, ${E_BLUE}aa, ${E_BLUE})`,
                  }}
                />
                <div
                  style={{
                    flex: 1,
                    background: 'linear-gradient(90deg, #166534, #22c55e)',
                  }}
                />
              </div>
              <div
                style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontSize: 9, marginBottom: 6,
                }}
              >
                <span style={{ color: '#93c5fd' }}>🇨🇩 54%</span>
                <span style={{ color: '#86efac' }}>🇧🇷 46%</span>
              </div>

              {/* PREDICT NOW CTA inside phone */}
              <div
                style={{
                  background: `linear-gradient(135deg, ${E_BLUE}, ${E_ORANGE})`,
                  borderRadius: 5,
                  padding: '5px 0',
                  textAlign: 'center',
                  fontSize: 9, fontWeight: 900, letterSpacing: 1.5,
                  color: '#fff',
                  fontFamily: BEBAS,
                }}
              >
                PREDICT NOW
              </div>
            </div>
          </div>
        </div>

        {/* ── ADI CO-BRANDING ── */}
        <div
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '10px 16px 8px',
            borderTop: '1px solid rgba(255,255,255,0.07)',
            animation: 'aFadeUp 0.9s ease-out both',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
            <AdiLogoMark size={34} />
            <div>
              <div
                style={{
                  fontFamily: BEBAS,
                  fontSize: 17, letterSpacing: 2, color: '#fff', lineHeight: 1,
                }}
              >
                ADI PREDICTSTREET
              </div>
              <div
                style={{
                  fontSize: 9.5, color: 'rgba(255,255,255,0.42)',
                  letterSpacing: 0.4, marginTop: 1,
                }}
              >
                Powered by ADI PredictStreet
              </div>
            </div>
          </div>
          <span
            style={{
              background: 'rgba(255,215,0,0.08)',
              border: '1px solid rgba(255,215,0,0.22)',
              borderRadius: 20,
              padding: '3px 11px',
              fontSize: 8, fontWeight: 700, letterSpacing: 1, color: '#FFD700',
            }}
          >
            Official Partner FIFA World Cup 2026™
          </span>
        </div>

        {/* ── CTA BUTTONS ── */}
        <div
          style={{
            padding: '4px 16px 8px',
            display: 'flex', flexDirection: 'column', gap: 9,
            animation: 'aFadeUp 1.0s ease-out both',
          }}
        >
          <button
            type="button"
            onClick={() => nav('/register')}
            style={{
              width: '100%', padding: '15px 0',
              border: 'none', borderRadius: 12,
              background: `linear-gradient(135deg, ${E_BLUE} 0%, ${E_ORANGE} 100%)`,
              color: '#fff',
              fontFamily: BEBAS,
              fontSize: 22, letterSpacing: 5,
              cursor: 'pointer',
              boxShadow: `0 6px 28px rgba(1,60,255,0.44), 0 2px 12px rgba(255,113,10,0.24)`,
            }}
          >
            JOUER MAINTENANT
          </button>

          <button
            type="button"
            onClick={() => nav('/login')}
            style={{
              width: '100%', padding: '11px 0',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.26)',
              borderRadius: 12,
              color: 'rgba(255,255,255,0.6)',
              fontFamily: BEBAS,
              fontSize: 15, letterSpacing: 3,
              cursor: 'pointer',
            }}
          >
            EN SAVOIR PLUS — SE CONNECTER
          </button>
        </div>

        {/* ── FOOTER ── */}
        <div
          style={{
            textAlign: 'center',
            fontSize: 8.5, letterSpacing: 1,
            color: 'rgba(255,255,255,0.17)',
            textTransform: 'uppercase',
            padding: '2px 16px 14px',
            lineHeight: 1.9,
          }}
        >
          <div>Congo Gaming × ADI PredictStreet</div>
          <div>Agréé MJS N°047/2016 · DRC Officiel</div>
          <div>FIFA World Cup 2026™ Official Licensed Partner</div>
        </div>

      </div>
    </div>
  );
}

const KEYFRAMES = `
@keyframes aFadeUp {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes aDrift {
  0%   { transform: translate(0px,    0px)   scale(1);   }
  50%  { transform: translate(5px,  -15px)   scale(1.1); }
  100% { transform: translate(-3px,   6px)   scale(0.9); }
}
@keyframes aPulse {
  0%, 100% { opacity: 1;   transform: scale(1);   }
  50%       { opacity: 0.4; transform: scale(0.7); }
}
`;
