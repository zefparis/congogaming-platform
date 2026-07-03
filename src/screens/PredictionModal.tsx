import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { getSession } from '../lib/auth';
import { useTranslation } from 'react-i18next';
import { teamName, FLAGS, type RawMatch } from './predictionsShared';

const API_BASE = import.meta.env.VITE_API_URL || 'https://api.congogaming.com';

type PredictionType = 'winner' | 'score_exact';
type WinnerChoice = 'home' | 'draw' | 'away';

type Props = {
  match: RawMatch;
  onClose: () => void;
  onSuccess: () => void;
};

const BEBAS_M = "FWC26-CondensedBlack, 'Bebas Neue', Impact, sans-serif";

const CONFETTI = Array.from({ length: 20 }, (_, i) => ({
  x: Math.round(Math.sin((i / 20) * 2 * Math.PI) * (70 + (i % 5) * 24)),
  y: Math.round(-Math.abs(Math.cos((i / 20) * 2 * Math.PI)) * (70 + (i % 5) * 24) * 0.9) - 10,
  color: ['#FFD700','#00C850','#ffffff','#CE1126','#F0B428','#4ade80','#FFE27A'][i % 7],
  rot: 360 + i * 24,
}));

const SUCCESS_KF = [
  '@keyframes flashGreen{0%{opacity:0.5}100%{opacity:0}}',
  '@keyframes checkIn{0%{transform:scale(0);opacity:0}60%{transform:scale(1.2);opacity:1}100%{transform:scale(1);opacity:1}}',
  '@keyframes fadeUpM{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}',
  ...CONFETTI.map((p, i) =>
    `@keyframes cf${i}{0%{transform:translate(0,0)rotate(0deg)scale(1);opacity:1}100%{transform:translate(${p.x}px,${p.y}px)rotate(${p.rot}deg)scale(0.2);opacity:0}}`
  ),
].join('\n');

