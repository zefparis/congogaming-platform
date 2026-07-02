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

interface RoundRaw {
  name?: string;
  matches?: MatchRaw[];
}

interface OpenfootballJson {
  rounds?: RoundRaw[];
}

let matchCache: { data: unknown[]; fetchedAt: number } | null = null;

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
      if (!Number.isInteger(points_wagered) || points_wagered <= 0) {
        return reply.code(400).send({ error: 'INVALID_POINTS_WAGERED' });
      }
      if (prediction_type === 'winner' && !predicted_winner) {
        return reply.code(400).send({ error: 'MISSING_PREDICTED_WINNER' });
      }
      if (
        prediction_type === 'score_exact' &&
        (predicted_score_home === undefined || predicted_score_away === undefined)
      ) {
        return reply.code(400).send({ error: 'MISSING_SCORE' });
      }

      const user_id = req.user.id;

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
        try {
          await adjustBalance(user_id, points_wagered);
        } catch { /* ignore refund failure */ }
        req.log.error({ err: error }, '[predictions/create] insert failed');
        return reply.code(500).send({ error: 'INSERT_FAILED' });
      }

      return reply.send({ ok: true, prediction_id: data.id });
    },
  );

  // GET /api/predictions?user_id=xxx
  app.get<{ Querystring: { user_id?: string } }>(
    '/api/predictions',
    async (req, reply) => {
      const { user_id } = req.query;
      if (!user_id) return reply.code(400).send({ error: 'MISSING_USER_ID' });

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
      const json = (await res.json()) as OpenfootballJson;

      const today = new Date().toISOString().split('T')[0];
      const upcoming: unknown[] = [];

      for (const round of json.rounds ?? []) {
        for (const match of round.matches ?? []) {
          if (match.date >= today) {
            upcoming.push({ ...match, round_name: round.name ?? null });
          }
        }
      }

      matchCache = { data: upcoming, fetchedAt: now };
      return reply.send({ matches: upcoming });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.code(502).send({ error: 'UPSTREAM_FETCH_FAILED', detail: msg });
    }
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
