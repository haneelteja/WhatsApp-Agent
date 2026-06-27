import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import formbody from '@fastify/formbody';
import multipart from '@fastify/multipart';

import { webhookRoutes } from './routes/webhook/index.js';
import { conversationRoutes } from './routes/conversations/index.js';
import { kbRoutes } from './routes/kb/index.js';
import { kbDocumentRoutes } from './routes/kb/documents.js';
import { escalationRoutes } from './routes/escalations/index.js';
import { orderRoutes, razorpayWebhookRoute, phonePeWebhookRoute } from './routes/orders/index.js';
import { settingsRoutes } from './routes/settings/index.js';
import { startScheduler } from './jobs/scheduler.js';
import { getServerClient } from '@alphabot/database';
import { getRedis } from './lib/redis.js';
import { initSentry, captureException } from './lib/sentry.js';

initSentry();

const isProd = process.env['NODE_ENV'] === 'production';
const server = Fastify({
  logger: isProd
    ? { level: 'info' }
    : { level: 'debug', transport: { target: 'pino-pretty' } },
});

// ─── Body parsers ─────────────────────────────────────────────────────────────
await server.register(formbody);
await server.register(multipart, {
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
});

// ─── Security plugins ─────────────────────────────────────────────────────────
await server.register(helmet);
await server.register(cors, {
  origin: (origin, cb) => {
    const allowed = (process.env['WEB_BASE_URL'] ?? 'http://localhost:3000').split(',').map(s => s.trim());
    if (!origin || allowed.includes(origin) || /\.vercel\.app$/.test(origin)) {
      cb(null, true);
    } else {
      cb(new Error('CORS: origin not allowed'), false);
    }
  },
  credentials: true,
});
await server.register(rateLimit, {
  max: 200,
  timeWindow: '1 minute',
  // Back rate-limit state with Redis when available so limits survive across instances.
  // Falls back to in-memory when REDIS_URL is not configured.
  ...(process.env['REDIS_URL'] ? { redis: getRedis() } : {}),
  keyGenerator(request) {
    // Webhook routes: isolate by tenantId so one noisy tenant can't starve others
    const params = request.params as Record<string, string> | undefined;
    if (params?.['tenantId']) return `rl:tenant:${params['tenantId']}`;
    // Authenticated dashboard routes: isolate by JWT tenant
    const req = request as typeof request & { tenantId?: string };
    if (req.tenantId) return `rl:tenant:${req.tenantId}`;
    // Fallback: IP-based bucket
    return `rl:ip:${request.ip}`;
  },
});

// ─── Global error handler ─────────────────────────────────────────────────────
server.setErrorHandler((error, _request, reply) => {
  captureException(error, { url: _request.url, method: _request.method });
  const statusCode = error.statusCode ?? 500;
  reply.status(statusCode).send({ error: statusCode >= 500 ? 'Internal server error' : error.message });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
await server.register(webhookRoutes,        { prefix: '/api/webhook' });
await server.register(conversationRoutes,   { prefix: '/api/conversations' });
await server.register(kbRoutes,             { prefix: '/api/kb' });
await server.register(kbDocumentRoutes,     { prefix: '/api/kb' });
await server.register(escalationRoutes,     { prefix: '/api/escalations' });
await server.register(orderRoutes,          { prefix: '/api/orders' });
await server.register(razorpayWebhookRoute, { prefix: '/api/payments' });
await server.register(phonePeWebhookRoute,  { prefix: '/api/payments' });
await server.register(settingsRoutes,       { prefix: '/api/settings' });

// ─── Health check ─────────────────────────────────────────────────────────────
server.get('/health', async () => {
  const checks: Record<string, string> = { api: 'ok' };

  await Promise.all([
    getServerClient().from('tenants').select('id').limit(1)
      .then(() => { checks['database'] = 'ok'; })
      .catch(() => { checks['database'] = 'error'; }),
    process.env['REDIS_URL']
      ? getRedis().ping()
          .then(() => { checks['redis'] = 'ok'; })
          .catch(() => { checks['redis'] = 'error'; })
      : Promise.resolve().then(() => { checks['redis'] = 'not_configured'; }),
  ]);

  const healthy = checks['database'] === 'ok';
  return { status: healthy ? 'ok' : 'degraded', ts: new Date().toISOString(), checks };
});

// ─── Start ────────────────────────────────────────────────────────────────────
const port = Number(process.env['API_PORT'] ?? 4000);
const host = '0.0.0.0';

try {
  await server.listen({ port, host });
  server.log.info(`Alphabot API listening on ${host}:${port}`);

  startScheduler();
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
