/**
 * Unipesa reconciliation worker.
 *
 * Background safety net that resolves transactions left in PENDING
 * (status 1) by the resilient deposit/withdraw flows when the
 * provider call timed out or the circuit breaker tripped.
 *
 * Concurrency hardening:
 *   1. Worker-level lock (`worker_locks` table, TTL 2 min) so only one
 *      reconciliation tick runs at a time across the whole fleet.
 *   2. Row-level claim via the `claim_pending_unipesa_transactions`
 *      RPC, which uses SELECT ... FOR UPDATE SKIP LOCKED + a stamp
 *      on `reconcile_attempted_at`. Even if the worker lock somehow
 *      fails, two ticks can never grab the same row.
 *   3. Idempotency keys on every ledger entry are the final guard:
 *      a callback and a reconciliation tick racing on the same order
 *      cannot produce a double credit/debit.
 *
 * Inbound callbacks remain authoritative — this worker only resolves
 * orders that callbacks failed to deliver.
 */

import { paymentStatus } from './unipesa.js';
import { recordLedgerEntry } from './ledger.js';
import { supabaseAdmin } from './supabase.js';

const WORKER_NAME = 'unipesa_reconciliation';
const LOCK_TTL_SECONDS = 120;

const BATCH_SIZE = 50;
// Do not touch transactions younger than this — the request handler
// might still be writing the final status, and the inbound callback
// might still be in flight.
const MIN_AGE_SECONDS = 90;
// Cooldown before a row that we already attempted can be retried
// (covers crashes after RPC claim but before status resolution).
const RETRY_AFTER_SECONDS = 90;
// Stop reconciling rows older than this — they are likely lost
// causes and we do not want to keep paging Unipesa for them forever.
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

type PendingTx = {
  id: string;
  user_id: string;
  order_id: string;
  type: 'deposit' | 'withdrawal' | string;
  amount: number;
  currency: string | null;
  status: number;
  transaction_id: string | null;
  created_at: string;
};

type Logger = {
  info: (obj: any, msg?: string) => void;
  warn: (obj: any, msg?: string) => void;
  error: (obj: any, msg?: string) => void;
};

const consoleLogger: Logger = {
  info: (obj, msg) => console.log('[unipesa-reconcile]', msg || '', obj),
  warn: (obj, msg) => console.warn('[unipesa-reconcile]', msg || '', obj),
  error: (obj, msg) => console.error('[unipesa-reconcile]', msg || '', obj),
};

async function tryAcquireLock(log: Logger): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('try_acquire_worker_lock', {
    p_worker_name: WORKER_NAME,
    p_ttl_seconds: LOCK_TTL_SECONDS,
  });
  if (error) {
    log.error({ event: 'reconciliation_lock_error', err: error.message }, 'lock RPC failed');
    return false;
  }
  return data === true;
}

async function releaseLock(log: Logger): Promise<void> {
  const { error } = await supabaseAdmin.rpc('release_worker_lock', {
    p_worker_name: WORKER_NAME,
  });
  if (error) {
    log.warn({ event: 'reconciliation_unlock_error', err: error.message }, 'unlock RPC failed');
  }
}

