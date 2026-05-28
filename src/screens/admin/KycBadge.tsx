// Small pill rendering the per-user KYC status used in the players list and
// detail drawer. Kept colocated with the admin tabs since it's only used here.

export type KycStatusValue = 'pending' | 'approved' | 'denied' | 'verify_age';

const COPY: Record<KycStatusValue, { label: string; cls: string }> = {
  approved: {
    label: 'KYC ✓',
    cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  },
  pending: {
    label: 'KYC en attente',
    cls: 'border-white/10 bg-white/5 text-white/60',
  },
  denied: {
    label: 'Bloqué mineur',
    cls: 'border-red-500/40 bg-red-500/10 text-red-300',
  },
  verify_age: {
    label: 'À vérifier',
    cls: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  },
};

export default function KycBadge({ status }: { status?: KycStatusValue | null }) {
  const s = (status || 'pending') as KycStatusValue;
  const { label, cls } = COPY[s] || COPY.pending;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cls}`}
    >
      {label}
    </span>
  );
}
