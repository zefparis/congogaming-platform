import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { supabaseAdmin } from '../lib/supabase.js';
import { getMerchantBalance } from '../lib/unipesa.js';
import { getUnipesaCircuitInfo } from '../lib/unipesa-resilience.js';
import { tryNormalizeDrcPhone } from '../lib/phone.js';
import { recordLedgerEntry } from '../lib/ledger.js';
import { acquireJobLock } from '../lib/jobLock.js';
import { env } from '../env.js';

// ---- Token / auth ----
//
// Tokens are stateless: HMAC(secret, "admin|<issued_at_ms>") signed with the
// LOTO_ADMIN_SECRET. This keeps things simple (no DB table) and ensures that
// rotating the secret invalidates outstanding tokens.

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h

type AdminRole = 'admin' | 'super_admin';

interface AdminTokenPayload {
  userId: string | null;
  phone: string | null;
  role: AdminRole;
}

function adminSecret(): string {
  const s = env.LOTO_ADMIN_SECRET || '';
  if (!s) throw new Error('LOTO_ADMIN_SECRET not configured');
  return s;
}

function signToken(payload: AdminTokenPayload): string {
  const issued = Date.now().toString();
  const nonce = randomBytes(8).toString('hex');
  const userId = payload.userId || '-';
  const role = payload.role;
  const body = `${issued}.${userId}.${role}.${nonce}`;
  const sig = createHmac('sha256', adminSecret()).update(body).digest('hex');
  return `${body}.${sig}`;
}

function verifyToken(token: string): AdminTokenPayload | null {
  if (!token) return null;
  const parts = token.split('.');
  // Required format: issued.userId.role.nonce.sig (5 parts).
  // Legacy 3-part tokens (no identity) are rejected — admins MUST authenticate
  // with their phone so we always know who acted.
  if (parts.length !== 5) return null;
  const [issued, userId, role, nonce, sig] = parts;
  const issuedMs = Number(issued);
  if (!Number.isFinite(issuedMs)) return null;
  if (Date.now() - issuedMs > TOKEN_TTL_MS) return null;
  if (role !== 'admin' && role !== 'super_admin') return null;
  if (!userId || userId === '-') return null;
  const expected = createHmac('sha256', adminSecret())
    .update(`${issued}.${userId}.${role}.${nonce}`)
    .digest('hex');
  try {
    const ok = timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
    if (!ok) return null;
  } catch {
    return null;
  }
  return {
    userId,
    phone: null,
    role: role as AdminRole,
  };
}

function constantTimeStringEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// Decorate request with the decoded admin token so downstream handlers
// can read actor identity for audit logs / role checks.
declare module 'fastify' {
  interface FastifyRequest {
    admin?: AdminTokenPayload;
  }
}

async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  const auth = String(req.headers['authorization'] || '');
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const payload = m ? verifyToken(m[1]) : null;
  if (!payload) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
  req.admin = payload;
}

async function requireSuperAdmin(req: FastifyRequest, reply: FastifyReply) {
  if (!req.admin) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
  if (req.admin.role !== 'super_admin') {
    req.log.warn(
      { actor: req.admin.userId, role: req.admin.role, url: req.url },
      'super_admin route refused for admin role',
    );
    return reply.code(403).send({ error: 'Super admin only' });
  }
}

// Append a row to the admin audit log. Best-effort: failures are logged but
// never block the underlying admin action.
async function audit(
  req: FastifyRequest,
  action: string,
  targetUserId: string | null,
  amountCdf: number | null,
  reason: string | null,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    await supabaseAdmin.from('admin_audit_log').insert({
      actor_user_id: req.admin?.userId || null,
      actor_phone: req.admin?.phone || null,
      action,
      target_user_id: targetUserId,
      amount_cdf: amountCdf,
      reason,
      meta: meta ?? null,
    });
    req.log.info(
      { action, actor: req.admin?.userId, target: targetUserId, amountCdf, reason },
      'admin sensitive action',
    );
  } catch (e) {
    req.log.error({ err: e instanceof Error ? e.message : String(e) }, 'admin audit insert failed');
  }
}

function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  const s = String(phone);
  if (s.length <= 4) return s;
  return s.slice(0, 2) + '****' + s.slice(-2);
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  return d.toISOString();
}