const scoreBtn: CSSProperties = {
  width: 30, height: 30, borderRadius: 8, border: 'none', cursor: 'pointer',
  background: 'rgba(255,255,255,0.08)', color: '#fff',
  fontSize: 18, fontWeight: 700,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

export default function PredictionModal({ match, onClose, onSuccess }: Props) {
  const { t } = useTranslation();
  const [type, setType] = useState<PredictionType>('winner');
  const [winner, setWinner] = useState<WinnerChoice | null>(null);
  const [scoreHome, setScoreHome] = useState(1);
  const [scoreAway, setScoreAway] = useState(1);
  const [points, setPoints] = useState(100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState<{ wagered: number; gain: number } | null>(null);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  useEffect(() => {
    if (!showSuccess) return;
    const t = setTimeout(() => onSuccessRef.current(), 2000);
    return () => clearTimeout(t);
  }, [showSuccess]);

  const session = getSession();
  const balance = session?.balance_cdf ?? 0;
  const home = teamName(match.team1);
  const away = teamName(match.team2);
  const multiplier = type === 'score_exact' ? 5 : 2;
  const estimatedGain = points * multiplier;
  const matchId = match.num
    ? String(match.num)
    : `${match.date}-${home}-${away}`.toLowerCase().replace(/\s+/g, '-');
  const maxPoints = Math.min(1000, Math.max(100, Math.floor(balance / 100) * 100));

  async function handleConfirm() {
    if (type === 'winner' && !winner) {
      setError('Sélectionnez un vainqueur');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        match_id: matchId,
        prediction_type: type,
        points_wagered: points,
      };
      if (type === 'winner') body.predicted_winner = winner;
      if (type === 'score_exact') {
        body.predicted_score_home = scoreHome;
        body.predicted_score_away = scoreAway;
      }
      const res = await fetch(`${API_BASE}/api/predictions`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        const msg =
          json.error === 'INSUFFICIENT_BALANCE' ? t('predictions.balance_insuffisante')
          : json.error === 'INVALID_INPUT' ? t('predictions.donnees_invalides')
          : json.error ?? t('predictions.erreur_serveur');
        setError(msg);
        return;
      }
      setShowSuccess({ wagered: points, gain: estimatedGain });
    } catch {
      setError(t('predictions.erreur_reseau'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          style={{
            width: '100%', maxWidth: 430,
            background: 'linear-gradient(180deg, #12001e 0%, #0a0a0f 100%)',
            borderRadius: '24px 24px 0 0',
            border: '1px solid rgba(255,215,0,0.18)',
            borderBottom: 'none',
            padding: '24px 20px 40px',
            maxHeight: '92dvh', overflowY: 'auto',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 10, color: '#FFD700', fontWeight: 800, letterSpacing: 2, marginBottom: 4, textTransform: 'uppercase' }}>
                {match.group ?? match.round ?? 'WC 2026'}
              </div>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: 22, color: '#fff', letterSpacing: 1, lineHeight: 1.1 }}>
                {home} <span style={{ color: 'rgba(255,255,255,0.3)' }}>vs</span> {away}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                {match.date}{match.time ? ` · ${match.time}` : ''}
              </div>
              {match.venue && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>
                  📍 {match.venue}
                </div>
              )}
            </div>
            <button type="button" onClick={onClose} style={{
              background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8,
              cursor: 'pointer', padding: 6, color: 'rgba(255,255,255,0.5)',
            }}>
              <X size={16} />
            </button>
          </div>

          {/* Type selector */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>
              {t('predictions.type_pronostic')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {(['winner', 'score_exact'] as PredictionType[]).map(pt => (
                <button
                  key={pt}
                  type="button"
                  onClick={() => { setType(pt); setError(null); }}
                  style={{
                    padding: '12px 8px', borderRadius: 12, border: 'none', cursor: 'pointer',
                    textAlign: 'center', transition: 'all 0.15s',
                    background: type === pt
                      ? 'linear-gradient(135deg,#FFE27A 0%,#D9A400 100%)'
                      : 'rgba(255,255,255,0.05)',
                    color: type === pt ? '#0a0500' : 'rgba(255,255,255,0.6)',
                    boxShadow: type === pt ? '0 4px 16px rgba(217,164,0,0.35), 0 0 20px rgba(234,179,8,0.3)' : 'none',
                  }}
                >
                  <div style={{ fontFamily: 'Bebas Neue', fontSize: 14, letterSpacing: 1.5 }}>
                    {pt === 'winner' ? t('predictions.vainqueur').toUpperCase() : t('predictions.score_exact').toUpperCase()}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 800, marginTop: 2, opacity: 0.8 }}>
                    ×{pt === 'winner' ? 2 : 5}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Winner selector */}
          {type === 'winner' && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>
                {t('predictions.vainqueur').toUpperCase()}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                {([
                  { value: 'home' as WinnerChoice, label: home, flag: FLAGS[home] ?? '🏳️' },
                  { value: 'draw' as WinnerChoice, label: t('predictions.nul').toUpperCase(), flag: '🤝' },
                  { value: 'away' as WinnerChoice, label: away, flag: FLAGS[away] ?? '🏳️' },
                ]).map(({ value, label, flag }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setWinner(value)}
                    style={{
                      padding: '10px 4px', borderRadius: 10, border: 'none', cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      overflow: 'hidden',
                      background: winner === value
                        ? 'linear-gradient(135deg,#CE1126 0%,#8B0000 100%)'
                        : 'rgba(255,255,255,0.05)',
                      color: winner === value ? '#fff' : 'rgba(255,255,255,0.55)',
                      boxShadow: winner === value
                        ? '0 4px 12px rgba(206,17,38,0.4), 0 0 20px rgba(234,179,8,0.3)'
                        : 'none',
                    }}
                  >
                    <span style={{ fontSize: 22 }}>{flag}</span>
                    <span style={{ fontFamily: 'Bebas Neue', fontSize: 13, letterSpacing: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Score picker */}
          {type === 'score_exact' && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 }}>
                {t('predictions.score_final')}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>{home}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <button type="button" onClick={() => setScoreHome(s => Math.max(0, s - 1))} style={scoreBtn}>−</button>
                    <div style={{ fontFamily: 'Bebas Neue', fontSize: 30, color: '#FFD700', minWidth: 30, textAlign: 'center' }}>{scoreHome}</div>
                    <button type="button" onClick={() => setScoreHome(s => Math.min(20, s + 1))} style={scoreBtn}>+</button>
                  </div>
                </div>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: 20, color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>–</div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>{away}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <button type="button" onClick={() => setScoreAway(s => Math.max(0, s - 1))} style={scoreBtn}>−</button>
                    <div style={{ fontFamily: 'Bebas Neue', fontSize: 30, color: '#FFD700', minWidth: 30, textAlign: 'center' }}>{scoreAway}</div>
                    <button type="button" onClick={() => setScoreAway(s => Math.min(20, s + 1))} style={scoreBtn}>+</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Points slider */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' }}>
                {t('predictions.mise').toUpperCase()}
              </div>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: 18, color: '#FFD700' }}>
                {points.toLocaleString('fr-FR')} CDF
              </div>
            </div>
            <input
              type="range"
              min={100}
              max={maxPoints}
              step={100}
              value={points}
              onChange={e => setPoints(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#D9A400' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
              <span>100 CDF</span>
              <span>{t('predictions.solde')}: {balance.toLocaleString('fr-FR')} CDF</span>
            </div>
          </div>

          {/* Estimated gain */}
          <div style={{
            borderRadius: 12, background: 'rgba(255,215,0,0.07)',
            border: '1px solid rgba(255,215,0,0.2)', padding: '12px 16px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20,
          }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{t('predictions.gain_estime')} (×{multiplier})</div>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: 20, color: '#FFD700', letterSpacing: 1 }}>
              +{estimatedGain.toLocaleString('fr-FR')} CDF
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              borderRadius: 10, background: 'rgba(206,17,38,0.1)',
              border: '1px solid rgba(206,17,38,0.3)',
              padding: '10px 14px', fontSize: 12, color: '#ff6b6b', marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          {/* Confirm */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={handleConfirm}
            disabled={loading || balance < 100}
            style={{
              width: '100%',
              background: loading || balance < 100
                ? 'rgba(255,255,255,0.08)'
                : 'linear-gradient(135deg,#FFE27A 0%,#D9A400 100%)',
              color: loading || balance < 100 ? 'rgba(255,255,255,0.3)' : '#0a0500',
              fontFamily: 'Bebas Neue', fontSize: 18, letterSpacing: 3,
              padding: '14px 0', borderRadius: 14, border: 'none',
              cursor: loading || balance < 100 ? 'not-allowed' : 'pointer',
              boxShadow: loading || balance < 100 ? 'none' : '0 6px 20px rgba(217,164,0,0.4)',
            }}
          >
            {loading ? 'ENVOI…' : balance < 100 ? t('predictions.balance_insuffisante').toUpperCase() : t('predictions.confirmer').toUpperCase()}
          </motion.button>
        </motion.div>
      </motion.div>

      {/* ── SUCCESS OVERLAY ── */}
      {showSuccess && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,8,0,0.94)',
          }}
        >
          <style>{SUCCESS_KF}</style>

          {/* Green flash */}
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(0,200,80,0.28)',
            animation: 'flashGreen 0.4s ease-out forwards', pointerEvents: 'none',
          }} />

          {/* Confetti burst */}
          {CONFETTI.map((p, i) => (
            <div key={i} style={{
              position: 'absolute', left: '50%', top: '40%',
              width: i % 3 === 0 ? 6 : 8, height: i % 3 === 0 ? 14 : 8,
              marginLeft: -4, marginTop: -4,
              borderRadius: i % 2 === 0 ? 2 : '50%',
              background: p.color,
              animation: `cf${i} 1.4s ease-out ${0.05 + i * 0.04}s both`,
            }} />
          ))}

          {/* Content */}
          <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '0 24px' }}>
            <div style={{
              fontSize: 80, lineHeight: 1, marginBottom: 20, display: 'inline-block',
              animation: 'checkIn 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.1s both',
            }}>✅</div>
            <div style={{
              fontFamily: BEBAS_M, fontSize: 34, color: '#fff', letterSpacing: 3,
              marginBottom: 10, animation: 'fadeUpM 0.4s ease-out 0.4s both',
            }}>{t('predictions.pari_enregistre').toUpperCase()}</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', animation: 'fadeUpM 0.4s ease-out 0.55s both' }}>
              +{showSuccess.wagered.toLocaleString('fr-FR')} {t('predictions.cdf_mises')}
            </div>
            <div style={{
              fontSize: 15, color: '#00C850', fontWeight: 700, marginTop: 6,
              animation: 'fadeUpM 0.4s ease-out 0.65s both',
              textShadow: '0 0 16px rgba(0,200,80,0.6)',
            }}>
              {t('predictions.gain_potentiel')}: +{showSuccess.gain.toLocaleString('fr-FR')} CDF ✨
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
