/**
 * scripts/remediate-benji.mjs
 * One-shot production remediation for duplicate-prediction SERVER_ERROR.
 * Executes steps 1–4 and prints step 5 SQL to run in Supabase SQL editor.
 *
 * Usage (PowerShell):
 *   $env:SUPABASE_URL="https://xxx.supabase.co"
 *   $env:SUPABASE_SERVICE_KEY="eyJ..."
 *   node scripts/remediate-benji.mjs
 *
 * CAUTION: writes to production. Read every output block before next step.
 */

import { createClient } from '@supabase/supabase-js';

const USER_ID = '5e01e767-f859-43f3-99a6-efb4d1644eaf';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.error('[FATAL] Set SUPABASE_URL and SUPABASE_SERVICE_KEY before running.');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

function sep(title) {
  console.log('\n' + '═'.repeat(64));
  console.log('  ' + title);
  console.log('═'.repeat(64));
}

function abort(msg) {
  console.error('\n[ABORT] ' + msg);
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────
// STEP 1 — Snapshot
// ─────────────────────────────────────────────────────────────────
sep('STEP 1 — Snapshot before touching anything');

const { data: preds, error: predErr } = await sb
  .from('predictions')
  .select('id, match_id, points_wagered, created_at')
  .eq('user_id', USER_ID)
  .eq('status', 'pending')
  .order('match_id')
  .order('created_at');

if (predErr) {
  if (predErr.code === '42P01') {
    abort(`predictions table does NOT exist in production (42P01).\nRun 20260702_predictions.sql migration first.`);
  }
  abort(`Step 1 SELECT failed — ${predErr.code}: ${predErr.message}`);
}

if (!preds || preds.length === 0) {
  console.log('\n[INFO] No pending predictions for this user. Nothing to do.\n');
  process.exit(0);
}

const totalRefund = preds.reduce((sum, p) => sum + Number(p.points_wagered), 0);

console.log('\nPending predictions:');
console.table(
  preds.map((p) => ({
    id:             p.id,
    match_id:       p.match_id,
    points_wagered: p.points_wagered,
    created_at:     p.created_at,
  })),
);
console.log(`\n  Total rows:      ${preds.length}`);
console.log(`  SUM(wagered):    ${totalRefund} CDF  ← exact refund amount`);

// Check for duplicates (same match_id appearing twice → root cause of maybeSingle() error)
const matchCounts = new Map();
for (const p of preds) matchCounts.set(p.match_id, (matchCounts.get(p.match_id) ?? 0) + 1);
const dupes = [...matchCounts.entries()].filter(([, c]) => c > 1);
if (dupes.length > 0) {
  console.log(`\n  [ROOT CAUSE CONFIRMED] Duplicate rows found for match_id(s): ${dupes.map(([m]) => m).join(', ')}`);
  console.log('  → maybeSingle() on these matches returns PGRST116 → SERVER_ERROR in handler');
} else {
  console.log('\n  [INFO] No duplicate match_ids for this user (duplicates may be across different users, or table is missing).');
}

// ─────────────────────────────────────────────────────────────────
// STEP 2 — Cancel all pending predictions
// ─────────────────────────────────────────────────────────────────
sep('STEP 2 — Cancel all pending predictions for this user');

const { data: cancelled, error: cancelErr } = await sb
  .from('predictions')
  .update({ status: 'cancelled', updated_at: new Date().toISOString() })
  .eq('user_id', USER_ID)
  .eq('status', 'pending')
  .select('id, match_id');

if (cancelErr) abort(`Step 2 UPDATE failed — ${cancelErr.code}: ${cancelErr.message}`);

console.log(`\n  Rows cancelled: ${cancelled?.length ?? 0}`);
cancelled?.forEach((r) => console.log(`    • ${r.id}  match_id=${r.match_id}`));

// Verify zero remaining pending
const { data: remaining, error: remErr } = await sb
  .from('predictions')
  .select('id')
  .eq('user_id', USER_ID)
  .eq('status', 'pending');

if (remErr) abort(`Step 2 verification SELECT failed — ${remErr.message}`);
if ((remaining?.length ?? 0) > 0) abort(`${remaining.length} pending predictions still remain. Manual investigation needed.`);

console.log('\n  [OK] Zero pending predictions remain for this user.');

// ─────────────────────────────────────────────────────────────────
// STEP 3 — Refund balance via adjust_balance RPC
// ─────────────────────────────────────────────────────────────────
sep('STEP 3 — Refund balance');

const { data: userRow, error: userErr } = await sb
  .from('users')
  .select('balance_cdf, phone')
  .eq('id', USER_ID)
  .single();

if (userErr) abort(`Could not read user row — ${userErr.code}: ${userErr.message}`);

const balanceBefore = Number(userRow.balance_cdf);
console.log(`\n  User phone:      ${userRow.phone ?? '(no phone)'}`);
console.log(`  Balance BEFORE:  ${balanceBefore} CDF`);
console.log(`  Crediting:       +${totalRefund} CDF`);

const { data: balanceAfter, error: rpcErr } = await sb.rpc('adjust_balance', {
  p_user_id: USER_ID,
  p_delta:   totalRefund,
});

if (rpcErr) abort(`adjust_balance RPC failed — ${rpcErr.code}: ${rpcErr.message}`);

const newBalance = Number(balanceAfter);
console.log(`  Balance AFTER:   ${newBalance} CDF`);

const expected = balanceBefore + totalRefund;
if (newBalance !== expected) {
  console.warn(`\n  [WARN] Expected ${expected}, got ${newBalance}. Possible concurrent credit.`);
} else {
  console.log('\n  [OK] Balance delta matches refund amount exactly.');
}

// ─────────────────────────────────────────────────────────────────
// STEP 4 — Verify zero duplicates (this user scope)
// ─────────────────────────────────────────────────────────────────
sep('STEP 4 — Verify zero duplicates remain (active statuses)');

const { data: activePreds, error: activeErr } = await sb
  .from('predictions')
  .select('match_id')
  .eq('user_id', USER_ID)
  .in('status', ['pending', 'won', 'lost']);

if (activeErr) abort(`Step 4 query failed — ${activeErr.message}`);

const activeCounts = new Map();
for (const p of activePreds ?? []) {
  activeCounts.set(p.match_id, (activeCounts.get(p.match_id) ?? 0) + 1);
}
const activeDupes = [...activeCounts.entries()].filter(([, c]) => c > 1);

if (activeDupes.length > 0) {
  abort(`Duplicates still present: ${JSON.stringify(activeDupes)}. Do not apply index — investigate first.`);
}

console.log('\n  [OK] No duplicate active predictions for this user.');
console.log('\n  ┌─ Also run this in Supabase SQL editor (global cross-user check):');
console.log("  │  SELECT user_id, match_id, COUNT(*)");
console.log("  │  FROM predictions");
console.log("  │  WHERE status IN ('pending', 'won', 'lost')");
console.log("  │  GROUP BY user_id, match_id");
console.log("  │  HAVING COUNT(*) > 1;");
console.log('  └─ Must return 0 rows before applying the index.');

// ─────────────────────────────────────────────────────────────────
// STEP 5 — Print DDL to run in Supabase SQL editor
// ─────────────────────────────────────────────────────────────────
sep('STEP 5 — Apply unique index (manual — DDL not executable via REST API)');

console.log('\n  Run in Supabase SQL editor:');
console.log('  ┌─────────────────────────────────────────────────────────');
console.log("  │  CREATE UNIQUE INDEX IF NOT EXISTS unique_user_match_active_bet");
console.log("  │  ON predictions (user_id, match_id)");
console.log("  │  WHERE status IN ('pending', 'won', 'lost');");
console.log('  └─────────────────────────────────────────────────────────');
console.log('\n  Then confirm with:');
console.log("  │  SELECT indexname FROM pg_indexes");
console.log("  │  WHERE tablename = 'predictions'");
console.log("  │  AND indexname = 'unique_user_match_active_bet';");
console.log('  └─ Must return 1 row.\n');

sep('COMPLETE');
console.log('  Steps 1–4 executed successfully.');
console.log('  Step 5 SQL printed above — paste it into Supabase SQL editor.');
console.log('  After step 5 is confirmed, have Benji retry the bet from the app.\n');
