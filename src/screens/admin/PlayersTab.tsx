import { useEffect, useState } from 'react';
import { Gift, Pause, Search, ShieldOff, Wallet, X } from 'lucide-react';
import { adminApi } from '../../lib/adminApi';
import { fmtCdf, fmtDateTime, fmtRelative, txStatusLabel } from './format';
import KycBadge from './KycBadge';

type UserRow = Awaited<ReturnType<typeof adminApi.users>>['items'][number];
type UserDetail = Awaited<ReturnType<typeof adminApi.userDetail>>;

function getCachedRole(): 'admin' | 'super_admin' {
  try {
    const r = sessionStorage.getItem('cg_admin_role');
    return r === 'super_admin' ? 'super_admin' : 'admin';
  } catch {
    return 'admin';
  }
}

function Drawer({
  userId,
  onClose,
  onChanged,
}: {
  userId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<UserDetail | null>(null);
  const [delta, setDelta] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<'admin' | 'super_admin'>(getCachedRole);
  const isSuper = role === 'super_admin';

  // Re-confirm role from server (in case session was opened before role was cached).
  useEffect(() => {
    adminApi
      .me()
      .then((r) => {
        const next = r.role === 'super_admin' ? 'super_admin' : 'admin';
        setRole(next);
        try { sessionStorage.setItem('cg_admin_role', next); } catch {}
      })
      .catch(() => {});
  }, []);

  // Limits inputs
  const [limDaily, setLimDaily] = useState('');
  const [limWeekly, setLimWeekly] = useState('');
  const [limMonthly, setLimMonthly] = useState('');

  // Referral reward inputs
  const [rewardReferredId, setRewardReferredId] = useState('');
  const [rewardAmount, setRewardAmount] = useState('');

  async function load() {
    setError(null);
    try {
      const d = await adminApi.userDetail(userId);
      setData(d);
    } catch (e: any) {
      setError(e?.message || 'Erreur de chargement');
    }
  }
  useEffect(() => {
    load();
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (data?.limits) {
      setLimDaily(data.limits.daily_deposit_cdf != null ? String(data.limits.daily_deposit_cdf) : '');
      setLimWeekly(data.limits.weekly_deposit_cdf != null ? String(data.limits.weekly_deposit_cdf) : '');
      setLimMonthly(data.limits.monthly_deposit_cdf != null ? String(data.limits.monthly_deposit_cdf) : '');
    } else {
      setLimDaily(''); setLimWeekly(''); setLimMonthly('');
    }
  }, [data?.limits]);

  async function saveLimits() {
    if (busy) return;
    const parse = (v: string): number | null => {
      const t = v.trim();
      if (t === '') return null;
      const n = Number(t);
      return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
    };
    setBusy(true);
    setError(null);
    try {
      await adminApi.setUserLimits(userId, {
        daily_deposit_cdf: parse(limDaily),
        weekly_deposit_cdf: parse(limWeekly),
        monthly_deposit_cdf: parse(limMonthly),
      });
      await load();
    } catch (e: any) {
      setError(e?.message || 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function setExclusion(duration: '24h' | '7d' | '30d' | 'permanent' | null) {
    const action = duration === null ? 'lever l\'auto-exclusion' : `auto-exclure pour ${duration}`;
    if (!confirm(`Confirmer : ${action} ?`)) return;
    setBusy(true);
    setError(null);
    try {
      if (duration === null) {
        await adminApi.setUserSelfExclusion(userId, { until: null });
      } else {
        await adminApi.setUserSelfExclusion(userId, { duration });
      }
      await load();
      onChanged();
    } catch (e: any) {
      setError(e?.message || 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function creditReferral() {
    if (busy) return;
    const amt = Number(rewardAmount);
    if (!rewardReferredId.trim() || !Number.isFinite(amt) || amt <= 0) {
      setError('referred_id + montant > 0 requis');
      return;
    }
    if (!confirm(`Créditer ${amt.toLocaleString('fr-FR')} CDF en récompense parrainage ?`)) return;
    setBusy(true);
    setError(null);
    try {
      await adminApi.creditReferralReward(userId, {
        referred_id: rewardReferredId.trim(),
        amount_cdf: amt,
        trigger_event: 'admin_manual',
      });
      setRewardReferredId('');
      setRewardAmount('');
      await load();
      onChanged();
    } catch (e: any) {
      setError(e?.message || 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function adjust() {
    const n = Number(delta);
    if (!Number.isFinite(n) || n === 0) return;
    if (!confirm(`Ajuster le solde de ${n.toLocaleString('fr-FR')} CDF ?`)) return;
    setBusy(true);
    setError(null);
    try {
      await adminApi.adjustBalance(userId, n);
      setDelta('');
      await load();
      onChanged();
    } catch (e: any) {
      setError(e?.message || 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function toggleBlock(blocked: boolean) {
    if (!confirm(blocked ? 'Bloquer ce joueur ?' : 'Débloquer ce joueur ?')) return;
    setBusy(true);
    setError(null);
    try {
      await adminApi.blockUser(userId, blocked);
      onChanged();
    } catch (e: any) {
      setError(e?.message || 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function approveKyc() {
    if (!confirm('Approuver la vérification KYC de ce joueur ?')) return;
    setBusy(true);
    setError(null);
    try {
      await adminApi.approveKyc(userId);
      await load();
      onChanged();
    } catch (e: any) {
      // Surface the real backend error (e.g. "Bad Request" details) verbatim.
      const msg = e instanceof Error ? e.message : String(e ?? 'Erreur');
      setError(`KYC approve failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  async function denyKyc() {
    if (!confirm('Refuser la vérification KYC de ce joueur ?')) return;
    setBusy(true);
    setError(null);
    try {
      await adminApi.denyKyc(userId);
      await load();
      onChanged();
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : String(e ?? 'Erreur');
      setError(`KYC deny failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60" onClick={onClose}>
      <div
        className="h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-[#0a0a0f] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-2xl tracking-wider text-gold">Fiche joueur</h3>
          <button onClick={onClose} className="rounded p-1 text-white/60 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {!data && !error && <div className="text-white/50">Chargement…</div>}
        {error && (
          <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {data && (
          <>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="font-mono text-lg text-white">{data.user.phone}</div>
                <KycBadge status={data.user.kyc_status} />
              </div>
              {data.user.display_name && (
                <div className="mt-1 text-sm text-gold">"{data.user.display_name}"</div>
              )}
              <div className="mt-1 text-xs text-white/40">
                Inscrit {fmtDateTime(data.user.created_at)} · id {data.user.id.slice(0, 8)}…
              </div>
              {data.user.referral_code && (
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className="text-white/40">Code parrain :</span>
                  <span className="rounded bg-gold/15 px-2 py-0.5 font-mono tracking-wider text-gold ring-1 ring-gold/30">
                    {data.user.referral_code}
                  </span>
                  {data.referral?.referrer && (
                    <span className="text-white/40">
                      · invité par <span className="font-mono text-white/70">{data.referral.referrer.phone}</span>
                    </span>
                  )}
                </div>
              )}
              {data.limits?.self_exclusion_until && new Date(data.limits.self_exclusion_until).getTime() > Date.now() && (
                <div className="mt-2 inline-flex items-center gap-1 rounded bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-red-300 ring-1 ring-red-500/40">
                  <ShieldOff size={12} /> Auto-exclu jusqu'au {fmtDateTime(data.limits.self_exclusion_until)}
                </div>
              )}
              <div className="mt-3 font-display text-3xl text-gold">
                {fmtCdf(data.user.balance_cdf)}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                <div className="text-[11px] uppercase tracking-wider text-white/40">Rounds Okapi</div>
                <div className="mt-1 text-white">{data.okapi.rounds_played}</div>
              </div>
              <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                <div className="text-[11px] uppercase tracking-wider text-white/40">Misé</div>
                <div className="mt-1 text-white">{fmtCdf(data.okapi.total_wagered_cdf)}</div>
              </div>
              <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                <div className="text-[11px] uppercase tracking-wider text-white/40">Gagné</div>
                <div className="mt-1 text-white">{fmtCdf(data.okapi.total_won_cdf)}</div>
              </div>
              <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                <div className="text-[11px] uppercase tracking-wider text-white/40">P&L joueur</div>
                <div
                  className="mt-1 font-semibold"
                  style={{ color: data.okapi.pnl_cdf >= 0 ? '#34d399' : '#f87171' }}
                >
                  {fmtCdf(data.okapi.pnl_cdf)}
                </div>
              </div>
            </div>

            {!isSuper && (
              <div className="mt-5 rounded-md border border-amber-500/30 bg-amber-500/[0.05] p-3 text-xs text-amber-200">
                Mode lecture seule — les actions sensibles (solde, blocage, limites, parrainage) sont réservées aux super-admins.
              </div>
            )}

            {isSuper && (
            <>
            <div className="mt-5 rounded-xl border border-gold/30 bg-gold/[0.04] p-4">
              <h4 className="mb-3 font-display tracking-wider text-gold">Ajuster le solde</h4>
              <div className="flex flex-wrap gap-2">
                <input
                  type="number"
                  placeholder="± CDF"
                  value={delta}
                  onChange={(e) => setDelta(e.target.value)}
                  className="flex-1 rounded-md border border-white/10 bg-black/50 px-3 py-2 text-white outline-none focus:border-gold/60"
                />
                <button
                  onClick={adjust}
                  disabled={busy || !delta}
                  className="rounded-md bg-gold px-4 py-2 font-semibold text-black hover:brightness-110 disabled:opacity-50"
                >
                  Appliquer
                </button>
              </div>
              <p className="mt-2 text-xs text-white/40">
                Utiliser des montants négatifs pour débiter (ex: -5000).
              </p>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => toggleBlock(true)}
                  disabled={busy}
                  className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                >
                  Bloquer
                </button>
                <button
                  onClick={() => toggleBlock(false)}
                  disabled={busy}
                  className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50"
                >
                  Débloquer
                </button>
              </div>
            </div>

            {/* Limits override */}
            <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <h4 className="mb-3 flex items-center gap-2 font-display tracking-wider text-gold">
                <Wallet size={16} /> Limites de dépôt (override admin)
              </h4>
              <p className="mb-3 text-xs text-white/40">
                L'override admin est immédiat (pas de cooldown 24h). Vide = aucune limite.
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Journalière', value: limDaily, set: setLimDaily },
                  { label: 'Hebdo', value: limWeekly, set: setLimWeekly },
                  { label: 'Mensuelle', value: limMonthly, set: setLimMonthly },
                ].map((f) => (
                  <div key={f.label}>
                    <label className="text-[10px] uppercase tracking-wider text-white/40">{f.label}</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={f.value}
                      onChange={(e) => f.set(e.target.value.replace(/\D/g, '').slice(0, 12))}
                      placeholder="∞"
                      className="mt-1 w-full rounded-md border border-white/10 bg-black/50 px-2 py-1.5 text-sm text-white outline-none focus:border-gold/60"
                    />
                  </div>
                ))}
              </div>
              <button
                onClick={saveLimits}
                disabled={busy}
                className="mt-3 rounded-md bg-gold px-4 py-2 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-50"
              >
                Enregistrer les limites
              </button>
            </div>

            {/* Self-exclusion */}
            <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/[0.05] p-4">
              <h4 className="mb-3 flex items-center gap-2 font-display tracking-wider text-red-300">
                <Pause size={16} /> Auto-exclusion
              </h4>
              <div className="flex flex-wrap gap-2">
                {(['24h', '7d', '30d', 'permanent'] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setExclusion(d)}
                    disabled={busy}
                    className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs text-red-200 hover:bg-red-500/20 disabled:opacity-50"
                  >
                    {d}
                  </button>
                ))}
                {data.limits?.self_exclusion_until && new Date(data.limits.self_exclusion_until).getTime() > Date.now() && (
                  <button
                    onClick={() => setExclusion(null)}
                    disabled={busy}
                    className="ml-auto rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
                  >
                    Lever l'exclusion
                  </button>
                )}
              </div>
            </div>

            {/* Referral panel */}
            <div className="mt-5 rounded-xl border border-gold/30 bg-gold/[0.04] p-4">
              <h4 className="mb-3 flex items-center gap-2 font-display tracking-wider text-gold">
                <Gift size={16} /> Parrainage
              </h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2">
                  <div className="text-[11px] uppercase tracking-wider text-white/40">Filleuls</div>
                  <div className="mt-1 text-white">{data.referral?.referred_count ?? 0}</div>
                </div>
                <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2">
                  <div className="text-[11px] uppercase tracking-wider text-white/40">Bonus crédités</div>
                  <div className="mt-1 text-emerald-300">
                    {fmtCdf(
                      (data.referral?.rewards || [])
                        .filter((r) => r.status === 'credited')
                        .reduce((s, r) => s + Number(r.amount_cdf || 0), 0),
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3">
                <div className="mb-2 text-[11px] uppercase tracking-wider text-white/50">
                  Créditer une récompense parrainage
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    placeholder="referred_id (UUID filleul)"
                    value={rewardReferredId}
                    onChange={(e) => setRewardReferredId(e.target.value)}
                    className="min-w-[200px] flex-1 rounded-md border border-white/10 bg-black/50 px-3 py-2 font-mono text-xs text-white outline-none focus:border-gold/60"
                  />
                  <input
                    type="number"
                    placeholder="CDF"
                    value={rewardAmount}
                    onChange={(e) => setRewardAmount(e.target.value)}
                    className="w-32 rounded-md border border-white/10 bg-black/50 px-3 py-2 text-white outline-none focus:border-gold/60"
                  />
                  <button
                    onClick={creditReferral}
                    disabled={busy || !rewardReferredId || !rewardAmount}
                    className="rounded-md bg-gold px-3 py-2 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-50"
                  >
                    Créditer
                  </button>
                </div>
              </div>

              {data.referral?.rewards && data.referral.rewards.length > 0 && (
                <div className="mt-3 overflow-hidden rounded-lg border border-white/5">
                  <table className="w-full text-xs">
                    <thead className="bg-white/[0.03] text-left text-[10px] uppercase tracking-wider text-white/50">
                      <tr>
                        <th className="px-2 py-1.5">Date</th>
                        <th className="px-2 py-1.5">Filleul</th>
                        <th className="px-2 py-1.5 text-right">Montant</th>
                        <th className="px-2 py-1.5">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.referral.rewards.map((r) => (
                        <tr key={r.id} className="border-t border-white/5">
                          <td className="px-2 py-1.5 text-white/70">{fmtDateTime(r.created_at)}</td>
                          <td className="px-2 py-1.5 font-mono text-white/70">{r.referred_id.slice(0, 8)}…</td>
                          <td className="px-2 py-1.5 text-right text-gold">{fmtCdf(r.amount_cdf)}</td>
                          <td className="px-2 py-1.5">
                            <span
                              className={
                                r.status === 'credited'
                                  ? 'text-emerald-400'
                                  : r.status === 'pending'
                                  ? 'text-amber-400'
                                  : 'text-white/40'
                              }
                            >
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            </>
            )}

            {isSuper && data.user.kyc_status === 'verify_age' && (
              <div
                style={{
                  marginTop: 16,
                  padding: 16,
                  background: 'rgba(255,165,0,0.1)',
                  border: '1px solid rgba(255,165,0,0.3)',
                  borderRadius: 12,
                }}
              >
                <div style={{ color: '#FFD700', fontWeight: 700, marginBottom: 8 }}>
                  ⚠️ Vérification manuelle requise
                </div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 12 }}>
                  Âge estimé : 19-25 ans. Confirmez l'identité de ce joueur.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={approveKyc}
                    disabled={busy}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: 8,
                      border: 'none',
                      background: '#00A86B',
                      color: 'white',
                      fontWeight: 700,
                      cursor: 'pointer',
                      opacity: busy ? 0.5 : 1,
                    }}
                  >
                    ✓ APPROUVER
                  </button>
                  <button
                    onClick={denyKyc}
                    disabled={busy}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: 8,
                      border: 'none',
                      background: '#CC0000',
                      color: 'white',
                      fontWeight: 700,
                      cursor: 'pointer',
                      opacity: busy ? 0.5 : 1,
                    }}
                  >
                    ✗ REFUSER
                  </button>
                </div>
              </div>
            )}

            {data.kyc_checks && data.kyc_checks.length > 0 && (
              <div className="mt-6">
                <h4 className="mb-2 font-display tracking-wider text-gold">
                  Vérifications KYC
                </h4>
                <div className="overflow-hidden rounded-lg border border-white/5">
                  <table className="w-full text-sm">
                    <thead className="bg-white/[0.03] text-left text-[11px] uppercase tracking-wider text-white/50">
                      <tr>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Verdict</th>
                        <th className="px-3 py-2">Âge estimé</th>
                        <th className="px-3 py-2 text-right">Confiance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.kyc_checks.map((k) => (
                        <tr key={k.id} className="border-t border-white/5">
                          <td className="px-3 py-2 text-white/70">{fmtDateTime(k.created_at)}</td>
                          <td className="px-3 py-2">
                            <span
                              className={
                                k.verdict === 'APPROVED'
                                  ? 'text-emerald-400'
                                  : k.verdict === 'DENIED'
                                  ? 'text-red-400'
                                  : 'text-amber-400'
                              }
                            >
                              {k.verdict}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-white">
                            {k.age_low != null && k.age_high != null
                              ? `${k.age_low}–${k.age_high}`
                              : '—'}
                          </td>
                          <td className="px-3 py-2 text-right text-white/70">
                            {k.confidence != null ? `${Number(k.confidence).toFixed(1)}%` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="mt-6">
              <h4 className="mb-2 font-display tracking-wider text-gold">
                Transactions (20 dernières)
              </h4>
              <div className="overflow-hidden rounded-lg border border-white/5">
                <table className="w-full text-sm">
                  <thead className="bg-white/[0.03] text-left text-[11px] uppercase tracking-wider text-white/50">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2 text-right">Montant</th>
                      <th className="px-3 py-2">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.transactions.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-center text-white/40">
                          Aucune transaction.
                        </td>
                      </tr>
                    )}
                    {data.transactions.map((t) => (
                      <tr key={t.id} className="border-t border-white/5">
                        <td className="px-3 py-2 text-white/70">{fmtDateTime(t.created_at)}</td>
                        <td className="px-3 py-2 text-white">{t.type}</td>
                        <td className="px-3 py-2 text-right text-gold">{fmtCdf(t.amount)}</td>
                        <td className="px-3 py-2 text-white/70">{txStatusLabel(t.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function PlayersTab() {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [rows, setRows] = useState<UserRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  async function load() {
    const r = await adminApi.users(debounced, page).catch(() => null);
    if (r) {
      setRows(r.items);
      setTotal(r.total);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [debounced, page]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Rechercher par numéro de téléphone…"
            className="w-full rounded-lg border border-white/10 bg-black/40 py-2.5 pl-9 pr-3 text-white outline-none focus:border-gold/60"
          />
        </div>
        <div className="text-xs text-white/40">{total != null && `${total} joueurs`}</div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/5">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-white/[0.03] text-left text-[11px] uppercase tracking-wider text-white/50">
            <tr>
              <th className="px-3 py-2">Téléphone</th>
              <th className="px-3 py-2">KYC</th>
              <th className="px-3 py-2">Risque</th>
              <th className="px-3 py-2 text-right">Solde</th>
              <th className="px-3 py-2">Inscrit le</th>
              <th className="px-3 py-2">Dernière activité</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-white/40">
                  Aucun joueur.
                </td>
              </tr>
            )}
            {rows.map((u) => {
              const bigLoser = (u.pnl_cdf ?? 0) < -50_000;
              const excessivePlay = (u.rounds_24h ?? 0) > 100;
              const selfExcluded = u.self_exclusion_until && new Date(u.self_exclusion_until).getTime() > Date.now();
              const atRisk = bigLoser || excessivePlay;
              const reasons: string[] = [];
              if (bigLoser) reasons.push(`P&L ${fmtCdf(u.pnl_cdf)}`);
              if (excessivePlay) reasons.push(`${u.rounds_24h} rounds/24h`);
              return (
                <tr
                  key={u.id}
                  onClick={() => setSelectedId(u.id)}
                  className="cursor-pointer border-t border-white/5 hover:bg-white/[0.03]"
                >
                  <td className="px-3 py-2 font-mono text-white">
                    <div className="flex items-center gap-2">
                      <span>{u.phone}</span>
                      {u.display_name && (
                        <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-white/60">{u.display_name}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <KycBadge status={u.kyc_status} />
                  </td>
                  <td className="px-3 py-2">
                    {selfExcluded ? (
                      <span
                        title={`Auto-exclu jusqu'au ${fmtDateTime(u.self_exclusion_until!)}`}
                        className="inline-flex items-center gap-1 rounded bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-red-300 ring-1 ring-red-500/40"
                      >
                        <ShieldOff size={11} /> EXCLU
                      </span>
                    ) : atRisk ? (
                      <span
                        title={reasons.join(' · ')}
                        className="inline-flex items-center gap-1 rounded bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-red-300 ring-1 ring-red-500/40"
                      >
                        ⚠ À RISQUE
                      </span>
                    ) : (
                      <span className="text-white/30">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-gold">{fmtCdf(u.balance_cdf)}</td>
                  <td className="px-3 py-2 text-white/70">{fmtDateTime(u.created_at)}</td>
                  <td className="px-3 py-2 text-white/70">
                    {u.last_activity_at ? `il y a ${fmtRelative(u.last_activity_at)}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2 text-sm">
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="rounded border border-white/10 px-3 py-1 text-white/80 disabled:opacity-40"
        >
          ← Préc.
        </button>
        <span className="text-white/50">Page {page}</span>
        <button
          disabled={rows.length < 25}
          onClick={() => setPage((p) => p + 1)}
          className="rounded border border-white/10 px-3 py-1 text-white/80 disabled:opacity-40"
        >
          Suiv. →
        </button>
      </div>

      {selectedId && (
        <Drawer
          userId={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
