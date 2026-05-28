import { useEffect, useState } from 'react';
import { adminApi } from '../../lib/adminApi';
import { fmtCdf, fmtDateTime } from './format';

type OkapiRow = Awaited<ReturnType<typeof adminApi.okapiRounds>>['items'][number];
type LotoRow = Awaited<ReturnType<typeof adminApi.lotoTirages>>['items'][number];
type ScratchRow = Awaited<ReturnType<typeof adminApi.scratchTickets>>['items'][number];
type ScratchOverview = Awaited<ReturnType<typeof adminApi.scratchOverview>>;

function OkapiSubTab() {
  const [rows, setRows] = useState<OkapiRow[]>([]);
  const [page, setPage] = useState(1);

  async function load() {
    const r = await adminApi.okapiRounds(page).catch(() => null);
    if (r) setRows(r.items);
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-white/5">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-white/[0.03] text-left text-[11px] uppercase tracking-wider text-white/50">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Démarré</th>
              <th className="px-3 py-2 text-right">Crash ×</th>
              <th className="px-3 py-2 text-right">Joueurs</th>
              <th className="px-3 py-2 text-right">Mises</th>
              <th className="px-3 py-2 text-right">Cashouts</th>
              <th className="px-3 py-2 text-right">Meilleur cashout</th>
              <th className="px-3 py-2 text-right">Profit maison</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-white/40">
                  Aucun round.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-white/5">
                <td className="px-3 py-2 font-mono text-xs text-white/60">{r.id.slice(0, 8)}…</td>
                <td className="px-3 py-2 text-white/80">{fmtDateTime(r.started_at)}</td>
                <td className="px-3 py-2 text-right font-display text-lg text-gold">
                  {r.crash_point.toFixed(2)}×
                </td>
                <td className="px-3 py-2 text-right text-white/80">{r.players_count}</td>
                <td className="px-3 py-2 text-right text-white/80">{fmtCdf(r.total_bets)}</td>
                <td className="px-3 py-2 text-right text-white/80">{fmtCdf(r.total_cashouts)}</td>
                <td className="px-3 py-2 text-right text-emerald-300">{fmtCdf(r.biggest_cashout)}</td>
                <td
                  className="px-3 py-2 text-right font-semibold"
                  style={{ color: r.house_profit >= 0 ? '#34d399' : '#f87171' }}
                >
                  {fmtCdf(r.house_profit)}
                </td>
              </tr>
            ))}
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
          onClick={() => setPage((p) => p + 1)}
          className="rounded border border-white/10 px-3 py-1 text-white/80"
        >
          Suiv. →
        </button>
      </div>
    </div>
  );
}

