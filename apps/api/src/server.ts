import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import formbody from '@fastify/formbody';

import { webhookRoutes } from './routes/webhook/index.js';
import { conversationRoutes } from './routes/conversations/index.js';

const isProd = process.env['NODE_ENV'] === 'production';
const server = Fastify({
  logger: isProd
    ? { level: 'info' }
    : { level: 'debug', transport: { target: 'pino-pretty' } },
});

// ─── Body parsers ─────────────────────────────────────────────────────────────
await server.register(formbody);

// ─── Security plugins ─────────────────────────────────────────────────────────
await server.register(helmet);
await server.register(cors, {
  origin: process.env['WEB_BASE_URL'] ?? 'http://localhost:3000',
  credentials: true,
});
await server.register(rateLimit, {
  max: 200,
  timeWindow: '1 minute',
});

// ─── Routes ───────────────────────────────────────────────────────────────────
await server.register(webhookRoutes, { prefix: '/api/webhook' });
await server.register(conversationRoutes, { prefix: '/api/conversations' });

// ─── Health check ─────────────────────────────────────────────────────────────
server.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));

// ─── Start ────────────────────────────────────────────────────────────────────
const port = Number(process.env['API_PORT'] ?? 4000);
const host = '0.0.0.0';

try {
  await server.listen({ port, host });
  server.log.info(`Alphabot API listening on ${host}:${port}`);
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
