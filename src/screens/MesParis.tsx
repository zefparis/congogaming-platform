import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { getSession } from '../lib/auth';
import { useTranslation } from 'react-i18next';
import { FLAGS, LiveMatch, RawMatch, teamName, finalScore, isPlayed } from './predictionsShared';

const API_BASE = import.meta.env.VITE_API_URL || 'https://api.congogaming.com';

// ── types ────────────────────────────────────────────────────────────────────

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

type TabKey = 'all' | 'pending' | 'won' | 'lost' | 'cancelled';

// ── constants ─────────────────────────────────────────────────────────────────

const BEBAS = "FWC26-CondensedBlack, 'Bebas Neue', Impact, sans-serif";

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
    opacity: 0.75, anim: '',
  },
  cancelled: {
    bg: 'rgba(0,0,0,0.5)',
    border: '1px solid rgba(255,255,255,0.09)', accent: 'rgba(255,255,255,0.2)',
    badge: { bg: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.38)', border: 'rgba(255,255,255,0.15)', glow: 'none' },
    opacity: 0.6, anim: '',
  },
} as const;

type CardCfg = typeof CARD_S[keyof typeof CARD_S];

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
@keyframes livePulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.45;transform:scale(0.8)} }
`;

// ── helper functions ──────────────────────────────────────────────────────────

function fmtDate(d: string) {
  if (!d) return '';
  try { return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d)); }
  catch { return d; }
}

function choiceLabel(p: Prediction) {
  if (p.prediction_type === 'score_exact')
    return `Score: ${p.predicted_score_home ?? '?'} – ${p.predicted_score_away ?? '?'}`;
  return ({ home: 'Domicile 🏠', away: 'Extérieur ✈️', draw: 'Match nul 🤝' } as Record<string, string>)[p.predicted_winner ?? ''] ?? '?';
}

function countdown(date: string, time?: string): string {
  const dtStr = time ? `${date}T${time}:00` : `${date}T00:00:00`;
  const diff = new Date(dtStr).getTime() - Date.now();
  if (diff <= 0) return '';
  const totalMin = Math.floor(diff / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h >= 48) return `Dans ${Math.floor(h / 24)}j`;
  if (h >= 1) return `Dans ${h}h${m.toString().padStart(2, '0')}`;
  return `Dans ${m}min`;
}

function getLiveForMatch(raw: RawMatch | undefined, lives: LiveMatch[]): LiveMatch | null {
  if (!raw || !lives.length) return null;
  const t1 = teamName(raw.team1).toLowerCase();
  const t2 = teamName(raw.team2).toLowerCase();
  return lives.find(l => l.team1.toLowerCase() === t1 && l.team2.toLowerCase() === t2) ?? null;
}

function dominantStatus(ps: Prediction[]): Prediction['status'] {
  if (ps.some(p => p.status === 'pending'))   return 'pending';
  if (ps.some(p => p.status === 'won'))       return 'won';
  if (ps.some(p => p.status === 'lost'))      return 'lost';
  return 'cancelled';
}

// ── count-up hook ─────────────────────────────────────────────────────────────

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

// ── sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ pred, cfg, badgeLabel }: { pred: Prediction; cfg: CardCfg; badgeLabel: string }) {
  return (
    <span style={{
      background: cfg.badge.bg, color: cfg.badge.color,
      border: `1px solid ${cfg.badge.border}`,
      borderRadius: 20, padding: '3px 10px',
      fontSize: 10, fontWeight: 800, letterSpacing: 0.8,
      boxShadow: cfg.badge.glow,
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      {pred.status === 'won' && '🏆 '}
      {pred.status === 'won' && pred.points_won != null
        ? `GAGNÉ +${pred.points_won.toLocaleString('fr-FR')} CDF`
        : badgeLabel}
    </span>
  );
}

function SingleBetBody({ pred, cfg, badgeLabel }: { pred: Prediction; cfg: CardCfg; badgeLabel: string }) {
  const mult = pred.prediction_type === 'score_exact' ? 5 : 2;
  const potGain = pred.points_wagered * mult;
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{choiceLabel(pred)}</span>
        <StatusBadge pred={pred} cfg={cfg} badgeLabel={badgeLabel} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <div style={{ fontSize: 7, fontWeight: 800, letterSpacing: 1, color: 'rgba(255,255,255,0.32)', textTransform: 'uppercase', marginBottom: 2 }}>Mise</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{pred.points_wagered.toLocaleString('fr-FR')} CDF</div>
        </div>
        <div>
          <div style={{ fontSize: 7, fontWeight: 800, letterSpacing: 1, color: 'rgba(255,255,255,0.32)', textTransform: 'uppercase', marginBottom: 2 }}>Gain est.</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: pred.status === 'won' ? '#00C850' : '#FFD700' }}>
            +{potGain.toLocaleString('fr-FR')} CDF
          </div>
        </div>
      </div>
    </>
  );
}

function MultiBetRow({ pred, badgeLabel }: { pred: Prediction; badgeLabel: string }) {
  const bCfg = CARD_S[pred.status] ?? CARD_S.pending;
  const mult = pred.prediction_type === 'score_exact' ? 5 : 2;
  const potGain = pred.points_wagered * mult;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: 'rgba(255,255,255,0.03)', borderRadius: 10,
      padding: '8px 10px', border: `1px solid ${bCfg.badge.border}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {choiceLabel(pred)}
        </div>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>
          {pred.points_wagered.toLocaleString('fr-FR')} CDF · +{potGain.toLocaleString('fr-FR')} est.
        </div>
      </div>
      <span style={{
        flexShrink: 0, background: bCfg.badge.bg, color: bCfg.badge.color,
        border: `1px solid ${bCfg.badge.border}`,
        borderRadius: 16, padding: '2px 8px',
        fontSize: 9, fontWeight: 800, letterSpacing: 0.4,
        boxShadow: bCfg.badge.glow,
        display: 'inline-flex', alignItems: 'center', gap: 3,
      }}>
        {pred.status === 'won' && '🏆 '}
        {pred.status === 'won' && pred.points_won != null
          ? `+${pred.points_won.toLocaleString('fr-FR')}`
          : badgeLabel}
      </span>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all',       label: 'Tout' },
  { key: 'pending',   label: 'En cours' },
  { key: 'won',       label: 'Gagnés' },
  { key: 'lost',      label: 'Perdus' },
  { key: 'cancelled', label: 'Annulés' },
];

