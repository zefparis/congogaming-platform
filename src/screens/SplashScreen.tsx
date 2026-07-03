import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSession } from '../lib/auth';

/* ── Design tokens ─────────────────────────────────────────── */
const BG = '#0f0a2e';
const BG_2 = '#07051e';
const ORANGE = '#FF6B00';
const SANS = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif";
const BEBAS = "'Bebas Neue', Impact, sans-serif";

/* ── Helper animations ─────────────────────────────────────── */
const fadeUp = (delay = 0) => ({
  animation: `aFadeUp 0.4s ease-out ${delay}s both`
});


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
            'radial-gradient(ellipse at 50% 0%, rgba(255,215,0,0.08) 0%, transparent 72%)',
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
            🏆 COUPE DU MONDE 2026
          </span>
        </header>

        {/* ── HERO ───────────────────────────────────────────── */}
        <main
          className="flex flex-col md:flex-row md:items-start"
          style={{
            flex: 1,
            padding: '8px 0 0 20px',
            overflow: 'hidden',
            minHeight: 260,
          }}
        >
          {/* Left content */}
          <section className="w-full md:w-[53%] md:flex-shrink-0" style={{ paddingTop: 8, ...fadeUp(0) }}>
            <div
              style={{
                fontFamily: BEBAS,
                fontSize: 'clamp(42px, 12vw, 58px)',
                fontWeight: 900,
                lineHeight: 0.9,
                letterSpacing: -0.5,
                color: '#fff',
              }}
            >
              PRONOSTIQUEZ
            </div>

            <div
              style={{
                fontFamily: BEBAS,
                fontSize: 'clamp(42px, 12vw, 58px)',
                fontWeight: 900,
                lineHeight: 0.9,
                letterSpacing: -0.5,
                color: '#FFD700',
                marginBottom: 10,
              }}
            >
              &amp; GAGNEZ
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
                🏆 COUPE DU MONDE 2026
              </span>
            </div>
          </section>

          {/* Match card preview */}
          <section
            aria-label="Aperçu match"
            className="w-full md:flex-1 mt-4 md:mt-0"
            style={{ ...fadeUp(0.16), display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingRight: 16, paddingTop: 4 }}
          >
            <div
              style={{
                background: 'linear-gradient(135deg, #1a1040 0%, #0f0a2e 100%)',
                border: '1px solid rgba(255,215,0,0.3)',
                borderRadius: 16,
                padding: '14px 12px',
                boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
              }}
            >
              <div style={{ fontSize: 8, fontWeight: 800, color: 'rgba(255,215,0,0.7)', letterSpacing: 1.5, textTransform: 'uppercase' as const, marginBottom: 8 }}>
                Round of 16 · 2 juillet
              </div>
              <div style={{ textAlign: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 24 }}>🇨🇩</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: '0 6px' }}>VS</span>
                <span style={{ fontSize: 24 }}>🇵🇹</span>
              </div>
              <div style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 2, marginBottom: 10 }}>
                CD &nbsp;·&nbsp; PT
              </div>
              <div style={{ height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.08)', marginBottom: 8 }}>
                <div style={{ width: '55%', height: '100%', background: 'linear-gradient(90deg, #FFD700, #D9A400)', borderRadius: 4 }} />
              </div>
              <div style={{ textAlign: 'center', fontSize: 8.5, color: 'rgba(255,215,0,0.6)', fontWeight: 700, letterSpacing: 0.5 }}>
                Misez en CDF · Gagnez en CDF
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

        {/* ── CONGO GAMING BRANDING ────────────────────────────── */}
        <section
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            padding: '13px 20px 11px',
          }}
        >
          <img src="/images/okapi.jpg" alt="Congo Gaming" className="w-10 h-10 rounded-full object-cover" />

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
              Congo Gaming
            </div>

            <div
              style={{
                fontSize: 10,
                color: 'rgba(255,215,0,0.55)',
                marginTop: 2,
                fontWeight: 700,
                letterSpacing: 1,
              }}
            >
              PRONOS
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
            onClick={() => nav('/predictions')}
            style={{
              width: '100%',
              padding: '16px 0',
              background: 'linear-gradient(135deg, #FFE27A 0%, #D9A400 100%)',
              border: 'none',
              borderRadius: 15,
              color: '#0a0500',
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: 0.8,
              cursor: 'pointer',
              boxShadow: '0 5px 22px rgba(217,164,0,0.4)',
            }}
          >
            ⚡ JOUER MAINTENANT
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
                src="/images/okapiscreen.png"
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
          Congo Gaming · Coupe du Monde 2026
          <br />
          Agré MJS N°047/2016 · DRC Officiel
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