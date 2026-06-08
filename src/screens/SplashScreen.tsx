import { useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getSession } from '../lib/auth';

const BEBAS = "'Bebas Neue', sans-serif";
const BARLOW = "'Barlow Condensed', sans-serif";
const GOLD = '#F5A623';
const GOLD_COLORS = ['#F5A623', '#FFD700', '#C9850A', '#FFBE3D', '#FFF0A0'];

const rand = (min: number, max: number) => Math.random() * (max - min) + min;

type Particle = {
  left: number;
  top: number;
  size: number;
  color: string;
  opacity: number;
  duration: number;
  delay: number;
};

const TR: Record<string, {
  tagline: string; subtitle: string;
  cglt_title: string; cglt_desc: string; legal: string;
}> = {
  fr: {
    tagline:    'Le jeu en ligne officiel de la RDC',
    subtitle:   'Loto · Crash · Scratch · Prédictions',
    cglt_title: 'Farmez des CGLT en jouant',
    cglt_desc:  'Chaque mise vous rapporte des points XP — convertis en CGLT, la crypto congolaise',
    legal:      'Orange Money · Airtel · Africell  |  +18 ans · Jouez responsable',
  },
  ln: {
    tagline:    'Mobimelo ya Internet ya bosembo ya RDC',
    subtitle:   'Loto · Crash · Scratch · Makanisi',
    cglt_title: 'Bongisa CGLT na komela',
    cglt_desc:  'Mise nyonso epesaka yo XP points — ebongolama na CGLT, crypto ya Congo',
    legal:      'Orange Money · Airtel · Africell  |  +18 mbula · Mela na bosembo',
  },
  sw: {
    tagline:    'Mchezo rasmi wa mtandaoni wa DRC',
    subtitle:   'Loto · Crash · Scratch · Utabiri',
    cglt_title: 'Zalisha CGLT kwa kucheza',
    cglt_desc:  'Kila dau hukupa XP — zinabadilishwa kuwa CGLT, kripto ya Kongo',
    legal:      'Orange Money · Airtel · Africell  |  +18 miaka · Cheza kwa uwajibikaji',
  },
  en: {
    tagline:    'The official online game of the DRC',
    subtitle:   'Lotto · Crash · Scratch · Predictions',
    cglt_title: 'Farm CGLT by playing',
    cglt_desc:  "Every bet earns XP points — converted into CGLT, Congo's crypto",
    legal:      'Orange Money · Airtel · Africell  |  18+ · Play responsibly',
  },
};

const XP_TIERS = [
  { label: 'Bronze',  color: '#cd7f32', fill: 1.0 },
  { label: 'Argent',  color: '#C0C0C0', fill: 0.42 },
  { label: 'Or',      color: GOLD,       fill: 0 },
  { label: 'Diamant', color: '#b9f2ff',  fill: 0 },
];

const GAMES = [
  { icon: '🎰', title: 'Okapi Climb',  desc_fr: 'Le crash game congolais',          desc_en: 'The Congolese crash game' },
  { icon: '🎨', title: 'Okapi Color',  desc_fr: 'Tirage en direct toutes les 10 min', desc_en: 'Live draw every 10 minutes' },
  { icon: '🃏', title: 'Scratch Card', desc_fr: 'Grattez et gagnez instantanément', desc_en: 'Scratch and win instantly' },
  { icon: '💎', title: 'CGLT',         desc_fr: 'Gagnez des tokens sur chaque mise', desc_en: 'Earn tokens on every bet' },
] as const;