function LotoSubTab() {
  const [rows, setRows] = useState<LotoRow[]>([]);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<'all' | 'congo' | 'flash'>('all');

  async function load() {
    const r = await adminApi.lotoTirages(page, filter).catch(() => null);
    if (r) setRows(r.items);
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [page, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      <div className="flex gap-2 text-sm">
        {(['all', 'congo', 'flash'] as const).map((f) => (
          <button
            key={f}
            onClick={() => {
              setFilter(f);
              setPage(1);
            }}
            className={`rounded px-3 py-1.5 ${
              filter === f
                ? 'bg-gold text-black'
                : 'border border-white/10 text-white/70 hover:bg-white/5'
            }`}
          >
            {f === 'all' ? 'Tous' : f === 'congo' ? 'Loto Congo' : 'Flash'}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/5">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-white/[0.03] text-left text-[11px] uppercase tracking-wider text-white/50">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Tiré le</th>
              <th className="px-3 py-2">Numéros</th>
              <th className="px-3 py-2 text-right">Jackpot</th>
              <th className="px-3 py-2 text-right">Tickets vendus</th>
              <th className="px-3 py-2 text-right">Revenus</th>
              <th className="px-3 py-2 text-right">Gagnants</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-white/40">
                  Aucun tirage.
                </td>
              </tr>
            )}
            {rows.map((t) => (
              <tr key={`${t.type}-${t.id}`} className="border-t border-white/5">
                <td className="px-3 py-2 font-mono text-xs text-white/60">{t.id.slice(0, 8)}…</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] uppercase tracking-wider ${
                      t.type === 'congo'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-pink-500/20 text-pink-300'
                    }`}
                  >
                    {t.type}
                  </span>
                </td>
                <td className="px-3 py-2 text-white/80">{fmtDateTime(t.drawn_at)}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {t.numeros.map((n, i) => (
                      <span
                        key={i}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gold/20 text-xs font-bold text-gold"
                      >
                        {n}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2 text-right text-gold">
                  {t.jackpot_cdf != null ? fmtCdf(t.jackpot_cdf) : '—'}
                </td>
                <td className="px-3 py-2 text-right text-white/80">{t.tickets_sold}</td>
                <td className="px-3 py-2 text-right text-emerald-300">{fmtCdf(t.revenue_cdf)}</td>
                <td className="px-3 py-2 text-right text-white/80">{t.winners}</td>
              </tr>
            ))}
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
          onClick={() => setPage((p) => p + 1)}
          className="rounded border border-white/10 px-3 py-1 text-white/80"
        >
          Suiv. →
        </button>
      </div>
    </div>
  );
}

function ScratchSubTab() {
  const [rows, setRows] = useState<ScratchRow[]>([]);
  const [overview, setOverview] = useState<ScratchOverview | null>(null);
  const [page, setPage] = useState(1);

  async function load() {
    const [r, ov] = await Promise.all([
      adminApi.scratchTickets(page).catch(() => null),
      adminApi.scratchOverview().catch(() => null),
    ]);
    if (r) setRows(r.items);
    if (ov) setOverview(ov);
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      {overview && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
            <div className="text-[11px] uppercase tracking-wider text-white/50">
              Tickets aujourd'hui
            </div>
            <div className="font-display text-2xl text-gold">{overview.tickets_today}</div>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
            <div className="text-[11px] uppercase tracking-wider text-white/50">Mises</div>
            <div className="font-display text-2xl text-white">{fmtCdf(overview.bets_today)}</div>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
            <div className="text-[11px] uppercase tracking-wider text-white/50">Gains payés</div>
            <div className="font-display text-2xl text-emerald-300">
              {fmtCdf(overview.wins_today)}
            </div>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
            <div className="text-[11px] uppercase tracking-wider text-white/50">Profit maison</div>
            <div
              className="font-display text-2xl"
              style={{ color: overview.revenue_today >= 0 ? '#34d399' : '#f87171' }}
            >
              {fmtCdf(overview.revenue_today)}
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-white/5">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="bg-white/[0.03] text-left text-[11px] uppercase tracking-wider text-white/50">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Téléphone</th>
              <th className="px-3 py-2 text-right">Mise</th>
              <th className="px-3 py-2 text-right">Gain</th>
              <th className="px-3 py-2">Statut</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-white/40">
                  Aucun ticket.
                </td>
              </tr>
            )}
            {rows.map((t) => (
              <tr key={t.id} className="border-t border-white/5">
                <td className="px-3 py-2 font-mono text-xs text-white/60">{t.id.slice(0, 8)}…</td>
                <td className="px-3 py-2 text-white/80">{fmtDateTime(t.created_at)}</td>
                <td className="px-3 py-2 text-white/80">{t.phone}</td>
                <td className="px-3 py-2 text-right text-white/80">{fmtCdf(t.bet_amount_cdf)}</td>
                <td
                  className="px-3 py-2 text-right font-semibold"
                  style={{ color: t.win_amount_cdf > 0 ? '#34d399' : '#9ca3af' }}
                >
                  {fmtCdf(t.win_amount_cdf)}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] uppercase tracking-wider ${
                      t.status === 'claimed'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : t.status === 'revealed'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-white/10 text-white/60'
                    }`}
                  >
                    {t.status}
                  </span>
                </td>
              </tr>
            ))}
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
          onClick={() => setPage((p) => p + 1)}
          className="rounded border border-white/10 px-3 py-1 text-white/80"
        >
          Suiv. →
        </button>
      </div>
    </div>
  );
}

export default function GamesTab() {
  const [sub, setSub] = useState<'okapi' | 'loto' | 'scratch'>('okapi');
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(['okapi', 'loto', 'scratch'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSub(s)}
            className={`rounded-lg px-4 py-2 font-display tracking-wider ${
              sub === s
                ? 'bg-gold text-black'
                : 'border border-white/10 text-white/70 hover:bg-white/5'
            }`}
          >
            {s === 'okapi' ? 'OKAPI' : s === 'loto' ? 'LOTO' : 'SCRATCH'}
          </button>
        ))}
      </div>
      {sub === 'okapi' ? <OkapiSubTab /> : sub === 'loto' ? <LotoSubTab /> : <ScratchSubTab />}
    </div>
  );
}
