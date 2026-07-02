import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { getSession } from '../lib/auth';
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

const KNOWN_TEAMS = Object.keys(FLAGS).map(t => ({
  name: t,
  slug: t.toLowerCase().replace(/\s+/g, '-'),
})).sort((a, b) => b.slug.length - a.slug.length);

function parseMatchParts(matchId: string): { home: string; away: string; date: string } | null {
  const dateMatch = matchId.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
  if (!dateMatch) return null;
  const date = dateMatch[1];
  const rest = dateMatch[2];

  for (const teamA of KNOWN_TEAMS) {
    if (rest.startsWith(teamA.slug + '-')) {
      const afterHome = rest.slice(teamA.slug.length + 1);
      for (const teamB of KNOWN_TEAMS) {
        if (afterHome === teamB.slug) {
          return { home: teamA.name, away: teamB.name, date };
        }
      }
    }
  }
  return null;
}

function parseMatchLabel(matchId: string): { title: string; home?: string; away?: string; date: string } {
  if (/^\d+$/.test(matchId)) return { title: `Match #${matchId}`, date: '' };

  const parts = parseMatchParts(matchId);
  if (parts) {
    return {
      title: `${parts.home} vs ${parts.away}`,
      home: parts.home,
      away: parts.away,
      date: parts.date,
    };
  }

  const dateMatch = matchId.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
  if (dateMatch) {
    const label = dateMatch[2]
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    return { title: label, date: dateMatch[1] };
  }

  return { title: matchId, date: '' };
}

