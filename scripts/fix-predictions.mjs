/**
 * scripts/fix-predictions.mjs — loads .env automatically, runs steps 1-3-4-5.
 * Balance refund intentionally skipped (test account).
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

// Load .env manually (handles CRLF on Windows)
const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, '..', '.env');
for (const line of readFileSync(envPath, 'utf8').replace(/\r/g, '').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('[FATAL] SUPABASE_URL / SUPABASE_SERVICE_KEY missing from .env'); process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const USER_ID = '5e01e767-f859-43f3-99a6-efb4d1644eaf';

function sep(t) { console.log('\n' + '═'.repeat(62) + '\n  ' + t + '\n' + '═'.repeat(62)); }
function fail(msg) { console.error('\n[ABORT] ' + msg); process.exit(1); }

// ── STEP 1 — Snapshot then cancel ───────────────────────────────
sep('STEP 1 — Snapshot + cancel pending for test user');

const { data: before, error: e1 } = await sb
  .from('predictions')
  .select('id, match_id, points_wagered, created_at')
  .eq('user_id', USER_ID)
  .eq('status', 'pending')
  .order('match_id').order('created_at');

if (e1) fail(`SELECT failed — code=${e1.code}  msg=${e1.message}`);

if (!before || before.length === 0) {
  console.log('  No pending predictions for this user.');
} else {
  console.log(`  Pending rows: ${before.length}   SUM(wagered): ${before.reduce((s,p)=>s+Number(p.points_wagered),0)} CDF`);
  console.table(before.map(p=>({ id: p.id.slice(0,8)+'…', match_id: p.match_id, points_wagered: p.points_wagered, created_at: p.created_at })));

  // Detect duplicates (root cause)
  const mc = new Map();
  for (const p of before) mc.set(p.match_id, (mc.get(p.match_id)??0)+1);
  const dupes = [...mc.entries()].filter(([,c])=>c>1);
  if (dupes.length) console.log(`  [ROOT CAUSE] Duplicate match_id(s): ${dupes.map(([m])=>m).join(', ')} → maybeSingle() → PGRST116 → SERVER_ERROR`);

  // Cancel
  const { data: cancelled, error: e2 } = await sb
    .from('predictions')
    .update({ status: 'cancelled' })
    .eq('user_id', USER_ID)
    .eq('status', 'pending')
    .select('id');

  if (e2) fail(`UPDATE failed — ${e2.code}: ${e2.message}`);
  console.log(`\n  Cancelled: ${cancelled?.length ?? 0} row(s)`);
}

// Verify zero pending remain
const { data: rem } = await sb.from('predictions').select('id').eq('user_id', USER_ID).eq('status', 'pending');
if ((rem?.length ?? 0) > 0) fail(`${rem.length} pending predictions still present — manual check needed`);
console.log('  [OK] Zero pending predictions for this user.');

// ── STEP 3 — Global duplicate check (all users) ─────────────────
sep('STEP 3 — Global duplicate check (all users, active statuses)');

const { data: allActive, error: e3 } = await sb
  .from('predictions')
  .select('user_id, match_id')
  .in('status', ['pending', 'won', 'lost']);

if (e3) fail(`Global fetch failed — ${e3.code}: ${e3.message}`);

console.log(`  Total active predictions fetched: ${allActive?.length ?? 0}`);

const globalMap = new Map();
for (const p of allActive ?? []) {
  const k = `${p.user_id}|${p.match_id}`;
  globalMap.set(k, (globalMap.get(k)??0)+1);
}
const globalDupes = [...globalMap.entries()].filter(([,c])=>c>1);

if (globalDupes.length > 0) {
  console.log(`  [FAIL] ${globalDupes.length} duplicate pair(s) found — DO NOT apply index yet:`);
  for (const [k, c] of globalDupes) {
    const [uid, mid] = k.split('|');
    console.log(`    user_id=${uid}  match_id=${mid}  count=${c}`);
  }
  fail('Resolve remaining duplicates before applying the unique index.');
} else {
  console.log('  [OK] Zero duplicate (user_id, match_id) pairs across all users.');
}

// ── STEPS 4 & 5 — DDL (must run in Supabase SQL editor) ─────────
sep('STEPS 4 & 5 — DDL (Supabase JS client cannot execute DDL — paste below into SQL editor)');

console.log(`
  ┌─ STEP 4: Create unique index ───────────────────────────────────
  │  CREATE UNIQUE INDEX IF NOT EXISTS unique_user_match_active_bet
  │  ON predictions (user_id, match_id)
  │  WHERE status IN ('pending', 'won', 'lost');
  └─────────────────────────────────────────────────────────────────

  ┌─ STEP 5: Verify index created ──────────────────────────────────
  │  SELECT indexname FROM pg_indexes
  │  WHERE tablename = 'predictions'
  │    AND indexname = 'unique_user_match_active_bet';
  │
  │  Expected: 1 row returned.
  └─────────────────────────────────────────────────────────────────

  Supabase SQL editor: https://supabase.com/dashboard/project/kqpiapefovhisqghxyvg/editor
`);

sep('DONE');
console.log('  Steps 1 + 3 complete. Paste steps 4-5 SQL into Supabase SQL editor.');
console.log('  After index confirmed: have Benji retry the bet from the app.\n');
