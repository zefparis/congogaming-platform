import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Wallet, Plus, ArrowDownToLine } from 'lucide-react';
import { getSession, refreshBalance } from '../lib/auth';
import { useCGLTBalance } from '../hooks/useCGLTBalance';
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

export default function HomeScreen() {
  const nav = useNavigate();
  const { t } = useTranslation();
  const session = getSession();
  const [balance, setBalance] = useState<number>(session?.balance_cdf ?? 0);
  const { balanceCglt, refresh: refreshCglt } = useCGLTBalance(true);
  const [okapiColorPot, setOkapiColorPot] = useState<number>(0);

  useEffect(() => {
    const doRefresh = () => {
      const s = getSession();
      if (s) refreshBalance(s.id).then(setBalance).catch(() => {});
    };

    doRefresh();
    // Only fetch CGLT balance if a session is active (avoids 403 on anonymous load).
    if (getSession()) void refreshCglt();
    api.okapiColorLive().then((r) => setOkapiColorPot(Number(r.jackpotThresholdCdf || 250_000))).catch(() => {});

    // Refresh immediately when the tab regains visibility (app focus / tab switch back).
    const onVisible = () => { if (document.visibilityState === 'visible') { doRefresh(); if (getSession()) void refreshCglt(); } };
    document.addEventListener('visibilitychange', onVisible);

    // Refresh every 15 seconds to catch admin adjustments promptly.
    const interval = setInterval(doRefresh, 15_000);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

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
                {t('home.greeting', { name: session.display_name })}
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
              {t('home.balance_label')}
            </div>

            {/* CDF Balance — dominant */}
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 10,
                marginTop: 6,
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
              <span
                style={{
                  fontSize: 9,
                  color: 'rgba(255,255,255,0.35)',
                  fontWeight: 600,
                  letterSpacing: 0.5,
                  alignSelf: 'center',
                  marginLeft: 2,
                }}
              >
                Argent réel
              </span>
            </div>

            {/* CGLT Token Balance — secondary */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 7,
                marginBottom: 16,
                padding: '6px 10px',
                borderRadius: 10,
                background: 'rgba(56,189,248,0.07)',
                border: '1px solid rgba(56,189,248,0.2)',
              }}
            >
              <span style={{ fontSize: 15, lineHeight: 1 }}>🔷</span>
              <span
                style={{
                  color: '#38BDF8',
                  fontSize: 18,
                  fontWeight: 800,
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: 0.2,
                }}
              >
                {balanceCglt.toLocaleString('fr-FR')}
              </span>
              <span
                style={{
                  color: 'rgba(56,189,248,0.65)',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 1,
                }}
              >
                CGLT
              </span>
              <span
                style={{
                  fontSize: 9,
                  color: 'rgba(255,255,255,0.3)',
                  fontWeight: 600,
                  letterSpacing: 0.5,
                  marginLeft: 2,
                }}
              >
                Jetons de jeu
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
                {t('home.deposit_btn')}
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
                {t('home.withdraw_btn')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">

        {/* OKAPI COLOR card */}
        <div
          onClick={() => nav('/okapi-color')}
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 16,
            cursor: 'pointer',
            minHeight: 220,
            background: 'linear-gradient(135deg,#1a0505 0%,#3b0a0a 50%,#1a0505 100%)',
            border: '1px solid rgba(220,38,38,0.3)',
          }}
        >
            {/* Background image */}
            <img
              src="/images/okapicolor.png"
              alt=""
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'right center',
                zIndex: 0,
              }}
            />
            {/* Dark overlay for text legibility */}
            <div
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(to right, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.40) 55%, rgba(0,0,0,0.05) 100%)',
                zIndex: 1,
              }}
            />

            <div style={{ position: 'relative', zIndex: 3, padding: '20px 16px', maxWidth: '58%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Bebas Neue', fontSize: 13, color: '#00A86B', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00A86B' }} />
                {t('home.color_live')}
              </div>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: 44, color: '#FFFFFF', lineHeight: 1, letterSpacing: 1 }}>OKAPI</div>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: 44, color: '#ef4444', lineHeight: 1, letterSpacing: 2, marginBottom: 4 }}>COLOR</div>
              <div style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 2 }}>{t('home.color_nums')}</div>
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginBottom: 6 }}>{t('home.color_freq')}</div>
              <div style={{ color: '#FFD700', fontWeight: 700, fontSize: 15, marginBottom: 2 }}>
                {t('home.color_jackpot', { amount: okapiColorPot.toLocaleString('fr-FR') })}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginBottom: 16 }}>{t('home.ticket_price_1000')}</div>
              <motion.button
                whileHover={{ filter: 'brightness(1.1)' }}
                whileTap={{ scale: 0.98 }}
                onClick={(e) => { e.stopPropagation(); nav('/okapi-color'); }}
                style={{ ...ctaStyle, background: 'linear-gradient(135deg,#b91c1c,#ef4444)' }}
              >
                {t('home.play_now')}
              </motion.button>
            </div>
        </div>


        {/* Ma Wallet UniPay */}
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => window.open('https://app.unipaycongo.com', '_blank')}
          style={{
            width: '100%',
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
          <span style={{ fontFamily: 'Bebas Neue', fontSize: 26, color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Wallet size={20} />
            Ma Wallet UniPay
          </span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>Dépôt · Retrait · CGLT</span>
        </motion.button>

        <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 p-4">
          <div className="text-xs uppercase tracking-widest text-zinc-500">{t('home.tip_title')}</div>
          <div className="text-sm mt-1">{t('home.tip_body')}</div>
        </div>

        <button
          onClick={() => nav('/legal')}
          className="block w-full text-center text-xs text-gray-600 hover:text-gray-400 pt-2 pb-1"
        >
          {t('home.legal')}
        </button>
      </div>
    </div>
  );
}