export default async function adminRoutes(app: FastifyInstance) {
  // ---- Auth ----
  // Both `secret` and `phone` are REQUIRED. The phone identifies the admin
  // user account, and its `users.role` (admin / super_admin) is embedded in
  // the token. There is no anonymous / legacy admin login.
  app.post<{ Body: { secret?: string; phone?: string } }>(
    '/api/admin/auth',
    async (req, reply) => {
      const provided = String(req.body?.secret || '');
      const expected = process.env.LOTO_ADMIN_SECRET || '';
      console.log('[ADMIN-AUTH] provided length:', provided.length, '| expected length:', expected.length, '| match:', provided === expected);
      if (!expected) return reply.code(500).send({ error: 'Admin not configured' });
      if (!provided || !constantTimeStringEqual(provided, expected)) {
        return reply.code(401).send({ error: 'Invalid secret' });
      }

      const phoneRaw = String(req.body?.phone || '').trim();
      if (!phoneRaw) {
        return reply.code(400).send({ error: 'Téléphone admin requis' });
      }
      // Normalise to canonical 0XXXXXXXXX format used in users.phone.
      const phone = tryNormalizeDrcPhone(phoneRaw) || phoneRaw;

      const { data: user, error } = await supabaseAdmin
        .from('users')
        .select('id, role')
        .eq('phone', phone)
        .maybeSingle();
      if (error) {
        req.log.error({ err: error.message }, 'admin auth phone lookup failed');
        return reply.code(500).send({ error: 'Lookup failed' });
      }
      if (!user) {
        return reply.code(403).send({ error: 'Not authorized as admin' });
      }
      const userRole = String((user as any).role || 'user');
      if (userRole !== 'admin' && userRole !== 'super_admin') {
        req.log.warn({ phone, role: userRole }, 'admin auth refused: not an admin');
        return reply.code(403).send({ error: 'Not authorized as admin' });
      }

      const userId: string = (user as any).id;
      const role = userRole as AdminRole;

      return reply.send({
        token: signToken({ userId, phone, role }),
        expires_at: Date.now() + TOKEN_TTL_MS,
        role,
      });
    },
  );

  // All routes below require admin auth
  app.addHook('onRequest', async (req, reply) => {
    const url = req.routeOptions?.url || req.url;
    if (!url.startsWith('/api/admin/')) return;
    if (url === '/api/admin/auth') return;
    return requireAdmin(req, reply);
  });

  // Return the current admin's identity + role so the frontend can hide
  // sensitive blocks for non-super-admins.
  app.get('/api/admin/me', async (req, reply) => {
    return reply.send({
      user_id: req.admin?.userId || null,
      role: req.admin?.role || 'admin',
    });
  });

  // ---- OVERVIEW ----

  app.get('/api/admin/overview', async (_req, reply) => {
    try {
      const todayIso = startOfTodayIso();
      const [
        usersAgg,
        usersCount,
        roundsToday,
        kycCounts,
        okapiBetsToday,
        txToday,
        roundsTodayCrash,
        lotoTicketsToday,
        flashTicketsToday,
      ] = await Promise.all([
        supabaseAdmin.from('users').select('balance_cdf'),
        supabaseAdmin.from('users').select('*', { count: 'exact', head: true }),
        supabaseAdmin
          .from('okapi_rounds')
          .select('*', { count: 'exact', head: true })
          .gte('started_at', todayIso),
        // Per-status user counts. We query the column directly and aggregate
        // in JS — cheaper than 4 separate count(*) round-trips.
        supabaseAdmin.from('users').select('kyc_status'),
        // Active players today: distinct user_id from okapi_bets since today
        supabaseAdmin
          .from('okapi_bets')
          .select('user_id')
          .gte('created_at', todayIso),
        // Today's transactions (deposits/withdrawals, success only)
        supabaseAdmin
          .from('transactions')
          .select('type, amount, status')
          .gte('created_at', todayIso),
        // Crash points for today's rounds (avg)
        supabaseAdmin
          .from('okapi_rounds')
          .select('crash_point')
          .gte('started_at', todayIso),
        supabaseAdmin
          .from('loto_tickets')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', todayIso),
        supabaseAdmin
          .from('flash_tickets')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', todayIso),
      ]);

      const total_balance_cdf = (usersAgg.data || []).reduce(
        (s: number, r: any) => s + Number(r.balance_cdf || 0),
        0,
      );

      const kyc = { approved: 0, pending: 0, denied: 0, verify_age: 0 };
      for (const r of (kycCounts.data as Array<{ kyc_status?: string }>) || []) {
        const k = (r.kyc_status || 'pending') as keyof typeof kyc;
        if (k in kyc) kyc[k]++;
      }

      const activeUserSet = new Set<string>();
      for (const b of okapiBetsToday.data || []) {
        activeUserSet.add(String((b as any).user_id));
      }

      let total_deposits_today = 0;
      let total_withdrawals_today = 0;
      for (const t of txToday.data || []) {
        if (Number((t as any).status) !== 2) continue;
        const amount = Number((t as any).amount || 0);
        if ((t as any).type === 'deposit') total_deposits_today += amount;
        else if ((t as any).type === 'withdrawal') total_withdrawals_today += amount;
      }

      const crashPoints = (roundsTodayCrash.data || []).map((r: any) =>
        Number(r.crash_point || 0),
      );
      const avg_crash_point = crashPoints.length
        ? crashPoints.reduce((s, v) => s + v, 0) / crashPoints.length
        : 0;

      const loto_tickets_today =
        (lotoTicketsToday.count ?? 0) + (flashTicketsToday.count ?? 0);

      return reply.send({
        total_balance_cdf,
        users_count: usersCount.count ?? 0,
        okapi_rounds_today: roundsToday.count ?? 0,
        kyc,
        // New KPIs
        active_players_today: activeUserSet.size,
        total_deposits_today,
        total_withdrawals_today,
        avg_crash_point,
        loto_tickets_today,
      });
    } catch (e: any) {
      return reply.code(500).send({ error: e.message || 'overview failed' });
    }
  });

  // Today's transactions summary — for the summary bar in TransactionsTab.
  app.get('/api/admin/transactions/summary', async (_req, reply) => {
    const todayIso = startOfTodayIso();
    const { data, error } = await supabaseAdmin
      .from('transactions')
      .select('type, amount, status')
      .gte('created_at', todayIso);
    if (error) return reply.code(500).send({ error: error.message });

    let deposits_success_cdf = 0;
    let withdrawals_success_cdf = 0;
    let total_count = 0;
    let failed_count = 0;
    for (const t of data || []) {
      total_count++;
      const status = Number((t as any).status);
      const amount = Number((t as any).amount || 0);
      if (status === 3) failed_count++;
      if (status === 2) {
        if ((t as any).type === 'deposit') deposits_success_cdf += amount;
        else if ((t as any).type === 'withdrawal') withdrawals_success_cdf += amount;
      }
    }
    const failure_rate = total_count > 0 ? failed_count / total_count : 0;
    return reply.send({
      deposits_success_cdf,
      withdrawals_success_cdf,
      total_count,
      failed_count,
      failure_rate,
    });
  });

  // Read-only snapshot of the in-process Unipesa circuit breaker.
  // Useful when the dashboard wants to surface "provider degraded"
  // banners without having to wait for an actual failed call.
  app.get('/api/admin/unipesa/circuit', async (_req, reply) => {
    return reply.send(getUnipesaCircuitInfo());
  });

  app.get('/api/admin/avadapay-balance', async (_req, reply) => {
    try {
      const { balance_cdf, raw } = await getMerchantBalance();
      return reply.send({ balance_cdf, raw });
    } catch (e: any) {
      return reply
        .code(502)
        .send({ error: e.message || 'avadapay balance failed', balance_cdf: null });
    }
  });

  app.get<{ Querystring: { days?: string } }>('/api/admin/revenue', async (req, reply) => {
    const days = Math.min(90, Math.max(1, Number(req.query.days || 7)));
    const since = daysAgoIso(days);

    // Pull all rounds in window with their bets aggregated.
    // House profit = sum(amount of lost bets) - sum(win - amount) for won bets.
    // i.e. for each bet: lost → +amount, won → -(win - amount) = amount - win.
    const { data: bets, error } = await supabaseAdmin
      .from('okapi_bets')
      .select('amount_cdf, win_amount_cdf, status, created_at')
      .gte('created_at', since);
    if (error) return reply.code(500).send({ error: error.message });

    const buckets = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - (days - 1 - i));
      buckets.set(d.toISOString().slice(0, 10), 0);
    }

    for (const b of bets || []) {
      const day = String(b.created_at).slice(0, 10);
      if (!buckets.has(day)) continue;
      const amount = Number(b.amount_cdf || 0);
      const win = Number(b.win_amount_cdf || 0);
      const status = String(b.status || '');
      let profit = 0;
      if (status === 'lost') profit = amount;
      else if (status === 'won') profit = amount - win;
      buckets.set(day, (buckets.get(day) || 0) + profit);
    }

    return reply.send({
      series: Array.from(buckets.entries()).map(([day, profit_cdf]) => ({ day, profit_cdf })),
    });
  });

  app.get<{ Querystring: { limit?: string } }>('/api/admin/activity', async (req, reply) => {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 10)));

    // We need an aggregated mixed feed. Pull a window of recent rows from
    // each source, then merge + sort by created_at desc and trim to limit.
    const fetchN = limit * 2;

    const [txs, okBets, lotoT, flashT] = await Promise.all([
      supabaseAdmin
        .from('transactions')
        .select('id, user_id, type, amount, status, created_at')
        .order('created_at', { ascending: false })
        .limit(fetchN),
      supabaseAdmin
        .from('okapi_bets')
        .select('id, user_id, amount_cdf, status, created_at')
        .order('created_at', { ascending: false })
        .limit(fetchN),
      supabaseAdmin
        .from('loto_tickets')
        .select('id, user_id, prix_cdf, created_at')
        .order('created_at', { ascending: false })
        .limit(fetchN),
      supabaseAdmin
        .from('flash_tickets')
        .select('id, user_id, prix_cdf, created_at')
        .order('created_at', { ascending: false })
        .limit(fetchN),
    ]);

    const userIds = new Set<string>();
    for (const arr of [txs.data, okBets.data, lotoT.data, flashT.data]) {
      for (const r of arr || []) userIds.add(String((r as any).user_id));
    }
    const phoneById = new Map<string, string>();
    if (userIds.size > 0) {
      const { data: users } = await supabaseAdmin
        .from('users')
        .select('id, phone')
        .in('id', Array.from(userIds));
      for (const u of users || []) phoneById.set(String(u.id), String(u.phone || ''));
    }

    type Event = {
      id: string;
      type: 'deposit' | 'withdrawal' | 'okapi_bet' | 'loto_ticket' | 'flash_ticket';
      amount_cdf: number;
      phone: string;
      status?: string | number;
      created_at: string;
    };
    const events: Event[] = [];
    for (const t of txs.data || []) {
      const type = t.type === 'deposit' ? 'deposit' : t.type === 'withdrawal' ? 'withdrawal' : null;
      if (!type) continue;
      events.push({
        id: String(t.id),
        type,
        amount_cdf: Number(t.amount || 0),
        phone: maskPhone(phoneById.get(String(t.user_id))),
        status: t.status,
        created_at: String(t.created_at),
      });
    }
    for (const b of okBets.data || []) {
      events.push({
        id: String(b.id),
        type: 'okapi_bet',
        amount_cdf: Number(b.amount_cdf || 0),
        phone: maskPhone(phoneById.get(String(b.user_id))),
        status: b.status,
        created_at: String(b.created_at),
      });
    }
    for (const t of lotoT.data || []) {
      events.push({
        id: String(t.id),
        type: 'loto_ticket',
        amount_cdf: Number(t.prix_cdf || 0),
        phone: maskPhone(phoneById.get(String(t.user_id))),
        created_at: String(t.created_at),
      });
    }
    for (const t of flashT.data || []) {
      events.push({
        id: String(t.id),
        type: 'flash_ticket',
        amount_cdf: Number(t.prix_cdf || 0),
        phone: maskPhone(phoneById.get(String(t.user_id))),
        created_at: String(t.created_at),
      });
    }

    events.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return reply.send({ events: events.slice(0, limit) });
  });

  // ---- JOUEURS ----

  app.get<{ Querystring: { search?: string; page?: string; page_size?: string } }>(
    '/api/admin/users',
    async (req, reply) => {
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.min(100, Math.max(1, Number(req.query.page_size || 25)));
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let q = supabaseAdmin
        .from('users')
        .select('id, phone, display_name, balance_cdf, created_at, kyc_status, blocked, referral_code', { count: 'exact' })
        .order('created_at', { ascending: false });
      if (req.query.search) {
        q = q.ilike('phone', `%${req.query.search}%`);
      }
      const { data, error, count } = await q.range(from, to);
      if (error) return reply.code(500).send({ error: error.message });

      // Last activity per user (best-effort): latest of transactions, okapi_bets, loto_tickets
      const ids = (data || []).map((u: any) => u.id);
      const lastActivity = new Map<string, string>();
      // Aggregate okapi P&L (all-time) and rounds_played in last 24h to flag at-risk players.
      const pnlByUser = new Map<string, number>();
      const rounds24hByUser = new Map<string, number>();
      const exclusionByUser = new Map<string, string>();
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const nowIso = new Date().toISOString();
      if (ids.length > 0) {
        const [tx, ob, lt, betsAll, limitsRows] = await Promise.all([
          supabaseAdmin
            .from('transactions')
            .select('user_id, created_at')
            .in('user_id', ids)
            .order('created_at', { ascending: false }),
          supabaseAdmin
            .from('okapi_bets')
            .select('user_id, created_at')
            .in('user_id', ids)
            .order('created_at', { ascending: false }),
          supabaseAdmin
            .from('loto_tickets')
            .select('user_id, created_at')
            .in('user_id', ids)
            .order('created_at', { ascending: false }),
          supabaseAdmin
            .from('okapi_bets')
            .select('user_id, amount_cdf, win_amount_cdf, status, created_at')
            .in('user_id', ids),
          supabaseAdmin
            .from('user_limits')
            .select('user_id, self_exclusion_until')
            .in('user_id', ids)
            .gt('self_exclusion_until', nowIso),
        ]);
        for (const r of limitsRows.data || []) {
          exclusionByUser.set(String((r as any).user_id), String((r as any).self_exclusion_until));
        }
        const accumulate = (rows: any[] | null) => {
          for (const r of rows || []) {
            const uid = String(r.user_id);
            const ts = String(r.created_at);
            const prev = lastActivity.get(uid);
            if (!prev || prev < ts) lastActivity.set(uid, ts);
          }
        };
        accumulate(tx.data);
        accumulate(ob.data);
        accumulate(lt.data);

        for (const b of betsAll.data || []) {
          const uid = String((b as any).user_id);
          const amount = Number((b as any).amount_cdf || 0);
          const win = Number((b as any).win_amount_cdf || 0);
          const status = String((b as any).status || '');
          // Player P&L = won - wagered. Approximated from final-state bets.
          if (status === 'won') pnlByUser.set(uid, (pnlByUser.get(uid) || 0) + (win - amount));
          else if (status === 'lost') pnlByUser.set(uid, (pnlByUser.get(uid) || 0) - amount);
          if (String((b as any).created_at) >= since24h) {
            rounds24hByUser.set(uid, (rounds24hByUser.get(uid) || 0) + 1);
          }
        }
      }

      return reply.send({
        items: (data || []).map((u: any) => ({
          id: u.id,
          phone: u.phone,
          display_name: u.display_name || null,
          referral_code: u.referral_code || null,
          balance_cdf: Number(u.balance_cdf || 0),
          created_at: u.created_at,
          last_activity_at: lastActivity.get(u.id) || null,
          kyc_status: (u.kyc_status as string) || 'pending',
          blocked: !!u.blocked,
          self_exclusion_until: exclusionByUser.get(u.id) || null,
          pnl_cdf: pnlByUser.get(u.id) || 0,
          rounds_24h: rounds24hByUser.get(u.id) || 0,
        })),
        page,
        page_size: pageSize,
        total: count ?? null,
      });
    },
  );

  app.get<{ Params: { id: string } }>('/api/admin/users/:id', async (req, reply) => {
    const id = req.params.id;
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, phone, display_name, balance_cdf, created_at, kyc_status, blocked, referral_code, referred_by')
      .eq('id', id)
      .maybeSingle();
    if (error) return reply.code(500).send({ error: error.message });
    if (!user) return reply.code(404).send({ error: 'Not found' });

    const [tx, bets, limitsRes, refereeCountRes, referrerRes, rewardsRes] = await Promise.all([
      supabaseAdmin
        .from('transactions')
        .select('id, order_id, type, amount, provider_id, status, created_at')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
      supabaseAdmin
        .from('okapi_bets')
        .select('amount_cdf, win_amount_cdf, status')
        .eq('user_id', id),
      supabaseAdmin
        .from('user_limits')
        .select('*')
        .eq('user_id', id)
        .maybeSingle(),
      supabaseAdmin
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('referred_by', id),
      (user as any).referred_by
        ? supabaseAdmin
            .from('users')
            .select('id, phone, referral_code')
            .eq('id', (user as any).referred_by)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabaseAdmin
        .from('referral_rewards')
        .select('id, referred_id, amount_cdf, status, trigger_event, created_at, credited_at')
        .eq('referrer_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    let rounds_played = 0;
    let total_wagered = 0;
    let total_won = 0;
    for (const b of bets.data || []) {
      rounds_played += 1;
      total_wagered += Number(b.amount_cdf || 0);
      total_won += Number(b.win_amount_cdf || 0);
    }

    // Last 5 KYC checks for this user (audit trail).
    const { data: kycChecks } = await supabaseAdmin
      .from('kyc_checks')
      .select('id, verdict, estimated_age, age_low, age_high, is_minor, confidence, scan_id, created_at')
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .limit(5);

    return reply.send({
      user,
      transactions: tx.data || [],
      okapi: {
        rounds_played,
        total_wagered_cdf: total_wagered,
        total_won_cdf: total_won,
        pnl_cdf: total_won - total_wagered,
      },
      kyc_checks: kycChecks || [],
      limits: limitsRes.data || null,
      referral: {
        code: (user as any).referral_code || null,
        referred_count: refereeCountRes.count ?? 0,
        referrer: referrerRes.data || null,
        rewards: rewardsRes.data || [],
      },
    });
  });

  // ---- RESPONSIBLE GAMING (admin-side overrides) ----
  // Admin can set/clear limits with NO 24h cooldown (overrides cooling-off).
  app.put<{ Params: { id: string }; Body: {
    daily_deposit_cdf?: number | null;
    weekly_deposit_cdf?: number | null;
    monthly_deposit_cdf?: number | null;
  } }>('/api/admin/users/:id/limits', { preHandler: requireSuperAdmin }, async (req, reply) => {
    const id = req.params.id;
    const body = req.body || {};
    const update: Record<string, unknown> = {
      user_id: id,
      updated_at: new Date().toISOString(),
      // Admin override clears any pending raise.
      pending_raise: null,
      pending_raise_effective_at: null,
    };
    for (const k of ['daily_deposit_cdf', 'weekly_deposit_cdf', 'monthly_deposit_cdf'] as const) {
      if (k in body) update[k] = body[k] ?? null;
    }
    const { error } = await supabaseAdmin
      .from('user_limits')
      .upsert(update, { onConflict: 'user_id' });
    if (error) return reply.code(500).send({ error: error.message });
    await audit(req, 'set_limits', id, null, null, body as Record<string, unknown>);
    return reply.send({ ok: true });
  });

  // Set or clear self-exclusion. `until = null` clears it.
  app.post<{ Params: { id: string }; Body: { until?: string | null; duration?: '24h' | '7d' | '30d' | 'permanent' | null } }>(
    '/api/admin/users/:id/self-exclusion',
    { preHandler: requireSuperAdmin },
    async (req, reply) => {
      const id = req.params.id;
      let until: string | null = null;
      if (req.body?.until === null) until = null;
      else if (typeof req.body?.until === 'string') {
        const d = new Date(req.body.until);
        if (Number.isNaN(d.getTime())) return reply.code(400).send({ error: 'Invalid until' });
        until = d.toISOString();
      } else if (req.body?.duration) {
        const ms: Record<string, number> = {
          '24h': 24 * 60 * 60 * 1000,
          '7d': 7 * 24 * 60 * 60 * 1000,
          '30d': 30 * 24 * 60 * 60 * 1000,
          'permanent': 100 * 365 * 24 * 60 * 60 * 1000,
        };
        until = new Date(Date.now() + ms[req.body.duration]).toISOString();
      } else if (req.body?.duration === null) {
        until = null;
      } else {
        return reply.code(400).send({ error: 'until or duration required' });
      }

      const { error } = await supabaseAdmin
        .from('user_limits')
        .upsert(
          { user_id: id, self_exclusion_until: until, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' },
        );
      if (error) return reply.code(500).send({ error: error.message });
      await audit(req, 'self_exclusion', id, null, null, { until });
      return reply.send({ ok: true, self_exclusion_until: until });
    },
  );

  // Manually credit a referral reward (e.g. one-time bonus campaign).
  // Adjusts referrer balance and writes a `credited` row in referral_rewards.
  app.post<{ Params: { id: string }; Body: { referred_id: string; amount_cdf: number; trigger_event?: string } }>(
    '/api/admin/users/:id/referral-reward',
    { preHandler: requireSuperAdmin },
    async (req, reply) => {
      const referrerId = req.params.id;
      const { referred_id, amount_cdf, trigger_event } = req.body || ({} as any);
      const amt = Number(amount_cdf);
      if (!referred_id || !Number.isFinite(amt) || amt <= 0) {
        return reply.code(400).send({ error: 'referred_id et amount_cdf > 0 requis' });
      }

      // Confirm relationship.
      const { data: referee } = await supabaseAdmin
        .from('users')
        .select('id, referred_by')
        .eq('id', referred_id)
        .maybeSingle();
      if (!referee || String(referee.referred_by) !== referrerId) {
        return reply.code(400).send({ error: 'Ce joueur n\'est pas un filleul de cet utilisateur' });
      }

      try {
        await recordLedgerEntry({
          user_id: referrerId,
          direction: 'credit',
          amount: amt,
          currency: 'CDF',
          reason: 'referral_reward_admin',
          reference_type: 'referral_reward',
          reference_id: referred_id,
          idempotency_key: `referral:${trigger_event || 'admin_manual'}:${referrerId}`,
        });
      } catch (ledgerErr: any) {
        return reply.code(500).send({ error: ledgerErr?.message || 'Balance error' });
      }

      const { error: rewErr } = await supabaseAdmin
        .from('referral_rewards')
        .upsert(
          {
            referrer_id: referrerId,
            referred_id,
            amount_cdf: amt,
            status: 'credited',
            trigger_event: trigger_event || 'admin_manual',
            credited_at: new Date().toISOString(),
          },
          { onConflict: 'referrer_id,referred_id,trigger_event' },
        );
      if (rewErr) return reply.code(500).send({ error: rewErr.message });

      return reply.send({ ok: true });
    },
  );

  // Overview KPIs for the responsible-gaming admin tab.
  app.get('/api/admin/responsible-gaming/overview', async (_req, reply) => {
    const nowIso = new Date().toISOString();
    const [allLimitsRes, excludedRes] = await Promise.all([
      supabaseAdmin
        .from('user_limits')
        .select('user_id, daily_deposit_cdf, weekly_deposit_cdf, monthly_deposit_cdf, self_exclusion_until'),
      supabaseAdmin
        .from('user_limits')
        .select('user_id, self_exclusion_until')
        .gt('self_exclusion_until', nowIso),
    ]);

    const rows = allLimitsRes.data || [];
    let users_with_limits = 0;
    let users_with_daily = 0;
    let users_with_weekly = 0;
    let users_with_monthly = 0;
    for (const r of rows) {
      const hasAny = r.daily_deposit_cdf != null || r.weekly_deposit_cdf != null || r.monthly_deposit_cdf != null;
      if (hasAny) users_with_limits += 1;
      if (r.daily_deposit_cdf != null) users_with_daily += 1;
      if (r.weekly_deposit_cdf != null) users_with_weekly += 1;
      if (r.monthly_deposit_cdf != null) users_with_monthly += 1;
    }

    return reply.send({
      users_with_limits,
      users_with_daily,
      users_with_weekly,
      users_with_monthly,
      users_self_excluded: excludedRes.data?.length ?? 0,
    });
  });

  // List users currently self-excluded.
  app.get('/api/admin/responsible-gaming/excluded', async (_req, reply) => {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('user_limits')
      .select('user_id, self_exclusion_until, updated_at')
      .gt('self_exclusion_until', nowIso)
      .order('self_exclusion_until', { ascending: true });
    if (error) return reply.code(500).send({ error: error.message });

    const ids = (data || []).map((r: any) => String(r.user_id));
    const phoneById = new Map<string, string>();
    if (ids.length > 0) {
      const { data: users } = await supabaseAdmin.from('users').select('id, phone').in('id', ids);
      for (const u of users || []) phoneById.set(String(u.id), String(u.phone || ''));
    }

    return reply.send({
      items: (data || []).map((r: any) => ({
        user_id: r.user_id,
        phone: phoneById.get(String(r.user_id)) || '—',
        phone_masked: maskPhone(phoneById.get(String(r.user_id))),
        self_exclusion_until: r.self_exclusion_until,
        set_at: r.updated_at,
      })),
    });
  });

  // Lightweight program status (kill switch + key constants).
  app.get('/api/admin/referrals/status', async (_req, reply) => {
    const enabled = String(process.env.REFERRAL_PROGRAM_ENABLED ?? 'true').toLowerCase() !== 'false';
    return reply.send({
      enabled,
      welcome_bonus_percent: 10,
      welcome_bonus_cap_cdf: 5000,
      min_qualifying_deposit_cdf: 5000,
      tiers: [
        { tier: 'wager_5k', threshold_cdf: 5000, reward_cdf: 2000 },
        { tier: 'wager_25k', threshold_cdf: 25000, reward_cdf: 1000 },
        { tier: 'wager_100k', threshold_cdf: 100000, reward_cdf: 5000 },
      ],
      annual_cap_cdf: 50000,
    });
  });

  // Top referrers leaderboard.
  app.get<{ Querystring: { limit?: string } }>('/api/admin/referrals/leaderboard', async (req, reply) => {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));

    // Group by referred_by, count > 0
    const { data: refs, error } = await supabaseAdmin
      .from('users')
      .select('referred_by')
      .not('referred_by', 'is', null);
    if (error) return reply.code(500).send({ error: error.message });

    const counts = new Map<string, number>();
    for (const r of refs || []) {
      const k = String((r as any).referred_by);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    const top = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    const ids = top.map(([id]) => id);
    const phoneById = new Map<string, { phone: string; code: string | null; display_name: string | null }>();
    if (ids.length > 0) {
      const { data: users } = await supabaseAdmin
        .from('users')
        .select('id, phone, display_name, referral_code')
        .in('id', ids);
      for (const u of users || [])
        phoneById.set(String(u.id), {
          phone: String(u.phone || ''),
          code: (u.referral_code as string) || null,
          display_name: (u.display_name as string) || null,
        });
    }

    // Sum credited rewards per referrer.
    const rewardsByRef = new Map<string, number>();
    if (ids.length > 0) {
      const { data: rwds } = await supabaseAdmin
        .from('referral_rewards')
        .select('referrer_id, amount_cdf, status')
        .in('referrer_id', ids)
        .eq('status', 'credited');
      for (const r of rwds || []) {
        const k = String((r as any).referrer_id);
        rewardsByRef.set(k, (rewardsByRef.get(k) || 0) + Number((r as any).amount_cdf || 0));
      }
    }

    return reply.send({
      items: top.map(([id, count]) => ({
        user_id: id,
        phone: phoneById.get(id)?.phone || '—',
        phone_masked: maskPhone(phoneById.get(id)?.phone),
        display_name: phoneById.get(id)?.display_name ?? null,
        referral_code: phoneById.get(id)?.code ?? null,
        referred_count: count,
        total_credited_cdf: rewardsByRef.get(id) || 0,
      })),
    });
  });

  app.post<{ Params: { id: string }; Body: { delta_cdf: number; reason?: string } }>(
    '/api/admin/users/:id/balance',
    { preHandler: requireSuperAdmin },
    async (req, reply) => {
      try {
        const id = req.params.id;
        const delta = Number(req.body?.delta_cdf || 0);
        const reason = String(req.body?.reason || '').slice(0, 500) || null;

        req.log.info({ userId: id, delta, reason }, 'admin balance adjustment requested');

        if (!Number.isFinite(delta) || delta === 0) {
          return reply.code(400).send({ error: 'delta_cdf requis (non nul)' });
        }

        const result = await recordLedgerEntry({
          user_id: id,
          direction: delta > 0 ? 'credit' : 'debit',
          amount: Math.abs(Math.trunc(delta)),
          currency: 'CDF',
          reason: reason || 'admin_adjustment',
          reference_type: 'admin',
          reference_id: randomUUID(),
          idempotency_key: `admin:adjust:${id}:${randomUUID()}`,
        });

        const newBalance = result.balance ?? 0;
        req.log.info({ userId: id, delta, newBalance, duplicate: result.duplicate }, 'admin balance adjustment successful');

        await audit(req, 'adjust_balance', id, delta, reason);
        return reply.send({ new_balance_cdf: newBalance });
      } catch (err: any) {
        req.log.error({ err: err?.message || err, stack: err?.stack }, 'admin balance adjustment unexpected error');
        return reply.code(500).send({ error: 'Internal error', details: err?.message });
      }
    },
  );

  app.post<{ Params: { id: string }; Body: { blocked?: boolean } }>(
    '/api/admin/users/:id/block',
    { preHandler: requireSuperAdmin },
    async (req, reply) => {
      // The `blocked` column is created by the playguard-kyc migration
      // (2026-05-23-playguard-kyc.sql). If you see a column-missing error
      // here, run that migration.
      const id = req.params.id;
      const blocked = !!req.body?.blocked;
      const { error } = await supabaseAdmin
        .from('users')
        .update({ blocked })
        .eq('id', id);
      if (error) {
        return reply.code(400).send({
          error: error.message,
          hint: "Add 'blocked boolean default false' column on public.users to enable user blocking.",
        });
      }
      await audit(req, blocked ? 'block_user' : 'unblock_user', id, null, null);
      return reply.send({ ok: true, blocked });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/admin/users/:id/kyc-approve',
    { preHandler: requireSuperAdmin },
    async (req, reply) => {
      const id = req.params.id;
      const { error } = await supabaseAdmin
        .from('users')
        .update({ kyc_status: 'approved' })
        .eq('id', id);
      if (error) return reply.code(400).send({ error: error.message });
      await audit(req, 'kyc_approve', id, null, null);
      return reply.send({ ok: true, kyc_status: 'approved' });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/admin/users/:id/kyc-deny',
    { preHandler: requireSuperAdmin },
    async (req, reply) => {
      const id = req.params.id;
      const { error } = await supabaseAdmin
        .from('users')
        .update({ kyc_status: 'denied', blocked: true })
        .eq('id', id);
      if (error) return reply.code(400).send({ error: error.message });
      await audit(req, 'kyc_deny', id, null, null);
      return reply.send({ ok: true, kyc_status: 'denied', blocked: true });
    },
  );

  // ---- JEUX ----

  app.get<{ Querystring: { page?: string; page_size?: string } }>(
    '/api/admin/okapi/rounds',
    async (req, reply) => {
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.min(100, Math.max(1, Number(req.query.page_size || 25)));
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data: rounds, error, count } = await supabaseAdmin
        .from('okapi_rounds')
        .select('id, crash_point, started_at, ended_at', { count: 'exact' })
        .order('started_at', { ascending: false })
        .range(from, to);
      if (error) return reply.code(500).send({ error: error.message });

      const ids = (rounds || []).map((r: any) => String(r.id));
      type RoundAgg = {
        total_bets: number;
        total_cashouts: number;
        house_profit: number;
        players_count: number;
        biggest_cashout: number;
        _users: Set<string>;
      };
      const agg = new Map<string, RoundAgg>();
      if (ids.length > 0) {
        const { data: bets } = await supabaseAdmin
          .from('okapi_bets')
          .select('round_id, user_id, amount_cdf, win_amount_cdf, status')
          .in('round_id', ids);
        for (const b of bets || []) {
          const k = String((b as any).round_id);
          const cur =
            agg.get(k) || {
              total_bets: 0,
              total_cashouts: 0,
              house_profit: 0,
              players_count: 0,
              biggest_cashout: 0,
              _users: new Set<string>(),
            };
          const amount = Number((b as any).amount_cdf || 0);
          const win = Number((b as any).win_amount_cdf || 0);
          cur.total_bets += amount;
          cur.total_cashouts += win;
          if ((b as any).status === 'lost') cur.house_profit += amount;
          else if ((b as any).status === 'won') cur.house_profit += amount - win;
          cur._users.add(String((b as any).user_id));
          if (win > cur.biggest_cashout) cur.biggest_cashout = win;
          agg.set(k, cur);
        }
        for (const v of agg.values()) v.players_count = v._users.size;
      }

      return reply.send({
        items: (rounds || []).map((r: any) => {
          const a =
            agg.get(String(r.id)) ||
            ({
              total_bets: 0,
              total_cashouts: 0,
              house_profit: 0,
              players_count: 0,
              biggest_cashout: 0,
            } as RoundAgg);
          return {
            id: r.id,
            crash_point: Number(r.crash_point || 0),
            started_at: r.started_at,
            ended_at: r.ended_at,
            total_bets: a.total_bets,
            total_cashouts: a.total_cashouts,
            house_profit: a.house_profit,
            players_count: a.players_count,
            biggest_cashout: a.biggest_cashout,
          };
        }),
        page,
        page_size: pageSize,
        total: count ?? null,
      });
    },
  );

  app.get<{ Querystring: { page?: string; page_size?: string; type?: string } }>(
    '/api/admin/loto/tirages',
    async (req, reply) => {
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.min(100, Math.max(1, Number(req.query.page_size || 25)));
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const type = (req.query.type || 'all').toLowerCase();

      type Tirage = {
        id: string;
        type: 'congo' | 'flash';
        drawn_at: string;
        numeros: number[];
        jackpot_cdf: number | null;
        winners_count: number;
        winners: number;
        tickets_sold: number;
        revenue_cdf: number;
      };

      const result: Tirage[] = [];

      const aggregateTickets = async (
        table: 'loto_tickets' | 'flash_tickets',
        ids: string[],
      ) => {
        const winners = new Map<string, number>();
        const sold = new Map<string, number>();
        const revenue = new Map<string, number>();
        if (ids.length === 0) return { winners, sold, revenue };
        const { data: tickets } = await supabaseAdmin
          .from(table)
          .select('tirage_id, status, prix_cdf')
          .in('tirage_id', ids);
        for (const row of tickets || []) {
          const k = String((row as any).tirage_id);
          sold.set(k, (sold.get(k) || 0) + 1);
          revenue.set(k, (revenue.get(k) || 0) + Number((row as any).prix_cdf || 0));
          if ((row as any).status === 'gagnant') {
            winners.set(k, (winners.get(k) || 0) + 1);
          }
        }
        return { winners, sold, revenue };
      };

      if (type === 'all' || type === 'congo') {
        const { data: tirages, error } = await supabaseAdmin
          .from('loto_tirages')
          .select('id, numeros, complementaire, jackpot, drawn_at')
          .order('drawn_at', { ascending: false })
          .range(from, to);
        if (error) return reply.code(500).send({ error: error.message });
        const ids = (tirages || []).map((t: any) => String(t.id));
        const { winners, sold, revenue } = await aggregateTickets('loto_tickets', ids);
        for (const t of tirages || []) {
          const id = String(t.id);
          const w = winners.get(id) || 0;
          result.push({
            id,
            type: 'congo',
            drawn_at: String(t.drawn_at),
            numeros: [...(t.numeros || []), Number(t.complementaire)],
            jackpot_cdf: t.jackpot != null ? Number(t.jackpot) : null,
            winners_count: w,
            winners: w,
            tickets_sold: sold.get(id) || 0,
            revenue_cdf: revenue.get(id) || 0,
          });
        }
      }

      if (type === 'all' || type === 'flash') {
        const { data: tirages, error } = await supabaseAdmin
          .from('flash_tirages')
          .select('id, numeros, drawn_at')
          .order('drawn_at', { ascending: false })
          .range(from, to);
        if (error) return reply.code(500).send({ error: error.message });
        const ids = (tirages || []).map((t: any) => String(t.id));
        const { winners, sold, revenue } = await aggregateTickets('flash_tickets', ids);
        for (const t of tirages || []) {
          const id = String(t.id);
          const w = winners.get(id) || 0;
          result.push({
            id,
            type: 'flash',
            drawn_at: String(t.drawn_at),
            numeros: t.numeros || [],
            jackpot_cdf: null,
            winners_count: w,
            winners: w,
            tickets_sold: sold.get(id) || 0,
            revenue_cdf: revenue.get(id) || 0,
          });
        }
      }

      result.sort((a, b) => (a.drawn_at < b.drawn_at ? 1 : -1));
      return reply.send({
        items: result.slice(0, pageSize),
        page,
        page_size: pageSize,
      });
    },
  );

  // ---- TRANSACTIONS ----

  function buildTxQuery(query: any) {
    let q = supabaseAdmin
      .from('transactions')
      .select('id, user_id, order_id, type, amount, currency, provider_id, status, transaction_id, created_at', { count: 'exact' })
      .order('created_at', { ascending: false });
    const status = query.status;
    if (status && status !== 'all') {
      if (status === 'success') q = q.eq('status', 2);
      else if (status === 'failed') q = q.eq('status', 3);
      else if (status === 'pending') q = q.in('status', [0, 1]);
    }
    if (query.provider && query.provider !== 'all') {
      q = q.eq('provider_id', Number(query.provider));
    }
    if (query.type && query.type !== 'all') {
      q = q.eq('type', query.type);
    }
    if (query.from) q = q.gte('created_at', new Date(query.from).toISOString());
    if (query.to) {
      const d = new Date(query.to);
      d.setHours(23, 59, 59, 999);
      q = q.lte('created_at', d.toISOString());
    }
    return q;
  }

  app.get<{ Querystring: Record<string, string> }>('/api/admin/transactions', async (req, reply) => {
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(200, Math.max(1, Number(req.query.page_size || 50)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await buildTxQuery(req.query).range(from, to);
    if (error) return reply.code(500).send({ error: error.message });

    const ids = Array.from(new Set((data || []).map((t: any) => String(t.user_id))));
    const phoneById = new Map<string, string>();
    if (ids.length > 0) {
      const { data: users } = await supabaseAdmin.from('users').select('id, phone').in('id', ids);
      for (const u of users || []) phoneById.set(String(u.id), String(u.phone || ''));
    }

    return reply.send({
      items: (data || []).map((t: any) => ({
        id: t.id,
        order_id: t.order_id,
        user_id: t.user_id,
        phone: phoneById.get(String(t.user_id)) || null,
        phone_masked: maskPhone(phoneById.get(String(t.user_id))),
        type: t.type,
        amount_cdf: Number(t.amount || 0),
        currency: t.currency,
        provider_id: t.provider_id,
        status: t.status,
        transaction_id: t.transaction_id,
        created_at: t.created_at,
      })),
      page,
      page_size: pageSize,
      total: count ?? null,
    });
  });

  // ---- SCRATCH (admin) ----

  app.get<{ Querystring: { page?: string; page_size?: string } }>(
    '/api/admin/scratch/tickets',
    async (req, reply) => {
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.min(100, Math.max(1, Number(req.query.page_size || 25)));
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await supabaseAdmin
        .from('scratch_tickets')
        .select('id, user_id, bet_amount_cdf, win_amount_cdf, status, created_at', {
          count: 'exact',
        })
        .order('created_at', { ascending: false })
        .range(from, to);
      if (error) return reply.code(500).send({ error: error.message });

      const ids = Array.from(new Set((data || []).map((t: any) => String(t.user_id))));
      const phoneById = new Map<string, string>();
      if (ids.length > 0) {
        const { data: users } = await supabaseAdmin
          .from('users')
          .select('id, phone')
          .in('id', ids);
        for (const u of users || []) phoneById.set(String(u.id), String(u.phone || ''));
      }

      return reply.send({
        items: (data || []).map((t: any) => ({
          id: t.id,
          phone: maskPhone(phoneById.get(String(t.user_id))),
          bet_amount_cdf: Number(t.bet_amount_cdf || 0),
          win_amount_cdf: Number(t.win_amount_cdf || 0),
          status: t.status,
          created_at: t.created_at,
        })),
        page,
        page_size: pageSize,
        total: count ?? null,
      });
    },
  );

  app.get('/api/admin/scratch/overview', async (_req, reply) => {
    const todayIso = startOfTodayIso();
    const { data, error } = await supabaseAdmin
      .from('scratch_tickets')
      .select('bet_amount_cdf, win_amount_cdf, status, created_at')
      .gte('created_at', todayIso);
    if (error) return reply.code(500).send({ error: error.message });

    let bets_today = 0;
    let wins_today = 0;
    let tickets_today = 0;
    for (const r of data || []) {
      tickets_today++;
      bets_today += Number((r as any).bet_amount_cdf || 0);
      wins_today += Number((r as any).win_amount_cdf || 0);
    }
    return reply.send({
      tickets_today,
      bets_today,
      wins_today,
      // Realised house revenue = bets - wins paid (only on claimed tickets).
      revenue_today: bets_today - wins_today,
    });
  });

  // ---- OKAPI COLOR (admin) ----

  app.get('/api/admin/okapi-color/overview', async (_req, reply) => {
    const todayIso = startOfTodayIso();

    const [ticketRes, jackpotRes] = await Promise.all([
      supabaseAdmin
        .from('okapi_color_tickets')
        .select('prix_cdf, gains_cdf, status, created_at'),
      supabaseAdmin
        .from('okapi_color_jackpot')
        .select('pot_cdf')
        .eq('id', 1)
        .single(),
    ]);

    if (ticketRes.error) return reply.code(500).send({ error: ticketRes.error.message });

    const tickets = ticketRes.data || [];
    let totalVendus = 0, totalEncaisse = 0, totalPaye = 0;
    let todayVendus = 0, todayEncaisse = 0, todayPaye = 0;

    for (const t of tickets) {
      totalVendus++;
      totalEncaisse += Number(t.prix_cdf || 0);
      totalPaye += Number(t.gains_cdf || 0);
      if (t.created_at >= todayIso) {
        todayVendus++;
        todayEncaisse += Number(t.prix_cdf || 0);
        todayPaye += Number(t.gains_cdf || 0);
      }
    }

    const pot = Number(jackpotRes.data?.pot_cdf ?? 0);
    const payoutRate = totalEncaisse > 0 ? ((totalPaye / totalEncaisse) * 100).toFixed(2) + ' %' : 'N/A';

    return reply.send({
      total: { tickets: totalVendus, encaisse_cdf: totalEncaisse, paye_cdf: totalPaye, payout_rate: payoutRate },
      today: { tickets: todayVendus, encaisse_cdf: todayEncaisse, paye_cdf: todayPaye },
      jackpot_pot_cdf: pot,
    });
  });

  app.get<{ Querystring: { page?: string; page_size?: string; status?: string } }>(
    '/api/admin/okapi-color/tickets',
    async (req, reply) => {
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.min(100, Math.max(1, Number(req.query.page_size || 25)));
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabaseAdmin
        .from('okapi_color_tickets')
        .select('id, user_id, numeros, prix_cdf, status, nb_rouges, nb_or, gains_cdf, tirage_id, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (req.query.status) query = query.eq('status', req.query.status);

      const { data, error, count } = await query;
      if (error) return reply.code(500).send({ error: error.message });

      const ids = Array.from(new Set((data || []).map((t: any) => String(t.user_id))));
      const phoneById = new Map<string, string>();
      if (ids.length > 0) {
        const { data: users } = await supabaseAdmin.from('users').select('id, phone').in('id', ids);
        for (const u of users || []) phoneById.set(String(u.id), String(u.phone || ''));
      }

      return reply.send({
        items: (data || []).map((t: any) => ({
          ...t,
          phone: maskPhone(phoneById.get(String(t.user_id))),
        })),
        page, page_size: pageSize, total: count ?? null,
      });
    },
  );

  app.post('/api/admin/okapi-color/draw', async (req, reply) => {
    const { executerTirageOkapiColor, getOkapiColorSlotBoundaries } = await import('./okapi-color.js');
    const { slotKey } = getOkapiColorSlotBoundaries();
    const acquired = await acquireJobLock('okapi_color_draw', `admin:oc:${slotKey}`);
    if (!acquired) {
      return reply.code(409).send({ error: 'Draw already in progress for this slot', slot_key: slotKey });
    }
    try {
      const result = await executerTirageOkapiColor({ reason: 'manual' });
      return reply.send(result);
    } catch (e: any) {
      return reply.code(500).send({ error: e?.message || 'Draw failed' });
    }
  });

  app.get('/api/admin/okapi-color/draws', async (_req, reply) => {
    const { data, error } = await supabaseAdmin
      .from('okapi_color_tirages')
      .select('id, numeros_rouges, numeros_or, hash_pre, jackpot_paye, drawn_at')
      .order('drawn_at', { ascending: false })
      .limit(20);
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ draws: data || [] });
  });

  app.post('/api/admin/okapi-color/jackpot/set', async (req, reply) => {
    const { amount_cdf } = req.body as { amount_cdf: number };
    if (amount_cdf === undefined || amount_cdf === null || Number(amount_cdf) < 0) {
      return reply.code(400).send({ code: 'INVALID_AMOUNT' });
    }
    const newPot = Number(amount_cdf);

    const { data: current } = await supabaseAdmin
      .from('okapi_color_jackpot').select('pot_cdf').eq('id', 1).single();

    const { error } = await supabaseAdmin
      .from('okapi_color_jackpot')
      .update({ pot_cdf: newPot, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', error: error.message });

    await audit(req, 'okapi_color_jackpot_set', null, newPot, null,
      { old_pot: current?.pot_cdf, new_pot: newPot });

    return reply.send({ ok: true, old_pot: current?.pot_cdf, new_pot: newPot });
  });

  app.post('/api/admin/okapi-color/jackpot/credit', async (req, reply) => {
    const { delta_cdf } = req.body as { delta_cdf: number };
    if (delta_cdf === undefined || delta_cdf === null || Number(delta_cdf) === 0) {
      return reply.code(400).send({ code: 'INVALID_AMOUNT' });
    }
    const delta = Number(delta_cdf);

    const { data: current } = await supabaseAdmin
      .from('okapi_color_jackpot').select('pot_cdf').eq('id', 1).single();

    const { error } = await supabaseAdmin.rpc('increment_okapi_color_jackpot', { delta });
    if (error) return reply.code(500).send({ code: 'DB_ERROR', error: error.message });

    const newPot = (Number(current?.pot_cdf) ?? 0) + delta;
    await audit(req, 'okapi_color_jackpot_credit', null, delta, null,
      { old_pot: current?.pot_cdf, new_pot: newPot });

    return reply.send({ ok: true, old_pot: current?.pot_cdf, new_pot: newPot });
  });

  app.get('/api/admin/transactions/export', async (req, reply) => {
    const { data, error } = await buildTxQuery(req.query).limit(10000);
    if (error) return reply.code(500).send({ error: error.message });
    const ids = Array.from(new Set((data || []).map((t: any) => String(t.user_id))));
    const phoneById = new Map<string, string>();
    if (ids.length > 0) {
      const { data: users } = await supabaseAdmin.from('users').select('id, phone').in('id', ids);
      for (const u of users || []) phoneById.set(String(u.id), String(u.phone || ''));
    }
    const header = 'created_at,phone,type,amount_cdf,currency,provider_id,status,order_id,transaction_id\n';
    const rows = (data || []).map((t: any) => {
      const phone = phoneById.get(String(t.user_id)) || '';
      return [
        t.created_at,
        phone,
        t.type,
        Number(t.amount || 0),
        t.currency || 'CDF',
        t.provider_id,
        t.status,
        t.order_id,
        t.transaction_id || '',
      ]
        .map((v) => {
          const s = String(v ?? '');
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(',');
    });
    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="transactions-${Date.now()}.csv"`);
    return reply.send(header + rows.join('\n') + '\n');
  });

  // ================================================================
  // AGENTS
  // ================================================================

  function generateAgentCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return 'AG-' + Array.from({ length: 6 }, () =>
      chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  // GET /api/admin/agents — list all agents with stats
  app.get('/api/admin/agents', async (_req, reply) => {
    const { data, error } = await supabaseAdmin
      .from('agents')
      .select('*, agent_commissions(count)')
      .order('created_at', { ascending: false });
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ agents: data || [] });
  });

  // POST /api/admin/agents — create a new agent
  app.post('/api/admin/agents', { preHandler: requireSuperAdmin }, async (req, reply) => {
    const { display_name, zone, commission_rate, phone, operator, notes } = (req.body as any) || {};
    if (!display_name?.trim()) {
      return reply.code(400).send({ error: 'display_name requis' });
    }
    if (!phone?.trim()) {
      return reply.code(400).send({ error: 'phone requis' });
    }
    if (!operator?.trim()) {
      return reply.code(400).send({ error: 'operator requis' });
    }
    let qr_code = '';
    for (let i = 0; i < 10; i++) {
      const candidate = generateAgentCode();
      const { data: exists } = await supabaseAdmin
        .from('agents').select('id').eq('qr_code', candidate).maybeSingle();
      if (!exists) { qr_code = candidate; break; }
    }
    if (!qr_code) return reply.code(500).send({ error: 'Could not generate unique QR code' });

    const { data, error } = await supabaseAdmin
      .from('agents')
      .insert({
        display_name: String(display_name).trim(),
        qr_code,
        zone:            zone      ? String(zone).trim()     : null,
        commission_rate: commission_rate != null ? Number(commission_rate) : 0.05,
        phone:           phone     ? String(phone).trim()    : null,
        operator:        operator  ? String(operator).trim() : null,
        notes:           notes     ? String(notes).trim()    : null,
      })
      .select()
      .single();
    if (error) return reply.code(500).send({ error: error.message });
    await audit(req, 'agent_create', null, null, null, { qr_code, display_name });
    return reply.code(201).send(data);
  });

  // PATCH /api/admin/agents/:id — update status / zone / commission_rate
  app.patch<{ Params: { id: string } }>(
    '/api/admin/agents/:id',
    { preHandler: requireSuperAdmin },
    async (req, reply) => {
      const { id } = req.params;
      const { status, zone, commission_rate, phone, operator, notes } = (req.body as any) || {};
      const updates: Record<string, unknown> = {};
      if (status          !== undefined) updates.status          = status;
      if (zone            !== undefined) updates.zone            = zone;
      if (commission_rate !== undefined) updates.commission_rate = Number(commission_rate);
      if (phone           !== undefined) updates.phone           = phone;
      if (operator        !== undefined) updates.operator        = operator;
      if (notes           !== undefined) updates.notes           = notes;
      if (!Object.keys(updates).length) {
        return reply.code(400).send({ error: 'Nothing to update' });
      }
      const { data, error } = await supabaseAdmin
        .from('agents').update(updates).eq('id', id).select().single();
      if (error) return reply.code(500).send({ error: error.message });
      await audit(req, 'agent_update', null, null, null, { id, ...updates });
      return reply.send(data);
    },
  );

  // GET /api/admin/agents/:id/commissions — paginated commission list
  app.get<{ Params: { id: string } }>(
    '/api/admin/agents/:id/commissions',
    async (req, reply) => {
      const { id } = req.params;
      const { data, error } = await supabaseAdmin
        .from('agent_commissions')
        .select('*')
        .eq('agent_id', id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) return reply.code(500).send({ error: error.message });
      return reply.send({ commissions: data || [] });
    },
  );

  // POST /api/admin/agents/:id/pay — mark all pending commissions as paid
  app.post<{ Params: { id: string } }>(
    '/api/admin/agents/:id/pay',
    { preHandler: requireSuperAdmin },
    async (req, reply) => {
      const { id } = req.params;

      const { data: pendingRows } = await supabaseAdmin
        .from('agent_commissions')
        .select('commission_cdf')
        .eq('agent_id', id)
        .eq('status', 'pending');
      const paid_cdf = (pendingRows || []).reduce((s, c) => s + Number(c.commission_cdf), 0);

      const { error: payErr } = await supabaseAdmin
        .from('agent_commissions')
        .update({ status: 'paid' })
        .eq('agent_id', id)
        .eq('status', 'pending');
      if (payErr) return reply.code(500).send({ error: payErr.message });

      await supabaseAdmin
        .from('agents')
        .update({ payout_requested_at: null, payout_requested_amount_cdf: null })
        .eq('id', id);

      await audit(req, 'agent_payout', null, null, null, { agent_id: id, paid_cdf });
      return reply.send({ ok: true, paid_cdf });
    },
  );

}

export { requireAdmin, requireSuperAdmin };
