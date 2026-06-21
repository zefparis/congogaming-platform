import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import cookie from '@fastify/cookie';
import authPlugin from './plugins/auth.js';
import authRoutes from './modules/auth/routes.js';
import depositRoutes from './routes/deposit.js';
import withdrawRoutes from './routes/withdraw.js';
import callbackRoutes from './routes/callback.js';
import statusRoutes from './routes/status.js';
import transactionsRoutes from './routes/transactions.js';
import meRoutes from './routes/me.js';
import lotoRoutes from './routes/loto.js';
import flashRoutes from './routes/flash.js';
import { okapiRoutes } from './routes/okapi.js';
import okapiAutoRoutes from './routes/okapi-auto.js';
import walletRoutes from './routes/wallet.js';
import adminRoutes from './routes/admin.js';
import agentsPublicRoutes from './routes/agents.js';
import kycRoutes from './routes/kyc.js';
import scratchRoutes from './routes/scratch.js';
import okapiColorRoutes from './routes/okapi-color.js';
import cgltRoutes from './routes/cglt.js';
import farmingRoutes from './routes/farming.js';
import predictstreetRoutes from './routes/predictstreet.js';
import { engine } from './lib/okapi-engine.js';
import { startCrons } from './cron.js';
import { env } from './env.js';

const isProduction = env.NODE_ENV === 'production';

const app = Fastify({
  logger: isProduction ? { level: 'warn' } : true,
  trustProxy: true,
});

await app.register(cors, {
  origin: env.ALLOWED_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean) || [
    'https://congogaming.com',
    'https://www.congogaming.com',
    'https://congogaming-platform-staging.vercel.app',
    'http://localhost:5173',
  ],
  credentials: true,
});

await app.register(cookie, {
  secret: env.JWT_SECRET,
  hook: 'onRequest',
  parseOptions: {
    secure: isProduction,
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
  },
});

// CGNAT in DRC: many users share the same public IP. Key the limiter
// by authenticated session cookie when available, otherwise fall back
// to IP. Keeps abuse protection without punishing legitimate users
// behind a shared NAT. Must be registered after @fastify/cookie so
// that req.cookies is populated when keyGenerator runs.
await app.register(rateLimit, {
  max: 600,
  timeWindow: '1 minute',
  keyGenerator: (req: any) => {
    const token = req.cookies?.['cg_access_token'];
    if (token) return `tok:${token.slice(-32)}`;
    const xff = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
    return `ip:${xff || req.ip}`;
  },
});
await app.register(authPlugin);

await app.register(websocket);

app.addHook('onSend', async (_req, reply) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
});

app.get('/health', async () => ({ ok: true, service: 'congo-gaming-api' }));

if (!isProduction) {
  app.get('/api/myip', async (req, reply) => {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = await res.json();
    return { ip: data.ip };
  });
}

await app.register(authRoutes);
await app.register(depositRoutes);
await app.register(withdrawRoutes);
await app.register(callbackRoutes);
await app.register(statusRoutes);
await app.register(transactionsRoutes);
await app.register(meRoutes);
await app.register(lotoRoutes);
await app.register(flashRoutes);
await app.register(okapiRoutes);
await app.register(okapiAutoRoutes);
await app.register(walletRoutes);
await app.register(agentsPublicRoutes);
await app.register(adminRoutes);
await app.register(kycRoutes);
await app.register(scratchRoutes);
await app.register(okapiColorRoutes);
await app.register(cgltRoutes);
await app.register(farmingRoutes);
await app.register(predictstreetRoutes);

const port = env.PORT;
const host = env.HOST;

const server = await app.listen({ port, host });
app.log.info(`API listening on http://${host}:${port}`);
app.log.info('Registered routes:\n' + app.printRoutes());
startCrons();
engine.start();
app.log.info('Okapi Climb engine started');

const gracefulShutdown = async (signal: string) => {
  app.log.info(`${signal} received, starting graceful shutdown...`);
  await app.close();
  app.log.info('Fastify server closed');
  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
