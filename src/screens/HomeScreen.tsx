import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Wallet, Plus, ArrowDownToLine } from 'lucide-react';
import { getSession, refreshBalance } from '../lib/auth';
import { api } from '../lib/api';

// Shared style for primary home CTAs (glassmorphism, white text).
// Inline styles take precedence over any Tailwind utility, so this fully
// neutralises any other color rule applied to the button.
const ctaStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.15)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(255, 255, 255, 0.35)',
  borderRadius: '14px',
  color: '#FFFFFF',
  fontWeight: '800',
  letterSpacing: '2px',
  fontSize: '15px',
  padding: '14px 20px',
  width: 'auto',
  whiteSpace: 'nowrap',
  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
  textShadow: '0 1px 4px rgba(0,0,0,0.4)',
  fontFamily: 'Bebas Neue',
  cursor: 'pointer',
};

type FlashLatest = Awaited<ReturnType<typeof api.flashLatest>>;

export default function HomeScreen() {
  const nav = useNavigate();
  const session = getSession();
  const [balance, setBalance] = useState<number>(session?.balance_cdf ?? 0);
  const [lotoPot, setLotoPot] = useState<number>(0);
  const [flashPot, setFlashPot] = useState<number>(0);
  const [flashData, setFlashData] = useState<FlashLatest | null>(null);
  const [okapiColorPot, setOkapiColorPot] = useState<number>(0);
  const okapiColorEnabled = import.meta.env.VITE_OKAPI_COLOR_ENABLED === 'true';
  const [countdown, setCountdown] = useState<string>('--:--');

  useEffect(() => {
    if (session) refreshBalance(session.id).then(setBalance).catch(() => {});
    api.lotoLatest().then((r) => setLotoPot(Number(r.pot_cdf || 0))).catch(() => {});
    if (okapiColorEnabled) {
      api.okapiColorLive().then((r) => setOkapiColorPot(Number(r.jackpotCdf || 0))).catch(() => {});
    }
    api
      .flashLatest()
      .then((r) => {
        setFlashPot(Number(r.pot_cdf || 0));
        setFlashData(r);
      })
      .catch(() => {});

    // Refresh balance every 30 seconds to catch admin adjustments
    const interval = setInterval(() => {
      if (session) refreshBalance(session.id).then(setBalance).catch(() => {});
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!flashData?.tirage?.drawn_at) {
      setCountdown('--:--');
      return;
    }
    const lastDraw = new Date(flashData.tirage.drawn_at).getTime();
    const interval = 30 * 60 * 1000;
    let refetchScheduled = false;

    const tick = () => {
      const now = Date.now();
      const nextDraw = lastDraw + Math.ceil((now - lastDraw) / interval) * interval;
      const remaining = Math.max(0, Math.floor((nextDraw - now) / 1000));
      const m = String(Math.floor(remaining / 60)).padStart(2, '0');
      const s = String(remaining % 60).padStart(2, '0');
      setCountdown(remaining > 0 ? `${m}:${s}` : 'TIRAGE EN COURS');

      if (remaining === 0 && !refetchScheduled) {
        refetchScheduled = true;
        setTimeout(() => {
          api
            .flashLatest()
            .then((r) => {
              setFlashPot(Number(r.pot_cdf || 0));
              setFlashData(r);
            })
            .catch(() => {});
        }, 5000);
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [flashData]);

  return (
    <div className="min-h-screen pb-24">
      {/* Banner header */}
      <div style={{ overflow: 'hidden' }}>
        <img
          src="/images/banner.jpg"
          alt="Congo Gaming"
          className="breathe"
          style={{ width: '100%', height: 'auto', display: 'block' }}
        />
      </div>

      {/* Premium glass wallet card */}
      <div style={{ padding: '14px 14px 4px' }}>
        <div
          className="wallet-card-premium"
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 24,
            padding: '18px 18px 16px',
            background: 'rgba(10,15,25,0.55)',
            backdropFilter: 'blur(14px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(14px) saturate(1.4)',
            border: '1px solid rgba(255,215,0,0.18)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.45)',
          }}
        >
          {/* Premium glow — top-right gold + bottom-left soft white */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              background:
                'radial-gradient(circle at 92% 8%, rgba(255,215,0,0.25), transparent 55%),' +
                'radial-gradient(circle at 8% 100%, rgba(255,255,255,0.08), transparent 60%)',
            }}
          />

          {/* Content */}
          <div style={{ position: 'relative', zIndex: 1 }}>
            {session?.display_name && (
              <div
                style={{
                  color: '#FFD700',
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                Salut, {session.display_name} 👋
              </div>
            )}
            <div
              style={{
                color: 'rgba(255,255,255,0.45)',
                fontSize: 10,
                letterSpacing: 3,
                marginTop: 4,
                fontWeight: 600,
              }}
            >
              SOLDE
            </div>

            {/* Balance — dominant */}
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 10,
                marginTop: 6,
                marginBottom: 16,
              }}
            >
              <Wallet style={{ color: '#FFD54A', width: 22, height: 22, alignSelf: 'center' }} />
              <span
                style={{
                  color: '#FFD54A',
                  fontSize: 'clamp(28px, 8.5vw, 38px)',
                  fontWeight: 800,
                  lineHeight: 1,
                  letterSpacing: 0.3,
                  textShadow: '0 0 18px rgba(255,215,0,0.25)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {balance.toLocaleString('fr-FR')}
              </span>
              <span
                style={{
                  color: 'rgba(255,213,74,0.6)',
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: 1,
                }}
              >
                CDF
              </span>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => nav('/depot')}
                className="wallet-btn-deposit"
                style={{
                  flex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  background: 'linear-gradient(135deg, #FFE27A 0%, #D9A400 100%)',
                  color: '#0a0500',
                  fontWeight: 800,
                  fontSize: 13,
                  letterSpacing: 1.2,
                  padding: '11px 14px',
                  borderRadius: 12,
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(217,164,0,0.35)',
                  transition: 'transform 200ms ease, box-shadow 200ms ease, filter 200ms ease',
                }}
              >
                <Plus style={{ width: 16, height: 16 }} />
                DÉPÔT
              </button>
              <button
                type="button"
                onClick={() => nav('/retrait')}
                className="wallet-btn-withdraw"
                style={{
                  flex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  background: 'rgba(255,255,255,0.04)',
                  color: '#FFD54A',
                  fontWeight: 800,
                  fontSize: 13,
                  letterSpacing: 1.2,
                  padding: '11px 14px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,215,0,0.45)',
                  cursor: 'pointer',
                  transition: 'transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease',
                }}
              >
                <ArrowDownToLine style={{ width: 16, height: 16 }} />
                RETRAIT
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 16, minHeight: 280 }}>
          {/* Background image */}
          <img
            src="/images/worldcup2026.jpg"
            alt="FIFA World Cup 2026"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center center',
              opacity: 0.75,
            }}
          />

          {/* Dark gradient overlay bottom to top */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.15) 60%, rgba(0,0,0,0.05) 100%)',
            }}
          />

          {/* World Cup trophy */}
          <img
            src="/images/okapi/copa.PNG"
            alt="World Cup Trophy"
            className="shimmer-gold"
            style={{
              position: 'absolute',
              right: '-5px',
              bottom: '20%',
              height: '72%',
              width: 'auto',
              objectFit: 'contain',
              zIndex: 2,
              mixBlendMode: 'normal',
              opacity: 1,
            }}
          />

          {/* Content on top */}
          <div style={{ position: 'relative', maxWidth: '55%', zIndex: 3, padding: '20px 16px' }}>
            <div style={{ fontSize: 10, color: '#FFD700', letterSpacing: 3, marginBottom: 4 }}>
              🏆 ÉVÉNEMENT OFFICIEL
            </div>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: 38, color: 'white', lineHeight: 1 }}>
              FIFA WORLD CUP
            </div>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: 56, color: '#FFD700', lineHeight: 1 }}>
              2026
            </div>
            <div style={{ fontSize: 13, color: '#00A86B', marginTop: 4, marginBottom: 16 }}>
              ⚽ Gagnez gros — Paris & Prédictions
            </div>
            <motion.button
              whileHover={{ filter: 'brightness(1.1)' }}
              whileTap={{ scale: 0.98, filter: 'brightness(1.1)' }}
              onClick={() => {
                // PredictStreet (FIFA WC26) requires a verified identity.
                // We persist the intended destination so KycScreen can
                // bounce the user back here once the scan succeeds.
                const s = getSession();
                if (!s) {
                  nav('/login');
                  return;
                }
                if (s.kyc_status === 'approved' || s.kyc_status === 'verify_age') {
                  nav('/jouer');
                } else {
                  try {
                    localStorage.setItem('kyc_redirect', '/jouer');
                  } catch {
                    /* storage unavailable */
                  }
                  nav('/kyc');
                }
              }}
              style={ctaStyle}
            >
              JOUER MAINTENANT →
            </motion.button>
          </div>
        </div>

        {/* OKAPI CLIMB card */}
        <div
          onClick={() => nav('/climb')}
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 16,
            minHeight: 220,
            cursor: 'pointer',
          }}
        >
          <img
            src="/images/okapi/okapi-climb.png"
            alt="Okapi Climb"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center center',
              opacity: 0.85,
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.2) 60%, rgba(0,0,0,0.05) 100%)',
            }}
          />

          {/* Okapi character */}
          <img
            src="/images/okapi/okapi-tip.png"
            alt="Okapi"
            style={{
              position: 'absolute',
              right: '0',
              bottom: '0',
              height: '35%',
              width: 'auto',
              objectFit: 'contain',
              zIndex: 2,
              filter: 'drop-shadow(0 0 12px rgba(255,165,0,0.5))',
            }}
          />
          <div style={{ position: 'relative', maxWidth: '58%', zIndex: 3, padding: '20px 16px' }}>
            <div style={{ fontSize: 10, color: '#FFD700', letterSpacing: 3, marginBottom: 4 }}>
              🏔️ CRASH GAME
            </div>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: 44, color: '#FFD700', lineHeight: 1 }}>
              OKAPI CLIMB
            </div>
            <div style={{ fontSize: 13, color: 'white', marginTop: 4, marginBottom: 16, opacity: 0.85 }}>
              Pariez, encaissez avant le crash. Jusqu'à ×50
            </div>
            <motion.button
              whileHover={{ filter: 'brightness(1.1)' }}
              whileTap={{ scale: 0.98, filter: 'brightness(1.1)' }}
              onClick={(e) => { e.stopPropagation(); nav('/climb'); }}
              style={ctaStyle}
            >
              GRIMPER MAINTENANT →
            </motion.button>
          </div>
        </div>

        {/* LOTO CONGO — premium hero card with okapi casino background */}
        <div
          onClick={() => nav('/loto')}
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 16,
            minHeight: 280,
            cursor: 'pointer',
          }}
        >
          <img
            src="/images/loto-okapi.png"
            alt="Loto Congo"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center 45%',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.1) 55%)',
            }}
          />
          {/* Top section: title + jackpot badge, pinned to top */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              padding: 16,
              zIndex: 3,
            }}
          >
            <div
              style={{
                fontFamily: 'Bebas Neue',
                fontSize: 38,
                color: '#FFFFFF',
                lineHeight: 1,
                letterSpacing: 2,
                textShadow:
                  '0 2px 12px rgba(0,0,0,1), 0 0 40px rgba(0,0,0,0.9)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <img
                src="/images/okapi/drapeau.PNG"
                alt="DRC Flag"
                style={{
                  display: 'inline-block',
                  animation: 'flag-float 2s ease-in-out infinite',
                  borderRadius: 3,
                  flexShrink: 0,
                  width: 36,
                  height: 24,
                  objectFit: 'contain',
                }}
              />
              LOTO CONGO
            </div>
            {lotoPot >= 5_000_000 ? (
              <div
                className="pulse-red"
                style={{
                  color: '#FF3333',
                  fontSize: 16,
                  fontWeight: '800',
                  letterSpacing: '1px',
                  marginTop: 10,
                }}
              >
                🔥 Jackpot disponible
              </div>
            ) : (
              <div
                className="pulse-red"
                style={{
                  color: '#FF3333',
                  fontSize: 16,
                  fontWeight: '800',
                  letterSpacing: '1px',
                  marginTop: 80,
                }}
              >
                🏆 Jackpot en cours
              </div>
            )}
          </div>

          {/* Bottom section: button, pinned to bottom */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              padding: 16,
              zIndex: 3,
            }}
          >
            <motion.button
              whileHover={{ filter: 'brightness(1.1)' }}
              whileTap={{ scale: 0.98, filter: 'brightness(1.1)' }}
              onClick={(e) => { e.stopPropagation(); nav('/loto'); }}
              style={{
                background: 'rgba(255,255,255,0.18)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.4)',
                color: '#FFFFFF',
                fontFamily: 'Bebas Neue',
                fontWeight: '800',
                fontSize: 15,
                borderRadius: '14px',
                width: '100%',
                padding: '14px 0',
                letterSpacing: '2px',
                textShadow: '0 1px 4px rgba(0,0,0,0.5)',
                cursor: 'pointer',
              }}
            >
              JOUER MAINTENANT →
            </motion.button>
          </div>
        </div>

        {/* LOTO EXPRESS — electric dark card with green accent */}
        <div
          onClick={() => nav('/flash')}
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 16,
            minHeight: 200,
            cursor: 'pointer',
            background: '#0a0a1a',
            border: '1px solid rgba(0,168,107,0.4)',
          }}
        >
          {/* Scattered lightning bolts background */}
          {[
            { top: '8%', left: '6%', size: 64, rotate: -15 },
            { top: '18%', right: '12%', size: 96, rotate: 20 },
            { top: '55%', left: '20%', size: 80, rotate: 10 },
            { bottom: '10%', right: '8%', size: 72, rotate: -25 },
            { bottom: '30%', right: '32%', size: 56, rotate: 35 },
            { top: '45%', right: '4%', size: 48, rotate: -10 },
          ].map((b, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                top: b.top,
                bottom: b.bottom,
                left: b.left,
                right: b.right,
                fontSize: b.size,
                opacity: 0.08,
                transform: `rotate(${b.rotate}deg)`,
                color: '#00A86B',
                pointerEvents: 'none',
                lineHeight: 1,
              }}
            >
              ⚡
            </div>
          ))}

          {/* Sticker image */}
          <img
            src="/images/okapi/bloto-ball.PNG"
            alt=""
            className="float-y"
            style={{
              position: 'absolute',
              right: '0px',
              bottom: '0',
              height: '85%',
              width: 'auto',
              objectFit: 'contain',
              zIndex: 2,
              filter: 'drop-shadow(0 0 10px rgba(0,168,107,0.5))',
            }}
          />

          <div style={{ position: 'relative', zIndex: 3, maxWidth: '60%', padding: '20px 16px' }}>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: 44, color: '#00A86B', lineHeight: 1, letterSpacing: 2 }}>
              ⚡ LOTO EXPRESS
            </div>
            <div style={{ color: '#FFFFFF', fontSize: 14, marginTop: 12, fontWeight: 600 }}>
              Prochain tirage dans
            </div>
            <div
              style={{
                fontFamily: 'Bebas Neue',
                fontSize: 32,
                color: '#00A86B',
                lineHeight: 1,
                letterSpacing: 2,
                marginTop: 4,
                textShadow: '0 0 12px rgba(0,168,107,0.6)',
              }}
            >
              {countdown}
            </div>
            {flashPot >= 250_000 ? (
              <div
                className="animate-flicker"
                style={{ color: '#00A86B', fontWeight: 700, fontSize: 15, marginTop: 4 }}
              >
                ⚡ JACKPOT DISPO !
              </div>
            ) : (
              <div style={{ color: '#FFFFFF', fontSize: 15, marginTop: 4, fontWeight: 600 }}>
                Pot : {flashPot.toLocaleString('fr-FR')} CDF
              </div>
            )}
            <div style={{ color: '#9CA3AF', fontSize: 12, marginTop: 4, marginBottom: 16 }}>
              1 000 CDF / ticket
            </div>
            <motion.button
              whileHover={{ filter: 'brightness(1.1)' }}
              whileTap={{ scale: 0.98, filter: 'brightness(1.1)' }}
              onClick={(e) => { e.stopPropagation(); nav('/flash'); }}
              style={{
                ...ctaStyle,
                background: '#00A86B',
                border: '1px solid rgba(0,168,107,0.7)',
              }}
            >
              JOUER MAINTENANT →
            </motion.button>
          </div>
        </div>

        {/* SCRATCH CARD promo */}
        <div
          onClick={() => nav('/scratch')}
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 16,
            minHeight: 220,
            cursor: 'pointer',
            border: '1px solid rgba(255,215,0,0.35)',
          }}
        >
          {/* Background image — MUST stay first child so it sits behind the
              dark overlay and content. File: public/images/scratch.jpg */}
          <img
            src="/images/scratch.jpg"
            alt=""
            aria-hidden
            onError={(e) => {
              // Surface a clear console signal if the asset path ever breaks.
              // eslint-disable-next-line no-console
              console.error('[HomeScreen] scratch.jpg failed to load', e.currentTarget.src);
            }}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'left center',
              opacity: 0.9,
              zIndex: 0,
            }}
          />
          {/* Dark gradient overlay for legibility */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(to right, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.1) 100%)',
            }}
          />

          {/* Sparkle pattern */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              background:
                'radial-gradient(2px 2px at 20% 30%, rgba(255,215,0,0.9), transparent 60%),' +
                'radial-gradient(2px 2px at 60% 60%, rgba(255,255,255,0.7), transparent 60%),' +
                'radial-gradient(1.5px 1.5px at 80% 20%, rgba(255,215,0,0.7), transparent 60%),' +
                'radial-gradient(1.5px 1.5px at 40% 80%, rgba(255,255,255,0.6), transparent 60%),' +
                'radial-gradient(1.5px 1.5px at 12% 70%, rgba(255,215,0,0.7), transparent 60%),' +
                'radial-gradient(1.5px 1.5px at 90% 85%, rgba(255,255,255,0.5), transparent 60%)',
              animation: 'flicker 3s ease-in-out infinite',
            }}
          />

          <div
            style={{ position: 'relative', zIndex: 3, padding: '20px 16px', maxWidth: '70%' }}
          >
            <div
              style={{
                fontSize: 10,
                color: '#FFFFFF',
                letterSpacing: 3,
                marginBottom: 4,
                textShadow: '0 1px 4px rgba(0,0,0,1)',
              }}
            >
              🎫 INSTANT WIN
            </div>
            <div
              style={{
                fontFamily: 'Bebas Neue',
                fontSize: 48,
                color: '#FFD700',
                lineHeight: 1,
                letterSpacing: 2,
                textShadow: '0 2px 8px rgba(0,0,0,1), 0 0 30px rgba(0,0,0,0.9)',
              }}
            >
              SCRATCH CARD
            </div>
            <div
              style={{
                color: '#FFFFFF',
                fontSize: 13,
                marginTop: 8,
                marginBottom: 16,
                textShadow: '0 1px 6px rgba(0,0,0,1)',
              }}
            >
              Grattez et gagnez instantanément
            </div>
            <motion.button
              whileHover={{ filter: 'brightness(1.1)' }}
              whileTap={{ scale: 0.98, filter: 'brightness(1.1)' }}
              onClick={(e) => {
                e.stopPropagation();
                nav('/scratch');
              }}
              style={ctaStyle}
            >
              GRATTER MAINTENANT →
            </motion.button>
          </div>
        </div>

        {/* OKAPI COLOR card */}
        {okapiColorEnabled && (
          <div
            onClick={() => nav('/okapi-color')}
            style={{
              position: 'relative',
              overflow: 'hidden',
              borderRadius: 24,
              cursor: 'pointer',
              minHeight: 200,
              background: 'linear-gradient(135deg,#1a0505 0%,#3b0a0a 50%,#1a0505 100%)',
              border: '1px solid rgba(220,38,38,0.3)',
            }}
          >
            {/* Decorative circles */}
            <div style={{ position: 'absolute', top: -30, right: -30, width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle,rgba(220,38,38,0.25),transparent 70%)' }} />
            <div style={{ position: 'absolute', bottom: -20, left: 40, width: 100, height: 100, borderRadius: '50%', background: 'radial-gradient(circle,rgba(251,191,36,0.15),transparent 70%)' }} />

            {/* Number balls decoration */}
            <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 6 }}>
              {[7, 14, 22, 3].map((n) => (
                <div key={n} style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#d97706,#fbbf24)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Bebas Neue', fontSize: 14, color: '#000', boxShadow: '0 0 8px rgba(251,191,36,0.5)' }}>{n}</div>
              ))}
            </div>
            <div style={{ position: 'absolute', top: 56, right: 16, display: 'flex', gap: 6 }}>
              {[5, 18, 9].map((n) => (
                <div key={n} style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#b91c1c,#ef4444)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Bebas Neue', fontSize: 14, color: '#fff', boxShadow: '0 0 8px rgba(239,68,68,0.5)' }}>{n}</div>
              ))}
            </div>

            <div style={{ position: 'relative', zIndex: 3, padding: '20px 16px', maxWidth: '58%' }}>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: 13, color: '#ef4444', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>Nouveau jeu</div>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: 44, color: '#FFFFFF', lineHeight: 1, letterSpacing: 1 }}>OKAPI</div>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: 44, color: '#ef4444', lineHeight: 1, letterSpacing: 2, marginBottom: 4 }}>COLOR</div>
              <div style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 2 }}>6 numéros — rouges payent plus</div>
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginBottom: 4 }}>Tirage live toutes les 10 min</div>
              <div style={{ color: okapiColorPot >= 250_000 ? '#ff5555' : '#FFD700', fontWeight: 700, fontSize: 15, marginBottom: 16 }}>
                {okapiColorPot >= 250_000 ? '🔴 JACKPOT DISPONIBLE !' : `Jackpot : ${okapiColorPot.toLocaleString('fr-FR')} CDF`}
              </div>
              <motion.button
                whileHover={{ filter: 'brightness(1.1)' }}
                whileTap={{ scale: 0.98 }}
                onClick={(e) => { e.stopPropagation(); nav('/okapi-color'); }}
                style={{ ...ctaStyle, background: 'linear-gradient(135deg,#b91c1c,#ef4444)' }}
              >
                JOUER 1 000 CDF →
              </motion.button>
            </div>
          </div>
        )}

        {/* DÉPÔT / RETRAIT — glassmorphism buttons */}
        <div style={{ display: 'flex', gap: 12 }}>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => nav('/depot')}
            style={{
              flex: 1,
              height: 80,
              borderRadius: 16,
              background: 'linear-gradient(135deg, rgba(0,168,107,0.35), rgba(0,168,107,0.15))',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(0,168,107,0.6)',
              color: '#FFFFFF',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(0,168,107,0.25)',
            }}
          >
            <span style={{ fontFamily: 'Bebas Neue', fontSize: 28, color: '#FFFFFF' }}>DÉPÔT</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>+ Fonds</span>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => nav('/retrait')}
            style={{
              flex: 1,
              height: 80,
              borderRadius: 16,
              background: 'rgba(255,255,255,0.05)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,215,0,0.4)',
              color: '#FFD700',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(255,215,0,0.1)',
            }}
          >
            <span style={{ fontFamily: 'Bebas Neue', fontSize: 28, color: '#FFD700' }}>RETRAIT</span>
            <span style={{ fontSize: 11, color: 'rgba(255,215,0,0.6)' }}>- Fonds</span>
          </motion.button>
        </div>

        <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 p-4">
          <div className="text-xs uppercase tracking-widest text-zinc-500">Astuce</div>
          <div className="text-sm mt-1">Jouez de manière responsable. 18+ uniquement.</div>
        </div>

        <button
          onClick={() => nav('/legal')}
          className="block w-full text-center text-xs text-gray-600 hover:text-gray-400 pt-2 pb-1"
        >
          © Congo Gaming Limited SARL — Agréé MJS N°047/2016 — ARPTC N°0573-0574/2023
        </button>
      </div>
    </div>
  );
}