function formatDateStr(dateStr: string): string {
  if (!dateStr) return '';
  try {
    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

function getChoiceLabel(pred: Prediction): string {
  if (pred.prediction_type === 'score_exact') {
    return `Score: ${pred.predicted_score_home ?? '?'} – ${pred.predicted_score_away ?? '?'}`;
  }
  const map: Record<string, string> = {
    home: 'Domicile 🏠',
    away: 'Extérieur ✈️',
    draw: 'Match nul 🤝',
  };
  return map[pred.predicted_winner ?? ''] ?? (pred.predicted_winner ?? '?');
}

function getMultiplier(pred: Prediction): number {
  return pred.prediction_type === 'score_exact' ? 5 : 2;
}

const STATUS_CFG = {
  pending: {
    label: '⏳ EN COURS',
    color: '#FFD700',
    bg: 'rgba(255,215,0,0.12)',
    border: 'rgba(255,215,0,0.45)',
    cardBg: 'rgba(255,215,0,0.04)',
    cardBorder: 'rgba(255,215,0,0.45)',
    opacity: 1,
    pulse: true,
  },
  won: {
    label: '✅ GAGNÉ',
    color: '#4ade80',
    bg: 'rgba(74,222,128,0.12)',
    border: 'rgba(74,222,128,0.5)',
    cardBg: 'rgba(74,222,128,0.04)',
    cardBorder: 'rgba(74,222,128,0.5)',
    opacity: 1,
    pulse: false,
  },
  lost: {
    label: '❌ PERDU',
    color: '#f87171',
    bg: 'rgba(248,113,113,0.12)',
    border: 'rgba(248,113,113,0.3)',
    cardBg: 'rgba(248,113,113,0.04)',
    cardBorder: 'rgba(248,113,113,0.2)',
    opacity: 0.7,
    pulse: false,
  },
  cancelled: {
    label: '↩️ ANNULÉ',
    color: 'rgba(255,255,255,0.35)',
    bg: 'rgba(255,255,255,0.06)',
    border: 'rgba(255,255,255,0.18)',
    cardBg: 'rgba(255,255,255,0.02)',
    cardBorder: 'rgba(255,255,255,0.18)',
    opacity: 0.5,
    pulse: false,
  },
} as const;

export default function MesParis() {
  const nav = useNavigate();
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);

  const session = getSession();
  const userId = session?.id;

  const loadPredictions = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/predictions?user_id=${userId}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const json = await res.json();
        setPredictions(json.predictions ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadPredictions(); }, [loadPredictions]);

  const totalParis = predictions.length;
  const totalGagnes = predictions.filter(p => p.status === 'won').length;
  const totalCdf = predictions.reduce((s, p) => s + (p.points_won ?? 0), 0);

  return (
    <div className="min-h-screen pb-24" style={{ background: '#0a0a0f' }}>

      {/* ── HEADER ── */}
      <div style={{
        background: 'linear-gradient(160deg, #0a0014 0%, #1c0032 50%, #0a0014 100%)',
        borderBottom: '1px solid rgba(255,215,0,0.18)',
        padding: '16px 16px 20px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div aria-hidden style={{
          position: 'absolute', inset: 0,
          background:
            'radial-gradient(circle at 15% 60%, rgba(206,17,38,0.2) 0%, transparent 55%),' +
            'radial-gradient(circle at 85% 30%, rgba(255,215,0,0.12) 0%, transparent 50%)',
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Title row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <button
              type="button"
              onClick={() => nav(-1 as never)}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 10,
                padding: '8px 10px',
                cursor: 'pointer',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
              }}
            >
              <ArrowLeft size={18} />
            </button>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: 28, color: '#fff', letterSpacing: 2 }}>
              MES PARIS 🏆
            </div>
          </div>

          {/* Stats pills */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{
              background: 'rgba(255,215,0,0.08)',
              border: '1px solid rgba(255,215,0,0.25)',
              borderRadius: 20, padding: '6px 14px',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
            }}>
              <span style={{ fontFamily: 'Bebas Neue', fontSize: 22, color: '#FFD700', lineHeight: 1 }}>
                {totalParis}
              </span>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 1 }}>
                paris
              </span>
            </div>

            <div style={{
              background: 'rgba(74,222,128,0.08)',
              border: '1px solid rgba(74,222,128,0.25)',
              borderRadius: 20, padding: '6px 14px',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
            }}>
              <span style={{ fontFamily: 'Bebas Neue', fontSize: 22, color: '#4ade80', lineHeight: 1 }}>
                {totalGagnes}
              </span>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 1 }}>
                gagnés
              </span>
            </div>

            <div style={{
              background: 'rgba(255,215,0,0.08)',
              border: '1px solid rgba(255,215,0,0.25)',
              borderRadius: 20, padding: '6px 14px',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
            }}>
              <span style={{ fontFamily: 'Bebas Neue', fontSize: 22, color: '#FFD700', lineHeight: 1 }}>
                {totalCdf.toLocaleString('fr-FR')}
              </span>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 1 }}>
                CDF gagnés
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{ padding: '16px 16px 0' }}>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
            Chargement…
          </div>

        ) : predictions.length === 0 ? (
          /* Empty state */
          <div style={{ textAlign: 'center', padding: '60px 16px' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🏆</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginBottom: 8 }}>
              Aucun pari pour le moment
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', marginBottom: 28 }}>
              Faites votre premier pronostic sur un match de la Coupe du Monde
            </div>
            <button
              type="button"
              onClick={() => nav('/predictions')}
              style={{
                background: 'linear-gradient(135deg, #FFE27A 0%, #D9A400 100%)',
                color: '#0a0500',
                fontFamily: 'Bebas Neue',
                fontSize: 16,
                letterSpacing: 3,
                padding: '14px 28px',
                borderRadius: 14,
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 20px rgba(217,164,0,0.4)',
              }}
            >
              ⚡ PARIER MAINTENANT
            </button>
          </div>

        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {predictions.map((pred, i) => {
              const cfg = STATUS_CFG[pred.status] ?? STATUS_CFG.pending;
              const { title, home, away, date } = parseMatchLabel(pred.match_id);
              const dateLabel = formatDateStr(date);
              const choiceLabel = getChoiceLabel(pred);
              const potentialGain = pred.points_wagered * getMultiplier(pred);

              return (
                <motion.div
                  key={pred.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  style={{
                    borderRadius: 16,
                    background: cfg.cardBg,
                    border: `1px solid ${cfg.cardBorder}`,
                    padding: '16px',
                    opacity: cfg.opacity,
                  }}
                >
                  {/* Match title */}
                  <div style={{ marginBottom: 10 }}>
                    {home && away ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 20 }}>{FLAGS[home] ?? '🏳️'}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          {home}
                        </span>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>vs</span>
                        <span style={{ fontSize: 20 }}>{FLAGS[away] ?? '🏳️'}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          {away}
                        </span>
                      </div>
                    ) : (
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{title}</div>
                    )}
                    {dateLabel && (
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                        {dateLabel}
                      </div>
                    )}
                  </div>

                  <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 10 }} />

                  {/* Choice */}
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginBottom: 8 }}>
                    <span style={{ color: 'rgba(255,255,255,0.4)' }}>Mon choix: </span>
                    {choiceLabel}
                  </div>

                  {/* Stake / gain */}
                  <div style={{ display: 'flex', gap: 20, marginBottom: 12, flexWrap: 'wrap' }}>
                    <div>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Mise </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
                        {pred.points_wagered.toLocaleString('fr-FR')} CDF
                      </span>
                    </div>
                    <div>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Gain potentiel </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#FFD700' }}>
                        +{potentialGain.toLocaleString('fr-FR')} CDF
                      </span>
                    </div>
                  </div>

                  {/* Status badge */}
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {cfg.pulse && (
                      <span
                        className="animate-pulse"
                        style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: cfg.color, display: 'inline-block', flexShrink: 0,
                        }}
                      />
                    )}
                    <span style={{
                      display: 'inline-flex', alignItems: 'center',
                      background: cfg.bg,
                      border: `1px solid ${cfg.border}`,
                      borderRadius: 20,
                      padding: '4px 12px',
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: 0.8,
                      color: cfg.color,
                    }}>
                      {pred.status === 'won' && pred.points_won != null
                        ? `✅ GAGNÉ +${pred.points_won.toLocaleString('fr-FR')} CDF`
                        : cfg.label}
                    </span>
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
