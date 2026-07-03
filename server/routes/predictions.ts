import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabaseAdmin, adjustBalance } from '../lib/supabase.js';
import { requireAdmin } from './admin.js';

const OPENFOOTBALL_URL =
  'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';
const CACHE_TTL_MS = 5 * 60 * 1000;

interface MatchRaw {
  num?: number;
  date: string;
  time?: string;
  team1?: unknown;
  team2?: unknown;
  score?: unknown;
  group?: string;
  [key: string]: unknown;
}


let matchCache: { data: unknown[]; fetchedAt: number } | null = null;

const LIVE_CACHE_TTL = 60_000;

type LiveMatch = {
  id: string;
  team1: string;
  team2: string;
  score1: number;
  score2: number;
  status: 'in_progress' | 'final' | 'scheduled';
  clock: string;
  date: string;
};

let liveCache: { data: LiveMatch[]; ts: number } | null = null;

async function fetchLiveMatches(): Promise<LiveMatch[]> {
  // PRIMARY: worldcup26.ir
  try {
    const res = await fetch('https://worldcup26.ir/get/games', {
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const data = await res.json() as { games?: unknown[] };
      return (data.games as Record<string, unknown>[]).map((g) => ({
        id:     String(g.id ?? ''),
        team1:  String(g.home_team_name_en ?? ''),
        team2:  String(g.away_team_name_en ?? ''),
        score1: parseInt(String(g.home_score ?? '0'), 10),
        score2: parseInt(String(g.away_score ?? '0'), 10),
        status: String(g.finished).toUpperCase() === 'TRUE' ? 'final'
              : String(g.time_elapsed) === 'notstarted'
                || String(g.time_elapsed) === ''
                || String(g.time_elapsed) === 'null'
                || g.time_elapsed === null ? 'scheduled'
              : 'in_progress',
        clock:  String(g.time_elapsed ?? ''),
        date:   String(g.local_date ?? ''),
      })) as LiveMatch[];
    }
  } catch { /* fall through to ESPN */ }

  // FALLBACK: ESPN
  try {
    const res = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard',
      { signal: AbortSignal.timeout(5000) }
    );
    if (res.ok) {
      const data = await res.json() as { events?: unknown[] };
      return ((data.events ?? []) as Record<string, unknown>[]).map((e: Record<string, unknown>) => {
        const comps = (e.competitions as Record<string, unknown>[])?.[0];
        const competitors = (comps?.competitors as Record<string, unknown>[]) ?? [];
        const home = competitors.find((c: Record<string, unknown>) => c.homeAway === 'home') ?? {};
        const away = competitors.find((c: Record<string, unknown>) => c.homeAway === 'away') ?? {};
        const status = (comps?.status as Record<string, unknown>)?.type as Record<string, unknown>;
        return {
          id:     String(e.id ?? ''),
          team1:  String((home.team as Record<string, unknown>)?.displayName ?? ''),
          team2:  String((away.team as Record<string, unknown>)?.displayName ?? ''),
          score1: parseInt(String(home.score ?? '0'), 10),
          score2: parseInt(String(away.score ?? '0'), 10),
          status: (status?.name === 'STATUS_IN_PROGRESS' ? 'in_progress'
                : status?.name === 'STATUS_FINAL' ? 'final'
                : 'scheduled') as LiveMatch['status'],
          clock:  String((comps?.status as Record<string, unknown>)?.displayClock ?? ''),
          date:   String(e.date ?? ''),
        };
      });
    }
  } catch { /* nothing */ }

  return [];
}

