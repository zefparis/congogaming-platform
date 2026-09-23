import { useEffect, useState } from 'react';
import { adminApi, Agent, AgentCommission } from '../../lib/adminApi';
import { fmtCdf, fmtDateTime } from './format';
import QrImage, { useQrDataUrl } from '../../components/QrImage';

const PLAY_URL = (import.meta.env.VITE_PLAY_URL as string | undefined) || 'https://www.congogaming.com';

function regUrlFor(qrCode: string): string {
  return `${PLAY_URL}/register?ref=${qrCode}`;
}

function QrDownload({ qrCode }: { qrCode: string }) {
  const url = useQrDataUrl(regUrlFor(qrCode), 400);
  if (!url) return null;
  return (
    <a
      href={url}
      download={`qr-${qrCode}.png`}
      className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5"
    >
      ↓ QR
    </a>
  );
}

function getTierColor(total: number): string {
  if (total >= 5000000) return '#00BFFF';
  if (total >= 1000000) return '#F5A623';
  return '#CD7F32';
}

function getTierLabel(total: number): string {
  if (total >= 5000000) return 'DIAMOND';
  if (total >= 1000000) return 'VIP GOLD';
  return 'STANDARD';
}

function StatusBadge({ status }: { status: string }) {
  const active = status === 'active';
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${active ? 'bg-emerald-900/60 text-emerald-300' : 'bg-red-900/60 text-red-300'}`}>
      {active ? 'Actif' : 'Suspendu'}
    </span>
  );
}

function CommissionsDrawer({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const [rows, setRows] = useState<AgentCommission[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [msg, setMsg] = useState('');
  const [payError, setPayError] = useState('');

  const agentId = agent.id;
  const requestedAt = agent.payout_requested_at ? new Date(agent.payout_requested_at).getTime() : null;

  // Seules les commissions pending créées AVANT la demande de payout sont
  // éligibles — les suivantes restent pending pour le cycle suivant.
  const eligibleRows = rows.filter(c =>
    c.status === 'pending' && requestedAt !== null && new Date(c.created_at).getTime() < requestedAt,
  );
  const eligibleTotal = eligibleRows.reduce((s, c) => s + Number(c.commission_cdf), 0);
  const eligibleIds = new Set(eligibleRows.map(c => c.id));

  const [payAmount, setPayAmount] = useState('');
  const [payOperator, setPayOperator] = useState(agent.operator ?? '');
  const [payReference, setPayReference] = useState('');

  useEffect(() => {
    adminApi.agentCommissions(agentId)
      .then(r => setRows(r.commissions))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [agentId]);

  useEffect(() => {
    if (eligibleTotal > 0 && !payAmount) setPayAmount(String(eligibleTotal));
  }, [eligibleTotal, payAmount]);

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (paying) return;
    setPayError('');
    const amount = Number(payAmount);
    if (!Number.isInteger(amount) || amount <= 0) { setPayError('Montant invalide'); return; }
    if (!payOperator) { setPayError('Opérateur requis'); return; }
    if (payReference.trim().length < 3) { setPayError('Référence de transaction requise (min 3 caractères)'); return; }
    try {
      setPaying(true);
      const res = await adminApi.agentPay(agentId, {
        amount_cdf: amount,
        operator: payOperator,
        reference: payReference.trim(),
      });
      setRows(prev => prev.map(c =>
        eligibleIds.has(c.id) ? { ...c, status: 'paid' as const, payout_id: res.payout_id } : c,
      ));
      setMsg(`✓ Paiement enregistré — ${fmtCdf(res.paid_cdf)} (${res.paid_count} commissions)`);
      setPayAmount('');
      setPayReference('');
    } catch (e: any) {
      setPayError(e?.message || 'Erreur');
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
          <h3 className="text-lg font-semibold text-white">Commissions — {agent.display_name}</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white/80">✕</button>
        </div>

        {/* Payout form — requires an active payout request from the agent.
            Only commissions created BEFORE payout_requested_at are eligible. */}
        {requestedAt === null ? (
          <p className="mb-4 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/50">
            Aucune demande de paiement active de la part de cet agent.
          </p>
        ) : (
          <form onSubmit={handlePay} className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="mb-2 text-xs text-amber-300">
              Paiement demandé le {fmtDateTime(agent.payout_requested_at!)} — éligible : <b>{fmtCdf(eligibleTotal)}</b>
              {pending > eligibleTotal && (
                <span className="text-white/40"> ({fmtCdf(pending - eligibleTotal)} postérieur à la demande restera en attente)</span>
              )}
            </p>
            <div className="grid grid-cols-3 gap-2">
              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-wider text-white/40">Montant (CDF)</span>
                <input
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value.replace(/\D/g, ''))}
                  inputMode="numeric"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white outline-none focus:border-white/30"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-wider text-white/40">Opérateur</span>
                <select
                  value={payOperator}
                  onChange={e => setPayOperator(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#0f0f16] px-2 py-1.5 text-sm text-white outline-none focus:border-white/30"
                >
                  <option value="">—</option>
                  {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-wider text-white/40">Référence transaction</span>
                <input
                  value={payReference}
                  onChange={e => setPayReference(e.target.value)}
                  placeholder="Ex: MP240923..."
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white outline-none focus:border-white/30"
                />
              </label>
            </div>
            {payError && <p className="mt-2 text-xs text-red-400">{payError}</p>}
            <button
              type="submit"
              disabled={paying || eligibleTotal <= 0}
              className="mt-3 rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {paying ? '...' : `Confirmer le paiement (${fmtCdf(eligibleTotal)})`}
            </button>
          </form>
        )}
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
                  <th className="py-2 text-center">Cycle</th>
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
                    <td className="py-1.5 text-center text-[10px]">
                      {c.status === 'paid' ? (
                        <span className="text-white/30">—</span>
                      ) : eligibleIds.has(c.id) ? (
                        <span className="text-emerald-400">éligible</span>
                      ) : (
                        <span className="text-white/30">prochain cycle</span>
                      )}
                    </td>
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
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim())     { setErr('Nom requis');       return; }
    if (!phone.trim())    { setErr('Téléphone requis');  return; }
    if (!operator)        { setErr('Opérateur requis');  return; }
    if (pin && !/^\d{4,6}$/.test(pin)) { setErr('PIN doit être 4-6 chiffres'); return; }
    try {
      setLoading(true);
      const agent = await adminApi.agentCreate({
        display_name:    name.trim(),
        zone:            zone.trim() || undefined,
        commission_rate: Number(rate) / 100,
        phone:           phone.trim(),
        operator,
        notes:           notes.trim() || undefined,
        pin:             pin || undefined,
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
        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-white/50">PIN agent (4-6 chiffres, optionnel)</span>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            placeholder="••••"
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

function EditAgentModal({ agent, onUpdated, onClose }: { agent: Agent; onUpdated: (a: Agent) => void; onClose: () => void }) {
  const [zone, setZone] = useState(agent.zone ?? '');
  const [rate, setRate] = useState(String(Math.round(Number(agent.commission_rate) * 100)));
  const [phone, setPhone] = useState(agent.phone ?? '');
  const [operator, setOperator] = useState(agent.operator ?? '');
  const [notes, setNotes] = useState(agent.notes ?? '');
  const [status, setStatus] = useState<'active' | 'suspended'>(agent.status);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) { setErr('Téléphone requis'); return; }
    if (!operator)    { setErr('Opérateur requis'); return; }
    if (pin && !/^\d{4,6}$/.test(pin)) { setErr('PIN doit être 4-6 chiffres'); return; }
    try {
      setLoading(true);
      const updated = await adminApi.agentUpdate(agent.id, {
        status,
        zone:            zone.trim()  || undefined,
        commission_rate: Number(rate) / 100,
        phone:           phone.trim(),
        operator,
        notes:           notes.trim() || undefined,
        pin:             pin || undefined,
      });
      onUpdated(updated);
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
        <h3 className="mb-4 text-lg font-semibold text-white">Modifier — {agent.display_name}</h3>
        {err && <p className="mb-3 text-sm text-red-400">{err}</p>}

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
          <span className="mb-1 block text-xs text-white/50">Notes</span>
          <input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            placeholder="Carrefour Limete, en face du Total"
          />
        </label>

        <label className="mb-3 block">
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

        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-white/50">Statut</span>
          <select
            value={status}
            onChange={e => setStatus(e.target.value as 'active' | 'suspended')}
            className="w-full rounded-lg border border-white/10 bg-[#0f0f16] px-3 py-2 text-sm text-white outline-none focus:border-white/30"
          >
            <option value="active">Actif</option>
            <option value="suspended">Suspendu</option>
          </select>
        </label>

        <label className="mb-5 block">
          <span className="mb-1 block text-xs text-white/50">Réinitialiser PIN (4-6 chiffres, vide = inchangé)</span>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            placeholder="••••"
          />
        </label>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 rounded-lg bg-gold py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Enregistrement…' : 'Enregistrer'}
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
  const [drawerAgent, setDrawerAgent] = useState<Agent | null>(null);
  const [editAgent, setEditAgent] = useState<Agent | null>(null);

  useEffect(() => {
    adminApi.agentsList()
      .then(r => setAgents(r.agents))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
            const regUrl = regUrlFor(agent.qr_code);
            return (
              <div
                key={agent.id}
                className="flex flex-col gap-3 rounded-xl border border-white/8 bg-white/3 p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-white">{agent.display_name}</p>
                    <span style={{ background: getTierColor(Number(agent.total_earned_cdf)), color: '#000', borderRadius: 12, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
                      {getTierLabel(Number(agent.total_earned_cdf))}
                    </span>
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

                {agent.payout_requested_at && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 px-2.5 py-1.5 text-xs font-bold text-amber-400">
                    <span>💳</span>
                    <span>Paiement demandé — {(agent.payout_requested_amount_cdf ?? 0).toLocaleString('fr-FR')} CDF</span>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <QrImage
                    value={regUrl}
                    size={80}
                    alt={`QR ${agent.qr_code}`}
                    className="rounded-lg border border-white/10"
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
                    onClick={() => setDrawerAgent(agent)}
                    className="flex-1 rounded-lg border border-white/10 py-1.5 text-xs text-white/70 hover:bg-white/5"
                  >
                    Commissions
                  </button>
                  <QrDownload qrCode={agent.qr_code} />
                  <button
                    onClick={() => setEditAgent(agent)}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5"
                  >
                    ✎ Éditer
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
      {editAgent && (
        <EditAgentModal
          agent={editAgent}
          onUpdated={updated => { setAgents(prev => prev.map(a => a.id === updated.id ? updated : a)); setEditAgent(null); }}
          onClose={() => setEditAgent(null)}
        />
      )}
      {drawerAgent && (
        <CommissionsDrawer agent={drawerAgent} onClose={() => setDrawerAgent(null)} />
      )}
    </div>
  );
}
