import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { RefreshCw, Trophy } from 'lucide-react';
import PredictionModal from './PredictionModal';
import { teamName, FLAGS, type RawMatch } from './predictionsShared';

const API_BASE = import.meta.env.VITE_API_URL || 'https://api.congogaming.com';

const CODE_TO_NAME: Record<string, string> = {
  'FR': 'France',   'FRA': 'France',
  'PT': 'Portugal', 'POR': 'Portugal',
  'ES': 'Spain',    'ESP': 'Spain',
  'EN': 'England',  'ENG': 'England',
  'BR': 'Brazil',   'BRA': 'Brazil',
  'AR': 'Argentina','ARG': 'Argentina',
  'DE': 'Germany',  'GER': 'Germany',
  'NL': 'Netherlands','NED': 'Netherlands',
  'BE': 'Belgium',  'BEL': 'Belgium',
  'HR': 'Croatia',  'CRO': 'Croatia',
  'MA': 'Morocco',  'MAR': 'Morocco',
  'US': 'USA',      'USA': 'USA',
  'MX': 'Mexico',   'MEX': 'Mexico',
  'JP': 'Japan',    'JPN': 'Japan',
  'SN': 'Senegal',  'SEN': 'Senegal',
  'CD': 'DR Congo', 'COD': 'DR Congo',
  'ZA': 'South Africa','RSA': 'South Africa',
  'DZ': 'Algeria',  'ALG': 'Algeria',
  'CH': 'Switzerland','SUI': 'Switzerland',
  'AT': 'Austria',  'AUT': 'Austria',
  'SE': 'Sweden',   'SWE': 'Sweden',
  'NO': 'Norway',   'NOR': 'Norway',
  'CA': 'Canada',   'CAN': 'Canada',
  'AU': 'Australia','AUS': 'Australia',
  'CO': 'Colombia', 'COL': 'Colombia',
  'EC': 'Ecuador',  'ECU': 'Ecuador',
  'UY': 'Uruguay',  'URU': 'Uruguay',
  'KR': 'South Korea','KOR': 'South Korea',
  'SA': 'Saudi Arabia','KSA': 'Saudi Arabia',
  'IR': 'Iran',     'IRN': 'Iran',
  'CI': 'Ivory Coast','CIV': 'Ivory Coast',
  'CV': 'Cape Verde','CPV': 'Cape Verde',
  'United States': 'USA',
  'IR Iran': 'Iran','Korea Republic': 'South Korea',
  'Côte d\'Ivoire': 'Ivory Coast','Cote d\'Ivoire': 'Ivory Coast',
  'DR Congo': 'DR Congo','Congo DR': 'DR Congo',
};

function resolveTeamName(raw: string): string {
  return CODE_TO_NAME[raw] ?? raw;
}

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

function isToday(dateStr: string): boolean {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  } catch {
    return false;
  }
}

export default function PredictionsScreen() {
  const nav = useNavigate();
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

  const hasLiveMatch = matches.some(m => isToday(m.date) && !isPlayed(m));
  const pendingCount = matches.filter(m => !isPlayed(m)).length;

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
        <div aria-hidden style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(255,215,0,0.07) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
          pointerEvents: 'none',
        }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
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
            {hasLiveMatch && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: 'rgba(74,222,128,0.1)', color: '#4ade80',
                fontSize: 9, fontWeight: 800, letterSpacing: 1.5,
                padding: '3px 9px', borderRadius: 4, textTransform: 'uppercase',
                border: '1px solid rgba(74,222,128,0.3)',
              }}>
                <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', display: 'inline-block', flexShrink: 0 }} />
                EN DIRECT
              </span>
            )}
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
          {pendingCount > 0 && (
            <div style={{ marginTop: 10, fontSize: 11, color: 'rgba(255,215,0,0.6)', fontWeight: 700, letterSpacing: 0.5 }}>
              ⚡ {pendingCount} match{pendingCount > 1 ? 's' : ''} restant{pendingCount > 1 ? 's' : ''}
            </div>
          )}
          <button
            type="button"
            onClick={() => nav('/mes-paris')}
            style={{
              marginTop: 14,
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: 'rgba(255,215,0,0.1)', color: '#FFD700',
              fontSize: 11, fontWeight: 800, letterSpacing: 1.5,
              padding: '5px 12px', borderRadius: 20,
              border: '1px solid rgba(255,215,0,0.28)',
              cursor: 'pointer',
            }}
          >
            📋 MES PARIS →
          </button>
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
              const home = resolveTeamName(teamName(m.team1));
              const away = resolveTeamName(teamName(m.team2));
              return (
                <motion.div
                  key={`${m.date}-${i}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  style={{
                    position: 'relative', overflow: 'hidden',
                    borderRadius: 16,
                    background: 'linear-gradient(135deg, #1a1040 0%, #0f0a2e 100%)',
                    border: `1px solid ${(home === 'DR Congo' || away === 'DR Congo') ? '#FFD700' : 'rgba(255,255,255,0.1)'}`,
                    padding: '16px',
                    opacity: played ? 0.6 : 1,
                  }}
                >
                  {/* DRC highlight stripe */}
                  {(home === 'DR Congo' || away === 'DR Congo') && (
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                      background: 'linear-gradient(90deg, #FFD700 0%, #CE1126 50%, #FFD700 100%)',
                    }} />
                  )}

                  {/* Round badge + date */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(255,215,0,0.7)' }}>
                      {m.group ?? m.round ?? 'WC 2026'}
                    </span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                      {formatDate(m.date)}{m.time ? ` · ${m.time}` : ''}
                    </span>
                  </div>

                  {/* Teams row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: 32, marginBottom: 4 }}>{FLAGS[home] ?? '🏳️'}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 }}>{home}</div>
                    </div>

                    <div style={{ padding: '0 12px', textAlign: 'center', minWidth: 80 }}>
                      {played && score ? (
                        <>
                          <div style={{ fontFamily: 'Bebas Neue', fontSize: 28, color: '#FFD700', letterSpacing: 2 }}>
                            {score[0]} – {score[1]}
                          </div>
                          <div style={{ fontSize: 10, color: '#4ade80', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2, fontWeight: 700 }}>Terminé</div>
                        </>
                      ) : (
                        <div style={{ fontFamily: 'Bebas Neue', fontSize: 20, color: 'rgba(255,255,255,0.25)', letterSpacing: 2 }}>VS</div>
                      )}
                    </div>

                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: 32, marginBottom: 4 }}>{FLAGS[away] ?? '🏳️'}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 }}>{away}</div>
                    </div>
                  </div>

                  {/* CTA */}
                  {!played && (
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.95 }}
                      onClick={() => { setSelectedMatch(m); setModalKey(k => k + 1); }}
                      style={{
                        marginTop: 16, width: '100%',
                        background: 'linear-gradient(135deg, #FFE27A 0%, #D9A400 100%)',
                        color: '#0a0500', fontFamily: 'Bebas Neue',
                        fontSize: 15, letterSpacing: 3,
                        padding: '12px 0', borderRadius: 12, border: 'none', cursor: 'pointer',
                        boxShadow: '0 4px 16px rgba(217,164,0,0.35)',
                      }}
                    >
                      ⚡ PRONOSTIQUER
                    </motion.button>
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
          onSuccess={() => { setSelectedMatch(null); nav('/mes-paris'); }}
        />
      )}
    </div>
  );
}
