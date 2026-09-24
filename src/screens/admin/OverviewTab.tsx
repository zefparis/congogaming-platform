import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity as ActivityIcon,
  ArrowDownRight,
  ArrowUpRight,
  Coins,
  Gamepad2,
  ShieldCheck,
  Ticket,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { adminApi, AdminAuthError, clearAdminSession } from '../../lib/adminApi';
import { fmtCdf, fmtInt, fmtRelative } from './format';

type Overview = Awaited<ReturnType<typeof adminApi.overview>>;

type Activity = Awaited<ReturnType<typeof adminApi.activity>>['events'][number];

type PinResetReq = Awaited<ReturnType<typeof adminApi.pinResets>>['requests'][number];

interface FetchError {
  __error: string;
  __isAuthError: boolean;
}

function isAuthError(e: unknown): boolean {
  if (e instanceof AdminAuthError) return true;
  if (e instanceof Error) {
    const msg = e.message.toLowerCase();
    return msg.includes('unauthorized') || msg.includes('401') || msg.includes('403');
  }
  return false;
}

function catchFetch<T>(fallback: T, e: unknown): T & Partial<FetchError> {
  const authErr = isAuthError(e);
  const message = e instanceof Error ? e.message : String(e);
  return { ...fallback, __error: message, __isAuthError: authErr };
}

function Kpi({
  icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-5 shadow-lg">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-white/50">{label}</div>
          <div
            className="mt-2 font-display text-3xl tracking-wide"
            style={{ color: accent || '#FFD700' }}
          >
            {value}
          </div>
          {hint && <div className="mt-1 text-xs text-white/40">{hint}</div>}
        </div>
        <div className="rounded-xl bg-black/40 p-2.5 text-gold">{icon}</div>
      </div>
    </div>
  );
}

const ACTIVITY_ICON: Record<Activity['type'], React.ReactNode> = {
  deposit: <ArrowDownRight size={16} className="text-emerald-400" />,
  withdrawal: <ArrowUpRight size={16} className="text-amber-400" />,
  okapi_color_ticket: <Ticket size={16} className="text-gold" />,
};

const ACTIVITY_LABEL: Record<Activity['type'], string> = {
  deposit: 'Dépôt',
  withdrawal: 'Retrait',
  okapi_color_ticket: 'Okapi Color',
};

