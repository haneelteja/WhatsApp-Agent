import Redis from 'ioredis';

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (_redis) return _redis;
  _redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,       // fail fast if Redis is down — don't block requests
    enableOfflineQueue: false,     // reject commands when disconnected instead of queuing
    lazyConnect: false,
  });
  _redis.on('error', (err: Error) => console.error('[Redis] client error:', err.message));
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
    await getRedis().set(key, JSON.stringify(value), 'EX', ttlSeconds);
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

/** Scan-based pattern delete — avoids KEYS in production. */
export async function cacheDelPattern(pattern: string): Promise<void> {
  const redis = getRedis();
  return new Promise((resolve) => {
    const stream = redis.scanStream({ match: pattern, count: 100 });
    const pipeline = redis.pipeline();
    let hasKeys = false;

    stream.on('data', (keys: string[]) => {
      if (keys.length) {
        hasKeys = true;
        keys.forEach((k) => pipeline.del(k));
      }
    });

    stream.on('end', () => {
      if (hasKeys) {
        pipeline.exec().then(() => resolve()).catch(() => resolve());
      } else {
        resolve();
      }
    });

    stream.on('error', () => resolve()); // Non-fatal
  });
}
