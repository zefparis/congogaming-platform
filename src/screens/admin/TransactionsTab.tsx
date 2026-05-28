import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { adminApi, downloadTransactionsCsv } from '../../lib/adminApi';
import { fmtCdf, fmtDateTime, maskPhone, txStatusLabel } from './format';

type Row = Awaited<ReturnType<typeof adminApi.transactions>>['items'][number];
type Summary = Awaited<ReturnType<typeof adminApi.transactionsSummary>>;

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tous statuts' },
  { value: 'success', label: 'Succès' },
  { value: 'pending', label: 'En attente' },
  { value: 'failed', label: 'Échoué' },
];

const TYPE_OPTIONS = [
  { value: 'all', label: 'Tous types' },
  { value: 'deposit', label: 'Dépôts' },
  { value: 'withdrawal', label: 'Retraits' },
];

export default function TransactionsTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const [provider, setProvider] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exporting, setExporting] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);

  async function loadSummary() {
    const s = await adminApi.transactionsSummary().catch(() => null);
    if (s) setSummary(s);
  }

  async function load() {
    const r = await adminApi
      .transactions({ page, status, type, provider: provider || 'all', from, to })
      .catch(() => null);
    if (r) {
      setRows(r.items);
      setTotal(r.total);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [page, status, type, provider, from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadSummary();
    const t = setInterval(loadSummary, 30000);
    return () => clearInterval(t);
  }, []);

  function resetPage() {
    setPage(1);
  }

  async function onExport() {
    setExporting(true);
    try {
      await downloadTransactionsCsv({
        status,
        type,
        provider: provider || undefined,
        from: from || undefined,
        to: to || undefined,
      });
    } catch (e: any) {
      alert(e?.message || 'Export échoué');
    } finally {
      setExporting(false);
    }
  }

  const failureRate = summary ? summary.failure_rate : 0;
  const failureColor = failureRate > 0.2 ? '#f87171' : '#9ca3af';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4">
          <div className="text-[11px] uppercase tracking-wider text-emerald-300/80">
            Dépôts réussis (jour)
          </div>
          <div className="mt-1 font-display text-2xl text-emerald-300">
            {fmtCdf(summary?.deposits_success_cdf ?? 0)}
          </div>
        </div>
        <div className="rounded-xl border border-gold/30 bg-gold/[0.06] p-4">
          <div className="text-[11px] uppercase tracking-wider text-gold/80">
            Retraits réussis (jour)
          </div>
          <div className="mt-1 font-display text-2xl text-gold">
            {fmtCdf(summary?.withdrawals_success_cdf ?? 0)}
          </div>
        </div>
        <div
          className="rounded-xl border p-4"
          style={{
            borderColor: failureRate > 0.2 ? 'rgba(248,113,113,0.4)' : 'rgba(255,255,255,0.1)',
            background:
              failureRate > 0.2 ? 'rgba(248,113,113,0.06)' : 'rgba(255,255,255,0.02)',
          }}
        >
          <div className="text-[11px] uppercase tracking-wider text-white/50">
            Taux d'échec (jour)
          </div>
          <div className="mt-1 font-display text-2xl" style={{ color: failureColor }}>
            {(failureRate * 100).toFixed(1)}%
          </div>
          <div className="mt-1 text-xs text-white/40">
            {summary?.failed_count ?? 0} / {summary?.total_count ?? 0} transactions
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            resetPage();
          }}
          className="rounded-md border border-white/10 bg-black/40 px-2 py-2 text-sm text-white"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            resetPage();
          }}
          className="rounded-md border border-white/10 bg-black/40 px-2 py-2 text-sm text-white"
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          placeholder="Provider id"
          value={provider}
          onChange={(e) => {
            setProvider(e.target.value);
            resetPage();
          }}
          className="rounded-md border border-white/10 bg-black/40 px-2 py-2 text-sm text-white placeholder:text-white/30"
        />
        <input
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            resetPage();
          }}
          className="rounded-md border border-white/10 bg-black/40 px-2 py-2 text-sm text-white"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            resetPage();
          }}
          className="rounded-md border border-white/10 bg-black/40 px-2 py-2 text-sm text-white"
        />
        <button
          onClick={onExport}
          disabled={exporting}
          className="flex items-center justify-center gap-2 rounded-md bg-gold px-3 py-2 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-50"
        >
          <Download size={14} />
          {exporting ? 'Export…' : 'Export CSV'}
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/5">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-white/[0.03] text-left text-[11px] uppercase tracking-wider text-white/50">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Téléphone</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2 text-right">Montant</th>
              <th className="px-3 py-2">Provider</th>
              <th className="px-3 py-2">Statut</th>
              <th className="px-3 py-2">Order ID</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-white/40">
                  Aucune transaction.
                </td>
              </tr>
            )}
            {rows.map((t) => (
              <tr key={t.id} className="border-t border-white/5">
                <td className="px-3 py-2 text-white/70">{fmtDateTime(t.created_at)}</td>
                <td className="px-3 py-2 font-mono text-white">{maskPhone(t.phone)}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] uppercase tracking-wider ${
                      t.type === 'deposit'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : t.type === 'withdrawal'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-white/10 text-white/70'
                    }`}
                  >
                    {t.type}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-gold">{fmtCdf(t.amount_cdf)}</td>
                <td className="px-3 py-2 text-white/70">#{t.provider_id}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] uppercase tracking-wider ${
                      t.status === 2
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : t.status === 3
                        ? 'bg-red-500/20 text-red-300'
                        : 'bg-yellow-500/20 text-yellow-300'
                    }`}
                  >
                    {txStatusLabel(t.status)}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-white/50">
                  {t.order_id.slice(0, 10)}…
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="text-white/40">{total != null && `${total} résultats`}</div>
        <div className="flex items-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded border border-white/10 px-3 py-1 text-white/80 disabled:opacity-40"
          >
            ← Préc.
          </button>
          <span className="text-white/50">Page {page}</span>
          <button
            disabled={rows.length < 50}
            onClick={() => setPage((p) => p + 1)}
            className="rounded border border-white/10 px-3 py-1 text-white/80 disabled:opacity-40"
          >
            Suiv. →
          </button>
        </div>
      </div>
    </div>
  );
}