export default function OverviewTab() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [avadapay, setAvadapay] = useState<{ balance_cdf: number | null; error?: string } | null>(
    null,
  );
  const [revenue, setRevenue] = useState<Array<{ day: string; profit_cdf: number }>>([]);
  const [events, setEvents] = useState<Activity[]>([]);
  const [pinResets, setPinResets] = useState<PinResetReq[]>([]);
  const [pinBusy, setPinBusy] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);
  const [isSuper] = useState(() => {
    try {
      return sessionStorage.getItem('cg_admin_role') === 'super_admin';
    } catch {
      return false;
    }
  });

  async function loadAll() {
    const [ov, ap, rev, pr] = await Promise.all([
      adminApi.overview().catch((e) => catchFetch<Overview>(null as unknown as Overview, e)),
      adminApi.avadapayBalance().catch((e) => {
        const authErr = isAuthError(e);
        if (authErr) setAuthError(true);
        return { balance_cdf: null as number | null, error: e instanceof Error ? e.message : String(e) };
      }),
      adminApi.revenue(7).catch((e) => catchFetch<{ series: Array<{ day: string; profit_cdf: number }> }>({ series: [] }, e)),
      adminApi.pinResets().catch((e) => catchFetch<{ requests: PinResetReq[] }>({ requests: [] }, e)),
    ]);
    if ((ov as Partial<FetchError>).__isAuthError) setAuthError(true);
    if ((rev as Partial<FetchError>).__isAuthError) setAuthError(true);
    if ((pr as Partial<FetchError>).__isAuthError) setAuthError(true);
    if (ov && !(ov as Partial<FetchError>).__error) setOverview(ov);
    setAvadapay(ap as any);
    setRevenue(rev.series || []);
    setPinResets(pr.requests || []);
  }

  async function handlePinReset(id: string, action: 'approve' | 'reject') {
    if (pinBusy) return;
    const msg =
      action === 'approve'
        ? 'Approuver cette demande ? Le nouveau code PIN sera appliqué immédiatement au compte du joueur.'
        : 'Rejeter cette demande de réinitialisation ?';
    if (!confirm(msg)) return;
    setPinBusy(id);
    setPinError(null);
    try {
      if (action === 'approve') await adminApi.approvePinReset(id);
      else await adminApi.rejectPinReset(id);
      setPinResets((prev) => prev.filter((r) => r.id !== id));
    } catch (e: any) {
      setPinError(e?.message || 'Erreur');
    } finally {
      setPinBusy(null);
    }
  }

  async function loadActivity() {
    const a = await adminApi.activity(10).catch((e) => catchFetch<{ events: Activity[] }>({ events: [] }, e));
    if ((a as Partial<FetchError>).__isAuthError) setAuthError(true);
    setEvents(a.events || []);
  }

  useEffect(() => {
    loadAll();
    loadActivity();
    const t1 = setInterval(loadAll, 30000);
    const t2 = setInterval(loadActivity, 10000);
    return () => {
      clearInterval(t1);
      clearInterval(t2);
    };
  }, []);

  return (
    <div className="space-y-6">
      {authError && (
        <div className="flex items-center justify-between rounded-2xl border border-red-500/40 bg-red-500/10 p-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-display text-lg text-red-300">Session admin expirée ou invalide</p>
              <p className="text-sm text-red-300/70">Reconnexion nécessaire — les données affichées peuvent être incomplètes.</p>
            </div>
          </div>
          <button
            onClick={() => {
              clearAdminSession();
              window.location.reload();
            }}
            className="rounded-lg bg-red-500/20 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/30"
          >
            Se reconnecter
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Kpi
          icon={<Coins size={20} />}
          label="Solde total en circulation"
          value={fmtCdf(overview?.total_balance_cdf ?? 0)}
          hint="Somme des balances joueurs"
        />
        <Kpi
          icon={<Wallet size={20} />}
          label="Balance AvadaPay"
          value={avadapay?.balance_cdf != null ? fmtCdf(avadapay.balance_cdf) : '—'}
          hint={avadapay?.error ? `⚠ ${avadapay.error}` : 'Wallet marchand Unipesa'}
          accent={avadapay?.error ? '#f87171' : undefined}
        />
        <Kpi
          icon={<Users size={20} />}
          label="Joueurs inscrits"
          value={fmtInt(overview?.users_count ?? 0)}
        />
        <Kpi
          icon={<Gamepad2 size={20} />}
          label="Tirages aujourd'hui"
          value={fmtInt(overview?.okapi_color_draws_today ?? 0)}
          hint="Tirages Okapi Color"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi
          icon={<ActivityIcon size={20} />}
          label="Joueurs actifs aujourd'hui"
          value={fmtInt(overview?.active_players_today ?? 0)}
          hint="Distinct user_id sur okapi_color_tickets"
        />
        <Kpi
          icon={<ArrowDownRight size={20} />}
          label="Dépôts réussis (jour)"
          value={fmtCdf(overview?.total_deposits_today ?? 0)}
          accent="#34d399"
        />
        <Kpi
          icon={<ArrowUpRight size={20} />}
          label="Retraits réussis (jour)"
          value={fmtCdf(overview?.total_withdrawals_today ?? 0)}
          accent="#fbbf24"
        />
        <Kpi
          icon={<ShieldCheck size={20} />}
          label="KYC à vérifier"
          value={fmtInt(overview?.kyc_pending_submissions ?? 0)}
          hint="Soumissions en attente de revue manuelle"
          accent={overview?.kyc_pending_submissions ? '#fbbf24' : undefined}
        />
        <Kpi
          icon={<Ticket size={20} />}
          label="Tickets vendus (jour)"
          value={fmtInt(overview?.okapi_color_tickets_today ?? 0)}
          hint="Okapi Color"
        />
      </div>

      {overview?.kyc && (
        <div className="rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-5 shadow-lg">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-gold" />
              <h3 className="font-display text-xl tracking-wider text-gold">
                KYC — Revue manuelle
              </h3>
            </div>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm text-white/80">
            <div>
              <span className="font-display text-2xl text-emerald-400">
                {fmtInt(overview.kyc.approved)}
              </span>{' '}
              joueurs vérifiés
            </div>
            <span className="text-white/30">/</span>
            <div>
              <span className="font-display text-2xl text-white/70">
                {fmtInt(overview.kyc.pending)}
              </span>{' '}
              en attente
            </div>
            <span className="text-white/30">/</span>
            <div>
              <span className="font-display text-2xl text-amber-400">
                {fmtInt(overview.kyc_pending_submissions ?? 0)}
              </span>{' '}
              à vérifier
            </div>
            <span className="text-white/30">/</span>
            <div>
              <span className="font-display text-2xl text-red-400">
                {fmtInt(overview.kyc.denied)}
              </span>{' '}
              refusés
            </div>
          </div>
        </div>
      )}

      {pinResets.length > 0 && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.03] p-5 shadow-lg">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-xl tracking-wider text-amber-400">
              Réinitialisations PIN en attente ({pinResets.length})
            </h3>
            <span className="text-xs text-white/40">Revue manuelle — comparez le selfie au document KYC</span>
          </div>
          {pinError && (
            <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
              {pinError}
            </div>
          )}
          <div className="space-y-4">
            {pinResets.map((r) => (
              <div key={r.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="font-mono text-white">{r.phone}</span>
                  {r.users?.display_name && (
                    <span className="text-sm text-white/70">{r.users.display_name}</span>
                  )}
                  <span className="text-xs text-white/40">{fmtRelative(r.created_at)}</span>
                  {r.users?.kyc_status && (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/60">
                      KYC : {r.users.kyc_status}
                    </span>
                  )}
                  {r.users?.blocked && (
                    <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[11px] text-red-300">
                      bloqué
                    </span>
                  )}
                </div>
                <div className="mb-3 flex items-start gap-4">
                  <div>
                    <div className="mb-1 text-[11px] uppercase tracking-wider text-white/40">
                      Selfie de la demande
                    </div>
                    <img
                      src={`data:image/jpeg;base64,${r.selfie_b64}`}
                      alt="Selfie de la demande"
                      className="h-28 w-28 rounded-lg border border-white/10 object-cover"
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-[11px] uppercase tracking-wider text-white/40">
                      Document KYC de référence
                    </div>
                    {r.kyc_selfie_b64 ? (
                      <img
                        src={`data:image/jpeg;base64,${r.kyc_selfie_b64}`}
                        alt="Document KYC"
                        className="h-28 w-28 rounded-lg border border-white/10 object-cover"
                      />
                    ) : (
                      <div className="flex h-28 w-28 items-center justify-center rounded-lg border border-dashed border-white/15 text-center text-[11px] text-white/40">
                        Aucun document KYC
                      </div>
                    )}
                  </div>
                </div>
                {isSuper ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handlePinReset(r.id, 'approve')}
                      disabled={pinBusy === r.id}
                      className="flex-1 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                    >
                      ✓ Approuver
                    </button>
                    <button
                      onClick={() => handlePinReset(r.id, 'reject')}
                      disabled={pinBusy === r.id}
                      className="flex-1 rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"
                    >
                      ✗ Rejeter
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-white/40">Approbation réservée au super-admin.</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-white/5 bg-black/30 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-xl tracking-wider text-gold">Revenus — 7 derniers jours</h3>
          <span className="text-xs text-white/40">House profit Okapi Color (CDF)</span>
        </div>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={revenue} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis
                dataKey="day"
                tick={{ fill: '#ffffff80', fontSize: 11 }}
                tickFormatter={(d: string) => d.slice(5)}
              />
              <YAxis tick={{ fill: '#ffffff80', fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: '#0a0a0f',
                  border: '1px solid #FFD70033',
                  borderRadius: 8,
                  color: '#fff',
                }}
                formatter={(v: any) => [fmtCdf(Number(v)), 'Profit']}
              />
              <Bar dataKey="profit_cdf" fill="#FFD700" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-white/5 bg-black/30 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-xl tracking-wider text-gold">Activité en direct</h3>
          <span className="text-xs text-white/40">Auto-refresh 10s</span>
        </div>
        <div className="overflow-hidden rounded-lg border border-white/5">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-left text-[11px] uppercase tracking-wider text-white/50">
              <tr>
                <th className="px-3 py-2">Quand</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Téléphone</th>
                <th className="px-3 py-2 text-right">Montant</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-white/40">
                    Aucune activité récente.
                  </td>
                </tr>
              )}
              {events.map((e) => (
                <tr key={`${e.type}-${e.id}`} className="border-t border-white/5">
                  <td className="px-3 py-2 text-white/70">{fmtRelative(e.created_at)}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5 text-white">
                      {ACTIVITY_ICON[e.type]}
                      <span>{ACTIVITY_LABEL[e.type]}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-white/80">{e.phone}</td>
                  <td className="px-3 py-2 text-right text-gold">{fmtCdf(e.amount_cdf)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
