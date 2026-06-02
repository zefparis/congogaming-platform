import { useEffect, useState } from 'react';
import { adminApi, Agent, AgentCommission } from '../../lib/adminApi';
import { fmtCdf, fmtDateTime } from './format';

const PLAY_URL = (import.meta.env.VITE_PLAY_URL as string | undefined) || 'https://www.congogaming.com';

function qrImgUrl(qrCode: string, size = 140): string {
  const target = `${PLAY_URL}/register?ref=${qrCode}`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(target)}`;
}

function StatusBadge({ status }: { status: string }) {
  const active = status === 'active';
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${active ? 'bg-emerald-900/60 text-emerald-300' : 'bg-red-900/60 text-red-300'}`}>
      {active ? 'Actif' : 'Suspendu'}
    </span>
  );
}

function CommissionsDrawer({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const [rows, setRows] = useState<AgentCommission[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    adminApi.agentCommissions(agentId)
      .then(r => setRows(r.commissions))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [agentId]);

  async function handlePay() {
    if (!confirm('Marquer toutes les commissions en attente comme payées ?')) return;
    try {
      setPaying(true);
      await adminApi.agentPay(agentId);
      setRows(prev => prev.map(c => ({ ...c, status: 'paid' as const })));
      setMsg('✓ Commissions marquées comme payées');
    } catch (e: any) {
      setMsg(`Erreur: ${e?.message}`);
    } finally {
      setPaying(false);
    }
  }

  const pending = rows.filter(c => c.status === 'pending').reduce((s, c) => s + Number(c.commission_cdf), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-xl border border-white/10 bg-[#0f0f16] p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Commissions</h3>
          <div className="flex items-center gap-3">
            {pending > 0 && (
              <button
                onClick={handlePay}
                disabled={paying}
                className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {paying ? '...' : `Payer ${fmtCdf(pending)}`}
              </button>
            )}
            <button onClick={onClose} className="text-white/40 hover:text-white/80">✕</button>
          </div>
        </div>
        {msg && <p className="mb-3 text-sm text-emerald-400">{msg}</p>}
        {loading ? (
          <p className="text-sm text-white/40">Chargement…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-white/40">Aucune commission</p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-white/40 text-xs">
                  <th className="py-2 text-left">Date</th>
                  <th className="py-2 text-left">Jeu</th>
                  <th className="py-2 text-right">Ticket</th>
                  <th className="py-2 text-right">Commission</th>
                  <th className="py-2 text-center">Statut</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(c => (
                  <tr key={c.id} className="border-b border-white/5 text-white/80">
                    <td className="py-1.5">{fmtDateTime(c.created_at)}</td>
                    <td className="py-1.5 capitalize">{c.ticket_type.replace('_', ' ')}</td>
                    <td className="py-1.5 text-right">{fmtCdf(c.ticket_amount_cdf)}</td>
                    <td className="py-1.5 text-right text-emerald-400 font-semibold">{fmtCdf(c.commission_cdf)}</td>
                    <td className="py-1.5 text-center">
                      <span className={`text-xs ${c.status === 'paid' ? 'text-white/40' : 'text-amber-400'}`}>
                        {c.status === 'paid' ? 'Payé' : 'En attente'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const OPERATORS = [
  { value: 'orange',   label: 'Orange Money' },
  { value: 'vodacom',  label: 'Vodacom M-Pesa' },
  { value: 'airtel',   label: 'Airtel Money' },
  { value: 'africell', label: 'Africell Money' },
];

const OPERATOR_LABEL: Record<string, string> = Object.fromEntries(OPERATORS.map(o => [o.value, o.label]));

function CreateAgentModal({ onCreated, onClose }: { onCreated: (a: Agent) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [zone, setZone] = useState('');
  const [rate, setRate] = useState('5');
  const [phone, setPhone] = useState('');
  const [operator, setOperator] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim())     { setErr('Nom requis');       return; }
    if (!phone.trim())    { setErr('Téléphone requis');  return; }
    if (!operator)        { setErr('Opérateur requis');  return; }
    try {
      setLoading(true);
      const agent = await adminApi.agentCreate({
        display_name:    name.trim(),
        zone:            zone.trim() || undefined,
        commission_rate: Number(rate) / 100,
        phone:           phone.trim(),
        operator,
        notes:           notes.trim() || undefined,
      });
      onCreated(agent);
    } catch (e: any) {
      setErr(e?.message || 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <form
        className="w-full max-w-sm rounded-xl border border-white/10 bg-[#0f0f16] p-6 shadow-2xl"
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-semibold text-white">Créer un agent</h3>
        {err && <p className="mb-3 text-sm text-red-400">{err}</p>}
        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-white/50">Nom affiché *</span>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            placeholder="Jean-Paul Lukwebo"
          />
        </label>
        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-white/50">Numéro de téléphone *</span>
          <input
            value={phone}
            onChange={e => setPhone(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            placeholder="09XXXXXXXX"
          />
        </label>
        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-white/50">Opérateur *</span>
          <select
            value={operator}
            onChange={e => setOperator(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-[#0f0f16] px-3 py-2 text-sm text-white outline-none focus:border-white/30"
          >
            <option value="">— Choisir —</option>
            {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-white/50">Zone / Quartier</span>
          <input
            value={zone}
            onChange={e => setZone(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            placeholder="Gombe, Kinshasa"
          />
        </label>
        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-white/50">Notes (optionnel)</span>
          <input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            placeholder="Carrefour Limete, en face du Total"
          />
        </label>
        <label className="mb-5 block">
          <span className="mb-1 block text-xs text-white/50">Commission (%)</span>
          <input
            type="number"
            min="1"
            max="20"
            value={rate}
            onChange={e => setRate(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
          />
        </label>
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 rounded-lg bg-gold py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Création…' : 'Créer'}
          </button>
          <button type="button" onClick={onClose} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 hover:bg-white/5">
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}

export default function AgentsTab() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [drawerAgentId, setDrawerAgentId] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    adminApi.agentsList()
      .then(r => setAgents(r.agents))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function toggleStatus(agent: Agent) {
    const next = agent.status === 'active' ? 'suspended' : 'active';
    try {
      setToggling(agent.id);
      const updated = await adminApi.agentUpdate(agent.id, { status: next });
      setAgents(prev => prev.map(a => a.id === agent.id ? updated : a));
    } catch {
    } finally {
      setToggling(null);
    }
  }

  if (loading) return <p className="text-sm text-white/40">Chargement…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Agents terrain</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-black hover:opacity-90"
        >
          + Créer agent
        </button>
      </div>

      {agents.length === 0 ? (
        <p className="rounded-xl border border-white/5 bg-white/3 p-8 text-center text-sm text-white/40">
          Aucun agent — créez le premier avec le bouton ci-dessus.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map(agent => {
            const regUrl = `${PLAY_URL}/register?ref=${agent.qr_code}`;
            return (
              <div
                key={agent.id}
                className="flex flex-col gap-3 rounded-xl border border-white/8 bg-white/3 p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-white">{agent.display_name}</p>
                    {agent.zone && <p className="text-xs text-white/40">{agent.zone}</p>}
                    {(agent.phone || agent.operator) && (
                      <p className="mt-1 text-xs text-amber-400/80">
                        {agent.operator ? OPERATOR_LABEL[agent.operator] ?? agent.operator : ''}
                        {agent.phone && agent.operator ? ' · ' : ''}
                        {agent.phone ?? ''}
                      </p>
                    )}
                    {agent.notes && <p className="mt-0.5 text-xs text-white/30 italic">{agent.notes}</p>}
                  </div>
                  <StatusBadge status={agent.status} />
                </div>

                <div className="flex items-center gap-3">
                  <img
                    src={qrImgUrl(agent.qr_code, 80)}
                    alt={`QR ${agent.qr_code}`}
                    className="rounded-lg border border-white/10"
                    width={80}
                    height={80}
                  />
                  <div className="min-w-0 flex-1 text-xs">
                    <p className="font-mono text-gold tracking-wider">{agent.qr_code}</p>
                    <p className="mt-0.5 text-white/40 break-all">{regUrl}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-white/5 p-2">
                    <p className="text-white/40">Total gagné</p>
                    <p className="font-semibold text-emerald-400">{fmtCdf(agent.total_earned_cdf)}</p>
                  </div>
                  <div className="rounded-lg bg-white/5 p-2">
                    <p className="text-white/40">Commission</p>
                    <p className="font-semibold text-white">{(Number(agent.commission_rate) * 100).toFixed(0)} %</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setDrawerAgentId(agent.id)}
                    className="flex-1 rounded-lg border border-white/10 py-1.5 text-xs text-white/70 hover:bg-white/5"
                  >
                    Commissions
                  </button>
                  <a
                    href={qrImgUrl(agent.qr_code, 400)}
                    download={`qr-${agent.qr_code}.png`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5"
                  >
                    ↓ QR
                  </a>
                  <button
                    disabled={toggling === agent.id}
                    onClick={() => toggleStatus(agent)}
                    className={`rounded-lg border px-3 py-1.5 text-xs disabled:opacity-40 ${
                      agent.status === 'active'
                        ? 'border-red-800 text-red-400 hover:bg-red-900/20'
                        : 'border-emerald-800 text-emerald-400 hover:bg-emerald-900/20'
                    }`}
                  >
                    {toggling === agent.id ? '…' : agent.status === 'active' ? 'Suspendre' : 'Activer'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateAgentModal
          onCreated={agent => { setAgents(prev => [agent, ...prev]); setShowCreate(false); }}
          onClose={() => setShowCreate(false)}
        />
      )}
      {drawerAgentId && (
        <CommissionsDrawer agentId={drawerAgentId} onClose={() => setDrawerAgentId(null)} />
      )}
    </div>
  );
}