async function logTooOldPending(log: Logger): Promise<void> {
  const cutoff = new Date(Date.now() - MAX_AGE_SECONDS * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('transactions')
    .select('id, order_id, type, amount, created_at')
    .eq('status', 1)
    .lt('created_at', cutoff)
    .limit(20);
  if (error) {
    log.warn({ event: 'reconciliation_age_probe_failed', err: error.message });
    return;
  }
  if (!data || data.length === 0) return;
  for (const row of data) {
    log.warn(
      {
        event: 'transaction_too_old_for_reconcile',
        orderId: (row as any).order_id,
        transactionId: (row as any).id,
        type: (row as any).type,
        amount: (row as any).amount,
        createdAt: (row as any).created_at,
      },
      'pending transaction past max age — manual investigation required',
    );
  }
}

async function reconcileOne(tx: PendingTx, log: Logger): Promise<void> {
  const start = Date.now();
  let resp;
  try {
    resp = await paymentStatus(tx.order_id);
  } catch (err) {
    log.warn(
      {
        event: 'transaction_reconciliation_failed',
        orderId: tx.order_id,
        transactionId: tx.id,
        type: tx.type,
        amount: tx.amount,
        latencyMs: Date.now() - start,
        errorCode: (err as any)?.code || (err as Error)?.message,
      },
      'reconciliation status check failed (will retry next tick)',
    );
    return;
  }

  const latencyMs = Date.now() - start;
  const remoteStatus = Number(resp?.status ?? NaN);
  const remoteTxId = resp?.transaction_id ? String(resp.transaction_id) : tx.transaction_id;

  if (!Number.isFinite(remoteStatus) || remoteStatus === 1 || remoteStatus === 0) {
    log.info(
      {
        event: 'transaction_still_pending',
        orderId: tx.order_id,
        transactionId: tx.id,
        type: tx.type,
        amount: tx.amount,
        providerStatus: remoteStatus,
        latencyMs,
      },
      'still pending upstream',
    );
    return;
  }

  // Definitive deposit success → credit (idempotent via ledger key).
  if (remoteStatus === 2 && tx.type === 'deposit') {
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('transactions')
      .update({ status: 2, transaction_id: remoteTxId })
      .eq('order_id', tx.order_id)
      .neq('status', 2)
      .select('id');
    if (updateErr) {
      log.error(
        {
          event: 'transaction_reconciliation_failed',
          orderId: tx.order_id,
          transactionId: tx.id,
          type: tx.type,
          providerStatus: remoteStatus,
          latencyMs,
          errorCode: updateErr.message,
        },
        'reconcile deposit update failed',
      );
      return;
    }
    if ((updated?.length ?? 0) > 0) {
      try {
        await recordLedgerEntry({
          user_id: tx.user_id,
          direction: 'credit',
          amount: Number(tx.amount),
          currency: String(tx.currency || 'CDF'),
          reason: 'payment_deposit_success',
          reference_type: 'transaction',
          reference_id: tx.order_id,
          idempotency_key: `payment:deposit:${tx.order_id}:success`,
        });
        log.info(
          {
            event: 'transaction_reconciled',
            orderId: tx.order_id,
            transactionId: tx.id,
            type: tx.type,
            amount: tx.amount,
            providerStatus: remoteStatus,
            latencyMs,
          },
          'reconciled deposit → credited',
        );
      } catch (err) {
        log.error(
          {
            event: 'transaction_reconciliation_failed',
            orderId: tx.order_id,
            transactionId: tx.id,
            type: tx.type,
            providerStatus: remoteStatus,
            latencyMs,
            errorCode: (err as Error)?.message,
          },
          'reconcile deposit credit failed',
        );
      }
    }
    return;
  }

  // Definitive withdrawal failure → refund (idempotent via ledger key).
  if (remoteStatus === 3 && tx.type === 'withdrawal') {
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('transactions')
      .update({ status: 3, transaction_id: remoteTxId })
      .eq('order_id', tx.order_id)
      .not('status', 'in', '(2,3)')
      .select('id');
    if (updateErr) {
      log.error(
        {
          event: 'transaction_reconciliation_failed',
          orderId: tx.order_id,
          transactionId: tx.id,
          type: tx.type,
          providerStatus: remoteStatus,
          latencyMs,
          errorCode: updateErr.message,
        },
        'reconcile withdrawal update failed',
      );
      return;
    }
    if ((updated?.length ?? 0) > 0) {
      try {
        await recordLedgerEntry({
          user_id: tx.user_id,
          direction: 'credit',
          amount: Number(tx.amount),
          currency: String(tx.currency || 'CDF'),
          reason: 'payment_withdrawal_refund',
          reference_type: 'transaction',
          reference_id: tx.order_id,
          idempotency_key: `payment:withdrawal:${tx.order_id}:refund`,
        });
        log.info(
          {
            event: 'transaction_reconciled',
            orderId: tx.order_id,
            transactionId: tx.id,
            type: tx.type,
            amount: tx.amount,
            providerStatus: remoteStatus,
            latencyMs,
          },
          'reconciled withdrawal failure → refunded',
        );
      } catch (err) {
        log.error(
          {
            event: 'transaction_reconciliation_failed',
            orderId: tx.order_id,
            transactionId: tx.id,
            type: tx.type,
            providerStatus: remoteStatus,
            latencyMs,
            errorCode: (err as Error)?.message,
          },
          'reconcile withdrawal refund failed',
        );
      }
    }
    return;
  }

  // Other terminal states (e.g. deposit failed, withdrawal succeeded).
  // No balance side effect needed:
  //   - failed deposit: nothing was ever credited
  //   - successful withdrawal: the debit happened at request time
  await supabaseAdmin
    .from('transactions')
    .update({ status: remoteStatus, transaction_id: remoteTxId })
    .eq('order_id', tx.order_id)
    .neq('status', remoteStatus);
  log.info(
    {
      event: 'transaction_reconciled',
      orderId: tx.order_id,
      transactionId: tx.id,
      type: tx.type,
      amount: tx.amount,
      providerStatus: remoteStatus,
      latencyMs,
    },
    'reconciled terminal status',
  );
}

export async function runReconciliationTick(log: Logger = consoleLogger): Promise<void> {
  const tickStart = Date.now();

  const acquired = await tryAcquireLock(log);
  if (!acquired) {
    log.info(
      { event: 'reconciliation_skipped_lock_held', worker: WORKER_NAME },
      'reconciliation skipped: lock already held',
    );
    return;
  }

  log.info({ event: 'reconciliation_started', worker: WORKER_NAME }, 'reconciliation tick started');

  try {
    // Surface stale-pending transactions so admins see them in logs;
    // the claim RPC will not pull them in (older than max_age).
    await logTooOldPending(log);

    const { data: rows, error } = await supabaseAdmin.rpc(
      'claim_pending_unipesa_transactions',
      {
        p_min_age_seconds: MIN_AGE_SECONDS,
        p_max_age_seconds: MAX_AGE_SECONDS,
        p_batch_size: BATCH_SIZE,
        p_retry_after_seconds: RETRY_AFTER_SECONDS,
      },
    );

    if (error) {
      log.error(
        { event: 'reconciliation_claim_failed', err: error.message },
        'claim RPC failed',
      );
      return;
    }

    const claimed = (rows as PendingTx[] | null) ?? [];
    if (claimed.length === 0) {
      log.info(
        { event: 'reconciliation_completed', claimed: 0, latencyMs: Date.now() - tickStart },
        'reconciliation tick complete (no work)',
      );
      return;
    }

    let succeeded = 0;
    let failed = 0;
    for (const tx of claimed) {
      try {
        await reconcileOne(tx, log);
        succeeded += 1;
      } catch (err) {
        failed += 1;
        log.error(
          {
            event: 'transaction_reconciliation_failed',
            orderId: tx.order_id,
            transactionId: tx.id,
            errorCode: (err as Error)?.message,
          },
          'reconcile_one threw',
        );
      }
    }

    log.info(
      {
        event: 'reconciliation_completed',
        claimed: claimed.length,
        succeeded,
        failed,
        latencyMs: Date.now() - tickStart,
      },
      'reconciliation tick complete',
    );
  } finally {
    await releaseLock(log);
  }
}

export function startReconciliationLoop(intervalMs = 60_000, log: Logger = consoleLogger): void {
  // Stagger the first tick so we do not pile work on top of boot-time
  // recovery jobs.
  setTimeout(() => {
    void runReconciliationTick(log).catch((err) =>
      log.error({ event: 'reconciliation_tick_crashed', err: (err as Error)?.message }),
    );
  }, 30_000).unref();

  setInterval(() => {
    void runReconciliationTick(log).catch((err) =>
      log.error({ event: 'reconciliation_tick_crashed', err: (err as Error)?.message }),
    );
  }, intervalMs).unref();

  log.info({ event: 'reconciliation_loop_started', intervalMs }, 'unipesa reconciliation loop started');
}