export default function SplashScreen() {
  const nav = useNavigate();
  const { t, i18n } = useTranslation();
  const lang = i18n.language in TR ? i18n.language : 'fr';
  const tr = TR[lang];

  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: 22 }, () => ({
        left:     rand(0, 100),
        top:      rand(0, 80),
        size:     rand(1.5, 4.5),
        color:    GOLD_COLORS[Math.floor(Math.random() * GOLD_COLORS.length)],
        opacity:  rand(0.12, 0.55),
        duration: rand(6, 14),
        delay:    rand(0, 8),
      })),
    [],
  );

  if (getSession()) {
    nav('/', { replace: true });
  }

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100dvh',
        background: 'linear-gradient(170deg, #04080f 0%, #080f0a 60%, #04080f 100%)',
        color: '#ffffff',
        fontFamily: BARLOW,
        overflowX: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <style>{KEYFRAMES}</style>

      {/* Gold particle layer */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        {particles.map((p, i) => (
          <span
            key={i}
            style={{
              position: 'absolute',
              left: `${p.left}%`,
              top: `${p.top}%`,
              width: p.size,
              height: p.size,
              borderRadius: '50%',
              background: p.color,
              opacity: p.opacity,
              boxShadow: `0 0 ${p.size * 3}px ${p.color}88`,
              animation: `splashDrift ${p.duration}s ease-in-out ${p.delay}s infinite alternate`,
            }}
          />
        ))}
      </div>

      {/* ── CONTENT ── */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', flex: 1 }}>

        {/* ── TOP BAR (badges only — NO language selector) ── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 14px 6px',
        }}>
          <span style={{ fontSize: 8, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(245,166,35,0.55)', whiteSpace: 'nowrap' }}>
            DRC · Officiel
          </span>
          <span style={{ fontSize: 8, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(245,166,35,0.55)', textAlign: 'right', whiteSpace: 'nowrap' }}>
            Agréé MJS N°047/2016
          </span>
        </div>

        {/* ── HERO IMAGE full-width ── */}
        <div style={{ position: 'relative', width: '100vw', marginLeft: 'calc(-50vw + 50%)', overflow: 'hidden' }}>
          <img
            src="/images/okapiscreen.png"
            alt="Congo Gaming"
            className="splash-hero-img"
            style={{
              width: '100%',
              height: 'auto',
              objectFit: 'cover',
              objectPosition: 'top',
              display: 'block',
            }}
          />
          <div aria-hidden style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 80,
            background: 'linear-gradient(transparent, #0a0800)',
            pointerEvents: 'none',
          }} />
        </div>

        {/* ── HERO TEXT ── */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 20px 0', textAlign: 'center' }}>

          <h1 style={{
            margin: '0 0 6px',
            fontFamily: BEBAS,
            fontSize: 42,
            lineHeight: 1,
            letterSpacing: 4,
            color: '#ffffff',
            textShadow: `0 0 40px rgba(245,166,35,0.3)`,
            animation: 'splashFadeup 0.8s ease-out both',
          }}>
            CONGO GAMING
          </h1>

          <p style={{
            margin: '0 0 4px',
            fontFamily: BARLOW,
            fontWeight: 400,
            fontSize: 13,
            letterSpacing: 2,
            color: 'rgba(255,255,255,0.65)',
            animation: 'splashFadeup 0.9s ease-out both',
          }}>
            {tr.tagline}
          </p>

          <p style={{
            margin: '0 0 18px',
            fontFamily: BEBAS,
            fontSize: 15,
            letterSpacing: 3,
            color: GOLD,
            opacity: 0.85,
            animation: 'splashFadeup 1.0s ease-out both',
          }}>
            {tr.subtitle}
          </p>
        </div>

        {/* ── GAME CARDS 2×2 ── */}
        <div style={{ padding: '0 12px 16px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
          }}>
            {GAMES.map((g) => (
              <div key={g.title} style={{
                background: 'rgba(245,166,35,0.05)',
                border: '1px solid rgba(245,166,35,0.18)',
                borderRadius: 14,
                padding: '13px 12px',
                backdropFilter: 'blur(10px)',
              }}>
                <div style={{ fontSize: 22, marginBottom: 5 }}>{g.icon}</div>
                <div style={{
                  fontFamily: BEBAS,
                  fontSize: 15,
                  letterSpacing: 1.5,
                  color: '#fff',
                  marginBottom: 3,
                }}>
                  {g.title}
                </div>
                <div style={{
                  fontFamily: BARLOW,
                  fontSize: 11,
                  lineHeight: 1.35,
                  color: 'rgba(255,255,255,0.42)',
                }}>
                  {lang === 'en' ? g.desc_en : g.desc_fr}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── CGLT HIGHLIGHT ── */}
        <div style={{
          margin: '0 12px 16px',
          background: 'rgba(245,166,35,0.06)',
          border: `1px solid rgba(245,166,35,0.25)`,
          borderRadius: 16,
          padding: '16px 14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 20 }}>💎</span>
            <span style={{ fontFamily: BEBAS, fontSize: 16, letterSpacing: 2, color: GOLD }}>
              {tr.cglt_title}
            </span>
          </div>
          <p style={{
            fontFamily: BARLOW,
            fontSize: 12,
            color: 'rgba(255,255,255,0.5)',
            margin: '0 0 12px',
            lineHeight: 1.45,
          }}>
            {tr.cglt_desc}
          </p>

          {/* XP progress bar — Bronze → Argent → Or → Diamant */}
          <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end', marginBottom: 6 }}>
            {XP_TIERS.map((tier, idx) => (
              <div key={tier.label} style={{ flex: 1 }}>
                <div style={{
                  height: 5 + idx,
                  borderRadius: 4,
                  background: 'rgba(255,255,255,0.1)',
                  overflow: 'hidden',
                  marginBottom: 4,
                }}>
                  <div style={{
                    height: '100%',
                    width: `${tier.fill * 100}%`,
                    background: `linear-gradient(90deg, ${tier.color}99, ${tier.color})`,
                    borderRadius: 4,
                    transition: 'width 1s ease',
                  }} />
                </div>
                <div style={{
                  fontFamily: BARLOW,
                  fontSize: 9,
                  letterSpacing: 0.5,
                  color: tier.fill > 0 ? tier.color : 'rgba(255,255,255,0.25)',
                  textAlign: 'center',
                  textTransform: 'uppercase',
                }}>
                  {tier.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── CTAs ── */}
        <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            onClick={() => nav('/register')}
            style={{
              width: '100%',
              padding: '16px 0',
              border: 'none',
              borderRadius: 12,
              background: `linear-gradient(135deg, ${GOLD}, #ffcc55)`,
              color: '#04080f',
              fontFamily: BEBAS,
              fontSize: 22,
              letterSpacing: 5,
              cursor: 'pointer',
              boxShadow: `0 6px 30px rgba(245,166,35,0.45)`,
              animation: 'splashFadeup 1.2s ease-out both',
            }}
          >
            {t('splash.register')}
          </button>

          <button
            type="button"
            onClick={() => nav('/login')}
            style={{
              width: '100%',
              padding: '13px 0',
              background: 'rgba(245,166,35,0.07)',
              border: `1px solid rgba(245,166,35,0.35)`,
              borderRadius: 12,
              color: 'rgba(255,255,255,0.65)',
              fontFamily: BEBAS,
              fontSize: 17,
              letterSpacing: 3,
              cursor: 'pointer',
              animation: 'splashFadeup 1.35s ease-out both',
            }}
          >
            {t('splash.login')}
          </button>
        </div>

        {/* ── FOOTER ── */}
        <div style={{
          paddingBottom: 16,
          paddingTop: 4,
          textAlign: 'center',
          fontSize: 9,
          letterSpacing: 1.5,
          color: 'rgba(255,255,255,0.16)',
          textTransform: 'uppercase',
          fontFamily: BARLOW,
          padding: '4px 16px 16px',
        }}>
          {tr.legal}
        </div>

      </div>
    </div>
  );
}

const KEYFRAMES = `
.splash-hero-img {
  height: auto;
}
@media (min-width: 640px) {
  .splash-hero-img {
    max-height: 500px;
    object-position: top;
  }
}
@keyframes splashFadeup {
  from { transform: translateY(14px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}
@keyframes splashDrift {
  0%   { transform: translateY(0)   translateX(0)   scale(1);   }
  50%  { transform: translateY(-18px) translateX(6px)  scale(1.1); }
  100% { transform: translateY(8px)  translateX(-4px) scale(0.9); }
}
@keyframes splashShimmer {
  0%   { background-position: 0% 0%;   }
  100% { background-position: 200% 0%; }
}
@keyframes splashFloat {
  0%   { transform: translateY(0)      scale(1);   opacity: 0.7; }
  100% { transform: translateY(-120px) scale(0.3); opacity: 0;   }
}
`;
