import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { authCookieName, verifyAccessToken } from '../modules/auth/jwt.js';

export type RequestUser = {
  id: string;
  phone: string;
};

declare module 'fastify' {
  interface FastifyRequest {
    user: RequestUser;
  }
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

function extractToken(req: FastifyRequest): string | null {
  const fromCookie = req.cookies?.[authCookieName];
  if (fromCookie) return fromCookie;
  const auth = req.headers.authorization;
  if (typeof auth === 'string') {
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]) return match[1];
  }
  return null;
}

export default fp(async (app) => {
  app.decorate('requireAuth', async (req, reply) => {
    const token = extractToken(req);
    if (!token) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }
    try {
      const payload = verifyAccessToken(token);
      req.user = { id: payload.sub, phone: payload.phone };
    } catch {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });
});
