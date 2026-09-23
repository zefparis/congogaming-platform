import { useEffect, useState } from 'react';
import { adminApi } from '../../lib/adminApi';
import { fmtCdf, fmtDateTime } from './format';


type OkapiColorLive = Awaited<ReturnType<typeof adminApi.okapiColorLive>>;
type OkapiColorDraw = Awaited<ReturnType<typeof adminApi.okapiColorLatestDraws>>[number];

const STATUS_COLOR: Record<string, string> = {
  open: '#00A86B', closing: '#ef4444', drawing: '#fbbf24', result: '#9CA3AF',
};

function OkapiColorSubTab() {
  const [live, setLive] = useState<OkapiColorLive | null>(null);
  const [draws, setDraws] = useState<OkapiColorDraw[]>([]);
  const [secs, setSecs] = useState(0);
  const [actionMsg, setActionMsg] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [jackpotSetInput, setJackpotSetInput] = useState('');
  const [jackpotCreditInput, setJackpotCreditInput] = useState('');
  const [jackpotMsg, setJackpotMsg] = useState('');
  const [jackpotLoading, setJackpotLoading] = useState(false);

  async function load() {
    const [l, d] = await Promise.all([
      adminApi.okapiColorLive().catch(() => null),
      adminApi.okapiColorLatestDraws().catch(() => null),
    ]);
    if (l) { setLive(l); setSecs(l.currentDraw.secondsRemaining); }
    if (d) setDraws(d);
  }

  useEffect(() => {
    load();
    const poll = setInterval(load, 15_000);
    const tick = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000);
    return () => { clearInterval(poll); clearInterval(tick); };
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

  async function handleJackpotSet() {
    const amount = Number(jackpotSetInput);
    if (!jackpotSetInput || isNaN(amount) || amount < 0) {
      setJackpotMsg('❌ Montant invalide');
      return;
    }
    if (!confirm(`Définir le pot jackpot à ${amount.toLocaleString('fr-FR')} CDF ?`)) return;
    setJackpotLoading(true); setJackpotMsg('');
    try {
      const r = await adminApi.okapiColorJackpotSet(amount);
      setJackpotMsg(`✅ Pot défini : ${Number(r.old_pot).toLocaleString('fr-FR')} → ${Number(r.new_pot).toLocaleString('fr-FR')} CDF`);
      setJackpotSetInput('');
      load();
    } catch (e: any) {
      setJackpotMsg(`❌ ${e.message}`);
    } finally {
      setJackpotLoading(false);
    }
  }

  async function handleJackpotCredit() {
    const delta = Number(jackpotCreditInput);
    if (!jackpotCreditInput || isNaN(delta) || delta === 0) {
      setJackpotMsg('❌ Delta invalide (doit être ≠ 0)');
      return;
    }
    const sign = delta > 0 ? '+' : '';
    if (!confirm(`${sign}${delta.toLocaleString('fr-FR')} CDF au pot jackpot ?`)) return;
    setJackpotLoading(true); setJackpotMsg('');
    try {
      const r = await adminApi.okapiColorJackpotCredit(delta);
      setJackpotMsg(`✅ Pot crédité : ${Number(r.old_pot).toLocaleString('fr-FR')} → ${Number(r.new_pot).toLocaleString('fr-FR')} CDF`);
      setJackpotCreditInput('');
      load();
    } catch (e: any) {
      setJackpotMsg(`❌ ${e.message}`);
    } finally {
      setJackpotLoading(false);
    }
  }

  const st = live?.currentDraw.status ?? '—';
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

      {/* Jackpot management */}
      <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/[0.03] p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-wider text-yellow-500/70">🎰 Gestion Jackpot</div>
          <div className="text-sm text-white/50">
            Pot actuel : <span className="font-semibold" style={{ color: '#FFD700' }}>{fmtCdf(live?.jackpotCdf ?? 0)}</span>
            <span className="ml-3 text-white/30">Seuil : {fmtCdf(live?.jackpotThresholdCdf ?? 250_000)}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Set exact */}
          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-wider text-white/40">Définir montant exact</div>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                value={jackpotSetInput}
                onChange={(e) => setJackpotSetInput(e.target.value)}
                placeholder="Montant (CDF)"
                className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-yellow-500/50 focus:outline-none"
              />
              <button
                onClick={handleJackpotSet}
                disabled={jackpotLoading || !jackpotSetInput}
                className="rounded-lg px-4 py-2 text-sm font-semibold bg-yellow-600/80 hover:bg-yellow-600 text-black disabled:opacity-40"
              >
                Définir
              </button>
            </div>
          </div>

          {/* Credit / debit */}
          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-wider text-white/40">Créditer / Débiter</div>
            <div className="flex gap-2">
              <input
                type="number"
                value={jackpotCreditInput}
                onChange={(e) => setJackpotCreditInput(e.target.value)}
                placeholder="+ ou − CDF"
                className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-yellow-500/50 focus:outline-none"
              />
              <button
                onClick={handleJackpotCredit}
                disabled={jackpotLoading || !jackpotCreditInput}
                className="rounded-lg px-4 py-2 text-sm font-semibold bg-zinc-600/80 hover:bg-zinc-600 text-white disabled:opacity-40"
              >
                Appliquer
              </button>
            </div>
          </div>
        </div>

        {jackpotMsg && (
          <div className={`text-sm px-3 py-2 rounded-lg ${jackpotMsg.startsWith('✅') ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-400'}`}>
            {jackpotMsg}
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
            {(live.lastDraw.numerosRouges ?? []).map((n: number) => (
              <span key={n} className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-700/80 text-xs font-bold text-white">{n}</span>
            ))}
            {(live.lastDraw.numerosOr ?? []).map((n: number) => (
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
                    {(d.numeros_rouges ?? []).map((n: number) => (
                      <span key={n} className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-700/70 text-[11px] font-bold text-white">{n}</span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {(d.numeros_or ?? []).map((n: number) => (
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
  return <OkapiColorSubTab />;
}