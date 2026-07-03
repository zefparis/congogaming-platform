import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../../lib/adminApi';
import { RawMatch, LiveMatch, teamName, finalScore, isPlayed, FLAGS } from '../predictionsShared';
import { fmtCdf, fmtDateTime } from './format';

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) || 'https://api.congogaming.com';

type PendingGroup = {
  match_id: string;
  pending_count: number;
  oldest_at: string;
};

type Resolution = {
  match_id: string;
  actual_score_home: number;
  actual_score_away: number;
  resolved_by_phone: string | null;
  resolved_at: string;
  predictions_resolved_count: number;
  total_points_paid: number;
};

type MatchStatus = 'final' | 'in_progress' | 'scheduled';

type ModalState = {
  matchId: string;
  teamHome: string;
  teamAway: string;
  pendingCount: number;
  cachedHome: number | null;
  cachedAway: number | null;
  inputHome: string;
  inputAway: string;
  step: 'input' | 'confirm' | 'result';
  loading: boolean;
  result: { resolved: number; won_count: number; lost_count: number; total_points_paid: number } | null;
  error: string | null;
};

const STATUS_ORDER: Record<MatchStatus, number> = { final: 0, in_progress: 1, scheduled: 2 };

function getCachedRole(): 'admin' | 'super_admin' {
  try {
    const r = sessionStorage.getItem('cg_admin_role');
    return r === 'super_admin' ? 'super_admin' : 'admin';
  } catch {
    return 'admin';
  }
}

function flag(name: string): string {
  return FLAGS[name] ?? '🏳';
}

function getLiveData(m: RawMatch, lives: LiveMatch[]): LiveMatch | null {
  const t1 = teamName(m.team1).toLowerCase();
  const t2 = teamName(m.team2).toLowerCase();
  return (
    lives.find(
      (l) =>
        (l.team1.toLowerCase().includes(t1) || t1.includes(l.team1.toLowerCase())) &&
        (l.team2.toLowerCase().includes(t2) || t2.includes(l.team2.toLowerCase())),
    ) ?? null
  );
}

function scoreLabel(m: RawMatch): string | null {
  const s = m.score as { ft?: number[]; et?: number[]; p?: number[] } | null;
  if (!s) return null;
  if (s.p && s.p.length >= 2 && s.ft) return `${s.ft[0]}–${s.ft[1]} (pen. ${s.p[0]}–${s.p[1]})`;
  if (s.et && s.et.length >= 2) return `${s.et[0]}–${s.et[1]} a.e.t.`;
  if (s.ft && s.ft.length >= 2) return `${s.ft[0]}–${s.ft[1]}`;
  return null;
}

