import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { getSession } from '../lib/auth';
import { useTranslation } from 'react-i18next';
import { FLAGS } from './predictionsShared';

const API_BASE = import.meta.env.VITE_API_URL || 'https://api.congogaming.com';

type Prediction = {
  id: string;
  match_id: string;
  prediction_type: 'winner' | 'score_exact';
  predicted_winner: string | null;
  predicted_score_home: number | null;
  predicted_score_away: number | null;
  points_wagered: number;
  points_won: number | null;
  status: 'pending' | 'won' | 'lost' | 'cancelled';
  created_at: string;
};

const KNOWN_TEAMS = Object.keys(FLAGS)
  .map(t => ({ name: t, slug: t.toLowerCase().replace(/\s+/g, '-') }))
  .sort((a, b) => b.slug.length - a.slug.length);

const BEBAS = "FWC26-CondensedBlack, 'Bebas Neue', Impact, sans-serif";

function parseMatchInfo(matchId: string) {
  if (/^\d+$/.test(matchId)) return { title: `Match #${matchId}`, home: '', away: '', date: '' };
  const dm = matchId.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
  if (!dm) return { title: matchId, home: '', away: '', date: '' };
  const [, date, rest] = dm;
  for (const a of KNOWN_TEAMS) {
    if (rest.startsWith(a.slug + '-')) {
      const after = rest.slice(a.slug.length + 1);
      for (const b of KNOWN_TEAMS) {
        if (after === b.slug) return { title: `${a.name} vs ${b.name}`, home: a.name, away: b.name, date };
      }
    }
  }
  const label = rest.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return { title: label, home: '', away: '', date };
}

function fmtDate(d: string) {
  if (!d) return '';
  try { return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d)); }
  catch { return d; }
}

function choiceLabel(p: Prediction) {
  if (p.prediction_type === 'score_exact') return `Score: ${p.predicted_score_home ?? '?'} – ${p.predicted_score_away ?? '?'}`;
  return ({ home: 'Domicile 🏠', away: 'Extérieur ✈️', draw: 'Match nul 🤝' } as Record<string, string>)[p.predicted_winner ?? ''] ?? '?';
}

