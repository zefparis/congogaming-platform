import { useNavigate } from 'react-router-dom';
import { getSession } from '../lib/auth';

/* ── Design tokens ─────────────────────────────────────────── */
const BG     = '#080E1C';
const ORANGE = '#FF6B00';
const SANS   = "-apple-system, 'Inter', 'Segoe UI', sans-serif";
const BEBAS  = "'Bebas Neue', Impact, sans-serif";

/* ── ADI logo mark — minimal, clean ───────────────────────── */
function AdiMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" aria-hidden>
      <polygon points="40,2 78,40 40,78 2,40" fill="#1a42ff" />
      <polygon points="40,20 57,53 23,53" fill="white" opacity="0.95" />
      <rect x="37" y="42" width="6" height="10" rx="2" fill={BG} />
    </svg>
  );
}

export default function SplashScreen() {
  const nav = useNavigate();
  if (getSession()) nav('/', { replace: true });

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: `linear-gradient(180deg, ${BG} 0%, #0C1628 100%)`,
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: SANS,
        overflowX: 'hidden',
      }}
    >
      <style>{KEYFRAMES}</style>

      {/* Subtle top spotlight — barely-visible blue arc */}
      <div
        aria-hidden
        style={{
          position: 'fixed', top: 0, left: '25%',
          width: '50%', height: 180,
          background: 'radial-gradient(ellipse at 50% 0%, rgba(26,66,255,0.11) 0%, transparent 70%)',
          pointerEvents: 'none', zIndex: 0,
        }}
      />

      {/* ════ MAIN CONTENT ════ */}
      <div
        style={{
          position: 'relative', zIndex: 1,
          display: 'flex', flexDirection: 'column', flex: 1,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >

        {/* ── HEADER ──────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 20px 10px',
          }}
        >
          <span
            style={{
              fontFamily: SANS,
              fontSize: 12, fontWeight: 700, letterSpacing: 2.5,
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.85)',
            }}
          >
            Congo Gaming
          </span>
          <span
            style={{
              display: 'inline-flex', alignItems: 'center',
              border: '1px solid rgba(255,215,0,0.22)',
              borderRadius: 6, padding: '3px 8px',
              fontSize: 8.5, fontWeight: 700, letterSpacing: 0.6,
              color: 'rgba(255,215,0,0.65)',
            }}
          >
            🏆 FIFA WC 2026™
          </span>
        </div>

        {/* ── HERO — horizontal split ──────────────────────────── */}
        <div
          style={{
            flex: 1,
            display: 'flex', alignItems: 'flex-start',
            padding: '4px 0 0 20px',
            overflow: 'hidden',
            minHeight: 240,
          }}
        >
          {/* Left: headline + text */}
          <div
            style={{
              width: '53%', flexShrink: 0, paddingTop: 6,
              animation: 'aFadeUp 0.4s ease-out both',
            }}
          >
            {/* PREDICT wordmark */}
            <div
              style={{
                fontFamily: BEBAS,
                fontSize: 'clamp(54px, 14vw, 68px)',
                fontWeight: 900, lineHeight: 0.88,
                letterSpacing: -0.5, color: '#fff',
              }}
            >
              PREDICT
            </div>

            {/* Tagline */}
            <div
              style={{
                fontFamily: SANS,
                fontSize: 13, fontWeight: 600,
                color: ORANGE, letterSpacing: 0.1,
                marginTop: 12, lineHeight: 1.45,
                animation: 'aFadeUp 0.52s ease-out both',
              }}
            >
              Prédisez · Jouez<br />Gagnez en CDF.
            </div>

            {/* Sub-text */}
            <div
              style={{
                fontFamily: SANS,
                fontSize: 11.5, fontWeight: 400,
                color: 'rgba(255,255,255,0.42)',
                marginTop: 10, lineHeight: 1.6,
                animation: 'aFadeUp 0.64s ease-out both',
              }}
            >
              La nouvelle expérience<br />de prédiction sportive<br />pour la CdM 2026.
            </div>

            {/* Official badge */}
            <div style={{ marginTop: 16, animation: 'aFadeUp 0.74s ease-out both' }}>
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center',
                  background: 'rgba(255,215,0,0.05)',
                  border: '1px solid rgba(255,215,0,0.18)',
                  borderRadius: 5, padding: '4px 9px',
                  fontSize: 8.5, fontWeight: 700, letterSpacing: 0.5,
                  color: 'rgba(255,215,0,0.65)',
                  whiteSpace: 'nowrap',
                }}
              >
                🏆 Official FIFA WC 2026™
              </span>
            </div>
          </div>

          {/* Right: phone mockup */}
          <div
            style={{
              flex: 1, position: 'relative',
              animation: 'aFadeUp 0.56s ease-out both',
            }}
          >
            <img
              src="/assets/phone mockup.png"
              alt="PredictStreet"
              style={{
                width: '100%', height: 'auto',
                objectFit: 'contain', objectPosition: 'right top',
                display: 'block',
                filter: 'drop-shadow(0 10px 28px rgba(0,0,0,0.55))',
              }}
            />

            {/* ── In-phone screen background — stadium atmosphere ── */}
            <div
              aria-hidden
              style={{
                position: 'absolute', top: '12%', bottom: '8%',
                left: '8%', right: '8%',
                zIndex: 2,
                background: '#06101E',
                borderRadius: '3% / 2%',
                overflow: 'hidden',
              }}
            >
              {/* Floodlight bloom — top center (cold white, very faint) */}
              <div
                style={{
                  position: 'absolute', top: '-5%', left: '15%', right: '15%', height: '55%',
                  background: 'radial-gradient(ellipse at 50% 0%, rgba(200,220,255,0.10) 0%, transparent 65%)',
                  pointerEvents: 'none',
                }}
              />
              {/* Second bloom — top right corner */}
              <div
                style={{
                  position: 'absolute', top: '-5%', right: '-15%', width: '65%', height: '45%',
                  background: 'radial-gradient(ellipse at 90% 0%, rgba(140,180,255,0.07) 0%, transparent 60%)',
                  pointerEvents: 'none',
                }}
              />
              {/* Pitch markings — SVG, barely visible */}
              <svg
                style={{
                  position: 'absolute', top: '22%', left: 0, width: '100%', height: '55%',
                  opacity: 0.045,
                }}
                viewBox="0 0 100 70"
                fill="none"
                preserveAspectRatio="xMidYMid meet"
              >
                {/* Center line */}
                <line x1="0" y1="35" x2="100" y2="35" stroke="white" strokeWidth="0.6" />
                {/* Center circle */}
                <circle cx="50" cy="35" r="16" stroke="white" strokeWidth="0.6" fill="none" />
                {/* Center spot */}
                <circle cx="50" cy="35" r="1.2" fill="white" />
                {/* Penalty areas */}
                <rect x="30" y="0" width="40" height="18" stroke="white" strokeWidth="0.6" fill="none" />
                <rect x="30" y="52" width="40" height="18" stroke="white" strokeWidth="0.6" fill="none" />
              </svg>
              {/* Bottom fade — dark vignette to ground the screen */}
              <div
                style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%',
                  background: 'linear-gradient(to bottom, transparent, rgba(6,16,30,0.75) 60%, #06101E 100%)',
                  pointerEvents: 'none',
                }}
              />
            </div>

            {/* ── Top prediction card (unchanged) ── */}
            <div
              style={{
                position: 'absolute', top: '13%', left: '9%', right: '9%', zIndex: 3,
                background: 'rgba(8,14,28,0.96)',
                border: '1px solid rgba(255,255,255,0.09)',
                borderRadius: 10, padding: '9px 10px',
              }}
            >
              {/* Live indicator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                <span
                  style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: '#22c55e', flexShrink: 0,
                    display: 'inline-block',
                    animation: 'aPulse 1.6s ease-in-out infinite',
                  }}
                />
                <span
                  style={{
                    fontFamily: SANS,
                    fontSize: 8, fontWeight: 600, letterSpacing: 0.4,
                    color: 'rgba(255,255,255,0.38)',
                  }}
                >
                  P2P · JUNE 15
                </span>
              </div>

              {/* Teams */}
              <div
                style={{
                  textAlign: 'center', fontSize: 14,
                  letterSpacing: 0.5, marginBottom: 7, fontWeight: 600,
                }}
              >
                🇨🇩 vs 🇧🇷
              </div>

              {/* Probability bar */}
              <div
                style={{
                  display: 'flex', borderRadius: 3, overflow: 'hidden',
                  height: 4, marginBottom: 5,
                }}
              >
                <div style={{ width: '54%', background: '#2563eb' }} />
                <div style={{ flex: 1, background: '#15803d' }} />
              </div>
              <div
                style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontFamily: SANS,
                  fontSize: 8.5, color: 'rgba(255,255,255,0.38)',
                  marginBottom: 8,
                }}
              >
                <span>🇨🇩 54%</span>
                <span>🇧🇷 46%</span>
              </div>

              {/* PREDICT NOW */}
              <div
                style={{
                  background: ORANGE, borderRadius: 6, padding: '6px 0',
                  textAlign: 'center',
                  fontFamily: SANS, fontSize: 9, fontWeight: 700, letterSpacing: 0.8,
                  color: '#fff',
                }}
              >
                Predict now
              </div>
            </div>

            {/* ── Lower strip — live matches ── */}
            <div
              style={{
                position: 'absolute', bottom: '10%', left: '9%', right: '9%', zIndex: 3,
                background: 'rgba(6,16,30,0.88)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 8, padding: '7px 9px',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
              }}
            >
              {/* Header */}
              <div
                style={{
                  fontFamily: SANS, fontSize: 7, fontWeight: 700,
                  letterSpacing: 1.2, color: 'rgba(255,255,255,0.3)',
                  textTransform: 'uppercase', marginBottom: 6,
                }}
              >
                Marchés en direct
              </div>

              {/* Row 1 — LIVE */}
              <div
                style={{
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between', marginBottom: 5,
                }}
              >
                <span style={{ fontFamily: SANS, fontSize: 9, color: 'rgba(255,255,255,0.72)', letterSpacing: 0.2 }}>
                  🇧🇷 BR · PT 🇵🇹
                </span>
                <span
                  style={{
                    fontFamily: SANS, fontSize: 7, fontWeight: 700, letterSpacing: 0.5,
                    color: '#22c55e',
                    background: 'rgba(34,197,94,0.12)',
                    padding: '1px 5px', borderRadius: 3,
                  }}
                >
                  LIVE
                </span>
              </div>

              {/* Row 2 — upcoming */}
              <div
                style={{
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ fontFamily: SANS, fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.2 }}>
                  🇫🇷 FR · DE 🇩🇪
                </span>
                <span style={{ fontFamily: SANS, fontSize: 7.5, color: 'rgba(255,255,255,0.25)' }}>
                  21:00
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── SEPARATOR ───────────────────────────────────────── */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '16px 0 0' }} />

        {/* ── ADI CO-BRANDING ──────────────────────────────────── */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 11,
            padding: '13px 20px 11px',
          }}
        >
          <AdiMark size={28} />
          <div>
            <div
              style={{
                fontFamily: SANS,
                fontSize: 11, fontWeight: 700, letterSpacing: 1.6,
                textTransform: 'uppercase', color: 'rgba(255,255,255,0.82)',
              }}
            >
              ADI PredictStreet
            </div>
            <div
              style={{
                fontFamily: SANS,
                fontSize: 10, color: 'rgba(255,255,255,0.33)',
                marginTop: 2,
              }}
            >
              Powered by ADI PredictStreet
            </div>
          </div>
        </div>

        {/* ── CTA BUTTONS ─────────────────────────────────────── */}
        <div
          style={{
            padding: '2px 20px 10px',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}
        >
          {/* Primary — solid orange, no gradient */}
          <button
            type="button"
            onClick={() => nav('/register')}
            style={{
              width: '100%', padding: '16px 0',
              background: ORANGE, border: 'none', borderRadius: 14,
              color: '#fff', fontFamily: SANS,
              fontSize: 15, fontWeight: 700, letterSpacing: 0.8,
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(255,107,0,0.28)',
            }}
          >
            Jouer maintenant
          </button>

          {/* Secondary — ghost */}
          <button
            type="button"
            onClick={() => nav('/login')}
            style={{
              width: '100%', padding: '13px 0',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 14,
              color: 'rgba(255,255,255,0.48)',
              fontFamily: SANS,
              fontSize: 13, fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            En savoir plus — Se connecter
          </button>
        </div>

        {/* ── CONGO GAMING TEASER ─────────────────────────────── */}
        <div style={{ padding: '12px 20px 24px', animation: 'aFadeUp 1.1s ease-out both' }}>
          <div
            style={{
              position: 'relative',
              overflow: 'hidden',
              borderRadius: 24,
              background: 'linear-gradient(135deg, #0A1120 0%, #050810 100%)',
              border: '1px solid rgba(255,255,255,0.07)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              minHeight: 140,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '24px 24px',
            }}
          >
            {/* Image Layer */}
            <div
              aria-hidden
              style={{
                position: 'absolute',
                top: 0, right: 0, bottom: 0, left: '10%',
                backgroundImage: 'url(/images/okapiscreen.png)',
                backgroundSize: 'cover',
                backgroundPosition: 'right center',
                opacity: 0.55,
                zIndex: 0,
              }}
            />
            {/* Gradient fade to ensure text readability */}
            <div
              aria-hidden
              style={{
                position: 'absolute',
                top: 0, right: 0, bottom: 0, left: 0,
                background: 'linear-gradient(to right, #0A1120 15%, rgba(10,17,32,0.6) 50%, transparent 85%)',
                zIndex: 1,
              }}
            />

            {/* Content Layer */}
            <div style={{ position: 'relative', zIndex: 2, maxWidth: '80%' }}>
              <div
                style={{
                  fontFamily: SANS,
                  fontSize: 15,
                  fontWeight: 700,
                  letterSpacing: 0.2,
                  color: 'rgba(255,255,255,0.95)',
                  marginBottom: 6,
                  lineHeight: 1.25,
                }}
              >
                Découvrez l’univers<br />Congo Gaming
              </div>
              <div
                style={{
                  fontFamily: SANS,
                  fontSize: 11.5,
                  color: 'rgba(255,255,255,0.45)',
                  lineHeight: 1.45,
                }}
              >
                Loto Express · Okapi Climb<br />Jeux rapides
              </div>

              {/* Tiny subtle link */}
              <div
                onClick={() => nav('/login')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  marginTop: 14,
                  fontFamily: SANS,
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.65)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                  cursor: 'pointer',
                }}
              >
                Explorer les jeux <span style={{ marginLeft: 4, color: ORANGE }}>→</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── FOOTER ──────────────────────────────────────────── */}
        <div
          style={{
            textAlign: 'center', fontFamily: SANS,
            fontSize: 10, color: 'rgba(255,255,255,0.2)',
            padding: '2px 20px 16px', lineHeight: 1.85,
          }}
        >
          Congo Gaming × ADI PredictStreet<br />
          Agréé MJS N°047/2016 · DRC Officiel · FIFA WC 2026™
        </div>

      </div>
    </div>
  );
}

const KEYFRAMES = `
@keyframes aFadeUp {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes aPulse {
  0%, 100% { opacity: 1;   transform: scale(1);   }
  50%       { opacity: 0.3; transform: scale(0.6); }
}
`;
