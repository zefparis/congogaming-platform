/**
 * Test Unipesa /status — lecture seule, ne débite personne.
 *   node scripts/unipesa-status-test.mjs [order_id]
 * Si pas d'order_id passé, en génère un bidon pour valider auth + signature.
 */
import { createHmac, randomUUID } from 'crypto';
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

const env = { ...loadEnv(), ...process.env };
const PUBLIC_ID = env.UNIPESA_PUBLIC_ID;
const MERCHANT_ID = env.UNIPESA_MERCHANT_ID;
const SECRET = env.UNIPESA_SECRET_KEY;

if (!PUBLIC_ID || !MERCHANT_ID || !SECRET) {
  console.error('❌ Manque UNIPESA_PUBLIC_ID / UNIPESA_MERCHANT_ID / UNIPESA_SECRET_KEY dans .env');
  process.exit(1);
}

const order_id = process.argv[2] || `test-${randomUUID()}`;
const payload = { merchant_id: MERCHANT_ID, order_id };
payload.signature = calculateSignature(payload, SECRET);

const url = `https://api.unipesa.tech/${PUBLIC_ID}/status`;

console.log('▸ POST', url);
console.log('▸ payload:', { ...payload, signature: payload.signature.slice(0, 16) + '…' });

const t0 = Date.now();
try {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  console.log(`\nHTTP ${res.status}  (${Date.now() - t0} ms)`);
  console.log(JSON.stringify(json, null, 2));
} catch (e) {
  console.error('\n❌ Échec réseau:', e.message);
  process.exit(2);
}
