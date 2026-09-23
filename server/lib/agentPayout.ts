// Agent payout eligibility — pure helpers, no DB/env imports so they are
// directly unit-testable. The authoritative check also runs inside the
// `pay_agent_commissions_atomic` RPC (SELECT FOR UPDATE) — these helpers
// let the route pre-validate and return precise errors.

export interface PendingCommissionRow {
  id: string;
  commission_cdf: number;
  created_at: string;
}

export interface EligibleCommissions {
  ids: string[];
  total: number;
}

/**
 * A commission is eligible for payout only if it is still `pending` AND was
 * created strictly BEFORE the agent's payout request (payout_requested_at).
 * Commissions created after the request stay pending for the next cycle.
 */
export function computeEligibleCommissions(
  pendingRows: PendingCommissionRow[],
  payoutRequestedAt: string | null | undefined,
): EligibleCommissions {
  if (!payoutRequestedAt) return { ids: [], total: 0 };
  const cutoff = new Date(payoutRequestedAt).getTime();
  if (!Number.isFinite(cutoff)) return { ids: [], total: 0 };

  const ids: string[] = [];
  let total = 0;
  for (const row of pendingRows) {
    const created = new Date(row.created_at).getTime();
    if (!Number.isFinite(created) || created >= cutoff) continue;
    ids.push(String(row.id));
    total += Number(row.commission_cdf) || 0;
  }
  return { ids, total };
}

/**
 * The amount entered by the admin must match the eligible total exactly —
 * no partial payment, no overpayment.
 */
export function validatePayoutAmount(
  amountCdf: number,
  expectedCdf: number,
): { ok: boolean; expected: number } {
  const ok = Number.isInteger(amountCdf) && amountCdf > 0 && amountCdf === expectedCdf;
  return { ok, expected: expectedCdf };
}
