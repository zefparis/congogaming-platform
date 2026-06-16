import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSession } from '../lib/auth';

/* ── Design tokens ─────────────────────────────────────────── */
const BG = '#080E1C';
const BG_2 = '#0C1628';
const ORANGE = '#FF6B00';
const SANS = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif";
const BEBAS = "'Bebas Neue', Impact, sans-serif";

/* ── Helper animations ─────────────────────────────────────── */
const fadeUp = (delay = 0) => ({
  animation: `aFadeUp 0.4s ease-out ${delay}s both`
});

/* ── ADI logo mark ─────────────────────────────────────────── */
function AdiMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" aria-hidden="true">
      <polygon points="40,2 78,40 40,78 2,40" fill="#1a42ff" />
      <polygon points="40,20 57,53 23,53" fill="white" opacity="0.95" />
      <rect x="37" y="42" width="6" height="10" rx="2" fill={BG} />
    </svg>
  );
}

export default function SplashScreen() {
  const nav = useNavigate();

  useEffect(() => {
    if (getSession()) {
      nav('/', { replace: true });
    }
  }, [nav]);

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: `linear-gradient(180deg, ${BG} 0%, ${BG_2} 100%)`,
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: SANS,
        overflowX: 'hidden',
      }}
    >
      <style>{KEYFRAMES}</style>

      {/* Ambient top spotlight */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 0,
          left: '22%',
          width: '56%',
          height: 190,
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(26,66,255,0.12) 0%, transparent 72%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* ── HEADER ─────────────────────────────────────────── */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px 10px',
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 2.8,
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.86)',
            }}
          >
            Congo Gaming
          </span>

          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              border: '1px solid rgba(255,215,0,0.22)',
              background: 'rgba(255,215,0,0.035)',
              borderRadius: 8,
              padding: '4px 9px',
              fontSize: 8.5,
              fontWeight: 800,
              letterSpacing: 0.6,
              color: 'rgba(255,215,0,0.68)',
              whiteSpace: 'nowrap',
            }}
          >
            🏆 FIFA WC 2026™
          </span>
        </header>

        {/* ── HERO ───────────────────────────────────────────── */}
        <main
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'flex-start',
            padding: '8px 0 0 20px',
            overflow: 'hidden',
            minHeight: 260,
          }}
        >
          {/* Left content */}
          <section style={{ width: '53%', flexShrink: 0, paddingTop: 8, ...fadeUp(0) }}>
            <div
              style={{
                fontFamily: BEBAS,
                fontSize: 'clamp(56px, 14vw, 72px)',
                fontWeight: 900,
                lineHeight: 0.88,
                letterSpacing: -0.5,
                color: '#fff',
              }}
            >
              PREDICT
            </div>

            <div
              style={{
                fontSize: 13.5,
                fontWeight: 700,
                color: ORANGE,
                marginTop: 14,
                lineHeight: 1.45,
                ...fadeUp(0.12)
              }}
            >
              Prédisez · Jouez
              <br />
              Gagnez en CDF.
            </div>

            <div
              style={{
                fontSize: 11.5,
                fontWeight: 400,
                color: 'rgba(255,255,255,0.6)',
                marginTop: 11,
                lineHeight: 1.65,
                ...fadeUp(0.24)
              }}
            >
              La nouvelle expérience
              <br />
              de prédiction sportive
              <br />
              pour la CdM 2026.
            </div>

            <div style={{ marginTop: 17, ...fadeUp(0.34) }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  background: 'rgba(255,215,0,0.05)',
                  border: '1px solid rgba(255,215,0,0.18)',
                  borderRadius: 7,
                  padding: '5px 10px',
                  fontSize: 8.5,
                  fontWeight: 800,
                  letterSpacing: 0.5,
                  color: 'rgba(255,215,0,0.66)',
                  whiteSpace: 'nowrap',
                }}
              >
                🏆 Official FIFA WC 2026™
              </span>
            </div>
          </section>

          {/* Phone mockup */}
          <section
            aria-label="Aperçu PredictStreet"
            style={{ flex: 1, position: 'relative', ...fadeUp(0.16) }}
          >
            <img
              src="/assets/phone-mockup.png"
              alt="Aperçu mobile PredictStreet"
              width={400}
              height={800}
              loading="eager"
              style={{
                width: '100%',
                height: 'auto',
                objectFit: 'contain',
                objectPosition: 'right top',
                display: 'block',
                filter: 'drop-shadow(0 12px 30px rgba(0,0,0,0.58))',
              }}
            />

            {/* In-phone dark stadium screen */}
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: '12%',
                bottom: '8%',
                left: '8%',
                right: '8%',
                zIndex: 2,
                background: '#06101E',
                borderRadius: '3% / 2%',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '-5%',
                  left: '12%',
                  right: '12%',
                  height: '56%',
                  background:
                    'radial-gradient(ellipse at 50% 0%, rgba(200,220,255,0.10) 0%, transparent 65%)',
                }}
              />

              <div
                style={{
                  position: 'absolute',
                  top: '-6%',
                  right: '-16%',
                  width: '66%',
                  height: '46%',
                  background:
                    'radial-gradient(ellipse at 90% 0%, rgba(140,180,255,0.075) 0%, transparent 62%)',
                }}
              />

              <svg
                style={{
                  position: 'absolute',
                  top: '25%',
                  left: 0,
                  width: '100%',
                  height: '54%',
                  opacity: 0.045,
                }}
                viewBox="0 0 100 70"
                fill="none"
                preserveAspectRatio="xMidYMid meet"
              >
                <line x1="0" y1="35" x2="100" y2="35" stroke="white" strokeWidth="0.6" />
                <circle cx="50" cy="35" r="16" stroke="white" strokeWidth="0.6" />
                <circle cx="50" cy="35" r="1.2" fill="white" />
                <rect x="30" y="0" width="40" height="18" stroke="white" strokeWidth="0.6" />
                <rect x="30" y="52" width="40" height="18" stroke="white" strokeWidth="0.6" />
              </svg>

              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'linear-gradient(to bottom, rgba(6,16,30,0.05), rgba(6,16,30,0.2) 42%, rgba(6,16,30,0.88) 100%)',
                }}
              />
            </div>

            {/* Prediction card */}
            <div
              style={{
                position: 'absolute',
                top: '13%',
                left: '9%',
                right: '9%',
                zIndex: 3,
                background: 'rgba(8,14,28,0.96)',
                border: '1px solid rgba(255,255,255,0.095)',
                borderRadius: 11,
                padding: '9px 10px',
                boxShadow: '0 10px 26px rgba(0,0,0,0.28)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: '#22c55e',
                    display: 'inline-block',
                    animation: 'aPulse 1.6s ease-in-out infinite',
                  }}
                />
                <span
                  style={{
                    fontSize: 8,
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    color: 'rgba(255,255,255,0.38)',
                  }}
                >
                  P2P · JUNE 15
                </span>
              </div>

              <div
                style={{
                  textAlign: 'center',
                  fontSize: 14,
                  letterSpacing: 0.5,
                  marginBottom: 7,
                  fontWeight: 700,
                }}
              >
                🇨🇩 vs 🇧🇷
              </div>

              <div
                style={{
                  display: 'flex',
                  borderRadius: 4,
                  overflow: 'hidden',
                  height: 4,
                  marginBottom: 5,
                }}
              >
                <div style={{ width: '54%', background: '#2563eb' }} />
                <div style={{ flex: 1, background: '#15803d' }} />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 8.5,
                  color: 'rgba(255,255,255,0.4)',
                  marginBottom: 8,
                }}
              >
                <span>🇨🇩 54%</span>
                <span>🇧🇷 46%</span>
              </div>

              <div
                style={{
                  background: ORANGE,
                  borderRadius: 7,
                  padding: '6px 0',
                  textAlign: 'center',
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: 0.8,
                  color: '#fff',
                }}
              >
                Prédire maintenant
              </div>
            </div>

            {/* Live markets strip */}
            <div
              style={{
                position: 'absolute',
                bottom: '10%',
                left: '9%',
                right: '9%',
                zIndex: 3,
                background: 'rgba(6,16,30,0.88)',
                border: '1px solid rgba(255,255,255,0.075)',
                borderRadius: 9,
                padding: '7px 9px',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
                boxShadow: '0 10px 22px rgba(0,0,0,0.22)',
              }}
            >
              <div
                style={{
                  fontSize: 7,
                  fontWeight: 800,
                  letterSpacing: 1.25,
                  color: 'rgba(255,255,255,0.3)',
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}
              >
                Marchés en direct
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 5,
                }}
              >
                <span
                  style={{
                    fontSize: 9,
                    color: 'rgba(255,255,255,0.72)',
                    letterSpacing: 0.2,
                  }}
                >
                  🇧🇷 BR · PT 🇵🇹
                </span>

                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 7,
                    fontWeight: 800,
                    letterSpacing: 0.5,
                    color: '#22c55e',
                    background: 'rgba(34,197,94,0.12)',
                    padding: '1px 5px',
                    borderRadius: 4,
                  }}
                >
                  <span
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: '50%',
                      background: '#22c55e',
                      animation: 'aPulse 1.6s ease-in-out infinite',
                    }}
                  />
                  LIVE
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span
                  style={{
                    fontSize: 9,
                    color: 'rgba(255,255,255,0.42)',
                    letterSpacing: 0.2,
                  }}
                >
                  🇫🇷 FR · DE 🇩🇪
                </span>

                <span style={{ fontSize: 7.5, color: 'rgba(255,255,255,0.27)' }}>
                  21:00
                </span>
              </div>
            </div>
          </section>
        </main>

        {/* ── SEPARATOR ───────────────────────────────────────── */}
        <div
          style={{
            height: 1,
            background: 'rgba(255,255,255,0.06)',
            margin: '14px 0 0',
          }}
        />

        {/* ── ADI CO-BRANDING ────────────────────────────────── */}
        <section
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            padding: '13px 20px 11px',
          }}
        >
          <AdiMark size={28} />

          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 1.6,
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.83)',
              }}
            >
              ADI PredictStreet
            </div>

            <div
              style={{
                fontSize: 10,
                color: 'rgba(255,255,255,0.33)',
                marginTop: 2,
              }}
            >
              Powered by ADI PredictStreet
            </div>
          </div>
        </section>

        {/* ── CTA BUTTONS ────────────────────────────────────── */}
        <section
          style={{
            padding: '2px 20px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <button
            type="button"
            onClick={() => nav('/register')}
            style={{
              width: '100%',
              padding: '16px 0',
              background: ORANGE,
              border: 'none',
              borderRadius: 15,
              color: '#fff',
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: 0.8,
              cursor: 'pointer',
              boxShadow: '0 5px 22px rgba(255,107,0,0.28)',
            }}
          >
            Jouer maintenant
          </button>

          <button
            type="button"
            onClick={() => nav('/login')}
            aria-label="Se connecter"
            style={{
              width: '100%',
              padding: '13px 0',
              background: 'rgba(255,255,255,0.015)',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 15,
              color: 'rgba(255,255,255,0.48)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Se connecter
          </button>
        </section>

        {/* ── CONGO GAMING TEASER ────────────────────────────── */}
        <section style={{ padding: '12px 20px 22px', ...fadeUp(0.7) }}>
          <div
            style={{
              position: 'relative',
              overflow: 'hidden',
              borderRadius: 24,
              background: 'linear-gradient(135deg, #0B1426 0%, #070B15 100%)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 8px 30px rgba(0,0,0,0.34)',
              minHeight: 150,
              display: 'flex',
              alignItems: 'stretch',
            }}
          >
            {/* Image layer */}
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                bottom: 0,
                width: '60%',
                zIndex: 1,
                overflow: 'hidden',
              }}
            >
              <img
                src="/images/okapi-screen.png"
                alt=""
                width={400}
                height={300}
                loading="lazy"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: '58% center',
                  opacity: 1,
                  filter: 'saturate(1.05) contrast(1.02) brightness(0.98)',
                  transform: 'scale(1.06)',
                }}
              />
            </div>

            {/* Readability overlay */}
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 2,
                background:
                  'linear-gradient(to right, #0B1426 0%, rgba(11,20,38,0.96) 34%, rgba(11,20,38,0.58) 52%, rgba(11,20,38,0.16) 72%, rgba(11,20,38,0) 100%)',
                pointerEvents: 'none',
              }}
            />

            {/* Content layer */}
            <div
              style={{
                position: 'relative',
                zIndex: 3,
                width: '56%',
                padding: '22px 0 22px 22px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 800,
                  letterSpacing: 0.1,
                  color: 'rgba(255,255,255,0.96)',
                  marginBottom: 7,
                  lineHeight: 1.25,
                }}
              >
                Découvrez
                <br />
                Congo Gaming
              </div>

              <div
                style={{
                  fontSize: 11.5,
                  color: 'rgba(255,255,255,0.54)',
                  lineHeight: 1.45,
                  marginBottom: 14,
                }}
              >
                Loto Express
                <br />
                Okapi Climb
                <br />
                Jeux rapides
              </div>

              <button
                type="button"
                onClick={() => nav('/login')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  alignSelf: 'flex-start',
                  padding: '7px 10px',
                  background: 'rgba(255,107,0,0.12)',
                  border: '1px solid rgba(255,107,0,0.28)',
                  borderRadius: 999,
                  fontSize: 9,
                  fontWeight: 800,
                  color: 'rgba(255,255,255,0.78)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  cursor: 'pointer',
                }}
              >
                Explorer
                <span style={{ marginLeft: 5, color: ORANGE }}>→</span>
              </button>
            </div>
          </div>
        </section>

        {/* ── FOOTER ─────────────────────────────────────────── */}
        <footer
          style={{
            textAlign: 'center',
            fontSize: 10,
            color: 'rgba(255,255,255,0.2)',
            padding: '2px 20px 16px',
            lineHeight: 1.85,
          }}
        >
          Congo Gaming × ADI PredictStreet
          <br />
          Agré MJS N°047/2016 · DRC Officiel · FIFA WC 2026™
        </footer>
      </div>
    </div>
  );
}

const KEYFRAMES = `
@keyframes aFadeUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes aPulse {
 0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
 50% {
    opacity: 0.32;
    transform: scale(0.64);
  }
}
`;