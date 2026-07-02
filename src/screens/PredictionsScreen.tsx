import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Trophy } from 'lucide-react';
import PredictionModal from './PredictionModal';
import { teamName, type RawMatch } from './predictionsShared';

const API_BASE = import.meta.env.VITE_API_URL || 'https://api.congogaming.com';

type LeaderboardEntry = {
  user_id: string;
  total_points_won: number;
  display_name: string | null;
  phone: string | null;
};

function isPlayed(m: RawMatch): boolean {
  return !!(m.score?.ft && m.score.ft.length >= 2);
}

function formatDate(d: string): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(d));
  } catch {
    return d;
  }
}

export default function PredictionsScreen() {
  const [matches, setMatches] = useState<RawMatch[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<RawMatch | null>(null);
  const [modalKey, setModalKey] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, lRes] = await Promise.all([
        fetch(`${API_BASE}/api/matches/upcoming`, { credentials: 'include' }),
        fetch(`${API_BASE}/api/leaderboard`, { credentials: 'include' }),
      ]);
      if (mRes.ok) {
        const mJson = await mRes.json();
        setMatches(mJson.matches ?? []);
      }
      if (lRes.ok) {
        const lJson = await lRes.json();
        setLeaderboard(lJson.leaderboard ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <div className="min-h-screen pb-24" style={{ background: '#0a0a0f' }}>

      {/* Hero */}
      <div style={{
        background: 'linear-gradient(160deg, #0a0014 0%, #1c0032 50%, #0a0014 100%)',
        borderBottom: '1px solid rgba(255,215,0,0.18)',
        padding: '20px 16px 24px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div aria-hidden style={{
          position: 'absolute', inset: 0,
          background:
            'radial-gradient(circle at 15% 60%, rgba(206,17,38,0.25) 0%, transparent 55%),' +
            'radial-gradient(circle at 85% 30%, rgba(255,215,0,0.15) 0%, transparent 50%)',
          pointerEvents: 'none',
        }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <span style={{
              background: 'linear-gradient(135deg,#CE1126 0%,#8B0000 100%)',
              color: '#fff', fontSize: 9, fontWeight: 800, letterSpacing: 1.5,
              padding: '3px 9px', borderRadius: 4, textTransform: 'uppercase',
            }}>🏆 FIFA WC 2026</span>
            <span style={{
              background: 'rgba(255,215,0,0.1)', color: '#FFD700',
              fontSize: 9, fontWeight: 800, letterSpacing: 1.5,
              padding: '3px 9px', borderRadius: 4,
              border: '1px solid rgba(255,215,0,0.28)',
            }}>Congo Gaming</span>
          </div>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: 42, color: '#fff', lineHeight: 1, letterSpacing: 1 }}>
            PRONOSTIQUEZ
          </div>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: 52, color: '#FFD700', lineHeight: 1, letterSpacing: 1, marginBottom: 8 }}>
            &amp; GAGNEZ
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
            Misez vos points CDF sur les matchs de la Coupe du Monde
          </div>
        </div>
      </div>

      <div style={{ padding: '16px 16px 0' }}>

        {/* Matches section */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: 22, color: '#fff', letterSpacing: 2 }}>
            ⚽ MATCHS
          </div>
          <button type="button" onClick={loadData} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,0.4)', padding: 4,
          }}>
            <RefreshCw size={14} />
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
            Chargement…
          </div>
        ) : matches.length === 0 ? (
          <div style={{
            borderRadius: 16, background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)', padding: '32px 16px',
            textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13, marginBottom: 24,
          }}>
            Aucun match disponible pour le moment
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {matches.map((m, i) => {
              const played = isPlayed(m);
              const score = m.score?.ft;
              const home = teamName(m.team1);
              const away = teamName(m.team2);
              return (
                <motion.div
                  key={`${m.date}-${i}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  style={{
                    borderRadius: 16,
                    background: played
                      ? 'rgba(255,255,255,0.03)'
                      : 'linear-gradient(140deg, rgba(206,17,38,0.08) 0%, rgba(20,0,40,0.85) 60%, rgba(255,215,0,0.06) 100%)',
                    border: played
                      ? '1px solid rgba(255,255,255,0.07)'
                      : '1px solid rgba(255,215,0,0.2)',
                    padding: '14px 16px',
                  }}
                >
                  {/* Badge + date */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase',
                      color: played ? 'rgba(255,255,255,0.3)' : '#FFD700',
                    }}>
                      {m.group ?? m.round ?? 'WC 2026'}
                    </span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                      {formatDate(m.date)}{m.time ? ` · ${m.time}` : ''}
                    </span>
                  </div>

                  {/* Teams + score */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'Bebas Neue', fontSize: 20, color: '#fff', letterSpacing: 1 }}>
                        {home}
                      </div>
                    </div>
                    <div style={{ padding: '0 12px', textAlign: 'center' }}>
                      {played && score ? (
                        <div style={{ fontFamily: 'Bebas Neue', fontSize: 22, color: '#FFD700', letterSpacing: 2 }}>
                          {score[0]} – {score[1]}
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', fontWeight: 700 }}>VS</div>
                      )}
                    </div>
                    <div style={{ flex: 1, textAlign: 'right' }}>
                      <div style={{ fontFamily: 'Bebas Neue', fontSize: 20, color: '#fff', letterSpacing: 1 }}>
                        {away}
                      </div>
                    </div>
                  </div>

                  {/* CTA */}
                  {!played ? (
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      onClick={() => { setSelectedMatch(m); setModalKey(k => k + 1); }}
                      style={{
                        width: '100%',
                        background: 'linear-gradient(135deg,#FFE27A 0%,#D9A400 100%)',
                        color: '#0a0500', fontFamily: 'Bebas Neue',
                        fontSize: 15, letterSpacing: 2,
                        padding: '10px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
                        boxShadow: '0 4px 16px rgba(217,164,0,0.35)',
                      }}
                    >
                      PRONOSTIQUER
                    </motion.button>
                  ) : (
                    <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.25)', fontWeight: 700, letterSpacing: 1 }}>
                      TERMINÉ
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Leaderboard */}
        <div style={{
          borderRadius: 16, background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)', padding: '20px 16px', marginBottom: 16,
        }}>
          <div style={{
            fontFamily: 'Bebas Neue', fontSize: 22, color: '#fff',
            letterSpacing: 2, marginBottom: 16,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Trophy size={18} style={{ color: '#FFD700' }} />
            CLASSEMENT
          </div>
          {leaderboard.length === 0 ? (
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '12px 0' }}>
              Aucun pronostic encore soumis
            </div>
          ) : leaderboard.map((entry, i) => {
            const name = entry.display_name
              || (entry.phone ? `***${entry.phone.slice(-4)}` : `Joueur ${i + 1}`);
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            return (
              <div key={entry.user_id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                paddingBottom: i < leaderboard.length - 1 ? 12 : 0,
                marginBottom: i < leaderboard.length - 1 ? 12 : 0,
                borderBottom: i < leaderboard.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 28, textAlign: 'center', fontFamily: 'Bebas Neue',
                    fontSize: i < 3 ? 18 : 14,
                    color: i < 3 ? '#FFD700' : 'rgba(255,255,255,0.4)',
                  }}>
                    {medal}
                  </div>
                  <div style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>{name}</div>
                </div>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: 16, color: '#FFD700', letterSpacing: 1 }}>
                  {entry.total_points_won.toLocaleString('fr-FR')} pts
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* Prediction modal */}
      {selectedMatch && (
        <PredictionModal
          key={modalKey}
          match={selectedMatch}
          onClose={() => setSelectedMatch(null)}
          onSuccess={() => { setSelectedMatch(null); loadData(); }}
        />
      )}
    </div>
  );
}
