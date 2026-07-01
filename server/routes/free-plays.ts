import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { requireAdmin } from './admin.js';

const FreePlaysAdminCreditSchema = z.object({
  user_id: z.string().uuid(),
  plays: z.number().int().positive(),
  expires_days: z.number().int().positive().default(7),
  source: z.string().min(1).max(64).default('admin'),
});

const FREE_PLAYS_PER_TEST = 5;

export default async function freePlaysRoutes(app: FastifyInstance) {
  // GET /api/free-plays/balance — returns current plays_remaining for the user
  app.get(
    '/api/free-plays/balance',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      try {
        const user_id = req.user.id;
        const { data, error } = await supabaseAdmin
          .from('free_plays')
          .select('plays_remaining')
          .eq('user_id', user_id)
          .gt('expires_at', new Date().toISOString());

        if (error) {
          req.log.error({ err: error }, '[free-plays/balance]');
          return reply.code(500).send({ error: error.message });
        }

        const total = (data || []).reduce((sum, row) => sum + (row.plays_remaining ?? 0), 0);
        return reply.send({ plays_remaining: total });
      } catch (e: any) {
        req.log.error({ err: e }, '[free-plays/balance]');
        return reply.code(500).send({ error: e.message ?? 'server_error' });
      }
    },
  );

  // POST /api/free-plays/credit — one-time credit after cognitive test
  // Idempotent: if user already has a non-expired row, does not add more.
  app.post<{ Body: { source?: string } }>(
    '/api/free-plays/credit',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      try {
        const user_id = req.user.id;
        const source = req.body?.source || 'cognitive_test';

        // Check for existing non-expired free_plays row
        const { data: existing, error: selErr } = await supabaseAdmin
          .from('free_plays')
          .select('id, plays_remaining')
          .eq('user_id', user_id)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();

        if (selErr) {
          req.log.error({ err: selErr }, '[free-plays/credit] select');
          return reply.code(500).send({ error: selErr.message });
        }

        if (existing) {
          // Already credited — idempotent response
          return reply.send({ plays_remaining: existing.plays_remaining, credited: false });
        }

        // Insert new free plays row
        const { data: inserted, error: insErr } = await supabaseAdmin
          .from('free_plays')
          .insert({
            user_id,
            plays_remaining: FREE_PLAYS_PER_TEST,
            source,
          })
          .select('plays_remaining')
          .single();

        if (insErr || !inserted) {
          req.log.error({ err: insErr }, '[free-plays/credit] insert');
          return reply.code(500).send({ error: insErr?.message || 'insert_failed' });
        }

        return reply.code(201).send({ plays_remaining: inserted.plays_remaining, credited: true });
      } catch (e: any) {
        req.log.error({ err: e }, '[free-plays/credit]');
        return reply.code(500).send({ error: e.message ?? 'server_error' });
      }
    },
  );

  // POST /api/admin/free-plays/credit — admin-only credit of free plays to a user.
  app.post(
    '/api/admin/free-plays/credit',
    { preHandler: requireAdmin },
    async (req, reply) => {
      try {
        const parsed = FreePlaysAdminCreditSchema.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({ error: parsed.error.issues[0]?.message || 'Invalid body' });
        }
        const { user_id, plays, expires_days, source } = parsed.data;
        const expires_at = new Date(Date.now() + expires_days * 24 * 60 * 60 * 1000).toISOString();

        const { data, error } = await supabaseAdmin
          .from('free_plays')
          .insert({
            user_id,
            plays_remaining: plays,
            source,
            expires_at,
          })
          .select('id, plays_remaining, expires_at')
          .single();

        if (error) {
          req.log.error({ err: error }, '[admin/free-plays/credit] insert');
          return reply.code(500).send({ error: error.message });
        }

        return reply.code(201).send({
          id: data.id,
          plays_remaining: data.plays_remaining,
          expires_at: data.expires_at,
        });
      } catch (e: any) {
        req.log.error({ err: e }, '[admin/free-plays/credit]');
        return reply.code(500).send({ error: e.message ?? 'server_error' });
      }
    },
  );
}
