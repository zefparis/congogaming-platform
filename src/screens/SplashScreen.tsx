import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getSession } from '../lib/auth';
import { api } from '../lib/api';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://api.congogaming.com';

/* ── Design tokens ─────────────────────────────────────────── */
const BG = '#0f0a2e';
const BG_2 = '#07051e';
const SANS = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif";
const BEBAS = "'Bebas Neue', Impact, sans-serif";

/* ── Helper animations ─────────────────────────────────────── */
const fadeUp = (delay = 0) => ({
  animation: `aFadeUp 0.4s ease-out ${delay}s both`
});

const fmtCdf = (n: number) => n.toLocaleString('fr-FR');
const fmtCountdown = (secs: number) => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export default function SplashScreen() {
  const { t } = useTranslation();
  const nav = useNavigate();

  const [pot, setPot] = useState<number | null>(null);
  const [secsLeft, setSecsLeft] = useState<number | null>(null);
  const drawAtMsRef = useRef<number | null>(null);
  const offsetRef = useRef(0);
  const refetchingRef = useRef(false);

  useEffect(() => {
    if (getSession()) {
      nav('/', { replace: true });
    }
  }, [nav]);

  // Initial live state: jackpot pot + next draw time. Failure is silent:
  // the live block simply stays in its neutral state (no fake numbers).
  const fetchLive = () => {
    api.okapiColorLive()
      .then((r) => {
        setPot(Number(r.jackpotCdf));
        offsetRef.current = new Date(r.serverTime).getTime() - Date.now();
        if (r.currentDraw?.drawAt) {
          drawAtMsRef.current = new Date(r.currentDraw.drawAt).getTime();
        }
      })
      .catch(() => {})
      .finally(() => { refetchingRef.current = false; });
  };

  useEffect(() => {
    refetchingRef.current = true;
    fetchLive();
  }, []);

  // Real-time jackpot via the existing SSE stream (same pattern as
  // OkapiColorScreen: reconnect with capped exponential backoff).
  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let backoffMs = 1000;
    let closed = false;

    const connect = () => {
      if (closed) return;
      es = new EventSource(`${API_BASE}/api/okapi-color/jackpot/stream`);
      es.onopen = () => { backoffMs = 1000; };
      es.onmessage = (e) => {
        try { const { pot_cdf } = JSON.parse(e.data); setPot(Number(pot_cdf)); } catch {}
      };
      es.onerror = () => {
        es?.close();
        if (closed) return;
        reconnectTimer = setTimeout(() => {
          backoffMs = Math.min(backoffMs * 2, 30_000);
          connect();
        }, backoffMs);
      };
    };
    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
    };
  }, []);

  // Local countdown, corrected by server time. When it hits zero the slot
  // is over: refetch /live once to pick up the next draw boundary.
  useEffect(() => {
    const id = setInterval(() => {
      if (drawAtMsRef.current == null) return;
      const left = Math.round((drawAtMsRef.current - (Date.now() + offsetRef.current)) / 1000);
      setSecsLeft(Math.max(0, left));
      if (left <= 0 && !refetchingRef.current) {
        refetchingRef.current = true;
        fetchLive();
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

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
        </header>

        {/* ── HERO ───────────────────────────────────────────── */}
        <section style={{ padding: '6px 20px 0', ...fadeUp(0) }}>
          <div
            style={{
              position: 'relative',
              overflow: 'hidden',
              borderRadius: 20,
              border: '1px solid rgba(255,215,0,0.16)',
              boxShadow: '0 10px 34px rgba(0,0,0,0.45)',
            }}
          >
            <img
              src="/images/okapiscreen.png"
              alt="Okapi Color"
              width={400}
              height={300}
              style={{
                display: 'block',
                width: '100%',
                height: 210,
                objectFit: 'cover',
                objectPosition: '58% center',
                filter: 'saturate(1.05) contrast(1.02) brightness(0.98)',
              }}
            />
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(to top, rgba(7,5,30,0.92) 0%, rgba(7,5,30,0.35) 45%, rgba(7,5,30,0) 70%)',
                pointerEvents: 'none',
              }}
            />
            <div style={{ position: 'absolute', left: 18, bottom: 14 }}>
              <div
                style={{
                  fontFamily: BEBAS,
                  fontSize: 'clamp(40px, 13vw, 56px)',
                  fontWeight: 900,
                  lineHeight: 0.9,
                  letterSpacing: -0.5,
                }}
              >
                <span style={{ color: '#fff' }}>OKAPI </span>
                <span style={{ color: '#FFD700' }}>COLOR</span>
              </div>
            </div>
          </div>

          <div
            style={{
              fontSize: 12,
              fontWeight: 400,
              color: 'rgba(255,255,255,0.62)',
              marginTop: 12,
              lineHeight: 1.6,
              ...fadeUp(0.2)
            }}
          >
            {t('splash.hero_tag')}
          </div>
        </section>

        {/* ── LIVE BLOCK ─────────────────────────────────────── */}
        <section style={{ padding: '14px 20px 0', ...fadeUp(0.3) }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'stretch',
              gap: 10,
              background: 'linear-gradient(135deg, #1a1040 0%, #0f0a2e 100%)',
              border: '1px solid rgba(255,215,0,0.3)',
              borderRadius: 16,
              padding: '14px 16px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 8.5,
                  fontWeight: 800,
                  color: 'rgba(255,215,0,0.7)',
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}
              >
                {t('splash.live_jackpot')}
              </div>
              <div
                style={{
                  fontFamily: BEBAS,
                  fontSize: 30,
                  fontWeight: 900,
                  color: '#FFD700',
                  lineHeight: 1,
                }}
              >
                {pot != null ? `${fmtCdf(pot)} CDF` : '···'}
              </div>
            </div>

            <div
              aria-hidden="true"
              style={{ width: 1, background: 'rgba(255,255,255,0.08)' }}
            />

            <div style={{ flex: 1, textAlign: 'right' }}>
              <div
                style={{
                  fontSize: 8.5,
                  fontWeight: 800,
                  color: 'rgba(255,255,255,0.5)',
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}
              >
                {t('splash.live_next')}
              </div>
              <div
                style={{
                  fontFamily: BEBAS,
                  fontSize: 30,
                  fontWeight: 900,
                  color: '#fff',
                  lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {secsLeft == null
                  ? '···'
                  : secsLeft === 0
                    ? t('splash.live_now')
                    : fmtCountdown(secsLeft)}
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA BUTTONS ────────────────────────────────────── */}
        <section
          style={{
            padding: '14px 20px 4px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <button
            type="button"
            onClick={() => nav(getSession() ? '/okapi-color' : '/register')}
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
            {t('splash.cta_play')}
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
            {t('splash.cta_login')}
          </button>
        </section>

        {/* ── HOW TO PLAY ────────────────────────────────────── */}
        <section style={{ padding: '14px 20px 6px', ...fadeUp(0.45) }}>
          <div
            style={{
              fontSize: 8.5,
              fontWeight: 800,
              color: 'rgba(255,215,0,0.7)',
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              marginBottom: 10,
            }}
          >
            {t('splash.how_title')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 12,
                  padding: '10px 12px',
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: 'rgba(255,215,0,0.12)',
                    border: '1px solid rgba(255,215,0,0.3)',
                    color: '#FFD700',
                    fontSize: 11,
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {n}
                </span>
                <span
                  style={{
                    fontSize: 11.5,
                    color: 'rgba(255,255,255,0.72)',
                    lineHeight: 1.5,
                  }}
                >
                  {t(`splash.step${n}`)}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ── FOOTER ─────────────────────────────────────────── */}
        <footer
          style={{
            marginTop: 'auto',
            textAlign: 'center',
            fontSize: 10,
            color: 'rgba(255,255,255,0.2)',
            padding: '16px 20px 16px',
            lineHeight: 1.85,
          }}
        >
          Congo Gaming · Agré MJS N°047/2016
          <br />
          ARPTC N°0573-0574/2023 · DRC Officiel
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
`;
