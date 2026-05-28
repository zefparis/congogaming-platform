import { supabaseAdmin } from './supabase.js';

export type LedgerDirection = 'credit' | 'debit';

export type RecordLedgerEntryInput = {
  user_id: string;
  direction: LedgerDirection;
  amount: number;
  currency: string;
  reason: string;
  reference_type?: string | null;
  reference_id?: string | null;
  idempotency_key: string;
};

export type RecordLedgerEntryResult = {
  applied: boolean;
  duplicate: boolean;
  balance: number | null;
};

export async function recordLedgerEntry(input: RecordLedgerEntryInput): Promise<RecordLedgerEntryResult> {
  const amount = Math.trunc(input.amount);
  if (amount <= 0) throw new Error('Ledger amount must be positive');

  const { data, error } = await supabaseAdmin.rpc('record_ledger_entry_atomic', {
    p_user_id: input.user_id,
    p_direction: input.direction,
    p_amount: amount,
    p_currency: input.currency,
    p_reason: input.reason,
    p_reference_type: input.reference_type ?? null,
    p_reference_id: input.reference_id ?? null,
    p_idempotency_key: input.idempotency_key,
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  const applied = Boolean(row?.applied);
  return {
    applied,
    duplicate: !applied,
    balance: row?.balance == null ? null : Number(row.balance),
  };
}