function useCountUp(target: number, duration = 1100): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (target === 0) { setVal(0); return; }
    let raf: number;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      setVal(Math.round((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

const CARD_S = {
  won: {
    bg: 'linear-gradient(135deg, rgba(0,200,80,0.12) 0%, rgba(0,0,0,0.82) 100%)',
    border: '1px solid rgba(0,200,80,0.42)', accent: '#00C850',
    badge: { bg: 'rgba(0,200,80,0.15)', color: '#00C850', border: 'rgba(0,200,80,0.4)', glow: '0 0 10px rgba(0,200,80,0.4)' },
    opacity: 1, anim: 'wonGlow 1.2s ease-out both',
  },
  pending: {
    bg: 'linear-gradient(135deg, rgba(240,180,40,0.09) 0%, rgba(0,0,0,0.82) 100%)',
    border: '1px solid rgba(240,180,40,0.32)', accent: '#F0B428',
    badge: { bg: 'rgba(240,180,40,0.12)', color: '#F0B428', border: 'rgba(240,180,40,0.38)', glow: '0 0 8px rgba(240,180,40,0.3)' },
    opacity: 1, anim: 'goldPulseGlow 2.4s ease-in-out infinite',
  },
  lost: {
    bg: 'rgba(0,0,0,0.62)',
    border: '1px solid rgba(255,50,50,0.22)', accent: 'rgba(255,50,50,0.5)',
    badge: { bg: 'rgba(255,50,50,0.1)', color: '#f87171', border: 'rgba(255,50,50,0.3)', glow: 'none' },
    opacity: 0.65, anim: '',
  },
  cancelled: {
    bg: 'rgba(0,0,0,0.5)',
    border: '1px solid rgba(255,255,255,0.09)', accent: 'rgba(255,255,255,0.2)',
    badge: { bg: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.38)', border: 'rgba(255,255,255,0.15)', glow: 'none' },
    opacity: 0.5, anim: '',
  },
} as const;


const KF = `
@keyframes goldPulseGlow {
  0%,100% { box-shadow: 0 0 10px rgba(240,180,40,0.08), 0 4px 20px rgba(0,0,0,0.5); }
  50% { box-shadow: 0 0 28px rgba(240,180,40,0.42), 0 0 56px rgba(240,180,40,0.14), 0 4px 20px rgba(0,0,0,0.5); }
}
@keyframes wonGlow {
  0% { box-shadow: 0 0 0 rgba(0,200,80,0), 0 4px 20px rgba(0,0,0,0.5); }
  40% { box-shadow: 0 0 36px rgba(0,200,80,0.55), 0 0 72px rgba(0,200,80,0.2), 0 4px 20px rgba(0,0,0,0.5); }
  100% { box-shadow: 0 0 14px rgba(0,200,80,0.18), 0 4px 20px rgba(0,0,0,0.5); }
}
@keyframes trophyBounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
@keyframes shimmerBtn { 0%{background-position:200% center} 100%{background-position:-200% center} }
`;

export default function MesParis() {
  const { t } = useTranslation();
  const BADGE_LABEL: Record<string, string> = {
    won: `✅ ${t('predictions.gagne').toUpperCase()}`,
    pending: `⏳ ${t('predictions.en_cours').toUpperCase()}`,
    lost: `❌ ${t('predictions.perdu').toUpperCase()}`,
    cancelled: `↩️ ${t('predictions.annule').toUpperCase()}`,
  };
  const nav = useNavigate();
  const [preds, setPreds] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const session = getSession();

  const load = useCallback(async () => {
    if (!session?.id) { setLoading(false); return; }
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/predictions?user_id=${session.id}`, { credentials: 'include' });
      if (r.ok) { const j = await r.json(); setPreds(j.predictions ?? []); }
    } finally { setLoading(false); }
  }, [session?.id]);

  useEffect(() => { load(); }, [load]);

  const total = preds.length;
  const won   = preds.filter(p => p.status === 'won').length;
  const cdf   = preds.reduce((s, p) => s + (p.points_won ?? 0), 0);
  const cTotal = useCountUp(total);
  const cWon   = useCountUp(won);
  const cCdf   = useCountUp(cdf);

  return (
    <div style={{ minHeight: '100dvh', background: 'linear-gradient(180deg,#06060f 0%,#0a0a14 100%)', overflowX: 'hidden' }}>
      <style>{KF}</style>

      {/* ── STICKY HEADER ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        background: 'rgba(6,6,15,0.92)', borderBottom: '1px solid rgba(255,215,0,0.1)',
        padding: '10px 16px',
      }}>
        <motion.div
          initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
          style={{ display: 'flex', alignItems: 'center', gap: 12 }}
        >
          <button type="button" onClick={() => nav(-1 as never)} style={{
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10, padding: '7px 9px', cursor: 'pointer', color: '#fff',
            display: 'flex', alignItems: 'center',
          }}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <div style={{ fontFamily: BEBAS, fontSize: 22, color: '#fff', letterSpacing: 2, lineHeight: 1 }}>{t('predictions.mes_paris_title').toUpperCase()}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,215,0,0.55)', letterSpacing: 0.5, marginTop: 1 }}>
              {t('predictions.mes_paris_subtitle')}
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── STATS ROW (count-up) ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.4 }}
        style={{ padding: '14px 14px 0', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}
      >
        {([
          { val: cTotal, label: t('predictions.paris_places'), sub: '', color: '#FFD700', small: false },
          { val: cWon,   label: t('predictions.paris_gagnes'),  sub: '', color: '#00C850', small: false },
          { val: cCdf,   label: t('predictions.cdf_gagnes'),   sub: '', color: '#FFD700', small: true },
        ]).map(({ val, label, sub, color, small }) => (
          <div key={label} style={{
            background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14,
            padding: '12px 6px', textAlign: 'center',
          }}>
            <div style={{
              fontFamily: BEBAS, fontSize: small ? 18 : 28, color, lineHeight: 1, marginBottom: 3,
              textShadow: `0 0 18px ${color}66`,
            }}>
              {val.toLocaleString('fr-FR')}
            </div>
            <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: 1.2, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase' }}>
              {label}
            </div>
            {sub ? <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.28)', marginTop: 1 }}>{sub}</div> : null}
          </div>
        ))}
      </motion.div>

      {/* ── CARDS ── */}
      <div style={{ padding: '14px 14px 100px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
            {t('predictions.chargement')}
          </div>
        ) : preds.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 16px' }}>
            <div style={{ fontSize: 72, marginBottom: 16, display: 'inline-block', animation: 'trophyBounce 2s ease-in-out infinite' }}>
              🏆
            </div>
            <div style={{ fontFamily: BEBAS, fontSize: 24, color: 'rgba(255,215,0,0.82)', letterSpacing: 2, marginBottom: 6, textShadow: '0 0 22px rgba(255,215,0,0.4)' }}>
              {t('predictions.aucun_pari')}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', marginBottom: 28 }}>
              {t('predictions.aucun_pari_sub')}
            </div>
            <button type="button" onClick={() => nav('/predictions')} style={{
              background: 'linear-gradient(90deg,#FFE27A,#D9A400,#FFE27A)', backgroundSize: '200% auto',
              animation: 'shimmerBtn 2.4s linear infinite',
              color: '#0a0500', fontFamily: BEBAS, fontSize: 16, letterSpacing: 3,
              padding: '14px 28px', borderRadius: 14, border: 'none', cursor: 'pointer',
              boxShadow: '0 4px 24px rgba(217,164,0,0.45)',
            }}>
              ⚡ {t('predictions.parier_maintenant').toUpperCase()}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {preds.map((pred, i) => {
              const cfg = CARD_S[pred.status] ?? CARD_S.pending;
              const { home, away, date, title } = parseMatchInfo(pred.match_id);
              const mult    = pred.prediction_type === 'score_exact' ? 5 : 2;
              const potGain = pred.points_wagered * mult;

              return (
                <motion.div
                  key={pred.id}
                  initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1, type: 'spring', stiffness: 260, damping: 22 }}
                  style={{
                    borderRadius: 18, background: cfg.bg, border: cfg.border,
                    overflow: 'hidden', opacity: cfg.opacity, position: 'relative',
                    animation: cfg.anim || undefined,
                  }}
                >
                  {/* Left accent bar */}
                  <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, background: cfg.accent }} />

                  {/* Scanline texture (won only) */}
                  {pred.status === 'won' && (
                    <div aria-hidden style={{
                      position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 0.04,
                      backgroundImage: 'repeating-linear-gradient(0deg,#fff 0,#fff 1px,transparent 1px,transparent 4px)',
                    }} />
                  )}

                  <div style={{ padding: '14px 14px 14px 18px', position: 'relative', zIndex: 1 }}>

                    {/* Row 1: round label + status badge */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.4, color: 'rgba(255,215,0,0.65)', textTransform: 'uppercase' }}>
                        ⚡ Coupe du Monde 2026
                      </span>
                      <span style={{
                        background: cfg.badge.bg, color: cfg.badge.color,
                        border: `1px solid ${cfg.badge.border}`,
                        borderRadius: 20, padding: '3px 10px',
                        fontSize: 10, fontWeight: 800, letterSpacing: 0.8,
                        boxShadow: cfg.badge.glow,
                      }}>
                        {pred.status === 'won' && pred.points_won != null
                          ? `✅ GAGNÉ +${pred.points_won.toLocaleString('fr-FR')} CDF`
                          : BADGE_LABEL[pred.status]}
                      </span>
                    </div>

                    {/* Teams */}
                    {home && away ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', marginBottom: 14 }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 38 }}>{FLAGS[home] ?? '🏳️'}</div>
                          <div style={{ fontFamily: BEBAS, fontSize: 13, color: '#fff', letterSpacing: 1, marginTop: 2 }}>{home}</div>
                        </div>
                        <div style={{ fontFamily: BEBAS, fontSize: 20, color: 'rgba(255,255,255,0.2)', letterSpacing: 3 }}>VS</div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 38 }}>{FLAGS[away] ?? '🏳️'}</div>
                          <div style={{ fontFamily: BEBAS, fontSize: 13, color: '#fff', letterSpacing: 1, marginTop: 2 }}>{away}</div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontFamily: BEBAS, fontSize: 18, color: '#fff', letterSpacing: 1, marginBottom: 12 }}>
                        {title}
                      </div>
                    )}

                    {/* Divider */}
                    <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', marginBottom: 12 }} />

                    {/* Stats grid: MON CHOIX / MISE / GAIN EST. */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                      {[
                        { l: t('predictions.mon_choix').toUpperCase(), v: choiceLabel(pred), color: '#fff' },
                        { l: t('predictions.mise').toUpperCase(), v: `${pred.points_wagered.toLocaleString('fr-FR')} CDF`, color: '#fff' },
                        { l: t('predictions.gain_estime').toUpperCase(), v: `+${potGain.toLocaleString('fr-FR')} CDF`, color: pred.status === 'won' ? '#00C850' : '#FFD700' },
                      ].map(({ l, v, color }) => (
                        <div key={l}>
                          <div style={{ fontSize: 7, fontWeight: 800, letterSpacing: 1, color: 'rgba(255,255,255,0.32)', textTransform: 'uppercase', marginBottom: 3 }}>
                            {l}
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 700, color, lineHeight: 1.3 }}>{v}</div>
                        </div>
                      ))}
                    </div>

                    {/* Date */}
                    {date && (
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', marginTop: 4 }}>
                        {fmtDate(date)}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
