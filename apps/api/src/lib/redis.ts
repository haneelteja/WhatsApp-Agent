import { createClient } from 'redis';

type RedisClient = ReturnType<typeof createClient>;

let _redis: RedisClient | null = null;

export function getRedis(): RedisClient {
  if (_redis) return _redis;
  _redis = createClient({ url: process.env['REDIS_URL'] ?? 'redis://localhost:6379' });
  _redis.on('error', (err: Error) => console.error('[Redis] client error:', err.message));
  void _redis.connect();
  return _redis;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await getRedis().get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    await getRedis().set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch {
    // Cache failures are non-fatal — fall through to DB
  }
}

export async function cacheDel(key: string): Promise<void> {
  try {
    await getRedis().del(key);
  } catch {
    // Non-fatal
  }
}

/** Scan-based pattern delete — use instead of KEYS in production. */
export async function cacheDelPattern(pattern: string): Promise<void> {
  try {
    const redis = getRedis();
    for await (const key of redis.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      await redis.del(key);
    }
  } catch {
    // Non-fatal
  }
}
