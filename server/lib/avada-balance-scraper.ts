/**
 * Avada Pay balance scraper.
 *
 * Logs in to the Avada backoffice via Playwright/Chromium headless,
 * navigates to the merchant brand balance page, parses the provider
 * balance table, and inserts a snapshot row into `avada_balance_snapshots`.
 *
 * Concurrency: the caller (cron.ts) uses a simple per-process guard
 * (_running flag) to prevent overlapping scrapes.  A full distributed
 * lock is unnecessary because a 15-minute interval is far wider than the
 * expected scrape duration (<30 s on a healthy connection).
 *
 * Env vars required:
 *   AVADA_EMAIL    — backoffice login email
 *   AVADA_PASSWORD — backoffice login password
 */

import { chromium, type Browser } from 'playwright';
import { supabaseAdmin } from './supabase.js';

/* ── Logger type (mirrors unipesa-reconciliation) ───────────────────────── */
export type Logger = {
  info:  (obj: object, msg?: string) => void;
  warn:  (obj: object, msg?: string) => void;
  error: (obj: object, msg?: string) => void;
};

const consoleLogger: Logger = {
  info:  (obj, msg) => console.log ('[avada-scraper]', msg ?? '', obj),
  warn:  (obj, msg) => console.warn ('[avada-scraper]', msg ?? '', obj),
  error: (obj, msg) => console.error('[avada-scraper]', msg ?? '', obj),
};

/* ── Constants ──────────────────────────────────────────────────────────── */
const LOGIN_URL   = 'https://backoffice.avadapay.tech';
const BALANCE_URL = 'https://backoffice.avadapay.tech/merchant_brand/134/balance';

/* ── Helpers ────────────────────────────────────────────────────────────── */
type BalanceRow = { total: number; hold: number; available: number };
const EMPTY: BalanceRow = { total: 0, hold: 0, available: 0 };

/** Extract the first three non-negative numbers from a table-row text string. */
function extractNums(text: string): number[] {
  return [...text.matchAll(/[\d\s,]+(?:\.\d+)?/g)]
    .map(m => parseFloat(m[0].replace(/[\s,]/g, '')))
    .filter(n => !isNaN(n) && n >= 0 && isFinite(n));
}

/**
 * Find the balance row matching any of the given keywords (case-insensitive).
 * Returns EMPTY (all zeros) when no matching row is found.
 */
function findRow(
  rows: { text: string; nums: number[] }[],
  ...keywords: string[]
): BalanceRow {
  const row = rows.find(r =>
    keywords.some(k => r.text.toLowerCase().includes(k.toLowerCase())),
  );
  if (!row || row.nums.length < 3) return EMPTY;
  return { total: row.nums[0], hold: row.nums[1], available: row.nums[2] };
}

/* ── Core scrape function ───────────────────────────────────────────────── */
export async function runAvadaBalanceScrape(log: Logger = consoleLogger): Promise<void> {
  const email    = process.env.AVADA_EMAIL;
  const password = process.env.AVADA_PASSWORD;

  if (!email || !password) {
    log.warn({}, 'AVADA_EMAIL or AVADA_PASSWORD not set — skipping scrape');
    return;
  }

  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    /* ── 1. Login ──────────────────────────────────────────────────────── */
    log.info({}, 'Navigating to Avada login');
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 30_000 });

    await page.screenshot({ path: '/tmp/avada-login.png', fullPage: true });
    const html = await page.content();
    console.log('[avada-scraper] LOGIN PAGE HTML SNIPPET:', html.slice(0, 3000));

    // Selectors are intentionally broad — backoffice may use various frameworks
    await page.fill('input[type="email"], input[name="email"], input[name="login"]', email);
    await page.fill('input[type="password"], input[name="password"]', password);
    await page.click('button[type="submit"], input[type="submit"]');
    await page.waitForLoadState('networkidle', { timeout: 20_000 });

    const currentUrl = page.url();
    if (currentUrl.includes('login') || currentUrl.includes('signin')) {
      log.error({ url: currentUrl }, 'Login may have failed — still on auth page');
    } else {
      log.info({ url: currentUrl }, 'Login successful');
    }

    /* ── 2. Balance page ────────────────────────────────────────────────── */
    log.info({}, `Navigating to balance page`);
    await page.goto(BALANCE_URL, { waitUntil: 'networkidle', timeout: 30_000 });

    /* ── 3. Parse all table rows with ≥ 3 numeric values ───────────────── */
    const rows: { text: string; nums: number[] }[] = await page.evaluate(() => {
      const result: { text: string; nums: number[] }[] = [];
      document.querySelectorAll('tr').forEach(tr => {
        const text = (tr as HTMLElement).innerText ?? '';
        const nums = [...text.matchAll(/[\d\s,]+(?:\.\d+)?/g)]
          .map(m => parseFloat(m[0].replace(/[\s,]/g, '')))
          .filter(n => !isNaN(n) && n >= 0 && isFinite(n));
        if (nums.length >= 3) result.push({ text, nums });
      });
      return result;
    });

    log.info({ rowCount: rows.length }, 'Table rows extracted');

    /* ── 4. Match each provider ─────────────────────────────────────────── */
    const cdf       = findRow(rows, 'dr congo', 'cdf');
    const afrimoney = findRow(rows, 'afrimoney', 'afri money');
    const airtel    = findRow(rows, 'airtel');
    const orange    = findRow(rows, 'orange money', 'orange');

    log.info({ cdf, afrimoney, airtel, orange }, 'Balances parsed');

    /* ── 5. Insert snapshot ─────────────────────────────────────────────── */
    const snapshot = {
      captured_at:         new Date().toISOString(),
      cdf_total:           cdf.total,
      cdf_hold:            cdf.hold,
      cdf_available:       cdf.available,
      afrimoney_total:     afrimoney.total,
      afrimoney_hold:      afrimoney.hold,
      afrimoney_available: afrimoney.available,
      airtel_total:        airtel.total,
      airtel_hold:         airtel.hold,
      airtel_available:    airtel.available,
      orange_total:        orange.total,
      orange_hold:         orange.hold,
      orange_available:    orange.available,
    };

    const { error } = await supabaseAdmin
      .from('avada_balance_snapshots')
      .insert(snapshot);

    if (error) {
      log.error({ err: error.message }, 'Snapshot insert failed');
    } else {
      log.info({ captured_at: snapshot.captured_at, cdf_available: cdf.available }, 'Snapshot saved');
    }
  } catch (err) {
    log.error({ err: (err as Error)?.message }, 'Scrape failed');
    throw err;
  } finally {
    await browser?.close();
  }
}

/* ── Loop exported to cron.ts ───────────────────────────────────────────── */
let _running = false; // in-process guard — prevents overlapping scrapes

export function startAvadaBalanceScrapeLoop(
  intervalMs = 15 * 60_000,
  log: Logger = consoleLogger,
): void {
  async function tick() {
    if (_running) {
      log.warn({}, 'Previous scrape still running — skipping this tick');
      return;
    }
    _running = true;
    try {
      await runAvadaBalanceScrape(log);
    } catch (err) {
      log.error({ err: (err as Error)?.message }, 'avada scrape tick error');
    } finally {
      _running = false;
    }
  }

  // Stagger first run by 2 minutes to avoid boot-time congestion
  setTimeout(() => { void tick(); }, 2 * 60_000).unref();

  setInterval(() => { void tick(); }, intervalMs).unref();

  log.info(
    { intervalMs, intervalMin: Math.round(intervalMs / 60_000) },
    'Avada balance scrape loop started',
  );
}
