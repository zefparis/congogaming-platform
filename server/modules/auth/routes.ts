import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { CongoPhoneSchema, LoginSchema, RegisterSchema, type LoginInput, type RegisterInput } from './schemas.js';
import { AuthLockedError, InvalidCredentialsError, changePin, getUserById, linkAgentRef, loginUser, registerUser, resetPinByPhone, updateDisplayName } from './service.js';

import { authCookieName, authCookieOptions, signAccessToken } from './jwt.js';

const ResetPinSchema = z.object({
  phone: CongoPhoneSchema,
  newPin: z.string().regex(/^\d{4}$/, 'INVALID_PIN_FORMAT'),
});

// Key auth limiters by the phone number in the body (identity) rather
// than by IP, since hundreds of legitimate users in DRC can share a
// CGNAT IP. Falls back to IP when phone is missing/invalid.
const phoneKeyGenerator = (req: any) => {
  const phone = typeof req?.body?.phone === 'string' ? req.body.phone.replace(/\D/g, '') : '';
  if (phone) return `phone:${phone}`;
  const xff = (req.headers?.['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
  return `ip:${xff || req.ip}`;
};

type AuthErrorPayload = {
  status: number;
  code?: string;
  message: string;
  lockedUntil?: string;
  retryAfterSeconds?: number;
  attemptsRemaining?: number;
};

function toAuthError(error: unknown): AuthErrorPayload {
  if (error instanceof AuthLockedError) {
    return {
      status: 429,
      code: 'ACCOUNT_TEMP_LOCKED',
      message: 'ACCOUNT_TEMP_LOCKED',
      lockedUntil: error.lockedUntil.toISOString(),
      retryAfterSeconds: error.retryAfterSeconds,
    };
  }
  if (error instanceof InvalidCredentialsError) {
    return { status: 401, code: 'INVALID_CREDENTIALS', message: 'INVALID_CREDENTIALS', attemptsRemaining: error.attemptsRemaining };
  }
  const msg = error instanceof Error ? error.message : String(error);
  if (msg === 'PHONE_ALREADY_REGISTERED') return { status: 409, code: 'PHONE_ALREADY_REGISTERED', message: 'PHONE_ALREADY_REGISTERED' };
  if (msg === 'INVALID_CREDENTIALS') return { status: 401, code: 'INVALID_CREDENTIALS', message: 'INVALID_CREDENTIALS' };
  if (msg === 'ACCOUNT_BLOCKED') return { status: 403, code: 'ACCOUNT_BLOCKED', message: 'ACCOUNT_BLOCKED' };
  if (msg === 'ACCOUNT_TEMP_LOCKED') return { status: 429, code: 'ACCOUNT_TEMP_LOCKED', message: 'ACCOUNT_TEMP_LOCKED' };
  if (msg === 'PIN_RESET_REQUIRED') return { status: 409, code: 'PIN_RESET_REQUIRED', message: 'PIN_RESET_REQUIRED' };
  return { status: 500, code: 'AUTH_ERROR', message: 'AUTH_ERROR' };
}

const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/auth/register', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes', keyGenerator: phoneKeyGenerator } },
  }, async (req, reply) => {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message || 'Invalid body' });
    try {
      const user = await registerUser({
        phone:        parsed.data.phone,
        pin:          parsed.data.pin,
        referralCode: parsed.data.referralCode ?? null,
        agentRef:     parsed.data.agentRef     ?? null,
      });
      const token = signAccessToken({ userId: user.id, phone: user.phone });
      reply.setCookie(authCookieName, token, authCookieOptions());
      return reply.code(201).send({ user });
    } catch (error) {
      const e = toAuthError(error);
      return reply.code(e.status).send({ error: e.message, ...(e.code ? { code: e.code } : {}) });
    }
  });

  app.post('/api/auth/login', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes', keyGenerator: phoneKeyGenerator } },
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
      if (e.retryAfterSeconds) reply.header('Retry-After', String(e.retryAfterSeconds));
      return reply.code(e.status).send({
        error: e.message,
        ...(e.code ? { code: e.code } : {}),
        ...(e.lockedUntil ? { lockedUntil: e.lockedUntil } : {}),
        ...(e.retryAfterSeconds ? { retryAfterSeconds: e.retryAfterSeconds } : {}),
        ...(typeof e.attemptsRemaining === 'number' ? { attemptsRemaining: e.attemptsRemaining } : {}),
      });
    }
  });

  app.post('/api/auth/reset-pin', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes', keyGenerator: phoneKeyGenerator } },
  }, async (req, reply) => {
    const parsed = ResetPinSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_PIN_FORMAT', code: 'INVALID_PIN_FORMAT' });
    }
    try {
      await resetPinByPhone({ phone: parsed.data.phone, newPin: parsed.data.newPin });
      return reply.send({ ok: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg === 'INVALID_PIN_FORMAT') return reply.code(400).send({ error: 'INVALID_PIN_FORMAT', code: 'INVALID_PIN_FORMAT' });
      if (msg === 'USER_NOT_FOUND') return reply.code(404).send({ error: 'USER_NOT_FOUND', code: 'USER_NOT_FOUND' });
      if (msg === 'PIN_RESET_NOT_REQUIRED') return reply.code(409).send({ error: 'PIN_RESET_NOT_REQUIRED', code: 'PIN_RESET_NOT_REQUIRED' });
      req.log.error({ err: msg }, 'reset-pin failed');
      return reply.code(500).send({ error: 'RESET_PIN_FAILED', code: 'RESET_PIN_FAILED' });
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

  const ChangePinSchema = z.object({
    currentPin: z.string().regex(/^\d{4}$/, 'INVALID_PIN_FORMAT'),
    newPin: z.string().regex(/^\d{4}$/, 'INVALID_PIN_FORMAT'),
  });

  app.post('/api/auth/me/change-pin', {
    preHandler: app.requireAuth,
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (req, reply) => {
    const parsed = ChangePinSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_PIN_FORMAT', code: 'INVALID_PIN_FORMAT' });
    }
    try {
      await changePin({
        userId: req.user.id,
        currentPin: parsed.data.currentPin,
        newPin: parsed.data.newPin,
      });
      return reply.send({ ok: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg === 'CURRENT_PIN_INVALID') return reply.code(401).send({ error: 'CURRENT_PIN_INVALID', code: 'CURRENT_PIN_INVALID' });
      if (msg === 'PIN_SAME_AS_CURRENT') return reply.code(400).send({ error: 'PIN_SAME_AS_CURRENT', code: 'PIN_SAME_AS_CURRENT' });
      if (msg === 'INVALID_PIN_FORMAT') return reply.code(400).send({ error: 'INVALID_PIN_FORMAT', code: 'INVALID_PIN_FORMAT' });
      if (msg === 'PIN_RESET_REQUIRED') return reply.code(409).send({ error: 'PIN_RESET_REQUIRED', code: 'PIN_RESET_REQUIRED' });
      if (msg === 'USER_NOT_FOUND') return reply.code(404).send({ error: 'USER_NOT_FOUND', code: 'USER_NOT_FOUND' });
      req.log.error({ err: msg }, 'change-pin failed');
      return reply.code(500).send({ error: 'CHANGE_PIN_FAILED', code: 'CHANGE_PIN_FAILED' });
    }
  });

  const ProfileSchema = z.object({
    display_name: z.union([z.string().min(2).max(24), z.null()]),
  });

  app.post('/api/auth/link-agent', {
    preHandler: app.requireAuth,
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
  }, async (req, reply) => {
    const { agentRef } = (req.body as any) || {};
    if (!agentRef || !/^AG-[A-Z0-9]{6}$/i.test(String(agentRef).trim())) {
      return reply.code(400).send({ error: 'Format agentRef invalide' });
    }
    try {
      const result = await linkAgentRef(req.user.id, String(agentRef).trim());
      return reply.send({ ok: true, linked: result.linked });
    } catch (error) {
      req.log.error({ err: error }, 'link-agent failed');
      return reply.code(500).send({ error: 'LINK_AGENT_FAILED' });
    }
  });

  app.patch('/api/auth/me/profile', {
    preHandler: app.requireAuth,
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
  }, async (req, reply) => {
    const parsed = ProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'DISPLAY_NAME_INVALID', code: 'DISPLAY_NAME_INVALID' });
    }
    try {
      const user = await updateDisplayName(req.user.id, parsed.data.display_name);
      return reply.send({ user });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg === 'DISPLAY_NAME_TAKEN') return reply.code(409).send({ error: 'DISPLAY_NAME_TAKEN', code: 'DISPLAY_NAME_TAKEN' });
      if (msg === 'DISPLAY_NAME_INVALID_LENGTH') return reply.code(400).send({ error: 'DISPLAY_NAME_INVALID', code: 'DISPLAY_NAME_INVALID' });
      if (msg === 'DISPLAY_NAME_INVALID_CHARS') return reply.code(400).send({ error: 'DISPLAY_NAME_INVALID_CHARS', code: 'DISPLAY_NAME_INVALID_CHARS' });
      if (msg === 'USER_NOT_FOUND') return reply.code(404).send({ error: 'USER_NOT_FOUND', code: 'USER_NOT_FOUND' });
      req.log.error({ err: msg }, 'update display_name failed');
      return reply.code(500).send({ error: 'PROFILE_UPDATE_FAILED', code: 'PROFILE_UPDATE_FAILED' });
    }
  });
};

export default authRoutes;
