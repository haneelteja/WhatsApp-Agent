/**
 * Redis client — optional, lazy-initialized via connectRedis() at server startup.
 * All public functions degrade gracefully to no-ops when Redis is unavailable.
 *
 * Uses a duck-typed interface and dynamic import to avoid ESM/CJS interop issues
 * with ioredis under `module: NodeNext` TypeScript resolution.
 */

interface IRedis {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ex: 'EX', seconds: number): Promise<'OK' | null>;
  del(...keys: string[]): Promise<number>;
  incrby(key: string, increment: number): Promise<number>;
  ping(): Promise<string>;
  on(event: string, listener: (...args: unknown[]) => void): IRedis;
  scanStream(options: { match: string; count: number }): NodeJS.EventEmitter;
  pipeline(): {
    del(key: string): unknown;
    exec(): Promise<Array<[Error | null, unknown]> | null>;
  };
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

/** Scan-based pattern delete. No-op if Redis is not connected. */
export async function cacheDelPattern(pattern: string): Promise<void> {
  if (!_redis) return;

  return new Promise((resolve) => {
    const stream = _redis!.scanStream({ match: pattern, count: 100 });
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
