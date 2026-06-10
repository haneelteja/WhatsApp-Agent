import { Redis } from 'ioredis';

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (_redis) return _redis;

  _redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  });

  _redis.on('error', (err: Error) => {
    // Log but don't crash — Redis is non-critical for the webhook path
    console.error('[Redis] connection error:', err.message);
  });

  return _redis;
}
