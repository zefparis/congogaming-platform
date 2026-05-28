import { ArrowDownToLine, ArrowUpFromLine, Clock, CheckCircle2, XCircle, Ticket, Trophy } from 'lucide-react';

export type TransactionType = 'deposit' | 'withdrawal' | 'loto_ticket' | 'loto_payout';

type Props = {
  type: TransactionType;
  amount: number;
  status: number;
  date: string;
};

const STATUS_LABEL: Record<number, { label: string; color: string; icon: any }> = {
  0: { label: 'En attente', color: 'text-yellow-400', icon: Clock },
  1: { label: 'En cours', color: 'text-yellow-400', icon: Clock },
  2: { label: 'Réussi', color: 'text-congogreen', icon: CheckCircle2 },
  3: { label: 'Échoué', color: 'text-red-500', icon: XCircle },
};

const TYPE_META: Record<TransactionType, { label: string; icon: any; isCredit: boolean; tone: string }> = {
  deposit:     { label: 'Dépôt',          icon: ArrowDownToLine, isCredit: true,  tone: 'congogreen' },
  withdrawal:  { label: 'Retrait',        icon: ArrowUpFromLine, isCredit: false, tone: 'gold' },
  loto_ticket: { label: 'Ticket Loto',    icon: Ticket,          isCredit: false, tone: 'gold' },
  loto_payout: { label: 'Gain Loto',      icon: Trophy,          isCredit: true,  tone: 'congogreen' },
};

export default function TransactionItem({ type, amount, status, date }: Props) {
  const meta = TYPE_META[type] || TYPE_META.deposit;
  const Icon = meta.icon;
  const s = STATUS_LABEL[status] || STATUS_LABEL[0];
  const SIcon = s.icon;
  const colorClass = meta.tone === 'congogreen' ? 'text-congogreen' : 'text-gold';
  const bgClass = meta.tone === 'congogreen' ? 'bg-congogreen/20 text-congogreen' : 'bg-gold/20 text-gold';
  return (
    <div className="flex items-center gap-3 p-3 bg-zinc-900/70 rounded-xl border border-zinc-800">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${bgClass}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1">
        <div className="font-semibold text-sm">{meta.label}</div>
        <div className="text-xs text-zinc-400">{new Date(date).toLocaleString('fr-FR')}</div>
      </div>
      <div className="text-right">
        <div className={`font-display text-xl ${colorClass}`}>
          {meta.isCredit ? '+' : '-'}{amount.toLocaleString('fr-FR')}
        </div>
        <div className={`text-[11px] flex items-center gap-1 justify-end ${s.color}`}>
          <SIcon className="w-3 h-3" /> {s.label}
        </div>
      </div>
    </div>
  );
}
