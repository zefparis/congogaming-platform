import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) || 'https://api.congogaming.com';
const PLAY_URL = (import.meta.env.VITE_PLAY_URL as string | undefined) || 'https://www.congogaming.com';

function fmtCdf(n: number) {
  return new Intl.NumberFormat('fr-FR').format(n) + ' CDF';
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

const OPERATOR_LABEL: Record<string, string> = {
  orange:   'Orange Money',
  vodacom:  'Vodacom M-Pesa',
  airtel:   'Airtel Money',
  africell: 'Africell Money',
};

const TIERS = {
  bronze:  { label: 'BRONZE',   color: '#CD7F32', next: 500000,  perks: '50 CDF / ticket' },
  silver:  { label: 'SILVER',   color: '#C0C0C0', next: 1000000, perks: '50 CDF / ticket + badge' },
  gold:    { label: 'VIP GOLD', color: '#F5A623', next: 5000000, perks: '50 CDF / ticket + 2% sur gains' },
  diamond: { label: 'DIAMOND',  color: '#00BFFF', next: null,   perks: '50 CDF / ticket + 3% sur gains + paiement prioritaire' },
} as const;

const TYPE_LABEL: Record<string, string> = {
  okapi_color: 'Okapi Color',
  flash:       'Flash',
  scratch:     'Grattage',
  okapi:       'Okapi Climb',
};

interface AgentData {
  agent: {
    display_name: string;
    qr_code: string;
    zone: string | null;
    total_earned_cdf: number;
    phone: string | null;
    operator: string | null;
    notes: string | null;
    min_payout_cdf: number;
    payout_requested_at: string | null;
    payout_requested_amount_cdf: number | null;
  };
  today_earned_cdf: number;
  pending_cdf: number;
  tier: string;
  next_tier_cdf: number | null;
  recent: {
    ticket_type: string;
    ticket_amount_cdf: number;
    commission_cdf: number;
    status: 'pending' | 'paid';
    created_at: string;
  }[];
}

export default function AgentDashboard() {
  const { qrCode } = useParams<{ qrCode: string }>();
  const [data, setData] = useState<AgentData | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [payoutMsg, setPayoutMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleRequestPayout() {
    if (!qrCode || requesting) return;
    try {
      setRequesting(true);
      setPayoutMsg(null);
      const res = await fetch(`${BASE_URL}/api/agents/${qrCode.toUpperCase()}/request-payout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.code === 'BELOW_MINIMUM') {
          setPayoutMsg({ ok: false, text: `Minimum non atteint (${json.minimum?.toLocaleString('fr-FR')} CDF requis)` });
        } else if (json.code === 'ALREADY_REQUESTED') {
          setPayoutMsg({ ok: false, text: 'Demande déjà envoyée, réessayez dans 24h.' });
        } else {
          setPayoutMsg({ ok: false, text: 'Erreur, réessayez.' });
        }
        return;
      }
      setPayoutMsg({ ok: true, text: `Demande envoyée — ${json.amount?.toLocaleString('fr-FR')} CDF` });
      setData(d => d ? { ...d, agent: { ...d.agent, payout_requested_at: new Date().toISOString(), payout_requested_amount_cdf: json.amount } } : d);
    } finally {
      setRequesting(false);
    }
  }

  useEffect(() => {
    if (!qrCode) { setError(true); setLoading(false); return; }
    fetch(`${BASE_URL}/api/agents/${qrCode.toUpperCase()}`, { cache: 'no-store' })
      .then(async r => {
        if (!r.ok) throw new Error('not found');
        return r.json() as Promise<AgentData>;
      })
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [qrCode]);

  const regUrl = `${PLAY_URL}/register?ref=${qrCode?.toUpperCase()}`;
  const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(regUrl)}`;

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', background: '#04080f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff60', fontFamily: 'sans-serif' }}>
        Chargement…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: '100dvh', background: '#04080f', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: '#ffffff60', fontFamily: 'sans-serif', padding: 24 }}>
        <p style={{ fontSize: 48 }}>🔍</p>
        <p style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>Agent introuvable</p>
        <p style={{ fontSize: 14 }}>Code QR invalide ou agent suspendu.</p>
      </div>
    );
  }

  const { agent, today_earned_cdf, pending_cdf, tier, next_tier_cdf, recent } = data;
  const tierInfo = TIERS[tier as keyof typeof TIERS] ?? TIERS.bronze;
  const totalEarned = Number(agent.total_earned_cdf);

  return (
    <div style={{ minHeight: '100dvh', background: '#04080f', color: '#fff', fontFamily: 'system-ui, sans-serif', padding: '24px 16px', maxWidth: 480, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 16, textAlign: 'center' }}>
        <p style={{ fontSize: 11, letterSpacing: 4, color: '#ffffff40', textTransform: 'uppercase', marginBottom: 4 }}>CONGO GAMING · AGENT</p>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>{agent.display_name}</h1>
        {agent.zone && <p style={{ fontSize: 13, color: '#ffffff60', marginTop: 4 }}>{agent.zone}</p>}
        <div style={{ marginTop: 10 }}>
          <span style={{ background: tierInfo.color, color: '#000', borderRadius: 20, padding: '4px 16px', fontWeight: 900, fontSize: 13, letterSpacing: 1, display: 'inline-block' }}>
            ⭐ {tierInfo.label}
          </span>
        </div>
        <p style={{ fontSize: 12, color: '#888', marginTop: 6 }}>{tierInfo.perks}</p>
        {next_tier_cdf && (
          <div style={{ marginTop: 8, padding: '0 16px' }}>
            <div style={{ background: '#222', borderRadius: 8, height: 6 }}>
              <div style={{ width: `${Math.min(100, (totalEarned / next_tier_cdf) * 100)}%`, background: tierInfo.color, height: 6, borderRadius: 8, transition: 'width 0.3s' }} />
            </div>
            <p style={{ fontSize: 11, color: '#555', textAlign: 'center', marginTop: 4 }}>
              {totalEarned.toLocaleString('fr-FR')} / {next_tier_cdf.toLocaleString('fr-FR')} CDF
              {' — prochain niveau : '}{Object.keys(TIERS)[(Object.keys(TIERS).indexOf(tier) + 1)]?.toUpperCase()}
            </p>
          </div>
        )}
      </div>

      {/* QR code */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <img src={qrImgUrl} alt="QR Code" width={200} height={200} style={{ borderRadius: 8 }} />
        <p style={{ color: '#04080f', fontWeight: 700, letterSpacing: 3, fontFamily: 'monospace', fontSize: 18 }}>{qrCode?.toUpperCase()}</p>
        <p style={{ color: '#04080f80', fontSize: 11, textAlign: 'center', wordBreak: 'break-all' }}>{regUrl}</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 24 }}>
        {([
          { label: "Aujourd'hui", value: fmtCdf(today_earned_cdf), color: '#34d399' },
          { label: 'En attente', value: fmtCdf(pending_cdf), color: '#fbbf24' },
          { label: 'Total gagné', value: fmtCdf(Number(agent.total_earned_cdf)), color: '#fff' },
        ] as const).map(s => (
          <div key={s.label} style={{ background: '#ffffff08', borderRadius: 10, padding: '12px 10px', textAlign: 'center', border: '1px solid #ffffff10' }}>
            <p style={{ fontSize: 10, color: '#ffffff50', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: s.color, lineHeight: 1.2 }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Recent commissions */}
      <h2 style={{ fontSize: 14, fontWeight: 600, color: '#ffffff80', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 2 }}>
        Dernières commissions
      </h2>
      {recent.length === 0 ? (
        <p style={{ color: '#ffffff30', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Aucune commission encore</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {recent.map((c, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff06', borderRadius: 8, padding: '10px 12px', border: '1px solid #ffffff08' }}>
              <div>
                <p style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{TYPE_LABEL[c.ticket_type] ?? c.ticket_type}</p>
                <p style={{ fontSize: 11, color: '#ffffff40' }}>{fmtDate(c.created_at)}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#34d399' }}>+{fmtCdf(Number(c.commission_cdf))}</p>
                <p style={{ fontSize: 11, color: c.status === 'paid' ? '#ffffff30' : '#fbbf24' }}>
                  {c.status === 'paid' ? 'Payé' : 'En attente'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {(() => {
        const basePayout       = Number(agent.min_payout_cdf ?? 2000);
        const minPayout        = tier === 'diamond' ? Math.min(1000, basePayout) : basePayout;
        const canRequest       = pending_cdf >= minPayout;
        const alreadyRequested = !!agent.payout_requested_at;
        return (
          <div style={{ marginTop: 24 }}>
            {/* Trust message */}
            <div style={{
              background: '#1a1a1a', border: '1px solid #2a2a2a',
              borderRadius: 12, padding: '12px 16px', marginBottom: 12,
              fontSize: 13, color: '#888', textAlign: 'center',
            }}>
              🔒 Vos commissions sont sécurisées sur Congo Gaming.<br />
              <span style={{ color: '#F5A623' }}>Laissez accumuler et retirez quand vous voulez.</span>
            </div>

            {/* Progress bar */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ background: '#222', borderRadius: 8, height: 8 }}>
                <div style={{
                  width: `${Math.min(100, (pending_cdf / minPayout) * 100)}%`,
                  background: canRequest ? '#F5A623' : '#555',
                  height: 8, borderRadius: 8, transition: 'width 0.3s',
                }} />
              </div>
              <p style={{ fontSize: 12, color: '#666', textAlign: 'center', marginTop: 4 }}>
                {pending_cdf.toLocaleString('fr-FR')} / {minPayout.toLocaleString('fr-FR')} CDF minimum
              </p>
            </div>

            {payoutMsg && (
              <p style={{ fontSize: 13, marginBottom: 12, color: payoutMsg.ok ? '#34d399' : '#f87171', textAlign: 'center' }}>
                {payoutMsg.text}
              </p>
            )}

            {/* Payout button */}
            {alreadyRequested && !payoutMsg ? (
              <div style={{ color: '#F5A623', textAlign: 'center', padding: 12, fontSize: 13 }}>
                ✅ Demande envoyée — paiement en cours via {agent.operator} · {agent.phone}
              </div>
            ) : (
              <button
                disabled={!canRequest || requesting}
                onClick={handleRequestPayout}
                style={{
                  background: canRequest ? '#F5A623' : '#333',
                  color: canRequest ? '#000' : '#666',
                  width: '100%', padding: '14px', borderRadius: 12,
                  fontWeight: 700, border: 'none', fontSize: 14,
                  cursor: canRequest ? 'pointer' : 'default',
                  opacity: requesting ? 0.6 : 1,
                }}
              >
                {requesting
                  ? 'Envoi en cours…'
                  : canRequest
                    ? `💳 Retirer ${pending_cdf.toLocaleString('fr-FR')} CDF`
                    : `Encore ${(minPayout - pending_cdf).toLocaleString('fr-FR')} CDF pour débloquer le retrait`}
              </button>
            )}

            {/* Disclaimer */}
            <div style={{
              fontSize: 11, color: '#555', textAlign: 'center',
              padding: '12px 16px', lineHeight: 1.6, marginTop: 8,
            }}>
              Vous gagnez 50 CDF sur chaque ticket joué par vos clients sur<br />
              Okapi Color, Flash Loto et Scratch.<br />
              Les commissions sont actives tant que vos clients jouent sur Congo Gaming.<br />
              Congo Gaming se réserve le droit de modifier les conditions avec préavis de 30 jours.
            </div>
          </div>
        );
      })()}

      <p style={{ marginTop: 32, textAlign: 'center', fontSize: 11, color: '#ffffff20', letterSpacing: 2, textTransform: 'uppercase' }}>
        Congo Gaming · Réseau Agent
      </p>
    </div>
  );
}
