/**
 * Redis client — optional, lazy-initialized via connectRedis() at server startup.
 * All public functions degrade gracefully to no-ops when Redis is unavailable.
 *
 * Uses a duck-typed interface and dynamic import to avoid ESM/CJS interop issues
 * with ioredis under `module: NodeNext` TypeScript resolution.
 */

interface IRedisPipeline {
  del(key: string): unknown;
  incrby(key: string, increment: number): unknown;
  expireat(key: string, unixTimestamp: number): unknown;
  exec(): Promise<Array<[Error | null, unknown]> | null>;
}

interface IRedis {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ex: 'EX', seconds: number): Promise<'OK' | null>;
  set(key: string, value: string, ex: 'EX', seconds: number, nx: 'NX'): Promise<'OK' | null>;
  del(...keys: string[]): Promise<number>;
  incrby(key: string, increment: number): Promise<number>;
  expireat(key: string, unixTimestamp: number): Promise<number>;
  ping(): Promise<string>;
  on(event: string, listener: (...args: unknown[]) => void): IRedis;
  scanStream(options: { match: string; count: number }): NodeJS.EventEmitter;
  pipeline(): IRedisPipeline;
}

let _redis: IRedis | null = null;

/** Call once at server startup. No-op if REDIS_URL is not set. */
export async function connectRedis(): Promise<void> {
  const url = process.env['REDIS_URL'];
  if (!url) return;

  try {
    // Dynamic import sidesteps the `export =` / namespace conflict ioredis has
    // under NodeNext module resolution.
    const mod = await import('ioredis' as string) as Record<string, unknown>;
    const Ctor = (mod['default'] ?? mod['Redis'] ?? mod) as new (url: string, opts: Record<string, unknown>) => IRedis;
    const client = new Ctor(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
    client.on('error', (err: unknown) =>
      console.error('[Redis] error:', err instanceof Error ? err.message : String(err)),
    );
    _redis = client;
  } catch (err) {
    console.error('[Redis] Failed to connect — caching disabled:', err instanceof Error ? err.message : String(err));
  }
}

export function getRedis(): IRedis | null {
  return _redis;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await _redis?.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/**
 * Singleflight cache helper — coalesces concurrent misses so only one caller
 * fetches from the DB while others wait for the same in-flight promise.
 * Prevents cache stampedes when a high-traffic key expires simultaneously.
 */
const _inflight = new Map<string, Promise<unknown>>();

export async function cacheGetOrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number,
): Promise<T> {
  const cached = await cacheGet<T>(key);
  if (cached !== null) return cached;

  // Coalesce concurrent misses into the same fetch
  const existing = _inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const p = fetcher()
    .then(async (val) => {
      await cacheSet(key, val, ttlSeconds);
      _inflight.delete(key);
      return val;
    })
    .catch((err: unknown) => {
      _inflight.delete(key);
      throw err;
    });

  _inflight.set(key, p);
  return p;
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    await _redis?.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    // Non-fatal
  }
}

export async function cacheDel(key: string): Promise<void> {
  try {
    await _redis?.del(key);
  } catch {
    // Non-fatal
  }
}

/**
 * Acquire a distributed job lock via Redis SET NX EX.
 * Only the instance that wins the lock executes fn(); others return immediately.
 * Degrades gracefully to direct execution when Redis is unavailable (single-instance).
 */
export async function withJobLock(
  jobName:    string,
  ttlSeconds: number,
  fn:         () => Promise<void>,
): Promise<void> {
  const redis = getRedis();
  if (!redis) { await fn(); return; }

  const key      = `job_lock:${jobName}`;
  const acquired = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
  if (acquired !== 'OK') return;

  try {
    await fn();
  } finally {
    await redis.del(key);
  }
}

/** Scan-based pattern delete. No-op if Redis is not connected. */
export async function cacheDelPattern(pattern: string): Promise<void> {
  if (!_redis) return;

  return new Promise((resolve) => {
    const stream = _redis!.scanStream({ match: pattern, count: 1000 });
    const keys: string[] = [];

    (stream as NodeJS.EventEmitter).on('data', (batch: string[]) => {
      keys.push(...batch);
    });

    (stream as NodeJS.EventEmitter).on('end', () => {
      if (!keys.length || !_redis) { resolve(); return; }
      const pipeline = _redis.pipeline();
      keys.forEach((k) => pipeline.del(k));
      pipeline.exec().then(() => resolve()).catch(() => resolve());
    });

    (stream as NodeJS.EventEmitter).on('error', () => resolve());
  });
}
