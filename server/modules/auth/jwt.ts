import crypto from 'node:crypto';
import type { JwtUserPayload } from './types.js';
import { env } from '../../env.js';

const ACCESS_TOKEN_TTL_SECONDS = env.ACCESS_TOKEN_TTL_SECONDS;

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function getJwtSecret(): string {
  const secret = env.JWT_SECRET;
  if (secret.length < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters');
  }
  return secret;
}

export function signAccessToken(input: { userId: string; phone: string }): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtUserPayload = {
    sub: input.userId,
    phone: input.phone,
    iat: now,
    exp: now + ACCESS_TOKEN_TTL_SECONDS,
  };
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac('sha256', getJwtSecret())
    .update(data)
    .digest('base64url');
  return `${data}.${signature}`;
}

export function verifyAccessToken(token: string): JwtUserPayload {
  const [encodedHeader, encodedPayload, signature] = token.split('.');
  if (!encodedHeader || !encodedPayload || !signature) throw new Error('Invalid token');
  const data = `${encodedHeader}.${encodedPayload}`;
  const expected = crypto
    .createHmac('sha256', getJwtSecret())
    .update(data)
    .digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error('Invalid token signature');
  }
  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as JwtUserPayload;
  if (!payload.sub || !payload.phone || !payload.exp) throw new Error('Invalid token payload');
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired');
  return payload;
}

export const authCookieName = 'cg_access_token';

export function authCookieOptions() {
  const isProduction = env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax',
    path: '/',
    maxAge: ACCESS_TOKEN_TTL_SECONDS,
  };
}
