import type { FastifyPluginAsync } from 'fastify';
import { LoginSchema, RegisterSchema, type LoginInput, type RegisterInput } from './schemas.js';
import { getUserById, loginUser, registerUser } from './service.js';
import { authCookieName, authCookieOptions, signAccessToken } from './jwt.js';

function toAuthError(error: unknown): { status: number; message: string } {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg === 'PHONE_ALREADY_REGISTERED') return { status: 409, message: 'Numéro déjà inscrit' };
  if (msg === 'INVALID_CREDENTIALS') return { status: 401, message: 'Identifiants invalides' };
  if (msg === 'ACCOUNT_BLOCKED') return { status: 403, message: 'Compte bloqué' };
  if (msg === 'ACCOUNT_TEMP_LOCKED') return { status: 429, message: 'Compte temporairement verrouillé' };
  return { status: 500, message: 'Erreur auth' };
}

const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/auth/register', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
  }, async (req, reply) => {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message || 'Invalid body' });
    try {
      const user = await registerUser({ phone: parsed.data.phone, pin: parsed.data.pin });
      const token = signAccessToken({ userId: user.id, phone: user.phone });
      reply.setCookie(authCookieName, token, authCookieOptions());
      return reply.code(201).send({ user });
    } catch (error) {
      const e = toAuthError(error);
      return reply.code(e.status).send({ error: e.message });
    }
  });

  app.post('/api/auth/login', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (req, reply) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message || 'Invalid body' });
    try {
      const user = await loginUser({ phone: parsed.data.phone, pin: parsed.data.pin });
      const token = signAccessToken({ userId: user.id, phone: user.phone });
      reply.setCookie(authCookieName, token, authCookieOptions());
      return reply.send({ user });
    } catch (error) {
      const e = toAuthError(error);
      return reply.code(e.status).send({ error: e.message });
    }
  });

  app.post('/api/auth/logout', async (_req, reply) => {
    reply.clearCookie(authCookieName, { path: '/' });
    return reply.send({ ok: true });
  });

  app.get('/api/auth/me', { preHandler: app.requireAuth }, async (req, reply) => {
    const user = await getUserById(req.user.id);
    if (!user || user.blocked) return reply.code(401).send({ error: 'Unauthorized' });
    return reply.send({ user });
  });
};

export default authRoutes;
