/**
 * Diagnostic Unipesa — tests de connectivité et configuration
 *   node scripts/unipesa-diag.mjs
 */
import { createHmac } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  const p = resolve('.env');
  if (!existsSync(p)) return {};
  const env = {};
  for (const line of readFileSync(p, 'utf-8').replace(/\r\n/g, '\n').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

function calculateSignature(data, secretKey) {
  let s = '';
  for (const [k, v] of Object.entries(data)) {
    if (k === 'signature') continue;
    if (v !== null && typeof v === 'object') {
      for (const [kk, vv] of Object.entries(v)) s += `${k}.${kk}${vv}`;
    } else {
      s += `${k}${v}`;
    }
  }
  return createHmac('sha512', secretKey).update(s).digest('hex').toLowerCase();
}

console.log('🔍 Diagnostic Unipesa\n');

const env = { ...loadEnv(), ...process.env };
const PUBLIC_ID = env.UNIPESA_PUBLIC_ID;
const MERCHANT_ID = env.UNIPESA_MERCHANT_ID;
const SECRET = env.UNIPESA_SECRET_KEY;
const CALLBACK = env.UNIPESA_CALLBACK_URL;

// 1. Check env vars
console.log('1️⃣  Variables d\'environnement');
console.log('   UNIPESA_PUBLIC_ID:', PUBLIC_ID ? '✓' : '❌ manquant');
console.log('   UNIPESA_MERCHANT_ID:', MERCHANT_ID ? '✓' : '❌ manquant');
console.log('   UNIPESA_SECRET_KEY:', SECRET ? '✓ (présent)' : '❌ manquant');
console.log('   UNIPESA_CALLBACK_URL:', CALLBACK ? '✓' : '❌ manquant');

if (!PUBLIC_ID || !MERCHANT_ID || !SECRET || !CALLBACK) {
  console.error('\n❌ Configuration incomplète');
  process.exit(1);
}

// 2. Test connectivity to base URL
console.log('\n2️⃣  Test de connectivité API');
const baseUrls = [
  'https://api.unipesa.tech',
  `https://api.unipesa.tech/${PUBLIC_ID}`,
];

for (const url of baseUrls) {
  try {
    const t0 = Date.now();
    const res = await fetch(url, { method: 'GET' });
    console.log(`   ${url} → HTTP ${res.status} (${Date.now() - t0}ms)`);
  } catch (e) {
    console.log(`   ${url} → ❌ ${e.message}`);
  }
}

// 3. Test signature calculation
console.log('\n3️⃣  Test de calcul de signature');
const testPayload = {
  merchant_id: MERCHANT_ID,
  order_id: 'test-order-123',
  amount: 1000,
};
try {
  const sig = calculateSignature(testPayload, SECRET);
  console.log('   ✓ Signature générée:', sig.slice(0, 32) + '…');
} catch (e) {
  console.log('   ❌ Erreur:', e.message);
}

// 4. Test status endpoint (should work even without real order_id)
console.log('\n4️⃣  Test endpoint /status');
const statusPayload = {
  merchant_id: MERCHANT_ID,
  order_id: 'test-order-does-not-exist',
};
statusPayload.signature = calculateSignature(statusPayload, SECRET);

try {
  const url = `https://api.unipesa.tech/${PUBLIC_ID}/status`;
  const t0 = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(statusPayload),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  console.log(`   HTTP ${res.status} (${Date.now() - t0}ms)`);
  console.log('   Réponse:', JSON.stringify(json, null, 2).split('\n').map(l => '   ' + l).join('\n'));
} catch (e) {
  console.log('   ❌ Erreur:', e.message);
}

console.log('\n✅ Diagnostic terminé');
