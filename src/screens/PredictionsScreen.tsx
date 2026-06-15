import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const STEPS = [
  {
    step: '01',
    icon: '🎯',
    titleKey: 'predictions.step1_title',
    descKey: 'predictions.step1_desc',
  },
  {
    step: '02',
    icon: '💰',
    titleKey: 'predictions.step2_title',
    descKey: 'predictions.step2_desc',
  },
  {
    step: '03',
    icon: '🏆',
    titleKey: 'predictions.step3_title',
    descKey: 'predictions.step3_desc',
  },
];

export default function PredictionsScreen() {
  const nav = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen pb-24" style={{ background: '#0a0a0f' }}>
      {/* Co-branded header */}
      <div
        style={{
          background: 'linear-gradient(160deg, #0a0014 0%, #1c0032 50%, #0a0014 100%)',
          borderBottom: '1px solid rgba(255,215,0,0.18)',
          padding: '16px 16px 20px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Radial glow accents */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(circle at 15% 60%, rgba(206,17,38,0.2) 0%, transparent 55%),' +
              'radial-gradient(circle at 85% 30%, rgba(255,215,0,0.12) 0%, transparent 50%)',
            pointerEvents: 'none',
          }}
        />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Back button */}
          <button
            type="button"
            onClick={() => nav(-1)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: 'rgba(255,255,255,0.5)',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: 0.5,
              marginBottom: 16,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <ArrowLeft style={{ width: 14, height: 14 }} />
            {t('common.back')}
          </button>

          {/* Brand badges */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <span
              style={{
                background: 'linear-gradient(135deg, #CE1126 0%, #8B0000 100%)',
                color: '#fff',
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: 1.5,
                padding: '3px 9px',
                borderRadius: 4,
                textTransform: 'uppercase',
              }}
            >
              🏆 {t('predictions.badge_fifa')}
            </span>
            <span
              style={{
                background: 'rgba(255,215,0,0.1)',
                color: '#FFD700',
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: 1.5,
                padding: '3px 9px',
                borderRadius: 4,
                border: '1px solid rgba(255,215,0,0.28)',
              }}
            >
              ADI PredictStreet
            </span>
            <span
              style={{
                background: 'rgba(0,168,107,0.12)',
                color: '#00A86B',
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: 1.5,
                padding: '3px 9px',
                borderRadius: 4,
                border: '1px solid rgba(0,168,107,0.28)',
              }}
            >
              Congo Gaming
            </span>
          </div>

          {/* Title block */}
          <div
            style={{
              fontFamily: 'Bebas Neue',
              fontSize: 40,
              color: '#fff',
              lineHeight: 1,
              letterSpacing: 1,
            }}
          >
            {t('predictions.header_title')}
          </div>
          <div
            style={{
              fontFamily: 'Bebas Neue',
              fontSize: 52,
              color: '#FFD700',
              lineHeight: 1,
              letterSpacing: 1,
              marginBottom: 8,
            }}
          >
            {t('predictions.header_sub')}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
            {t('predictions.header_desc')}
          </div>
        </div>
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        {/* Widget placeholder card */}
        <div
          style={{
            borderRadius: 20,
            background:
              'linear-gradient(140deg, rgba(206,17,38,0.1) 0%, rgba(30,0,50,0.8) 50%, rgba(255,215,0,0.07) 100%)',
            border: '1px solid rgba(255,215,0,0.22)',
            padding: '28px 20px',
            textAlign: 'center',
            marginBottom: 14,
            position: 'relative',
            overflow: 'hidden',
            boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
          }}
        >
          {/* Corner shimmer */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              top: -40,
              right: -40,
              width: 180,
              height: 180,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255,215,0,0.1) 0%, transparent 70%)',
              pointerEvents: 'none',
            }}
          />

          {/* Phone mockup */}
          <img
            src="/assets/phone mockup.png"
            alt="ADI PredictStreet"
            style={{
              width: 130,
              height: 'auto',
              margin: '0 auto 16px',
              display: 'block',
              filter:
                'drop-shadow(0 8px 24px rgba(255,215,0,0.28)) drop-shadow(0 0 40px rgba(206,17,38,0.2))',
            }}
          />

          <div
            style={{
              fontFamily: 'Bebas Neue',
              fontSize: 24,
              color: '#FFD700',
              letterSpacing: 2,
              marginBottom: 10,
            }}
          >
            ⚽ {t('predictions.widget_title')}
          </div>

          <div
            style={{
              fontSize: 13,
              color: 'rgba(255,255,255,0.55)',
              marginBottom: 22,
              lineHeight: 1.6,
              maxWidth: 280,
              margin: '0 auto 22px',
            }}
          >
            {t('predictions.widget_body')}
          </div>

          <motion.button
            whileHover={{ filter: 'brightness(1.1)', scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            style={{
              background: 'linear-gradient(135deg, #FFE27A 0%, #D9A400 100%)',
              color: '#0a0500',
              fontFamily: 'Bebas Neue',
              fontSize: 17,
              letterSpacing: 2,
              padding: '12px 28px',
              borderRadius: 12,
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(217,164,0,0.4)',
            }}
          >
            {t('predictions.widget_cta')}
          </motion.button>
        </div>

        {/* Comment ça marche */}
        <div
          style={{
            borderRadius: 16,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
            padding: '20px 16px',
            marginBottom: 14,
          }}
        >
          <div
            style={{
              fontFamily: 'Bebas Neue',
              fontSize: 22,
              color: '#fff',
              letterSpacing: 2,
              marginBottom: 18,
            }}
          >
            {t('predictions.how_title')}
          </div>

          {STEPS.map(({ step, icon, titleKey, descKey }, idx) => (
            <div
              key={step}
              style={{
                display: 'flex',
                gap: 14,
                alignItems: 'flex-start',
                marginBottom: idx < STEPS.length - 1 ? 18 : 0,
              }}
            >
              {/* Step icon bubble */}
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background:
                    idx === 0
                      ? 'linear-gradient(135deg, #CE1126 0%, #8B0000 100%)'
                      : idx === 1
                      ? 'linear-gradient(135deg, #D9A400 0%, #7A5A00 100%)'
                      : 'linear-gradient(135deg, #00A86B 0%, #005C3A 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                  flexShrink: 0,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
                }}
              >
                {icon}
              </div>

              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 9,
                    color: '#FFD700',
                    fontWeight: 800,
                    letterSpacing: 2,
                    marginBottom: 3,
                  }}
                >
                  ÉTAPE {step}
                </div>
                <div
                  style={{
                    fontFamily: 'Bebas Neue',
                    fontSize: 18,
                    color: '#fff',
                    lineHeight: 1.15,
                    marginBottom: 4,
                  }}
                >
                  {t(titleKey)}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'rgba(255,255,255,0.48)',
                    lineHeight: 1.55,
                  }}
                >
                  {t(descKey)}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Legal disclaimer */}
        <div
          style={{
            fontSize: 10,
            color: 'rgba(255,255,255,0.22)',
            textAlign: 'center',
            lineHeight: 1.6,
            paddingBottom: 8,
          }}
        >
          {t('predictions.legal')}
        </div>
      </div>
    </div>
  );
}
