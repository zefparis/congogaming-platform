import { useEffect, useState } from 'react';
import { Gift, ShieldCheck, ShieldOff, Trophy, Wallet } from 'lucide-react';
import { adminApi } from '../../lib/adminApi';
import { fmtCdf, fmtDateTime } from './format';

type Overview = Awaited<ReturnType<typeof adminApi.responsibleGamingOverview>>;
type Excluded = Awaited<ReturnType<typeof adminApi.responsibleGamingExcluded>>['items'];
type Leaderboard = Awaited<ReturnType<typeof adminApi.referralsLeaderboard>>['items'];
type ProgramStatus = Awaited<ReturnType<typeof adminApi.referralsStatus>>;

function StatCard({ label, value, Icon, color }: { label: string; value: string | number; Icon: any; color: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
      <div className="flex items-center gap-2">
        <Icon size={16} className={color} />
        <div className="text-[11px] uppercase tracking-wider text-white/50">{label}</div>
      </div>
      <div className="mt-2 font-display text-2xl text-white">{value}</div>
    </div>
  );
}

export default function ResponsibleTab() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [excluded, setExcluded] = useState<Excluded>([]);
  const [leaderboard, setLeaderboard] = useState<Leaderboard>([]);
  const [program, setProgram] = useState<ProgramStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [ov, exc, lb, pg] = await Promise.all([
        adminApi.responsibleGamingOverview(),
        adminApi.responsibleGamingExcluded(),
        adminApi.referralsLeaderboard(20),
        adminApi.referralsStatus(),
      ]);
      setOverview(ov);
      setExcluded(exc.items);
      setLeaderboard(lb.items);
      setProgram(pg);
    } catch (e: any) {
      setError(e?.message || 'Erreur');
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>
      )}

      {/* Overview KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard
          label="Avec limites"
          value={overview?.users_with_limits ?? '—'}
          Icon={ShieldCheck}
          color="text-emerald-400"
        />
        <StatCard
          label="Limite jour"
          value={overview?.users_with_daily ?? '—'}
          Icon={Wallet}
          color="text-gold"
        />
        <StatCard
          label="Limite semaine"
          value={overview?.users_with_weekly ?? '—'}
          Icon={Wallet}
          color="text-gold"
        />
        <StatCard
          label="Limite mois"
          value={overview?.users_with_monthly ?? '—'}
          Icon={Wallet}
          color="text-gold"
        />
        <StatCard
          label="Auto-exclus"
          value={overview?.users_self_excluded ?? '—'}
          Icon={ShieldOff}
          color="text-red-400"
        />
      </div>

      {/* Self-excluded list */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 font-display text-xl tracking-wider text-gold">
          <ShieldOff size={18} /> Joueurs auto-exclus ({excluded.length})
        </h2>
        <div className="overflow-x-auto rounded-xl border border-white/5">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-white/[0.03] text-left text-[11px] uppercase tracking-wider text-white/50">
              <tr>
                <th className="px-3 py-2">Téléphone</th>
                <th className="px-3 py-2">Définie le</th>
                <th className="px-3 py-2">Jusqu'au</th>
                <th className="px-3 py-2 text-right">Reste</th>
              </tr>
            </thead>
            <tbody>
              {excluded.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-white/40">
                    Aucun joueur auto-exclu actif.
                  </td>
                </tr>
              )}
              {excluded.map((u) => {
                const ms = new Date(u.self_exclusion_until).getTime() - Date.now();
                const days = Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
                const hours = Math.max(0, Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));
                const reste = days >= 1 ? `${days} j ${hours} h` : `${hours} h`;
                const isPermanent = ms > 30 * 365 * 24 * 60 * 60 * 1000; // > 30 years
                return (
                  <tr key={u.user_id} className="border-t border-white/5">
                    <td className="px-3 py-2 font-mono text-white">{u.phone}</td>
                    <td className="px-3 py-2 text-white/70">{fmtDateTime(u.set_at)}</td>
                    <td className="px-3 py-2 text-white/70">
                      {isPermanent ? <span className="text-red-300">Permanent</span> : fmtDateTime(u.self_exclusion_until)}
                    </td>
                    <td className="px-3 py-2 text-right text-amber-300">{isPermanent ? '∞' : reste}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Program status */}
      {program && (
        <div
          className={`rounded-xl border p-4 ${
            program.enabled
              ? 'border-emerald-500/30 bg-emerald-500/[0.05]'
              : 'border-red-500/40 bg-red-500/[0.08]'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Gift size={16} className={program.enabled ? 'text-emerald-400' : 'text-red-400'} />
              <span className="font-display tracking-wider text-white">
                Programme parrainage : {program.enabled ? 'ACTIF' : 'DÉSACTIVÉ (kill switch)'}
              </span>
            </div>
            <span className="text-[11px] text-white/40">
              Toggle via env <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-white/70">REFERRAL_PROGRAM_ENABLED</code>
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-lg border border-white/5 bg-black/30 p-2">
              <div className="text-[10px] uppercase tracking-wider text-white/40">Bonus filleul</div>
              <div className="mt-1 text-white">
                {program.welcome_bonus_percent}% du 1er dépôt (max {fmtCdf(program.welcome_bonus_cap_cdf)})
              </div>
            </div>
            <div className="rounded-lg border border-white/5 bg-black/30 p-2">
              <div className="text-[10px] uppercase tracking-wider text-white/40">Dépôt min qualifiant</div>
              <div className="mt-1 text-white">≥ {fmtCdf(program.min_qualifying_deposit_cdf)}</div>
            </div>
            <div className="rounded-lg border border-white/5 bg-black/30 p-2">
              <div className="text-[10px] uppercase tracking-wider text-white/40">Paliers parrain</div>
              <div className="mt-1 text-white">
                {program.tiers
                  .map((t) => `${(t.threshold_cdf / 1000).toFixed(0)}k → ${fmtCdf(t.reward_cdf)}`)
                  .join(' · ')}
              </div>
            </div>
            <div className="rounded-lg border border-white/5 bg-black/30 p-2">
              <div className="text-[10px] uppercase tracking-wider text-white/40">Plafond annuel parrain</div>
              <div className="mt-1 text-white">{fmtCdf(program.annual_cap_cdf)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Referral leaderboard */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 font-display text-xl tracking-wider text-gold">
          <Trophy size={18} /> Top parrains
        </h2>
        <div className="overflow-x-auto rounded-xl border border-white/5">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-white/[0.03] text-left text-[11px] uppercase tracking-wider text-white/50">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Téléphone</th>
                <th className="px-3 py-2">Pseudo</th>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2 text-right">Filleuls</th>
                <th className="px-3 py-2 text-right">Bonus crédités</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-white/40">
                    Aucun parrain pour le moment.
                  </td>
                </tr>
              )}
              {leaderboard.map((u, i) => (
                <tr key={u.user_id} className="border-t border-white/5">
                  <td className="px-3 py-2 text-white/40">
                    {i === 0 ? <Gift size={14} className="inline text-gold" /> : i + 1}
                  </td>
                  <td className="px-3 py-2 font-mono text-white">{u.phone}</td>
                  <td className="px-3 py-2 text-white/70">{u.display_name || '—'}</td>
                  <td className="px-3 py-2">
                    {u.referral_code ? (
                      <span className="rounded bg-gold/15 px-2 py-0.5 font-mono text-[11px] tracking-wider text-gold ring-1 ring-gold/30">
                        {u.referral_code}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-display text-lg text-white">{u.referred_count}</td>
                  <td className="px-3 py-2 text-right text-emerald-300">{fmtCdf(u.total_credited_cdf)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