export default async function predictionsRoutes(app: FastifyInstance) {
  // POST /api/predictions
  app.post<{
    Body: {
      match_id: string;
      prediction_type: 'winner' | 'score_exact';
      predicted_winner?: string;
      predicted_score_home?: number;
      predicted_score_away?: number;
      points_wagered: number;
    };
  }>(
    '/api/predictions',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const {
        match_id,
        prediction_type,
        predicted_winner,
        predicted_score_home,
        predicted_score_away,
        points_wagered,
      } = req.body ?? {};

      if (!match_id || typeof match_id !== 'string') {
        return reply.code(400).send({ error: 'INVALID_INPUT', field: 'match_id' });
      }
      if (prediction_type !== 'winner' && prediction_type !== 'score_exact') {
        return reply.code(400).send({ error: 'INVALID_PREDICTION_TYPE' });
      }
      if (!Number.isInteger(points_wagered) || points_wagered < 100 || points_wagered > 10000) {
        return reply.code(400).send({ error: 'INVALID_AMOUNT' });
      }
      if (prediction_type === 'winner' && !predicted_winner) {
        return reply.code(400).send({ error: 'MISSING_PREDICTED_WINNER' });
      }
      if (prediction_type === 'winner' && predicted_winner && predicted_winner.length > 100) {
        return reply.code(400).send({ error: 'INVALID_PREDICTED_WINNER' });
      }
      if (
        prediction_type === 'score_exact' &&
        (predicted_score_home === undefined || predicted_score_away === undefined)
      ) {
        return reply.code(400).send({ error: 'MISSING_SCORE' });
      }

      const user_id = req.user.id;

      // (b) Check match exists and is not finished.
      // liveCache refreshes every 60 s; matchCache every 5 min — a cache miss
      // in normal operation is rare. Fail-closed: unknown match_id is rejected
      // to prevent predictions on stale or fabricated match IDs.
      const liveMatch = liveCache?.data.find((m) => m.id === match_id);
      const upcomingMatch = (matchCache?.data as MatchRaw[])?.find(
        (m) => String(m.num ?? '') === match_id,
      );
      if (!liveMatch && !upcomingMatch) {
        return reply.code(400).send({ error: 'MATCH_NOT_FOUND', message: 'Match introuvable ou données indisponibles' });
      }
      if (liveMatch?.status === 'final') {
        return reply.code(400).send({ error: 'MATCH_FINISHED' });
      }
      if (upcomingMatch?.score != null) {
        return reply.code(400).send({ error: 'MATCH_FINISHED' });
      }

      // (c) Check no duplicate bet
      const { data: existingBet, error: dupErr } = await supabaseAdmin
        .from('predictions')
        .select('id')
        .eq('user_id', user_id)
        .eq('match_id', match_id)
        .in('status', ['pending', 'won', 'lost'])
        .maybeSingle();
      if (dupErr) {
        req.log.error({ err: dupErr }, '[predictions/create] duplicate check failed');
        return reply.code(500).send({ error: 'SERVER_ERROR' });
      }
      if (existingBet) {
        return reply.code(409).send({ error: 'ALREADY_BET', message: 'Vous avez déjà parié sur ce match' });
      }

      // (d) Check balance sufficient
      try {
        await adjustBalance(user_id, -points_wagered);
      } catch {
        return reply.code(409).send({ error: 'INSUFFICIENT_BALANCE' });
      }

      const { data, error } = await supabaseAdmin
        .from('predictions')
        .insert({
          user_id,
          match_id,
          prediction_type,
          predicted_winner: predicted_winner ?? null,
          predicted_score_home: predicted_score_home ?? null,
          predicted_score_away: predicted_score_away ?? null,
          points_wagered,
        })
        .select('id')
        .single();

      if (error || !data) {
        // DB-level unique constraint (unique_user_match_active_bet) is the
        // authoritative guard; the SELECT above is just a fast-path optimisation.
        if ((error as any)?.code === '23505') {
          try { await adjustBalance(user_id, points_wagered); } catch { /* ignore */ }
          return reply.code(409).send({ error: 'ALREADY_BET', message: 'Vous avez déjà parié sur ce match' });
        }
        try {
          await adjustBalance(user_id, points_wagered);
        } catch { /* ignore refund failure */ }
        req.log.error({ err: error }, '[predictions/create] insert failed');
        return reply.code(500).send({ error: 'INSERT_FAILED' });
      }

      return reply.send({ ok: true, prediction_id: data.id });
    },
  );

  // GET /api/predictions — returns only the authenticated user's own predictions.
  // NOTE: if admin tooling ever needs to query another user's predictions it must
  // go through a dedicated requireAdmin route, not a query-param override here.
  app.get(
    '/api/predictions',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const user_id = req.user.id;

      const { data, error } = await supabaseAdmin
        .from('predictions')
        .select('*')
        .eq('user_id', user_id)
        .order('created_at', { ascending: false });

      if (error) return reply.code(500).send({ error: error.message });
      return reply.send({ predictions: data ?? [] });
    },
  );

  // GET /api/leaderboard
  app.get('/api/leaderboard', async (req, reply) => {
    const { data: preds, error: predErr } = await supabaseAdmin
      .from('predictions')
      .select('user_id, points_won')
      .not('points_won', 'is', null);

    if (predErr) return reply.code(500).send({ error: predErr.message });

    const totals = new Map<string, number>();
    for (const p of preds ?? []) {
      const won = Number(p.points_won ?? 0);
      totals.set(p.user_id, (totals.get(p.user_id) ?? 0) + won);
    }

    const top10 = [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    if (top10.length === 0) return reply.send({ leaderboard: [] });

    const userIds = top10.map(([id]) => id);
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, display_name, phone')
      .in('id', userIds);

    const userMap = new Map((users ?? []).map((u) => [u.id, u]));

    const leaderboard = top10.map(([user_id, total_points_won]) => {
      const u = userMap.get(user_id);
      return {
        user_id,
        total_points_won,
        display_name: u?.display_name ?? null,
        phone: u?.phone ?? null,
      };
    });

    return reply.send({ leaderboard });
  });

  // GET /api/matches/upcoming
  app.get('/api/matches/upcoming', async (_req, reply) => {
    const now = Date.now();
    if (matchCache && now - matchCache.fetchedAt < CACHE_TTL_MS) {
      return reply.send({ matches: matchCache.data });
    }

    try {
      const res = await fetch(OPENFOOTBALL_URL);
      if (!res.ok) throw new Error(`Upstream returned ${res.status}`);
      const json = (await res.json()) as { matches: MatchRaw[] };

      const allMatches = json.matches ?? [];

      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const relevantMatches = allMatches.filter(
        (m) => new Date(m.date) >= threeDaysAgo,
      );

      const result = relevantMatches.length > 0 ? relevantMatches : allMatches.slice(-10);

      matchCache = { data: result, fetchedAt: now };
      return reply.send({ matches: result });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.code(502).send({ error: 'UPSTREAM_FETCH_FAILED', detail: msg });
    }
  });

  // GET /api/matches/live
  app.get('/api/matches/live', async (_request, reply) => {
    const now = Date.now();
    if (liveCache && now - liveCache.ts < LIVE_CACHE_TTL) {
      return reply.send({ matches: liveCache.data, cached: true });
    }
    const matches = await fetchLiveMatches();
    liveCache = { data: matches, ts: now };
    return reply.send({ matches, cached: false });
  });

  // POST /api/predictions/resolve (admin only)
  app.post<{
    Body: {
      match_id: string;
      actual_score_home: number;
      actual_score_away: number;
    };
  }>(
    '/api/predictions/resolve',
    { preHandler: requireAdmin as (req: FastifyRequest, reply: FastifyReply) => Promise<void> },
    async (req, reply) => {
      const { match_id, actual_score_home, actual_score_away } = req.body ?? {};

      if (
        !match_id ||
        typeof match_id !== 'string' ||
        actual_score_home === undefined ||
        actual_score_away === undefined
      ) {
        return reply.code(400).send({ error: 'INVALID_INPUT' });
      }

      const { data: preds, error: fetchErr } = await supabaseAdmin
        .from('predictions')
        .select('*')
        .eq('match_id', match_id)
        .eq('status', 'pending');

      if (fetchErr) return reply.code(500).send({ error: fetchErr.message });
      if (!preds || preds.length === 0) return reply.send({ ok: true, resolved: 0 });

      let actual_winner: string | null = null;
      if (actual_score_home > actual_score_away) actual_winner = 'home';
      else if (actual_score_away > actual_score_home) actual_winner = 'away';

      let resolved = 0;

      for (const pred of preds) {
        let won = false;
        let multiplier = 0;

        if (pred.prediction_type === 'winner') {
          won = pred.predicted_winner === actual_winner;
          multiplier = 2;
        } else if (pred.prediction_type === 'score_exact') {
          won =
            pred.predicted_score_home === actual_score_home &&
            pred.predicted_score_away === actual_score_away;
          multiplier = 5;
        }

        const points_won = won ? (pred.points_wagered as number) * multiplier : 0;
        const status = won ? 'won' : 'lost';

        const { error: updateErr } = await supabaseAdmin
          .from('predictions')
          .update({ status, points_won, updated_at: new Date().toISOString() })
          .eq('id', pred.id);

        if (updateErr) {
          req.log.error({ err: updateErr, pred_id: pred.id }, '[predictions/resolve] update failed');
          continue;
        }

        if (won && points_won > 0) {
          try {
            await adjustBalance(pred.user_id as string, points_won);
          } catch (e) {
            req.log.error(
              { err: e, pred_id: pred.id, user_id: pred.user_id },
              '[predictions/resolve] balance credit failed',
            );
          }
        }

        resolved++;
      }

      return reply.send({ ok: true, resolved });
    },
  );
}
