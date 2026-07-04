import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { RefreshCw, Trophy } from 'lucide-react';
import PredictionModal from './PredictionModal';
import { teamName, type RawMatch, type LiveMatch, type NormalizedMatch, type Competition, isPlayed, finalScore } from './predictionsShared';
import { Flag } from '../components/Flag';
import { TeamLogo } from '../components/TeamLogo';
import { getSession } from '../lib/auth';
import { useTranslation } from 'react-i18next';

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

function formatDate(d: string): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(d));
  } catch {
    return d;
  }
}

function formatKickoff(kickoffUtc: string | null | undefined, fallbackDate: string, fallbackTime?: string): string {
  if (kickoffUtc) {
    try {
      const date = new Date(kickoffUtc);
      const dayMonth = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(date);
      const time = new Intl.DateTimeFormat('fr-FR', {
        hour: '2-digit', minute: '2-digit',
        timeZone: 'Africa/Kinshasa',
      }).format(date);
      return `${dayMonth} · ${time}`;
    } catch {
      // fall through to fallback
    }
  }
  return `${formatDate(fallbackDate)}${fallbackTime ? ` · ${fallbackTime}` : ''}`;
}

function formatStage(m: RawMatch): string {
  const group = m.group ?? '';
  const round = m.round ?? '';
  if (group && round) return `${round} — ${group}`;
  return group || round || 'WC 2026';
}

function ScorersDisplay({ goals1, goals2, scorers1, scorers2 }: {
  goals1?: { name: string; minute: string }[];
  goals2?: { name: string; minute: string }[];
  scorers1?: string[];
  scorers2?: string[];
}) {
  const hasData = (goals1?.length || goals2?.length || scorers1?.length || scorers2?.length);
  if (!hasData) return null;
  const formatOpenfootball = (goals?: { name: string; minute: string }[]) =>
    goals?.map(g => `${g.name} ${g.minute}'`).join(', ') || '';
  const formatLive = (scorers?: string[]) =>
    scorers?.join(', ') || '';
  const homeScorers = formatOpenfootball(goals1) || formatLive(scorers1);
  const awayScorers = formatOpenfootball(goals2) || formatLive(scorers2);
  if (!homeScorers && !awayScorers) return null;
  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 12, fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
      <div style={{ flex: 1, textAlign: 'center' }}>{homeScorers}</div>
      <div style={{ flex: 1, textAlign: 'center' }}>{awayScorers}</div>
    </div>
  );
}