function StatusBadge({ status }: { status: MatchStatus }) {
  const cfg: Record<MatchStatus, { label: string; cls: string }> = {
    final:       { label: 'TERMINÉ',    cls: 'bg-emerald-500/20 text-emerald-300' },
    in_progress: { label: 'EN DIRECT',  cls: 'bg-red-500/20 text-red-300 animate-pulse' },
    scheduled:   { label: 'PROGRAMMÉ', cls: 'bg-white/10 text-white/50' },
  };
  const { label, cls } = cfg[status];
  return (
    <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cls}`}>
      {label}
    </span>
  );
}

function ResolveModal({
  modal,
  onClose,
  onInputChange,
  onNext,
  onBack,
  onConfirm,
}: {
  modal: ModalState;
  onClose: () => void;
  onInputChange: (field: 'home' | 'away', val: string) => void;
  onNext: () => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const homeNum = parseInt(modal.inputHome, 10);
  const awayNum = parseInt(modal.inputAway, 10);
  const inputValid =
    !isNaN(homeNum) && homeNum >= 0 && !isNaN(awayNum) && awayNum >= 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-white/10 bg-[#0f0f16] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Résoudre un match</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white/80">✕</button>
        </div>

        <div className="mb-5 text-center">
          <div className="text-base font-semibold text-white">
            {flag(modal.teamHome)} {modal.teamHome}
            <span className="mx-2 text-white/40">vs</span>
            {flag(modal.teamAway)} {modal.teamAway}
          </div>
          <div className="mt-1 text-xs text-white/40">
            {modal.pendingCount} prédiction{modal.pendingCount !== 1 ? 's' : ''} en attente · Match #{modal.matchId}
          </div>
        </div>

        {modal.step === 'input' && (
          <>
            {modal.cachedHome !== null && (
              <div className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] px-3 py-2 text-xs text-emerald-300">
                Score OpenFootball détecté : {modal.cachedHome}–{modal.cachedAway}. Pré-rempli ci-dessous — modifiez si incorrect.
              </div>
            )}
            <div className="mb-4 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-wider text-white/50">
                  {modal.teamHome} (domicile)
                </label>
                <input
                  type="number"
                  min="0"
                  value={modal.inputHome}
                  onChange={(e) => onInputChange('home', e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-center text-2xl font-bold text-white focus:border-gold/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-wider text-white/50">
                  {modal.teamAway} (extérieur)
                </label>
                <input
                  type="number"
                  min="0"
                  value={modal.inputAway}
                  onChange={(e) => onInputChange('away', e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-center text-2xl font-bold text-white focus:border-gold/50 focus:outline-none"
                />
              </div>
            </div>
            {modal.error && (
              <div className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {modal.error}
              </div>
            )}
            <button
              onClick={onNext}
              disabled={!inputValid}
              className="w-full rounded-lg bg-gold px-4 py-2.5 font-semibold text-black hover:brightness-110 disabled:opacity-40"
            >
              Voir le résumé →
            </button>
          </>
        )}

        {modal.step === 'confirm' && (
          <>
            <div className="mb-5 rounded-xl border border-gold/30 bg-gold/[0.05] p-4 text-center">
              <div className="font-display text-3xl text-gold">
                {modal.inputHome} – {modal.inputAway}
              </div>
              <div className="mt-1 text-sm text-white/70">
                {modal.teamHome} vs {modal.teamAway}
              </div>
              <div className="mt-3 text-sm text-white/50">
                <span className="font-semibold text-white">{modal.pendingCount}</span>{' '}
                prédiction{modal.pendingCount !== 1 ? 's' : ''} seront résolues
              </div>
            </div>
            {modal.error && (
              <div className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {modal.error}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={onBack}
                disabled={modal.loading}
                className="flex-1 rounded-lg border border-white/10 px-4 py-2.5 text-sm text-white/70 hover:bg-white/5 disabled:opacity-40"
              >
                ← Modifier
              </button>
              <button
                onClick={onConfirm}
                disabled={modal.loading}
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
              >
                {modal.loading ? 'En cours…' : '✓ Confirmer'}
              </button>
            </div>
          </>
        )}

        {modal.step === 'result' && modal.result && (
          <>
            <div className="mb-5 space-y-2">
              <div className="rounded-lg bg-emerald-500/10 px-4 py-3 text-center text-sm text-emerald-300">
                ✅ {modal.result.resolved} prédiction{modal.result.resolved !== 1 ? 's' : ''} résolues
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-lg border border-white/5 bg-white/[0.03] p-3">
                  <div className="text-[10px] uppercase text-white/40">Gagnants</div>
                  <div className="mt-1 font-semibold text-emerald-300">{modal.result.won_count}</div>
                </div>
                <div className="rounded-lg border border-white/5 bg-white/[0.03] p-3">
                  <div className="text-[10px] uppercase text-white/40">Perdants</div>
                  <div className="mt-1 font-semibold text-red-400">{modal.result.lost_count}</div>
                </div>
                <div className="rounded-lg border border-white/5 bg-white/[0.03] p-3">
                  <div className="text-[10px] uppercase text-white/40">Distribués</div>
                  <div className="mt-1 font-semibold text-gold">{fmtCdf(modal.result.total_points_paid)}</div>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-full rounded-lg border border-white/10 px-4 py-2.5 text-sm text-white/70 hover:bg-white/5"
            >
              Fermer
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function PredictionsSubTab() {
  const [view, setView] = useState<'pending' | 'resolved'>('pending');
  const [role, setRole] = useState<'admin' | 'super_admin'>(getCachedRole);
  const isSuper = role === 'super_admin';
  const [loading, setLoading] = useState(true);
  const [matchMap, setMatchMap] = useState<Record<string, RawMatch>>({});
  const [liveMatches, setLiveMatches] = useState<LiveMatch[]>([]);
  const [pending, setPending] = useState<PendingGroup[]>([]);
  const [resolutions, setResolutions] = useState<Resolution[]>([]);
  const [modal, setModal] = useState<ModalState | null>(null);

  useEffect(() => {
    adminApi
      .me()
      .then((r) => {
        const next = r.role === 'super_admin' ? 'super_admin' : 'admin';
        setRole(next);
        try {
          sessionStorage.setItem('cg_admin_role', next);
        } catch {}
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, lRes, pData, rData] = await Promise.all([
        fetch(`${API_BASE}/api/matches/upcoming`).then((r) => (r.ok ? r.json() : null)),
        fetch(`${API_BASE}/api/matches/live`).then((r) => (r.ok ? r.json() : null)),
        adminApi.predictionsPending().catch(() => ({ pending: [] })),
        adminApi.predictionsResolved().catch(() => ({ resolutions: [] })),
      ]);

      if (mRes?.matches) {
        const map: Record<string, RawMatch> = {};
        for (const m of mRes.matches) {
          if (m.num != null) map[String(m.num)] = m;
        }
        setMatchMap(map);
      }
      if (lRes?.matches) setLiveMatches(lRes.matches);
      setPending(pData.pending);
      setResolutions(rData.resolutions);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function getStatus(matchId: string): MatchStatus {
    const m = matchMap[matchId];
    if (!m) return 'scheduled';
    if (isPlayed(m)) return 'final';
    const live = getLiveData(m, liveMatches);
    if (live?.status === 'final') return 'final';
    if (live?.status === 'in_progress') return 'in_progress';
    return 'scheduled';
  }

  const sortedPending = [...pending].sort((a, b) => {
    const sa = STATUS_ORDER[getStatus(a.match_id)];
    const sb = STATUS_ORDER[getStatus(b.match_id)];
    if (sa !== sb) return sa - sb;
    return a.oldest_at.localeCompare(b.oldest_at);
  });

  function openModal(group: PendingGroup) {
    const m = matchMap[group.match_id];
    const home = m ? teamName(m.team1) : `Match #${group.match_id}`;
    const away = m ? teamName(m.team2) : '';
    const fs = m ? finalScore(m) : null;
    setModal({
      matchId: group.match_id,
      teamHome: home,
      teamAway: away,
      pendingCount: group.pending_count,
      cachedHome: fs != null ? fs[0] : null,
      cachedAway: fs != null ? fs[1] : null,
      inputHome: fs != null ? String(fs[0]) : '',
      inputAway: fs != null ? String(fs[1]) : '',
      step: 'input',
      loading: false,
      result: null,
      error: null,
    });
  }

  function handleInputChange(field: 'home' | 'away', val: string) {
    setModal((m) => (m ? { ...m, [field === 'home' ? 'inputHome' : 'inputAway']: val, error: null } : m));
  }

  function handleNext() {
    const h = parseInt(modal?.inputHome ?? '', 10);
    const a = parseInt(modal?.inputAway ?? '', 10);
    if (!Number.isInteger(h) || h < 0 || !Number.isInteger(a) || a < 0) {
      setModal((m) => (m ? { ...m, error: 'Score invalide — entiers ≥ 0 requis' } : m));
      return;
    }
    setModal((m) => (m ? { ...m, step: 'confirm', error: null } : m));
  }

  function handleBack() {
    setModal((m) => (m ? { ...m, step: 'input', error: null } : m));
  }

  async function handleConfirm() {
    if (!modal) return;
    const h = parseInt(modal.inputHome, 10);
    const a = parseInt(modal.inputAway, 10);
    setModal((m) => (m ? { ...m, loading: true, error: null } : m));
    try {
      const res = await adminApi.resolveMatch({
        match_id: modal.matchId,
        actual_score_home: h,
        actual_score_away: a,
      });
      setModal((m) => (m ? { ...m, step: 'result', loading: false, result: res } : m));
      load();
    } catch (e: any) {
      setModal((m) =>
        m ? { ...m, loading: false, error: e.message || 'Erreur lors de la résolution' } : m,
      );
    }
  }

  return (
    <div className="space-y-4">
      {modal && (
        <ResolveModal
          modal={modal}
          onClose={() => setModal(null)}
          onInputChange={handleInputChange}
          onNext={handleNext}
          onBack={handleBack}
          onConfirm={handleConfirm}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(['pending', 'resolved'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                view === v
                  ? 'bg-gold text-black'
                  : 'border border-white/10 text-white/70 hover:bg-white/5'
              }`}
            >
              {v === 'pending' ? `En attente${pending.length ? ` (${pending.length})` : ''}` : 'Historique'}
            </button>
          ))}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="rounded border border-white/10 px-3 py-1 text-sm text-white/60 hover:bg-white/5 disabled:opacity-40"
        >
          {loading ? '…' : '↻ Rafraîchir'}
        </button>
      </div>

      {!isSuper && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/[0.05] p-3 text-xs text-amber-200">
          Mode lecture seule — la résolution de matchs est réservée aux super-admins.
        </div>
      )}

      {view === 'pending' && (
        <div className="space-y-3">
          {loading && (
            <div className="py-6 text-center text-sm text-white/40">Chargement…</div>
          )}
          {!loading && sortedPending.length === 0 && (
            <div className="rounded-xl border border-white/5 bg-white/[0.02] py-10 text-center text-white/40">
              Aucune prédiction en attente.
            </div>
          )}
          {sortedPending.map((group) => {
            const m = matchMap[group.match_id];
            const home = m ? teamName(m.team1) : null;
            const away = m ? teamName(m.team2) : null;
            const status = getStatus(group.match_id);
            const score = m ? scoreLabel(m) : null;
            const live = m ? getLiveData(m, liveMatches) : null;
            const liveScore =
              live && live.status === 'in_progress'
                ? `${live.score1}–${live.score2}`
                : null;

            return (
              <div
                key={group.match_id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-4"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={status} />
                    {m?.round && (
                      <span className="text-[10px] text-white/30 uppercase tracking-wider">
                        {m.round}
                      </span>
                    )}
                  </div>

                  {home && away ? (
                    <div className="text-base font-semibold text-white">
                      {flag(home)} {home}
                      <span className="mx-2 text-white/30">vs</span>
                      {flag(away)} {away}
                    </div>
                  ) : (
                    <div className="text-base font-semibold text-white/60">
                      Match #{group.match_id}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 text-xs text-white/40">
                    {m?.date && <span>{m.date}</span>}
                    {score && (
                      <span className="font-semibold text-emerald-300">Score final : {score}</span>
                    )}
                    {liveScore && (
                      <span className="font-semibold text-red-300">🔴 En direct : {liveScore}</span>
                    )}
                    <span className="font-semibold text-gold">
                      {group.pending_count} prédiction{group.pending_count !== 1 ? 's' : ''} en attente
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => openModal(group)}
                  disabled={!isSuper}
                  title={!isSuper ? 'Réservé aux super-admins' : undefined}
                  className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Résoudre
                </button>
              </div>
            );
          })}
        </div>
      )}

      {view === 'resolved' && (
        <div className="space-y-3">
          {loading && (
            <div className="py-6 text-center text-sm text-white/40">Chargement…</div>
          )}
          {!loading && resolutions.length === 0 && (
            <div className="rounded-xl border border-white/5 bg-white/[0.02] py-10 text-center text-white/40">
              Aucun match résolu.
            </div>
          )}
          {!loading && resolutions.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-white/5">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-white/[0.03] text-left text-[11px] uppercase tracking-wider text-white/50">
                  <tr>
                    <th className="px-3 py-2">Match</th>
                    <th className="px-3 py-2 text-center">Score soumis</th>
                    <th className="px-3 py-2 text-right">Résolu le</th>
                    <th className="px-3 py-2 text-right">Par</th>
                    <th className="px-3 py-2 text-right">Prédictions</th>
                    <th className="px-3 py-2 text-right">Points distribués</th>
                  </tr>
                </thead>
                <tbody>
                  {resolutions.map((r) => {
                    const m = matchMap[r.match_id];
                    const home = m ? teamName(m.team1) : null;
                    const away = m ? teamName(m.team2) : null;
                    return (
                      <tr key={r.match_id} className="border-t border-white/5">
                        <td className="px-3 py-2">
                          {home && away ? (
                            <span className="text-white">
                              {flag(home)} {home} vs {flag(away)} {away}
                            </span>
                          ) : (
                            <span className="text-white/60">Match #{r.match_id}</span>
                          )}
                          {m?.date && (
                            <div className="text-[10px] text-white/30">{m.date}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center font-display text-lg text-gold">
                          {r.actual_score_home} – {r.actual_score_away}
                        </td>
                        <td className="px-3 py-2 text-right text-white/70">
                          {fmtDateTime(r.resolved_at)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-white/50">
                          {r.resolved_by_phone ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-right text-white/80">
                          {r.predictions_resolved_count}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-emerald-300">
                          {fmtCdf(r.total_points_paid)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