export default function MesParis() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const session = getSession();

  const [preds, setPreds] = useState<Prediction[]>([]);
  const [matchMap, setMatchMap] = useState<Record<string, RawMatch>>({});
  const [liveMatches, setLiveMatches] = useState<LiveMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('pending');

  const BADGE_LABEL: Record<string, string> = {
    won:       `${t('predictions.gagne').toUpperCase()}`,
    pending:   `${t('predictions.en_cours').toUpperCase()}`,
    lost:      `${t('predictions.perdu').toUpperCase()}`,
    cancelled: `${t('predictions.annule').toUpperCase()}`,
  };

  // ── data fetching ────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!session?.id) { setLoading(false); return; }
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/predictions?user_id=${session.id}`, { credentials: 'include' });
      if (r.ok) { const j = await r.json(); setPreds(j.predictions ?? []); }
    } finally { setLoading(false); }
  }, [session?.id]);

  const loadMatches = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/matches/upcoming`, { credentials: 'include' });
      if (r.ok) {
        const j = await r.json();
        const map: Record<string, RawMatch> = {};
        for (const m of (j.matches ?? [])) {
          if (m.num != null) map[String(m.num)] = m;
        }
        setMatchMap(map);
      }
    } catch { /* silent */ }
  }, []);

  const loadLive = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/matches/live`, { credentials: 'include' });
      if (r.ok) { const j = await r.json(); setLiveMatches(j.matches ?? []); }
    } catch { /* silent */ }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadMatches(); }, [loadMatches]);
  useEffect(() => {
    loadLive();
    const iv = setInterval(loadLive, 30_000);
    return () => clearInterval(iv);
  }, [loadLive]);

  // ── derived data ─────────────────────────────────────────────────────────

  const counts = useMemo(() => ({
    all:       preds.length,
    pending:   preds.filter(p => p.status === 'pending').length,
    won:       preds.filter(p => p.status === 'won').length,
    lost:      preds.filter(p => p.status === 'lost').length,
    cancelled: preds.filter(p => p.status === 'cancelled').length,
  }), [preds]);

  const groups = useMemo(() => {
    const filtered = activeTab === 'all' ? preds : preds.filter(p => p.status === activeTab);
    const map = new Map<string, Prediction[]>();
    for (const p of filtered) {
      const arr = map.get(p.match_id) ?? [];
      arr.push(p);
      map.set(p.match_id, arr);
    }
    return Array.from(map.entries()).map(([matchId, ps]) => ({ matchId, ps }));
  }, [preds, activeTab]);

  // stats always over ALL preds
  const cTotal = useCountUp(preds.length);
  const cWon   = useCountUp(counts.won);
  const cCdf   = useCountUp(preds.reduce((s, p) => s + (p.points_won ?? 0), 0));

  // ── render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100dvh', background: 'linear-gradient(180deg,#06060f 0%,#0a0a14 100%)', overflowX: 'hidden' }}>
      <style>{KF}</style>

      {/* STICKY HEADER */}
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
            <div style={{ fontFamily: BEBAS, fontSize: 22, color: '#fff', letterSpacing: 2, lineHeight: 1 }}>
              {t('predictions.mes_paris_title').toUpperCase()}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,215,0,0.55)', letterSpacing: 0.5, marginTop: 1 }}>
              {t('predictions.mes_paris_subtitle')}
            </div>
          </div>
        </motion.div>
      </div>

      {/* STATS ROW */}
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.4 }}
        style={{ padding: '14px 14px 0', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}
      >
        {([
          { val: cTotal, label: t('predictions.paris_places'), color: '#FFD700', small: false },
          { val: cWon,   label: t('predictions.paris_gagnes'),  color: '#00C850', small: false },
          { val: cCdf,   label: t('predictions.cdf_gagnes'),   color: '#FFD700', small: true },
        ]).map(({ val, label, color, small }) => (
          <div key={label} style={{
            background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14,
            padding: '12px 6px', textAlign: 'center',
          }}>
            <div style={{ fontFamily: BEBAS, fontSize: small ? 18 : 28, color, lineHeight: 1, marginBottom: 3, textShadow: `0 0 18px ${color}66` }}>
              {val.toLocaleString('fr-FR')}
            </div>
            <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: 1.2, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase' }}>
              {label}
            </div>
          </div>
        ))}
      </motion.div>

      {/* FILTER TABS */}
      <div style={{
        padding: '12px 14px 0', display: 'flex', gap: 6,
        overflowX: 'auto', scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
      }}>
        {TABS.map(tab => {
          const active = activeTab === tab.key;
          const cnt = counts[tab.key];
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              style={{
                flexShrink: 0, cursor: 'pointer',
                padding: '6px 12px', borderRadius: 20,
                border: active ? '1px solid rgba(255,215,0,0.5)' : '1px solid rgba(255,255,255,0.1)',
                background: active ? 'rgba(255,215,0,0.12)' : 'rgba(255,255,255,0.04)',
                color: active ? '#FFD700' : 'rgba(255,255,255,0.5)',
                fontSize: 12, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', gap: 5,
                transition: 'background 0.18s, color 0.18s, border-color 0.18s',
              }}
            >
              {tab.label}
              {cnt > 0 && (
                <span style={{
                  background: active ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.1)',
                  color: active ? '#FFD700' : 'rgba(255,255,255,0.4)',
                  borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 800,
                }}>
                  {cnt}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* CARDS */}
      <div style={{ padding: '12px 14px 100px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
            {t('predictions.chargement')}
          </div>

        ) : preds.length === 0 ? (
          /* No bets at all */
          <div style={{ textAlign: 'center', padding: '60px 16px' }}>
            <div style={{ fontSize: 72, marginBottom: 16, display: 'inline-block', animation: 'trophyBounce 2s ease-in-out infinite' }}>🏆</div>
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

        ) : groups.length === 0 ? (
          /* Bets exist but none match this tab */
          <div style={{ textAlign: 'center', padding: '48px 16px', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
            Aucun pari dans cette catégorie.
          </div>

        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {groups.map(({ matchId, ps }, gi) => {
              const raw       = matchMap[matchId];
              const live      = getLiveForMatch(raw, liveMatches);
              const isLive    = live?.status === 'in_progress';
              const isFinal   = (raw ? isPlayed(raw) : false) || live?.status === 'final';
              const fs        = raw ? finalScore(raw) : null;
              const home      = raw ? teamName(raw.team1) : '';
              const away      = raw ? teamName(raw.team2) : '';
              const dateStr   = raw?.date ?? '';
              const status    = dominantStatus(ps);
              const cfg       = CARD_S[status] ?? CARD_S.pending;
              const showRebet = ps.some(p => p.status === 'lost' || p.status === 'cancelled');
              const cdStr     = (!isLive && !isFinal && dateStr) ? countdown(dateStr, (raw as any)?.time) : '';

              return (
                <motion.div
                  key={matchId}
                  initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: gi * 0.07, type: 'spring', stiffness: 260, damping: 22 }}
                  style={{
                    borderRadius: 18, background: cfg.bg, border: cfg.border,
                    overflow: 'hidden', opacity: cfg.opacity, position: 'relative',
                    animation: cfg.anim || undefined,
                  }}
                >
                  {/* Left accent bar */}
                  <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, background: cfg.accent }} />

                  {/* Scanline (won) */}
                  {status === 'won' && (
                    <div aria-hidden style={{
                      position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 0.04,
                      backgroundImage: 'repeating-linear-gradient(0deg,#fff 0,#fff 1px,transparent 1px,transparent 4px)',
                    }} />
                  )}

                  <div style={{ padding: '14px 14px 14px 18px', position: 'relative', zIndex: 1 }}>

                    {/* Row 1: competition label + live badge / countdown */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.4, color: 'rgba(255,215,0,0.65)', textTransform: 'uppercase' }}>
                        ⚡ Coupe du Monde 2026
                      </span>
                      {isLive ? (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.35)',
                          borderRadius: 12, padding: '2px 8px', fontSize: 9, fontWeight: 800, color: '#4ade80', letterSpacing: 0.5,
                        }}>
                          <span style={{ animation: 'livePulse 1.2s ease-in-out infinite', fontSize: 8 }}>●</span>
                          LIVE
                        </span>
                      ) : cdStr ? (
                        <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: 0.3 }}>
                          🕐 {cdStr}
                        </span>
                      ) : null}
                    </div>

                    {/* Teams + score */}
                    {home && away ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', marginBottom: 10 }}>
                        <div style={{ textAlign: 'center', flex: 1 }}>
                          <div style={{ fontSize: 36 }}>{FLAGS[home] ?? '🏳️'}</div>
                          <div style={{ fontFamily: BEBAS, fontSize: 12, color: '#fff', letterSpacing: 1, marginTop: 2 }}>{home}</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, padding: '0 8px' }}>
                          {isLive && live ? (
                            <>
                              <div style={{ fontFamily: BEBAS, fontSize: 26, color: '#4ade80', letterSpacing: 3, lineHeight: 1 }}>
                                {live.score1} – {live.score2}
                              </div>
                              {live.clock && (
                                <div style={{ fontSize: 8, color: 'rgba(74,222,128,0.7)', letterSpacing: 0.4 }}>{live.clock}</div>
                              )}
                            </>
                          ) : fs ? (
                            <>
                              <div style={{ fontFamily: BEBAS, fontSize: 22, color: 'rgba(255,255,255,0.85)', letterSpacing: 3, lineHeight: 1 }}>
                                {fs[0]} – {fs[1]}
                              </div>
                              <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', letterSpacing: 0.4, textTransform: 'uppercase' }}>Final</div>
                            </>
                          ) : (
                            <div style={{ fontFamily: BEBAS, fontSize: 18, color: 'rgba(255,255,255,0.18)', letterSpacing: 3 }}>VS</div>
                          )}
                        </div>
                        <div style={{ textAlign: 'center', flex: 1 }}>
                          <div style={{ fontSize: 36 }}>{FLAGS[away] ?? '🏳️'}</div>
                          <div style={{ fontFamily: BEBAS, fontSize: 12, color: '#fff', letterSpacing: 1, marginTop: 2 }}>{away}</div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontFamily: BEBAS, fontSize: 18, color: '#fff', letterSpacing: 1, marginBottom: 10 }}>
                        Match #{matchId}
                      </div>
                    )}

                    {/* Date (static, only when not live) */}
                    {dateStr && !isLive && (
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', marginBottom: 10, textAlign: 'center' }}>
                        {fmtDate(dateStr)}
                      </div>
                    )}

                    {/* Divider */}
                    <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', marginBottom: 10 }} />

                    {/* Bet rows */}
                    {ps.length === 1 ? (
                      <SingleBetBody pred={ps[0]} cfg={cfg} badgeLabel={BADGE_LABEL[ps[0].status] ?? ''} />
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {ps.map(pred => (
                          <MultiBetRow key={pred.id} pred={pred} badgeLabel={BADGE_LABEL[pred.status] ?? ''} />
                        ))}
                      </div>
                    )}

                    {/* Rebet */}
                    {showRebet && (
                      <button
                        type="button"
                        onClick={() => nav('/predictions')}
                        style={{
                          marginTop: 12, width: '100%',
                          background: 'rgba(255,215,0,0.07)',
                          border: '1px solid rgba(255,215,0,0.2)',
                          borderRadius: 10, padding: '8px 0',
                          color: 'rgba(255,215,0,0.7)', fontSize: 11, fontWeight: 700,
                          letterSpacing: 0.4, cursor: 'pointer',
                        }}
                      >
                        🔄 Rejouer ce match
                      </button>
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