function getLiveData(match: RawMatch, lives: LiveMatch[]): LiveMatch | null {
  const t1 = teamName(match.team1).toLowerCase();
  const t2 = teamName(match.team2).toLowerCase();
  return lives.find(
    (l) =>
      (l.team1.toLowerCase().includes(t1) || t1.includes(l.team1.toLowerCase())) &&
      (l.team2.toLowerCase().includes(t2) || t2.includes(l.team2.toLowerCase()))
  ) ?? null;
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

type DisplayMatch = RawMatch | NormalizedMatch;

function isNormalized(m: DisplayMatch): m is NormalizedMatch {
  return (m as NormalizedMatch).competitionId !== undefined;
}

export default function PredictionsScreen() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [matches, setMatches] = useState<DisplayMatch[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<RawMatch | null>(null);
  const [modalKey, setModalKey] = useState(0);
  const [liveMatches, setLiveMatches] = useState<LiveMatch[]>([]);
  const [userStats, setUserStats] = useState({ placed: 0, won: 0, cdfWon: 0 });
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedCompetition, setSelectedCompetition] = useState('worldcup2026');

  useEffect(() => {
    fetch(`${API_BASE}/api/competitions`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.competitions) setCompetitions(d.competitions as Competition[]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const session = getSession();
    if (!session?.id) return;
    fetch(`${API_BASE}/api/predictions?user_id=${session.id}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.predictions) return;
        const preds = d.predictions as { points_won?: number | null }[];
        setUserStats({
          placed: preds.length,
          won: preds.filter(p => p.points_won != null && p.points_won > 0).length,
          cdfWon: preds.reduce((s, p) => s + (p.points_won ?? 0), 0),
        });
      })
      .catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, lRes] = await Promise.all([
        fetch(`${API_BASE}/api/matches/upcoming?competition=${selectedCompetition}`, { credentials: 'include' }),
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
  }, [selectedCompetition]);

  useEffect(() => { loadData(); }, [loadData]);

  const fetchLive = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/matches/live?competition=${selectedCompetition}`, { credentials: 'include' });
      if (r.ok) { const j = await r.json(); setLiveMatches(j.matches ?? []); }
    } catch { /* ignore */ }
  }, [selectedCompetition]);

  useEffect(() => {
    fetchLive();
    const interval = setInterval(fetchLive, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchLive]);

  const hasLiveMatch = liveMatches.some(l => l.status === 'in_progress') || matches.some(m => {
    if (isNormalized(m)) return m.status === 'live';
    return isToday(m.date) && !isPlayed(m);
  });
  const pendingCount = matches.filter(m => {
    if (isNormalized(m)) return m.status === 'scheduled';
    return !isPlayed(m);
  }).length;

  const selectedComp = competitions.find(c => c.id === selectedCompetition);
  const isWorldCup = selectedCompetition === 'worldcup2026';

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
              background: isWorldCup
                ? 'linear-gradient(135deg,#CE1126 0%,#8B0000 100%)'
                : 'linear-gradient(135deg,#1a4d2e 0%,#0d2818 100%)',
              color: '#fff', fontSize: 9, fontWeight: 800, letterSpacing: 1.5,
              padding: '3px 9px', borderRadius: 4, textTransform: 'uppercase',
            }}>{selectedComp?.display_name ?? 'Coupe du Monde 2026'}</span>
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
                {t('predictions.en_direct').toUpperCase()}
              </span>
            )}
          </div>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: 42, color: '#fff', lineHeight: 1, letterSpacing: 1 }}>
            {t('predictions.title').toUpperCase().split(' & ')[0]}
          </div>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: 52, color: '#FFD700', lineHeight: 1, letterSpacing: 1, marginBottom: 8 }}>
            {'& ' + (t('predictions.title').split(' & ')[1] ?? '').toUpperCase()}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
            {t('predictions.subtitle')}
          </div>
          {pendingCount > 0 && (
            <div style={{ marginTop: 10, fontSize: 11, color: 'rgba(255,215,0,0.6)', fontWeight: 700, letterSpacing: 0.5 }}>
              ⚡ {t('predictions.matches_left', { count: pendingCount })}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 6px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', lineHeight: 1 }}>🎯 {userStats.placed}</div>
              <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', marginTop: 4, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>{t('predictions.paris_places')}</div>
            </div>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 6px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#4ade80', lineHeight: 1 }}>✅ {userStats.won}</div>
              <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', marginTop: 4, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>{t('predictions.paris_gagnes')}</div>
            </div>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 6px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#FFD700', lineHeight: 1 }}>💰 {userStats.cdfWon}</div>
              <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', marginTop: 4, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>{t('predictions.cdf_gagnes')}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => nav('/mes-paris')}
            style={{
              marginTop: 12,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              width: '100%',
              background: 'linear-gradient(135deg, #FFE27A 0%, #D9A400 100%)',
              color: '#0a0500',
              fontFamily: 'Bebas Neue', fontSize: 20, letterSpacing: 3,
              padding: '14px 0', borderRadius: 14, border: 'none', cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(217,164,0,0.4)',
              gap: 2,
            }}
          >
            📋 {t('predictions.voir_mes_paris')}
            <span style={{ fontFamily: 'system-ui, sans-serif', fontSize: 10, fontWeight: 600, letterSpacing: 0.3, color: 'rgba(10,5,0,0.6)', marginTop: 1 }}>
              {t('predictions.mes_paris_subtitle')}
            </span>
          </button>
        </div>
      </div>

      <div style={{ padding: '16px 16px 0' }}>

        {/* Competition selector tabs */}
        {competitions.length > 1 && (
          <div style={{
            display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 14,
            paddingBottom: 4, scrollbarWidth: 'none',
          }}>
            {competitions.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCompetition(c.id)}
                style={{
                  flexShrink: 0,
                  padding: '8px 14px',
                  borderRadius: 10,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s',
                  background: selectedCompetition === c.id
                    ? 'linear-gradient(135deg,#FFE27A 0%,#D9A400 100%)'
                    : 'rgba(255,255,255,0.05)',
                  color: selectedCompetition === c.id ? '#0a0500' : 'rgba(255,255,255,0.5)',
                  boxShadow: selectedCompetition === c.id ? '0 2px 12px rgba(217,164,0,0.3)' : 'none',
                }}
              >{c.display_name}</button>
            ))}
          </div>
        )}

        {/* Matches section */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: 22, color: '#fff', letterSpacing: 2 }}>
            {t('predictions.matchs')}
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
            {t('predictions.chargement')}
          </div>
        ) : matches.length === 0 ? (
          <div style={{
            borderRadius: 16, background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)', padding: '32px 16px',
            textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13, marginBottom: 24,
          }}>
            {t('predictions.aucun_match')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {matches.map((m, i) => {
              const norm = isNormalized(m);
              let home: string, away: string;
              let isLive: boolean, isFinal: boolean;
              let scoreDisplay: string;
              let stageLabel: string;
              let kickoffLabel: string;
              let homeLogo: string | undefined, awayLogo: string | undefined;
              let homeGoals: { name: string; minute: string }[] | undefined;
              let awayGoals: { name: string; minute: string }[] | undefined;
              let liveScorers1: string[] | undefined, liveScorers2: string[] | undefined;
              let venueLabel: string | undefined;
              let matchId: string;
              let liveClock = '';
              let liveScore1 = 0, liveScore2 = 0;

              if (norm) {
                home = m.homeTeam;
                away = m.awayTeam;
                homeLogo = m.homeTeamLogo;
                awayLogo = m.awayTeamLogo;
                isLive = m.status === 'live';
                isFinal = m.status === 'finished';
                scoreDisplay = isFinal && m.homeScore != null && m.awayScore != null
                  ? `${m.homeScore} – ${m.awayScore}` : '– –';
                stageLabel = m.round ?? selectedComp?.display_name ?? '';
                kickoffLabel = formatKickoff(m.kickoffUtc, m.kickoffUtc ?? '', undefined);
                venueLabel = m.venue;
                matchId = m.id;
                if (m.scorers) {
                  homeGoals = m.scorers.filter(s => s.team === 'home').map(s => ({ name: s.name, minute: s.minute }));
                  awayGoals = m.scorers.filter(s => s.team === 'away').map(s => ({ name: s.name, minute: s.minute }));
                }
              } else {
                const rm = m as RawMatch;
                const played = isPlayed(rm);
                const score = finalScore(rm);
                const ftScore = rm.score?.ft;
                const pScore = rm.score?.p;
                home = resolveTeamName(teamName(rm.team1));
                away = resolveTeamName(teamName(rm.team2));
                const liveData = getLiveData(rm, liveMatches);
                isLive = liveData?.status === 'in_progress';
                isFinal = played || liveData?.status === 'final';
                scoreDisplay = played
                  ? ftScore && pScore
                    ? `${ftScore[0]} – ${ftScore[1]} (pen. ${pScore[0]}–${pScore[1]})`
                    : score
                      ? `${score[0]} – ${score[1]}`
                      : '– –'
                  : '– –';
                stageLabel = formatStage(rm);
                kickoffLabel = formatKickoff(rm.kickoffUtc, rm.date, rm.time);
                homeGoals = rm.goals1;
                awayGoals = rm.goals2;
                liveScorers1 = liveData?.scorers1;
                liveScorers2 = liveData?.scorers2;
                venueLabel = rm.ground;
                matchId = String(rm.num ?? '');
                if (liveData) {
                  liveClock = liveData.clock;
                  liveScore1 = liveData.score1;
                  liveScore2 = liveData.score2;
                }
              }

              const showFlag = isWorldCup;

              return (
                <motion.div
                  layout
                  key={`${matchId}-${i}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  style={{
                    position: 'relative', overflow: 'hidden',
                    borderRadius: 16,
                    background: isLive
                      ? 'linear-gradient(135deg, rgba(239,68,68,0.08) 0%, #0f0a2e 100%)'
                      : 'linear-gradient(135deg, #1a1040 0%, #0f0a2e 100%)',
                    border: isLive
                      ? '1px solid rgba(239,68,68,0.5)'
                      : `1px solid ${(home === 'DR Congo' || away === 'DR Congo') ? '#FFD700' : 'rgba(255,255,255,0.1)'}`,
                    padding: '16px',
                    opacity: isFinal && !isLive ? 0.6 : 1,
                    boxShadow: isLive ? '0 0 20px rgba(239,68,68,0.15)' : 'none',
                  }}
                >
                  {/* DRC highlight stripe (scheduled only) */}
                  {!isLive && (home === 'DR Congo' || away === 'DR Congo') && (
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                      background: 'linear-gradient(90deg, #FFD700 0%, #CE1126 50%, #FFD700 100%)',
                    }} />
                  )}

                  {isLive ? (
                    /* ── STATE 1: LIVE ── */
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="animate-pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block', flexShrink: 0 }} />
                          <span style={{ color: '#f87171', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2 }}>{t('predictions.en_direct').toUpperCase()}</span>
                        </span>
                        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, fontFamily: 'monospace' }}>
                          {liveClock ? `${liveClock}'` : ''}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0' }}>
                        <div style={{ flex: 1, textAlign: 'center' }}>
                          <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'center' }}>
                            {showFlag ? <Flag team={home} size={40} /> : <TeamLogo name={home} logoUrl={homeLogo} size={40} />}
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 }}>{home}</div>
                        </div>
                        <div style={{ textAlign: 'center', padding: '0 16px' }}>
                          <div style={{ fontFamily: 'Bebas Neue', fontSize: 52, color: '#fff', letterSpacing: 2, lineHeight: 1 }}>
                            {liveScore1} <span style={{ color: 'rgba(255,255,255,0.3)' }}>-</span> {liveScore2}
                          </div>
                        </div>
                        <div style={{ flex: 1, textAlign: 'center' }}>
                          <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'center' }}>
                            {showFlag ? <Flag team={away} size={40} /> : <TeamLogo name={away} logoUrl={awayLogo} size={40} />}
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 }}>{away}</div>
                        </div>
                      </div>
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                        <button type="button" onClick={() => nav('/mes-paris')} style={{
                          width: '100%', padding: '10px 0', borderRadius: 10,
                          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                          color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 800,
                          textTransform: 'uppercase', letterSpacing: 2, cursor: 'pointer',
                        }}>👁️ {t('predictions.voir_paris_match').toUpperCase()}</button>
                      </div>
                    </>
                  ) : (
                    /* ── STATE 2 (FINAL) / STATE 3 (SCHEDULED) ── */
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(255,215,0,0.7)' }}>
                          {stageLabel}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {isFinal && (
                            <span style={{ fontSize: 9, fontWeight: 800, color: '#4ade80', letterSpacing: 1 }}>✅ {t('predictions.termine').toUpperCase()}</span>
                          )}
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                            {kickoffLabel}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ flex: 1, textAlign: 'center' }}>
                          <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'center' }}>
                            {showFlag ? <Flag team={home} size={32} /> : <TeamLogo name={home} logoUrl={homeLogo} size={32} />}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 }}>{home}</div>
                        </div>
                        <div style={{ padding: '0 12px', textAlign: 'center', minWidth: 80 }}>
                          {isFinal ? (
                            <>
                              <div style={{ fontFamily: 'Bebas Neue', fontSize: 28, color: '#FFD700', letterSpacing: 2 }}>
                                {scoreDisplay}
                              </div>
                              <div style={{ fontSize: 10, color: '#4ade80', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2, fontWeight: 700 }}>{t('predictions.termine')}</div>
                            </>
                          ) : (
                            <div style={{ fontFamily: 'Bebas Neue', fontSize: 20, color: 'rgba(255,255,255,0.25)', letterSpacing: 2 }}>VS</div>
                          )}
                        </div>
                        <div style={{ flex: 1, textAlign: 'center' }}>
                          <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'center' }}>
                            {showFlag ? <Flag team={away} size={32} /> : <TeamLogo name={away} logoUrl={awayLogo} size={32} />}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 }}>{away}</div>
                        </div>
                      </div>
                      {isFinal && (
                        <>
                          <ScorersDisplay
                            goals1={homeGoals}
                            goals2={awayGoals}
                            scorers1={liveScorers1}
                            scorers2={liveScorers2}
                          />
                          {venueLabel && (
                            <div style={{ marginTop: 6, fontSize: 10, color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
                              📍 {venueLabel}
                            </div>
                          )}
                        </>
                      )}
                      {!isFinal && (
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.95 }}
                          onClick={() => {
                            if (!norm) {
                              setSelectedMatch(m as RawMatch);
                            } else {
                              setSelectedMatch({
                                num: undefined,
                                date: m.kickoffUtc ?? '',
                                team1: { name: m.homeTeam },
                                team2: { name: m.awayTeam },
                                round: m.round,
                                ground: m.venue,
                                kickoffUtc: m.kickoffUtc,
                              } as RawMatch);
                            }
                            setModalKey(k => k + 1);
                          }}
                          style={{
                            marginTop: 16, width: '100%',
                            background: 'linear-gradient(135deg, #FFE27A 0%, #D9A400 100%)',
                            color: '#0a0500', fontFamily: 'Bebas Neue',
                            fontSize: 15, letterSpacing: 3,
                            padding: '12px 0', borderRadius: 12, border: 'none', cursor: 'pointer',
                            boxShadow: '0 4px 16px rgba(217,164,0,0.35)',
                          }}
                        >
                          ⚡ {t('predictions.pronostiquer').toUpperCase()}
                        </motion.button>
                      )}
                    </>
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
            {t('predictions.classement')}
          </div>
          {leaderboard.length === 0 ? (
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '12px 0' }}>
              {t('predictions.aucun_pronostic')}
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
