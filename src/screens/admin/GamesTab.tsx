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

// ---------------------------------------------------------------------------
// OkapiColorSubTab
// ---------------------------------------------------------------------------
type OkapiColorLive = Awaited<ReturnType<typeof adminApi.okapiColorLive>>;
type OkapiColorDraw = Awaited<ReturnType<typeof adminApi.okapiColorLatestDraws>>[number];

const STATUS_COLOR: Record<string, string> = {
  open: '#00A86B', closing: '#ef4444', drawing: '#fbbf24', result: '#9CA3AF',
};

function OkapiColorSubTab() {
  const [live, setLive] = useState<OkapiColorLive | null>(null);
  const [draws, setDraws] = useState<OkapiColorDraw[]>([]);
  const [actionMsg, setActionMsg] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  async function load() {
    const [l, d] = await Promise.all([
      adminApi.okapiColorLive().catch(() => null),
      adminApi.okapiColorLatestDraws().catch(() => []),
    ]);
    if (l) setLive(l);
    setDraws(d ?? []);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function forceDraw() {
    if (!confirm('Forcer un tirage maintenant ?')) return;
    setActionLoading(true); setActionMsg('');
    try {
      const r = await adminApi.okapiColorForceDraw();
      setActionMsg(`✅ Tirage ${r.tirageId.slice(0, 8)} — ${r.winners} gagnant(s) — ${r.totalPaidCdf.toLocaleString('fr-FR')} CDF distribués`);
      load();
    } catch (e: any) {
      setActionMsg(`❌ ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  }

  async function purgePending() {
    if (!confirm('Annuler et rembourser tous les tickets pending ?')) return;
    setActionLoading(true); setActionMsg('');
    try {
      const r = await adminApi.okapiColorPurgePending();
      setActionMsg(`✅ ${r.refunded}/${r.scanned} tickets remboursés — ${r.total_refunded_cdf.toLocaleString('fr-FR')} CDF`);
      load();
    } catch (e: any) {
      setActionMsg(`❌ ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  }

  const st = live?.currentDraw.status ?? '—';
  const secs = live?.currentDraw.secondsRemaining ?? 0;
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
          <div className="text-[11px] uppercase tracking-wider text-white/50">Statut</div>
          <div className="font-display text-xl mt-1" style={{ color: STATUS_COLOR[st] ?? '#fff' }}>
            {st.toUpperCase()}
          </div>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
          <div className="text-[11px] uppercase tracking-wider text-white/50">Prochain tirage</div>
          <div className="font-display text-2xl text-white mt-1">{mm}:{ss}</div>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
          <div className="text-[11px] uppercase tracking-wider text-white/50">Pot jackpot</div>
          <div className="font-display text-xl mt-1" style={{ color: '#FFD700' }}>
            {fmtCdf(live?.jackpotCdf ?? 0)}
          </div>
          <div className="text-[10px] text-white/30 mt-0.5">Seuil : {fmtCdf(live?.jackpotThresholdCdf ?? 250_000)}</div>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
          <div className="text-[11px] uppercase tracking-wider text-white/50">Tickets ce slot</div>
          <div className="font-display text-2xl text-white mt-1">
            {live?.publicStats.ticketsCount ?? 0}
          </div>
          <div className="text-[10px] text-white/30 mt-0.5">
            {fmtCdf((live?.publicStats.ticketsCount ?? 0) * (live?.ticketPriceCdf ?? 1000))} collectés
          </div>
        </div>
      </div>

      {/* Admin actions */}
      <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4 space-y-3">
        <div className="text-[11px] uppercase tracking-wider text-white/50">Actions admin</div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={forceDraw}
            disabled={actionLoading}
            className="rounded-lg px-4 py-2 text-sm font-semibold bg-red-600/80 hover:bg-red-600 text-white disabled:opacity-40"
          >
            🎯 Forcer un tirage
          </button>
          <button
            onClick={purgePending}
            disabled={actionLoading}
            className="rounded-lg px-4 py-2 text-sm font-semibold bg-amber-600/80 hover:bg-amber-600 text-white disabled:opacity-40"
          >
            🧹 Purger tickets pending
          </button>
        </div>
        {actionMsg && (
          <div className={`text-sm px-3 py-2 rounded-lg ${actionMsg.startsWith('✅') ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-400'}`}>
            {actionMsg}
          </div>
        )}
      </div>

      {/* Last draw summary */}
      {live?.lastDraw && (
        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
          <div className="text-[11px] uppercase tracking-wider text-white/50 mb-3">
            Dernier tirage {live.lastDraw.drawNumber ? `#${live.lastDraw.drawNumber}` : ''} — {fmtDateTime(live.lastDraw.drawnAt)}
          </div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {live.lastDraw.numerosRouges.map((n) => (
              <span key={n} className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-700/80 text-xs font-bold text-white">{n}</span>
            ))}
            {live.lastDraw.numerosOr.map((n) => (
              <span key={n} className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-yellow-600/80 text-xs font-bold text-black">{n}</span>
            ))}
          </div>
          <div className="flex gap-6 text-sm">
            <div><span className="text-white/50">Gagnants : </span><span className="text-white">{live.lastDraw.winnerCount}</span></div>
            <div><span className="text-white/50">Distribué : </span><span className="text-emerald-300">{fmtCdf(live.lastDraw.totalPaidCdf)}</span></div>
            <div><span className="text-white/50">Jackpot payé : </span><span style={{ color: live.lastDraw.jackpotPaye ? '#FFD700' : '#9ca3af' }}>{live.lastDraw.jackpotPaye ? 'OUI' : 'non'}</span></div>
          </div>
        </div>
      )}

      {/* Draws history table */}
      <div className="overflow-x-auto rounded-xl border border-white/5">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-white/[0.03] text-left text-[11px] uppercase tracking-wider text-white/50">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Heure</th>
              <th className="px-3 py-2">Rouges</th>
              <th className="px-3 py-2">Or</th>
              <th className="px-3 py-2 text-center">Jackpot</th>
            </tr>
          </thead>
          <tbody>
            {draws.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-white/40">Aucun tirage.</td></tr>
            )}
            {draws.map((d) => (
              <tr key={d.id} className="border-t border-white/5">
                <td className="px-3 py-2 font-mono text-white/60 text-xs">
                  {d.draw_number != null ? `#${d.draw_number}` : d.id.slice(0, 6)}
                </td>
                <td className="px-3 py-2 text-white/80">{fmtDateTime(d.drawn_at)}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {d.numeros_rouges.map((n) => (
                      <span key={n} className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-700/70 text-[11px] font-bold text-white">{n}</span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {d.numeros_or.map((n) => (
                      <span key={n} className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-yellow-600/70 text-[11px] font-bold text-black">{n}</span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2 text-center">
                  {d.jackpot_paye
                    ? <span className="text-yellow-400 font-bold">💰 OUI</span>
                    : <span className="text-white/30">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function GamesTab() {
  const [sub, setSub] = useState<'okapi' | 'loto' | 'scratch' | 'okapicolor'>('okapi');
  const SUBTABS: { id: typeof sub; label: string }[] = [
    { id: 'okapi',      label: 'OKAPI CLIMB' },
    { id: 'okapicolor', label: 'OKAPI COLOR' },
    { id: 'loto',       label: 'LOTO' },
    { id: 'scratch',    label: 'SCRATCH' },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {SUBTABS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSub(s.id)}
            className={`rounded-lg px-4 py-2 font-display tracking-wider text-sm ${
              sub === s.id
                ? 'bg-gold text-black'
                : 'border border-white/10 text-white/70 hover:bg-white/5'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {sub === 'okapi'      && <OkapiSubTab />}
      {sub === 'okapicolor' && <OkapiColorSubTab />}
      {sub === 'loto'       && <LotoSubTab />}
      {sub === 'scratch'    && <ScratchSubTab />}
    </div>
  );
}
