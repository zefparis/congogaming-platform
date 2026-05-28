/**
 * ╔══════════════════════════════════════════════════════╗
 * ║         CONGO GAMING — AUDIT PRÉ-PRODUCTION         ║
 * ║         node audit.mjs (depuis la racine)           ║
 * ╚══════════════════════════════════════════════════════╝
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// ─── Couleurs terminal ───────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  white: '\x1b[97m',
};

let passed = 0;
let failed = 0;
let warnings = 0;

function ok(label, detail = '') {
  passed++;
  console.log(`  ${C.green}✔${C.reset} ${label}${detail ? C.gray + '  ' + detail + C.reset : ''}`);
}
function fail(label, detail = '') {
  failed++;
  console.log(`  ${C.red}✘${C.reset} ${C.bold}${label}${C.reset}${detail ? C.red + '  → ' + detail + C.reset : ''}`);
}
function warn(label, detail = '') {
  warnings++;
  console.log(`  ${C.yellow}⚠${C.reset} ${label}${detail ? C.gray + '  ' + detail + C.reset : ''}`);
}
function section(title) {
  console.log(`\n${C.cyan}${C.bold}▸ ${title}${C.reset}`);
  console.log(`${C.gray}${'─'.repeat(50)}${C.reset}`);
}
function header() {
  console.log(`\n${C.cyan}${'═'.repeat(54)}${C.reset}`);
  console.log(`${C.cyan}${C.bold}   CONGO GAMING — AUDIT PRÉ-PRODUCTION${C.reset}`);
  console.log(`${C.cyan}${'═'.repeat(54)}${C.reset}`);
}
function summary() {
  console.log(`\n${C.cyan}${'═'.repeat(54)}${C.reset}`);
  console.log(`${C.bold}  RÉSULTAT FINAL${C.reset}`);
  console.log(`${C.cyan}${'═'.repeat(54)}${C.reset}`);
  console.log(`  ${C.green}✔ ${passed} vérifications OK${C.reset}`);
  if (warnings > 0) console.log(`  ${C.yellow}⚠ ${warnings} avertissements${C.reset}`);
  if (failed > 0) {
    console.log(`  ${C.red}✘ ${failed} erreurs critiques${C.reset}`);
    console.log(`\n  ${C.red}${C.bold}❌ NE PAS DÉPLOYER — corriger les erreurs ci-dessus${C.reset}`);
  } else {
    console.log(`\n  ${C.green}${C.bold}✅ PRÊT POUR LA PRODUCTION${C.reset}`);
  }
  console.log(`${C.cyan}${'═'.repeat(54)}${C.reset}\n`);
}

// ─── Charge .env manuellement ───────────────────────────────
function loadEnv() {
  const envPath = resolve('.env');
  if (!existsSync(envPath)) return {};
  const env = {};
  const lines = readFileSync(envPath, 'utf-8')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (key) env[key] = val;
  }
  return env;
}

// ─── MAIN ────────────────────────────────────────────────────
async function run() {
  header();
  const env = loadEnv();

  // ══════════════════════════════════════════════════════════
  // 1. VARIABLES D'ENVIRONNEMENT
  // ══════════════════════════════════════════════════════════
  section('1. VARIABLES D\'ENVIRONNEMENT');

  const requiredVars = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_KEY',
    'UNIPESA_PUBLIC_ID',
    'UNIPESA_SECRET_KEY',
    'UNIPESA_MERCHANT_ID',
    'UNIPESA_CALLBACK_URL',
    'LOTO_ADMIN_SECRET',
    'LOTO_JACKPOT_CDF',
    'FLASH_JACKPOT_CDF',
    'FLASH_ADMIN_SECRET',
  ];
  const optionalVars = [
    'PORT',
    'HOST',
    'LOTO_MIN_TICKETS',
    'FLASH_MIN_TICKETS',
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
  ];

  for (const v of requiredVars) {
    const val = env[v] || process.env[v];
    if (!val) fail(v, 'MANQUANT — requis pour le fonctionnement');
    else ok(v, val.length > 20 ? val.slice(0, 12) + '…' : val);
  }
  for (const v of optionalVars) {
    const val = env[v] || process.env[v];
    if (!val) warn(v, 'optionnel — non défini');
    else ok(v, val);
  }

  // ══════════════════════════════════════════════════════════
  // 2. FICHIERS CRITIQUES
  // ══════════════════════════════════════════════════════════
  section('2. FICHIERS CRITIQUES');

  const files = [
    ['server/index.ts', 'Point d\'entrée backend'],
    ['server/cron.ts', 'Planificateur cron'],
    ['server/lib/supabase.ts', 'Client Supabase'],
    ['server/routes/loto.ts', 'Routes Loto Congo'],
    ['server/routes/flash.ts', 'Routes Loto Flash'],
    ['server/routes/deposit.ts', 'Routes dépôt'],
    ['server/routes/withdraw.ts', 'Routes retrait'],
    ['server/routes/callback.ts', 'Callback AvadaPay'],
    ['server/routes/transactions.ts', 'Historique transactions'],
    ['src/screens/LotoScreen.tsx', 'Screen Loto'],
    ['src/screens/FlashScreen.tsx', 'Screen Flash'],
    ['src/screens/HomeScreen.tsx', 'Screen Home'],
    ['src/components/BottomNav.tsx', 'Navigation bas'],
    ['src/lib/api.ts', 'Client API frontend'],
    ['src/App.tsx', 'Router principal'],
    ['supabase/schema.sql', 'Schema base de données'],
    ['vercel.json', 'Config déploiement Vercel'],
    ['.env', 'Variables d\'environnement'],
  ];

  for (const [path, label] of files) {
    if (existsSync(resolve(path))) ok(label, path);
    else fail(label, `${path} introuvable`);
  }

  // ══════════════════════════════════════════════════════════
  // 3. COHÉRENCE server/index.ts
  // ══════════════════════════════════════════════════════════
  section('3. COHÉRENCE server/index.ts');

  if (existsSync(resolve('server/index.ts'))) {
    const content = readFileSync(resolve('server/index.ts'), 'utf-8');
    const checks = [
      ['import lotoRoutes', 'Import module Loto'],
      ['import flashRoutes', 'Import module Flash'],
      ['import.*startCrons|startFlashCron', 'Import cron planificateur'],
      ['app\\.register\\(lotoRoutes\\)', 'Enregistrement routes Loto'],
      ['app\\.register\\(flashRoutes\\)', 'Enregistrement routes Flash'],
      ['startCrons|startFlashCron', 'Démarrage cron après listen'],
      ['/health', 'Route healthcheck'],
    ];
    for (const [pattern, label] of checks) {
      if (new RegExp(pattern).test(content)) ok(label);
      else fail(label, `Pattern "${pattern}" absent de server/index.ts`);
    }
  }

  // ══════════════════════════════════════════════════════════
  // 4. COHÉRENCE server/cron.ts
  // ══════════════════════════════════════════════════════════
  section('4. CRON — TIRAGES AUTOMATIQUES');

  if (existsSync(resolve('server/cron.ts'))) {
    const content = readFileSync(resolve('server/cron.ts'), 'utf-8');
    const checks = [
      ['0,30 \\* \\* \\* \\*', 'Cron Flash toutes les 30 min'],
      ['0 20 \\* \\* \\*', 'Cron Loto quotidien 20h00'],
      ['Africa/Kinshasa', 'Timezone Kinshasa'],
      ['executerTirageFlash', 'Appel fonction tirage Flash'],
      ['executerTirageLoto', 'Appel fonction tirage Loto'],
    ];
    for (const [pattern, label] of checks) {
      if (new RegExp(pattern).test(content)) ok(label);
      else fail(label, `Pattern "${pattern}" absent de server/cron.ts`);
    }
  } else {
    fail('server/cron.ts', 'Fichier manquant — les tirages automatiques ne fonctionneront pas');
  }

  // ══════════════════════════════════════════════════════════
  // 5. COHÉRENCE ROUTES LOTO
  // ══════════════════════════════════════════════════════════
  section('5. ROUTES LOTO CONGO (6/49 — 2000 CDF)');

  if (existsSync(resolve('server/routes/loto.ts'))) {
    const content = readFileSync(resolve('server/routes/loto.ts'), 'utf-8');
    const checks = [
      ['/api/loto/tirage/latest', 'GET /api/loto/tirage/latest'],
      ['/api/loto/mes-tickets', 'GET /api/loto/mes-tickets'],
      ['/api/loto/ticket', 'POST /api/loto/ticket'],
      ['/api/loto/tirage', 'POST /api/loto/tirage (admin)'],
      ['2000', 'Prix ticket 2000 CDF'],
      ['increment_jackpot', 'RPC increment_jackpot'],
      ['jackpot_attente', 'Statut jackpot_attente'],
      ['executerTirageLoto', 'Fonction exportée tirage Loto'],
      ['loto_jackpot', 'Table loto_jackpot'],
      ['LOTO_JACKPOT_CDF', 'Variable env seuil jackpot'],
      ["'status',\\s*'jackpot_attente'[\\s\\S]*?'jackpot_en_attente',\\s*true", 'Résolution jackpots en attente'],
      ['x-admin-secret', 'Protection admin header'],
      ['crypto', 'RNG cryptographique'],
    ];
    for (const [pattern, label] of checks) {
      if (new RegExp(pattern).test(content)) ok(label);
      else fail(label, `Pattern "${pattern}" absent`);
    }
  }

  // ══════════════════════════════════════════════════════════
  // 6. COHÉRENCE ROUTES FLASH
  // ══════════════════════════════════════════════════════════
  section('6. ROUTES LOTO FLASH (5/20 — 500 CDF)');

  if (existsSync(resolve('server/routes/flash.ts'))) {
    const content = readFileSync(resolve('server/routes/flash.ts'), 'utf-8');
    const checks = [
      ['/api/flash/tirage/latest', 'GET /api/flash/tirage/latest'],
      ['/api/flash/mes-tickets', 'GET /api/flash/mes-tickets'],
      ['/api/flash/ticket', 'POST /api/flash/ticket'],
      ['/api/flash/tirage', 'POST /api/flash/tirage (admin)'],
      ['500', 'Prix ticket 500 CDF'],
      ['250', 'Contribution jackpot 250 CDF'],
      ['increment_flash_jackpot', 'RPC increment_flash_jackpot'],
      ['executerTirageFlash', 'Fonction exportée tirage Flash'],
      ['flash_jackpot', 'Table flash_jackpot'],
      ['FLASH_JACKPOT_CDF', 'Variable env seuil Flash'],
      ['jackpot_en_attente', 'Gestion jackpot en attente'],
    ];
    for (const [pattern, label] of checks) {
      if (new RegExp(pattern).test(content)) ok(label);
      else fail(label, `Pattern "${pattern}" absent`);
    }
  }

  // ══════════════════════════════════════════════════════════
  // 7. COHÉRENCE FRONTEND
  // ══════════════════════════════════════════════════════════
  section('7. FRONTEND — ROUTES & NAVIGATION');

  if (existsSync(resolve('src/App.tsx'))) {
    const content = readFileSync(resolve('src/App.tsx'), 'utf-8');
    const checks = [
      ['LotoScreen', 'Import LotoScreen'],
      ['FlashScreen', 'Import FlashScreen'],
      ['/loto', 'Route /loto'],
      ['/flash', 'Route /flash'],
    ];
    for (const [pattern, label] of checks) {
      if (new RegExp(pattern).test(content)) ok(label);
      else fail(label, `Pattern "${pattern}" absent de App.tsx`);
    }
  }

  if (existsSync(resolve('src/components/BottomNav.tsx'))) {
    const content = readFileSync(resolve('src/components/BottomNav.tsx'), 'utf-8');
    const checks = [
      ['/loto', 'Onglet Loto dans BottomNav'],
      ['/flash', 'Onglet Flash dans BottomNav'],
      ['grid-cols-4|grid-cols-5|grid-cols-6', 'Grid navigation'],
    ];
    for (const [pattern, label] of checks) {
      if (new RegExp(pattern).test(content)) ok(label);
      else fail(label, `Pattern "${pattern}" absent de BottomNav.tsx`);
    }
  }

  if (existsSync(resolve('src/lib/api.ts'))) {
    const content = readFileSync(resolve('src/lib/api.ts'), 'utf-8');
    const checks = [
      ['lotoTicket', 'Méthode lotoTicket'],
      ['lotoLatest', 'Méthode lotoLatest'],
      ['lotoMesTickets', 'Méthode lotoMesTickets'],
      ['flashTicket', 'Méthode flashTicket'],
      ['flashLatest', 'Méthode flashLatest'],
      ['flashMesTickets', 'Méthode flashMesTickets'],
    ];
    for (const [pattern, label] of checks) {
      if (new RegExp(pattern).test(content)) ok(label);
      else fail(label, `Pattern "${pattern}" absent de api.ts`);
    }
  }

  // ══════════════════════════════════════════════════════════
  // 8. SCHEMA SUPABASE
  // ══════════════════════════════════════════════════════════
  section('8. SCHEMA SUPABASE (schema.sql)');

  if (existsSync(resolve('supabase/schema.sql'))) {
    const content = readFileSync(resolve('supabase/schema.sql'), 'utf-8');
    const tables = [
      ['public.users', 'Table users'],
      ['public.transactions', 'Table transactions'],
      ['public.loto_tirages', 'Table loto_tirages'],
      ['public.loto_tickets', 'Table loto_tickets'],
      ['public.loto_jackpot', 'Table loto_jackpot (singleton)'],
      ['public.flash_tirages', 'Table flash_tirages'],
      ['public.flash_tickets', 'Table flash_tickets'],
      ['public.flash_jackpot', 'Table flash_jackpot (singleton)'],
      ['increment_jackpot', 'RPC increment_jackpot'],
      ['increment_flash_jackpot', 'RPC increment_flash_jackpot'],
      ['adjust_balance', 'RPC adjust_balance'],
      ['jackpot_en_attente', 'Colonne jackpot_en_attente'],
    ];
    for (const [pattern, label] of tables) {
      if (new RegExp(pattern).test(content)) ok(label);
      else fail(label, `"${pattern}" absent du schema.sql`);
    }
  }

  // ══════════════════════════════════════════════════════════
  // 9. CONNEXION SUPABASE LIVE
  // ══════════════════════════════════════════════════════════
  section('9. CONNEXION SUPABASE (test live)');

  const supaUrl = env.SUPABASE_URL || process.env.SUPABASE_URL;
  const supaKey = env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!supaUrl || !supaKey) {
    fail('Connexion Supabase', 'SUPABASE_URL ou SUPABASE_SERVICE_KEY manquant');
  } else {
    const supabase = createClient(supaUrl, supaKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const tablesToCheck = [
      'users',
      'transactions',
      'loto_tirages',
      'loto_tickets',
      'loto_jackpot',
      'flash_tirages',
      'flash_tickets',
      'flash_jackpot',
    ];

    for (const table of tablesToCheck) {
      try {
        const { error } = await supabase.from(table).select('*', { count: 'exact', head: true });
        if (error) fail(`Table ${table}`, error.message);
        else ok(`Table ${table}`, 'accessible');
      } catch (e) {
        fail(`Table ${table}`, String(e));
      }
    }

    // Test RPC adjust_balance
    try {
      const { error } = await supabase.rpc('adjust_balance', {
        p_user_id: '00000000-0000-0000-0000-000000000000',
        p_delta: 0
      });
      if (error && error.code !== 'PGRST116' && !error.message.includes('not found')) {
        warn('RPC adjust_balance', 'Réponse inattendue: ' + error.message);
      } else {
        ok('RPC adjust_balance', 'fonction présente');
      }
    } catch (e) {
      warn('RPC adjust_balance', 'Test impossible: ' + String(e));
    }

    // Test RPC increment_jackpot
    try {
      const { error } = await supabase.rpc('increment_jackpot', { delta: 0 });
      if (error) fail('RPC increment_jackpot', error.message);
      else ok('RPC increment_jackpot', 'fonction présente');
    } catch (e) {
      fail('RPC increment_jackpot', String(e));
    }

    // Test RPC increment_flash_jackpot
    try {
      const { error } = await supabase.rpc('increment_flash_jackpot', { delta: 0 });
      if (error) fail('RPC increment_flash_jackpot', error.message);
      else ok('RPC increment_flash_jackpot', 'fonction présente');
    } catch (e) {
      fail('RPC increment_flash_jackpot', String(e));
    }

    // Test pot jackpot loto
    try {
      const { data, error } = await supabase.from('loto_jackpot').select('pot_cdf').eq('id', 1).single();
      if (error) fail('Singleton loto_jackpot (id=1)', error.message);
      else ok('Singleton loto_jackpot', `pot_cdf = ${data?.pot_cdf} CDF`);
    } catch (e) {
      fail('Singleton loto_jackpot', String(e));
    }

    // Test pot jackpot flash
    try {
      const { data, error } = await supabase.from('flash_jackpot').select('pot_cdf').eq('id', 1).single();
      if (error) fail('Singleton flash_jackpot (id=1)', error.message);
      else ok('Singleton flash_jackpot', `pot_cdf = ${data?.pot_cdf} CDF`);
    } catch (e) {
      fail('Singleton flash_jackpot', String(e));
    }

    // Test user count
    try {
      const { count, error } = await supabase.from('users').select('*', { count: 'exact', head: true });
      if (error) warn('Comptage users', error.message);
      else ok('Users en base', `${count} utilisateur(s)`);
    } catch (e) {
      warn('Comptage users', String(e));
    }
  }

  // ══════════════════════════════════════════════════════════
  // 10. BACKEND HEALTH CHECK
  // ══════════════════════════════════════════════════════════
  section('10. BACKEND HEALTH CHECK');

  const backendUrl = env.VITE_API_URL || process.env.VITE_API_URL || 'http://localhost:3001';
  const baseUrl = backendUrl.replace(/\/api$/, '');

  const endpoints = [
    ['GET', `${baseUrl}/health`, null, 'Healthcheck backend'],
    ['GET', `${baseUrl}/api/loto/tirage/latest`, null, 'GET /api/loto/tirage/latest'],
    ['GET', `${baseUrl}/api/flash/tirage/latest`, null, 'GET /api/flash/tirage/latest'],
  ];

  for (const [method, url, body, label] of endpoints) {
    try {
      const opts = { method, headers: { 'Content-Type': 'application/json' } };
      if (body) opts.body = JSON.stringify(body);
      const res = await Promise.race([
        fetch(url, opts),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))
      ]);
      if (res.status < 500) ok(label, `HTTP ${res.status}`);
      else fail(label, `HTTP ${res.status}`);
    } catch (e) {
      if (String(e).includes('timeout')) warn(label, 'timeout 5s — backend non joignable localement');
      else warn(label, 'Non joignable en local (normal si test hors serveur)');
    }
  }

  // ══════════════════════════════════════════════════════════
  // 11. PACKAGE.JSON — DÉPENDANCES
  // ══════════════════════════════════════════════════════════
  section('11. DÉPENDANCES NODE');

  if (existsSync(resolve('package.json'))) {
    const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf-8'));
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    const deps = [
      ['@supabase/supabase-js', 'Client Supabase'],
      ['fastify', 'Framework backend Fastify'],
      ['node-cron', 'Planificateur cron'],
      ['react', 'React frontend'],
      ['react-router-dom', 'Router React'],
      ['framer-motion', 'Animations'],
      ['lucide-react', 'Icônes'],
      ['dotenv', 'Variables d\'environnement'],
    ];
    for (const [pkg, label] of deps) {
      if (all[pkg]) ok(label, all[pkg]);
      else fail(label, `${pkg} absent du package.json`);
    }

    if (!existsSync(resolve('node_modules'))) {
      fail('node_modules', 'npm install jamais lancé !');
    } else {
      ok('node_modules', 'présent');
    }
  }

  summary();
}

run().catch(err => {
  console.error(`\n${C.red}Erreur fatale audit:${C.reset}`, err);
  process.exit(1);
});
